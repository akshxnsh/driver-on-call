import 'dotenv/config';
import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OAuth2Client } from 'google-auth-library';
import { q, setAvailability, UPLOAD_DIR } from './db.js';
import {
  HttpError, fail, MAX_SPAN, quote, durationLabel, distanceKm, availabilityIssue, listedDrivers, driverRow,
  driverPublic, photoOf, parseSlots, parseListing,
} from './lib.js';
import { addDemoDrivers } from './demo.js';
import { notify, notifyAdmins, when } from './notify.js';
import { phoneVerified, sendOtp, verifyOtp } from './otp.js';

// API_PORT, not PORT: dev tools often set PORT for the web server. Hosts that set PORT are honoured in production.
const PORT = Number(process.env.API_PORT || (process.env.NODE_ENV === 'production' && process.env.PORT) || 4000);
const DEMO_MODE = process.env.DEMO_MODE === 'true';
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('JWT_SECRET is not set: using a temporary one, logins reset on every restart.');
}
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const app = express();
app.use(express.json({ limit: '100kb' }));

// ---------- auth ----------
const tokenFor = (user) => jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });

function auth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) fail(401, 'Please sign in');
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    fail(401, 'Session expired, please sign in again');
  }
  req.user = q.get('SELECT * FROM users WHERE id = ?', payload.uid);
  if (!req.user) fail(401, 'Account not found');
  next();
}
const adminOnly = (req, _res, next) => {
  if (req.user.role !== 'admin') fail(403, 'Admins only');
  next();
};

function me(user) {
  const d = q.get('SELECT status, paused FROM driver_profiles WHERE user_id = ?', user.id);
  return {
    id: user.id, name: user.name, email: user.email, phone: user.phone, phone_verified: phoneVerified(user), city: user.city,
    photo_url: user.photo_url, role: user.role,
    driver_status: d ? d.status : null,
  };
}

// For the hosting platform's health check: answers 200 only when the database responds.
app.get('/api/health', (_req, res) => res.json({ ok: q.get('SELECT 1 AS ok').ok === 1 }));

app.get('/api/config', (_req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID || null, demoMode: DEMO_MODE });
});

app.post('/api/auth/google', async (req, res) => {
  if (!googleClient) fail(400, 'Google sign-in is not configured on this server');
  let p;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: String(req.body.credential || ''), audience: GOOGLE_CLIENT_ID,
    });
    p = ticket.getPayload();
  } catch {
    fail(401, 'Google sign-in could not be verified');
  }
  if (!p.email || !p.email_verified) fail(401, 'Your Google email is not verified');
  // Full-page sign-in sends the nonce it started with; the token must carry the same one.
  if (req.body.nonce !== undefined && p.nonce !== String(req.body.nonce)) fail(401, 'Google sign-in could not be verified');
  const email = p.email.toLowerCase();
  const role = ADMIN_EMAILS.includes(email) ? 'admin' : 'user';
  let user = q.get('SELECT * FROM users WHERE google_sub = ? OR email = ?', p.sub, email);
  if (user) {
    q.run('UPDATE users SET google_sub = ?, photo_url = COALESCE(?, photo_url), role = ? WHERE id = ?',
      p.sub, p.picture || null, role === 'admin' ? 'admin' : user.role, user.id);
  } else {
    const r = q.run(
      'INSERT INTO users (google_sub, email, name, photo_url, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      p.sub, email, p.name || email.split('@')[0], p.picture || null, role, Date.now()
    );
    user = { id: Number(r.lastInsertRowid) };
  }
  user = q.get('SELECT * FROM users WHERE id = ?', user.id);
  res.json({ token: tokenFor(user), user: me(user) });
});

// Demo login: only exists when DEMO_MODE=true, and only for seeded demo accounts.
app.get('/api/auth/demo-users', (_req, res) => {
  if (!DEMO_MODE) return res.json([]);
  const rows = q.all(
    `SELECT u.id, u.name, u.role, d.status AS driver_status
     FROM users u LEFT JOIN driver_profiles d ON d.user_id = u.id
     WHERE u.is_demo = 1
     ORDER BY (u.role = 'admin') DESC, (d.status IS NULL) DESC, (d.status = 'pending') DESC, u.id
     LIMIT 14`
  );
  res.json(rows);
});
app.post('/api/auth/demo', (req, res) => {
  if (!DEMO_MODE) fail(404, 'Not found');
  const user = q.get('SELECT * FROM users WHERE id = ? AND is_demo = 1', Number(req.body.userId));
  if (!user) fail(404, 'Demo user not found');
  res.json({ token: tokenFor(user), user: me(user) });
});

