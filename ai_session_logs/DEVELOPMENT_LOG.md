# Easy Rent Bali - Development Log

## Phase 1 - Project Structure and Initialization

**Tanggal:** 23 November 2026

### Hasil Aktual

- Workspace monorepo berhasil dibuat.
- Expo SDK 58 dengan React Native 0.88.1 dan React 19.3.0 berhasil diinisialisasi.
- Backend TypeScript/Node.js berhasil dikonfigurasi.
- Direktori MCP Server A dan MCP Server B berhasil disiapkan.
- Shared TypeScript types berhasil ditambahkan.
- npm workspaces berhasil dikonfigurasi.
- ESLint dan Prettier berhasil dikonfigurasi.
- `.gitignore` melindungi `.env`, `.env.*`, database SQLite, dan generated secrets.
- `PRD_MASTER.md` dibuat sebagai salinan referensi PRD.

### Hasil Pengujian

- `npm run typecheck`: berhasil untuk semua workspace.
- `npm run lint`: berhasil.
- `npm run format:check`: berhasil setelah formatting awal.
- Backend: `npm run backend:dev` berhasil memulai server dan `/api/health` mengembalikan
  `{"status":"ok","service":"easy-rent-bali-backend"}`.
- Expo: Metro berhasil menampilkan `Waiting on http://localhost:8081`, dan endpoint Metro
  mengembalikan HTTP 200.
- npm install menemukan 3 moderate-severity findings pada dependency tree; belum ada
  perubahan dependency pemecah atau `npm audit fix --force` dilakukan pada Phase 1.

### Tidak Dikerjakan pada Phase 1

- Implementasi database SQLite.
- Implementasi MCP tool.
- Implementasi LLM live.
- Implementasi fitur UI lanjutan.
- Deployment.

## Phase 2 - Professional Mobile UI/UX

**Tanggal:** 23 November 2026

### Hasil Aktual

- Splash screen premium dengan brand mark Easy Rent Bali.
- Chat screen dengan header, status preview, welcome area, suggested prompts,
  user/assistant bubbles, typing indicator, dan message input.
- Reusable button, badge, form, vehicle card, header, bottom navigation, dan
  confirmation dialog.
- Vehicle search preview menampilkan tiga sample UI dengan label PREVIEW.
- Vehicle detail screen menampilkan specifications, price, dan features.
- Booking flow dua langkah dengan form validation dan review ringkas.
- Confirmation dialog dan preview success state.
- Booking lookup dan settings screens.
- Semua tampilan data kendaraan dan booking ditandai sebagai preview data
  sementara dan tidak terhubung ke inventory atau database nyata.

### Hasil Pengujian

- `npm run typecheck`: berhasil untuk seluruh workspace.
- `npm run lint`: berhasil.
- `npm run format:check`: berhasil.
- Expo web berhasil diakses di `http://localhost:8082` dan mengembalikan HTTP 200.
- Browser verification berhasil membuka splash dan chat.
- Browser verification berhasil membuka vehicle cards dan vehicle details.
- Browser verification berhasil mengisi form booking dan membuka review.
- Confirmation modal dan preview success screen berhasil ditampilkan.
- Booking lookup dan settings navigation berhasil ditampilkan.

## Phase 3 - Database Design and Implementation

**Tanggal:** 23 November 2026

### Hasil Aktual

- SQLite menggunakan `better-sqlite3` dan database persisten pada
  `backend/data/easy-rent-bali.db`.
- Migration awal membuat tabel `vehicles`, `bookings`, `conversations`,
  `messages`, index, foreign key, unique booking reference, dan constraint status.
- Terdapat delapan development sample vehicles: Avanza, Innova, Xpander, Brio,
  Ertiga, Raize, Xenia, dan Fortuner.
- Repository database menyediakan parameterized SQL untuk vehicle, booking,
  conversation, dan message records.
- Booking menghasilkan referensi `ERB-YYYY-00001`, menghitung harga berdasarkan
  durasi kalender, dan menolak overlap aktif.
- Backend menyajikan `/api/vehicles` dan `/api/bookings/:reference`.

### Hasil Pengujian

