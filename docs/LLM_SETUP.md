# OpenRouter LLM Setup

## Apa itu LLM?

Large Language Model (LLM) adalah model bahasa yang memahami permintaan alami,
memelihara konteks percakapan, dan menghasilkan respons atau panggilan tool.
Dalam aplikasi ini, LLM tidak boleh mengarang inventaris atau status booking.

## Apa itu OpenRouter?

OpenRouter menyediakan API yang kompatibel dengan pola OpenAI untuk mengakses
banyak model. API key dan pemilihan model dikonfigurasi hanya di backend.

## Konfigurasi API key

Salin contoh environment:

```powershell
Copy-Item backend\.env.example backend\.env
```

Isi secara lokal pada `backend/.env`:

```text
OPENROUTER_API_KEY=<your-key-created-by-the-developer>
OPENROUTER_MODEL=openrouter/free
OPENROUTER_TTS_MODEL=qwen/qwen3-tts-1.7b
OPENROUTER_SITE_URL=http://localhost
OPENROUTER_APP_NAME=Easy Rent Bali AI
```

Jangan menempatkan API key pada source code, Expo environment, README, atau prompt.
File `backend/.env` sudah diabaikan oleh Git.

## Pemilihan model

Model dipilih dari katalog OpenRouter saat ini. Untuk MVP, model kandidat harus
memiliki parameter `tools` dan mendukung `/chat/completions`.
Katalog dapat diperiksa di:

```text
https://openrouter.ai/api/v1/models
```

Pada pemeriksaan tanggal 23 November 2026, contoh model gratis yang tercatat
mendukung `tools` antara lain `openrouter/free`. Karena katalog, harga, dan
availability dapat berubah, gunakan environment variable dan verifikasi ulang
tool calling sebelum live deployment.

## Balasan suara: Qwen3 TTS 1.7B

Qwen3 TTS dipakai terpisah dari model chat. Model ID OpenRouter yang diverifikasi
pada 23 November 2026 adalah `qwen/qwen3-tts-1.7b`; model menerima teks dan
menghasilkan audio melalui `POST https://openrouter.ai/api/v1/audio/speech`.
Provider yang tercatat untuk model ini adalah Together. API key yang sama
digunakan server-side; model TTS dipilih melalui `OPENROUTER_TTS_MODEL`, bukan
`OPENROUTER_MODEL`. Mobile hanya mengakses backend `POST /api/speech`.

Balasan tidak otomatis disintesis: pengguna menekan tombol “Dengarkan”. Audio
MP3 di-cache sementara di perangkat untuk replay dalam sesi percakapan yang
sama. Input dibatasi 2000 karakter dan endpoint dibatasi 6 request per menit per
IP untuk mengendalikan biaya. OpenRouter mencatat tarif Together
**$20 per 1 juta karakter** pada saat pemeriksaan; harga/availability dapat
berubah, maka cek halaman [model dan pricing Qwen3 TTS](https://openrouter.ai/qwen/qwen3-tts-1.7b)
sebelum pemakaian.

Suara opsional: `vivian`, `serena`, `uncle_fu`, `dylan`, `eric`, `ryan`,
`aiden`, `ono_anna`, `sohee`. Aplikasi saat ini tidak memaksa voice ID dan
menggunakan default provider.

Qwen3 TTS mencantumkan dukungan bahasa seperti English, Chinese, Japanese,
Korean, German, French, Russian, Spanish, Italian, dan Portuguese; Bahasa
Indonesia tidak tercantum pada keterangan resmi yang diperiksa. Karena bahasa
utama aplikasi adalah Indonesia, hasil ucap Indonesia **belum diverifikasi**.
Integrasi tidak menerjemahkan teks dan tidak mengubah konten assistant.

Dokumentasi API: [Create Speech](https://openrouter.ai/docs/api/api-reference/tts/create-speech).
Respons endpoint berupa byte stream `audio/mpeg`, bukan JSON. Backend mengubah
error kredensial, kredit, rate limit, model, timeout, dan provider menjadi error
JSON yang aman. Tes lokal memakai mock; belum ada live generation yang
dijalankan karena request berbayar dan kuota provider chat terakhir sedang
rate-limited.

## Pengujian

Setelah `backend/.env` dikonfigurasi:

```powershell
npm run llm:test
```

Script menguji:

1. Ketersediaan environment.
2. Normal chat completion.
3. Temporary test tool calling.
4. Health endpoint service.

API key tidak dicetak oleh script.

## Status konektivitas terbaru

Pengujian sebelumnya berhasil mengirim chat berbahasa Indonesia dan menjalankan
temporary tool call. Pada pemeriksaan lanjutan yang tercatat di
`docs/QA_REPORT.md`, completion nyata ditolak OpenRouter dengan HTTP 429
(`OPENROUTER_RATE_LIMITED`). MCP tetap terhubung. Ini adalah pembatasan provider,
bukan bukti bahwa chat live tersedia saat ini.

`GET /api/health/llm` memeriksa konfigurasi dan keterjangkauan key/model, tetapi
tidak menguji kuota completion atau menjamin kapasitas saat pengguna mengirim
chat. Ketika 429 terjadi, tunggu batas provider pulih atau pilih model lain
setelah meninjau biaya serta memverifikasi dukungan tool calling. Tidak ada
retry otomatis atau model berbayar yang ditambahkan.

## Monitoring biaya

- Set spending limit pada dashboard OpenRouter.
- Gunakan model gratis atau ekonomis untuk pengujian.
- Batasi jumlah tool rounds.
- Batasi `max_tokens`.
- Pantau penggunaan dan kredit pada dashboard OpenRouter.

## Troubleshooting

| Gejala                                       | Makna / langkah aman                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENROUTER_RATE_LIMITED` / HTTP 429         | Provider membatasi completion. Tunggu atau evaluasi model lain; health check tidak menguji kuota.                                    |
| HTTP 402 / `OPENROUTER_CREDITS_INSUFFICIENT` | Periksa saldo dan batas biaya di dashboard OpenRouter; jangan mengirim key atau data pembayaran ke log.                              |
| HTTP 401/403 / configuration error           | Periksa key lokal dan hak akses provider tanpa menyalin nilainya ke chat.                                                            |
| Model unavailable                            | Verifikasi ID pada katalog OpenRouter, lalu pastikan tool calling didukung.                                                          |
| Health LLM 503                               | Periksa konfigurasi, jaringan backend, dan status provider; response tidak berarti request chat pasti gagal dengan alasan yang sama. |

Jangan melaporkan konektivitas LLM sebagai lulus hanya dari health endpoint.
Catat status completion live dan waktu pengujiannya secara terpisah.
