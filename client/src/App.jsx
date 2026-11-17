import { useEffect } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
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
import Landing from './pages/Landing.jsx';

/** Top-bar menu item with a highlight that glides from one item to the next. */
function NavItem({ to, end, children }) {
  return (
    <NavLink to={to} end={end} className="navitem">
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="nav-pill" className="navitem-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <span className="navitem-label">{children}</span>
        </>
      )}
    </NavLink>
  );
}

/** Phone tab-bar item with a small bar that slides along the top edge. */
function TabItem({ to, end, icon, label }) {
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="tab-bar" className="tab-indicator" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <TabIcon name={icon} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

/** Signed-in only. No phone number is needed to look around: search, driver profiles, the bookings list, admin. */
function SignedIn({ children, admin }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

/** Signed in AND a verified phone number. Only registering as a driver needs this page-level check;
 *  sending a booking request is blocked on the driver's page and again by the server. */
function Private({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (!user.phone_verified) return <Navigate to="/profile" state={{ from: loc.pathname + loc.search }} replace />;
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
  const location = useLocation();
  // The phone tab bar only exists once signed in; without it the page needs no bottom padding.
  useEffect(() => { document.body.classList.toggle('no-tabbar', !user); }, [user]);
  if (!ready) return <p className="loading">Loading…</p>;
  const driverLabel = user?.driver_status === 'approved' ? 'Driver dashboard' : user?.driver_status ? 'Driver application' : 'Register as driver';

  return (
    <MotionConfig reducedMotion="user">
      <header className="topbar">
        <div className="wrap topbar-in">
          <Link to="/" className="brand"><span className="brand-mark" aria-hidden="true">◎</span> DOC</Link>
          {user && (
            <nav>
              <NavItem to="/" end>Find a driver</NavItem>
              <NavItem to="/bookings">My bookings</NavItem>
              <NavItem to="/driver">{driverLabel}</NavItem>
              {user.role === 'admin' && <NavItem to="/admin">Admin</NavItem>}
            </nav>
          )}
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
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
        <Routes location={location}>
          <Route path="/" element={user ? <Search /> : <Landing />} />
          <Route path="/drivers/:id" element={<SignedIn><DriverPage /></SignedIn>} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<SignedIn><Profile /></SignedIn>} />
          <Route path="/bookings" element={<SignedIn><BookingList /></SignedIn>} />
          <Route path="/bookings/:id" element={<SignedIn><BookingDetail /></SignedIn>} />
          <Route path="/driver" element={<Private><DriverHub /></Private>} />
          <Route path="/admin" element={<SignedIn admin><Admin /></SignedIn>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="footer">
        <div className="wrap">DOC · Prototype · Map data © OpenStreetMap contributors</div>
      </footer>

      {/* Phone navigation: a tab bar fixed to the bottom of the screen (hidden on wider screens). */}
      {user && (
        <nav className="tabbar" aria-label="Main">
          <TabItem to="/" end icon="search" label="Find" />
          <TabItem to="/bookings" icon="calendar" label="Bookings" />
          <TabItem to="/driver" icon="wheel" label={user.driver_status === 'approved' ? 'Driving' : 'Drive'} />
          {user.role === 'admin' && <TabItem to="/admin" icon="shield" label="Admin" />}
          <TabItem to="/profile" icon="person" label="Account" />
        </nav>
      )}
    </MotionConfig>
  );
}