- `npm run db:init`: berhasil dengan 8 development sample vehicles.
- `npm run db:test`: berhasil membuat booking test, menutup koneksi,
  membukanya kembali, dan mengambil booking yang sama.
- Pemeriksaan overlap: booking kedua pada periode yang bertabrakan ditolak.
- Pemeriksaan harga: `550000 x 3 hari = 1650000`.
- Backend `/api/health`: berhasil dengan database `initialized`.
- `/api/vehicles`: berhasil mengembalikan 8 records dengan label
  `development-sample-data`.
- `npm run typecheck`, `npm run lint`, dan `npm run format:check`: berhasil.

## Phase 8 - Backend API Development

**Tanggal:** 23 November 2026

### Hasil Aktual

- Backend memakai Zod request validation.
- CORS, JSON size limit, timeout, logging, dan rate limiting ditambahkan.
- Not-found dan error middleware mengembalikan structured safe responses.
- `/api/chat` dan `/api/chat/reset` memakai conversation persistence SQLite.
- Chat response mendukung operation status dan pending confirmation.
- Secret dan stack trace tidak dikirim ke mobile.

### Hasil Pengujian

- API test: 6 test berhasil.
- Health, vehicle, booking not found, reset, validation, dan unknown endpoint:
  berhasil.
- Backend smoke-test mendengarkan port 3000.
- MCP health: inventory dan booking aktif; 7 tools.
- Chat tanpa API key mengembalikan `LLM_OR_MCP_UNAVAILABLE` tanpa stack trace.

## Phase 5 - MCP Server A

**Tanggal:** 23 November 2026

### Hasil Aktual

- `easy-rent-inventory-server` menggunakan official MCP TypeScript SDK.
- Stdio transport digunakan untuk proses MCP A.
- SQLite dibuka read-only dan `query_only = ON`.
- Tools terdaftar:
  `search_vehicles`, `get_vehicle_details`,
  `check_vehicle_availability`.
- Setiap tool memiliki Zod input validation dan structured output.
- Availability membaca booking PENDING dan CONFIRMED secara langsung.

### Hasil Pengujian

- `npm run mcp-a:test`: berhasil.
- Registered tools: ketiga tool terdaftar.
- Search, detail, invalid vehicle, invalid date, dan booking conflict: berhasil.
- Test membuktikan database record digunakan.
- Server tidak memiliki operasi write booking.

## Phase 6 - MCP Server B

**Tanggal:** 23 November 2026

### Hasil Aktual

- `easy-rent-booking-server` menggunakan official MCP TypeScript SDK.
- Server menyediakan `create_booking`, `get_booking`, `update_booking`, dan
  `cancel_booking`.
- Create dan update memakai database transaction.
- Tanggal, status pending, kendaraan, dan overlap divalidasi sebelum write.
- Cancel mengubah status menjadi CANCELLED tanpa menghapus record.

### Hasil Pengujian

- `npm run mcp-b:test`: berhasil.
- Create, retrieve, update, dan cancel: berhasil.
- Duplicate overlapping booking: ditolak.
- Invalid date range: ditolak.
- Booking tetap dapat diambil melalui proses MCP baru setelah restart.

## Phase 7 - MCP Client Manager and AI Orchestration

**Tanggal:** 23 November 2026

### Hasil Aktual

- `McpClientManager` menghubungkan MCP A dan MCP B melalui stdio.
- Tool discovery menemukan tujuh tools dan ownership routing terdaftar.
- MCP schema dikonversi ke OpenRouter/OpenAI-compatible tool definitions.
- `/api/chat`, `/api/chat/reset`, `/api/health/mcp` ditambahkan.
- Conversation history disimpan melalui SQLite.
- Booking write tools diarahkan ke pending-action confirmation state.
- Konfirmasi ambigu ditolak dan konfirmasi eksplisit wajib sesuai pending action.

### Hasil Pengujian

- MCP orchestration test: berhasil.
- MCP A dan MCP B terhubung secara bersamaan.
- Tool count: 7.
- Inventory route dan vehicle detail route: berhasil.
- Ambiguous confirmation: ditolak.
- Explicit confirmation: diterima.
- Backend `/api/health/mcp`: inventory dan booking aktif.
- Backend `/api/health/llm`: live key belum dikonfigurasi; status aman.

