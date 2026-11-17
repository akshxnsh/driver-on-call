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
 * How codes are delivered, chosen from server/.env:
 * - Twilio Verify, when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID are all set.
 *   Twilio makes, texts and checks the code, so this server stores nothing secret.
 * - Demo, when DEMO_MODE=true and Twilio is not set: nothing is sent and the page shows the code.
 * - Otherwise sending is refused rather than faked.
 * To use another provider (MSG91, Firebase...), replace the two functions below.
 */
const twilio = () => {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_VERIFY_SERVICE_SID: service } = process.env;
  if (!sid || !token || !service) return null;
  const base = process.env.TWILIO_API_BASE || 'https://verify.twilio.com';
  return { service, base, auth: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') };
};

async function twilioCall(t, path, fields) {
  let res;
  try {
    res = await fetch(`${t.base}/v2/Services/${t.service}/${path}`, {
      method: 'POST',
      headers: { Authorization: t.auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(502, 'Could not reach the text message service. Try again.');
  }
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

/** Returns { demo: true } in demo mode, or {} after Twilio has sent the text. */
async function startVerification(user, code) {
  const t = twilio();
  if (t) {
    const r = await twilioCall(t, 'Verifications', { To: user.phone, Channel: 'sms' });
    if (r.ok) return {};
    console.error('Twilio send failed:', r.status, r.body.code, r.body.message);
    if (r.body.code === 60203) fail(429, 'Too many codes sent to this number. Try again later.');
    if (r.body.code === 60200 || r.body.code === 21211) fail(400, 'That mobile number cannot receive texts.');
    // On a Twilio trial account only numbers you have verified in the Twilio console can be texted.
    fail(502, r.status === 403 || r.body.code === 21608
      ? 'Twilio will only text numbers verified in its console while on a trial account.'
      : 'The text could not be sent. Try again in a minute.');
  }
  if (process.env.DEMO_MODE === 'true') return { demo: true, code };
  throw new HttpError(503, 'Text messages are not set up on this server yet.');
}

/** True when the code is right. */
async function checkCode(user, code, row) {
  const t = twilio();
  if (t) {
    const r = await twilioCall(t, 'VerificationCheck', { To: user.phone, Code: code });
    if (r.ok) return r.body.status === 'approved';
    if (r.status === 404) fail(400, 'That code has expired. Ask for a new one.');
    console.error('Twilio check failed:', r.status, r.body.code, r.body.message);
    fail(502, 'The code could not be checked. Try again.');
  }
  return crypto.timingSafeEqual(Buffer.from(hash(user, code)), Buffer.from(row.code_hash));
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
  const sent = await startVerification(user, code);
  q.run(
    `INSERT INTO otp_codes (user_id, phone, code_hash, expires_at, attempts, last_sent_at, window_start, sends)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET phone = excluded.phone, code_hash = excluded.code_hash, expires_at = excluded.expires_at,
       attempts = 0, last_sent_at = excluded.last_sent_at, window_start = excluded.window_start, sends = excluded.sends`,
    user.id, user.phone, twilio() ? 'twilio' : hash(user, code), now + TTL, now, freshWindow ? now : row.window_start, freshWindow ? 1 : row.sends + 1
  );
  return { resend_in: COOLDOWN / 1000, ...(sent.demo ? { demo_code: sent.code } : {}) };
}

export async function verifyOtp(user, input) {
  const code = String(input || '').trim();
  if (!/^\d{6}$/.test(code)) fail(400, 'Enter the 6-digit code');
  const row = q.get('SELECT * FROM otp_codes WHERE user_id = ?', user.id);
  if (!row || row.phone !== user.phone) fail(400, 'Ask for a code first');
  if (Date.now() > row.expires_at) fail(400, 'That code has expired. Ask for a new one.');
  if (row.attempts >= MAX_ATTEMPTS) fail(429, 'Too many wrong tries. Ask for a new code.');
  const ok = await checkCode(user, code, row);
  if (!ok) {
    q.run('UPDATE otp_codes SET attempts = attempts + 1 WHERE user_id = ?', user.id);
    fail(400, 'That code is not right');
  }
  q.run('UPDATE users SET phone_verified_at = ? WHERE id = ?', Date.now(), user.id);
  q.run('DELETE FROM otp_codes WHERE user_id = ?', user.id);
}
