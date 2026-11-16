import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, defaultStart, fmtDate, hoursSummary, inr, plural, TRANSMISSION } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AdSlot, Avatar, DurationField, ErrorBox, LocationPicker, Rating, Verified } from '../components.jsx';

const RATE = { hourly: 'rate_hour', daily: 'rate_day', weekly: 'rate_week' };

export default function DriverPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const here = useLocation();
  const [driver, setDriver] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    start: params.get('start') && new Date(params.get('start')) > new Date() ? params.get('start') : defaultStart(),
    plan: RATE[params.get('plan')] ? params.get('plan') : 'hourly',
    units: Number(params.get('units')) || 4,
    pickup: params.get('lat') ? { lat: Number(params.get('lat')), lng: Number(params.get('lng')), label: params.get('label') } : null,
    vehicle_desc: '', notes: '',
  }));
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

  const total = driver[RATE[form.plan]] * (Number(form.units) || 0);
  const isSelf = user?.id === driver.id;

  async function submit(e) {
    e.preventDefault();
    if (!form.pickup) return setError('Set the pickup location.');
    setBusy(true); setError('');
    try {
      const b = await api('/bookings', {
        method: 'POST',
        body: {
          driver_id: driver.id, plan: form.plan, units: form.units, start: new Date(form.start).toISOString(),
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
            <label className="field">When
              <input type="datetime-local" value={form.start} onChange={(e) => set({ start: e.target.value })} required />
            </label>
            <DurationField plan={form.plan} units={form.units} onChange={set} />
            <div className="field">Pickup location
              <LocationPicker value={form.pickup} onChange={(pickup) => set({ pickup })} />
            </div>
            <label className="field">Your car
              <input value={form.vehicle_desc} onChange={(e) => set({ vehicle_desc: e.target.value })} placeholder="e.g. Honda City, automatic" required />
            </label>
            <label className="field">Note
              <textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Optional" />
            </label>
            <div className="total"><span>Total</span><strong>{inr(total)}</strong></div>
            <ErrorBox>{error}</ErrorBox>
            {!user ? (
              <Link className="btn btn-primary btn-block" to="/login" state={{ from: here.pathname + here.search }}>Sign in to request</Link>
            ) : !user.phone ? (
              <Link className="btn btn-primary btn-block" to="/profile" state={{ from: here.pathname + here.search }}>Add your phone number to request</Link>
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
