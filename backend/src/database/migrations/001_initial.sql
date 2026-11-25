CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  vehicle_type TEXT NOT NULL,
  transmission TEXT NOT NULL CHECK (transmission IN ('MANUAL', 'AUTOMATIC')),
  seats INTEGER NOT NULL CHECK (seats > 0),
  fuel_type TEXT NOT NULL,
  daily_price INTEGER NOT NULL CHECK (daily_price >= 0),
  description TEXT NOT NULL,
  features TEXT NOT NULL DEFAULT '[]',
  image_url TEXT,
  availability_status TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK (availability_status IN ('AVAILABLE', 'UNAVAILABLE')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_reference TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  pickup_location TEXT NOT NULL,
  return_location TEXT NOT NULL,
  notes TEXT,
  total_estimated_price INTEGER NOT NULL CHECK (total_estimated_price >= 0),
  booking_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (booking_status IN ('PENDING', 'CONFIRMED', 'CANCELLED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  CHECK (end_date > start_date)
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vehicles_brand_model ON vehicles(brand, model);
CREATE INDEX IF NOT EXISTS idx_vehicles_availability ON vehicles(availability_status);
CREATE INDEX IF NOT EXISTS idx_bookings_vehicle_dates
  ON bookings(vehicle_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(booking_status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at);
