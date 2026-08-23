# Panduan Setup: Artikel Teknologi Otomatis Harian — Ulastech

## Struktur file
```
├── index.html                          <- web utama (sudah disesuaikan, baca data dari JSON)
├── logo.png                            <- taruh file logo kamu di sini, nama harus "logo.png"
├── data/
│   └── articles.json                   <- database artikel (diupdate otomatis tiap hari)
├── scripts/
│   └── generate-daily-article.mjs      <- script yang memanggil Claude API
├── package.json
└── .github/workflows/
    └── daily-article.yml               <- jadwal otomatis (GitHub Actions)
```

## Langkah setup

1. **Upload semua file ini ke repo GitHub kamu** (root folder, sejajar dengan index.html yang sudah ada).
   Timpa index.html lama dengan yang baru dari sini.

2. **Taruh file logo.png kamu** di root folder yang sama.

3. **Buat API key Claude** di https://console.anthropic.com (menu API Keys), lalu isi saldo billing secukupnya.

4. **Simpan API key sebagai GitHub Secret:**
   - Buka repo di GitHub → Settings → Secrets and variables → Actions
   - Klik "New repository secret"
   - Name: `ANTHROPIC_API_KEY`
   - Value: (paste API key kamu, formatnya `sk-ant-...`)

5. **Push ke GitHub.** Cloudflare Pages akan otomatis build & deploy seperti biasa.

6. **Selesai.** Setiap hari jam 07:00 WIB, GitHub Actions otomatis:
   - Memanggil Claude API untuk menulis 1 artikel teknologi baru
   - Menambahkannya ke `data/articles.json`
   - Commit & push perubahan ke repo
   - Cloudflare Pages otomatis re-deploy dengan artikel baru

## Cara tes manual (tanpa nunggu jadwal)
Di GitHub repo kamu: tab **Actions** → pilih workflow "Generate Daily Tech Article" →
klik **Run workflow** → pilih branch `main` → Run. Cek hasilnya di `data/articles.json`
setelah selesai (biasanya 10-30 detik).

## Catatan penting
- Artikel yang dibuat AI fokus pada **insight/tips/tren umum**, bukan klaim harga atau
  spesifikasi produk tertentu — supaya tidak ada info yang keliru soal produk asli.
- Untuk review produk spesifik dengan data harga/spek akurat, tetap input manual lewat
  Admin Dashboard yang sudah ada di web kamu (fitur ini tidak berubah).
- **Penting:** kalau kamu login sebagai admin dan menambah/edit artikel manual di
  browser tertentu, perubahan itu tersimpan di localStorage browser tersebut saja dan
  akan menimpa tampilan artikel JSON otomatis di browser itu. Ini keterbatasan bawaan
  desain web saat ini (data admin belum tersambung ke database sungguhan). Kalau nanti
  kamu mau admin dashboard-nya juga tersimpan permanen dan sinkron ke semua pengunjung,
  itu perlu langkah lanjutan (database asli, misal Cloudflare D1/KV) — bisa saya bantu
  kalau dibutuhkan.
- Biaya API per artikel per hari sangat kecil (hitungan rupiah ratusan), tapi tetap
  pantau penggunaan di console.anthropic.com.
