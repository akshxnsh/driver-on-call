import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate, fmtMin, inr, TRANSMISSION, WEEKDAYS } from '../api.js';
import { Avatar, ErrorBox, StatusChip } from '../components.jsx';

export default function Admin() {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setRows(null);
    api(`/admin/drivers?status=${status}`).then(setRows).catch((e) => setError(e.message));
    api('/admin/stats').then(setStats).catch(() => {});
  }, [status]);
  useEffect(load, [load]);

  return (
    <>
      <h1>Admin: driver verification</h1>
      {stats && (
        <div className="stats">
          {[['Users', stats.users], ['Pending review', stats.pending], ['Approved drivers', stats.approved], ['Rejected', stats.rejected], ['Bookings', stats.bookings], ['Completed', stats.completed]]
            .map(([label, n]) => <div key={label} className="card stat"><strong>{n}</strong><span>{label}</span></div>)}
        </div>
      )}
      <div className="tabs" role="tablist">
        {['pending', 'approved', 'rejected'].map((s) => (
          <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}>
            {s[0].toUpperCase() + s.slice(1)}{stats ? ` (${stats[s]})` : ''}
          </button>
        ))}
      </div>
      <ErrorBox>{error}</ErrorBox>
      {!rows ? <p className="loading">Loading…</p> : rows.length === 0
        ? <div className="card empty"><p>No {status} applications.</p></div>
        : rows.map((d) => <Application key={d.user_id} d={d} onChanged={load} />)}
    </>
  );
}

function Application({ d, onChanged }) {
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState('');

  async function decide(decision) {
    setError('');
    try {
      await api(`/admin/drivers/${d.user_id}/review`, { method: 'POST', body: { decision, reason } });
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  }
  // Documents are private, so they are fetched with the admin's token and opened as a local blob.
  async function openDoc(name) {
    try {
      const blob = await api(`/files/${name}`, { blob: true });
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch (e) {
      setError(e.message);
    }
  }
  const Doc = ({ label, file }) => file
    ? <button className="btn btn-ghost btn-sm" onClick={() => openDoc(file)}>View {label}</button>
    : <span className="muted">{label}: no file (demo data)</span>;

  return (
    <section className="card application">
      <div className="application-head">
        <Avatar name={d.name} photo={d.photo} size={64} />
        <div>
          <h2>{d.name} <StatusChip status={d.status} /></h2>
          <p className="muted">{d.email} · {d.phone} · {d.city} · applied {fmtDate(d.created_at)}</p>
        </div>
      </div>
      <dl className="facts">
        <div><dt>Driving licence</dt><dd>{d.dl_number} · valid until {d.dl_expiry}</dd></div>
        <div><dt>{d.id_type}</dt><dd>{d.id_number}</dd></div>
        <div><dt>Experience</dt><dd>{d.experience_years} years · {TRANSMISSION[d.transmission]} · {d.vehicle_types.join(', ')}</dd></div>
        <div><dt>Rates</dt><dd>{inr(d.rate_hour)}/hour · {inr(d.rate_day)}/day · {inr(d.rate_week)}/week</dd></div>
        <div><dt>Base location</dt><dd>{d.area_label}</dd></div>
        <div><dt>Works</dt><dd>{d.availability.map((a) => `${WEEKDAYS[a.weekday].slice(0, 3)} ${fmtMin(a.start_min)}–${fmtMin(a.end_min)}`).join(', ')}</dd></div>
        {d.languages && <div><dt>Languages</dt><dd>{d.languages}</dd></div>}
        {d.bio && <div><dt>About</dt><dd>{d.bio}</dd></div>}
        {d.rejection_reason && <div><dt>Rejection reason</dt><dd>{d.rejection_reason}</dd></div>}
      </dl>
      <div className="actions"><Doc label="driving licence" file={d.dl_file} /><Doc label="identity proof" file={d.id_file} /></div>
      <ErrorBox>{error}</ErrorBox>
      {rejecting ? (
        <div className="reject">
          <label className="field">Reason shown to the applicant
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The licence photo is unreadable, please upload a clearer one." />
          </label>
          <div className="actions">
            <button className="btn btn-danger" onClick={() => decide('reject')}>Confirm rejection</button>
            <button className="btn btn-ghost" onClick={() => setRejecting(false)}>Back</button>
          </div>
        </div>
      ) : (
        <div className="actions">
          {d.status !== 'approved' && <button className="btn btn-primary" onClick={() => decide('approve')}>Approve and list driver</button>}
          {d.status !== 'rejected' && <button className="btn btn-danger" onClick={() => setRejecting(true)}>{d.status === 'approved' ? 'Remove from listing' : 'Reject'}</button>}
        </div>
      )}
    </section>
  );
}
