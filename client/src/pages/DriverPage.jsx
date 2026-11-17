import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, defaultEnd, defaultStart, durationLabel, fmtDate, hoursSummary, inr, plural, quoteTotal, TRANSMISSION } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AdSlot, Avatar, ErrorBox, LocationPicker, Rating, SpanFields, Verified } from '../components.jsx';

export default function DriverPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const here = useLocation();
  const [driver, setDriver] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => {
    // Carried over from the search; fall back to "soon, for four hours".
    const ahead = (v) => v && new Date(v) > new Date();
    const start = ahead(params.get('start')) ? params.get('start') : defaultStart();
    const end = ahead(params.get('end')) && new Date(params.get('end')) > new Date(start) ? params.get('end') : defaultEnd(start);
    return {
      start, end,
      pickup: params.get('lat') ? { lat: Number(params.get('lat')), lng: Number(params.get('lng')), label: params.get('label') } : null,
      vehicle_desc: '', notes: '',
    };
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    api(`/drivers/${id}`).then(setDriver).catch((e) => setError(e.message));
  }, [id]);

  // Track whether the booking form is on screen, to show or hide the phone shortcut bar.
  const formRef = useRef(null);
  const [formVisible, setFormVisible] = useState(true);
  useEffect(() => {
    if (!formRef.current) return;
    const io = new IntersectionObserver(([entry]) => setFormVisible(entry.isIntersecting), { threshold: 0.05 });
    io.observe(formRef.current);
    return () => io.disconnect();
  }, [driver]);

  if (error && !driver) return <ErrorBox>{error}</ErrorBox>;
  if (!driver) return <p className="loading">Loading…</p>;

  const total = quoteTotal(driver, form.start, form.end);
  const isSelf = user?.id === driver.id;

  async function submit(e) {
    e.preventDefault();
    if (!form.pickup) return setError('Set the pickup location.');
    if (total === null) return setError('The To time must be after the From time.');
    setBusy(true); setError('');
    try {
      const b = await api('/bookings', {
        method: 'POST',
        body: {
          driver_id: driver.id, start: new Date(form.start).toISOString(), end: new Date(form.end).toISOString(),
          lat: form.pickup.lat, lng: form.pickup.lng, pickup_label: form.pickup.label,
          vehicle_desc: form.vehicle_desc, notes: form.notes,
        },
      });
      navigate(`/bookings/${b.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="two-col">
        <div>
          <section className="card profile-head">
            <Avatar name={driver.name} photo={driver.photo} size={88} />
            <div>
              <h1>{driver.name} <Verified /></h1>
              <div className="driver-meta">
                <Rating avg={driver.rating_avg} count={driver.rating_count} />
                <span>{plural(driver.experience_years, 'year')} experience</span>
                <span>{driver.area_label}</span>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="rates">
              <div><strong>{inr(driver.rate_hour)}</strong><span>per hour</span></div>
              <div><strong>{inr(driver.rate_day)}</strong><span>per day</span></div>
              <div><strong>{inr(driver.rate_week)}</strong><span>per week</span></div>
            </div>
          </section>

          <section className="card">
            <h2>About</h2>
            {driver.bio && <p>{driver.bio}</p>}
            <dl className="facts">
              <div><dt>Drives</dt><dd>{TRANSMISSION[driver.transmission]} · {driver.vehicle_types.join(', ')}</dd></div>
              {driver.languages && <div><dt>Speaks</dt><dd>{driver.languages}</dd></div>}
              <div><dt>Works</dt><dd>{hoursSummary(driver.availability).map((line) => <div key={line}>{line}</div>)}</dd></div>
            </dl>
          </section>

          <section className="card">
            <h2>Reviews</h2>
            {driver.reviews.length === 0 && <p className="muted">No reviews yet.</p>}
            <ul className="reviews">
              {driver.reviews.map((r, i) => (
                <li key={i}>
                  <div><span className="star">{'★'.repeat(r.rating)}</span><span className="star-off">{'★'.repeat(5 - r.rating)}</span> <b>{r.author}</b> <span className="muted">{fmtDate(r.created_at)}</span></div>
                  {r.comment && <p>{r.comment}</p>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside>
          <form className="card book" id="book" ref={formRef} onSubmit={submit}>
            <h2>Request this driver</h2>
            {driver.paused && <p className="alert">Not taking new bookings right now.</p>}
            <SpanFields start={form.start} end={form.end} onChange={set} />
            <div className="field">Pickup location
              <LocationPicker value={form.pickup} onChange={(pickup) => set({ pickup })} />
            </div>
            <label className="field">Your car
              <input value={form.vehicle_desc} onChange={(e) => set({ vehicle_desc: e.target.value })} placeholder="e.g. Honda City, automatic" required />
            </label>
            <label className="field">Note
              <textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Optional" />
            </label>
            <div className="total">
              <span>{total === null ? 'Total' : `Total for ${durationLabel(form.start, form.end)}`}</span>
              <strong>{total === null ? '—' : inr(total)}</strong>
            </div>
            <ErrorBox>{error}</ErrorBox>
            {!user ? (
              <Link className="btn btn-primary btn-block" to="/login" state={{ from: here.pathname + here.search }}>Sign in to request</Link>
            ) : !user.phone_verified ? (
              <Link className="btn btn-primary btn-block" to="/profile" state={{ from: here.pathname + here.search }}>Verify your phone number to request</Link>
            ) : isSelf ? (
              <p className="muted">This is your own listing.</p>
            ) : (
              <button className="btn btn-primary btn-block" disabled={busy || driver.paused}>{busy ? 'Sending…' : 'Send request'}</button>
            )}
            <p className="hint">You pay the driver directly. Fuel, tolls and parking are yours.</p>
          </form>
        </aside>

        {/* Phones: the booking form sits below the profile, so keep a shortcut to it on screen. */}
        {!formVisible && !isSelf && (
          <div className="book-cta">
            <span><strong>{inr(driver.rate_hour)}</strong> per hour</span>
            <button className="btn btn-primary" onClick={() => formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Request this driver</button>
          </div>
        )}
      </div>
      <AdSlot />
    </>
  );
}
