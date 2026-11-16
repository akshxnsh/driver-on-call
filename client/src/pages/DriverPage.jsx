import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, defaultStart, fmtDate, fmtMin, inr, plural, PLAN_MAX, PLAN_UNIT, TRANSMISSION, WEEKDAYS } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AdSlot, Avatar, ErrorBox, LocationPicker, Rating, Verified } from '../components.jsx';

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
    <div className="two-col">
      <div>
        <section className="card profile-head">
          <Avatar name={driver.name} photo={driver.photo} size={96} />
          <div>
            <h1>{driver.name} <Verified /></h1>
            <Rating avg={driver.rating_avg} count={driver.rating_count} />
            <p className="muted">{driver.area_label} · Member since {fmtDate(driver.member_since)} · {plural(driver.trips, 'completed booking')}</p>
          </div>
        </section>

        <section className="card">
          <h2>About</h2>
          {driver.bio && <p>{driver.bio}</p>}
          <dl className="facts">
            <div><dt>Experience</dt><dd>{plural(driver.experience_years, 'year')}</dd></div>
            <div><dt>Transmission</dt><dd>{TRANSMISSION[driver.transmission]}</dd></div>
            <div><dt>Can drive</dt><dd>{driver.vehicle_types.join(', ')}</dd></div>
            {driver.languages && <div><dt>Languages</dt><dd>{driver.languages}</dd></div>}
          </dl>
          <p className="verified-note">✓ Driving licence and identity proof checked by the DOC team.</p>
        </section>

        <section className="card">
          <h2>Rates</h2>
          <div className="rates">
            <div><strong>{inr(driver.rate_hour)}</strong><span>per hour</span></div>
            <div><strong>{inr(driver.rate_day)}</strong><span>per day</span></div>
            <div><strong>{inr(driver.rate_week)}</strong><span>per week</span></div>
          </div>
          <p className="hint">Fuel, tolls and parking are paid by the car owner. For multi-day trips, agree food and stay with the driver in chat.</p>
        </section>

        <section className="card">
          <h2>Working hours</h2>
          <ul className="hours">
            {WEEKDAYS.map((day, i) => {
              const s = driver.availability.find((a) => a.weekday === i);
              return <li key={day}><span>{day}</span><span className={s ? '' : 'muted'}>{s ? `${fmtMin(s.start_min)} to ${fmtMin(s.end_min)}` : 'Day off'}</span></li>;
            })}
          </ul>
        </section>

        <section className="card">
          <h2>Reviews</h2>
          {driver.reviews.length === 0 && <p className="muted">No reviews yet.</p>}
          <ul className="reviews">
            {driver.reviews.map((r, i) => (
              <li key={i}>
                <div><span className="star">{'★'.repeat(r.rating)}</span><span className="star-off">{'★'.repeat(5 - r.rating)}</span> <b>{r.author}</b> <span className="muted">· {fmtDate(r.created_at)}</span></div>
                {r.comment && <p>{r.comment}</p>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside>
        <form className="card book" onSubmit={submit}>
          <h2>Request this driver</h2>
          {driver.paused && <p className="alert">This driver is not taking new bookings right now.</p>}
          <label className="field">Start
            <input type="datetime-local" value={form.start} onChange={(e) => set({ start: e.target.value })} required />
          </label>
          <div className="grid-2">
            <label className="field">Hire by
              <select value={form.plan} onChange={(e) => set({ plan: e.target.value, units: 1 })}>
                <option value="hourly">Hour</option><option value="daily">Day</option><option value="weekly">Week</option>
              </select>
            </label>
            <label className="field">How many {PLAN_UNIT[form.plan]}s
              <input type="number" min="1" max={PLAN_MAX[form.plan]} value={form.units} onChange={(e) => set({ units: e.target.value })} required />
            </label>
          </div>
          <div className="field">Pickup location
            <LocationPicker value={form.pickup} onChange={(pickup) => set({ pickup })} />
          </div>
          <label className="field">Your car
            <input value={form.vehicle_desc} onChange={(e) => set({ vehicle_desc: e.target.value })} placeholder="e.g. Honda City, automatic" required />
          </label>
          <label className="field">Note for the driver <span className="muted">(optional)</span>
            <textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Where you plan to go, anything they should know" />
          </label>
          <div className="total"><span>Estimated total</span><strong>{inr(total)}</strong></div>
          <p className="hint">Pay the driver directly in cash or UPI. Nothing is charged in the app.</p>
          <ErrorBox>{error}</ErrorBox>
          {!user ? (
            <Link className="btn btn-primary btn-block" to="/login" state={{ from: here.pathname + here.search }}>Sign in to send request</Link>
          ) : !user.phone ? (
            <Link className="btn btn-primary btn-block" to="/profile" state={{ from: here.pathname + here.search }}>Complete your profile to book</Link>
          ) : isSelf ? (
            <p className="muted">This is your own listing.</p>
          ) : (
            <button className="btn btn-primary btn-block" disabled={busy || driver.paused}>{busy ? 'Sending…' : 'Send request'}</button>
          )}
          <p className="hint">The driver's phone number is shared with you once they accept.</p>
        </form>
        <AdSlot size="rectangle" />
      </aside>
    </div>
  );
}
