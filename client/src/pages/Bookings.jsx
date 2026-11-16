import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, durationLabel, fmtRange, inr } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AdSlot, Avatar, ErrorBox, Rating, StatusChip } from '../components.jsx';
import { refreshNotifications } from '../Notifications.jsx';

export function BookingList() {
  const { user } = useAuth();
  const isDriver = user.driver_status === 'approved';
  const [as, setAs] = useState('customer');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    api(`/bookings?as=${as}`).then(setRows).catch((e) => setError(e.message));
  }, [as]);

  return (
    <>
      <h1>My bookings</h1>
      {isDriver && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={as === 'customer'} onClick={() => setAs('customer')}>I hired</button>
          <button role="tab" aria-selected={as === 'driver'} onClick={() => setAs('driver')}>I am driving</button>
        </div>
      )}
      <ErrorBox>{error}</ErrorBox>
      {!rows ? <p className="loading">Loading…</p> : rows.length === 0 ? (
        <div className="card empty">
          <p>{as === 'driver' ? 'No requests yet.' : 'No bookings yet.'}</p>
          {as === 'customer' && <Link className="btn btn-primary" to="/">Find a driver</Link>}
        </div>
      ) : (
        <ul className="booking-list">
          {rows.map((b) => (
            <li key={b.id}>
              <Link to={`/bookings/${b.id}`} className="card booking-row">
                <Avatar name={b.other.name} photo={b.other.photo} size={48} />
                <div className="booking-row-main">
                  <b>{b.other.name}</b>
                  <p>{fmtRange(b.start_at, b.end_at)}</p>
                </div>
                <div className="booking-row-side"><StatusChip status={b.status} /><strong>{inr(b.est_total)}</strong></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <AdSlot />
    </>
  );
}

export function BookingDetail() {
  const { id } = useParams();
  const [b, setB] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () => api(`/bookings/${id}`).then((x) => {
      if (!live) return;
      setB(x);
      // The person is looking at this booking, so its notifications count as read.
      if (!document.hidden) {
        api('/notifications/read', { method: 'POST', body: { link: `/bookings/${id}` } }).then(refreshNotifications).catch(() => {});
      }
    }).catch((e) => live && setError(e.message));
    load();
    const t = setInterval(load, 8000); // pick up accept / decline from the other side
    return () => { live = false; clearInterval(t); };
  }, [id]);

  if (error && !b) return <ErrorBox>{error}</ErrorBox>;
  if (!b) return <p className="loading">Loading…</p>;

  async function act(action, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setError('');
    try {
      setB(await api(`/bookings/${id}/action`, { method: 'POST', body: { action } }));
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  const driver = b.role === 'driver';
  const contactOpen = b.status === 'accepted' || b.status === 'completed';

  return (
    <div className="two-col">
      <div>
        <p><Link to="/bookings">← All bookings</Link></p>
        <section className="card">
          <div className="booking-head">
            <h1>Booking #{b.id}</h1>
            <StatusChip status={b.status} />
          </div>
          <dl className="facts">
            <div><dt>From</dt><dd>{fmtRange(b.start_at, b.end_at)} · {durationLabel(b.start_at, b.end_at)}</dd></div>
            <div><dt>Pickup</dt><dd>{b.pickup_label} <a href={`https://www.openstreetmap.org/?mlat=${b.lat}&mlon=${b.lng}#map=16/${b.lat}/${b.lng}`} target="_blank" rel="noreferrer">map</a></dd></div>
            {b.vehicle_desc && <div><dt>Car</dt><dd>{b.vehicle_desc}</dd></div>}
            {b.notes && <div><dt>Note</dt><dd>{b.notes}</dd></div>}
            <div><dt>Total</dt><dd><strong>{inr(b.est_total)}</strong> {b.paid && <span className="chip chip-accepted">Paid</span>}</dd></div>
          </dl>

          <ErrorBox>{error}</ErrorBox>
          <div className="actions">
            {driver && b.status === 'requested' && (
              <>
                <button className="btn btn-primary" disabled={busy} onClick={() => act('accept')}>Accept request</button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => act('decline', 'Decline this request?')}>Decline</button>
              </>
            )}
            {driver && b.status === 'accepted' && (
              <button className="btn btn-primary" disabled={busy} onClick={() => act('complete', 'Mark this job as completed?')}>Mark job completed</button>
            )}
            {driver && contactOpen && !b.paid && (
              <button className="btn btn-ghost" disabled={busy} onClick={() => act('paid')}>Mark as paid</button>
            )}
            {(b.status === 'accepted' || (b.status === 'requested' && !driver)) && (
              <button className="btn btn-danger" disabled={busy} onClick={() => act('cancel', 'Cancel this booking?')}>Cancel booking</button>
            )}
          </div>
        </section>

        {b.status === 'completed' && <ReviewBox b={b} onDone={setB} />}
        <Chat booking={b} />
      </div>

      <aside>
        <section className="card person">
          <h2>{driver ? 'Customer' : 'Your driver'}</h2>
          <Avatar name={b.other.name} photo={b.other.photo} size={72} />
          <b>{driver ? b.other.name : <Link to={`/drivers/${b.other.id}`}>{b.other.name}</Link>}</b>
          <Rating avg={b.other.rating_avg} count={b.other.rating_count} />
          {contactOpen
            ? <a className="btn btn-primary btn-block" href={`tel:${b.other.phone}`}>📞 {b.other.phone}</a>
            : <p className="hint">Phone number appears once the request is accepted.</p>}
        </section>
      </aside>
    </div>
  );
}

function ReviewBox({ b, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  if (b.my_review) {
    return (
      <section className="card">
        <h2>Reviews</h2>
        <p>You rated {b.other.name}: <span className="star">{'★'.repeat(b.my_review.rating)}</span> {b.my_review.comment}</p>
        {b.their_review && <p>{b.other.name} rated you: <span className="star">{'★'.repeat(b.their_review.rating)}</span> {b.their_review.comment}</p>}
      </section>
    );
  }
  async function submit(e) {
    e.preventDefault();
    try {
      onDone(await api(`/bookings/${b.id}/review`, { method: 'POST', body: { rating, comment } }).then(() => api(`/bookings/${b.id}`)));
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>Rate {b.other.name}</h2>
      <div className="star-pick" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} stars`}
            className={n <= rating ? 'star' : 'star-off'} onClick={() => setRating(n)}>★</button>
        ))}
      </div>
      <label className="field">Comment
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional" />
      </label>
      <ErrorBox>{error}</ErrorBox>
      <button className="btn btn-primary">Submit review</button>
    </form>
  );
}

function Chat({ booking }) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const last = useRef(0);
  const box = useRef(null);
  const closed = booking.status === 'declined' || booking.status === 'cancelled';

  useEffect(() => {
    let live = true;
    last.current = 0;
    setMsgs([]);
    const poll = async () => {
      try {
        const fresh = await api(`/bookings/${booking.id}/messages?after=${last.current}`);
        if (!live || fresh.length === 0) return;
        last.current = fresh[fresh.length - 1].id;
        setMsgs((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
      } catch { /* try again on the next tick */ }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => { live = false; clearInterval(t); };
  }, [booking.id]);

  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [msgs.length]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const m = await api(`/bookings/${booking.id}/messages`, { method: 'POST', body: { body: text } });
      last.current = Math.max(last.current, m.id);
      setMsgs((all) => (all.some((x) => x.id === m.id) ? all : [...all, m]));
      setText(''); setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card chat">
      <h2>Messages</h2>
      <div className="chat-box" ref={box}>
        {msgs.length === 0 && <p className="muted">No messages yet.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`bubble ${m.sender_id === user.id ? 'bubble-me' : ''}`}>
            {m.body}<time>{new Date(m.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</time>
          </div>
        ))}
      </div>
      <ErrorBox>{error}</ErrorBox>
      {closed ? <p className="muted">This conversation is closed.</p> : (
        <form className="chat-send" onSubmit={send}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" aria-label="Message" maxLength={1000} />
          <button className="btn btn-primary">Send</button>
        </form>
      )}
    </section>
  );
}
