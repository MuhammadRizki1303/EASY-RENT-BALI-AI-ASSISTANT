# Laporan Quality Assurance - Easy Rent Bali AI Assistant

**Tanggal pengujian:** 23 November 2026  
**Cakupan:** frontend web, backend REST, OpenRouter, MCP A/B, orkestrasi, dan alur booking ujung ke ujung.

## Ringkasan

| Area                             | Hasil                                                              |
| -------------------------------- | ------------------------------------------------------------------ |
| TypeScript, lint, formatting     | Lulus                                                              |
| Backend API                      | 16/16 test lulus                                                   |
| MCP orchestration                | Lulus; 7 tool ditemukan dan dirutekan                              |
| MCP Server A                     | Lulus                                                              |
| MCP Server B                     | Lulus                                                              |
| OpenRouter live                  | Chat/tool call pernah lulus; follow-up terkena rate limit provider |
| Expo Web dan skenario booking    | Lulus berdasarkan pengujian browser sebelumnya                     |
| Android emulator/perangkat fisik | Tidak diuji                                                        |

## Hasil Pengujian

| ID / Pengujian                      | Hasil yang diharapkan                                                           | Hasil aktual dan bukti                                                                                                                                                                                                                                    | Status                   |
| ----------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| QA-01 TypeScript                    | Semua workspace lolos typecheck                                                 | `npm run typecheck` berhasil untuk mobile, backend, kedua MCP server, dan shared types.                                                                                                                                                                   | PASS                     |
| QA-02 Lint dan format               | Tidak ada pelanggaran lint/format                                               | `npm run lint` berhasil; `npm run format:check` menyatakan semua file cocok dengan Prettier.                                                                                                                                                              | PASS                     |
| QA-03 REST API                      | Endpoint dan validasi berfungsi; kegagalan aman                                 | Follow-up `npm run api:test`: **16 test lulus**, mencakup validasi request, health, rate limit, respons provider tidak tersedia, error chat 429, booking confirmation, pembatalan proposal, dan deduplikasi kendaraan.                                    | PASS                     |
| QA-04 OpenRouter live               | Chat dan tool call berfungsi tanpa membocorkan credential                       | `npm run llm:test` sebelumnya berhasil untuk chat Indonesia dan `temporary_weather_probe`. Pada follow-up 23 Nov 20:23, request chat nyata ditolak provider sebagai `OpenRouterRateLimitError` (HTTP 429); health key/model tetap reachable.              | TERBATAS (429 provider)  |
| QA-05 Error OpenRouter              | Kunci/model salah serta kegagalan kredit dipetakan dengan aman                  | Kunci tidak valid ditolak; model tidak tersedia menghasilkan error model. Respons 402/kredit diuji dengan stub, bukan dengan menghabiskan kredit akun.                                                                                                    | PASS (402 disimulasikan) |
| QA-06 MCP A discovery dan pencarian | Tool read-only menggunakan record SQLite                                        | `npm run mcp-a:test`: `search_vehicles`, `get_vehicle_details`, dan `check_vehicle_availability` terdaftar; pencarian, detail, record DB, serta batas read-only terverifikasi.                                                                            | PASS                     |
| QA-07 MCP A input dan ketersediaan  | ID/tanggal salah ditolak dan konflik booking terdeteksi                         | Tes invalid vehicle, invalid date, dan booking conflict lulus.                                                                                                                                                                                            | PASS                     |
| QA-08 MCP B lifecycle               | Booking dibuat, dibaca, diperbarui, dibatalkan secara persisten                 | `npm run mcp-b:test`: seluruh operasi lulus; referensi duplikat/overlap, tanggal/vehicle salah, dan update dengan tanggal invalid ditolak; persistence setelah restart MCP lulus.                                                                         | PASS                     |
| QA-09 MCP orchestration             | Kedua server terhubung, tool discovery dan routing benar                        | `npm run mcp:test`: status inventory dan booking aktif; 7 tool ditemukan; routing inventory/detail dan verifikasi explicit confirmation lulus; konfirmasi ambigu ditolak.                                                                                 | PASS                     |
| QA-10 Backend dan database failure  | MCP offline atau database URL tidak valid gagal tertutup                        | MCP offline diuji dengan konfigurasi server yang tidak valid; URL database dengan scheme tidak didukung ditolak. Stack trace/credential tidak ditampilkan ke klien.                                                                                       | PASS                     |
| QA-11 Frontend browser              | Navigasi, kendaraan, lookup, status, dan layout responsif                       | Pengujian Expo Web sebelumnya memeriksa navigasi, detail kendaraan, lookup, dialog konfirmasi, dan status koneksi; lebar 320/375/768 px tidak menunjukkan horizontal overflow.                                                                            | PASS (web)               |
| QA-12 Booking end-to-end            | Proposal → konfirmasi UI → MCP B → lookup → persistence setelah backend restart | Skenario melalui Expo Web selesai. Booking `ERB-2026-00001` tersimpan sebagai `PENDING`; setelah restart backend, booking tetap ditemukan via REST dan MCP B. Database uji mengembalikan tanggal `2099-12-10` s.d. `2099-12-12` dan estimasi Rp1.100.000. | PASS                     |
| QA-13 Status layanan                | Backend dan Expo tetap dapat diakses setelah pengujian                          | Backend `/api/health` merespons HTTP 200 dengan database initialized; Expo Web di port 8081 merespons HTTP 200.                                                                                                                                           | PASS                     |

