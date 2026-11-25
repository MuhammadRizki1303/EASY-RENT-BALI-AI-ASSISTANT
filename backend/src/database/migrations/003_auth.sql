-- Users and roles for authentication
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed user and admin accounts
INSERT OR IGNORE INTO users (username, password, name, role) VALUES
  ('user', 'user123', 'Customer User', 'user'),
  ('admin', 'admin123', 'Administrator Easy Rent', 'admin');
