const TOKEN_KEY = 'doc_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

/** api('/bookings', { method: 'POST', body: {...} }) or { form: FormData } for uploads. */
export async function api(path, { method = 'GET', body, form, blob } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = (await res.json()).error || message;
    } catch { /* not JSON */ }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return blob ? res.blob() : res.json();
}

// ---------- formatting helpers ----------
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
export const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? '' : 's'}`;
export const fmtDateTime = (ms) =>
  new Date(ms).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
/** "Wed 18 Nov, 10:00 am to 2:00 pm", or both dates when the span crosses midnight. */
export const fmtRange = (start, end) => {
  const s = new Date(start), e = new Date(end);
  const time = (d) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return s.toDateString() === e.toDateString() ? `${fmtDateTime(start)} to ${time(e)}` : `${fmtDateTime(start)} to ${fmtDateTime(end)}`;
};
const HOUR = 3600e3;
/** "4 hours", "3 days", "2 weeks". Same wording as the server. */
export const durationLabel = (start, end) => {
  const hours = Math.max(1, Math.ceil((new Date(end) - new Date(start)) / HOUR));
  if (hours < 24) return plural(hours, 'hour');
  const days = Math.ceil(hours / 24);
  return days % 7 === 0 ? plural(days / 7, 'week') : plural(days, 'day');
};
/** Live price for a span. Mirrors quote() in server/src/lib.js, which decides the real total. */
export const quoteTotal = (rates, start, end) => {
  const span = new Date(end) - new Date(start);
  if (!(span > 0)) return null;
  const hours = Math.max(1, Math.ceil(span / HOUR));
  if (hours <= 24) return Math.min(hours * rates.rate_hour, rates.rate_day);
  const days = Math.ceil(hours / 24), weeks = Math.floor(days / 7), rest = days % 7;
  const byWeek = weeks * rates.rate_week + Math.min(rest * rates.rate_day, rates.rate_week);
  return weeks > 0 ? Math.min(byWeek, days * rates.rate_day) : days * rates.rate_day;
};
export const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtMin = (m) => {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h % 12 || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 || h === 24 ? 'am' : 'pm'}`;
};
/** [{weekday, start_min, end_min}] -> ["Every day, 6 am to 11 pm"] or ["Mon to Sat, 8 am to 8 pm"]. */
export const hoursSummary = (slots) => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byDay = [1, 2, 3, 4, 5, 6, 0].map((d) => slots.find((s) => s.weekday === d) || null); // Monday first
  const groups = [];
  byDay.forEach((s, i) => {
    if (!s) return;
    const last = groups[groups.length - 1];
    if (last && last.to === i - 1 && last.s.start_min === s.start_min && last.s.end_min === s.end_min) last.to = i;
    else groups.push({ from: i, to: i, s });
  });
  const name = (i) => days[(i + 1) % 7];
  return groups.map((g) => {
    const span = g.from === 0 && g.to === 6 ? 'Every day' : g.from === g.to ? name(g.from) : `${name(g.from)} to ${name(g.to)}`;
    return `${span}, ${fmtMin(g.s.start_min)} to ${fmtMin(g.s.end_min)}`;
  });
};
/** Date -> value for <input type="datetime-local"> in local time. */
export const toLocalInput = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const defaultStart = () => {
  const d = new Date(Date.now() + 90 * 60000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return toLocalInput(d);
};
/** Default "To": four hours after the given "From". */
export const defaultEnd = (start) => toLocalInput(new Date(new Date(start).getTime() + 4 * HOUR));
export const TRANSMISSION = { manual: 'Manual', automatic: 'Automatic', both: 'Manual and automatic' };
