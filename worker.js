// worker.js
// Worker ini menjalankan 2 peran sekaligus:
// 1. Menyajikan semua file statis website (index.html, logo.png, dst) seperti biasa lewat ASSETS binding.
// 2. Menangani endpoint POST /api/contact: menerima pesan dari form kontak dan mengirimkannya
//    sebagai email lewat Resend ke alamat admin.
//
// Env var yang dibutuhkan (diatur di Cloudflare Dashboard > Workers & Pages > ulastech-web
// > Settings > Variables and Secrets):
//   RESEND_API_KEY  -> API key dari resend.com (tipe: Secret)

const ADMIN_EMAIL = "admin@ulastech.com";
// Alamat pengirim ini HARUS berasal dari domain yang sudah diverifikasi di Resend.
// Ganti "ulastech.com" kalau domain yang diverifikasi berbeda.
const FROM_EMAIL = "Ulastech Kontak <kontak@ulastech.com>";

// Warna badge kategori (dipakai di halaman artikel & disamakan dengan index.html)
const CATEGORY_COLORS = {
  "Apple & iOS": { bg: "rgba(96,165,250,0.10)", border: "rgba(96,165,250,0.30)", text: "#93c5fd" },
  "Android & OS": { bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.30)", text: "#6ee7b7" },
  "Laptop & PC": { bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.30)", text: "#c4b5fd" },
  "Keamanan Perangkat": { bg: "rgba(251,113,133,0.10)", border: "rgba(251,113,133,0.30)", text: "#fda4af" },
  "AI Terbaru": { bg: "rgba(34,211,238,0.10)", border: "rgba(34,211,238,0.30)", text: "#67e8f9" }
};
const DEFAULT_CATEGORY_COLOR = { bg: "rgba(96,165,250,0.10)", border: "rgba(96,165,250,0.30)", text: "#93c5fd" };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method === "POST") {
        return handleContact(request, env);
      }
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Halaman artikel dengan URL sendiri, misalnya /ulasan/samsung-galaxy-s26-ultra
    // Ini membuat tiap artikel bisa diindeks Google & dibagikan ke sosial media
    // secara terpisah (sebelumnya semua artikel cuma modal popup di satu halaman).
    const articleMatch = url.pathname.match(/^\/ulasan\/([a-z0-9-]+)\/?$/i);
    if (articleMatch && request.method === "GET") {
      return handleArticlePage(articleMatch[1], request, env);
    }

    // Semua request lain dilayani sebagai file statis (behavior lama, tidak berubah)
    return env.ASSETS.fetch(request);
  }
};

async function getArticles(request, env) {
  const dataUrl = new URL("/data/articles.json", request.url);
  const res = await env.ASSETS.fetch(new Request(dataUrl, request));
  if (!res.ok) return [];
  return res.json();
}

