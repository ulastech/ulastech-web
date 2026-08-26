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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method === "POST") {
        return handleContact(request, env);
      }
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Semua request lain dilayani sebagai file statis (behavior lama, tidak berubah)
    return env.ASSETS.fetch(request);
  }
};

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
