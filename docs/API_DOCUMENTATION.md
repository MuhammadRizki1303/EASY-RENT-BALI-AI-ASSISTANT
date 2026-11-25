# Backend REST API

## Base URL dan format

Development base URL: `http://localhost:3000`. Endpoint JSON memakai
`Content-Type: application/json`. Request body dibatasi 1 MB, divalidasi dengan
Zod, dan API memiliki rate limit serta request timeout.

## `POST /api/chat`

Request:

```json
{
  "conversationId": "example-id",
  "message": "Apakah ada Toyota Avanza?"
}
```

`conversationId` opsional; backend membuat ID baru jika tidak disediakan.
`message` harus 1–4000 karakter setelah trim.

Response sukses (field `vehicles` dapat kosong):

```json
{
  "conversationId": "example-id",
  "message": "Respons assistant",
  "operationStatus": "success",
  "pendingConfirmation": null,
  "toolActivity": ["search_vehicles"],
  "vehicles": []
}
```

Chat history user/assistant dipersistenkan di SQLite. MCP tool calls dieksekusi
melalui manager, bukan dari mobile.

### Aksi booking tertunda

Jika LLM mengusulkan booking write, database belum berubah. Response sukses
berisi `pendingConfirmation` dengan `requiresExplicitConfirmation: true`,
ringkasan action, dan waktu kedaluwarsa. Kirim keputusan melalui endpoint khusus
di bawah; pesan chat biasa saat action pending mendapatkan HTTP 409
`EXPLICIT_CONFIRMATION_REQUIRED`.

## `POST /api/chat/confirm`

Request:

```json
{
  "conversationId": "example-id",
  "decision": "confirm"
}
```

`decision` hanya `confirm` atau `cancel`. Backend memakai pending action yang
disimpan server-side; client tidak dapat mengirim argumen tool atau mengganti
operasi. Bila dibatalkan, tidak ada perubahan booking. Bila dikonfirmasi,
backend menjalankan pending tool melalui MCP B dan mengembalikan
`operationStatus`, `toolActivity`, booking aktual, serta `toolResult`.

Tanpa pending action, response adalah HTTP 409 `NO_PENDING_ACTION`. Action
berakhir setelah 10 menit.

## `POST /api/chat/reset`

Body: `{ "conversationId": "example-id" }` (opsional). Menghapus pending action
dan messages untuk conversation tersebut; bila ID tidak diberikan, backend
membuat ID baru. Response berisi `conversationId`, `operationStatus: "reset"`,
dan message.

## `POST /api/speech`

Membuat audio MP3 dari teks balasan atas permintaan pengguna. API key tidak
pernah dikirim ke mobile. Endpoint memakai rate limit khusus 6 request/menit per
client IP dan menerima maksimal 2000 karakter:

```json
{
  "text": "Halo! Selamat datang di Easy Rent Bali.",
  "voice": "vivian"
}
```

`voice` opsional; nilai yang diterima `vivian`, `serena`, `uncle_fu`, `dylan`,
`eric`, `ryan`, `aiden`, `ono_anna`, atau `sohee`. Jika tidak diberikan,
provider memilih suara default.

Response sukses adalah byte stream `audio/mpeg`, bukan JSON. Backend meminta
model `OPENROUTER_TTS_MODEL` (default `qwen/qwen3-tts-1.7b`) melalui OpenRouter
Audio Speech API. Klien aplikasi meminta sintesis hanya saat pengguna menekan
“Dengarkan”; replay audio yang sudah dibuat memakai cache sementara perangkat.
Audio tidak disimpan di database.

Kesalahan JSON aman menggunakan kode seperti `OPENROUTER_RATE_LIMITED`,
`OPENROUTER_CREDITS_INSUFFICIENT`, `OPENROUTER_CONFIGURATION_ERROR`,
`OPENROUTER_MODEL_UNAVAILABLE`, `OPENROUTER_TTS_TIMEOUT`, dan
`OPENROUTER_TTS_FAILED`. Bahasa Indonesia tidak tercantum dalam daftar dukungan
resmi model yang diperiksa; kualitas audio untuk bahasa ini belum diverifikasi.
Harga provider dapat berubah dan setiap generasi berpotensi berbiaya.