## Phase 4 - OpenRouter LLM Integration

**Tanggal:** 23 November 2026

### Model Verification

- Katalog OpenRouter diperiksa pada 23 November 2026.
- Candidate gratis yang tercatat mendukung parameter `tools`:
  `openrouter/free`.
- Model dipindahkan sepenuhnya ke `OPENROUTER_MODEL`; tidak di-hardcode sebagai
  konfigurasi rahasia atau credential.

### Hasil Aktual

- `backend/src/ai/openrouter.service.ts` dibuat.
- OpenAI-compatible SDK dikonfigurasi dengan base URL OpenRouter.
- Conversation history dan sistem prompt Easy Rent Bali ditambahkan.
- Multi-round tool loop dibatasi maksimal 6 round.
- Timeout default 30 detik ditambahkan.
- Error mapping mencakup missing credentials, 401/403, 429, 402, 404,
  timeout, dan network failure.
- Temporary test tool disiapkan tetapi tidak dijalankan tanpa API key.
- `backend/.env.example` sekarang mencakup model, site URL, app name, dan
  database configuration.
- Endpoint backend `/api/health/llm` ditambahkan.

### Hasil Pengujian

- `npm run llm:test`: berhasil dijalankan dalam mode no-credential.
- Hasil konfigurasi: `configured=false`, `reachable=false`, `model=null`.
- Live normal chat dan live tool call tidak dijalankan karena `backend/.env`
  belum dikonfigurasi.
- Tidak ada API key yang dicetak atau disimpan dalam source.
- `npm run typecheck`, `npm run lint`, dan `npm run format:check`: berhasil.

## Phase 9 - Connect Expo Mobile Application to Backend

**Tanggal:** 23 November 2026

### Hasil Aktual

- Mobile API client bertipe menghubungkan chat, confirmation, reset, booking
  lookup, dan health check ke REST backend.
- Chat history disimpan lokal menggunakan AsyncStorage dan conversation ID
  tetap digunakan pada permulaan aplikasi berikutnya.
- Vehicle results dan booking summaries dirender dari hasil backend/MCP; file
  preview vehicle mobile dihapus.
- Booking write flow menggunakan dedicated `/api/chat/confirm`; pesan biasa
  tidak dapat mengesahkan pending action.
- Reset conversation menghapus history backend serta pending action.
- API URL dapat ditentukan dengan `EXPO_PUBLIC_API_URL`; Android emulator memakai
  `10.0.2.2`, sementara perangkat fisik perlu URL IP LAN.

### Hasil Pengujian

- `npm run typecheck`: berhasil untuk semua workspace.
- `npm run lint` dan `npm run format:check`: berhasil.
- Backend API tests: 10 test berhasil termasuk health, reset persistence,
  confirmation tanpa pending action, dan safe no-credential response.
- MCP A, MCP B, dan MCP orchestration tests berhasil; 7 tools ditemukan.
- Backend smoke test: health `ok`, 8 sample vehicles berlabel development, dan
  7 MCP tools.
- Expo Web dibuka dan diuji di browser: navigasi Chat/Booking/Pengaturan,
  booking lookup 404 yang aman, dan pengiriman chat berhasil mencapai backend.
- Chat menampilkan pesan error aman karena OpenRouter belum dikonfigurasi;
  Android emulator/perangkat fisik tidak tersedia untuk pengujian sesi ini.
- Live OpenRouter chat/tool test belum bisa dilaksanakan tanpa konfigurasi lokal.

## Phase 10 - Full Testing, Debugging, and Quality Assurance

**Tanggal:** 23 November 2026

### Perbaikan

- MCP client manager kini meneruskan `DATABASE_URL` kepada kedua MCP server
  menggunakan path SQLite yang telah di-resolve.
- Health OpenRouter memvalidasi konfigurasi/key dan ketersediaan model; error
  model tidak tersedia serta provider failures dipetakan secara aman.
- Hasil kendaraan dari beberapa tool dideduplikasi sebelum dikirim ke mobile.
- Proposal booking memuat rincian pelanggan, kendaraan, tanggal, lokasi, catatan,
  dan estimasi biaya; pemeriksaan availability dilakukan sebelum proposal.
