# Easy Rent Bali – AI Assistant

Monorepo untuk technical assessment Option A: asisten penyewaan mobil berbasis
chat, Expo, backend TypeScript, OpenRouter, dua MCP server resmi, dan SQLite.

## Fitur yang tersedia

- Chat berbahasa Indonesia/Inggris melalui backend dan OpenRouter.
- Tombol “Dengarkan” untuk membuat dan memutar audio balasan dengan Qwen3 TTS
  1.7B secara on-demand.
- Pencarian/detail kendaraan dan pemeriksaan ketersediaan melalui MCP Server A.
- Pembuatan, pembacaan, pembaruan, dan pembatalan booking melalui MCP Server B.
- Konfirmasi booking melalui endpoint khusus yang memeriksa pending action di
  backend; permintaan booking tidak ditulis sebelum dikonfirmasi.
- Lookup booking, reset percakapan, health checks, serta penyimpanan conversation
  dan message ke SQLite.
- UI Expo untuk chat, kartu/detail kendaraan saat data diterima, lookup booking,
  dan pengaturan.

**Status penting:** inventaris lokal adalah development sample, bukan armada
operasional Easy Rent Bali. OpenRouter chat completion terakhir terkena HTTP
429; panggilan TTS live belum diuji dan dapat berbiaya. Qwen3 TTS tidak
menggantikan model chat/tool-calling, dan daftar bahasa resminya tidak
mencantumkan Bahasa Indonesia. Belum ada deployment publik atau APK. Form
booking, review, dan layar sukses terpisah seperti yang diminta PRD belum
tersedia pada alur UI produksi saat ini. Status dan bukti lengkap ada di
[docs/TESTING_REPORT.md](./docs/TESTING_REPORT.md) dan
[docs/DEPLOYMENT_REPORT.md](./docs/DEPLOYMENT_REPORT.md).

## Dokumentasi MCP (Model Context Protocol)

Sesuai instruksi penilaian Track A (*"README should include links/documentation of the MCPs"*), sistem ini mengimplementasikan spesifikasi resmi **Model Context Protocol (MCP)** dengan arsitektur two-way MCP flow:

### 1. MCP Server A: `inventory-server` (Read-Only)
- **Lokasi Codebase:** [`mcp-servers/inventory-server`](./mcp-servers/inventory-server)
- **Spesifikasi Protokol:** Menggunakan official SDK [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) dengan `StdioServerTransport`.
- **Fungsi Utama:**
  - Query katalog armada kendaraan sewa (`search_vehicles`) dengan filter tipe mobil, kapasitas kursi, transmisi, dan rentang harga harian.
  - Detail spesifikasi unit mobil (`get_vehicle_details`).
  - Verifikasi ketersediaan tanggal sewa (`check_vehicle_availability`) terhadap jadwal booking aktif.
- **Keamanan Data:** Berjalan secara strictly **Read-Only** (`query_only = ON` pada SQLite) sehingga asisten AI tidak dapat mengubah armada dari server ini.

### 2. MCP Server B: `booking-server` (State-Modifying / Persistence)
- **Lokasi Codebase:** [`mcp-servers/booking-server`](./mcp-servers/booking-server)
- **Spesifikasi Protokol:** Menggunakan official SDK [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) dengan `StdioServerTransport`.
- **Fungsi Utama:**
  - Menyimpan transaksi booking sewa mobil (`create_booking`) dengan status awal `PENDING`.
  - Melakukan locking transaksi dan validasi pencegahan jadwal tumpang tindih (*anti-double booking*).
  - Mengonfirmasi booking (`confirm_booking`) menjadi status aktif `CONFIRMED`.
  - Mengelola pembayaran sewa (`create_payment`, `mark_payment_paid`, `refund_payment`) dengan metode QRIS, OVO, Bank Transfer, dan Cash.
  - Memperbarui atau membatalkan reservasi (`update_booking`, `cancel_booking`).

> Dokumentasi teknis lengkap mencakup JSON schema input/output dan arsitektur two-way flow tersedia di [docs/MCP_INTEGRATION.md](./docs/MCP_INTEGRATION.md).

## Struktur repository

| Path                           | Tanggung jawab                                                         |
| ------------------------------ | ---------------------------------------------------------------------- |
| `apps/mobile`                  | React Native, Expo, TypeScript                                         |
| `backend`                      | REST API, OpenRouter service, orchestrator, MCP client manager, SQLite |
| `mcp-servers/inventory-server` | MCP A, read-only inventory dan availability                            |
| `mcp-servers/booking-server`   | MCP B, booking operations                                              |
| `shared/types`                 | Tipe TypeScript lintas workspace                                       |
| `docs`                         | Arsitektur, API, MCP, LLM, QA, deployment, dan demo                    |
| `ai_session_logs`              | Ringkasan prompt dan development log                                   |
| `screenshots`                  | Bukti UI aktual yang tersedia; bukan mockup                            |

