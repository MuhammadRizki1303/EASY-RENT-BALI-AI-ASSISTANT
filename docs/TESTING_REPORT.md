# Laporan Pengujian dan Status Submission

**Basis laporan:** hasil QA dan deployment yang tercatat pada 23 November 2026,
ditambah tindak lanjut rate-limit OpenRouter. Hasil historis dibedakan dari
status provider terbaru. Tidak ada secret yang disalin ke laporan.

## Ringkasan status

| Area                       | Hasil yang benar-benar tercatat                                                                      | Status saat ini                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| TypeScript, lint, Prettier | `npm run typecheck`, `npm run lint`, `npm run format:check` lulus setelah perubahan kode/dokumentasi | LULUS                                                              |
| Backend API                | `npm run api:test`: 16/16 lulus                                                                      | LULUS                                                              |
| MCP orchestration          | Kedua server terhubung, tujuh tools ditemukan dan dirutekan                                          | LULUS                                                              |
| MCP A                      | Search/details/availability, input invalid, konflik, read-only, dan label source diuji               | LULUS pada mode development dan `NODE_ENV=production`              |
| MCP B                      | Create/get/update/cancel, konflik, invalid input, persistence diuji                                  | LULUS                                                              |
| OpenRouter                 | Chat Indonesia dan temporary tool call berhasil pada uji terdahulu; request chat terbaru HTTP 429    | TERBATAS, live completion saat ini tidak dapat dinyatakan tersedia |
| Expo Web                   | Navigasi, chat, lookup, dialog, dan ukuran web diuji; endpoint lokal HTTP 200                        | LULUS untuk web                                                    |
| Android                    | Emulator/perangkat tidak tersedia untuk verifikasi                                                   | BELUM DIUJI                                                        |
| Booking UI                 | Confirmation dialog/alur chat ada; form/review/success terpisah tidak ada pada production flow       | TIDAK LENGKAP terhadap PRD                                         |
| Public deployment, APK, QR | Tidak tersedia token/hosting/domain/SDK/IP LAN yang memenuhi syarat                                  | BELUM DILAKUKAN                                                    |
| Screenshots                | Hanya chat dan lookup tersimpan sebagai PNG aktual                                                   | TIDAK LENGKAP                                                      |
| Git                        | Perubahan belum di-commit dan worktree tidak bersih                                                  | BELUM CLEAN                                                        |

## Catatan pengujian

| Pengujian                      | Ekspektasi                                                         | Hasil aktual/evidence                                                                                                                  | Hasil                          |
| ------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `npm run typecheck`            | Semua workspace lolos                                              | Lulus setelah perubahan MCP A dan dokumentasi                                                                                          | PASS                           |
| `npm run lint`                 | Tidak ada error lint                                               | Lulus setelah perubahan MCP A dan dokumentasi                                                                                          | PASS                           |
| `npm run format:check`         | Semua file mengikuti Prettier                                      | Semua file cocok setelah format file yang berubah                                                                                      | PASS                           |
| `npm run backend:build`        | Backend dan MCP A/B terkompilasi                                   | Build production backend dan kedua MCP server lulus setelah perubahan source                                                           | PASS                           |
| `npm run api:test`             | API validation, persistence, confirmation, dan error mapping benar | 16/16 lulus termasuk regresi rate limit                                                                                                | LULUS                          |
| `npm run mcp-a:test`           | Tool A membaca data SQLite dan tidak menulis                       | Tool discovery, search/detail, ID/tanggal salah, konflik, read-only, dan `dataSourceTest` lulus pada mode development serta production | PASS                           |
| `npm run mcp-b:test`           | Lifecycle booking memakai database dan tahan restart               | Create/get/update/cancel, overlap, validasi, dan persistence setelah process restart diuji                                             | LULUS                          |
| `npm run mcp:test`             | Discovery/routing dan confirmation gate benar                      | Inventory/booking aktif, 7 tools, routing dan konfirmasi eksplisit lulus                                                               | PASS                           |
| `npm run llm:test` / live chat | Chat dan tool call aktual tersedia                                 | Uji sebelumnya berhasil; panggilan lanjutan dikembalikan HTTP 429 oleh provider                                                        | TERBATAS                       |
| E2E booking Expo Web           | Proposal → confirm → MCP B → lookup setelah backend restart        | Skenario terdahulu menghasilkan booking QA `ERB-2026-00001`, PENDING, estimasi Rp1.100.000; ditemukan setelah restart                  | LULUS (historis, DB sementara) |
| Expo layout                    | Layar tidak overflow pada ukuran browser umum                      | Browser verification sebelumnya 320/375/768 px tanpa horizontal overflow                                                               | LULUS (web historis)           |
| Deployment smoke               | Build/runtime lokal dan MCP compiled berjalan                      | Runtime lokal health `ok`, dua MCP, 7 tools; uji tidak memakai URL publik                                                              | LULUS (lokal saja)             |

## Bukti OpenRouter dan error negatif

- Completion live dan tool call pernah berhasil, termasuk percakapan Indonesia.
- Follow-up yang menjadi keluhan “Layanan AI atau MCP sementara tidak tersedia”
  menemukan HTTP 429 `OpenRouterRateLimitError`; MCP tetap sehat.
