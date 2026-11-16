// Demo data helpers. Used by the seed script and by the DEMO_MODE-only
// "add demo drivers near here" endpoint. Nothing here runs when DEMO_MODE=false.
import { q, setAvailability } from './db.js';

const DRIVERS = [
  ['Ramesh Kumar', 12, 'both', ['Hatchback', 'Sedan', 'SUV'], 'Hindi, English', 180, 1200, 7000,
    'Twelve years driving family cars and airport runs. Calm, punctual, non-smoker.'],
  ['Suresh Yadav', 6, 'manual', ['Hatchback', 'Sedan'], 'Hindi', 130, 900, 5500,
    'Daily office commutes and weekend outstation trips. I know the city shortcuts well.'],
  ['Imran Shaikh', 15, 'both', ['Sedan', 'SUV', 'Luxury'], 'Hindi, English, Marathi', 250, 1800, 10500,
    'Former corporate chauffeur. Comfortable with premium and automatic cars.'],
  ['Lakshmi Narayanan', 9, 'automatic', ['Hatchback', 'Sedan', 'SUV'], 'Tamil, English, Hindi', 200, 1400, 8000,
    'Careful driver, happy to help elderly passengers and with school pick-ups.'],
  ['Gurpreet Singh', 20, 'both', ['Sedan', 'SUV', 'Luxury'], 'Punjabi, Hindi, English', 280, 2000, 12000,
    'Twenty years on highways across North India. Long trips are my speciality.'],
  ['Anil Patil', 4, 'manual', ['Hatchback'], 'Marathi, Hindi', 110, 800, 4800,
    'Newer on the platform, budget friendly, available on short notice.'],
  ['Joseph Mathew', 11, 'both', ['Hatchback', 'Sedan', 'SUV'], 'Malayalam, English, Hindi', 190, 1300, 7500,
    'Night drives and late pick-ups are fine. Clean record for eleven years.'],
  ['Farhan Ali', 7, 'automatic', ['Sedan', 'SUV'], 'Hindi, English, Urdu', 170, 1150, 6800,
    'Wedding duty, shopping days, hospital visits. Patient with waiting time.'],
];

const slug = (name) => name.toLowerCase().replace(/[^a-z]+/g, '.');

/** Creates approved demo drivers scattered within ~6 km of a point. */
export function addDemoDrivers(lat, lng, areaLabel, count = DRIVERS.length) {
  const now = Date.now();
  const stamp = now.toString(36);
  const ids = [];
  DRIVERS.slice(0, count).forEach((d, i) => {
    const [name, exp, transmission, vehicles, languages, rh, rd, rw, bio] = d;
    const angle = (i / count) * 2 * Math.PI;
    const km = 0.8 + ((i * 37) % 50) / 10; // 0.8 to 5.7 km out
    const dLat = (km / 111) * Math.cos(angle);
    const dLng = (km / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
    const user = q.run(
      `INSERT INTO users (email, name, phone, city, role, is_demo, created_at)
       VALUES (?, ?, ?, ?, 'user', 1, ?)`,
      `${slug(name)}.${stamp}@demo.driveroncall.test`, name, `+91 90000 0${String(1000 + i)}`,
      areaLabel, now - (400 - i * 30) * 86400e3
    );
    const id = Number(user.lastInsertRowid);
    q.run(
      `INSERT INTO driver_profiles (user_id, status, bio, experience_years, dl_number, dl_expiry,
         id_type, id_number, transmission, vehicle_types, languages, rate_hour, rate_day, rate_week,
         lat, lng, area_label, created_at, reviewed_at)
       VALUES (?, 'approved', ?, ?, ?, '2031-12-31', 'Aadhaar', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, bio, exp, `DEMO-DL-${1000 + i}`, `DEMO-ID-${1000 + i}`, transmission,
      JSON.stringify(vehicles), languages, rh, rd, rw, lat + dLat, lng + dLng,
      `Near ${areaLabel}`, now, now
    );
    // Most work 7 days, 6am to 11pm. Every third driver takes Sunday off and works shorter days.
    const days = i % 3 === 2 ? [1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 6];
    const [start, end] = i % 3 === 2 ? [8 * 60, 20 * 60] : [6 * 60, 23 * 60];
    setAvailability(id, days.map((weekday) => ({ weekday, start_min: start, end_min: end })));
    ids.push(id);
  });
  addDemoHistory(ids);
  return ids;
}

const COMMENTS = [
  [5, 'Arrived ten minutes early and drove very smoothly. Will book again.'],
  [4, 'Good driver, polite. Took a slightly longer route once.'],
  [5, 'Handled our SUV with care on a full-day trip. Highly recommended.'],
  [5, 'Very professional, helped my parents with their luggage.'],
  [4, 'On time and safe. Communication could be a little quicker.'],
];

/** Gives demo drivers a few completed past bookings with reviews, written by the demo customers. */
function addDemoHistory(driverIds) {
  const customers = q.all(
    `SELECT u.id FROM users u LEFT JOIN driver_profiles d ON d.user_id = u.id
     WHERE u.is_demo = 1 AND u.role = 'user' AND d.user_id IS NULL`);
  if (customers.length === 0) return;
  const now = Date.now();
  driverIds.forEach((driverId, i) => {
    if (i === 5) return; // one driver stays brand new, with no reviews yet
    const d = q.get('SELECT * FROM driver_profiles WHERE user_id = ?', driverId);
    const jobs = 1 + (i % 3);
    for (let j = 0; j < jobs; j++) {
      const customer = customers[(i + j) % customers.length].id;
      const start = now - (10 + i * 6 + j * 17) * 86400e3;
      const [rating, comment] = COMMENTS[(i * 2 + j) % COMMENTS.length];
      const b = q.run(
        `INSERT INTO bookings (customer_id, driver_id, plan, units, start_at, end_at, pickup_label, lat, lng,
           est_total, status, paid, created_at)
         VALUES (?, ?, 'hourly', 4, ?, ?, ?, ?, ?, ?, 'completed', 1, ?)`,
        customer, driverId, start, start + 4 * 3600e3, d.area_label, d.lat, d.lng, d.rate_hour * 4, start - 86400e3
      );
      const bookingId = Number(b.lastInsertRowid);
      q.run('INSERT INTO reviews (booking_id, author_id, subject_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        bookingId, customer, driverId, rating, comment, start + 5 * 3600e3);
      q.run('INSERT INTO reviews (booking_id, author_id, subject_id, rating, comment, created_at) VALUES (?, ?, ?, 5, ?, ?)',
        bookingId, driverId, customer, 'Polite customer, car was in good condition.', start + 6 * 3600e3);
    }
  });
}
