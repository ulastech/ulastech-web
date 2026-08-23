// scripts/generate-daily-article.mjs
// Menghasilkan 1 artikel teknologi baru tiap hari lewat Claude API,
// lalu menambahkannya ke data/articles.json

import fs from "fs/promises";
import path from "path";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const DATA_PATH = path.join(process.cwd(), "data", "articles.json");
const MODEL = "claude-sonnet-4-6";

// Rotasi kategori & topik supaya variatif tiap hari, bukan produk spesifik
// (menghindari klaim harga/spek produk yang tidak terverifikasi)
const CATEGORIES = [
  { name: "Tech Insights", topics: [
      "tren kecerdasan buatan (AI) terbaru dan dampaknya ke gadget sehari-hari",
      "perkembangan chip dan prosesor untuk perangkat mobile",
      "tren keamanan siber untuk pengguna gadget rumahan",
      "evolusi konektivitas (5G, WiFi 7, dst) dan dampaknya ke pengguna"
  ]},
  { name: "Smartphone", topics: [
      "tips memilih smartphone sesuai kebutuhan (gaming, fotografi, produktivitas)",
      "tren desain dan fitur kamera smartphone masa kini",
      "cara merawat baterai smartphone agar awet"
  ]},
  { name: "Laptop & PC", topics: [
      "tips memilih laptop untuk kerja, kuliah, atau gaming",
      "tren laptop tipis dan hemat daya (ARM vs x86)"
  ]},
  { name: "Aksesoris & Daya", topics: [
      "panduan memilih powerbank dan charger yang aman",
      "tren aksesoris smart home dan gadget pendukung produktivitas"
  ]},
  { name: "Audio", topics: [
      "panduan memilih earphone/headphone sesuai kebutuhan",
      "tren teknologi audio spatial dan noise cancelling"
  ]}
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function todayID() {
  return new Date().toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric"
  });
}

async function generateArticle() {
  const cat = pickRandom(CATEGORIES);
  const topic = pickRandom(cat.topics);

  const systemPrompt = `Kamu adalah penulis konten untuk situs Ulastech, portal ulasan & insight teknologi berbahasa Indonesia.
Tulis artikel ORISINAL bergaya jurnalistik teknologi yang informatif, netral, dan tidak mengarang klaim spesifik (harga, nomor model, atau spesifikasi produk tertentu) yang tidak bisa diverifikasi.
Fokus pada insight umum, tips, tren, dan edukasi teknologi.
Balas HANYA dalam format JSON valid, tanpa markdown, tanpa teks tambahan, dengan struktur persis:
{
  "title": "judul menarik, maks 90 karakter",
  "summary": "ringkasan 1-2 kalimat untuk kartu artikel",
  "content": "isi artikel lengkap 3-5 paragraf, gunakan \\n\\n antar paragraf, boleh pakai poin - jika relevan",
  "rating": angka desimal 4.5 sampai 5.0
}`;

  const userPrompt = `Tulis artikel kategori "${cat.name}" dengan topik: ${topic}.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const textBlock = data.content.find(b => b.type === "text");
  if (!textBlock) throw new Error("Tidak ada respons teks dari model.");

  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    id: "art-" + Date.now(),
    title: parsed.title,
    category: cat.name,
    rating: parsed.rating || 4.8,
    author: "Tim Ulastech (AI)",
    date: todayID(),
    imageUrl: `https://source.unsplash.com/800x600/?technology,${encodeURIComponent(cat.name)}`,
    summary: parsed.summary,
    content: parsed.content
  };
}

async function main() {
  if (!API_KEY) {
    console.error("ANTHROPIC_API_KEY tidak ditemukan di environment.");
    process.exit(1);
  }

  const raw = await fs.readFile(DATA_PATH, "utf-8");
  const articles = JSON.parse(raw);

  const newArticle = await generateArticle();
  articles.unshift(newArticle);

  // Batasi maksimal 60 artikel supaya file tidak membengkak
  const trimmed = articles.slice(0, 60);

  await fs.writeFile(DATA_PATH, JSON.stringify(trimmed, null, 2), "utf-8");
  console.log(`Artikel baru ditambahkan: "${newArticle.title}"`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
