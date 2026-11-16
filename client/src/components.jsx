import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { PLAN_MAX, WEEKDAYS, inr } from './api.js';

export function Avatar({ name, photo, size = 56 }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const style = { width: size, height: size, fontSize: size * 0.36 };
  return photo
    ? <img className="avatar" src={photo} alt="" style={style} referrerPolicy="no-referrer" />
    : <span className="avatar avatar-initials" style={style} aria-hidden="true">{initials}</span>;
}

export function Rating({ avg, count }) {
  if (!count) return <span className="rating">New</span>;
  return (
    <span className="rating" aria-label={`Rated ${avg.toFixed(1)} out of 5 from ${count} review${count === 1 ? '' : 's'}`}>
      <span className="star" aria-hidden="true">★</span> {avg.toFixed(1)} <span className="rating-count">({count})</span>
    </span>
  );
}

/** compact: on phones show only the tick, to keep list rows on one line. */
export const Verified = ({ compact }) => (
  <span className="badge badge-verified" title="Driving licence and identity checked by DOC" aria-label="Verified">
    ✓<span className={compact ? 'hide-phone' : ''}> Verified</span>
  </span>
);

/** "For [4] [hours]": how long the driver is hired for. */
export function DurationField({ plan, units, onChange }) {
  return (
    <div className="field">For
      <div className="duration">
        <input type="number" min="1" max={PLAN_MAX[plan]} value={units} aria-label="How many" required
          onChange={(e) => onChange({ units: e.target.value })} />
        <select value={plan} aria-label="Hours, days or weeks" onChange={(e) => onChange({ plan: e.target.value, units: 1 })}>
          <option value="hourly">hours</option>
          <option value="daily">days</option>
          <option value="weekly">weeks</option>
        </select>
      </div>
    </div>
  );
}

const STATUS_LABEL = {
  requested: 'Waiting for driver', accepted: 'Confirmed', declined: 'Declined',
  cancelled: 'Cancelled', completed: 'Completed', pending: 'Under review',
  approved: 'Approved', rejected: 'Not approved',
};
export const StatusChip = ({ status }) => <span className={`chip chip-${status}`}>{STATUS_LABEL[status] || status}</span>;

export const ErrorBox = ({ children }) => (children ? <p className="alert alert-error" role="alert">{children}</p> : null);

/** Placeholder for an ad unit. Swap the inside for a real ad tag (e.g. AdSense) later. */
export function AdSlot({ size = 'leaderboard' }) {
  return (
    <aside className={`ad-slot ad-${size}`} aria-label="Advertisement">
      <span className="ad-tag">Ad</span>
    </aside>
  );
}

// ---------- location ----------
const NOMINATIM = 'https://nominatim.openstreetmap.org';

