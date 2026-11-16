import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(here, '..', 'data');
export const UPLOAD_DIR = path.join(here, '..', 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'driver-on-call.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub TEXT UNIQUE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  city TEXT,
  photo_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',          -- user | admin
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS driver_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | approved | rejected
  rejection_reason TEXT,
  bio TEXT,
  experience_years INTEGER NOT NULL,
  dl_number TEXT NOT NULL,
  dl_expiry TEXT NOT NULL,
  id_type TEXT NOT NULL,
  id_number TEXT NOT NULL,
  dl_file TEXT,
  id_file TEXT,
  photo_file TEXT,
  transmission TEXT NOT NULL,                 -- manual | automatic | both
  vehicle_types TEXT NOT NULL,                -- JSON array
  languages TEXT,
  rate_hour INTEGER NOT NULL,
  rate_day INTEGER NOT NULL,
  rate_week INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  area_label TEXT NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);

CREATE TABLE IF NOT EXISTS availability (
  driver_id INTEGER NOT NULL REFERENCES users(id),
  weekday INTEGER NOT NULL,                   -- 0 = Sunday
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  PRIMARY KEY (driver_id, weekday)
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  driver_id INTEGER NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL,                         -- rate used for the price: hourly | daily | weekly
  units INTEGER NOT NULL,                     -- hours when hourly, otherwise days
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  pickup_label TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  vehicle_desc TEXT,
  notes TEXT,
  est_total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',   -- requested | accepted | declined | cancelled | completed
  paid INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  subject_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (booking_id, author_id)
);
`);

export const q = {
  get: (sql, ...p) => db.prepare(sql).get(...p),
  all: (sql, ...p) => db.prepare(sql).all(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};

export function setAvailability(driverId, slots) {
  q.run('DELETE FROM availability WHERE driver_id = ?', driverId);
  for (const s of slots) {
    q.run(
      'INSERT INTO availability (driver_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?)',
      driverId, s.weekday, s.start_min, s.end_min
    );
  }
}