## Teknologi

- Node.js 20+ dan npm 10+; validasi terdahulu dilakukan dengan Node 24/npm 11.
- React Native, Expo SDK 58, TypeScript.
- Express, Zod, OpenAI-compatible SDK dengan OpenRouter API.
- Official `@modelcontextprotocol/sdk`, stdio client/server transports.
- `expo-audio` dan `expo-file-system` untuk pemutaran suara lintas platform.
- SQLite dengan `better-sqlite3`.
- npm workspaces, ESLint, Prettier.

## Arsitektur

```text
Expo Mobile
    │ REST
    ▼
Node.js Backend ───────────────► SQLite
    │                              ▲
    ├── OpenRouter chat/tool loop   │
    │       │ MCP client manager   │
    │       ├── MCP A (read-only) ─┤
    │       └── MCP B (booking) ───┘
    └── Booking confirmation gate
```

Chat tool calls dirutekan melalui MCP sungguhan. Endpoint REST untuk mengambil
daftar kendaraan dan lookup booking juga menggunakan repository SQLite. Lihat
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) untuk rincian alur dan batasannya.

## Instalasi dan konfigurasi lokal

Jalankan dari root repository di PowerShell:

```powershell
npm install
Copy-Item backend\.env.example backend\.env
Copy-Item apps\mobile\.env.example apps\mobile\.env
```

Konfigurasikan `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, dan model suara
`OPENROUTER_TTS_MODEL` hanya secara lokal
di `backend/.env`; jangan salin key ke source code, Expo env, log, atau chat.
`apps/mobile/.env` berisi URL backend. Android Emulator menggunakan
`http://10.0.2.2:3000`; perangkat fisik menggunakan alamat IP LAN komputer yang
menjalankan backend.

Jangan pernah commit `.env` atau database lokal. Production tidak melakukan seed
kendaraan contoh secara default. Sebelum go-live, operator harus memuat dan
memverifikasi inventaris sebenarnya.

## Menjalankan

Terminal pertama:

```powershell
npm run backend:dev
```

Terminal kedua:

```powershell
npm run mobile:start
```

Untuk Expo Web:

```powershell
npm run mobile:web
```

Backend menjalankan migrasi SQLite dan development seed pada mode development.
Gunakan Expo Go atau emulator sesuai instruksi Metro. Pastikan perangkat dan
komputer dapat saling menjangkau melalui jaringan.

## Pengujian dan build

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run api:test
npm run mcp:test
npm run mcp-a:test
npm run mcp-b:test
npm run backend:build
```

`npm run llm:test` menjalankan pengujian live OpenRouter dan memerlukan key
lokal; provider terakhir mengembalikan HTTP 429. Jangan menyatakan konektivitas
chat live lulus hanya berdasarkan health check.

Lihat [docs/TESTING_REPORT.md](./docs/TESTING_REPORT.md) untuk hasil aktual,
batasan tes, dan bukti historis; [docs/DEMO.md](./docs/DEMO.md) untuk skenario
demonstrasi; serta [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) untuk prosedur
deployment. Deployment publik belum dilakukan.

## Dokumentasi

- [PRD_MASTER.md](./PRD_MASTER.md) — requirement sumber dan appendix status.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — diagram dan desain teknis.
- [docs/API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md) — REST contract.
- [docs/MCP_INTEGRATION.md](./docs/MCP_INTEGRATION.md) — tools, schema, dan alur MCP.
- [docs/LLM_SETUP.md](./docs/LLM_SETUP.md) — konfigurasi dan troubleshooting LLM.
- [docs/TESTING_REPORT.md](./docs/TESTING_REPORT.md) — status verifikasi submission.
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) dan
  [docs/DEPLOYMENT_REPORT.md](./docs/DEPLOYMENT_REPORT.md) — prosedur dan bukti deployment.
- [ai_session_logs/PROMPTS.md](./ai_session_logs/PROMPTS.md) dan
  [ai_session_logs/DEVELOPMENT_LOG.md](./ai_session_logs/DEVELOPMENT_LOG.md) —
  catatan prompt dan pekerjaan.
- [screenshots/README.md](./screenshots/README.md) — daftar screenshot aktual
  dan layar yang belum terdokumentasi.

## Status submission

Repository ini belum siap dinyatakan sebagai submission lengkap: provider
OpenRouter sedang rate-limited, UI booking terpisah yang diminta PRD belum ada,
perangkat Android dan deployment publik belum diverifikasi, screenshot lengkap
belum tersedia, serta Git worktree masih memiliki perubahan yang belum
di-commit. Detailnya tercatat di laporan testing dan deployment.