- Backend memetakan rate limit sebagai HTTP 429
  `OPENROUTER_RATE_LIMITED`, dengan error aman dan log kategori tanpa credential.
- HTTP 402/kredit diuji dengan stub; tidak ada kredit nyata yang sengaja
  dihabiskan.
- Health `/api/health/llm` tidak menguji kuota atau completion; status reachable
  bukan bukti completion saat ini akan berhasil.
- Invalid key/model dan kegagalan MCP diuji sebelumnya dengan error aman/
  konfigurasi test; bukan outage provider/produksi yang dipaksakan.

## Booking E2E dan data uji

Booking `ERB-2026-00001` hanya digunakan di database QA terisolasi untuk
memverifikasi persistensi lintas restart backend. Database QA dibersihkan setelah
uji. Referensi itu bukan booking pelanggan, tidak tersedia untuk demo, dan tidak
boleh dianggap record produksi.

Database lokal berisi development sample vehicles, bukan inventory perusahaan.
Production tidak melakukan seed data contoh secara otomatis. Label source
`database` menunjukkan sumber query, bukan jaminan keaslian/validitas armada.

## Verifikasi akhir setelah perubahan dokumentasi

Perubahan source terakhir membuat deskripsi MCP A netral dan membuat `dataSource`
membedakan mode development/seed dari production tanpa seed. Setelah itu,
`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run api:test`
(16/16), `npm run backend:build`, `npm run mcp:test`, `npm run mcp-b:test`, dan
`npm run mcp-a:test` lulus dalam mode development maupun dengan
`NODE_ENV=production`; keduanya mengembalikan `dataSourceTest: passed` untuk
label yang diharapkan di environment masing-masing.

Tidak ada live OpenRouter completion baru yang diklaim pada verifikasi source
terakhir; status completion terbaru yang diketahui tetap HTTP 429.

## Verifikasi tindak lanjut Qwen3 TTS

- `npm run api:test`: 23/23 lulus pada `src/api/api.test.ts` dan
  `src/ai/openrouter.speech.test.ts`. Pengujian TTS menggunakan mock provider;
  tidak menghasilkan audio berbayar.
- `npm run typecheck`, `npm run lint`, dan `npm run format:check`: lulus setelah
  perubahan kontrol audio mobile.
- `npx expo export --platform web --output-dir .expo\export-check`, dijalankan
  dari `apps/mobile`: berhasil. Folder export sementara dibersihkan sesudahnya.
- Browser aktual menunjukkan backend online dan MCP connected. Percakapan
  tersimpan menampilkan error model provider; kontrol audio tidak ditampilkan
  untuk pesan error tersebut. Respons assistant normal memiliki kontrol
  “Dengarkan” secara on-demand.
- Request audio langsung ke OpenRouter tidak dijalankan karena bersifat
  berbayar; daftar bahasa model yang diperiksa juga tidak mencantumkan Bahasa
  Indonesia. Kualitas ucap Bahasa Indonesia belum diverifikasi.

## Screenshot dan UI

File yang benar-benar tersimpan:

- `screenshots/main-chat.png` — chat aktual yang menunjukkan pesan provider
  rate-limit.
- `screenshots/booking-lookup.png` — layar lookup aktual tanpa hasil booking.

Pencarian/detail kendaraan tidak berhasil ditangkap dalam sesi final karena
completion dibatasi provider. Form booking, review, dan success screen terpisah
tidak tersedia pada production UI saat ini; jangan membuat screenshot simulasi
yang mengklaim fitur tersebut ada. Inventaris screenshot lengkap ada di
[`screenshots/README.md`](../screenshots/README.md).

## Keterbatasan yang tersisa

1. Pulihkan/atasi OpenRouter HTTP 429 lalu ulangi live chat dan tool calling.
2. Tentukan dan implementasikan UI form, review, serta success booking yang
   diminta PRD; saat ini booking berjalan via chat dan dialog.
3. Uji aplikasi pada Android emulator/perangkat nyata.
4. Pilih hosting dengan persistent volume setelah persetujuan biaya; deploy dan
   uji URL publik nyata. Tidak ada deployment yang diklaim.
5. Buat dan verifikasi APK/QR fisik bila tooling serta kredensial tersedia.
6. Tangkap screenshot aktual semua layar yang benar-benar tersedia; jangan
   mengisi kekosongan dengan mockup yang disajikan sebagai bukti.
7. Worktree belum bersih/di-commit. Tidak ada commit yang dibuat untuk pekerjaan
   dokumentasi ini.
8. `tsx watch` pernah menghasilkan `EPIPE` dari child MCP ketika restart;
   runtime backend stabil berhasil, tetapi watch-mode restart issue belum
   diselesaikan.

## Kesimpulan

Backend, SQLite, MCP A/B, routing, dan pengujian lifecycle booking sudah memiliki
bukti lokal. Namun submission **belum lengkap** karena completion OpenRouter
terbaru rate-limited, UI booking yang diminta belum lengkap, Android/deployment
belum diuji, bukti screenshot terbatas, dan repository belum clean.

Laporan QA rinci historis tersedia di [QA_REPORT.md](./QA_REPORT.md), sementara
status deployment ada di [DEPLOYMENT_REPORT.md](./DEPLOYMENT_REPORT.md).
