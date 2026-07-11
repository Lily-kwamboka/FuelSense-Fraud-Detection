import React, { useState } from 'react';
import { supabase } from '../supabase';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState('login'); // login | mfa_enroll | mfa_challenge
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [userId, setUserId] = useState('');

  // ── After any successful auth, check if MFA is needed ─────────────────────
  async function checkMfaRequired(user) {
    try {
      const profileRes = await fetch(`${API}/api/user-profile?uid=${user.id}`);
      const profile = await profileRes.json();
      const role = profile?.role || 'attendant';

      if (!MFA_REQUIRED_ROLES.includes(role)) {
        // Non-privileged role — no MFA needed, dashboard loads normally
        return false;
      }

      // High-privilege role — check MFA enrollment status
      setUserId(user.id);
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totpFactors = factors?.totp || [];
      const verified = totpFactors.filter(f => f.status === 'verified');

      if (verified.length === 0) {
        // Not enrolled — show QR code setup
        await startMfaEnrollment();
        return true;
      } else {
        // Enrolled but needs challenge
        setFactorId(verified[0].id);
        await startMfaChallenge(verified[0].id);
        return true;
      }
    } catch (err) {
      console.error('[MFA] Check failed:', err.message);
      return false;
    }
  }

  // ── Enroll: generate QR code ───────────────────────────────────────────────
  async function startMfaEnrollment() {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'FuelSense Authenticator',
    });
    if (error) { setError('Failed to set up MFA: ' + error.message); return; }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setScreen('mfa_enroll');
  }

  // ── Challenge: request a TOTP challenge ───────────────────────────────────
  async function startMfaChallenge(fId) {
    const { data, error } = await supabase.auth.mfa.challenge({ factorId: fId });
    if (error) { setError('Failed to start MFA challenge: ' + error.message); return; }
    setChallengeId(data.id);
    setScreen('mfa_challenge');
  }

  // ── Verify the OTP code ───────────────────────────────────────────────────
  async function verifyOtp() {
    if (otp.length !== 6) { setError('Please enter the 6-digit code.'); return; }
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: otp,
      });
      if (error) {
        setError('Invalid code. Please try again.');
        setOtp('');
      }
      // On success, Supabase updates the session AAL2 — App.js onAuthStateChange fires
    } catch (err) {
      setError('Verification failed: ' + err.message);
    }
    setLoading(false);
  }

  // ── After enrollment QR scan: verify the first code to confirm setup ──────
  async function verifyEnrollment() {
    if (otp.length !== 6) { setError('Please enter the 6-digit code.'); return; }
    setLoading(true);
    setError('');
    try {
      // Challenge first, then verify
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) { setError(chErr.message); setLoading(false); return; }

      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: otp,
      });
      if (verErr) {
        setError('Code incorrect. Make sure you scanned the QR code and try again.');
        setOtp('');
      }
    } catch (err) {
      setError('Setup failed: ' + err.message);
    }
    setLoading(false);
  }

  // ── Email + Password login ─────────────────────────────────────────────────
  async function handleEmailLogin(e) {
    e.preventDefault();
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
      const needsMfa = await checkMfaRequired(data.user);
      if (!needsMfa) setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const dark = '#1a1a2e';
  const green = '#4CAF50';
  const red = '#e74c3c';

  const card = {
    minHeight: '100vh', background: '#0f0f1e',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'system-ui, sans-serif', padding: '24px',
  };

  const box = {
    background: '#fff', borderRadius: '16px', padding: '40px',
    width: '100%', maxWidth: '420px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '12px 14px',
    border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '14px',
    outline: 'none', marginBottom: '12px',
  };

  const btn = (bg = dark, color = '#fff') => ({
    width: '100%', padding: '13px', border: 'none', borderRadius: '8px',
    background: bg, color, fontSize: '14px', fontWeight: '600',
    cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
    marginBottom: '10px',
  });

  const errBox = error ? (
    <div style={{ background: '#fdecea', border: '1px solid #f5c6cb', color: '#721c24', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
      ⚠️ {error}
    </div>
  ) : null;

  // ── MFA Enroll Screen ──────────────────────────────────────────────────────
  if (screen === 'mfa_enroll') {
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
              <div style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
                Can't scan? Enter this code manually:
              </div>
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
        </div>
      </div>
    );
  }

  // ── MFA Challenge Screen ───────────────────────────────────────────────────
  if (screen === 'mfa_challenge') {
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
            onKeyDown={e => e.key === 'Enter' && verifyOtp()}
            autoFocus
          />
          <button onClick={verifyOtp} disabled={loading || otp.length !== 6} style={btn(dark)}>
            {loading ? 'Verifying...' : 'Verify & Enter Dashboard →'}
          </button>
          <button
            onClick={() => { supabase.auth.signOut(); setScreen('login'); setOtp(''); setError(''); }}
            style={{ ...btn('#f0f0f0', '#666'), fontWeight: '400' }}
          >
            ← Sign in with a different account
          </button>
          <button style={styles.linkBtn} onClick={() => { setResetMode(false); setError(null); }}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  // ── Login Screen ───────────────────────────────────────────────────────────
  return (
    <div style={card}>
      <div style={box}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>⛽</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: dark }}>FuelSense</div>
          <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>Fuel Inventory Management</div>
        </div>

        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '12px', color: '#0369a1', textAlign: 'center' }}>
          🔒 Access is by invitation only. Contact your administrator to request access.
        </div>

        {errBox}

        <form onSubmit={handleEmailLogin}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Email</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com" style={inputStyle} autoComplete="email"
          />
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Password</label>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" style={inputStyle} autoComplete="current-password"
          />
          <button type="submit" disabled={loading} style={btn(dark)}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <a href="#reset" onClick={async e => {
            e.preventDefault();
            if (!email) { setError('Enter your email address above first.'); return; }
            setLoading(true);
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: window.location.origin + '/reset-password',
            });
            setLoading(false);
            if (error) setError(error.message);
            else setError('');
            alert(`Password reset email sent to ${email}`);
          }} style={{ fontSize: '13px', color: dark, textDecoration: 'underline' }}>
            Forgot your password?
          </a>
        </div>


        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '11px', color: '#bbb' }}>
          FuelSense · Mafuta Salama · Nairobi, Kenya
        </div>

      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  card: { background: '#fff', borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  logo: { fontSize: '48px', textAlign: 'center', marginBottom: '8px' },
  title: { fontSize: '24px', fontWeight: '700', textAlign: 'center', color: '#1a1a2e', marginBottom: '4px' },
  subtitle: { fontSize: '13px', color: '#999', textAlign: 'center', marginBottom: '16px' },
  notice: { background: '#f0f4ff', border: '1px solid #c7d7fd', color: '#3451b2', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px', textAlign: 'center' },
  error: { background: '#fdecea', color: '#e74c3c', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' },
  successBox: { background: '#eafaf1', border: '1px solid #a9dfbf', color: '#1e8449', padding: '14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', textAlign: 'center' },
  field: { marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '500', color: '#444', marginBottom: '6px' },
  input: { width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  btn: { width: '100%', padding: '11px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '12px' },
  linkBtn: { background: 'none', border: 'none', color: '#1a1a2e', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', display: 'block', margin: '0 auto' },
  divider: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' },
  dividerLine: { flex: 1, height: '1px', background: '#e0e0e0' },
  dividerText: { fontSize: '12px', color: '#999' },
  googleBtn: { width: '100%', padding: '11px', background: '#fff', color: '#444', border: '1.5px solid #e0e0e0', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' },
  footer: { textAlign: 'center', fontSize: '11px', color: '#bbb' },
};

export default Login;