import type Database from 'better-sqlite3';

export interface VehicleRow {
  id: string;
  brand: string;
  model: string;
  year: number;
  vehicle_type: string;
  transmission: 'MANUAL' | 'AUTOMATIC';
  seats: number;
  fuel_type: string;
  daily_price: number;
  description: string;
  features: string;
  image_url: string | null;
  availability_status: 'AVAILABLE' | 'UNAVAILABLE';
  created_at: string;
  updated_at: string;
}

export interface BookingRow {
  id: number;
  booking_reference: string;
  customer_name: string;
  customer_phone: string;
  vehicle_id: string;
  start_date: string;
  end_date: string;
  pickup_location: string;
  return_location: string;
  notes: string | null;
  total_estimated_price: number;
  booking_status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: number;
  payment_reference: string;
  booking_reference: string;
  amount: number;
  payment_method: string;
  payment_status: 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';
  payment_type: 'FULL' | 'DEPOSIT' | 'REMAINING';
  notes: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBookingInput {
  customerName: string;
  customerPhone: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  pickupLocation: string;
  returnLocation: string;
  notes?: string;
}

function validateIsoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Date must use YYYY-MM-DD format');
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Date is invalid');
  }
  return value;
}

function calendarDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (days < 1) throw new Error('Start date must be before end date');
  return days;
}

export function listVehicles(database: Database.Database): VehicleRow[] {
  return database.prepare('SELECT * FROM vehicles ORDER BY brand, model').all() as VehicleRow[];
}

export function getVehicle(database: Database.Database, vehicleId: string): VehicleRow | undefined {
  return database.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId) as
    VehicleRow | undefined;
}

export function isVehicleAvailable(
  database: Database.Database,
  vehicleId: string,
  startDate: string,
  endDate: string,
): boolean {
  const overlap = database
    .prepare(
      `
      SELECT 1
      FROM bookings
      WHERE vehicle_id = ?
        AND booking_status IN ('PENDING', 'CONFIRMED')
        AND start_date < ?
        AND end_date > ?
      LIMIT 1
    `,
    )
    .get(vehicleId, endDate, startDate);
  return !overlap;
}

export function createBooking(database: Database.Database, input: CreateBookingInput): BookingRow {
  const startDate = validateIsoDate(input.startDate);
  const endDate = validateIsoDate(input.endDate);
  const rentalDays = calendarDays(startDate, endDate);

  if (!input.customerName.trim()) throw new Error('Customer name is required');
  if (!input.customerPhone.trim()) throw new Error('Customer phone is required');
  if (!input.pickupLocation.trim()) throw new Error('Pickup location is required');
  if (!input.returnLocation.trim()) throw new Error('Return location is required');

  const vehicle = getVehicle(database, input.vehicleId);
  if (!vehicle) throw new Error('Vehicle not found');

  const create = database.transaction(() => {
    if (!isVehicleAvailable(database, input.vehicleId, startDate, endDate)) {
      throw new Error('Vehicle is unavailable for the selected period');
    }

    const year = new Date().getFullYear();
    const prefix = `ERB-${year}-`;
    const latest = database
      .prepare(
        `SELECT booking_reference FROM bookings
         WHERE booking_reference LIKE ?
         ORDER BY CAST(SUBSTR(booking_reference, ?) AS INTEGER) DESC LIMIT 1`,
      )
      .get(`${prefix}%`, prefix.length + 1) as { booking_reference: string } | undefined;
    const nextNumber = latest ? Number(latest.booking_reference.slice(prefix.length)) + 1 : 1;
    const bookingReference = `${prefix}${String(nextNumber).padStart(5, '0')}`;
    const totalEstimatedPrice = rentalDays * vehicle.daily_price;

    const insert = database.prepare(`
      INSERT INTO bookings (
        booking_reference, customer_name, customer_phone, vehicle_id,
        start_date, end_date, pickup_location, return_location, notes,
        total_estimated_price, booking_status
      ) VALUES (
        @bookingReference, @customerName, @customerPhone, @vehicleId,
        @startDate, @endDate, @pickupLocation, @returnLocation, @notes,
        @totalEstimatedPrice, 'PENDING'
      )
    `);

    const result = insert.run({
      bookingReference,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      vehicleId: input.vehicleId,
      startDate,
      endDate,
      pickupLocation: input.pickupLocation.trim(),
      returnLocation: input.returnLocation.trim(),
      notes: input.notes?.trim() || null,
      totalEstimatedPrice,
    });

    return database
      .prepare('SELECT * FROM bookings WHERE id = ?')
      .get(result.lastInsertRowid) as BookingRow;
  });

  return create();
}