app.get('/api/me', auth, (req, res) => res.json(me(req.user)));
app.put('/api/me', auth, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const phone = String(req.body.phone || '').replace(/[\s-]/g, '');
  const city = String(req.body.city || '').trim().slice(0, 80);
  if (name.length < 2) fail(400, 'Enter your full name');
  if (!/^(\+91)?[6-9]\d{9}$/.test(phone)) fail(400, 'Enter a valid 10-digit Indian mobile number');
  if (!city) fail(400, 'Enter your city');
  const fullPhone = phone.startsWith('+91') ? phone : `+91${phone}`;
  // A different number has to be verified again.
  const verifiedAt = fullPhone === req.user.phone ? req.user.phone_verified_at : null;
  q.run('UPDATE users SET name = ?, phone = ?, city = ?, phone_verified_at = ? WHERE id = ?',
    name, fullPhone, city, verifiedAt, req.user.id);
  res.json(me(q.get('SELECT * FROM users WHERE id = ?', req.user.id)));
});
app.post('/api/me/phone/send-otp', auth, async (req, res) => res.json(await sendOtp(req.user)));
app.post('/api/me/phone/verify', auth, async (req, res) => {
  await verifyOtp(req.user, req.body.code);
  res.json(me(q.get('SELECT * FROM users WHERE id = ?', req.user.id)));
});

// ---------- uploads ----------
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + EXT[file.mimetype]),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.fieldname === 'photo' ? file.mimetype.startsWith('image/') && EXT[file.mimetype] : EXT[file.mimetype];
    cb(ok ? null : new HttpError(400, 'Upload JPG, PNG or WebP images (PDF is also fine for documents)'), !!ok);
  },
}).fields([{ name: 'photo', maxCount: 1 }, { name: 'dl_file', maxCount: 1 }, { name: 'id_file', maxCount: 1 }]);

// Profile photos are public. Identity documents are only for the owner and admins.
app.get('/api/photo/:name', (req, res) => {
  const row = q.get('SELECT 1 AS ok FROM driver_profiles WHERE photo_file = ?', req.params.name);
  if (!row) fail(404, 'Not found');
  res.sendFile(path.join(UPLOAD_DIR, req.params.name));
});
app.get('/api/files/:name', auth, (req, res) => {
  const row = q.get('SELECT user_id FROM driver_profiles WHERE dl_file = ? OR id_file = ?',
    req.params.name, req.params.name);
  if (!row) fail(404, 'Not found');
  if (req.user.role !== 'admin' && row.user_id !== req.user.id) fail(403, 'Not allowed');
  res.sendFile(path.join(UPLOAD_DIR, req.params.name));
});

// ---------- driver: apply and manage own listing ----------
function ownDriver(userId) {
  const d = q.get('SELECT * FROM driver_profiles WHERE user_id = ?', userId);
  if (!d) return null;
  return {
    ...d,
    vehicle_types: JSON.parse(d.vehicle_types),
    photo: d.photo_file ? `/api/photo/${d.photo_file}` : null,
    availability: q.all('SELECT weekday, start_min, end_min FROM availability WHERE driver_id = ? ORDER BY weekday', userId),
  };
}

app.get('/api/driver/me', auth, (req, res) => res.json(ownDriver(req.user.id)));

