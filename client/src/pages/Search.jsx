import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, defaultStart, fmtDateTime, inr, plural, PLAN_UNIT } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AdSlot, Avatar, DurationField, ErrorBox, LocationPicker, MapView, Rating, Verified } from '../components.jsx';

const SAVED = 'doc_search'; // remembers the form fields across reloads (not the results)
let lastSearch = null; // the search run during this visit; cleared by a page reload
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
  const [view, setView] = useState('list');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const run = useCallback(async (f) => {
    if (!f.location) return setError('Choose a pickup location first.');
    setBusy(true); setError('');
    try {
      const params = new URLSearchParams({
        lat: f.location.lat, lng: f.location.lng, radius: f.radius, plan: f.plan, units: f.units,
        start: new Date(f.start).toISOString(), sort: f.sort,
      });
      setResult(await api(`/drivers/search?${params}`));
      setSearched(f);
      lastSearch = f;
      sessionStorage.setItem(SAVED, JSON.stringify(f));
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }, []);

  // Results appear only after the person presses "Find drivers". The one exception is coming
  // back from a driver's page in the same visit: then the search they already ran is shown again.
  useEffect(() => {
    if (lastSearch) { setForm(lastSearch); run(lastSearch); }
    /* eslint-disable-next-line */
  }, []);

  const openDriver = useCallback((d) => navigate(`/drivers/${d.id}?${searchQuery(searched)}`), [navigate, searched]);
  // Radius and sort live with the results: changing one re-runs the same search.
  const refine = (patch) => { set(patch); run({ ...searched, ...patch }); };

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

  const heading = !result ? ''
    : result.available_count > 0 ? `${plural(result.available_count, 'driver')} available`
    : result.drivers.length > 0 ? 'No drivers free at that time'
    : 'No drivers nearby yet';

  return (
    <>
      <section className="hero">
        <h1>Your car. A trusted driver.</h1>
        <p>Hire a verified driver by the hour, day or week.</p>
        <form className="search card" onSubmit={(e) => { e.preventDefault(); run(form); }}>
          <div className="field">Pickup location
            <LocationPicker value={form.location} onChange={(location) => set({ location })} />
          </div>
          <div className="search-row">
            <label className="field">When
              <input type="datetime-local" value={form.start} onChange={(e) => set({ start: e.target.value })} required />
            </label>
            <DurationField plan={form.plan} units={form.units} onChange={set} />
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Searching…' : 'Find drivers'}</button>
          </div>
          <ErrorBox>{error}</ErrorBox>
        </form>
      </section>

      {result && searched ? (
        <section className="results">
          <div className="results-head">
            <div>
              <h2>{heading}</h2>
              <p className="muted">{fmtDateTime(result.start)} · price for {plural(result.units, PLAN_UNIT[result.plan])}</p>
            </div>
            <div className="results-tools">
              <select value={form.radius} aria-label="Search distance" onChange={(e) => refine({ radius: Number(e.target.value) })}>
                {[5, 10, 20, 40].map((r) => <option key={r} value={r}>Within {r} km</option>)}
              </select>
              <select value={form.sort} aria-label="Sort by" onChange={(e) => refine({ sort: e.target.value })}>
                <option value="distance">Nearest first</option>
                <option value="price">Lowest price</option>
                <option value="rating">Top rated</option>
              </select>
            </div>
          </div>

          {result.drivers.length === 0 ? (
            <div className="card empty">
              <p>Try a wider distance.</p>
              {config.demoMode && <button className="btn btn-ghost" onClick={addDemo} disabled={busy}>Add demo drivers here</button>}
            </div>
          ) : (
            <div className={`results-grid show-${view}`}>
              {/* Phones show the list or the map, one at a time. Wider screens show both. */}
              <div className="view-switch" role="tablist" aria-label="Results view">
                <button role="tab" aria-selected={view === 'list'} onClick={() => setView('list')}>List</button>
                <button role="tab" aria-selected={view === 'map'} onClick={() => setView('map')}>Map</button>
              </div>
              <ul className="driver-list">
                {result.drivers.map((d, i) => (
                  <li key={d.id}>
                    <DriverCard d={d} to={`/drivers/${d.id}?${searchQuery(searched)}`} />
                    {i === 3 && <AdSlot size="inline" />}
                  </li>
                ))}
              </ul>
              <div className="results-side">
                <MapView center={searched.location} radiusKm={searched.radius} drivers={result.drivers} onSelect={openDriver} />
              </div>
            </div>
          )}
        </section>
      ) : (
        <ol className="how">
          <li><b>Search</b> for drivers near you</li>
          <li><b>Request</b> the one you like</li>
          <li><b>Ride</b> in your own car</li>
        </ol>
      )}
      <AdSlot />
    </>
  );
}

function DriverCard({ d, to }) {
  return (
    <Link to={to} className={`card driver-card ${d.available ? '' : 'driver-off'}`}>
      <Avatar name={d.name} photo={d.photo} size={56} />
      <div className="driver-main">
        <div className="driver-name">{d.name} <Verified compact /></div>
        <div className="driver-meta">
          <Rating avg={d.rating_avg} count={d.rating_count} />
          <span>{d.experience_years} yrs<span className="hide-phone"> experience</span></span>
          <span>{d.distance_km} km<span className="hide-phone"> away</span></span>
        </div>
        {!d.available && <div className="driver-reason">{d.unavailable_reason}</div>}
      </div>
      <strong className="driver-price">{inr(d.est_total)}</strong>
    </Link>
  );
}
