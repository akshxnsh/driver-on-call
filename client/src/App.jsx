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
                <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
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
    </>
  );
}
