// scripts/generate-daily-article.mjs
// Menghasilkan 1 artikel teknologi baru tiap hari lewat Claude API,
// lalu menambahkannya ke data/articles.json

import fs from "fs/promises";
import path from "path";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const DATA_PATH = path.join(process.cwd(), "data", "articles.json");
const MODEL = "claude-sonnet-4-6";

// Rotasi kategori & topik supaya variatif tiap hari.
// imageQuery: kata kunci Bahasa Inggris untuk pencarian gambar tematik di Pexels
const CATEGORIES = [
  { name: "Apple & iOS", topics: [
      { text: "produk atau update terbaru dari Apple (iPhone, iPad, Mac, atau iOS/macOS) yang baru dirilis atau diumumkan", imageQuery: "apple iphone product" },
      { text: "fitur baru di ekosistem Apple yang paling berguna untuk penggunaan sehari-hari", imageQuery: "apple macbook desk" }
  ]},
  { name: "Android & OS", topics: [
      { text: "update Android terbaru atau perangkat Android flagship yang baru rilis", imageQuery: "android phone new" },
      { text: "perbandingan fitur baru antar versi sistem operasi mobile terkini", imageQuery: "smartphone operating system" }
  ]},
  { name: "Laptop & PC", topics: [
      { text: "laptop baru yang baru diluncurkan dan cocok untuk kerja, kuliah, atau gaming", imageQuery: "new laptop launch" },
      { text: "tren prosesor dan chip terbaru untuk laptop/PC", imageQuery: "laptop processor chip" }
  ]},
  { name: "Keamanan Perangkat", topics: [
      { text: "tips keamanan siber terbaru untuk melindungi PC dan laptop dari malware/ransomware", imageQuery: "cyber security laptop" },
      { text: "cara melindungi smartphone dari penipuan digital, phishing, dan malware", imageQuery: "smartphone security lock" },
      { text: "praktik keamanan data pribadi saat pakai gadget (password, autentikasi 2 langkah, dll)", imageQuery: "digital privacy security" }
  ]},
  { name: "AI Terbaru", topics: [
      { text: "perkembangan model atau tools AI terbaru dan dampaknya untuk pengguna umum", imageQuery: "artificial intelligence technology" },
      { text: "fitur AI baru yang mulai terintegrasi di smartphone dan laptop", imageQuery: "AI smartphone laptop" }
  ]}
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function fetchThumbnailImage(query) {
  const fallback = "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80";

  if (!process.env.PEXELS_API_KEY) return fallback;

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } }
    );
    if (!res.ok) return fallback;

    const data = await res.json();
    const photo = data.photos && data.photos[0];
    return photo ? photo.src.large : fallback;
  } catch (err) {
    console.error("Gagal ambil gambar dari Pexels:", err);
    return fallback;
  }
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
Gunakan tool pencarian web untuk riset dulu sebelum menulis, supaya info terbaru (produk, harga, spesifikasi, tanggal rilis, nama fitur) akurat dan tidak mengarang.
Tulis artikel ORISINAL bergaya jurnalistik teknologi yang informatif dan netral, dalam kata-katamu sendiri (jangan copy-paste kalimat dari sumber).
Setelah selesai riset, WAJIB akhiri responsmu dengan SATU blok JSON valid (tanpa markdown, tanpa backtick) sebagai output akhir, dengan struktur persis:
{
  "title": "judul menarik, maks 90 karakter",
  "summary": "ringkasan 1-2 kalimat untuk kartu artikel",
  "content": "isi artikel lengkap 3-5 paragraf, gunakan \\n\\n antar paragraf, boleh pakai poin - jika relevan",
  "rating": angka desimal 4.5 sampai 5.0,
  "imageQuery": "2-4 kata kunci Bahasa Inggris yang SPESIFIK menggambarkan produk/topik utama artikel ini untuk pencarian foto (contoh: 'Samsung Galaxy smartphone', 'MacBook Pro laptop', 'cyber security padlock'). Sebutkan nama brand/produk jika artikel membahas produk tertentu."
}
Jangan tulis apapun setelah blok JSON itu.`;

  const userPrompt = `Tulis artikel kategori "${cat.name}" dengan topik: ${topic.text}. Cari info terbaru dulu lewat web search sebelum menulis.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 6000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 3 }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();

  // Gabungkan semua blok teks (bisa ada beberapa, diselingi hasil web search)
  const allText = data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n");

  if (!allText) throw new Error("Tidak ada respons teks dari model.");

  // Ambil blok JSON terakhir di dalam teks (output final sesuai instruksi system prompt)
  const jsonMatch = allText.match(/\{[\s\S]*\}(?!.*\{[\s\S]*\})/);
  if (!jsonMatch) {
    console.error("stop_reason dari API:", data.stop_reason);
    console.error("Teks lengkap yang diterima dari model:\n", allText);
    throw new Error("Tidak menemukan blok JSON di respons model. Kemungkinan kehabisan token (lihat log di atas untuk detail).");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Cari gambar SESUDAH tahu isi artikel, pakai kata kunci spesifik dari AI
  // (fallback ke kata kunci kategori kalau AI tidak kasih imageQuery)
  const imageUrl = await fetchThumbnailImage(parsed.imageQuery || topic.imageQuery);

  return {
    id: "art-" + Date.now(),
    title: parsed.title,
    category: cat.name,
    rating: parsed.rating || 4.8,
    author: "Tim Ulastech (AI)",
    date: todayID(),
    imageUrl,
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