export function getBooking(
  database: Database.Database,
  bookingReference: string,
): BookingRow | undefined {
  return database
    .prepare('SELECT * FROM bookings WHERE booking_reference = ?')
    .get(bookingReference) as BookingRow | undefined;
}

export function getPaymentsForBooking(
  database: Database.Database,
  bookingReference: string,
): PaymentRow[] {
  return database
    .prepare('SELECT * FROM payments WHERE booking_reference = ? ORDER BY created_at ASC')
    .all(bookingReference) as PaymentRow[];
}

export function getPayment(
  database: Database.Database,
  paymentReference: string,
): PaymentRow | undefined {
  return database
    .prepare('SELECT * FROM payments WHERE payment_reference = ?')
    .get(paymentReference) as PaymentRow | undefined;
}

export function ensureConversation(database: Database.Database, conversationId: string): void {
  database
    .prepare(
      `INSERT INTO conversations(conversation_id) VALUES (?)
       ON CONFLICT(conversation_id) DO UPDATE SET updated_at = datetime('now')`,
    )
    .run(conversationId);
}

export function addMessage(
  database: Database.Database,
  conversationId: string,
  role: 'system' | 'user' | 'assistant' | 'tool',
  content: string,
): void {
  ensureConversation(database, conversationId);
  database
    .prepare('INSERT INTO messages(conversation_id, role, content) VALUES (?, ?, ?)')
    .run(conversationId, role, content);
}

export function getMessages(
  database: Database.Database,
  conversationId: string,
  limit = 30,
): { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }[] {
  ensureConversation(database, conversationId);
  const rows = database
    .prepare(
      `SELECT role, content
       FROM messages
       WHERE conversation_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(conversationId, limit) as {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
  }[];
  return rows.reverse();
}

export interface UserRow {
  id: number;
  username: string;
  name: string;
  role: 'user' | 'admin';
  created_at: string;
}

export function findUser(
  database: Database.Database,
  username: string,
): (UserRow & { password?: string }) | undefined {
  return database
    .prepare('SELECT id, username, password, name, role, created_at FROM users WHERE username = ?')
    .get(username) as (UserRow & { password?: string }) | undefined;
}

export function listAllBookings(database: Database.Database): (BookingRow & { paid_total?: number })[] {
  return database
    .prepare(
      `SELECT b.*, 
        COALESCE((SELECT SUM(amount) FROM payments WHERE booking_reference = b.booking_reference AND payment_status = 'PAID'), 0) AS paid_total
       FROM bookings b 
       ORDER BY b.created_at DESC`
    )
    .all() as (BookingRow & { paid_total?: number })[];
}

export function listAllPayments(database: Database.Database): PaymentRow[] {
  return database
    .prepare('SELECT * FROM payments ORDER BY created_at DESC')
    .all() as PaymentRow[];
}

export function updateVehicleStatus(
  database: Database.Database,
  vehicleId: string,
  status: 'AVAILABLE' | 'UNAVAILABLE'
): VehicleRow | undefined {
  database
    .prepare("UPDATE vehicles SET availability_status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, vehicleId);
  return getVehicle(database, vehicleId);
}

export function updateBookingStatus(
  database: Database.Database,
  bookingReference: string,
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
): BookingRow | undefined {
  database
    .prepare("UPDATE bookings SET booking_status = ?, updated_at = datetime('now') WHERE booking_reference = ?")
    .run(status, bookingReference);
  return getBooking(database, bookingReference);
}

export function deleteConversation(database: Database.Database, conversationId: string): void {
  database.prepare('DELETE FROM conversations WHERE conversation_id = ?').run(conversationId);
}
