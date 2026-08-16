import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

// Roles that MUST complete MFA before accessing the dashboard
const MFA_REQUIRED_ROLES = ['owner', 'headquarters'];

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState('login'); // login | mfa_enroll | mfa_challenge | magic_sent
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [userId, setUserId] = useState('');
  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [mfaCheckDone, setMfaCheckDone] = useState(false); // guards against double-firing

  // ── Catch EVERY new session, regardless of how it was created ──────────────
  // (password login, magic link, session restore) — this is what was missing.
  // Without this, a magic-link session never ran through checkMfaRequired at all.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setMfaCheckDone(false);
        await checkMfaRequired(session.user);
        setMfaCheckDone(true);
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── After any successful auth, check if MFA is needed ─────────────────────
  async function checkMfaRequired(user) {
    let role = 'attendant';
    try {
      const profileRes = await fetch(`${API}/api/user-profile?uid=${user.id}`);
      const profile = await profileRes.json();
      role = profile?.role || 'attendant';
    } catch (err) {
      console.error('[MFA] Profile fetch failed:', err.message);
      // Can't confirm the role — fail CLOSED rather than risk letting a
      // privileged account through unchecked.
      setError('Unable to verify your account. Please try signing in again.');
      await supabase.auth.signOut();
      setScreen('login');
      return true;
    }

    if (!MFA_REQUIRED_ROLES.includes(role)) {
      // Non-privileged role — no MFA needed, dashboard loads normally
      return false;
    }

    // High-privilege role — check MFA enrollment status
    setUserId(user.id);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totpFactors = factors?.totp || [];
      const verified = totpFactors.filter(f => f.status === 'verified');

      if (verified.length === 0) {
        // Not enrolled — show QR code setup
        await startMfaEnrollment();
      } else {
        // Enrolled but needs challenge
        setFactorId(verified[0].id);
        await startMfaChallenge(verified[0].id);
      }
      return true;
    } catch (err) {
      console.error('[MFA] Setup failed:', err.message);
      setError('Failed to start two-factor verification. Please try again.');
      await supabase.auth.signOut();
      setScreen('login');
      return true;
    }
  }

  // ── Enroll: generate QR code ───────────────────────────────────────────────
  async function startMfaEnrollment() {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'MafutaFlow Africa Authenticator',
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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
      // MFA check now happens via the onAuthStateChange listener above —
      // no need to call checkMfaRequired directly here anymore, it would
      // double-fire. Just stop the loading spinner; the listener takes it
      // from here (enrollment/challenge screen or straight to dashboard).
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  // ── Magic link login ────────────────────────────────────────────────────────
  async function handleMagicLink(e) {
    e.preventDefault();
    if (!email) { setError('Enter your email address first.'); return; }
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
          shouldCreateUser: false, // only works for accounts the admin already provisioned
        },
      });
      if (error) { setError(error.message); setLoading(false); return; }
      setMagicLinkEmail(email);
      setScreen('magic_sent');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
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

  // ── Magic link sent confirmation ────────────────────────────────────────────
  if (screen === 'magic_sent') {
    return (
      <div style={card}>
        <div style={box}>
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>📧</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: dark }}>Check your email</div>
            <div style={{ fontSize: '13px', color: '#666', marginTop: '8px', lineHeight: '1.5' }}>
              We sent a sign-in link to <strong>{magicLinkEmail}</strong>. Click it to continue — no password needed.
            </div>
          </div>
          <button
            onClick={() => { setScreen('login'); setError(''); }}
            style={{ ...btn('#f0f0f0', '#666'), fontWeight: '400' }}
          >
            ← Use a different email
          </button>
        </div>
      </div>
    );
  }

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
          <button
            onClick={() => { supabase.auth.signOut(); setScreen('login'); setOtp(''); setError(''); setQrCode(''); setSecret(''); }}
            style={{ ...btn('#f0f0f0', '#666'), fontWeight: '400' }}
          >
            ← Cancel and sign out
          </button>
          <div style={{ fontSize: '11px', color: '#aaa', textAlign: 'center' }}>
            You'll need to enter a code from your authenticator app every time you log in.
          </div>
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
              Open your authenticator app and enter the 6-digit code for MafutaFlow Africa.
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
          <div style={{ fontSize: '11px', color: '#aaa', textAlign: 'center', marginTop: '4px' }}>
            Code refreshes every 30 seconds. Make sure your device clock is correct.
          </div>
        </div>
      </div>
    );
  }

  // ── Login Screen ───────────────────────────────────────────────────────────
  return (
    <div style={card}>
      <div style={box}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img src="/mafutaflow-logo.jpeg" alt="MafutaFlow Africa" style={{ height: '56px', marginBottom: '8px' }} />
          <div style={{ fontSize: '24px', fontWeight: '700', color: dark }}>MafutaFlow Africa</div>
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
            if (error) {
              setError(error.message);
            } else {
              setError('');
              alert(`Password reset email sent to ${email}`);
            }
          }} style={{ fontSize: '13px', color: dark, textDecoration: 'underline' }}>
            Forgot your password?
          </a>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <a href="#magiclink" onClick={handleMagicLink} style={{ fontSize: '13px', color: dark, textDecoration: 'underline' }}>
            Sign in with an email link instead
          </a>
        </div>

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '11px', color: '#bbb' }}>
          MafutaFlow Africa · Mafuta Salama · Nairobi, Kenya
        </div>
      </div>
    </div>
  );
}
