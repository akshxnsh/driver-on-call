// End-to-end test of the whole API against a throwaway database and a throwaway server.
// Run with `npm test` from the project root. It never touches server/data and never sends a real text:
// Twilio and Google settings are blanked for the test server.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import jwt from 'jsonwebtoken';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(path.join(tmpdir(), 'doc-e2e-'));
const PORT = 4200;
const SECRET = 'e2e-test-secret';
const env = {
  ...process.env, API_PORT: String(PORT), DB_DIR: tmp, UPLOAD_DIR: path.join(tmp, 'uploads'), JWT_SECRET: SECRET,
  DEMO_MODE: 'true', GOOGLE_CLIENT_ID: '', ADMIN_EMAILS: '', TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', TWILIO_VERIFY_SERVICE_SID: '',
};
const node = ['--disable-warning=ExperimentalWarning'];
const seed = spawnSync(process.execPath, [...node, 'src/seed.js'], { cwd: root, env, encoding: 'utf8' });
if (seed.status !== 0) { console.error(seed.stdout, seed.stderr); process.exit(1); }
const server = spawn(process.execPath, [...node, 'src/index.js'], { cwd: root, env, stdio: 'pipe' });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/api/config`)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250));
}
const db = new DatabaseSync(path.join(tmp, 'driver-on-call.db'));

// ---------- tiny harness ----------
let passed = 0;
const failures = [];
const check = (name, ok, detail = '') => { if (ok) passed++; else failures.push(`${name}${detail ? '  -> ' + detail : ''}`); };
const section = (name) => console.log(`\n${name}`);
async function call(token, method, url, body, form) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`http://localhost:${PORT}/api${url}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { s: res.status, j: json, text, res };
}
const demoIds = Object.fromEntries((await call(null, 'GET', '/auth/demo-users')).j.map((u) => [u.name.split(' ')[0], u.id]));
const demoToken = async (name) => (await call(null, 'POST', '/auth/demo', { userId: demoIds[name] })).j.token;
const mkUser = (email, { phone = null, verified = false } = {}) => {
  const id = Number(db.prepare('INSERT INTO users (email, name, phone, city, role, is_demo, phone_verified_at, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
    .run(email, email.split('@')[0], phone, 'Testville', 'user', verified ? Date.now() : null, Date.now()).lastInsertRowid);
  return { id, token: jwt.sign({ uid: id }, SECRET, { expiresIn: '1h' }) };
};
const at = (daysAhead, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + daysAhead); d.setHours(h, m, 0, 0); return d.toISOString(); };
const book = (token, driver_id, start, end, extra = {}) =>
  call(token, 'POST', '/bookings', { driver_id, start, end, lat: 12.9756, lng: 77.605, pickup_label: 'MG Road', vehicle_desc: 'Test car', ...extra });
const act = (token, id, action) => call(token, 'POST', `/bookings/${id}/action`, { action });
const titles = async (token) => (await call(token, 'GET', '/notifications')).j.items.map((i) => i.title);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const file = (name, type = 'image/png', bytes = PNG) => new File([bytes], name, { type });

