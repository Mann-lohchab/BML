import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  ChevronRight,
  ContactRound,
  FileBarChart2,
  Gauge,
  LogOut,
  Menu,
  RadioTower,
  Search,
  Settings2,
  TrainFront,
  X,
  Zap
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Brand } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { initials } from '@/lib/format';

const navigation = [
  { to: '/', label: 'Overview', icon: Gauge, end: true },
  { to: '/coaches', label: 'Coaches', icon: TrainFront },
  { to: '/devices', label: 'CED devices', icon: RadioTower },
  { to: '/contacts', label: 'Contacts', icon: ContactRound },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/triggers', label: 'Triggers', icon: Zap },
  { to: '/reports', label: 'Reports', icon: FileBarChart2 }
];

const titleByPath: Record<string, string> = {
  '/': 'Fleet overview',
  '/coaches': 'Coaches',
  '/devices': 'CED devices',
  '/contacts': 'Contacts',
  '/notifications': 'Notifications',
  '/triggers': 'Triggers',
  '/reports': 'Reports'
};

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  const currentTitle = useMemo(() => {
    const exact = titleByPath[location.pathname];
    if (exact) return exact;
    if (location.pathname.startsWith('/coaches/')) return 'Coach intelligence';
    return 'BML operations';
  }, [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="sidebar-scrim" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="sidebar__brand">
          <Brand />
          <button className="icon-button sidebar__close" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>
        <div className="sidebar__section-label">Operations</div>
        <nav className="sidebar__nav">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={18} />
              <span>{label}</span>
              <ChevronRight className="sidebar__chevron" size={15} />
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__spacer" />
        <div className="sidebar__system-card">
          <span className="pulse-dot" />
          <div>
            <strong>System connected</strong>
            <span>Live API session</span>
          </div>
        </div>
        <div className="sidebar__footer">
          <Settings2 size={16} />
          <span>BML Control Suite</span>
          <small>v1.0</small>
        </div>
      </aside>

      <div className="app-frame">
        <header className="topbar">
          <div className="topbar__left">
            <button className="icon-button topbar__menu" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
              <Menu size={20} />
            </button>
            <div>
              <span className="topbar__context">BML / Operations</span>
              <strong>{currentTitle}</strong>
            </div>
          </div>
          <div className="topbar__right">
            <Link to="/coaches" className="topbar__search">
              <Search size={16} />
              <span>Find a coach</span>
              <kbd>/</kbd>
            </Link>
            <Link to="/notifications" className="icon-button topbar__notification" aria-label="Notifications">
              <Bell size={18} />
              <i />
            </Link>
            <div className="profile-menu">
              <button type="button" className="profile-button" onClick={() => setProfileOpen((value) => !value)}>
                <span className="avatar">{initials(user?.fullName ?? 'BML User')}</span>
                <span className="profile-button__copy">
                  <strong>{user?.fullName ?? 'BML User'}</strong>
                  <small>{user?.roles?.[0] ?? 'operator'}</small>
                </span>
                <ChevronRight size={15} />
              </button>
              {profileOpen && (
                <div className="profile-popover">
                  <div>
                    <strong>{user?.fullName}</strong>
                    <span>{user?.email}</span>
                  </div>
                  <button type="button" onClick={handleLogout}>
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>BML railway intelligence</span>
          <span>Telemetry protected · Operational data live</span>
        </footer>
      </div>
    </div>
  );
}
