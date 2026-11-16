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
        <p className="muted">One account works for both hiring a driver and registering as one.</p>
        {config.googleClientId
          ? (
            <>
              <div ref={googleBtn} className="google-btn" />
              <p className="hint">Nothing happens when you click? Your browser may be blocking the pop-up.{' '}
                <button type="button" className="link-btn" onClick={fullPageSignIn}>Sign in with Google in this tab instead</button>
              </p>
            </>
          )
          : <p className="alert">Google sign-in is not set up on this server yet. Add <code>GOOGLE_CLIENT_ID</code> to <code>server/.env</code> to switch it on (see the README).</p>}
        <ErrorBox>{error}</ErrorBox>
      </section>

      {config.demoMode && (
        <section className="card">
          <h2>Demo accounts</h2>
          <p className="muted">Demo mode is on. Pick a sample account to try the app without Google.</p>
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
  const firstTime = !user.phone;

  async function submit(e) {
    e.preventDefault();
    setError(''); setSaved(false);
    try {
      setUser(await api('/me', { method: 'PUT', body: form }));
      if (firstTime && from) navigate(from, { replace: true });
      else setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  }
  const field = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <div className="narrow">
      <form className="card" onSubmit={submit}>
        <h1>{firstTime ? 'Complete your profile' : 'Your profile'}</h1>
        {firstTime && <p className="muted">We need a few details before you can book a driver or register as one.</p>}
        <label className="field">Full name <input {...field('name')} required autoComplete="name" /></label>
        <label className="field">Email <input value={user.email} disabled /></label>
        <label className="field">Mobile number
          <div className="prefix"><span>+91</span><input {...field('phone')} required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} placeholder="10-digit number" autoComplete="tel-national" /></div>
          <span className="hint">Shared with a driver only after they accept your booking.</span>
        </label>
        <label className="field">City <input {...field('city')} required placeholder="e.g. Bengaluru" /></label>
        <ErrorBox>{error}</ErrorBox>
        {saved && <p className="alert alert-ok">Profile saved.</p>}
        <button className="btn btn-primary">Save</button>
      </form>
      {!firstTime && (
        <section className="card account-links">
          <h2>Account</h2>
          <p className="muted">Signed in as {user.email}</p>
          <button className="btn btn-ghost" onClick={logout}>Sign out</button>
        </section>
      )}
    </div>
  );
}