try {
  const priya = await demoToken('Priya'), arjun = await demoToken('Arjun'), admin = await demoToken('Admin');
  const ramesh = await demoToken('Ramesh'), suresh = await demoToken('Suresh'), vikram = await demoToken('Vikram');
  const R = demoIds.Ramesh, S = demoIds.Suresh, V = demoIds.Vikram;
  const day = 3; // far enough ahead to be in the future whatever the time of day

  section('1. Public pages and basic protection');
  check('config is public', (await call(null, 'GET', '/config')).s === 200);
  for (const [m, u] of [['GET', '/me'], ['GET', '/bookings'], ['GET', '/notifications'], ['GET', '/driver/me'], ['GET', '/admin/drivers'], ['POST', '/bookings']]) {
    check(`${m} ${u} needs sign-in`, (await call(null, m, u, m === 'POST' ? {} : undefined)).s === 401);
  }
  check('garbage token rejected', (await call('abc.def.ghi', 'GET', '/me')).s === 401);
  check('unknown route is a 404 JSON', (await call(null, 'GET', '/nope')).s === 404);
  check('demo login for unknown user fails', (await call(null, 'POST', '/auth/demo', { userId: 99999 })).s === 404);
  check('google login refused when not configured', (await call(null, 'POST', '/auth/google', { credential: 'x' })).s === 400);

  section('2. Search');
  const q = (s, e, extra = '') => call(null, 'GET', `/drivers/search?lat=12.9756&lng=77.605&start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}${extra}`);
  check('search needs a location', (await call(null, 'GET', `/drivers/search?start=${at(day, 10)}&end=${at(day, 12)}`)).s === 400);
  check('search needs both From and To', (await call(null, 'GET', `/drivers/search?lat=12.9&lng=77.6&start=${at(day, 10)}`)).s === 400);
  check('To before From rejected', (await q(at(day, 12), at(day, 10))).s === 400);
  check('span over 12 weeks rejected', (await q(at(day, 10), at(day + 90, 10))).s === 400);
  const base = await q(at(day, 10), at(day, 14, 30));
  check('search finds the 8 seeded drivers', base.j.drivers.length === 8 && base.j.available_count === 8, JSON.stringify([base.j.drivers?.length, base.j.available_count]));
  const ram = base.j.drivers.find((d) => d.id === R);
  check('price for 4h30 at 180/h is 810', ram.est_total === 810, ram.est_total);
  check('public driver data has no phone, email or documents', !('phone' in ram) && !('email' in ram) && !('dl_number' in ram) && !('id_number' in ram) && !('dl_file' in ram));
  check('pending driver is not listed', !base.j.drivers.some((d) => d.id === V));
  const near = (await q(at(day, 10), at(day, 14), '&radius=1')).j.drivers;
check('a 1 km radius returns only the closest drivers (minimum radius is 1 km)', near.length > 0 && near.length < 8 && near.every((d) => d.distance_km <= 1), String(near.length));
  const sorted = (await q(at(day, 10), at(day, 14), '&sort=price')).j.drivers;
  check('sort by price is ascending', sorted.every((d, i) => i === 0 || sorted[i - 1].est_total <= d.est_total));
  const price = async (s, e) => (await q(s, e)).j.drivers.find((d) => d.id === R).est_total;
  check('10 hours is capped at the day rate (1200)', (await price(at(day, 8), at(day, 18))) === 1200);
  check('25 hours is 1 day + 1 hour (1380)', (await price(at(day, 8), at(day + 1, 9))) === 1380);
  check('9 days is 1 week + 2 days (9400)', (await price(at(day, 9), at(day + 9, 9))) === 9400);
  check('ends after working hours is flagged', (await q(at(day, 20), at(day, 23, 30))).j.drivers.find((d) => d.id === R).unavailable_reason === 'Ends after working hours');
  check('starts before working hours is flagged', (await q(at(day, 4), at(day, 7))).j.drivers.find((d) => d.id === R).unavailable_reason === 'Outside working hours');
  const profile = await call(null, 'GET', `/drivers/${R}`);
  check('public profile has reviews and hours but no phone', profile.s === 200 && Array.isArray(profile.j.reviews) && profile.j.availability.length === 7 && !('phone' in profile.j));
  check('pending driver profile is hidden', (await call(null, 'GET', `/drivers/${V}`)).s === 404);

  section('3. Phone verification gates booking');
  const fresh = mkUser('fresh@example.test');
  check('unverified user cannot book', (await book(fresh.token, R, at(day, 10), at(day, 12))).s === 400);
  check('send code needs a saved number', (await call(fresh.token, 'POST', '/me/phone/send-otp')).s === 400);
  check('bad number is rejected', (await call(fresh.token, 'PUT', '/me', { name: 'Fresh User', phone: '12345', city: 'X' })).s === 400);
  check('short name is rejected', (await call(fresh.token, 'PUT', '/me', { name: 'F', phone: '9123456780', city: 'X' })).s === 400);
  const saved = await call(fresh.token, 'PUT', '/me', { name: 'Fresh User', phone: '9123456780', city: 'Testville' });
  check('number saved, still unverified', saved.s === 200 && saved.j.phone === '+919123456780' && saved.j.phone_verified === false);
  check('still cannot book', (await book(fresh.token, R, at(day, 10), at(day, 12))).s === 400);
  check('verify before asking is refused', (await call(fresh.token, 'POST', '/me/phone/verify', { code: '123456' })).s === 400);
  const sent = await call(fresh.token, 'POST', '/me/phone/send-otp');
  check('demo mode returns the code and sends no text', sent.s === 200 && /^\d{6}$/.test(sent.j.demo_code), JSON.stringify(sent.j));
  check('second send within 30s is blocked', (await call(fresh.token, 'POST', '/me/phone/send-otp')).s === 429);
  check('non-numeric code rejected', (await call(fresh.token, 'POST', '/me/phone/verify', { code: 'abcdef' })).s === 400);
  const wrong = sent.j.demo_code === '000000' ? '111111' : '000000';
  check('wrong code rejected', (await call(fresh.token, 'POST', '/me/phone/verify', { code: wrong })).s === 400);
  for (let i = 0; i < 4; i++) await call(fresh.token, 'POST', '/me/phone/verify', { code: wrong });
  check('too many wrong tries locks the code, even the right one', (await call(fresh.token, 'POST', '/me/phone/verify', { code: sent.j.demo_code })).s === 429);
  db.prepare('UPDATE otp_codes SET last_sent_at = 0 WHERE user_id = ?').run(fresh.id); // skip the 30 s wait
  const sent2 = await call(fresh.token, 'POST', '/me/phone/send-otp');
  const ok = await call(fresh.token, 'POST', '/me/phone/verify', { code: sent2.j.demo_code });
  check('a fresh code verifies the number', ok.s === 200 && ok.j.phone_verified === true);
  check('verified user can now book', (await book(fresh.token, R, at(day, 10), at(day, 12))).s === 201);
  check('same number keeps its verification when profile is saved again', (await call(fresh.token, 'PUT', '/me', { name: 'Fresh User', phone: '9123456780', city: 'Elsewhere' })).j.phone_verified === true);
  check('a different number needs verifying again', (await call(fresh.token, 'PUT', '/me', { name: 'Fresh User', phone: '9123456781', city: 'Elsewhere' })).j.phone_verified === false);
  check('and booking is blocked again', (await book(fresh.token, R, at(day + 1, 10), at(day + 1, 12))).s === 400);

  section('4. Booking, access control, contact privacy');
  check('start in the past is rejected', (await book(priya, R, at(-1, 10), at(-1, 12))).s === 400);
  check('To before From is rejected', (await book(priya, R, at(day, 12), at(day, 10))).s === 400);
  check('cannot book yourself', (await book(ramesh, R, at(day, 10), at(day, 12))).s === 400);
  check('cannot book a driver who is not approved', (await book(priya, V, at(day, 10), at(day, 12))).s === 404);
  check('outside working hours is refused', (await book(priya, R, at(day, 3), at(day, 5))).s === 409);
  const b1 = (await book(priya, R, at(day + 5, 10), at(day + 5, 14, 30))).j;
  check('request created as "requested" at the exact price', b1.status === 'requested' && b1.est_total === 810 && b1.other.phone === null);
  check('driver sees the request without the customer phone', (await call(ramesh, 'GET', `/bookings/${b1.id}`)).j.other.phone === null);
  check('stranger cannot read the booking', (await call(arjun, 'GET', `/bookings/${b1.id}`)).s === 404);
  check('stranger cannot read or write its messages', (await call(arjun, 'GET', `/bookings/${b1.id}/messages`)).s === 404 && (await call(arjun, 'POST', `/bookings/${b1.id}/messages`, { body: 'hi' })).s === 404);
  check('customer cannot accept their own request', (await act(priya, b1.id, 'accept')).s === 400);
  check('listing shows the request on the right side', (await call(ramesh, 'GET', '/bookings?as=driver')).j.some((b) => b.id === b1.id) && (await call(priya, 'GET', '/bookings?as=customer')).j.some((b) => b.id === b1.id));
  check('driver got a "wants to hire you" notification', (await titles(ramesh)).some((t) => t.includes('wants to hire you')));
  check('unknown action rejected', (await act(ramesh, b1.id, 'explode')).s === 400);
  // a second, overlapping request from someone else is allowed until one is accepted
  const b2 = (await book(arjun, R, at(day + 5, 12), at(day + 5, 16))).j;
  check('overlapping request is allowed before acceptance', b2.status === 'requested');
  const acc = await act(ramesh, b1.id, 'accept');
  check('driver accepts', acc.s === 200 && acc.j.status === 'accepted');
  check('customer now sees the driver phone, driver sees the customer phone', (await call(priya, 'GET', `/bookings/${b1.id}`)).j.other.phone === '+91 90000 01000' || /^\+91/.test((await call(priya, 'GET', `/bookings/${b1.id}`)).j.other.phone || '') );
  check('customer phone revealed to driver after accept', /^\+91/.test((await call(ramesh, 'GET', `/bookings/${b1.id}`)).j.other.phone || ''));
  check('accepting the overlapping request now fails', (await act(ramesh, b2.id, 'accept')).s === 409);
  check('new overlapping request is refused up front', (await book(demoIds && (await demoToken('Imran')), R, at(day + 5, 11), at(day + 5, 13))).s === 409);
  check('search now marks the driver busy', (await q(at(day + 5, 11), at(day + 5, 13))).j.drivers.find((d) => d.id === R).unavailable_reason === 'Already booked at that time');
  check('customer got an "accepted" notification', (await titles(priya)).some((t) => t.includes('accepted your request')));
  check('decline works for the other request', (await act(ramesh, b2.id, 'decline')).j.status === 'declined');
  check('declined request cannot be accepted later', (await act(ramesh, b2.id, 'accept')).s === 400);
  check('chat closed after decline', (await call(arjun, 'POST', `/bookings/${b2.id}/messages`, { body: 'hello?' })).s === 400);

  section('5. Chat and notifications');
  const m1 = await call(priya, 'POST', `/bookings/${b1.id}/messages`, { body: 'Please bring your licence' });
  check('customer message stored', m1.s === 201);
  check('empty message rejected', (await call(priya, 'POST', `/bookings/${b1.id}/messages`, { body: '   ' })).s === 400);
  await call(priya, 'POST', `/bookings/${b1.id}/messages`, { body: 'Second message' });
  const inbox = (await call(ramesh, 'GET', `/bookings/${b1.id}/messages`)).j;
  check('driver reads both messages in order', inbox.length === 2 && inbox[0].body === 'Please bring your licence');
  check('"after" returns only newer messages', (await call(ramesh, 'GET', `/bookings/${b1.id}/messages?after=${inbox[0].id}`)).j.length === 1);
  check('two unread messages collapse into one notification', (await call(ramesh, 'GET', '/notifications')).j.items.filter((i) => i.kind === 'message' && i.link === `/bookings/${b1.id}`).length === 1);
  await call(ramesh, 'POST', `/bookings/${b1.id}/messages`, { body: 'See you at 10' });
  check('reply reaches the customer as a notification', (await titles(priya)).some((t) => t.includes('New message from')));
  const before = (await call(priya, 'GET', '/notifications')).j.unread;
  await call(priya, 'POST', '/notifications/read', { link: `/bookings/${b1.id}` });
  check('reading a page clears its notifications', (await call(priya, 'GET', '/notifications')).j.unread === 0 && before > 0);
  check('marking read needs a target', (await call(priya, 'POST', '/notifications/read', {})).s === 400);
  const unread = (await call(ramesh, 'GET', '/notifications')).j;
  await call(arjun, 'POST', '/notifications/read', { all: true });
  check("one user cannot clear another's notifications", (await call(ramesh, 'GET', '/notifications')).j.unread === unread.unread);

  section('6. Completion, payment, reviews');
  check('review before completion refused', (await call(priya, 'POST', `/bookings/${b1.id}/review`, { rating: 5 })).s === 400);
  check('customer cannot mark complete', (await act(priya, b1.id, 'complete')).s === 400);
  check('customer cannot mark paid', (await act(priya, b1.id, 'paid')).s === 400);
  check('driver marks paid', (await act(ramesh, b1.id, 'paid')).j.paid === true);
  check('driver completes the job', (await act(ramesh, b1.id, 'complete')).j.status === 'completed');
  check('rating must be 1 to 5', (await call(priya, 'POST', `/bookings/${b1.id}/review`, { rating: 6 })).s === 400 && (await call(priya, 'POST', `/bookings/${b1.id}/review`, { rating: 0 })).s === 400);
  check('customer reviews the driver', (await call(priya, 'POST', `/bookings/${b1.id}/review`, { rating: 4, comment: 'Good' })).s === 201);
  check('second review by the same person refused', (await call(priya, 'POST', `/bookings/${b1.id}/review`, { rating: 1 })).s === 409);
  check('driver reviews the customer', (await call(ramesh, 'POST', `/bookings/${b1.id}/review`, { rating: 5 })).s === 201);
  check('stranger cannot review', (await call(arjun, 'POST', `/bookings/${b1.id}/review`, { rating: 1 })).s === 404);
  const after = await call(null, 'GET', `/drivers/${R}`);
  check('driver rating and review count updated (1 seeded 5-star + this 4-star = 4.5 from 2)', after.j.rating_count === 2 && after.j.rating_avg === 4.5 && after.j.reviews[0].rating === 4, JSON.stringify([after.j.rating_avg, after.j.rating_count]));
  check('each side sees the other review on the booking', (await call(priya, 'GET', `/bookings/${b1.id}`)).j.their_review?.rating === 5);

  section('7. Cancellation');
  const b3 = (await book(priya, S, at(day + 6, 9), at(day + 6, 12))).j;
  check('customer cancels a pending request', (await act(priya, b3.id, 'cancel')).j.status === 'cancelled');
  check('driver was told', (await titles(suresh)).some((t) => t.includes('cancelled the booking')));
  check('cannot cancel twice', (await act(priya, b3.id, 'cancel')).s === 400);
  check('cancelled slot is free again', (await q(at(day + 6, 9), at(day + 6, 12))).j.drivers.find((d) => d.id === S).available === true);
  const b4 = (await book(priya, S, at(day + 7, 9), at(day + 7, 12))).j;
  await act(suresh, b4.id, 'accept');
  check('driver can cancel an accepted booking', (await act(suresh, b4.id, 'cancel')).j.status === 'cancelled');
  check('chat closed after cancel', (await call(priya, 'POST', `/bookings/${b4.id}/messages`, { body: 'hello' })).s === 400);

  section('8. Becoming a driver (applications, documents, admin)');
  const cand = mkUser('candidate@example.test', { phone: '+919000000077', verified: true });
  const listing = { experience_years: 6, dl_number: 'KA0520190012345', dl_expiry: '2032-01-01', id_type: 'Aadhaar', id_number: 'ABCD12345678', transmission: 'both',
    vehicle_types: '["Sedan","SUV"]', languages: 'Hindi', bio: 'Careful driver', rate_hour: 150, rate_day: 1000, rate_week: 6000, lat: 12.98, lng: 77.61,
    area_label: 'Shivajinagar', availability: JSON.stringify([{ weekday: 1, start_min: 480, end_min: 1200 }, { weekday: 2, start_min: 480, end_min: 1200 }]) };
  const form = (over = {}, files = true) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ ...listing, ...over })) f.set(k, v);
    if (files) { f.set('photo', file('p.png')); f.set('dl_file', file('dl.png')); f.set('id_file', file('id.png')); }
    return f;
  };
  check('unverified phone cannot apply', (await call(fresh.token, 'POST', '/driver/apply', null, form())).s === 400);
  check('application without files rejected', (await call(cand.token, 'POST', '/driver/apply', null, form({}, false))).s === 400);
  check('expired licence rejected', (await call(cand.token, 'POST', '/driver/apply', null, form({ dl_expiry: '2020-01-01' }))).s === 400);
  check('experience under a year rejected', (await call(cand.token, 'POST', '/driver/apply', null, form({ experience_years: 0 }))).s === 400);
  check('bad rate rejected', (await call(cand.token, 'POST', '/driver/apply', null, form({ rate_hour: -5 }))).s === 400);
  check('no working day rejected', (await call(cand.token, 'POST', '/driver/apply', null, form({ availability: '[]' }))).s === 400);
  check('overlapping or invalid hours rejected', (await call(cand.token, 'POST', '/driver/apply', null, form({ availability: JSON.stringify([{ weekday: 1, start_min: 900, end_min: 600 }]) }))).s === 400);
  const badType = form(); badType.set('photo', file('x.txt', 'text/plain', Buffer.from('hello')));
  check('a text file is refused as a photo', (await call(cand.token, 'POST', '/driver/apply', null, badType)).s === 400);
  const big = form(); big.set('dl_file', file('big.png', 'image/png', Buffer.alloc(6 * 1024 * 1024)));
  check('a 6 MB file is refused', (await call(cand.token, 'POST', '/driver/apply', null, big)).s === 400);
  check('nothing was saved by the failed attempts', (await call(cand.token, 'GET', '/driver/me')).j === null);
  const applied = await call(cand.token, 'POST', '/driver/apply', null, form());
  check('valid application is pending', applied.s === 201 && applied.j.status === 'pending');
  check('applying twice is refused', (await call(cand.token, 'POST', '/driver/apply', null, form())).s === 409);
  check('pending driver is invisible in search', !(await q(at(day, 10), at(day, 12))).j.drivers.some((d) => d.id === cand.id));
  check('admins were notified', (await titles(admin)).some((t) => t.includes('applied to be a driver')));
  check('non-admin cannot list applications', (await call(priya, 'GET', '/admin/drivers')).s === 403);
  check('non-admin cannot decide', (await call(priya, 'POST', `/admin/drivers/${cand.id}/review`, { decision: 'approve' })).s === 403);
  const queue = (await call(admin, 'GET', '/admin/drivers?status=pending')).j;
  const entry = queue.find((d) => d.user_id === cand.id);
  check('admin sees the application with documents', !!entry && !!entry.dl_file && entry.dl_number === 'KA0520190012345');
  check('admin can open the licence image', (await call(admin, 'GET', `/files/${entry.dl_file}`)).s === 200);
  check('the applicant can open their own document', (await call(cand.token, 'GET', `/files/${entry.dl_file}`)).s === 200);
  check('another user cannot open it', (await call(priya, 'GET', `/files/${entry.dl_file}`)).s === 403);
  check('nobody signed out can open it', (await call(null, 'GET', `/files/${entry.dl_file}`)).s === 401);
  check('documents are not reachable through the public photo route', (await call(null, 'GET', `/photo/${entry.dl_file}`)).s === 404);
  check('the profile photo is public', (await call(null, 'GET', `/photo/${entry.photo_file}`)).s === 200);
  check('path tricks do not read other files', (await call(admin, 'GET', '/files/..%2F..%2F.env')).s === 404);
  check('rejection needs a reason', (await call(admin, 'POST', `/admin/drivers/${cand.id}/review`, { decision: 'reject' })).s === 400);
  check('admin rejects with a reason', (await call(admin, 'POST', `/admin/drivers/${cand.id}/review`, { decision: 'reject', reason: 'Licence photo is blurry' })).s === 200);
  const rej = (await call(cand.token, 'GET', '/driver/me')).j;
  check('applicant sees the reason', rej.status === 'rejected' && rej.rejection_reason === 'Licence photo is blurry');
  check('applicant was notified', (await titles(cand.token)).some((t) => t.includes('not approved')));
  const reapplied = await call(cand.token, 'POST', '/driver/apply', null, form({}, false));
  check('after rejection they can re-apply, keeping earlier uploads', reapplied.s === 201 && reapplied.j.status === 'pending');
  check('admin approves', (await call(admin, 'POST', `/admin/drivers/${cand.id}/review`, { decision: 'approve' })).s === 200);
  check('applicant told they are approved', (await titles(cand.token)).some((t) => t.includes('approved as a driver')));
  const nextMonday = (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(10, 0, 0, 0); return d; })();
  const mondaySearch = await q(nextMonday.toISOString(), new Date(nextMonday.getTime() + 2 * 3600e3).toISOString());
  check('approved driver is now in search and available on a working day', mondaySearch.j.drivers.find((d) => d.id === cand.id)?.available === true);
  const wed = new Date(nextMonday); wed.setDate(wed.getDate() + 2);
  check('and unavailable on a day off', (await q(wed.toISOString(), new Date(wed.getTime() + 3600e3).toISOString())).j.drivers.find((d) => d.id === cand.id)?.unavailable_reason === 'Does not work on that day');
  check('admin stats add up', (await call(admin, 'GET', '/admin/stats')).j.approved === 9);

  section('9. Driver dashboard');
  const mine = (await call(cand.token, 'GET', '/driver/me')).j;
  const edit = (over) => ({ transmission: mine.transmission, vehicle_types: mine.vehicle_types, languages: mine.languages, bio: mine.bio, rate_hour: mine.rate_hour, rate_day: mine.rate_day,
    rate_week: mine.rate_week, lat: mine.lat, lng: mine.lng, area_label: mine.area_label, availability: mine.availability, ...over });
  check('non-driver cannot edit a listing', (await call(priya, 'PUT', '/driver/me', edit({}))).s === 403);
  check('driver changes rates', (await call(cand.token, 'PUT', '/driver/me', edit({ rate_hour: 200 }))).j.rate_hour === 200);
  check('new rate shows in search', (await q(nextMonday.toISOString(), new Date(nextMonday.getTime() + 3600e3).toISOString())).j.drivers.find((d) => d.id === cand.id).est_total === 200);
  check('invalid edit rejected', (await call(cand.token, 'PUT', '/driver/me', edit({ rate_day: 0 }))).s === 400);
  check('driver pauses the listing', (await call(cand.token, 'PUT', '/driver/me', edit({ paused: true }))).j.paused === 1);
  check('paused driver disappears from search', !(await q(nextMonday.toISOString(), new Date(nextMonday.getTime() + 3600e3).toISOString())).j.drivers.some((d) => d.id === cand.id));
  check('and cannot be booked', (await book(priya, cand.id, nextMonday.toISOString(), new Date(nextMonday.getTime() + 3600e3).toISOString())).s === 404);
  check('admin removes a driver from listing', (await call(admin, 'POST', `/admin/drivers/${cand.id}/review`, { decision: 'reject', reason: 'Test removal' })).s === 200);
  check('removed driver is gone from public view', (await call(null, 'GET', `/drivers/${cand.id}`)).s === 404);

  section('10. Robustness');
  const weird = (await call(priya, 'POST', `/bookings/${b1.id}/messages`, { body: '<script>alert(1)</script> \' OR 1=1 --' }));
  check('script and SQL text is stored harmlessly as text', weird.s === 201 && weird.j.body.includes('<script>'));
  check('search survives odd sort and radius values', (await q(at(day, 10), at(day, 12), "&sort=';DROP TABLE users;--&radius=abc")).s === 200);
  check('users table still exists after that', db.prepare('SELECT COUNT(*) n FROM users').get().n > 10);
  check('malformed JSON body gives a clean error', (await fetch(`http://localhost:${PORT}/api/me`, { method: 'PUT', headers: { Authorization: `Bearer ${priya}`, 'Content-Type': 'application/json' }, body: '{oops' })).status === 400);
  check('no server crash during the run', !/TypeError|ReferenceError|Unhandled|ECONN/.test(serverLog), serverLog.slice(-300));
} finally {
  server.kill();
  db.close();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL: ' + f);
process.exit(failures.length ? 1 : 0);
