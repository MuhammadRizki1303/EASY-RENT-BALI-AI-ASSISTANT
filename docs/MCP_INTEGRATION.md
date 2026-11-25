# MCP Integration

## Transport dan data

Backend menggunakan official `@modelcontextprotocol/sdk` dan membuat dua proses
MCP terpisah dengan stdio. `McpClientManager` melakukan tool discovery,
memetakan owner setiap tool, mengubah schema input menjadi definisi tool
OpenRouter-compatible, meneruskan panggilan, dan menerapkan timeout 15 detik.
Backend tidak mengganti komunikasi MCP dengan pemanggilan service JavaScript
langsung.

Kedua server membaca database yang sama melalui `DATABASE_URL`. Server A membuka
SQLite read-only dan mengaktifkan `query_only`; server B adalah satu-satunya
MCP server dengan operasi booking write. Pada development, hasil inventaris
menandai `dataSource: "development-sample-data"`. Pada production tanpa
`SEED_DEVELOPMENT_DATA=true`, labelnya `"database"`; operator tetap wajib
memverifikasi asal dan kebenaran record inventory.

## MCP Server A — `easy-rent-inventory-server`

Server read-only ini menyediakan tiga tool. Output sukses tersedia sebagai
`structuredContent` dan juga JSON dalam `content`. Record kendaraan mengikuti
kolom tabel `vehicles` pada migration SQLite.

### `search_vehicles`

Semua field berikut opsional. Filter digabungkan dengan AND; pencarian
brand/model/vehicle type tidak case-sensitive.

| Field             | Tipe                   | Batas                           |
| ----------------- | ---------------------- | ------------------------------- |
| `brand`           | string                 | setelah trim minimal 1 karakter |
| `model`           | string                 | setelah trim minimal 1 karakter |
| `vehicle_type`    | string                 | setelah trim minimal 1 karakter |
| `transmission`    | `MANUAL` / `AUTOMATIC` | enum                            |
| `min_seats`       | integer                | positif                         |
| `max_daily_price` | integer                | tidak negatif                   |

Contoh input:

```json
{ "brand": "Toyota", "model": "Avanza", "min_seats": 7 }
```

Bentuk output sukses:

```json
{
  "dataSource": "development-sample-data",
  "count": 1,
  "vehicles": [{ "id": "DEV-TOYOTA-AVANZA", "brand": "Toyota", "model": "Avanza" }]
}
```

Contoh tersebut hanya menggambarkan bentuk development sample. Bukan bukti
inventaris aktual atau hasil query yang baru dijalankan.

### `get_vehicle_details`

Input wajib: `vehicle_id` (string tidak kosong).

```json
{
  "dataSource": "development-sample-data",
  "found": true,
  "vehicle": { "id": "DEV-TOYOTA-AVANZA", "brand": "Toyota", "model": "Avanza" }
}
```

ID yang tidak ditemukan menghasilkan `isError: true` dengan
`structuredContent: { "found": false, "vehicleId": "...", "reason": "Vehicle not found" }`.

### `check_vehicle_availability`

Input wajib:

| Field        | Tipe   | Validasi                                    |
| ------------ | ------ | ------------------------------------------- |
| `vehicle_id` | string | tidak kosong                                |
| `start_date` | string | tanggal kalender valid `YYYY-MM-DD`         |
| `end_date`   | string | tanggal kalender valid, harus setelah start |

Bentuk output sukses:

```json
{
  "dataSource": "development-sample-data",
  "vehicle": { "id": "DEV-TOYOTA-AVANZA" },
  "requestedDates": { "startDate": "2099-06-10", "endDate": "2099-06-12" },
  "available": true,
  "reason": "No active booking conflicts with the requested period.",
  "conflicts": []
}
```

Pemeriksaan menggunakan booking `PENDING` dan `CONFIRMED`; batas akhir sewa
bersifat eksklusif dalam pemeriksaan overlap. Rentang tanggal/ID tidak valid
ditandai sebagai error tool.

### Jaminan read-only