## `GET /api/vehicles`

Mengambil kendaraan dari SQLite dan merespons:

```json
{
  "dataSource": "development-sample-data",
  "vehicles": [],
  "operationStatus": "success"
}
```

Pada development terdapat delapan development sample vehicles. Pada production
tanpa `SEED_DEVELOPMENT_DATA=true`, seed otomatis nonaktif dan `dataSource`
bernilai `database`; ketiadaan seed bukan bukti inventaris operasional sudah
diimpor atau diverifikasi.

## `GET /api/bookings/:reference`

Mengambil record booking aktual dari SQLite:

```json
{
  "booking": {},
  "operationStatus": "success"
}
```

Jika tidak ditemukan, HTTP 404 dengan `BOOKING_NOT_FOUND`. Endpoint hanya
membaca; booking writes tetap menjadi tanggung jawab MCP B.

## Health endpoints

- `GET /api/health`: status backend dan database initialized.
- `GET /api/health/llm`: OpenRouter configuration/key/model reachability. HTTP
  200 berarti health check reachable, bukan kuota completion terjamin.
- `GET /api/health/mcp`: konektivitas inventory/booking dan jumlah tools.

## Error contract

Error JSON menggunakan safe fields seperti `error`, `code`,
`operationStatus`; stack trace dan credential tidak dikirim ke klien.
Kode chat/provider yang diketahui:

| HTTP / kode                             | Keterangan                                      |
| --------------------------------------- | ----------------------------------------------- |
| 400 / validation error                  | Request body tidak valid                        |
| 409 / `EXPLICIT_CONFIRMATION_REQUIRED`  | Ada action pending; gunakan dialog dedicated    |
| 409 / `NO_PENDING_ACTION`               | Tidak ada action yang dapat dikonfirmasi        |
| 404 / `BOOKING_NOT_FOUND`               | Booking tidak ditemukan                         |
| 429 / `RATE_LIMITED`                    | Batas request backend terlampaui                |
| 429 / `OPENROUTER_RATE_LIMITED`         | OpenRouter menolak completion karena rate limit |
| 503 / `OPENROUTER_CREDITS_INSUFFICIENT` | Provider melaporkan kredit tidak cukup          |
| 503 / `OPENROUTER_CONFIGURATION_ERROR`  | Konfigurasi/credential provider gagal           |
| 503 / `OPENROUTER_MODEL_UNAVAILABLE`    | Model tidak tersedia                            |
| 503 / `AI_OR_MCP_TIMEOUT`               | LLM atau MCP melampaui timeout                  |
| 503 / `LLM_OR_MCP_UNAVAILABLE`          | Provider/MCP tidak tersedia                     |
| 503 / `MCP_UNAVAILABLE`                 | Operasi MCP booking tidak tersedia              |
| 429 / `TTS_RATE_LIMITED`                | Limit khusus endpoint audio tercapai            |
| 504 / `OPENROUTER_TTS_TIMEOUT`          | Provider audio melebihi timeout                 |
| 502 / `OPENROUTER_TTS_FAILED`           | Provider tidak menghasilkan audio yang valid    |

Status OpenRouter 429 yang terakhir diamati dirinci dalam
[docs/TESTING_REPORT.md](./TESTING_REPORT.md).

## Keamanan dan privasi

- Key OpenRouter hanya disimpan server-side di `backend/.env`.
- Input divalidasi, SQL parameterized, JSON body dibatasi, dan rate limit aktif.
- CORS dikonfigurasi melalui `CORS_ORIGIN`.
- Frontend tidak menjadi sumber otoritatif untuk konfirmasi booking.
- Percakapan disimpan di SQLite; atur backup, retention, dan akses database
  sebelum memakai data pelanggan nyata.
- Speech API tidak memiliki autentikasi pengguna tersendiri. Rate limit per IP
  membantu membatasi penyalahgunaan, tetapi bukan pengganti autentikasi atau
  spend limit provider; lindungi endpoint sebelum membuka backend ke publik.
