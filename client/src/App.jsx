import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Avatar } from './components.jsx';
import NotificationBell from './Notifications.jsx';
import Search from './pages/Search.jsx';
import DriverPage from './pages/DriverPage.jsx';
import { BookingList, BookingDetail } from './pages/Bookings.jsx';
import { Login, Profile } from './pages/Account.jsx';
import DriverHub from './pages/DriverHub.jsx';
import Admin from './pages/Admin.jsx';

/** Signed-in only. New accounts are sent to complete their profile first. */
function Private({ children, admin }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (!user.phone && loc.pathname !== '/profile') return <Navigate to="/profile" state={{ from: loc.pathname + loc.search }} replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

const ICONS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  wheel: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /><path d="M12 14.5V21M9.6 11.2 3.4 9.5M14.4 11.2l6.2-1.7" /></>,
  shield: <><path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
};
const TabIcon = ({ name }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
);

export default function App() {
  const { user, ready, logout } = useAuth();
  if (!ready) return <p className="loading">Loading…</p>;
  const driverLabel = user?.driver_status === 'approved' ? 'Driver dashboard' : user?.driver_status ? 'Driver application' : 'Register as driver';

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-in">
          <Link to="/" className="brand"><span className="brand-mark" aria-hidden="true">◎</span> DOC</Link>
          <nav>
            <NavLink to="/" end>Find a driver</NavLink>
            {user && <NavLink to="/bookings">My bookings</NavLink>}
            <NavLink to="/driver">{driverLabel}</NavLink>
            {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
          </nav>
          <div className="topbar-user">
            {user ? (
              <>
                <NotificationBell />
                <Link to="/profile" className="me"><Avatar name={user.name} photo={user.photo_url} size={32} /> <span>{user.name.split(' ')[0]}</span></Link>
                <button className="btn btn-ghost btn-sm hide-phone" onClick={logout}>Sign out</button>
              </>
            ) : <Link to="/login" className="btn btn-primary btn-sm">Sign in</Link>}
          </div>
        </div>
      </header>

      <main className="wrap">
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/drivers/:id" element={<DriverPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<Private><Profile /></Private>} />
          <Route path="/bookings" element={<Private><BookingList /></Private>} />
          <Route path="/bookings/:id" element={<Private><BookingDetail /></Private>} />
          <Route path="/driver" element={<Private><DriverHub /></Private>} />
          <Route path="/admin" element={<Private admin><Admin /></Private>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="footer">
        <div className="wrap">
          <p><strong>DOC</strong> connects car owners with independent, document-verified drivers. Payment is settled directly between you and the driver.</p>
          <p className="muted">Prototype build. Map data © OpenStreetMap contributors.</p>
        </div>
      </footer>

      {/* Phone navigation: a tab bar fixed to the bottom of the screen (hidden on wider screens). */}
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end><TabIcon name="search" /><span>Find</span></NavLink>
        <NavLink to="/bookings"><TabIcon name="calendar" /><span>Bookings</span></NavLink>
        <NavLink to="/driver"><TabIcon name="wheel" /><span>{user?.driver_status === 'approved' ? 'Driving' : 'Drive'}</span></NavLink>
        {user?.role === 'admin' && <NavLink to="/admin"><TabIcon name="shield" /><span>Admin</span></NavLink>}
        <NavLink to={user ? '/profile' : '/login'}><TabIcon name="person" /><span>{user ? 'Account' : 'Sign in'}</span></NavLink>
      </nav>
    </>
  );
}