Server A hanya mendaftarkan tiga tool baca, membuka SQLite dengan opsi
`readonly`, dan mengatur `query_only = ON`. Tidak ada tool untuk membuat,
mengubah, atau membatalkan booking.

## MCP Server B — `easy-rent-booking-server`

Server booking memakai koneksi SQLite writable. Semua input divalidasi dengan
Zod, SQL diparameterisasi, dan perubahan dilakukan di transaksi. Hanya booking
berstatus `PENDING` yang dapat diubah atau dibatalkan. Record cancel tidak
dihapus.

### `create_booking`

Field wajib: `customer_name`, `customer_phone`, `vehicle_id`, `start_date`,
`end_date`, `pickup_location`, `return_location`. `notes` opsional (maksimum
1000 karakter; default string kosong).

Server memeriksa kendaraan dan tanggal, mengecek overlap `PENDING`/`CONFIRMED`
di dalam transaksi, menghitung estimasi dari tarif harian × jumlah hari,
membuat referensi unik, lalu menyimpan status awal `PENDING`.

Bentuk hasil aktual dikembalikan sebagai:

```json
{
  "success": true,
  "persisted": true,
  "booking": {
    "booking_reference": "<dibuat-server>",
    "vehicle_id": "<vehicle-id>",
    "booking_status": "PENDING",
    "total_estimated_price": 0
  }
}
```

`<dibuat-server>` dan nilai harga di atas adalah placeholder bentuk skema,
bukan booking sungguhan.

### `get_booking`

Input wajib `booking_reference` (string 1–100 karakter). Output sukses:
`{ "success": true, "booking": <record SQLite> }`. Tidak ditemukan menghasilkan
`isError: true`, alasan `Booking not found`.

### `update_booking`

Input wajib `booking_reference` dan field update opsional:
`customer_name`, `customer_phone`, `start_date`, `end_date`,
`pickup_location`, `return_location`, `notes`. Setiap nilai divalidasi; server
memeriksa status pending, tanggal dan overlap, menghitung ulang harga, lalu
mengubah record dalam transaksi. Output sukses berisi `{ "success": true,
"booking": <record SQLite> }`.

### `cancel_booking`

Input wajib `booking_reference` dan `cancellation_reason` (1–1000 karakter).
Hanya booking `PENDING` dapat dibatalkan. Status berubah menjadi `CANCELLED`;
catatan alasan ditambahkan pada `notes`. Output sukses berisi booking aktual.

## Konfirmasi operasi tulis melalui backend

Tool write tidak dijalankan hanya karena model meminta tool. Orchestrator
membuat pending action yang berisi tool, argumen, ringkasan, fingerprint, dan
conversation ID; action kedaluwarsa setelah 10 menit. Saat ada pending action,
pesan chat biasa tidak dapat menggantikannya atau mengubah argumen.

Klien mengirim keputusan eksplisit dari kontrol UI ke `POST /api/chat/confirm`
dengan `conversationId` dan `decision: "confirm" | "cancel"`. Backend mengambil
dan mengonsumsi pending action miliknya; hanya keputusan `confirm` yang
merutekan operasi MCP B. Keputusan `cancel` tidak mengubah database. Endpoint
menolak jika tidak ada action pending. Konfirmasi melalui teks biasa bukan
mekanisme persetujuan yang didukung saat ini.

## Pengujian dan alur aktual

`npm run mcp:test` menguji koneksi kedua server, discovery tujuh tool, routing,
dan pending confirmation. `npm run mcp-a:test` menguji search/detail/
availability, database, invalid ID/tanggal, konflik, dan read-only behavior.
`npm run mcp-b:test` menguji lifecycle booking, validasi, overlap, dan
persistence setelah process restart. Lihat
[docs/TESTING_REPORT.md](./TESTING_REPORT.md) untuk hasil yang tercatat.

Alur AI: backend mengirim definisi tool hasil discovery ke OpenRouter; tool call
non-write diarahkan ke MCP server pemilik. Tool write hanya menghasilkan
proposal pending. Setelah persetujuan lewat endpoint dedicated, backend
menjalankan aksi MCP dan mengembalikan hasil database sebenarnya.
