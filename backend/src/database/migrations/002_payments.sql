-- Payment records linked to confirmed bookings
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_reference TEXT NOT NULL UNIQUE,
  booking_reference TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL
    CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'QRIS', 'OVO', 'GOPAY', 'DANA')),
  payment_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (payment_status IN ('PENDING', 'PAID', 'REFUNDED', 'FAILED')),
  payment_type TEXT NOT NULL DEFAULT 'FULL'
    CHECK (payment_type IN ('FULL', 'DEPOSIT', 'REMAINING')),
  notes TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (booking_reference) REFERENCES bookings(booking_reference)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_reference);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(payment_reference);
