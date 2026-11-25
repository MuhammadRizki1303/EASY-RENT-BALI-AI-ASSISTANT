# Laporan Verifikasi Deployment dan Demo

**Tanggal:** 23 November 2026  
**Kesimpulan:** build backend production dan Expo Web lokal berhasil diverifikasi.
Deployment publik, APK, serta QR perangkat fisik **belum** berhasil/tidak
dilakukan; tidak ada klaim deployment.

## Bukti Verifikasi

| Area                       | Hasil yang diharapkan                                   | Hasil aktual                                                                                                                                                                                                                                | Status           |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Backend production build   | Backend dan kedua MCP server terkompilasi               | `npm run backend:build` berhasil membuat JavaScript pada folder `dist/` untuk backend, inventory, dan booking.                                                                                                                              | PASS             |
| Backend production runtime | Build berjalan dan dapat membuka MCP A/B                | Runtime `node dist/index.js` berjalan di port uji 3001 dengan SQLite terisolasi. `/api/health` mengembalikan `ok`; MCP inventory/booking aktif, 7 tools ditemukan. Database uji dibersihkan sesudahnya.                                     | PASS (lokal)     |
| MCP production executable  | MCP compiled tools merespons request nyata              | Manager compiled menghubungkan kedua server hasil build dan `search_vehicles` menemukan 1 Toyota Avanza pada DB uji.                                                                                                                        | PASS             |
| Seed inventory production  | Production tidak menyajikan data contoh secara default  | `npm run api:test`: **15/15 lulus**, termasuk boot dengan `NODE_ENV=production`; tanpa opt-in, tabel kendaraan kosong dan `dataSource=database`.                                                                                            | PASS             |
| Expo metadata              | Nama aplikasi dan Android/iOS identifier terselesaikan  | `npx expo config --type public --json` berhasil untuk `Easy Rent Bali AI Assistant` / `easy-rent-bali-ai`.                                                                                                                                  | PASS             |
| URL API release            | Release hanya menerima origin HTTPS yang valid          | Konfigurasi release menolak `http://localhost:3000` dan menerima URL HTTPS uji. URL uji bukan endpoint nyata.                                                                                                                               | PASS             |
| Expo Web bundle            | Export produksi berhasil                                | `npx expo export --platform web` menghasilkan bundle web (JS 451 KB). Export memakai `localhost:3000` untuk uji lokal; output sementara dibuang dan **tidak** dipublikasikan sebagai build production.                                      | PASS (uji lokal) |
| Preview lokal              | App dan backend dapat dibuka                            | Expo Web `http://localhost:8081/` merespons HTTP 200; browser menunjukkan app dan status backend/MCP terhubung. Backend lokal `http://localhost:3000` merespons health `ok`, LLM reachable, 7 MCP tools, dan 8 development sample vehicles. | PASS (lokal)     |
| Persistent SQLite          | Data survives restart pada storage persistent           | Strategi disiapkan: mount volume ke `/data`, `DATABASE_URL=file:/data/easy-rent-bali.db`, satu replika, backup dan restore diuji sebelum go-live. Tidak ada cloud volume yang dibuat/diuji.                                                 | BELUM DIUJI      |
| Hosting publik             | URL publik sehat dan dapat diakses aplikasi             | Tidak tersedia provider/token/domain; tidak ada deployment atau URL publik untuk dites.                                                                                                                                                     | BLOCKED          |
| Android APK / EAS          | APK preview atau AAB dapat diunduh                      | `EXPO_TOKEN`, `EAS_ACCESS_TOKEN`, EAS CLI, dan Android SDK tidak tersedia; tidak ada APK/AAB yang dibuat.                                                                                                                                   | BLOCKED          |
| QR perangkat fisik         | QR mengarah ke Metro yang dapat dijangkau di LAN/tunnel | Expo berjalan lokal, tetapi tidak ditemukan IPv4 LAN aktif; belum ada koneksi tunnel yang dipakai. QR untuk perangkat fisik belum dibuat/diverifikasi.                                                                                      | BLOCKED          |

Pada follow-up chat, OpenRouter health masih melaporkan key/model reachable,
tetapi completion nyata ditolak dengan HTTP 429 rate limit. Backend kini
mengembalikan kode aman `OPENROUTER_RATE_LIMITED`; hal ini tidak dianggap sebagai
deployment/provider availability yang lulus.

Pemeriksaan keberadaan credential dilakukan tanpa membaca atau menampilkan
nilainya. Token hosting yang diperiksa (`RAILWAY_TOKEN`, `RENDER_API_KEY`,
`FLY_API_TOKEN`) dan token Expo/EAS tidak tersedia. Docker juga tidak terpasang.

## Keputusan Storage dan Go-Live

- Gunakan platform/container Node.js yang memberikan volume persisten dan pasang
  ke `/data`; jangan gunakan filesystem ephemeral untuk SQLite.
- Jalankan satu replika karena SQLite dan pending confirmation saat ini
  membutuhkan satu instance.
- Production tidak men-seed development vehicles. Inventaris aktual yang telah
  diverifikasi harus dimuat terlebih dahulu; database sampel tidak boleh dipakai
  sebagai inventaris layanan.
- Tidak ada hosting yang dibeli atau dipilih. Penggunaan layanan berbayar menunggu
  persetujuan developer.

## Langkah Berikutnya

1. Pilih provider yang menawarkan storage persisten, setujui biayanya, dan
   berikan akses/token melalui secret manager lokal/provider.
2. Sediakan domain HTTPS backend dan konfigurasi `EXPO_PUBLIC_API_URL` pada
   environment EAS preview/production.
3. Muat serta verifikasi inventaris operasional pada volume production.
4. Deploy, lalu jalankan health, MCP, pencarian, booking uji, restart, dan lookup
   pada URL publik aktual.
5. Login/inisialisasi project EAS, buat APK preview, lalu uji pada perangkat
   Android sebelum distribusi.

Panduan operasional dan langkah demo tersedia di
[DEPLOYMENT.md](./DEPLOYMENT.md) dan [DEMO.md](./DEMO.md).
