import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookingRow {
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

interface PaymentRow {
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

interface VehicleRow {
  id: string;
  daily_price: number;
}

// ─── Database ─────────────────────────────────────────────────────────────────

export function resolveDatabasePath(databasePath?: string): string {
  if (databasePath) return path.resolve(databasePath);
  const configured = process.env.DATABASE_URL?.startsWith('file:')
    ? process.env.DATABASE_URL.slice(5)
    : undefined;
  if (configured) return path.resolve(process.cwd(), configured);
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../backend/data/easy-rent-bali.db',
  );
}

export function openBookingDatabase(databasePath?: string) {
  const resolvedPath = resolveDatabasePath(databasePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`SQLite database not found: ${resolvedPath}`);
  }
  const database = new Database(resolvedPath);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');
  return database;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Date must use YYYY-MM-DD format');
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Date is invalid');
  }
}

function validatePeriod(startDate: string, endDate: string): number {
  validateIsoDate(startDate);
  validateIsoDate(endDate);
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (days < 1) throw new Error('Start date must be before end date');
  return days;
}

function getBookingByRef(database: Database.Database, reference: string): BookingRow | undefined {
  return database
    .prepare('SELECT * FROM bookings WHERE booking_reference = ?')
    .get(reference) as BookingRow | undefined;
}

function getPaymentByRef(database: Database.Database, reference: string): PaymentRow | undefined {
  return database
    .prepare('SELECT * FROM payments WHERE payment_reference = ?')
    .get(reference) as PaymentRow | undefined;
}

function getPaymentsForBooking(database: Database.Database, bookingRef: string): PaymentRow[] {
  return database
    .prepare(
      `SELECT * FROM payments WHERE booking_reference = ? ORDER BY created_at ASC`,
    )
    .all(bookingRef) as PaymentRow[];
}

/** Check if vehicle has overlapping PENDING or CONFIRMED bookings, optionally excluding one booking id. */
function hasOverlap(
  database: Database.Database,
  vehicleId: string,
  startDate: string,
  endDate: string,
  excludeBookingId?: number,
): boolean {
  const conflict = database
    .prepare(
      `
      SELECT 1
      FROM bookings
      WHERE vehicle_id = ?
        AND booking_status IN ('PENDING', 'CONFIRMED')
        AND start_date < ?
        AND end_date > ?
        AND (? IS NULL OR id != ?)
      LIMIT 1
    `,
    )
    .get(vehicleId, endDate, startDate, excludeBookingId ?? null, excludeBookingId ?? null);
  return Boolean(conflict);
}

/** Generate next sequential booking reference for the current year. */
function nextBookingReference(database: Database.Database): string {
  const year = new Date().getFullYear();
  const prefix = `ERB-${year}-`;
  // Use CAST to ensure numeric ordering, not lexicographic.
  const latest = database
    .prepare(
      `SELECT booking_reference FROM bookings
       WHERE booking_reference LIKE ?
       ORDER BY CAST(SUBSTR(booking_reference, ?) AS INTEGER) DESC LIMIT 1`,
    )
    .get(`${prefix}%`, prefix.length + 1) as { booking_reference: string } | undefined;
  const nextNumber = latest
    ? Number(latest.booking_reference.slice(prefix.length)) + 1
    : 1;
  return `${prefix}${String(nextNumber).padStart(5, '0')}`;
}

/** Generate next sequential payment reference. */
function nextPaymentReference(database: Database.Database): string {
  const year = new Date().getFullYear();
  const prefix = `PAY-${year}-`;
  const latest = database
    .prepare(
      `SELECT payment_reference FROM payments
       WHERE payment_reference LIKE ?
       ORDER BY CAST(SUBSTR(payment_reference, ?) AS INTEGER) DESC LIMIT 1`,
    )
    .get(`${prefix}%`, prefix.length + 1) as { payment_reference: string } | undefined;
  const nextNumber = latest
    ? Number(latest.payment_reference.slice(prefix.length)) + 1
    : 1;
  return `${prefix}${String(nextNumber).padStart(5, '0')}`;
}