app.post('/api/driver/apply', auth, upload, (req, res) => {
  const files = req.files || {};
  const discard = () => Object.values(files).flat().forEach((f) => fs.rm(f.path, () => {}));
  try {
    if (!phoneVerified(req.user)) fail(400, 'Verify your mobile number in your profile before applying');
    const existing = q.get('SELECT * FROM driver_profiles WHERE user_id = ?', req.user.id);
    if (existing && existing.status !== 'rejected') fail(409, 'You have already applied');
    const b = req.body;
    const listing = parseListing(b);
    const slots = parseSlots(b.availability);
    const exp = Number.parseInt(b.experience_years, 10);
    if (!(exp >= 1 && exp <= 60)) fail(400, 'Driving experience must be at least 1 year');
    const dlNumber = String(b.dl_number || '').trim().toUpperCase();
    if (dlNumber.length < 8) fail(400, 'Enter your driving licence number');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dl_expiry || '') || new Date(b.dl_expiry) < new Date()) {
      fail(400, 'Your driving licence must not be expired');
    }
    if (!['Aadhaar', 'PAN', 'Voter ID', 'Passport'].includes(b.id_type)) fail(400, 'Choose an identity proof type');
    const idNumber = String(b.id_number || '').trim().toUpperCase();
    if (idNumber.length < 6) fail(400, 'Enter your identity proof number');
    const dlFile = files.dl_file?.[0]?.filename || existing?.dl_file;
    const idFile = files.id_file?.[0]?.filename || existing?.id_file;
    const photo = files.photo?.[0]?.filename || existing?.photo_file;
    if (!dlFile || !idFile || !photo) fail(400, 'Upload your photo, driving licence and identity proof');

    q.run('DELETE FROM driver_profiles WHERE user_id = ?', req.user.id);
    q.run(
      `INSERT INTO driver_profiles (user_id, status, bio, experience_years, dl_number, dl_expiry, id_type,
         id_number, dl_file, id_file, photo_file, transmission, vehicle_types, languages, rate_hour,
         rate_day, rate_week, lat, lng, area_label, created_at)
       VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      req.user.id, listing.bio, exp, dlNumber, b.dl_expiry, b.id_type, idNumber, dlFile, idFile, photo,
      listing.transmission, listing.vehicle_types, listing.languages, listing.rate_hour, listing.rate_day,
      listing.rate_week, listing.lat, listing.lng, listing.area_label, Date.now()
    );
    setAvailability(req.user.id, slots);
    notifyAdmins('application', `${req.user.name} applied to be a driver`, `${listing.area_label} · ${exp} years experience`, '/admin');
    res.status(201).json(ownDriver(req.user.id));
  } catch (err) {
    discard();
    throw err;
  }
});

app.put('/api/driver/me', auth, (req, res) => {
  const existing = q.get('SELECT status FROM driver_profiles WHERE user_id = ?', req.user.id);
  if (!existing || existing.status !== 'approved') fail(403, 'Only approved drivers can edit their listing');
  const l = parseListing(req.body);
  const slots = parseSlots(req.body.availability);
  q.run(
    `UPDATE driver_profiles SET bio = ?, languages = ?, transmission = ?, vehicle_types = ?, rate_hour = ?,
       rate_day = ?, rate_week = ?, lat = ?, lng = ?, area_label = ?, paused = ? WHERE user_id = ?`,
    l.bio, l.languages, l.transmission, l.vehicle_types, l.rate_hour, l.rate_day, l.rate_week,
    l.lat, l.lng, l.area_label, req.body.paused ? 1 : 0, req.user.id
  );
  setAvailability(req.user.id, slots);
  res.json(ownDriver(req.user.id));
});

// ---------- search and public driver profile ----------
/** Reads start and end (ISO date-times) from a query or body and checks the span is sensible. */
function parseSpan(input) {
  const start = Date.parse(input.start), end = Date.parse(input.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) fail(400, 'Choose a From and a To date and time');
  if (end <= start) fail(400, 'The To time must be after the From time');
  if (end - start > MAX_SPAN) fail(400, 'A booking can be at most 12 weeks long');
  return { start, end };
}

// Searching and viewing drivers needs a signed-in account (the web app shows only a landing page before that).
app.get('/api/drivers/search', auth, (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) fail(400, 'Set a location first');
  const radius = Math.min(Math.max(Number(req.query.radius) || 10, 1), 100);
  const { start, end } = parseSpan(req.query);
  const drivers = listedDrivers()
    .map((row) => ({ row, km: distanceKm(lat, lng, row.lat, row.lng) }))
    .filter((x) => x.km <= radius)
    .map(({ row, km }) => {
      const issue = availabilityIssue(row.user_id, start, end);
      return {
        ...driverPublic(row),
        distance_km: Math.round(km * 10) / 10,
        available: !issue,
        unavailable_reason: issue,
        est_total: quote(row, start, end).total,
      };
    });
  const sort = req.query.sort;
  drivers.sort((a, b) =>
    Number(b.available) - Number(a.available) ||
    (sort === 'price' ? a.est_total - b.est_total
      : sort === 'rating' ? (b.rating_avg || 0) - (a.rating_avg || 0)
      : a.distance_km - b.distance_km));
  res.json({ drivers, available_count: drivers.filter((d) => d.available).length, start, end });
});

app.get('/api/drivers/:id', auth, (req, res) => {
  const row = driverRow(Number(req.params.id));
  if (!row || row.status !== 'approved') fail(404, 'Driver not found');
  const reviews = q.all(
    `SELECT r.rating, r.comment, r.created_at, u.name AS author
     FROM reviews r JOIN bookings b ON b.id = r.booking_id JOIN users u ON u.id = r.author_id
     WHERE r.subject_id = ? AND b.driver_id = ? ORDER BY r.created_at DESC LIMIT 30`,
    row.user_id, row.user_id
  );
  const availability = q.all(
    'SELECT weekday, start_min, end_min FROM availability WHERE driver_id = ? ORDER BY weekday', row.user_id);
  res.json({ ...driverPublic(row), paused: !!row.paused, reviews, availability });
});

// ---------- bookings ----------
function bookingView(b, viewerId) {
  const iAmDriver = b.driver_id === viewerId;
  const otherId = iAmDriver ? b.customer_id : b.driver_id;
  const o = q.get(
    `SELECT u.id, u.name, u.phone, u.photo_url, d.photo_file FROM users u
     LEFT JOIN driver_profiles d ON d.user_id = u.id WHERE u.id = ?`, otherId);
  // Rating of the other person in the role they play in this booking.
  const rating = q.get(
    `SELECT AVG(r.rating) AS avg, COUNT(*) AS n FROM reviews r JOIN bookings k ON k.id = r.booking_id
     WHERE r.subject_id = ? AND ${iAmDriver ? 'k.customer_id' : 'k.driver_id'} = ?`, otherId, otherId);
  const contactOpen = b.status === 'accepted' || b.status === 'completed';
  return {
    ...b,
    paid: !!b.paid,
    role: iAmDriver ? 'driver' : 'customer',
    other: {
      id: o.id, name: o.name,
      photo: iAmDriver ? o.photo_url : photoOf(o),
      phone: contactOpen ? o.phone : null, // phone numbers stay hidden until the driver accepts
      rating_avg: rating.avg ? Math.round(rating.avg * 10) / 10 : null,
      rating_count: rating.n,
    },
    my_review: q.get('SELECT rating, comment FROM reviews WHERE booking_id = ? AND author_id = ?', b.id, viewerId) || null,
    their_review: q.get('SELECT rating, comment FROM reviews WHERE booking_id = ? AND author_id = ?', b.id, otherId) || null,
  };
}
function loadBooking(req) {
  const b = q.get('SELECT * FROM bookings WHERE id = ?', Number(req.params.id));
  if (!b || (b.customer_id !== req.user.id && b.driver_id !== req.user.id)) fail(404, 'Booking not found');
  return b;
}

app.post('/api/bookings', auth, (req, res) => {
  if (!phoneVerified(req.user)) fail(400, 'Verify your mobile number in your profile before booking');
  const driver = q.get('SELECT * FROM driver_profiles WHERE user_id = ?', Number(req.body.driver_id));
  if (!driver || driver.status !== 'approved' || driver.paused) fail(404, 'This driver is not taking bookings');
  if (driver.user_id === req.user.id) fail(400, 'You cannot book yourself');
  const { start, end } = parseSpan(req.body);
  if (start < Date.now()) fail(400, 'Choose a From time in the future');
  const price = quote(driver, start, end);
  const lat = Number(req.body.lat), lng = Number(req.body.lng);
  const pickup = String(req.body.pickup_label || '').trim().slice(0, 200);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !pickup) fail(400, 'Set the pickup location');
  const issue = availabilityIssue(driver.user_id, start, end);
  if (issue) fail(409, `Driver is not available: ${issue.toLowerCase()}`);
  const r = q.run(
    `INSERT INTO bookings (customer_id, driver_id, plan, units, start_at, end_at, pickup_label, lat, lng,
       vehicle_desc, notes, est_total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    req.user.id, driver.user_id, price.plan, price.units, start, end, pickup, lat, lng,
    String(req.body.vehicle_desc || '').trim().slice(0, 120),
    String(req.body.notes || '').trim().slice(0, 500),
    price.total, Date.now()
  );
  const bookingId = Number(r.lastInsertRowid);
  notify(driver.user_id, 'booking', `${req.user.name} wants to hire you`,
    `${when(start)} · ${durationLabel(start, end)} · ${pickup}`,
    `/bookings/${bookingId}`);
  res.status(201).json(bookingView(q.get('SELECT * FROM bookings WHERE id = ?', bookingId), req.user.id));
});

