import { q } from './db.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (status, message) => {
  throw new HttpError(status, message);
};

const HOUR = 3600e3;
export const MAX_SPAN = 84 * 24 * HOUR; // 12 weeks

/**
 * Splits a span into whole weeks, whole days and the hours left over (to the minute).
 */
const spanParts = (start, end) => {
  const minutes = Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
  const weeks = Math.floor(minutes / 10080);
  const days = Math.floor((minutes % 10080) / 1440);
  const restMinutes = minutes % 1440;
  return { minutes, weeks, days, restMinutes };
};
const priceOf = (rates, p) => {
  // Leftover hours at the hourly rate (never more than one day), days at the day rate
  // (days + hours never more than one week), weeks at the weekly rate.
  const hourPart = Math.min((p.restMinutes / 60) * rates.rate_hour, rates.rate_day);
  const dayPart = Math.min(p.days * rates.rate_day + hourPart, rates.rate_week);
  return Math.round(p.weeks * rates.rate_week + dayPart);
};
/** "4 hours 30 minutes", "2 days 9 hours", "1 week 2 days": the exact difference. */
export const durationLabel = (start, end) => {
  const p = spanParts(start, end);
  const say = (n, word) => (n ? `${n} ${word}${n === 1 ? '' : 's'}` : '');
  return [say(p.weeks, 'week'), say(p.days, 'day'), say(Math.floor(p.restMinutes / 60), 'hour'), say(p.restMinutes % 60, 'minute')]
    .filter(Boolean).join(' ') || '0 minutes';
};

/**
 * Price for hiring a driver from start to end, for exactly the time between them.
 * The same rule is repeated in client/src/api.js for the live total; keep the two in step.
 */
export function quote(rates, start, end) {
  const p = spanParts(start, end);
  return {
    total: priceOf(rates, p),
    plan: p.weeks ? 'weekly' : p.days ? 'daily' : 'hourly', // the largest unit involved
    units: Math.max(1, Math.round(p.minutes / 60)),         // length in hours, rounded, for the record
  };
}

export function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Is the driver free for [start, end)?
 * - The start must fall inside the driver's working hours for that weekday.
 * - A job that starts and ends on the same day must also end inside those hours.
 * - No accepted booking may overlap the span.
 * Weekdays and hours use the server's local time zone (run it in IST for India).
 */
export function availabilityIssue(driverId, start, end, ignoreBookingId = 0) {
  const s = new Date(start), e = new Date(end);
  const slot = q.get(
    'SELECT start_min, end_min FROM availability WHERE driver_id = ? AND weekday = ?',
    driverId, s.getDay()
  );
  if (!slot) return 'Does not work on that day';
  const startMin = s.getHours() * 60 + s.getMinutes();
  if (startMin < slot.start_min || startMin >= slot.end_min) return 'Outside working hours';
  if (s.toDateString() === e.toDateString() && e.getHours() * 60 + e.getMinutes() > slot.end_min) {
    return 'Ends after working hours';
  }
  const clash = q.get(
    `SELECT id FROM bookings WHERE driver_id = ? AND status = 'accepted'
     AND start_at < ? AND end_at > ? AND id != ?`,
    driverId, end, start, ignoreBookingId
  );
  if (clash) return 'Already booked at that time';
  return null;
}

const DRIVER_SELECT = `
  SELECT d.*, u.name, u.photo_url, u.created_at AS member_since,
    (SELECT AVG(r.rating) FROM reviews r JOIN bookings b ON b.id = r.booking_id
      WHERE r.subject_id = d.user_id AND b.driver_id = d.user_id) AS rating_avg,
    (SELECT COUNT(*) FROM reviews r JOIN bookings b ON b.id = r.booking_id
      WHERE r.subject_id = d.user_id AND b.driver_id = d.user_id) AS rating_count,
    (SELECT COUNT(*) FROM bookings b WHERE b.driver_id = d.user_id AND b.status = 'completed') AS trips
  FROM driver_profiles d JOIN users u ON u.id = d.user_id`;

export const listedDrivers = () =>
  q.all(`${DRIVER_SELECT} WHERE d.status = 'approved' AND d.paused = 0`);
export const driverRow = (id) => q.get(`${DRIVER_SELECT} WHERE d.user_id = ?`, id);

export const photoOf = (row) =>
  row.photo_file ? `/api/photo/${row.photo_file}` : row.photo_url || null;

/** What any visitor may see about a listed driver. No phone, no documents. */
export function driverPublic(row) {
  return {
    id: row.user_id,
    name: row.name,
    photo: photoOf(row),
    bio: row.bio,
    experience_years: row.experience_years,
    transmission: row.transmission,
    vehicle_types: JSON.parse(row.vehicle_types),
    languages: row.languages,
    rate_hour: row.rate_hour,
    rate_day: row.rate_day,
    rate_week: row.rate_week,
    area_label: row.area_label,
    lat: row.lat,
    lng: row.lng,
    rating_avg: row.rating_avg ? Math.round(row.rating_avg * 10) / 10 : null,
    rating_count: row.rating_count,
    trips: row.trips,
    member_since: row.member_since,
  };
}

export function parseSlots(raw) {
  let slots = raw;
  if (typeof raw === 'string') {
    try {
      slots = JSON.parse(raw);
    } catch {
      fail(400, 'Availability is not valid');
    }
  }
  if (!Array.isArray(slots) || slots.length === 0) fail(400, 'Choose at least one working day');
  const seen = new Set();
  return slots.map((s) => {
    const weekday = Number(s.weekday), start_min = Number(s.start_min), end_min = Number(s.end_min);
    const ok =
      Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 && !seen.has(weekday) &&
      Number.isInteger(start_min) && Number.isInteger(end_min) &&
      start_min >= 0 && end_min <= 1440 && start_min < end_min;
    if (!ok) fail(400, 'Working hours are not valid');
    seen.add(weekday);
    return { weekday, start_min, end_min };
  });
}

const VEHICLES = ['Hatchback', 'Sedan', 'SUV', 'Luxury'];
/** Validates the driver fields that the driver can edit at any time. */
export function parseListing(body) {
  const int = (v) => Number.parseInt(v, 10);
  const rate_hour = int(body.rate_hour), rate_day = int(body.rate_day), rate_week = int(body.rate_week);
  if (![rate_hour, rate_day, rate_week].every((r) => r > 0 && r <= 500000)) {
    fail(400, 'Enter hourly, daily and weekly rates in rupees');
  }
  const lat = Number(body.lat), lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !String(body.area_label || '').trim()) {
    fail(400, 'Set your base location');
  }
  if (!['manual', 'automatic', 'both'].includes(body.transmission)) fail(400, 'Choose a transmission type');
  let vehicles = body.vehicle_types;
  if (typeof vehicles === 'string') {
    try {
      vehicles = JSON.parse(vehicles);
    } catch {
      vehicles = [];
    }
  }
  vehicles = (Array.isArray(vehicles) ? vehicles : []).filter((v) => VEHICLES.includes(v));
  if (vehicles.length === 0) fail(400, 'Choose at least one vehicle type you can drive');
  return {
    rate_hour, rate_day, rate_week, lat, lng,
    area_label: String(body.area_label).trim().slice(0, 200),
    transmission: body.transmission,
    vehicle_types: JSON.stringify(vehicles),
    bio: String(body.bio || '').trim().slice(0, 600),
    languages: String(body.languages || '').trim().slice(0, 120),
  };
}