- Test API/MCP disesuaikan agar dapat berjalan dengan database terisolasi dan
  konfigurasi OpenRouter yang sudah tersedia.

### Hasil Pengujian Aktual

- `npm run typecheck`: berhasil pada semua workspace.
- `npm run lint`: berhasil.
- `npm run format:check`: berhasil.
- `npm run api:test`: 14/14 test berhasil.
- `npm run mcp:test`: 7 tools ditemukan; routing dan konfirmasi eksplisit berhasil.
- `npm run mcp-a:test`: search/detail/availability, input invalid, konflik booking,
  penggunaan database, dan akses read-only berhasil.
- `npm run mcp-b:test`: create/get/update/cancel, overlap, validasi, serta
  persistence setelah restart berhasil.
- `npm run llm:test`: OpenRouter live dapat diakses; chat Indonesia dan temporary
  function/tool call berhasil. HTTP 402 hanya disimulasikan dengan stub.
- Skenario Expo Web end-to-end menghasilkan booking QA `ERB-2026-00001`, status
  `PENDING`, estimasi Rp1.100.000. Data tetap ditemukan setelah restart backend.
- Backend dan Expo Web merespons HTTP 200 setelah pengujian.

### Batasan

- Tidak ada pengujian Android emulator/perangkat fisik.
- Kredit OpenRouter sungguhan tidak dikuras; skenario HTTP 402 memakai stub.
- Kendaraan database adalah development sample, bukan inventaris aktual.
- Mode `tsx watch` pernah menampilkan `EPIPE` child MCP saat restart; backend
  stabil berhasil dijalankan.
- Laporan rinci dan bukti tersimpan dalam `docs/QA_REPORT.md`.

## Phase 11 - Deployment and Demonstration Preparation

**Tanggal:** 23 November 2026

### Persiapan

- Menambahkan `backend:build` untuk mengompilasi backend serta MCP A/B ke
  JavaScript; production MCP manager menjalankan hasil kompilasi langsung melalui
  Node.js.
- Production tidak lagi men-seed development sample vehicles secara otomatis.
- Menambahkan template environment produksi backend dan mobile, validasi HTTPS
  pada release Expo, identitas app, dan profile EAS APK preview/AAB production.
- Mendokumentasikan SQLite pada persistent volume `/data`, kebutuhan satu
  replika, prosedur URL/health check, dan demo MCP/booking.

### Hasil Aktual

- `npm run backend:build`: berhasil untuk backend dan kedua MCP server.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: berhasil.
- `npm run api:test`: 15/15 test berhasil, termasuk guard seed production.
- Production runtime smoke pada port 3001: health `ok`, dua MCP server aktif,
  tujuh tools ditemukan; MCP compiled `search_vehicles` mengembalikan satu
  Toyota Avanza pada database QA terisolasi.
- Expo production config menolak URL HTTP dan menerima URL HTTPS uji.
- `npx expo export --platform web`: berhasil; export lokal sementara dibersihkan.
- Preview lokal Expo di port 8081 dan backend di port 3000 berjalan; backend,
  OpenRouter, dan MCP health terverifikasi.

### Belum Dilakukan

- Tidak ada token hosting/EAS, URL backend HTTPS, Docker, Android SDK, atau IP
  LAN aktif. Deployment publik, volume cloud, APK/AAB, dan QR yang dapat dipakai
  perangkat fisik belum dibuat atau diverifikasi.
- Hosting belum dipilih/dibeli. Go-live menunggu persetujuan biaya dan pemuatan
  inventaris kendaraan operasional yang sudah diverifikasi.
- Status dan bukti rinci ada di `docs/DEPLOYMENT_REPORT.md`.

### Follow-up Kendala Chat

- Error chat generik ditelusuri ke HTTP 429 rate limit OpenRouter; backend dan
  kedua MCP server tetap sehat.
- `/api/chat` kini membedakan rate limit, kredit/config/model provider, timeout,
  dan MCP unavailable dengan pesan aman serta structured error log tanpa detail
  credential.
