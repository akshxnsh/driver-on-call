// Fills an empty database with demo accounts so the app can be tried immediately.
// Safe to run repeatedly: it does nothing if any user already exists.
// To start over, stop the server, delete server/data/ and run `npm run seed` again.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// First run: create server/.env from the example, with a random JWT secret.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
if (!fs.existsSync(envPath)) {
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  fs.writeFileSync(envPath, example.replace('change-me-to-a-long-random-string', crypto.randomBytes(32).toString('hex')));
  console.log('Created server/.env');
}

const { q, setAvailability } = await import('./db.js');
const { addDemoDrivers } = await import('./demo.js');

if (q.get('SELECT COUNT(*) AS n FROM users').n > 0) {
  console.log('Database already has users, nothing to seed.');
  process.exit(0);
}

const now = Date.now();
const user = (email, name, phone, city, role = 'user') =>
  Number(q.run(
    'INSERT INTO users (email, name, phone, city, role, is_demo, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    email, name, phone, city, role, now - 200 * 86400e3
  ).lastInsertRowid);

user('admin@demo.driveroncall.test', 'Admin (demo)', '+919000000001', 'Bengaluru', 'admin');
user('priya@demo.driveroncall.test', 'Priya Sharma', '+919000000002', 'Bengaluru');
user('arjun@demo.driveroncall.test', 'Arjun Mehta', '+919000000003', 'Bengaluru');

// Eight approved drivers around MG Road, Bengaluru.
const BLR = { lat: 12.9756, lng: 77.605 };
addDemoDrivers(BLR.lat, BLR.lng, 'MG Road, Bengaluru');

// One application waiting for admin review.
const pending = user('vikram@demo.driveroncall.test', 'Vikram Rao', '+919000000004', 'Bengaluru');
q.run(
  `INSERT INTO driver_profiles (user_id, status, bio, experience_years, dl_number, dl_expiry, id_type, id_number,
     transmission, vehicle_types, languages, rate_hour, rate_day, rate_week, lat, lng, area_label, created_at)
   VALUES (?, 'pending', ?, 8, 'KA0120170012345', '2030-06-30', 'Aadhaar', 'DEMO-0000-0000',
     'both', '["Hatchback","Sedan"]', 'Kannada, Hindi, English', 160, 1100, 6500, ?, ?, 'Indiranagar, Bengaluru', ?)`,
  pending, 'Eight years as a personal driver for two families in Indiranagar.', BLR.lat + 0.003, BLR.lng + 0.035, now
);
setAvailability(pending, [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_min: 7 * 60, end_min: 21 * 60 })));

console.log('Seeded: 1 admin, 2 customers, 8 approved drivers near MG Road Bengaluru, 1 pending application.');