## Hasil Pengujian Negatif dan Batasan

- **Follow-up setelah QA:** OpenRouter menerima health check, tetapi membatasi
  completion nyata dengan HTTP 429. Backend kini mengembalikan
  `OPENROUTER_RATE_LIMITED` dan pesan untuk mencoba kembali; tersedia regresi API
  yang memastikan response tersebut. Model berbayar tidak dipilih dan tidak ada
  retry otomatis yang dapat menambah penggunaan provider.
- **Kredit OpenRouter:** kegagalan HTTP 402 diuji menggunakan stub. Tidak ada upaya menghabiskan kredit nyata.
- **Invalid key/model:** error provider diuji; secret tetap berada di `backend/.env` dan tidak disertakan dalam laporan atau log pengujian.
- **MCP A/B offline:** koneksi gagal diuji melalui konfigurasi executable/server yang tidak valid; bukan dengan memutus jaringan produksi.
- **Android/iOS fisik:** tidak tersedia untuk pengujian; verifikasi UI yang dilakukan adalah Expo Web.
- **Booking form terpisah:** booking produksi dilakukan melalui percakapan dan dialog konfirmasi. Form/date picker preview lama tidak menjadi bagian dari alur produksi yang diuji.
- **Data kendaraan:** database berisi development sample data, bukan inventaris aktual perusahaan. Sukses pencarian tidak membuktikan ketersediaan armada nyata.
- **Booking QA:** booking `ERB-2026-00001` dibuat pada database QA sementara. Database dan referensi tersebut bukan data booking produksi; database QA dibersihkan setelah verifikasi.
- **`tsx watch` saat restart:** pernah menampilkan `EPIPE` dari child MCP stdio pada proses restart. Restart backend stabil (`backend:start`) berhasil; isu khusus mode watch tidak diperbaiki dalam cakupan QA.

## Isu Tersisa

1. Uji Android emulator dan perangkat fisik masih perlu dilakukan.
2. HTTP 402 nyata belum diuji menggunakan akun berkredit rendah; pengujiannya dibatasi pada stub.
3. Sampel kendaraan perlu diganti atau dipisahkan dari data operasional sebelum deployment produksi.
4. `tsx watch` dapat menampilkan `EPIPE` pada child MCP selama restart; gunakan proses backend stabil saat demo/validasi.

## Reproduksi Pengujian Otomatis

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run api:test
npm run mcp:test
npm run mcp-a:test
npm run mcp-b:test
npm run llm:test
```

Tes live OpenRouter memerlukan konfigurasi lokal di `backend/.env`. Jangan menaruh API key di source, laporan, atau prompt.

## Status akhir submission

Setelah pembaruan laporan ini, MCP A tool description tidak lagi menyatakan
bahwa seluruh inventory production adalah sample data. `dataSource` kini
menyesuaikan mode; uji `npm run mcp-a:test` pada mode development dan dengan
`NODE_ENV=production` mengembalikan `dataSourceTest: passed`. Typecheck, lint, format check,
production build, API 16/16, MCP A/B, dan MCP orchestration juga lulus pada
verifikasi source/dokumentasi terakhir.

Status OpenRouter completion tetap HTTP 429 dari pemeriksaan provider terakhir;
tidak ada live completion baru yang dinyatakan sukses. Form/review/success
booking terpisah, Android, deployment publik, APK/QR fisik, screenshot lengkap,
dan Git clean tetap belum terpenuhi. Laporan konsolidasi submission ada di
[TESTING_REPORT.md](./TESTING_REPORT.md).
