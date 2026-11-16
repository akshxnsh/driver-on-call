import { q } from './db.js';

q.run(`
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT NOT NULL,
  read_at INTEGER,
  created_at INTEGER NOT NULL
)`);
q.run('CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, id)');

/**
 * Records a notification for one user. The web app shows it under the bell and,
 * if the user allowed it, as a desktop alert.
 *
 * collapse: replace an unread notification of the same kind and link instead of
 * stacking (used for chat, so ten messages show as one line).
 *
 * To reach people who do not have the app open, send SMS / WhatsApp / email
 * from here: this is the single place every event passes through.
 */
export function notify(userId, kind, title, body, link, { collapse = false } = {}) {
  if (collapse) {
    q.run('DELETE FROM notifications WHERE user_id = ? AND kind = ? AND link = ? AND read_at IS NULL', userId, kind, link);
  }
  q.run(
    'INSERT INTO notifications (user_id, kind, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    userId, kind, title, body || '', link, Date.now()
  );
}

export const notifyAdmins = (kind, title, body, link) =>
  q.all("SELECT id FROM users WHERE role = 'admin'").forEach((a) => notify(a.id, kind, title, body, link));

export const when = (ms) =>
  new Date(ms).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
