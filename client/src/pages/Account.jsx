import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, StatusChip } from '../components.jsx';

const NONCE_KEY = 'doc_google_nonce';

export function Login() {
  const { user, config, login } = useAuth();
  const from = useLocation().state?.from || '/';
  const [demoUsers, setDemoUsers] = useState([]);
  const [error, setError] = useState('');
  const googleBtn = useRef(null);

  useEffect(() => {
    if (config.demoMode) api('/auth/demo-users').then(setDemoUsers).catch(() => {});
  }, [config.demoMode]);

  // Google Identity Services: load the script once, then draw the official button.
  useEffect(() => {
    if (!config.googleClientId) return;
    const start = () => {
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: async ({ credential }) => {
          try {
            login(await api('/auth/google', { method: 'POST', body: { credential } }));
          } catch (e) {
            setError(e.message);
          }
        },
      });
      window.google.accounts.id.renderButton(googleBtn.current, { theme: 'outline', size: 'large', text: 'continue_with', width: 300 });
    };
    if (window.google?.accounts) return start();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = start;
    document.head.appendChild(s);
  }, [config.googleClientId, login]);

  // Full-page sign-in (no pop-up): Google sends the browser back here with the ID token in the URL fragment.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const credential = hash.get('id_token');
    if (!credential && !hash.get('error')) return;
    window.history.replaceState(null, '', window.location.pathname);
    const nonce = sessionStorage.getItem(NONCE_KEY);
    sessionStorage.removeItem(NONCE_KEY);
    if (!credential || !nonce) return setError('Google sign-in was cancelled or could not be completed.');
    api('/auth/google', { method: 'POST', body: { credential, nonce } }).then(login).catch((e) => setError(e.message));
  }, [login]);

  function fullPageSignIn() {
    const nonce = crypto.randomUUID();
    sessionStorage.setItem(NONCE_KEY, nonce);
    const params = new URLSearchParams({
      client_id: config.googleClientId, response_type: 'id_token', scope: 'openid email profile',
      redirect_uri: `${window.location.origin}/login`, nonce, prompt: 'select_account',
    });
    window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  if (user) return <Navigate to={from} replace />;

  async function demo(userId) {
    try {
      login(await api('/auth/demo', { method: 'POST', body: { userId } }));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="narrow">
      <section className="card">
        <h1>Sign in</h1>
        {config.googleClientId
          ? (
            <>
              <div ref={googleBtn} className="google-btn" />
              <button type="button" className="link-btn" onClick={fullPageSignIn}>Pop-up blocked? Sign in here instead</button>
            </>
          )
          : <p className="alert">Google sign-in is not set up on this server yet. Add <code>GOOGLE_CLIENT_ID</code> to <code>server/.env</code> to switch it on (see the README).</p>}
        <ErrorBox>{error}</ErrorBox>
      </section>

      {config.demoMode && (
        <section className="card">
          <h2>Demo accounts</h2>
          <ul className="demo-list">
            {demoUsers.map((u) => (
              <li key={u.id}>
                <button className="btn btn-ghost btn-block" onClick={() => demo(u.id)}>
                  <span>{u.name}</span>
                  <span className="muted">
                    {u.role === 'admin' ? 'Admin' : u.driver_status ? <>Driver · <StatusChip status={u.driver_status} /></> : 'Customer'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function Profile() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const from = useLocation().state?.from;
  const [form, setForm] = useState({ name: user.name || '', phone: (user.phone || '').replace('+91', ''), city: user.city || '' });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const verified = user.phone_verified;

  // Saving a profile with a new or unverified number leads straight to the code step.
  async function submit(e) {
    e.preventDefault();
    setError(''); setSaved(false);
    try {
      const next = await api('/me', { method: 'PUT', body: form });
      setUser(next);
      if (next.phone_verified) setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  }
  function done(next) {
    setUser(next);
    if (from) navigate(from, { replace: true });
  }
  const field = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <div className="narrow">
      <form className="card" onSubmit={submit}>
        <h1>{user.phone ? 'Your profile' : 'Complete your profile'}</h1>
        <label className="field">Full name <input {...field('name')} required autoComplete="name" /></label>
        <label className="field">Email <input value={user.email} disabled /></label>
        <label className="field">Mobile number {verified && <span className="chip chip-accepted">Verified</span>}
          <div className="prefix"><span>+91</span><input {...field('phone')} required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} placeholder="10-digit number" autoComplete="tel-national" /></div>
          <span className="hint">Shared only after a booking is accepted.</span>
        </label>
        <label className="field">City <input {...field('city')} required placeholder="e.g. Bengaluru" /></label>
        <ErrorBox>{error}</ErrorBox>
        {saved && <p className="alert alert-ok">Profile saved.</p>}
        <button className="btn btn-primary">Save</button>
      </form>
      {user.phone && !verified && <VerifyPhone phone={user.phone} onVerified={done} />}
      {/* Always shown, including before the profile is complete, so nobody is stuck signed in. */}
      <button className="btn btn-ghost btn-block" onClick={logout}>Sign out</button>
    </div>
  );
}

/** Asks for a code, sends it, and checks what the person types. */
function VerifyPhone({ phone, onVerified }) {
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [demoCode, setDemoCode] = useState('');
  const [wait, setWait] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send() {
    setBusy(true); setError('');
    try {
      const r = await api('/me/phone/send-otp', { method: 'POST' });
      setSent(true); setWait(r.resend_in); setDemoCode(r.demo_code || ''); setCode('');
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }
  async function verify(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      onVerified(await api('/me/phone/verify', { method: 'POST', body: { code } }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={verify}>
      <h2>Verify {phone}</h2>
      {!sent ? (
        <>
          <p>We will text a 6-digit code to this number.</p>
          <ErrorBox>{error}</ErrorBox>
          <button type="button" className="btn btn-primary" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
        </>
      ) : (
        <>
          {demoCode && <p className="alert alert-ok">Demo mode: no text was sent. Your code is <b>{demoCode}</b>.</p>}
          <label className="field">6-digit code
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" required autoFocus />
          </label>
          <ErrorBox>{error}</ErrorBox>
          <div className="actions">
            <button className="btn btn-primary" disabled={busy || code.length !== 6}>Verify</button>
            <button type="button" className="btn btn-ghost" onClick={send} disabled={busy || wait > 0}>{wait > 0 ? `Resend in ${wait}s` : 'Resend code'}</button>
          </div>
        </>
      )}
    </form>
  );
}
