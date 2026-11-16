import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, defaultStart, fmtDateTime, inr, plural, PLAN_MAX, PLAN_UNIT, TRANSMISSION } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AdSlot, Avatar, ErrorBox, LocationPicker, MapView, Rating, Verified } from '../components.jsx';

const SAVED = 'doc_search';
const loadSaved = () => {
  try {
    const s = JSON.parse(sessionStorage.getItem(SAVED));
    if (s && new Date(s.start) > new Date()) return s;
    if (s) return { ...s, start: defaultStart() };
  } catch { /* ignore */ }
  return { location: null, start: defaultStart(), plan: 'hourly', units: 4, radius: 10, sort: 'distance' };
};

/** Query string that carries the search to the driver page, so the booking form is pre-filled. */
export const searchQuery = (f) => new URLSearchParams({
  start: f.start, plan: f.plan, units: f.units,
  ...(f.location ? { lat: f.location.lat, lng: f.location.lng, label: f.location.label } : {}),
}).toString();

export default function Search() {
  const { config } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(loadSaved);
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(null); // the form values the current results belong to
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const run = useCallback(async (f) => {
    if (!f.location) return setError('Set your location first: search for a place or use your current location.');
    setBusy(true); setError('');
    try {
      const params = new URLSearchParams({
        lat: f.location.lat, lng: f.location.lng, radius: f.radius, plan: f.plan, units: f.units,
        start: new Date(f.start).toISOString(), sort: f.sort,
      });
      setResult(await api(`/drivers/search?${params}`));
      setSearched(f);
      sessionStorage.setItem(SAVED, JSON.stringify(f));
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }, []);

  // Re-run the last search when coming back to this page.
  useEffect(() => { if (form.location) run(form); /* eslint-disable-next-line */ }, []);

  const openDriver = useCallback((d) => navigate(`/drivers/${d.id}?${searchQuery(searched)}`), [navigate, searched]);

  async function addDemo() {
    setBusy(true);
    try {
      await api('/dev/seed-near', { method: 'POST', body: { lat: form.location.lat, lng: form.location.lng, label: form.location.label } });
      await run(form);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <h1>Your car. A trusted driver.</h1>
        <p>Hire a verified driver near you by the hour, day or week. They come to you and drive your own vehicle wherever you need to go.</p>
        <form className="search card" onSubmit={(e) => { e.preventDefault(); run(form); }}>
          <div className="field search-loc">Where should the driver come?
            <LocationPicker value={form.location} onChange={(location) => { set({ location }); run({ ...form, location }); }} />
          </div>
          <div className="search-row">
            <label className="field">Start
              <input type="datetime-local" value={form.start} onChange={(e) => set({ start: e.target.value })} required />
            </label>
            <label className="field">Hire by
              <select value={form.plan} onChange={(e) => set({ plan: e.target.value, units: 1 })}>
                <option value="hourly">Hour</option>
                <option value="daily">Day</option>
                <option value="weekly">Week</option>
              </select>
            </label>
            <label className="field">How many {PLAN_UNIT[form.plan]}s
              <input type="number" min="1" max={PLAN_MAX[form.plan]} value={form.units} onChange={(e) => set({ units: e.target.value })} required />
            </label>
            <label className="field">Within
              <select value={form.radius} onChange={(e) => set({ radius: Number(e.target.value) })}>
                {[5, 10, 20, 40].map((r) => <option key={r} value={r}>{r} km</option>)}
              </select>
            </label>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Searching…' : 'Find drivers'}</button>
          </div>
          <ErrorBox>{error}</ErrorBox>
        </form>
      </section>

      {result && searched && (
        <section className="results">
          <div className="results-head">
            <div>
              <h2>{result.available_count === 0 ? 'No drivers available' : `${plural(result.available_count, 'driver')} available`}</h2>
              <p className="muted">
                {fmtDateTime(result.start)} · {plural(result.units, PLAN_UNIT[result.plan])} · within {searched.radius} km of {searched.location.label}
                {result.drivers.length > result.available_count && ` · ${result.drivers.length - result.available_count} more nearby but busy or off duty then`}
              </p>
            </div>
            <label className="field field-inline">Sort by
              <select value={form.sort} onChange={(e) => { set({ sort: e.target.value }); run({ ...searched, sort: e.target.value }); }}>
                <option value="distance">Nearest</option>
                <option value="price">Lowest price</option>
                <option value="rating">Top rated</option>
              </select>
            </label>
          </div>

          {result.drivers.length === 0 ? (
            <div className="card empty">
              <p>No approved drivers are listed within {searched.radius} km of this location yet. Try a wider radius.</p>
              {config.demoMode && (
                <p><button className="btn btn-ghost" onClick={addDemo} disabled={busy}>Add demo drivers near here</button>
                  <br /><span className="muted">Demo mode only: creates sample approved drivers around this point.</span></p>
              )}
            </div>
          ) : (
            <div className="results-grid">
              <ul className="driver-list">
                {result.drivers.map((d, i) => (
                  <li key={d.id}>
                    <DriverCard d={d} to={`/drivers/${d.id}?${searchQuery(searched)}`} plan={result.plan} units={result.units} />
                    {i === 2 && <AdSlot size="inline" />}
                  </li>
                ))}
              </ul>
              <div className="results-side">
                <MapView center={searched.location} radiusKm={searched.radius} drivers={result.drivers} onSelect={openDriver} />
                <AdSlot size="rectangle" />
              </div>
            </div>
          )}
        </section>
      )}

      {!result && (
        <section className="how">
          <div><b>1. Search</b><p>Set your location and when you need a driver. See who is free nearby, with their price and rating.</p></div>
          <div><b>2. Request</b><p>Pick a driver and send a request. Chat in the app; phone numbers are shared once the driver accepts.</p></div>
          <div><b>3. Ride</b><p>The driver arrives at your place and drives your car. Pay them directly, then rate each other.</p></div>
        </section>
      )}
      <AdSlot />
    </>
  );
}

function DriverCard({ d, to, plan, units }) {
  return (
    <Link to={to} className={`card driver-card ${d.available ? '' : 'driver-off'}`}>
      <Avatar name={d.name} photo={d.photo} size={64} />
      <div className="driver-main">
        <div className="driver-name">{d.name} <Verified /></div>
        <Rating avg={d.rating_avg} count={d.rating_count} />
        <p className="driver-meta">
          {plural(d.experience_years, 'year')} experience · {TRANSMISSION[d.transmission]} · {d.vehicle_types.join(', ')}
        </p>
        <p className="driver-meta">{d.distance_km} km away · {d.area_label}</p>
      </div>
      <div className="driver-price">
        <strong>{inr(d.est_total)}</strong>
        <span className="muted">for {plural(units, PLAN_UNIT[plan])}</span>
        {d.available
          ? <span className="chip chip-accepted">Available</span>
          : <span className="chip chip-declined">{d.unavailable_reason}</span>}
      </div>
    </Link>
  );
}