app.get('/api/bookings', auth, (req, res) => {
  const col = req.query.as === 'driver' ? 'driver_id' : 'customer_id';
  const rows = q.all(`SELECT * FROM bookings WHERE ${col} = ? ORDER BY created_at DESC`, req.user.id);
  res.json(rows.map((b) => bookingView(b, req.user.id)));
});

app.get('/api/bookings/:id', auth, (req, res) => res.json(bookingView(loadBooking(req), req.user.id)));

app.post('/api/bookings/:id/action', auth, (req, res) => {
  const b = loadBooking(req);
  const isDriver = b.driver_id === req.user.id;
  const set = (sql, ...p) => q.run(`UPDATE bookings SET ${sql} WHERE id = ?`, ...p, b.id);
  switch (req.body.action) {
    case 'accept': {
      if (!isDriver || b.status !== 'requested') fail(400, 'This request can no longer be accepted');
      const issue = availabilityIssue(b.driver_id, b.start_at, b.end_at, b.id);
      if (issue === 'Already booked at that time') fail(409, 'You already accepted another booking at that time');
      set("status = 'accepted'");
      break;
    }
    case 'decline':
      if (!isDriver || b.status !== 'requested') fail(400, 'This request can no longer be declined');
      set("status = 'declined'");
      break;
    case 'cancel':
      if (!(b.status === 'accepted' || (b.status === 'requested' && !isDriver))) fail(400, 'This booking cannot be cancelled');
      set("status = 'cancelled'");
      break;
    case 'complete':
      if (!isDriver || b.status !== 'accepted') fail(400, 'Only an accepted booking can be completed');
      set("status = 'completed'");
      break;
    case 'paid':
      if (!isDriver || !['accepted', 'completed'].includes(b.status)) fail(400, 'Cannot mark this booking as paid');
      set('paid = 1');
      break;
    default:
      fail(400, 'Unknown action');
  }
  // Tell the other person what just happened.
  const otherId = isDriver ? b.customer_id : b.driver_id;
  const text = {
    accept: ['accepted your request', 'You can now see their phone number.'],
    decline: ['declined your request', 'Try another driver for that time.'],
    cancel: ['cancelled the booking', `It was for ${when(b.start_at)}.`],
    complete: ['marked the job completed', 'Please rate your driver.'],
    paid: ['marked your booking as paid', ''],
  }[req.body.action];
  notify(otherId, 'booking', `${req.user.name} ${text[0]}`, text[1], `/bookings/${b.id}`);
  res.json(bookingView(q.get('SELECT * FROM bookings WHERE id = ?', b.id), req.user.id));
});

