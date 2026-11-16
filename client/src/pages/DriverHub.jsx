import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { emptyListing, ErrorBox, ListingFields, listingFromProfile, listingPayload, StatusChip } from '../components.jsx';

/** /driver: application form, application status, or the approved driver's dashboard. */
export default function DriverHub() {
  const { refresh } = useAuth();
  const [profile, setProfile] = useState(undefined); // undefined = loading, null = never applied
  const [reapply, setReapply] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/driver/me').then(setProfile).catch((e) => setError(e.message));
  }, []);

  const onSaved = (p) => { setProfile(p); setReapply(false); refresh(); };

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (profile === undefined) return <p className="loading">Loading…</p>;
  if (!profile || reapply) return <ApplyForm previous={profile} onDone={onSaved} />;

  if (profile.status === 'pending') {
    return (
      <div className="narrow"><section className="card">
        <h1>Application under review</h1>
        <p><StatusChip status="pending" /></p>
        <p>Thanks for applying. Our team is checking your driving licence and identity proof. Once approved, your profile becomes visible to customers near <b>{profile.area_label}</b>.</p>
        <p className="muted">You can keep using the app as a customer in the meantime.</p>
      </section></div>
    );
  }
  if (profile.status === 'rejected') {
    return (
      <div className="narrow"><section className="card">
        <h1>Application not approved</h1>
        <p><StatusChip status="rejected" /></p>
        <p>Reason from our team:</p>
        <blockquote>{profile.rejection_reason}</blockquote>
        <button className="btn btn-primary" onClick={() => setReapply(true)}>Fix and apply again</button>
      </section></div>
    );
  }
  return <Dashboard profile={profile} onSaved={onSaved} />;
}

function ApplyForm({ previous, onDone }) {
  const [listing, setListing] = useState(previous ? listingFromProfile(previous) : emptyListing());
  const [doc, setDoc] = useState({
    experience_years: previous?.experience_years || '', dl_number: previous?.dl_number || '', dl_expiry: previous?.dl_expiry || '',
    id_type: previous?.id_type || 'Aadhaar', id_number: previous?.id_number || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const field = (k) => ({ value: doc[k], onChange: (e) => setDoc({ ...doc, [k]: e.target.value }), required: true });

  async function submit(e) {
    e.preventDefault();
    if (!listing.location) return setError('Set your base location.');
    setBusy(true); setError('');
    const form = new FormData(e.target); // picks up the three file inputs
    const fields = { ...doc, ...listingPayload(listing) };
    for (const [k, v] of Object.entries(fields)) form.set(k, typeof v === 'object' ? JSON.stringify(v) : v ?? '');
    try {
      onDone(await api('/driver/apply', { method: 'POST', form }));
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="narrow-wide">
      <form className="card form-long" onSubmit={submit}>
        <h1>Register as a driver</h1>
        <p className="muted">Fill in your details and upload your documents. Our team reviews every application; you are listed and visible to customers only after approval.</p>

        <fieldset>
          <legend>Licence and identity</legend>
          <div className="grid-2">
            <label className="field">Driving experience (years)<input type="number" min="1" max="60" {...field('experience_years')} /></label>
            <label className="field">Driving licence number<input {...field('dl_number')} placeholder="e.g. KA0120170012345" /></label>
            <label className="field">Licence valid until<input type="date" {...field('dl_expiry')} /></label>
            <label className="field">Identity proof
              <select {...field('id_type')}>
                <option>Aadhaar</option><option>PAN</option><option>Voter ID</option><option>Passport</option>
              </select>
            </label>
            <label className="field">{doc.id_type} number<input {...field('id_number')} /></label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Documents</legend>
          <p className="hint">JPG, PNG or WebP (PDF also accepted for documents), up to 5 MB each. Documents are seen only by our review team; your photo is shown on your public profile.{previous && ' Leave a file empty to keep the one you uploaded before.'}</p>
          <div className="grid-3">
            <label className="field">Your photo<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required={!previous?.photo_file} /></label>
            <label className="field">Driving licence<input type="file" name="dl_file" accept="image/jpeg,image/png,image/webp,application/pdf" required={!previous?.dl_file} /></label>
            <label className="field">Identity proof<input type="file" name="id_file" accept="image/jpeg,image/png,image/webp,application/pdf" required={!previous?.id_file} /></label>
          </div>
        </fieldset>

        <ListingFields value={listing} onChange={setListing} />

        <ErrorBox>{error}</ErrorBox>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit application'}</button>
      </form>
    </div>
  );
}

function Dashboard({ profile, onSaved }) {
  const [listing, setListing] = useState(listingFromProfile(profile));
  const [paused, setPaused] = useState(!!profile.paused);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setSaved(false);
    try {
      onSaved(await api('/driver/me', { method: 'PUT', body: { ...listingPayload(listing), paused } }));
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="narrow-wide">
      <section className="card dash-head">
        <div>
          <h1>Driver dashboard</h1>
          <p><StatusChip status="approved" /> {paused ? 'Your listing is paused and hidden from search.' : 'Your listing is live and visible to customers.'}</p>
        </div>
        <div className="actions">
          <Link className="btn btn-primary" to="/bookings">Booking requests</Link>
          <Link className="btn btn-ghost" to={`/drivers/${profile.user_id}`}>View public profile</Link>
        </div>
      </section>
      <form className="card form-long" onSubmit={submit}>
        <h2>Your listing</h2>
        <label className="check pause">
          <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
          Pause my listing (stop receiving new requests)
        </label>
        <ListingFields value={listing} onChange={setListing} />
        <ErrorBox>{error}</ErrorBox>
        {saved && <p className="alert alert-ok">Listing saved.</p>}
        <button className="btn btn-primary">Save changes</button>
      </form>
    </div>
  );
}