- `npm run api:test`: 16/16; `npm run typecheck`, `npm run lint`,
  `npm run format:check`, dan `npm run backend:build` berhasil.
- Permintaan provider nyata masih dibatasi; tidak ada model berbayar atau retry
  otomatis yang ditambahkan.

## Phase 12 - Final Documentation and Assessment Submission

**Tanggal catatan sebelumnya:** 23 November 2026. Perubahan berikutnya dicatat
sebagai tindak lanjut tanpa mengasumsikan tanggal hasil uji historis.

### Dokumentasi yang disiapkan

- README diperluas dengan ringkasan, fitur, teknologi, struktur, arsitektur,
  instalasi, environment, instruksi run/test, serta status gap.
- `docs/ARCHITECTURE.md`, `docs/TESTING_REPORT.md`, dan
  `ai_session_logs/STEERING_AUDIT.md` dibuat.
- Dokumentasi API/MCP/LLM diperinci; deployment report dan QA report dirujuk
  untuk bukti yang sudah tercatat.
- `PRD_MASTER.md` mempertahankan requirements dan mendapat appendix status
  implementasi.
- Prompt 12 dicatat verbatim; Prompt 0–11 ditandai sebagai ringkasan riwayat,
  bukan ekspor event log.
- `screenshots/README.md` menjelaskan dua screenshot yang memang ada serta layar
  yang belum tersedia/terambil.

### Temuan dan koreksi terkait

- MCP A sebelumnya selalu mengembalikan label `development-sample-data`.
  Deskripsi tool kini generik; label hasil menjadi `database` pada production
  tanpa opt-in seed, dan tetap `development-sample-data` pada development atau
  ketika seed development secara eksplisit diaktifkan.
- Test MCP A diperluas untuk memeriksa label sesuai environment.
- Tidak ada inventory, booking QA, credential, screenshot, hasil deployment,
  atau keberhasilan provider yang direka.

### Keterbatasan submission

- OpenRouter completion terbaru ter-rate-limit HTTP 429; MCP masih sehat.
- Booking form/review/success terpisah belum tersedia pada production UI.
- Android, deployment publik/persistent cloud volume, APK, QR perangkat fisik,
  screenshot lengkap, dan Git clean belum terpenuhi.
- Status akhir harus tetap “belum lengkap” sampai item yang relevan diverifikasi.

### Verifikasi aktual setelah perubahan source dan dokumentasi

- `npm run typecheck`: berhasil untuk seluruh workspace.
- `npm run lint`: berhasil.
- `npm run format:check`: seluruh file cocok dengan Prettier.
- `npm run api:test`: 16/16 lulus.
- `npm run backend:build`: inventory-server, booking-server, dan backend berhasil
  dikompilasi.
- `npm run mcp:test`: kedua server aktif, tujuh tools ditemukan, routing dan
  confirmation gate lulus.
- `npm run mcp-b:test`: lifecycle create/get/update/cancel, overlap, validasi,
  dan persistence after restart lulus.
- `npm run mcp-a:test` dan `$env:NODE_ENV = 'production'; npm run mcp-a:test`:
  discovery, search/detail, invalid ID/tanggal, konflik, read-only, dan label
  data source development/production lulus.
- Live OpenRouter tidak diklaim lulus pada verifikasi ini; status terakhir yang
  diketahui tetap HTTP 429.

## Follow-up - Qwen3 TTS 1.7B

- Model suara ditambahkan secara terpisah dari model chat, memakai endpoint
  server-side `POST /api/speech`; mobile membuat audio hanya saat tombol
  “Dengarkan” ditekan.
- Pesan error assistant tidak menawarkan kontrol suara. Cache audio sesi
  mencegah replay mengirim permintaan provider tambahan.
- `npm run api:test`: 23/23 lulus, termasuk API speech dan service TTS yang
  memakai mock provider.
- `npm run typecheck`, `npm run lint`, dan `npm run format:check`: lulus.
- Expo Web export berhasil dari workspace mobile; output sementara dibersihkan.
- Browser menunjukkan backend online dan MCP connected. Audio provider nyata
  tidak dibuat karena dapat berbiaya dan dukungan Bahasa Indonesia belum
  terverifikasi.