function findVehicleInDb(database: Database.Database, vehicleIdOrName: string): VehicleRow | undefined {
  const trimmed = vehicleIdOrName.trim();
  let row = database.prepare('SELECT id, daily_price FROM vehicles WHERE id = ?').get(trimmed) as VehicleRow | undefined;
  if (row) return row;

  row = database.prepare('SELECT id, daily_price FROM vehicles WHERE LOWER(id) = LOWER(?)').get(trimmed) as VehicleRow | undefined;
  if (row) return row;

  row = database.prepare('SELECT id, daily_price FROM vehicles WHERE LOWER(model) = LOWER(?)').get(trimmed) as VehicleRow | undefined;
  if (row) return row;

  row = database.prepare("SELECT id, daily_price FROM vehicles WHERE LOWER(brand || ' ' || model) = LOWER(?)").get(trimmed) as VehicleRow | undefined;
  if (row) return row;

  row = database.prepare("SELECT id, daily_price FROM vehicles WHERE LOWER(model) LIKE LOWER(?) OR LOWER(id) LIKE LOWER(?)").get(`%${trimmed}%`, `%${trimmed}%`) as VehicleRow | undefined;
  return row;
}

function toolError(reason: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: reason }],
    structuredContent: { success: false, reason },
  };
}

/** Summarise total paid amount for a booking. */
function paidTotal(database: Database.Database, bookingRef: string): number {
  const row = database
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM payments
       WHERE booking_reference = ? AND payment_status = 'PAID'`,
    )
    .get(bookingRef) as { total: number };
  return row.total;
}

// ─── Server ───────────────────────────────────────────────────────────────────

export function createBookingServer(databasePath?: string) {
  const database = openBookingDatabase(databasePath);

  const server = new McpServer(
    {
      name: 'easy-rent-booking-server',
      version: '2.0.0',
    },
    {
      instructions:
        'Booking and payment management tools for Easy Rent Bali. ' +
        'Only this server may write booking or payment records. ' +
        'Booking flow: create_booking → confirm_booking → create_payment.',
    },
  );

  // ── create_booking ─────────────────────────────────────────────────────────
  server.registerTool(
    'create_booking',
    {
      title: 'Create Booking',
      description:
        'Create a PENDING booking after validating the vehicle and rental period. ' +
        'The booking must be confirmed with confirm_booking before payment.',
      inputSchema: {
        customer_name: z.string().trim().min(1).max(120),
        customer_phone: z.string().trim().min(8).max(30),
        vehicle_id: z.string().trim().min(1),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        pickup_location: z.string().trim().min(1).max(200),
        return_location: z.string().trim().min(1).max(200),
        notes: z.string().trim().max(1000).optional().default(''),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const rentalDays = validatePeriod(args.start_date, args.end_date);
        const vehicle = findVehicleInDb(database, args.vehicle_id);
        if (!vehicle) return toolError(`Vehicle not found: ${args.vehicle_id}`);
        const resolvedVehicleId = vehicle.id;

        const create = database.transaction(() => {
          if (hasOverlap(database, resolvedVehicleId, args.start_date, args.end_date)) {
            throw new Error('Vehicle is unavailable for the selected period');
          }

          const reference = nextBookingReference(database);
          const result = database
            .prepare(
              `
              INSERT INTO bookings (
                booking_reference, customer_name, customer_phone, vehicle_id,
                start_date, end_date, pickup_location, return_location, notes,
                total_estimated_price, booking_status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
              `,
            )
            .run(
              reference,
              args.customer_name,
              args.customer_phone,
              resolvedVehicleId,
              args.start_date,
              args.end_date,
              args.pickup_location,
              args.return_location,
              args.notes || null,
              rentalDays * vehicle.daily_price,
            );

          return (
            getBookingByRef(database, reference) ||
            (database
              .prepare('SELECT * FROM bookings WHERE id = ?')
              .get(result.lastInsertRowid) as BookingRow)
          );
        });

        const booking = create();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, booking }),
            },
          ],
          structuredContent: { success: true, booking },
        };
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Unable to create booking');
      }
    },
  );

  // ── confirm_booking ────────────────────────────────────────────────────────
  server.registerTool(
    'confirm_booking',
    {
      title: 'Confirm Booking',
      description:
        'Confirm a PENDING booking, changing its status to CONFIRMED. ' +
        'Must be called after the customer has agreed to proceed. ' +
        'After confirming, use create_payment to record the customer payment.',
      inputSchema: {
        booking_reference: z.string().trim().min(1).max(100),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ booking_reference }) => {
      try {
        const confirm = database.transaction(() => {
          const booking = getBookingByRef(database, booking_reference);
          if (!booking) throw new Error('Booking not found');
          if (booking.booking_status === 'CONFIRMED') return booking; // already confirmed → idempotent
          if (booking.booking_status !== 'PENDING') {
            throw new Error(
              `Booking cannot be confirmed because its status is ${booking.booking_status}`,
            );
          }

          // Re-check availability in case another booking snuck in.
          if (
            hasOverlap(database, booking.vehicle_id, booking.start_date, booking.end_date, booking.id)
          ) {
            throw new Error('Vehicle is no longer available for this booking period');
          }

          database
            .prepare(
              `UPDATE bookings SET booking_status = 'CONFIRMED', updated_at = datetime('now')
               WHERE id = ? AND booking_status = 'PENDING'`,
            )
            .run(booking.id);

          return getBookingByRef(database, booking_reference);
        });

        const booking = confirm();
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, booking }) }],
          structuredContent: { success: true, booking },
        };
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Unable to confirm booking');
      }
    },
  );

  // ── get_booking ────────────────────────────────────────────────────────────
  server.registerTool(
    'get_booking',
    {
      title: 'Get Booking',
      description:
        'Retrieve a persisted booking by booking reference, including payment summary.',
      inputSchema: {
        booking_reference: z.string().trim().min(1).max(100),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ booking_reference }) => {
      const booking = getBookingByRef(database, booking_reference);
      if (!booking) return toolError('Booking not found');

      const payments = getPaymentsForBooking(database, booking_reference);
      const totalPaid = payments
        .filter((p) => p.payment_status === 'PAID')
        .reduce((sum, p) => sum + p.amount, 0);
      const remainingAmount = Math.max(0, booking.total_estimated_price - totalPaid);
      const isFullyPaid = remainingAmount === 0 && booking.total_estimated_price > 0;

      const result = {
        success: true,
        booking,
        payments,
        paymentSummary: {
          totalEstimated: booking.total_estimated_price,
          totalPaid,
          remainingAmount,
          isFullyPaid,
        },
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  // ── update_booking ─────────────────────────────────────────────────────────
  server.registerTool(
    'update_booking',
    {
      title: 'Update Booking',
      description: 'Update permitted fields on a PENDING booking (dates, locations, contact info).',
      inputSchema: {
        booking_reference: z.string().trim().min(1).max(100),
        customer_name: z.string().trim().min(1).max(120).optional(),
        customer_phone: z.string().trim().min(8).max(30).optional(),
        start_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        end_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        pickup_location: z.string().trim().min(1).max(200).optional(),
        return_location: z.string().trim().min(1).max(200).optional(),
        notes: z.string().trim().max(1000).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const update = database.transaction(() => {
          const booking = getBookingByRef(database, args.booking_reference);
          if (!booking) throw new Error('Booking not found');
          if (booking.booking_status !== 'PENDING') {
            throw new Error(
              `Only PENDING bookings can be updated (current status: ${booking.booking_status})`,
            );
          }

          const startDate = args.start_date ?? booking.start_date;
          const endDate = args.end_date ?? booking.end_date;
          const rentalDays = validatePeriod(startDate, endDate);

          if (hasOverlap(database, booking.vehicle_id, startDate, endDate, booking.id)) {
            throw new Error('Vehicle is unavailable for the selected period');
          }

          const vehicle = database
            .prepare('SELECT id, daily_price FROM vehicles WHERE id = ?')
            .get(booking.vehicle_id) as VehicleRow | undefined;
          if (!vehicle) throw new Error('Vehicle not found');

          database
            .prepare(
              `
              UPDATE bookings SET
                customer_name = ?,
                customer_phone = ?,
                start_date = ?,
                end_date = ?,
                pickup_location = ?,
                return_location = ?,
                notes = ?,
                total_estimated_price = ?,
                updated_at = datetime('now')
              WHERE id = ? AND booking_status = 'PENDING'
              `,
            )
            .run(
              args.customer_name ?? booking.customer_name,
              args.customer_phone ?? booking.customer_phone,
              startDate,
              endDate,
              args.pickup_location ?? booking.pickup_location,
              args.return_location ?? booking.return_location,
              args.notes ?? booking.notes,
              rentalDays * vehicle.daily_price,
              booking.id,
            );

          return getBookingByRef(database, args.booking_reference);
        });

        const booking = update();
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, booking }) }],
          structuredContent: { success: true, booking },
        };
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Unable to update booking');
      }
    },
  );

  // ── cancel_booking ─────────────────────────────────────────────────────────
  server.registerTool(
    'cancel_booking',
    {
      title: 'Cancel Booking',
      description:
        'Cancel a PENDING or CONFIRMED booking. ' +
        'If the booking has PAID payments, those should be refunded separately using refund_payment.',
      inputSchema: {
        booking_reference: z.string().trim().min(1).max(100),
        cancellation_reason: z.string().trim().min(1).max(1000),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const cancel = database.transaction(() => {
          const booking = getBookingByRef(database, args.booking_reference);
          if (!booking) throw new Error('Booking not found');
          if (booking.booking_status === 'CANCELLED') return booking; // idempotent
          if (!['PENDING', 'CONFIRMED'].includes(booking.booking_status)) {
            throw new Error(`Booking cannot be cancelled (status: ${booking.booking_status})`);
          }

          const cancellationNote = `Cancellation reason: ${args.cancellation_reason}`;
          const updatedNotes = booking.notes
            ? `${booking.notes}\n${cancellationNote}`
            : cancellationNote;

          database
            .prepare(
              `UPDATE bookings SET
                booking_status = 'CANCELLED',
                notes = ?,
                updated_at = datetime('now')
               WHERE id = ?`,
            )
            .run(updatedNotes, booking.id);

          return getBookingByRef(database, args.booking_reference);
        });

        const booking = cancel();
        const payments = getPaymentsForBooking(database, args.booking_reference);
        const paidAmount = payments
          .filter((p) => p.payment_status === 'PAID')
          .reduce((sum, p) => sum + p.amount, 0);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                booking,
                refundRequired: paidAmount > 0,
                paidAmount,
                refundNote:
                  paidAmount > 0
                    ? `Customer has paid Rp ${paidAmount.toLocaleString('id-ID')}. Use refund_payment for each paid payment to process refunds.`
                    : null,
              }),
            },
          ],
          structuredContent: {
            success: true,
            booking,
            refundRequired: paidAmount > 0,
            paidAmount,
          },
        };
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Unable to cancel booking');
      }
    },
  );

  // ── create_payment ─────────────────────────────────────────────────────────
  server.registerTool(
    'create_payment',
    {
      title: 'Create Payment',
      description:
        'Record a customer payment for a CONFIRMED booking. ' +
        'Payment type FULL covers the entire amount. ' +
        'DEPOSIT is a partial upfront payment; REMAINING covers the outstanding balance. ' +
        'The payment starts as PENDING until marked PAID by the operator.',
      inputSchema: {
        booking_reference: z.string().trim().min(1).max(100),
        amount: z.coerce.number().int().positive(),
        payment_method: z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'QRIS', 'OVO', 'GOPAY', 'DANA']),
        payment_type: z.enum(['FULL', 'DEPOSIT', 'REMAINING']).default('FULL'),
        notes: z.string().trim().max(500).optional().default(''),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const create = database.transaction(() => {
          const booking = getBookingByRef(database, args.booking_reference);
          if (!booking) throw new Error('Booking not found');
          if (booking.booking_status === 'CANCELLED') {
            throw new Error('Cannot create payment for a cancelled booking');
          }
          // If booking is still PENDING, automatically confirm it upon creating payment
          if (booking.booking_status === 'PENDING') {
            database
              .prepare(
                `UPDATE bookings SET booking_status = 'CONFIRMED', updated_at = datetime('now')
                 WHERE id = ? AND booking_status = 'PENDING'`,
              )
              .run(booking.id);
          }

          // Guard: prevent overpayment
          const alreadyPaid = paidTotal(database, args.booking_reference);
          const remaining = booking.total_estimated_price - alreadyPaid;
          if (remaining <= 0) {
            throw new Error('This booking is already fully paid');
          }
          if (args.amount > remaining) {
            throw new Error(
              `Payment amount (Rp ${args.amount.toLocaleString('id-ID')}) exceeds the remaining balance (Rp ${remaining.toLocaleString('id-ID')})`,
            );
          }

          const reference = nextPaymentReference(database);
          const result = database
            .prepare(
              `INSERT INTO payments (
                payment_reference, booking_reference, amount,
                payment_method, payment_status, payment_type, notes
              ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
            )
            .run(
              reference,
              args.booking_reference,
              args.amount,
              args.payment_method,
              args.payment_type,
              args.notes || null,
            );

          return (
            getPaymentByRef(database, reference) ||
            (database
              .prepare('SELECT * FROM payments WHERE id = ?')
              .get(result.lastInsertRowid) as PaymentRow)
          );
        });

        const payment = create();
        const totalPaidNow = paidTotal(database, args.booking_reference);
        const booking = getBookingByRef(database, args.booking_reference);
        const remaining = Math.max(0, (booking?.total_estimated_price ?? 0) - totalPaidNow);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                payment,
                paymentSummary: {
                  totalEstimated: booking?.total_estimated_price ?? 0,
                  totalPaid: totalPaidNow,
                  remainingAmount: remaining,
                  isFullyPaid: remaining === 0,
                },
                nextStep:
                  'Payment is PENDING. Mark it as PAID using mark_payment_paid once the customer completes payment.',
              }),
            },
          ],
          structuredContent: {
            success: true,
            payment,
            paymentSummary: {
              totalEstimated: booking?.total_estimated_price ?? 0,
              totalPaid: totalPaidNow,
              remainingAmount: remaining,
              isFullyPaid: remaining === 0,
            },
          },
        };
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Unable to create payment');
      }
    },
  );

  // ── mark_payment_paid ──────────────────────────────────────────────────────
  server.registerTool(
    'mark_payment_paid',
    {
      title: 'Mark Payment as Paid',
      description:
        'Mark a PENDING payment as PAID once the customer has completed the payment. ' +
        'This records the actual payment timestamp.',
      inputSchema: {
        payment_reference: z.string().trim().min(1).max(100),
        notes: z.string().trim().max(500).optional().default(''),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const markPaid = database.transaction(() => {
          const payment = getPaymentByRef(database, args.payment_reference);
          if (!payment) throw new Error('Payment not found');
          if (payment.payment_status === 'PAID') return payment; // idempotent
          if (payment.payment_status !== 'PENDING') {
            throw new Error(
              `Payment cannot be marked as paid (current status: ${payment.payment_status})`,
            );
          }

          const updatedNotes = args.notes
            ? payment.notes
              ? `${payment.notes}\n${args.notes}`
              : args.notes
            : payment.notes;

          database
            .prepare(
              `UPDATE payments SET
                payment_status = 'PAID',
                paid_at = datetime('now'),
                notes = ?,
                updated_at = datetime('now')
               WHERE id = ?`,
            )
            .run(updatedNotes, payment.id);

          // Ensure the booking status is CONFIRMED when paid
          database
            .prepare(
              `UPDATE bookings SET booking_status = 'CONFIRMED', updated_at = datetime('now')
               WHERE booking_reference = ? AND booking_status != 'CANCELLED'`,
            )
            .run(payment.booking_reference);

          return getPaymentByRef(database, args.payment_reference);
        });

        const payment = markPaid();
        const totalPaidNow = paidTotal(database, payment!.booking_reference);
        const booking = getBookingByRef(database, payment!.booking_reference);
        const remaining = Math.max(0, (booking?.total_estimated_price ?? 0) - totalPaidNow);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                payment,
                paymentSummary: {
                  totalEstimated: booking?.total_estimated_price ?? 0,
                  totalPaid: totalPaidNow,
                  remainingAmount: remaining,
                  isFullyPaid: remaining === 0,
                },
              }),
            },
          ],
          structuredContent: {
            success: true,
            payment,
            paymentSummary: {
              totalEstimated: booking?.total_estimated_price ?? 0,
              totalPaid: totalPaidNow,
              remainingAmount: remaining,
              isFullyPaid: remaining === 0,
            },
          },
        };
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Unable to mark payment as paid');
      }
    },
  );

  // ── refund_payment ─────────────────────────────────────────────────────────
  server.registerTool(
    'refund_payment',
    {
      title: 'Refund Payment',
      description:
        'Mark a PAID payment as REFUNDED (e.g. after a booking cancellation). ' +
        'Provide a reason for the refund in the notes field.',
      inputSchema: {
        payment_reference: z.string().trim().min(1).max(100),
        notes: z.string().trim().min(1).max(500),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const refund = database.transaction(() => {
          const payment = getPaymentByRef(database, args.payment_reference);
          if (!payment) throw new Error('Payment not found');
          if (payment.payment_status === 'REFUNDED') return payment; // idempotent
          if (payment.payment_status !== 'PAID') {
            throw new Error(
              `Only PAID payments can be refunded (current status: ${payment.payment_status})`,
            );
          }

          const updatedNotes = payment.notes
            ? `${payment.notes}\nRefund: ${args.notes}`
            : `Refund: ${args.notes}`;

          database
            .prepare(
              `UPDATE payments SET
                payment_status = 'REFUNDED',
                notes = ?,
                updated_at = datetime('now')
               WHERE id = ?`,
            )
            .run(updatedNotes, payment.id);

          return getPaymentByRef(database, args.payment_reference);
        });

        const payment = refund();
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, payment }) }],
          structuredContent: { success: true, payment },
        };
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Unable to refund payment');
      }
    },
  );

  // ── get_payment_status ─────────────────────────────────────────────────────
  server.registerTool(
    'get_payment_status',
    {
      title: 'Get Payment Status',
      description:
        'Retrieve full payment details and payment summary for a booking by booking reference.',
      inputSchema: {
        booking_reference: z.string().trim().min(1).max(100),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ booking_reference }) => {
      const booking = getBookingByRef(database, booking_reference);
      if (!booking) return toolError('Booking not found');

      const payments = getPaymentsForBooking(database, booking_reference);
      const totalPaid = payments
        .filter((p) => p.payment_status === 'PAID')
        .reduce((sum, p) => sum + p.amount, 0);
      const remainingAmount = Math.max(0, booking.total_estimated_price - totalPaid);

      const result = {
        success: true,
        bookingReference: booking_reference,
        bookingStatus: booking.booking_status,
        payments,
        paymentSummary: {
          totalEstimated: booking.total_estimated_price,
          totalPaid,
          remainingAmount,
          isFullyPaid: remainingAmount === 0 && booking.total_estimated_price > 0,
          paymentCount: payments.length,
        },
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  return { server, database };
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

async function main() {
  const { server, database } = createBookingServer();
  const transport = new StdioServerTransport();
  server.server.onclose = () => database.close();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Booking MCP startup failed');
  process.exit(1);
});