app.get('/api/bookings/:id/messages', auth, (req, res) => {
  const b = loadBooking(req);
  res.json(q.all(
    'SELECT id, sender_id, body, created_at FROM messages WHERE booking_id = ? AND id > ? ORDER BY id',
    b.id, Number(req.query.after) || 0));
});
app.post('/api/bookings/:id/messages', auth, (req, res) => {
  const b = loadBooking(req);
  if (['declined', 'cancelled'].includes(b.status)) fail(400, 'This conversation is closed');
  const body = String(req.body.body || '').trim().slice(0, 1000);
  if (!body) fail(400, 'Type a message');
  const r = q.run('INSERT INTO messages (booking_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)',
    b.id, req.user.id, body, Date.now());
  notify(b.driver_id === req.user.id ? b.customer_id : b.driver_id, 'message',
    `New message from ${req.user.name}`, body.slice(0, 120), `/bookings/${b.id}`, { collapse: true });
  res.status(201).json(q.get('SELECT id, sender_id, body, created_at FROM messages WHERE id = ?', Number(r.lastInsertRowid)));
});

app.post('/api/bookings/:id/review', auth, (req, res) => {
  const b = loadBooking(req);
  if (b.status !== 'completed') fail(400, 'You can review once the booking is completed');
  const rating = Number.parseInt(req.body.rating, 10);
  if (!(rating >= 1 && rating <= 5)) fail(400, 'Choose 1 to 5 stars');
  if (q.get('SELECT 1 AS x FROM reviews WHERE booking_id = ? AND author_id = ?', b.id, req.user.id)) {
    fail(409, 'You already reviewed this booking');
  }
  const subject = b.driver_id === req.user.id ? b.customer_id : b.driver_id;
  q.run('INSERT INTO reviews (booking_id, author_id, subject_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    b.id, req.user.id, subject, rating, String(req.body.comment || '').trim().slice(0, 500), Date.now());
  notify(subject, 'review', `${req.user.name} rated you ${rating} out of 5`, '', `/bookings/${b.id}`);
  res.status(201).json(bookingView(b, req.user.id));
});

// ---------- notifications ----------
app.get('/api/notifications', auth, (req, res) => {
  res.json({
    unread: q.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', req.user.id).n,
    items: q.all(
      'SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30',
      req.user.id),
  });
});
// Body: { id } for one, { link } for everything pointing at a page, or { all: true }.
app.post('/api/notifications/read', auth, (req, res) => {
  const now = Date.now();
  const base = 'UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL';
  if (req.body.all) q.run(base, now, req.user.id);
  else if (req.body.link) q.run(`${base} AND link = ?`, now, req.user.id, String(req.body.link));
  else if (req.body.id) q.run(`${base} AND id = ?`, now, req.user.id, Number(req.body.id));
  else fail(400, 'Say which notifications to mark as read');
  res.json({ ok: true });
});

// ---------- admin ----------
app.get('/api/admin/drivers', auth, adminOnly, (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const rows = q.all(
    `SELECT d.*, u.name, u.email, u.phone, u.city, u.photo_url FROM driver_profiles d
     JOIN users u ON u.id = d.user_id WHERE d.status = ? ORDER BY d.created_at DESC`, status);
  res.json(rows.map((d) => ({
    ...d,
    vehicle_types: JSON.parse(d.vehicle_types),
    photo: photoOf(d),
    availability: q.all('SELECT weekday, start_min, end_min FROM availability WHERE driver_id = ? ORDER BY weekday', d.user_id),
  })));
});
app.get('/api/admin/stats', auth, adminOnly, (_req, res) => {
  const count = (sql) => q.get(sql).n;
  res.json({
    users: count('SELECT COUNT(*) AS n FROM users'),
    pending: count("SELECT COUNT(*) AS n FROM driver_profiles WHERE status = 'pending'"),
    approved: count("SELECT COUNT(*) AS n FROM driver_profiles WHERE status = 'approved'"),
    rejected: count("SELECT COUNT(*) AS n FROM driver_profiles WHERE status = 'rejected'"),
    bookings: count('SELECT COUNT(*) AS n FROM bookings'),
    completed: count("SELECT COUNT(*) AS n FROM bookings WHERE status = 'completed'"),
  });
});
app.post('/api/admin/drivers/:id/review', auth, adminOnly, (req, res) => {
  const d = q.get('SELECT user_id FROM driver_profiles WHERE user_id = ?', Number(req.params.id));
  if (!d) fail(404, 'Application not found');
  if (req.body.decision === 'approve') {
    q.run("UPDATE driver_profiles SET status = 'approved', rejection_reason = NULL, reviewed_at = ? WHERE user_id = ?",
      Date.now(), d.user_id);
  } else if (req.body.decision === 'reject') {
    const reason = String(req.body.reason || '').trim().slice(0, 300);
    if (!reason) fail(400, 'Give a reason so the applicant knows what to fix');
    q.run("UPDATE driver_profiles SET status = 'rejected', rejection_reason = ?, reviewed_at = ? WHERE user_id = ?",
      reason, Date.now(), d.user_id);
  } else {
    fail(400, 'Unknown decision');
  }
  if (req.body.decision === 'approve') {
    notify(d.user_id, 'application', 'You are approved as a driver', 'Your profile is now visible to customers near you.', '/driver');
  } else {
    notify(d.user_id, 'application', 'Your driver application was not approved', 'Open it to see the reason and apply again.', '/driver');
  }
  res.json({ ok: true });
});

// ---------- demo helper ----------
app.post('/api/dev/seed-near', (req, res) => {
  if (!DEMO_MODE) fail(404, 'Not found');
  const lat = Number(req.body.lat), lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) fail(400, 'Set a location first');
  const label = String(req.body.label || 'your area').split(',')[0].slice(0, 60);
  res.json({ added: addDemoDrivers(lat, lng, label).length });
});

// ---------- production: serve the built React app ----------
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((req, _res) => fail(404, `No route for ${req.method} ${req.path}`));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 5 MB or smaller' : err.message;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong on the server' : message });
});

app.listen(PORT, () => {
  console.log(`Driver-On-Call API on http://localhost:${PORT}  (demo mode: ${DEMO_MODE ? 'on' : 'off'}, Google sign-in: ${googleClient ? 'on' : 'off'})`);
});
