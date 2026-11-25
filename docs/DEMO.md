# Panduan Demonstrasi

## Persiapan lokal

1. Pastikan backend dikonfigurasi dari `backend/.env`; API key OpenRouter hanya
   berada pada backend.
2. Untuk browser di komputer yang sama, pastikan
   `apps/mobile/.env` menggunakan `EXPO_PUBLIC_API_URL=http://localhost:3000`.
   Untuk Android Emulator gunakan `http://10.0.2.2:3000`. Perangkat fisik harus
   memakai IP LAN komputer yang menjalankan backend.
3. Jalankan backend dengan `npm run backend:dev`.
4. Jalankan Expo dengan `npm run mobile:start`. Terminal Expo menampilkan QR
   untuk Expo Go; gunakan mode LAN dan pastikan ponsel bisa mengakses Metro dan
   port backend. Bila jaringan/QR tidak tersedia, browser lokal tetap dapat
   membuka `http://localhost:8081/`.
5. Pada Pengaturan, pastikan Backend, OpenRouter, dan MCP menunjukkan
   **Terhubung**. Backend `/api/health/mcp` seharusnya melaporkan 7 tools.

## Skenario

Gunakan data pengujian dan identitas sintetis; jangan menampilkan data pelanggan
nyata saat merekam demo.

1. Buka Chat, lalu minta: **“Tolong cari Toyota Avanza.”**
2. Tampilkan kartu hasil dan buka detail kendaraan.
3. Minta pengecekan availability dengan tanggal sewa tertentu sebelum membuat
   proposal booking.
4. Minta booking dan berikan data pelanggan uji, tanggal, lokasi pickup, dan
   lokasi pengembalian.
5. Tinjau ringkasan proposal dan estimasi; pilih konfirmasi hanya jika datanya
   benar. Menutup/menolak dialog tidak boleh membuat booking.
6. Catat reference yang dikembalikan backend setelah MCP B sukses.
7. Buka tab Booking, cari reference tersebut, lalu tampilkan hasil aktual.
8. Untuk bukti MCP, tunjukkan `toolActivity` pada response `/api/chat` dan
   `/api/chat/confirm` melalui Network inspector; health MCP hanya membuktikan
   koneksi/tool discovery, bukan pemanggilan spesifik.
9. Jika mendemonstrasikan persistence, restart backend dengan volume/database
   yang sama, lalu lakukan lookup ulang.

## Catatan integritas demo

- Database lokal berisi development sample vehicles, bukan inventaris Easy Rent
  Bali yang telah diverifikasi. Sampaikan ini ketika memperagakan data.
- Gunakan tanggal mendatang yang belum memiliki booking; jangan memakai reference
  hasil QA lama.
- Booking hanya berhasil setelah konfirmasi eksplisit dan respons MCP B nyata.
- Jangan menampilkan API key, nomor telepon nyata, atau credential di layar.
