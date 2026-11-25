# Panduan Deployment

## Status dan batas penting

Deployment publik belum dilakukan. Belum tersedia kredensial hosting/EAS atau
URL backend publik, dan pembelian hosting tidak dilakukan. Sebelum deploy,
pilih platform Node.js yang menyediakan volume persisten yang dapat dipasang ke
`/data`; SQLite tidak boleh disimpan pada filesystem container yang ephemeral.

Backend ini memakai SQLite, dan pending booking confirmation disimpan di memori
proses. Untuk MVP gunakan **satu replika backend** dengan satu volume persisten.
Jangan aktifkan autoscaling atau beberapa replika sebelum database dan pending
actions dipindahkan ke layanan bersama.

Endpoint `POST /api/speech` memicu generasi audio berbayar. Sebelum membuka
backend ke publik, tambahkan autentikasi pengguna dan spend limit provider;
rate-limit per IP saja bukan pengamanan biaya yang memadai.

Database production baru hanya dimigrasikan saat backend mulai; data kendaraan
development tidak otomatis dimasukkan. Muat inventaris perusahaan yang sudah
diverifikasi sebelum membuka aplikasi kepada pelanggan. Jangan aktifkan
`SEED_DEVELOPMENT_DATA` pada deployment publik.

## Build backend production

Dari root repository:

```powershell
npm ci
npm run backend:build
```

Build mengompilasi MCP Server A, MCP Server B, lalu backend ke JavaScript
(`dist/`). Dalam production, MCP manager menjalankan berkas hasil kompilasi
langsung dengan Node.js, bukan `tsx`.

Perintah start pada platform:

```powershell
npm run backend:start
```

## Environment backend

Gunakan [backend/.env.production.example](../backend/.env.production.example)
sebagai daftar variabel, bukan sebagai berkas rahasia untuk di-commit. Masukkan
nilai melalui secret/environment manager platform:

- `NODE_ENV=production`
- `PORT`: port yang ditentukan platform.
- `DATABASE_URL=file:/data/easy-rent-bali.db`
- `SEED_DEVELOPMENT_DATA=false`
- `OPENROUTER_API_KEY`: secret server-side, jangan pernah dikirim ke aplikasi.
- `OPENROUTER_MODEL=openrouter/free` atau model tool-calling yang sudah diverifikasi.
- `OPENROUTER_TTS_MODEL=qwen/qwen3-tts-1.7b` untuk audio balasan on-demand.
- `CORS_ORIGIN`: origin HTTPS web yang diizinkan, bila web client digunakan.

Pasang volume persisten tepat pada `/data` sebelum start pertama. Pastikan proses
memiliki izin tulis ke volume agar SQLite dapat membuat file database, WAL, dan
SHM. Jadwalkan backup yang konsisten dengan SQLite dan uji pemulihan sebelum
menyimpan booking sungguhan.

Gunakan database baru untuk production. Jika memakai file DB lama, tinjau dan
hapus development sample records melalui prosedur migrasi/manual yang ditinjau
terlebih dahulu; jangan mengasumsikan mematikan seed akan menghapus record lama.

## Expo production dan APK

Konfigurasi EAS ada di `apps/mobile/eas.json`. File
[apps/mobile/.env.production.example](../apps/mobile/.env.production.example)
menunjukkan format URL API. Ganti nilainya dengan origin backend HTTPS yang
sudah benar-benar dideploy; jangan sertakan `/api` di akhir. `app.config.js`
menolak build production bila URL kosong/tidak valid atau bukan HTTPS.

Set `EXPO_PUBLIC_API_URL` pada environment `preview` dan `production` di EAS.
Variabel ini memang menjadi bagian dari bundle aplikasi; jangan menaruh secret
di variabel `EXPO_PUBLIC_*`.

Identitas Android/iOS `com.easyrentbali.assistant` saat ini merupakan konfigurasi
proyek. Pastikan namespace tersebut tersedia dan dimiliki developer sebelum
rilis ke store; ubah jika organisasi memiliki namespace sendiri.

Setelah memiliki akun Expo/EAS, jalankan dari `apps/mobile`:

```powershell
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform android --profile production
```

Profile `preview` menghasilkan APK internal; profile `production` menghasilkan
Android App Bundle. Build memerlukan login, project EAS, dan URL backend HTTPS.
Jangan distribusikan build preview yang belum diuji terhadap backend tersebut.

## Demo lokal

Untuk Expo Web pada komputer yang sama, gunakan
`EXPO_PUBLIC_API_URL=http://localhost:3000`. Android Emulator menggunakan
`http://10.0.2.2:3000`. Perangkat fisik memerlukan alamat LAN backend yang dapat
dijangkau ponsel dan konfigurasi firewall yang sesuai. Nilai URL lokal ini hanya
untuk demo, bukan production.

Rangkaian demo dan langkah QR Expo ada di
[DEMO.md](./DEMO.md).

## Pemeriksaan deployment

Setelah deploy nyata, verifikasi URL yang diberikan platform:

1. `GET /api/health` harus mengembalikan HTTP 200.
2. `GET /api/health/llm` harus mengembalikan HTTP 200, `configured=true`, dan
   `reachable=true`.
3. `GET /api/health/mcp` harus menunjukkan inventory dan booking aktif serta
   `toolCount=7`.
4. `GET /api/vehicles` harus mengembalikan `dataSource=database` dan record
   inventaris yang telah diverifikasi.
5. Buat booking uji yang disetujui eksplisit, restart backend tanpa menghapus
   volume, lalu pastikan referensi yang sama dapat diambil kembali.

URL baru boleh disebut deployed/terverifikasi setelah pemeriksaan tersebut
benar-benar dijalankan pada URL publik aktual.
