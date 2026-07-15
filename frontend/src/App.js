import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import LandingPage from './components/LandingPage';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import TankGauge from './components/TankGauge';
import TankChart from './components/TankChart';
import DeliveryForm from './components/DeliveryForm';
import DeliveryTimeline from './components/DeliveryTimeline';
import DeliveryList from './components/DeliveryList';
import ReconciliationTable from './components/ReconciliationTable';
import PumpSalesForm from './components/PumpSalesForm';
import Reports from './components/Reports';
import AlertsPanel from './components/AlertsPanel';
import ShiftManager from './components/ShiftManager';
import PumpVsDip from './components/PumpVsDip';
import Pricing from './components/Pricing';
import PaymentResult from './components/PaymentResult';
import AccessDenied from './components/AccessDenied';
import ResetPassword from './components/ResetPassword';
import useIsMobile from './useIsMobile';
import { useAuditLog } from './useAuditLog';
import { useToast } from './Toast';
import AuditLog from './components/AuditLog';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Roles that MUST be at AAL2 (MFA-verified) before any dashboard content loads.
const MFA_REQUIRED_ROLES = ['owner', 'headquarters'];

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showPublicLogin, setShowPublicLogin] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('login') === '1';
  });
  const [tanks, setTanks] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [reconciliation, setRecon] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [alertSummary, setAlertSummary] = useState({ critical: 0, warning: 0, info: 0 });
  const [subscription, setSubscription] = useState(null);
  const isMobile = useIsMobile();
  const { addToast } = useToast();
  const [stations, setStations] = useState([]);
  const [activeStation, setActiveStation] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [mfaStatus, setMfaStatus] = useState('checking'); // checking | required | clear
  const { log } = useAuditLog(session, userProfile, activeStation);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
      // A fresh sign-in (password or magic link) should always re-run the MFA
      // check from scratch, even if this browser already had mfaStatus set
      // from an earlier session.
      setMfaStatus('checking');
    });
    return () => subscription.unsubscribe();
  }, []);

  // Check for URL parameters on initial load (for payment callback)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const statusParam = urlParams.get('status');
    const orderIdParam = urlParams.get('OrderTrackingId');

    if (tabParam === 'payment-result') {
      setShowPublicLogin(true);
      setActiveTab('payment-result');
      if (statusParam) {
        sessionStorage.setItem('paymentStatus', statusParam);
      }
      if (orderIdParam) {
        sessionStorage.setItem('orderTrackingId', orderIdParam);
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Fetch subscription for current station
  useEffect(() => {
    if (activeStation) {
      fetch(API + '/api/subscription?station_id=' + activeStation)
        .then(res => res.json())
        .then(data => setSubscription(data))
        .catch(console.error);
    }
  }, [API, activeStation]);

  // Check access and redirect if expired
  useEffect(() => {
    if (activeStation && subscription && subscription.status === 'expired') {
      addToast('⚠️ Your subscription has expired. Please renew to access features.', 'error', 8000);
      if (activeTab !== 'pricing' && activeTab !== 'payment-result') {
        setActiveTab('pricing');
      }
    }
  }, [subscription, activeStation, addToast, activeTab]);

  const hasStationAccess = () => {
    if (!subscription) return true;
    if (subscription.status === 'active') return true;
    if (subscription.status === 'trial') return true;
    if (subscription.status === 'expired') return false;
    return true;
  };

  const getCurrentStationName = () => {
    const station = stations.find(s => s.id === activeStation);
    return station?.name || 'Unknown Station';
  };

  async function loadUserProfile() {
    if (!session) return;
    try {
      const res = await fetch(API + '/api/user-profile?uid=' + session.user.id);
      const profile = await res.json();
      setUserProfile(profile);
      return profile;
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  }

  async function loadStations(profile) {
    try {
      const uid = session?.user?.id || '';
      const res = await fetch(API + '/api/stations?uid=' + uid);
      const data = await res.json();
      setStations(data);
      if (data.length > 0 && !activeStation) {
        setActiveStation(data[0].id);
      }
      return data;
    } catch (err) {
      console.error('Failed to load stations:', err);
    }
  }

  async function loadData() {
    try {
      const uid = session?.user?.id || '';
      const stationParam = activeStation ? '?station_id=' + activeStation + '&uid=' + uid : '?uid=' + uid;

      const [t, d, r, a] = await Promise.all([
        fetch(API + '/api/tanks' + stationParam).then(res => res.json()),
        fetch(API + '/api/deliveries' + stationParam).then(res => res.json()),
        fetch(API + '/api/reconciliation' + stationParam).then(res => res.json()),
        fetch(API + '/api/alerts/summary').then(res => res.json()).catch(() => ({ critical: 0, warning: 0, info: 0 })),
      ]);

      setTanks(Array.isArray(t) ? t : []);
      setDeliveries(Array.isArray(d) ? d : []);
      setRecon(Array.isArray(r) ? r : []);
      setAlertSummary(a);
      setLastUpdated(new Date().toLocaleTimeString());

      if (Array.isArray(t)) {
        t.filter(tank => parseFloat(tank.fill_pct) < 20).forEach(tank => {
          addToast(`Tank ${tank.tank_number} (${tank.fuel_type?.toUpperCase() || 'Unknown'}) is critically low — ${parseFloat(tank.fill_pct).toFixed(1)}%`, 'warning', 6000);
        });
        t.filter(tank => parseFloat(tank.water_mm) > 50).forEach(tank => {
          addToast(`Tank ${tank.tank_number} has high water — ${tank.water_mm}mm`, 'error', 6000);
        });
      }

      if (Array.isArray(d)) {
        d.filter(del => del.status === 'flagged').forEach(del => {
          addToast(`Delivery ${del.bol_number} is flagged — variance exceeds tolerance.`, 'error', 6000);
        });
      }

    } catch (err) {
      console.error('Failed to load data:', err);
      addToast('Failed to load data. Check your connection.', 'error', 5000);
    }
  }

  // ── Session gate: runs on every session change. Re-verifies AAL2 for
  // owner/headquarters roles EVERY time — fresh login, refresh, tab restore.
  useEffect(() => {
    if (session) {
      const init = async () => {
        const profile = await loadUserProfile();

        if (profile && MFA_REQUIRED_ROLES.includes(profile.role)) {
          try {
            const { data: aalData, error: aalError } =
              await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (aalError || aalData?.currentLevel !== 'aal2') {
              setMfaStatus('required');
              return; // stop — MfaGate takes over, no dashboard data loads yet
            }
          } catch (err) {
            console.error('[MFA] AAL check failed:', err.message);
            setMfaStatus('required'); // fail closed for privileged roles
            return;
          }
        }
        setMfaStatus('clear');

        await loadStations(profile);
        try {
          await fetch(API + '/api/audit-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_email: session.user.email,
              user_role: profile?.role || 'unknown',
              action: 'SIGN_IN',
              entity_type: 'auth',
              entity_id: null,
              station_id: null,
              old_value: null,
              new_value: null,
            }),
          });
        } catch (e) {
          console.error('Audit log sign-in error:', e);
        }
      };
      init();
    }
  }, [session]);

  useEffect(() => {
    if (session && activeStation && mfaStatus === 'clear') {
      loadData();
      const interval = setInterval(loadData, 60000);
      return () => clearInterval(interval);
    }
  }, [session, activeStation, mfaStatus]);

  async function handleSignOut() {
    await log('SIGN_OUT', 'auth', null, null, null);
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch (e) {
      console.log('Sign out error:', e);
    }
    localStorage.clear();
    sessionStorage.clear();
    document.cookie.split(';').forEach(c => {
      document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/';
    });
    window.location.href = window.location.origin + '?signout=' + Date.now();
  }

  function openPublicLogin() {
    setShowPublicLogin(true);
    const url = new URL(window.location.href);
    url.searchParams.set('login', '1');
    window.history.pushState({}, document.title, url.pathname + url.search + url.hash);
  }

  function returnToLanding() {
    setShowPublicLogin(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('login');
    const query = url.searchParams.toString();
    window.history.pushState({}, document.title, url.pathname + (query ? '?' + query : '') + url.hash);
  }

  const colors = {
    bg: darkMode ? '#0f0f1a' : '#f0f2f5',
    card: darkMode ? '#1e1e2e' : '#ffffff',
    text: darkMode ? '#e0e0e0' : '#1a1a2e',
    subtext: darkMode ? '#888' : '#666',
    border: darkMode ? '#2a2a3e' : '#e0e0e0',
  };

  const mainStyle = {
    marginLeft: isMobile ? '0' : '220px',
    flex: 1,
    minHeight: '100vh',
    paddingBottom: isMobile ? '70px' : '0',
  };

  const totalOpenAlerts = alertSummary.critical + alertSummary.warning + alertSummary.info;
  const hasAccess = hasStationAccess();
  const isExpired = subscription?.status === 'expired';
  const shouldShowContent = hasAccess || activeTab === 'pricing' || activeTab === 'payment-result';
  const shouldShowAccessDenied = isExpired && activeTab !== 'pricing' && activeTab !== 'payment-result';

  if (window.location.pathname === '/reset-password') {
    return <ResetPassword />;
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⛽</div>
          <div style={{ color: '#fff', fontSize: '16px', fontWeight: '500' }}>Loading FuelSense...</div>
          <div style={{ color: '#4CAF50', fontSize: '12px', marginTop: '8px' }}>Mafuta Salama</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return showPublicLogin
      ? <Login onBack={returnToLanding} />
      : <LandingPage onLoginClick={openPublicLogin} />;
  }

  if (mfaStatus === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⛽</div>
          <div style={{ color: '#fff', fontSize: '16px', fontWeight: '500' }}>Verifying access...</div>
        </div>
      </div>
    );
  }

  if (mfaStatus === 'required') {
    return <MfaGate onVerified={() => setMfaStatus('clear')} onSignOut={handleSignOut} />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: colors.bg, fontFamily: 'system-ui, sans-serif' }}>

      {!isMobile && (
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          user={session.user}
          onSignOut={handleSignOut}
          alertCount={totalOpenAlerts}
          subscription={subscription}
        />
      )}

      {isMobile && (
        <BottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          darkMode={darkMode}
          alertCount={totalOpenAlerts}
        />
      )}

      <div style={mainStyle}>

        <div style={{ ...styles.topBar, background: colors.card, borderBottom: `1px solid ${colors.border}` }}>
          <div>
            <div style={{ ...styles.pageTitle, color: colors.text, fontSize: isMobile ? '16px' : '18px' }}>
              {activeTab === 'dashboard' && '📊 Live Dashboard'}
              {activeTab === 'deliveries' && '🚚 Deliveries'}
              {activeTab === 'reconciliation' && '📋 Reconciliation'}
              {activeTab === 'shifts' && '⏱ Shift Management'}
              {activeTab === 'pump-vs-dip' && '🔢 Pump vs Dip'}
              {activeTab === 'alerts' && '🔔 Alerts'}
              {activeTab === 'audit' && '🔍 Audit Log'}
              {activeTab === 'pricing' && '💳 Subscription & Billing'}
              {activeTab === 'payment-result' && '💰 Payment Result'}
              {activeTab === 'reports' && '📈 Reports'}
            </div>
            {!isMobile && stations.length > 1 && (
              <select
                value={activeStation || ''}
                onChange={e => setActiveStation(e.target.value)}
                style={{ fontSize: '12px', color: colors.subtext, background: 'transparent', border: 'none', cursor: 'pointer', marginTop: '4px', outline: 'none' }}
              >
                {stations.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            {!isMobile && stations.length === 1 && (
              <div style={{ fontSize: '12px', color: colors.subtext, marginTop: '2px' }}>
                {stations[0]?.name} — Nairobi
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {totalOpenAlerts > 0 && (
              <button
                onClick={() => setActiveTab('alerts')}
                style={{ padding: '5px 12px', background: alertSummary.critical > 0 ? '#e74c3c' : '#f39c12', color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
              >
                🔔 {totalOpenAlerts} alert{totalOpenAlerts > 1 ? 's' : ''}
              </button>
            )}
            {isExpired && (
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: '#fdecea', color: '#e74c3c', fontWeight: '600' }}>
                ⚠️ EXPIRED
              </span>
            )}
            {lastUpdated && !isMobile && (
              <div style={{ fontSize: '12px', color: colors.subtext }}>
                Updated {lastUpdated}
              </div>
            )}
            {userProfile && (
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: userProfile.role === 'admin' ? '#e8f4fd' : '#eafaf1', color: userProfile.role === 'admin' ? '#1a5276' : '#1e8449', fontWeight: '600' }}>
                {userProfile.role?.toUpperCase()}
              </span>
            )}
            <button style={{ ...styles.refreshBtn, background: darkMode ? '#2a2a3e' : '#f0f2f5', color: colors.text }} onClick={loadData}>
              ↻
            </button>
            {isMobile && (
              <button style={{ ...styles.refreshBtn, background: darkMode ? '#2a2a3e' : '#f0f2f5', color: colors.text }} onClick={handleSignOut}>
                ⏻
              </button>
            )}
          </div>
        </div>

        <div style={{ ...styles.content, padding: isMobile ? '12px' : '24px' }}>

          {shouldShowAccessDenied && (
            <AccessDenied darkMode={darkMode} stationName={getCurrentStationName()} />
          )}

          {shouldShowContent && !shouldShowAccessDenied && (
            <>
              {activeTab === 'dashboard' && (
                <div>
                  {alertSummary.critical > 0 && (
                    <div style={styles.alertRed}>
                      🚨 <strong>{alertSummary.critical} critical alert{alertSummary.critical > 1 ? 's' : ''}</strong> require immediate attention.{' '}
                      <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setActiveTab('alerts')}>View alerts →</span>
                    </div>
                  )}
                  {alertSummary.warning > 0 && (
                    <div style={styles.alertAmber}>
                      ⚠️ <strong>{alertSummary.warning} warning{alertSummary.warning > 1 ? 's' : ''}</strong> need attention.{' '}
                      <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setActiveTab('alerts')}>View alerts →</span>
                    </div>
                  )}
                  {Array.isArray(tanks) && tanks.filter(t => parseFloat(t.fill_pct) < 20).map(t => (
                    <div key={t.id} style={styles.alertRed}>
                      🚨 <strong>Tank {t.tank_number}</strong> critically low — {parseFloat(t.fill_pct).toFixed(1)}%
                    </div>
                  ))}
                  {Array.isArray(tanks) && tanks.filter(t => parseFloat(t.water_mm) > 50).map(t => (
                    <div key={t.id} style={styles.alertAmber}>
                      ⚠️ <strong>Tank {t.tank_number}</strong> high water — {t.water_mm}mm
                    </div>
                  ))}

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? '8px' : '16px', marginBottom: '24px' }}>
                    <SummaryCard label="Total NSV" value={Array.isArray(tanks) ? tanks.reduce((s, t) => s + parseFloat(t.nsv_litres || 0), 0).toFixed(0) + ' L' : '0 L'} icon="⛽" color="#4CAF50" bg={colors.card} text={colors.text} sub={colors.subtext} mobile={isMobile} />
                    <SummaryCard label="Active Tanks" value={Array.isArray(tanks) ? tanks.length + ' tanks' : '0 tanks'} icon="🛢" color="#3498db" bg={colors.card} text={colors.text} sub={colors.subtext} mobile={isMobile} />
                    <SummaryCard label="Deliveries" value={(Array.isArray(deliveries) ? deliveries.length : 0) + ' total'} icon="🚚" color="#f39c12" bg={colors.card} text={colors.text} sub={colors.subtext} mobile={isMobile} />
                    <SummaryCard
                      label="Open Alerts"
                      value={totalOpenAlerts + ' open'}
                      icon="🔔"
                      color={totalOpenAlerts > 0 ? (alertSummary.critical > 0 ? '#e74c3c' : '#f39c12') : '#27ae60'}
                      bg={colors.card} text={colors.text} sub={colors.subtext} mobile={isMobile}
                      onClick={() => setActiveTab('alerts')}
                    />
                  </div>

                  <div style={{ ...styles.sectionHeader }}>
                    <div style={{ ...styles.sectionTitle, color: colors.text }}>Live Tank Levels</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                    {Array.isArray(tanks) && tanks.map(tank => (
                      <TankGauge key={tank.id} tank={tank} darkMode={darkMode} />
                    ))}
                  </div>

                  {!isMobile && Array.isArray(tanks) && tanks.length > 0 && (
                    <>
                      <div style={{ ...styles.sectionHeader, marginTop: '24px' }}>
                        <div style={{ ...styles.sectionTitle, color: colors.text }}>NSV Trends — Last Hour</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '16px' }}>
                        {tanks.map(tank => (
                          <TankChart key={tank.id} tank={tank} api={API} darkMode={darkMode} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'deliveries' && (
                <div>
                  <div style={styles.rowBetween}>
                    <div style={{ ...styles.sectionTitle, color: colors.text }}>Delivery Records</div>
                    <button style={styles.newBtn} onClick={() => setShowForm(!showForm)}>
                      {showForm ? '✕' : '+ New'}
                    </button>
                  </div>
                  {showForm && (
                    <DeliveryForm
                      tanks={tanks}
                      onSuccess={() => { setShowForm(false); loadData(); }}
                      api={API}
                      stationId={activeStation}
                      session={session}
                      userProfile={userProfile}
                    />
                  )}

                  {Array.isArray(deliveries) && deliveries.filter(d => !['confirmed', 'flagged'].includes(d.status)).length > 0 && (
                    <div>
                      <div style={{ ...styles.sectionTitle, color: colors.text, marginBottom: '12px' }}>
                        🔄 Active Deliveries
                      </div>
                      {deliveries
                        .filter(d => !['confirmed', 'flagged'].includes(d.status))
                        .map(d => (
                          <DeliveryTimeline key={d.id} delivery={d} darkMode={darkMode} />
                        ))}
                    </div>
                  )}

                  <div style={{ ...styles.sectionTitle, color: colors.text, marginBottom: '12px', marginTop: '24px' }}>
                    📋 Delivery History
                  </div>
                  {Array.isArray(deliveries) && deliveries.filter(d => ['confirmed', 'flagged'].includes(d.status)).length > 0 ? (
                    deliveries
                      .filter(d => ['confirmed', 'flagged'].includes(d.status))
                      .map(d => (
                        <DeliveryTimeline key={d.id} delivery={d} darkMode={darkMode} />
                      ))
                  ) : (
                    <DeliveryList deliveries={deliveries} />
                  )}
                </div>
              )}

              {activeTab === 'reconciliation' && (
                <div>
                  <div style={{ ...styles.sectionTitle, color: colors.text, marginBottom: '16px' }}>Daily Reconciliation</div>
                  <PumpSalesForm tanks={tanks} api={API} onSuccess={loadData} stationId={activeStation} />
                  <ReconciliationTable data={reconciliation} />
                </div>
              )}

              {activeTab === 'shifts' && (
                <ShiftManager tanks={tanks} darkMode={darkMode} stationId={activeStation} />
              )}
              {activeTab === 'pump-vs-dip' && (
                <PumpVsDip darkMode={darkMode} stationId={activeStation} />
              )}
              {activeTab === 'alerts' && (
                <AlertsPanel darkMode={darkMode} stationId={activeStation} />
              )}
              {activeTab === 'audit' && (
                <div>
                  <div style={{ ...styles.sectionTitle, color: colors.text, marginBottom: '16px' }}>🔍 Audit Log</div>
                  <AuditLog api={API} activeStation={activeStation} darkMode={darkMode} />
                </div>
              )}

              {activeTab === 'pricing' && (
                <div>
                  <div style={{ ...styles.sectionTitle, color: colors.text, marginBottom: '16px' }}>💳 Subscription & Billing</div>
                  <Pricing api={API} activeStation={activeStation} session={session} darkMode={darkMode} />
                </div>
              )}

              {activeTab === 'payment-result' && (
                <PaymentResult darkMode={darkMode} />
              )}

              {activeTab === 'reports' && (
                <div>
                  <div style={{ ...styles.sectionTitle, color: colors.text, marginBottom: '16px' }}>📈 Reports & Exports</div>
                  <Reports deliveries={deliveries} reconciliation={reconciliation} tanks={tanks} darkMode={darkMode} stationId={activeStation} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Unified MFA gate: handles BOTH first-time enrollment (QR code) AND
// challenge (existing factor) AND re-verification of restored/stale sessions.
// This is the single place MFA is handled post-authentication — Login.js only
// starts the sign-in, this component owns everything after. ──────────────────
function MfaGate({ onVerified, onSignOut }) {
  const [mode, setMode] = useState('loading'); // loading | enroll | challenge
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = (factors?.totp || []).filter(f => f.status === 'verified');

      if (verified.length === 0) {
        // No verified factor yet — start enrollment instead of signing out.
        const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'FuelSense Authenticator',
        });
        if (enrollErr) { setError('Failed to set up MFA: ' + enrollErr.message); return; }
        setFactorId(data.id);
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
        setMode('enroll');
        return;
      }

      // Existing verified factor — challenge it.
      const fId = verified[0].id;
      setFactorId(fId);
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: fId });
      if (chErr) { setError(chErr.message); return; }
      setChallengeId(ch.id);
      setMode('challenge');
    })();
  }, []);

  async function verifyChallenge() {
    if (otp.length !== 6) { setError('Please enter the 6-digit code.'); return; }
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code: otp });
    setLoading(false);
    if (error) { setError('Invalid code. Please try again.'); setOtp(''); return; }
    onVerified();
  }

  async function verifyEnrollment() {
    if (otp.length !== 6) { setError('Please enter the 6-digit code.'); return; }
    setLoading(true);
    setError('');
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) { setError(chErr.message); setLoading(false); return; }
      const { error: verErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: otp });
      if (verErr) {
        setError('Code incorrect. Make sure you scanned the QR code and try again.');
        setOtp('');
        setLoading(false);
        return;
      }
      onVerified();
    } catch (err) {
      setError('Setup failed: ' + err.message);
      setLoading(false);
    }
  }

  const dark = '#1a1a2e';
  const card = { minHeight: '100vh', background: '#0f0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: '24px' };
  const box = { background: '#fff', borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' };
  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '14px', outline: 'none', marginBottom: '12px' };
  const btn = (bg = dark, color = '#fff') => ({ width: '100%', padding: '13px', border: 'none', borderRadius: '8px', background: bg, color, fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginBottom: '10px' });
  const errBox = error ? (
    <div style={{ background: '#fdecea', border: '1px solid #f5c6cb', color: '#721c24', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
      ⚠️ {error}
    </div>
  ) : null;

  if (mode === 'loading') {
    return (
      <div style={card}>
        <div style={box}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>🔐</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: dark }}>Setting up security check...</div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'enroll') {
    return (
      <div style={card}>
        <div style={box}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>🔐</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: dark }}>Set Up Two-Factor Authentication</div>
            <div style={{ fontSize: '13px', color: '#666', marginTop: '8px', lineHeight: '1.5' }}>
              Your account has owner-level access. Scan this QR code with <strong>Google Authenticator</strong> or <strong>Authy</strong> to secure your account.
            </div>
          </div>
          {errBox}
          {qrCode && (
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <img src={qrCode} alt="MFA QR Code" style={{ width: '180px', height: '180px', border: '4px solid #f0f0f0', borderRadius: '12px' }} />
              <div style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>Can't scan? Enter this code manually:</div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', background: '#f8f8f8', padding: '8px 12px', borderRadius: '6px', marginTop: '4px', letterSpacing: '2px', color: dark, fontWeight: '600' }}>
                {secret}
              </div>
            </div>
          )}
          <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px', textAlign: 'center' }}>
            After scanning, enter the 6-digit code shown in your app:
          </div>
          <input
            type="text" inputMode="numeric" maxLength={6}
            value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            style={{ ...inputStyle, textAlign: 'center', fontSize: '24px', letterSpacing: '8px', fontWeight: '700' }}
            onKeyDown={e => e.key === 'Enter' && verifyEnrollment()}
            autoFocus
          />
          <button onClick={verifyEnrollment} disabled={loading} style={btn(dark)}>
            {loading ? 'Verifying...' : 'Activate 2FA & Continue →'}
          </button>
          <button onClick={onSignOut} style={{ ...btn('#f0f0f0', '#666'), fontWeight: '400' }}>
            ← Cancel and sign out
          </button>
        </div>
      </div>
    );
  }

  // mode === 'challenge'
  return (
    <div style={card}>
      <div style={box}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🔑</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: dark }}>Two-Factor Verification</div>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '8px', lineHeight: '1.5' }}>
            Open your authenticator app and enter the 6-digit code for FuelSense.
          </div>
        </div>
        {errBox}
        <input
          type="text" inputMode="numeric" maxLength={6}
          value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          style={{ ...inputStyle, textAlign: 'center', fontSize: '28px', letterSpacing: '10px', fontWeight: '700' }}
          onKeyDown={e => e.key === 'Enter' && verifyChallenge()}
          autoFocus
        />
        <button onClick={verifyChallenge} disabled={loading || otp.length !== 6} style={btn(dark)}>
          {loading ? 'Verifying...' : 'Verify & Enter Dashboard →'}
        </button>
        <button onClick={onSignOut} style={{ ...btn('#f0f0f0', '#666'), fontWeight: '400' }}>
          ← Sign in with a different account
        </button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, color, bg, text, sub, mobile, onClick }) {
  return (
    <div onClick={onClick} style={{ background: bg, borderRadius: '12px', padding: mobile ? '14px' : '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: mobile ? '11px' : '13px', color: sub, marginBottom: '6px' }}>{label}</div>
          <div style={{ fontSize: mobile ? '16px' : '22px', fontWeight: '700', color }}>{value}</div>
        </div>
        <div style={{ fontSize: mobile ? '20px' : '28px' }}>{icon}</div>
      </div>
    </div>
  );
}

const styles = {
  topBar: { padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50 },
  pageTitle: { fontSize: '18px', fontWeight: '700' },
  refreshBtn: { padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' },
  content: { padding: '24px' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  sectionTitle: { fontSize: '15px', fontWeight: '600' },
  rowBetween: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  newBtn: { background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  alertRed: { background: '#fdecea', border: '1px solid #f5c6cb', color: '#721c24', padding: '10px 14px', borderRadius: '8px', marginBottom: '10px', fontSize: '13px' },
  alertAmber: { background: '#fff3cd', border: '1px solid #ffc107', color: '#856404', padding: '10px 14px', borderRadius: '8px', marginBottom: '10px', fontSize: '13px' },
  emptyState: { borderRadius: '12px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
};

export default App;