import React from 'react';
import {
  LayoutDashboard,
  Truck,
  ClipboardList,
  Clock,
  Calculator,
  Bell,
  Search,
  TrendingUp,
  CreditCard,
  Fuel,
  Sun,
  Moon,
  Power,
} from 'lucide-react';

function Sidebar({ activeTab, setActiveTab, darkMode, setDarkMode, user, onSignOut, alertCount, subscription }) {

  const isExpired = subscription?.status === 'expired';
  const isActive = subscription?.status === 'active' || subscription?.status === 'trial';

  // Define which nav items are available based on subscription status
  const allNavItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', requiresActive: true },
    { id: 'deliveries', icon: Truck, label: 'Deliveries', requiresActive: true },
    { id: 'reconciliation', icon: ClipboardList, label: 'Reconciliation', requiresActive: true },
    { id: 'shifts', icon: Clock, label: 'Shifts', requiresActive: true },
    { id: 'pump-vs-dip', icon: Calculator, label: 'Pump vs Dip', requiresActive: true },
    { id: 'alerts', icon: Bell, label: 'Alerts', requiresActive: true },
    { id: 'audit', icon: Search, label: 'Audit Log', requiresActive: true },
    { id: 'reports', icon: TrendingUp, label: 'Reports', requiresActive: true },
    { id: 'pricing', icon: CreditCard, label: 'Billing', requiresActive: false }, // Always visible
  ];

  // Filter nav items based on subscription status
  const navItems = allNavItems.filter(item => {
    // If subscription is expired, hide features that require active subscription
    if (isExpired && item.requiresActive) return false;
    return true;
  });

  return (
    <div style={{ ...styles.sidebar, background: darkMode ? '#0f0f1a' : '#1a1a2e' }}>

      {/* Logo */}
      <div style={styles.logoSection}>

        <div>
          <img src="/mafutaflow-logo.jpeg" alt="MafutaFlow Africa" style={{ height: '36px', width: '36px', borderRadius: '8px', objectFit: 'cover', marginBottom: '6px' }} />
          <div style={styles.logoTitle}>MafutaFlow Africa</div>
          <div style={styles.logoSub}>Accountability Behind Every Litre</div>
        </div>
      </div>

      {/* Expired warning badge */}
      {isExpired && (
        <div style={styles.expiredBadge}>
          Subscription Expired
        </div>
      )}

      {/* Nav items */}
      <nav style={styles.nav}>
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              style={{
                ...styles.navItem,
                background: activeTab === item.id
                  ? 'rgba(255,255,255,0.12)'
                  : 'transparent',
                borderLeft: activeTab === item.id
                  ? '3px solid #4CAF50'
                  : '3px solid transparent',
                opacity: isExpired && item.requiresActive ? 0.5 : 1,
                cursor: isExpired && item.requiresActive ? 'not-allowed' : 'pointer',
              }}
              onClick={() => {
                // Don't allow navigation to restricted features if expired
                if (isExpired && item.requiresActive) {
                  return;
                }
                setActiveTab(item.id);
              }}
              disabled={isExpired && item.requiresActive}
              title={isExpired && item.requiresActive ? 'Renew subscription to access this feature' : ''}
            >
              <span style={styles.navIcon}>
                <Icon size={18} color={activeTab === item.id ? '#4CAF50' : '#ccc'} />
              </span>
              <span style={styles.navLabel}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div style={styles.bottom}>
        {/* Dark mode toggle */}
        <button
          style={styles.themeBtn}
          onClick={() => setDarkMode(!darkMode)}
        >
          <span style={styles.navIcon}>
            {darkMode ? <Sun size={18} color="#ccc" /> : <Moon size={18} color="#ccc" />}
          </span>
          <span style={styles.navLabel}>{darkMode ? 'Light mode' : 'Dark mode'}</span>
        </button>

        {/* User info */}
        <div style={styles.userSection}>
          <div style={styles.avatar}>
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div style={styles.userInfo}>
            <div style={styles.userEmail}>{user?.email?.split('@')[0]}</div>
            <div style={styles.userRole}>Station Admin</div>
          </div>
          <button style={styles.signOutBtn} onClick={onSignOut} title="Sign out">
            <Power size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  sidebar: { width: '220px', height: '100vh', display: 'flex', flexDirection: 'column', position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100, overflowY: 'auto' },
  logoSection: { display: 'flex', alignItems: 'center', gap: '12px', padding: '24px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  logoIcon: { flexShrink: 0 },
  logoTitle: { color: '#fff', fontSize: '16px', fontWeight: '700' },
  logoSub: { color: '#4CAF50', fontSize: '11px', marginTop: '1px' },
  nav: { flex: 1, padding: '16px 8px', overflowY: 'auto' },
  navItem: { width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '4px', transition: 'all 0.2s' },
  navIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', flexShrink: 0 },
  navLabel: { color: '#ccc', fontSize: '13px', fontWeight: '500' },
  bottom: { padding: '16px 8px', borderTop: '1px solid rgba(255,255,255,0.08)' },
  themeBtn: { width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', border: 'none', background: 'transparent', borderRadius: '8px', cursor: 'pointer', marginBottom: '12px' },
  userSection: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px' },
  avatar: { width: '32px', height: '32px', borderRadius: '50%', background: '#4CAF50', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', flexShrink: 0 },
  userInfo: { flex: 1, overflow: 'hidden' },
  userEmail: { color: '#fff', fontSize: '12px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  userRole: { color: '#888', fontSize: '10px', marginTop: '1px' },
  signOutBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px', padding: '6px', display: 'flex', alignItems: 'center' },
  expiredBadge: {
    margin: '12px 16px',
    padding: '8px 12px',
    background: '#fdecea',
    color: '#e74c3c',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '600',
    textAlign: 'center',
    border: '1px solid #f5c6cb'
  },
};

export default Sidebar;
