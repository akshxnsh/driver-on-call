import crypto from 'node:crypto';
import { q } from './db.js';
import { HttpError, fail } from './lib.js';

try { q.run('ALTER TABLE users ADD COLUMN phone_verified_at INTEGER'); } catch { /* column already exists */ }
q.run(`
CREATE TABLE IF NOT EXISTS otp_codes (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_sent_at INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  sends INTEGER NOT NULL DEFAULT 1
)`);

const TTL = 5 * 60e3;        // a code works for 5 minutes
const COOLDOWN = 30e3;       // at least 30 seconds between sends
const MAX_SENDS = 5;         // sends per hour per user
const MAX_ATTEMPTS = 5;      // wrong guesses before the code is thrown away

/** Seeded demo accounts have fake numbers, so they count as verified. */
export const phoneVerified = (user) => !!user.phone_verified_at || !!user.is_demo;

const hash = (user, code) =>
  crypto.createHash('sha256').update(`${user.id}:${user.phone}:${code}:${process.env.JWT_SECRET || ''}`).digest('hex');

/**
 * The one place a text message leaves the server.
 * Demo mode: nothing is sent; the code is returned so the page can show it.
 * Real use: call your SMS provider here (MSG91, Twilio, ...). In India the message text must match
 * a template registered with DLT. Until that is wired in, real sending is refused rather than faked.
 */
async function sendSms(phone, text) {
  if (process.env.DEMO_MODE === 'true') return { demo: true };
  throw new HttpError(503, 'Text messages are not set up on this server yet.');
}

export async function sendOtp(user) {
  if (!user.phone) fail(400, 'Save your mobile number first');
  if (phoneVerified(user)) fail(400, 'This number is already verified');
  const now = Date.now();
  const row = q.get('SELECT * FROM otp_codes WHERE user_id = ?', user.id);
  const sameNumber = row && row.phone === user.phone;
  if (sameNumber && now - row.last_sent_at < COOLDOWN) {
    fail(429, `Wait ${Math.ceil((COOLDOWN - (now - row.last_sent_at)) / 1000)} seconds before asking for another code`);
  }
  const freshWindow = !sameNumber || now - row.window_start > 3600e3;
  if (!freshWindow && row.sends >= MAX_SENDS) fail(429, 'Too many codes requested. Try again in an hour.');

  const code = String(crypto.randomInt(100000, 1000000));
  const sent = await sendSms(user.phone, `${code} is your DOC verification code. It is valid for 5 minutes.`);
  q.run(
    `INSERT INTO otp_codes (user_id, phone, code_hash, expires_at, attempts, last_sent_at, window_start, sends)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET phone = excluded.phone, code_hash = excluded.code_hash, expires_at = excluded.expires_at,
       attempts = 0, last_sent_at = excluded.last_sent_at, window_start = excluded.window_start, sends = excluded.sends`,
    user.id, user.phone, hash(user, code), now + TTL, now, freshWindow ? now : row.window_start, freshWindow ? 1 : row.sends + 1
  );
  return { resend_in: COOLDOWN / 1000, ...(sent.demo ? { demo_code: code } : {}) };
}

export function verifyOtp(user, input) {
  const code = String(input || '').trim();
  if (!/^\d{6}$/.test(code)) fail(400, 'Enter the 6-digit code');
  const row = q.get('SELECT * FROM otp_codes WHERE user_id = ?', user.id);
  if (!row || row.phone !== user.phone) fail(400, 'Ask for a code first');
  if (Date.now() > row.expires_at) fail(400, 'That code has expired. Ask for a new one.');
  if (row.attempts >= MAX_ATTEMPTS) fail(429, 'Too many wrong tries. Ask for a new code.');
  const ok = crypto.timingSafeEqual(Buffer.from(hash(user, code)), Buffer.from(row.code_hash));
  if (!ok) {
    q.run('UPDATE otp_codes SET attempts = attempts + 1 WHERE user_id = ?', user.id);
    fail(400, 'That code is not right');
  }
  q.run('UPDATE users SET phone_verified_at = ? WHERE id = ?', Date.now(), user.id);
  q.run('DELETE FROM otp_codes WHERE user_id = ?', user.id);
}
