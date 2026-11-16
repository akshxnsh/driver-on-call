import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api.js';

const REFRESH_EVENT = 'doc:notifications';
/** Pages call this after marking things read, so the bell updates at once. */
export const refreshNotifications = () => window.dispatchEvent(new Event(REFRESH_EVENT));

const ago = (ms) => {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 1440) return `${Math.round(min / 60)} h ago`;
  return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
const canAlert = typeof window !== 'undefined' && 'Notification' in window;

/** Bell in the top bar: unread badge, a panel of recent notifications, optional desktop alerts. */
export default function NotificationBell() {
  const navigate = useNavigate();
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState(canAlert ? Notification.permission : 'unsupported');
  const newest = useRef(null); // highest id already seen; null until the first load
  const wrap = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await api('/notifications');
      setData(d);
      const top = d.items[0]?.id || 0;
      // Desktop alert for anything that arrived since the last check, when the tab is in the background.
      if (newest.current !== null && canAlert && Notification.permission === 'granted' && document.hidden) {
        d.items.filter((n) => n.id > newest.current && !n.read_at).reverse().forEach((n) => {
          const alert = new Notification(n.title, { body: n.body, tag: `doc-${n.id}` });
          alert.onclick = () => { window.focus(); navigate(n.link); alert.close(); };
        });
      }
      newest.current = Math.max(newest.current || 0, top);
    } catch { /* signed out or offline: try again on the next tick */ }
  }, [navigate]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    window.addEventListener(REFRESH_EVENT, load);
    return () => { clearInterval(t); window.removeEventListener(REFRESH_EVENT, load); };
  }, [load]);

  useEffect(() => {
    document.title = data.unread ? `(${data.unread}) DOC` : 'DOC';
    return () => { document.title = 'DOC'; };
  }, [data.unread]);

  // Close the panel on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const click = (e) => { if (!wrap.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key); };
  }, [open]);

  async function openItem(n) {
    setOpen(false);
    if (!n.read_at) await api('/notifications/read', { method: 'POST', body: { id: n.id } }).catch(() => {});
    load();
    navigate(n.link);
  }
  async function readAll() {
    await api('/notifications/read', { method: 'POST', body: { all: true } }).catch(() => {});
    load();
  }

  return (
    <div className="bell-wrap" ref={wrap}>
      <button className="bell" aria-label={`Notifications, ${data.unread} unread`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {data.unread > 0 && <span className="bell-count">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <b>Notifications</b>
            {data.unread > 0 && <button className="link-btn" onClick={readAll}>Mark all as read</button>}
          </div>
          {data.items.length === 0 && <p className="muted bell-empty">Nothing yet.</p>}
          <ul>
            {data.items.map((n) => (
              <li key={n.id}>
                <button className={`bell-item ${n.read_at ? '' : 'bell-unread'}`} onClick={() => openItem(n)}>
                  <span className="bell-title">{n.title}</span>
                  {n.body && <span className="bell-body">{n.body}</span>}
                  <span className="bell-time">{ago(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="bell-foot">
            {permission === 'default' && (
              <button className="link-btn" onClick={() => Notification.requestPermission().then(setPermission)}>
                Turn on desktop alerts
              </button>
            )}
            {permission === 'granted' && <span className="muted">Desktop alerts are on.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
