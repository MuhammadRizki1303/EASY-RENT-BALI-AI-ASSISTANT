import crypto from 'node:crypto';

export type BookingWriteTool =
  | 'create_booking'
  | 'confirm_booking'
  | 'update_booking'
  | 'cancel_booking'
  | 'create_payment'
  | 'mark_payment_paid'
  | 'refund_payment';

export interface PendingBookingAction {
  conversationId: string;
  toolName: BookingWriteTool;
  args: Record<string, unknown>;
  fingerprint: string;
  summary: string;
  createdAt: number;
}

export class PendingBookingActionManager {
  private readonly actions = new Map<string, PendingBookingAction>();
  private readonly ttlMs: number;

  constructor(ttlMs = 10 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  isWriteTool(toolName: string): toolName is BookingWriteTool {
    return (
      toolName === 'create_booking' ||
      toolName === 'confirm_booking' ||
      toolName === 'update_booking' ||
      toolName === 'cancel_booking' ||
      toolName === 'create_payment' ||
      toolName === 'mark_payment_paid' ||
      toolName === 'refund_payment'
    );
  }

  create(
    conversationId: string,
    toolName: BookingWriteTool,
    args: Record<string, unknown>,
    estimatedTotalPrice?: number,
  ): PendingBookingAction {
    const canonical = JSON.stringify(args, Object.keys(args).sort());
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${toolName}:${canonical}`)
      .digest('hex');
    const action: PendingBookingAction = {
      conversationId,
      toolName,
      args,
      fingerprint,
      summary: this.describe(toolName, args, estimatedTotalPrice),
      createdAt: Date.now(),
    };
    this.actions.set(conversationId, action);
    return action;
  }

  confirm(conversationId: string, message: string): PendingBookingAction | undefined {
    const action = this.actions.get(conversationId);
    if (!action) return undefined;
    if (Date.now() - action.createdAt > this.ttlMs) {
      this.actions.delete(conversationId);
      return undefined;
    }

    const normalized = message.trim().toLowerCase();
    const accepted =
      normalized === 'ya' ||
      normalized === 'yes' ||
      normalized === 'konfirmasi' ||
      normalized === 'saya konfirmasi' ||
      normalized === 'lanjutkan' ||
      normalized === 'bayar';
    if (!accepted) return undefined;

    this.actions.delete(conversationId);
    return action;
  }

  consume(conversationId: string): PendingBookingAction | undefined {
    const action = this.get(conversationId);
    if (action) this.actions.delete(conversationId);
    return action;
  }

  get(conversationId: string): PendingBookingAction | undefined {
    const action = this.actions.get(conversationId);
    if (action && Date.now() - action.createdAt > this.ttlMs) {
      this.actions.delete(conversationId);
      return undefined;
    }
    return action;
  }

  clear(conversationId: string): void {
    this.actions.delete(conversationId);
  }

  private describe(
    toolName: BookingWriteTool,
    args: Record<string, unknown>,
    estimatedTotalPrice?: number,
  ): string {
    if (toolName === 'create_booking') {
      const lines = [
        'Tinjau booking berikut (belum disimpan):',
        `Nama: ${String(args.customer_name ?? '-')}`,
        `Telepon: ${String(args.customer_phone ?? '-')}`,
        `Kendaraan: ${String(args.vehicle_id ?? '-')}`,
        `Periode: ${String(args.start_date ?? '-')} sampai ${String(args.end_date ?? '-')}`,
        `Pickup: ${String(args.pickup_location ?? '-')}`,
        `Pengembalian: ${String(args.return_location ?? '-')}`,
        estimatedTotalPrice === undefined
          ? 'Estimasi total: tidak tersedia'
          : `Estimasi total: Rp ${new Intl.NumberFormat('id-ID').format(estimatedTotalPrice)}`,
      ];
      if (typeof args.notes === 'string' && args.notes.trim()) {
        lines.push(`Catatan: ${args.notes.trim()}`);
      }
      return lines.join('\n');
    }
    if (toolName === 'confirm_booking') {
      return `Konfirmasi booking ${String(args.booking_reference ?? '-')}. Status akan berubah menjadi CONFIRMED.`;
    }
    if (toolName === 'create_payment') {
      const amount = typeof args.amount === 'number'
        ? `Rp ${new Intl.NumberFormat('id-ID').format(args.amount)}`
        : String(args.amount ?? '-');
      return [
        'Tinjau pembuatan pembayaran:',
        `Booking Ref: ${String(args.booking_reference ?? '-')}`,
        `Jumlah: ${amount}`,
        `Metode Pembayaran: ${String(args.payment_method ?? '-')}`,
        `Tipe: ${String(args.payment_type ?? 'FULL')}`,
      ].join('\n');
    }
    if (toolName === 'mark_payment_paid') {
      return `Tandai pembayaran ${String(args.payment_reference ?? '-')} sebagai LUNAS (PAID).`;
    }
    if (toolName === 'refund_payment') {
      return `Pengembalian dana (Refund) untuk pembayaran ${String(args.payment_reference ?? '-')}. Catatan: ${String(args.notes ?? '-')}`;
    }
    if (toolName === 'update_booking') {
      const updates = Object.entries(args)
        .filter(([key]) => key !== 'booking_reference')
        .map(([key, value]) => `${key}: ${String(value)}`);
      return [
        `Tinjau perubahan booking ${String(args.booking_reference ?? '-')}:`,
        ...(updates.length > 0 ? updates : ['Tidak ada perubahan yang diusulkan.']),
      ].join('\n');
    }
    return [
      `Tinjau pembatalan booking ${String(args.booking_reference ?? '-')}:`,
      `Alasan: ${String(args.cancellation_reason ?? '-')}`,
    ].join('\n');
  }
}