async function handleArticlePage(slug, request, env) {
  let articles;
  try {
    articles = await getArticles(request, env);
  } catch (err) {
    console.error("Gagal membaca data/articles.json:", err);
    articles = [];
  }

  const article = articles.find(a => a.slug === slug);

  // Slug tidak ditemukan (misal artikel sudah dihapus atau link salah ketik):
  // jatuhkan ke halaman utama (SPA) daripada menampilkan error mentah.
  if (!article) {
    return env.ASSETS.fetch(request);
  }

  const related = articles
    .filter(a => a.slug !== slug && a.category === article.category)
    .slice(0, 3);
  const relatedFinal = related.length > 0
    ? related
    : articles.filter(a => a.slug !== slug).slice(0, 3);

  const html = renderArticlePage(article, relatedFinal, request);
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

function renderArticlePage(article, related, request) {
  const siteUrl = new URL(request.url);
  const canonicalUrl = `${siteUrl.origin}/ulasan/${article.slug}`;
  const color = CATEGORY_COLORS[article.category] || DEFAULT_CATEGORY_COLOR;
  const paragraphs = (article.content || "")
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 20px;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  const relatedHtml = related.map(r => {
    const rColor = CATEGORY_COLORS[r.category] || DEFAULT_CATEGORY_COLOR;
    return `
      <a href="/ulasan/${escapeHtml(r.slug)}" style="text-decoration:none; background:#0f172a; border:1px solid #1e293b; border-radius:16px; overflow:hidden; display:block;">
        <img src="${escapeHtml(r.imageUrl)}" alt="${escapeHtml(r.title)}" style="width:100%; height:110px; object-fit:cover; display:block;">
        <div style="padding:14px;">
          <div style="font-size:11px; font-weight:700; color:${rColor.text}; margin-bottom:6px;">${escapeHtml(r.category)}</div>
          <div style="font-size:13px; font-weight:700; color:#ffffff; line-height:1.4;">${escapeHtml(r.title)}</div>
        </div>
      </a>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="id" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(article.title)} — Ulastech</title>
  <meta name="description" content="${escapeHtml(article.summary)}">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" type="image/png" href="/logo.png">

  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(article.title)}">
  <meta property="og:description" content="${escapeHtml(article.summary)}">
  <meta property="og:image" content="${escapeHtml(article.imageUrl)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(article.title)}">
  <meta name="twitter:description" content="${escapeHtml(article.summary)}">
  <meta name="twitter:image" content="${escapeHtml(article.imageUrl)}">

  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>body{font-family:'Plus Jakarta Sans',sans-serif;}</style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen antialiased">
  <header class="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <a href="/" class="flex items-center space-x-2 text-xl font-extrabold tracking-tight text-white">
          <span class="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center shadow-lg shadow-blue-500/30">
            <img src="/logo.png" alt="Logo Ulastech" class="w-full h-full object-cover">
          </span>
          <span class="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">Ulastech</span>
        </a>
        <nav class="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-300">
          <a href="/" class="hover:text-blue-400 transition-colors">Beranda</a>
          <a href="/#ulasan" class="hover:text-blue-400 transition-colors">Kategori</a>
          <a href="/#ulasan" class="hover:text-blue-400 transition-colors">Ulasan Gadget</a>
          <a href="/#tentang" class="hover:text-blue-400 transition-colors">Tentang Saya</a>
          <a href="/#kontak" class="hover:text-blue-400 transition-colors">Kontak</a>
        </nav>
        <a href="/" class="text-xs font-semibold px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition">← Kembali ke Beranda</a>
      </div>
    </div>
  </header>

  <div onclick="if(event.target===this){window.location.href='/'}" class="min-h-[calc(100vh-65px)] py-6 sm:py-10 px-4 sm:px-6 lg:px-8 flex justify-center">
  <main class="max-w-4xl w-full h-fit bg-slate-950 border border-slate-800 rounded-2xl px-4 sm:px-8 py-8 sm:py-10">
    <div class="flex items-center space-x-2 text-xs text-slate-500 mb-6">
      <a href="/" class="hover:text-slate-300">Beranda</a><span>/</span>
      <span>${escapeHtml(article.category)}</span><span>/</span>
      <span class="text-slate-300">${escapeHtml(article.title)}</span>
    </div>

    <div class="inline-block px-3 py-1 text-xs font-semibold rounded-full mb-4" style="background:${color.bg}; border:1px solid ${color.border}; color:${color.text};">
      ${escapeHtml(article.category)}
    </div>

    <h1 class="text-3xl sm:text-4xl font-extrabold text-white leading-tight">${escapeHtml(article.title)}</h1>

    <div class="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-5 pb-5 border-b border-slate-800">
      <span>Oleh <strong class="text-slate-200">${escapeHtml(article.author)}</strong></span>
      <span>•</span><span>${escapeHtml(article.date)}</span>
      <span>•</span><span class="text-amber-400 font-bold">★ ${escapeHtml(String(article.rating))} / 5.0</span>
    </div>

    <img src="${escapeHtml(article.imageUrl)}" alt="${escapeHtml(article.title)}" class="w-full h-64 sm:h-96 object-cover rounded-2xl border border-slate-800 my-8">

    <div class="text-base leading-relaxed text-slate-300">
      ${paragraphs}
    </div>

    <div class="mt-14">
      <h2 class="text-xl font-bold text-white mb-5">Artikel Terkait</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-5">
        ${relatedHtml}
      </div>
    </div>
  </main>
  </div>

  <footer class="border-t border-slate-800 py-8 text-center text-xs text-slate-500">
    <span class="text-slate-300 font-bold">Ulastech</span> &copy; ${(String(article.date).match(/\d{4}/) || [""])[0]} Hak Cipta Dilindungi.
  </footer>
</body>
</html>`;
}

async function handleContact(request, env) {
  const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

  let data;
  try {
    data = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: "Data tidak valid." }), { status: 400, headers: jsonHeaders });
  }

  const name = (data.name || "").toString().trim();
  const email = (data.email || "").toString().trim();
  const subject = (data.subject || "").toString().trim();
  const message = (data.message || "").toString().trim();
  const honeypot = (data.website || "").toString().trim(); // field jebakan bot, harus selalu kosong

  // Kalau honeypot terisi, kemungkinan besar bot: pura-pura sukses tanpa kirim email sungguhan.
  if (honeypot) {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
  }

  if (!name || !email || !subject || !message) {
    return new Response(JSON.stringify({ ok: false, error: "Semua kolom wajib diisi." }), { status: 400, headers: jsonHeaders });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return new Response(JSON.stringify({ ok: false, error: "Format email tidak valid." }), { status: 400, headers: jsonHeaders });
  }

  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY belum diatur di environment Worker.");
    return new Response(JSON.stringify({ ok: false, error: "Layanan email belum dikonfigurasi." }), { status: 500, headers: jsonHeaders });
  }

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [ADMIN_EMAIL],
        reply_to: email,
        subject: `[Pesan Kontak Ulastech] ${subject}`,
        html: renderEmailHtml({ name, email, subject, message })
      })
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend API error:", resendRes.status, errText);
      return new Response(JSON.stringify({ ok: false, error: "Gagal mengirim email. Coba lagi nanti." }), { status: 502, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
  } catch (err) {
    console.error("Contact handler error:", err);
    return new Response(JSON.stringify({ ok: false, error: "Terjadi kesalahan pada server." }), { status: 500, headers: jsonHeaders });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmailHtml({ name, email, subject, message }) {
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="color:#1e293b;">Pesan Baru dari Form Kontak Ulastech</h2>
      <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding:6px 0; color:#64748b; width:100px;">Nama</td>
          <td style="padding:6px 0; color:#0f172a; font-weight:600;">${escapeHtml(name)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:#64748b;">Email</td>
          <td style="padding:6px 0; color:#0f172a; font-weight:600;">${escapeHtml(email)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:#64748b;">Subjek</td>
          <td style="padding:6px 0; color:#0f172a; font-weight:600;">${escapeHtml(subject)}</td>
        </tr>
      </table>
      <div style="background:#f1f5f9; border-radius:8px; padding:16px; color:#334155; line-height:1.6; white-space:pre-wrap;">${escapeHtml(message)}</div>
      <p style="color:#94a3b8; font-size:12px; margin-top:24px;">Balas email ini langsung untuk merespons ${escapeHtml(name)} di ${escapeHtml(email)}.</p>
    </div>
  `;
}