/** value: { lat, lng, label } | null. Uses OpenStreetMap search and the browser's location. */
export function LocationPicker({ value, onChange, placeholder = 'Area, landmark or city' }) {
  const [text, setText] = useState(value?.label || '');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => setText(value?.label || ''), [value?.label]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function search(e) {
    e?.preventDefault();
    if (text.trim().length < 3) return setError('Type at least 3 letters');
    setBusy('search'); setError(''); setResults([]); setOpen(true);
    try {
      const res = await fetch(`${NOMINATIM}/search?format=jsonv2&limit=5&countrycodes=in&q=${encodeURIComponent(text.trim())}`);
      const rows = await res.json();
      if (rows.length === 0) setError('No place found. Try a nearby landmark or the city name.');
      setResults(rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), label: r.display_name.split(',').slice(0, 3).join(',') })));
    } catch {
      setError('Place search is unavailable right now');
    }
    setBusy('');
  }

  function useCurrent() {
    if (!navigator.geolocation) return setError('This browser cannot share location');
    setBusy('gps'); setError(''); setResults([]); setOpen(false);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const loc = { lat: coords.latitude, lng: coords.longitude, label: 'Current location' };
        try {
          const res = await fetch(`${NOMINATIM}/reverse?format=jsonv2&zoom=16&lat=${loc.lat}&lon=${loc.lng}`);
          const row = await res.json();
          if (row.display_name) loc.label = row.display_name.split(',').slice(0, 3).join(',');
        } catch { /* keep the generic label */ }
        onChange(loc);
        setBusy('');
      },
      () => { setError('Could not get your location. Allow location access or search instead.'); setBusy(''); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="loc" ref={box}>
      <div className="loc-row">
        <input
          value={text} placeholder={busy === 'gps' ? 'Finding your location…' : placeholder} aria-label="Location"
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Enter' && search(e)}
        />
        <button type="button" className="btn btn-ghost" onClick={search} disabled={!!busy}>
          {busy === 'search' ? 'Searching…' : 'Search'}
        </button>
      </div>
      {open && (
        <ul className="loc-results">
          <li><button type="button" className="loc-current" onClick={useCurrent}>◎ Use my current location</button></li>
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => { onChange(r); setResults([]); setOpen(false); }}>{r.label}</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

// ---------- map ----------
export function MapView({ center, radiusKm, drivers = [], onSelect, height = 420 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const bounds = useRef(null);

  useEffect(() => {
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView([center.lat, center.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    // The map is created before the page layout settles; re-measure and re-fit whenever its box changes.
    const ro = new ResizeObserver(() => {
      map.current.invalidateSize();
      if (bounds.current) map.current.fitBounds(bounds.current, { padding: [10, 10] });
    });
    ro.observe(el.current);
    return () => { ro.disconnect(); map.current.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const g = layer.current;
    g.clearLayers();
    const here = [center.lat, center.lng];
    L.circleMarker(here, { radius: 8, color: '#fff', weight: 3, fillColor: '#1d4ed8', fillOpacity: 1 })
      .bindTooltip('Your location').addTo(g);
    if (radiusKm) {
      const circle = L.circle(here, { radius: radiusKm * 1000, color: '#0b5d4d', weight: 1, fillOpacity: 0.05 }).addTo(g);
      bounds.current = circle.getBounds();
      map.current.invalidateSize();
      map.current.fitBounds(bounds.current, { padding: [10, 10] });
    } else {
      bounds.current = null;
      map.current.setView(here, 14);
    }
    drivers.forEach((d) => {
      const icon = L.divIcon({
        className: '',
        html: `<span class="pin ${d.available === false ? 'pin-off' : ''}">${inr(d.est_total ?? d.rate_hour)}</span>`,
        iconSize: [0, 0],
      });
      const m = L.marker([d.lat, d.lng], { icon }).bindTooltip(d.name).addTo(g);
      if (onSelect) m.on('click', () => onSelect(d));
    });
  }, [center.lat, center.lng, radiusKm, drivers, onSelect]);

  return <div ref={el} className="map" style={{ height }} />;
}

// ---------- driver listing fields (shared by the application form and the dashboard) ----------
const VEHICLES = ['Hatchback', 'Sedan', 'SUV', 'Luxury'];
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const emptyListing = () => ({
  transmission: 'both', vehicle_types: ['Hatchback', 'Sedan'], languages: '', bio: '',
  rate_hour: '', rate_day: '', rate_week: '', location: null,
  week: WEEKDAYS.map((_, i) => ({ on: i !== 0, start: '07:00', end: '21:00' })),
});
export const listingFromProfile = (p) => ({
  transmission: p.transmission, vehicle_types: p.vehicle_types, languages: p.languages || '', bio: p.bio || '',
  rate_hour: p.rate_hour, rate_day: p.rate_day, rate_week: p.rate_week,
  location: { lat: p.lat, lng: p.lng, label: p.area_label },
  week: WEEKDAYS.map((_, i) => {
    const s = p.availability.find((a) => a.weekday === i);
    return s ? { on: true, start: toTime(s.start_min), end: toTime(Math.min(s.end_min, 1439)) } : { on: false, start: '07:00', end: '21:00' };
  }),
});
/** Listing form state -> plain fields for the API. */
export const listingPayload = (l) => ({
  transmission: l.transmission, vehicle_types: l.vehicle_types, languages: l.languages, bio: l.bio,
  rate_hour: l.rate_hour, rate_day: l.rate_day, rate_week: l.rate_week,
  lat: l.location?.lat, lng: l.location?.lng, area_label: l.location?.label,
  availability: l.week.map((d, i) => ({ weekday: i, start_min: toMin(d.start), end_min: toMin(d.end), on: d.on }))
    .filter((d) => d.on).map(({ on, ...slot }) => slot),
});

export function ListingFields({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const setDay = (i, patch) => set({ week: value.week.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const toggleVehicle = (v) =>
    set({ vehicle_types: value.vehicle_types.includes(v) ? value.vehicle_types.filter((x) => x !== v) : [...value.vehicle_types, v] });

  return (
    <>
      <fieldset>
        <legend>What you can drive</legend>
        <label className="field">Transmission
          <select value={value.transmission} onChange={(e) => set({ transmission: e.target.value })}>
            <option value="both">Manual and automatic</option>
            <option value="manual">Manual only</option>
            <option value="automatic">Automatic only</option>
          </select>
        </label>
        <div className="field">Vehicle types
          <div className="checks">
            {VEHICLES.map((v) => (
              <label key={v} className="check">
                <input type="checkbox" checked={value.vehicle_types.includes(v)} onChange={() => toggleVehicle(v)} /> {v}
              </label>
            ))}
          </div>
        </div>
        <label className="field">Languages you speak
          <input value={value.languages} onChange={(e) => set({ languages: e.target.value })} placeholder="Hindi, English, Kannada" />
        </label>
        <label className="field">About you
          <textarea rows={3} maxLength={600} value={value.bio} onChange={(e) => set({ bio: e.target.value })}
            placeholder="Shown on your public profile" />
        </label>
      </fieldset>

      <fieldset>
        <legend>Your rates (₹)</legend>
        <div className="grid-3">
          {[['rate_hour', 'Per hour'], ['rate_day', 'Per day'], ['rate_week', 'Per week']].map(([k, label]) => (
            <label key={k} className="field">{label}
              <input type="number" min="1" inputMode="numeric" value={value[k]} onChange={(e) => set({ [k]: e.target.value })} required />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Base location</legend>
        <LocationPicker value={value.location} onChange={(location) => set({ location })} />
      </fieldset>

      <fieldset>
        <legend>Working days and hours</legend>
        <div className="week">
          {value.week.map((d, i) => (
            <div key={i} className={`week-row ${d.on ? '' : 'week-off'}`}>
              <label className="check">
                <input type="checkbox" checked={d.on} onChange={(e) => setDay(i, { on: e.target.checked })} /> {WEEKDAYS[i]}
              </label>
              {d.on ? (
                <span className="week-times">
                  <input type="time" value={d.start} aria-label={`${WEEKDAYS[i]} start`} onChange={(e) => setDay(i, { start: e.target.value })} />
                  <span>to</span>
                  <input type="time" value={d.end} aria-label={`${WEEKDAYS[i]} end`} onChange={(e) => setDay(i, { end: e.target.value })} />
                </span>
              ) : <span className="muted">Day off</span>}
            </div>
          ))}
        </div>
      </fieldset>
    </>
  );
}
