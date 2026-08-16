import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function ResetPassword() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('checking'); // checking | ready | invalid | success

    // ── On mount: confirm we have a valid recovery session ─────────────────────
    // Supabase's password-reset link redirects here with a recovery token in the
    // URL. It exchanges that for a session automatically via onAuthStateChange
    // firing a PASSWORD_RECOVERY event — we just need to wait for and confirm it.
    useEffect(() => {
        let resolved = false;

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' && session) {
                resolved = true;
                setStatus('ready');
            }
        });

        // Fallback: if the event already fired before this component mounted,
        // or the link put us in a valid session another way, check directly.
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!resolved && session) {
                setStatus('ready');
            } else if (!resolved) {
                // Give the recovery event a moment to arrive before declaring it dead.
                setTimeout(() => {
                    if (!resolved) setStatus('invalid');
                }, 2500);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');

        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) {
                setError(error.message);
                setLoading(false);
                return;
            }
            setStatus('success');
            setLoading(false);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    }

    // ── Styles (matching Login.js) ──────────────────────────────────────────────
    const dark = '#1a1a2e';

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

    // ── Checking link validity ──────────────────────────────────────────────────
    if (status === 'checking') {
        return (
            <div style={card}>
                <div style={box}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '40px', marginBottom: '8px' }}>⛽</div>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: dark }}>Verifying your reset link...</div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Invalid or expired link ─────────────────────────────────────────────────
    if (status === 'invalid') {
        return (
            <div style={card}>
                <div style={box}>
                    <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                        <div style={{ fontSize: '40px', marginBottom: '8px' }}>⚠️</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: dark }}>Link expired or invalid</div>
                        <div style={{ fontSize: '13px', color: '#666', marginTop: '8px', lineHeight: '1.5' }}>
                            This password reset link is no longer valid. Reset links expire after a short time and can only be used once.
                        </div>
                    </div>
                    <a href="/" style={{ display: 'block', textAlign: 'center' }}>
                        <button style={btn(dark)}>← Back to Sign In</button>
                    </a>
                </div>
            </div>
        );
    }

    // ── Success ──────────────────────────────────────────────────────────────────
    if (status === 'success') {
        return (
            <div style={card}>
                <div style={box}>
                    <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                        <div style={{ fontSize: '40px', marginBottom: '8px' }}>✅</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: dark }}>Password updated</div>
                        <div style={{ fontSize: '13px', color: '#666', marginTop: '8px', lineHeight: '1.5' }}>
                            Your password has been changed. You can now sign in with your new password.
                        </div>
                    </div>
                    <a href="/" style={{ display: 'block', textAlign: 'center' }}>
                        <button style={btn(dark)}>Continue to Sign In →</button>
                    </a>
                </div>
            </div>
        );
    }

    // ── Set new password form ───────────────────────────────────────────────────
    return (
        <div style={card}>
            <div style={box}>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <div style={{ fontSize: '40px', marginBottom: '8px' }}>⛽</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: dark }}>Set a New Password</div>
                    <div style={{ fontSize: '13px', color: '#666', marginTop: '8px', lineHeight: '1.5' }}>
                        Choose a new password for your MafutaFlow Africa account.
                    </div>
                </div>

                {errBox}

                <form onSubmit={handleSubmit}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>New Password</label>
                    <input
                        type="password" value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••" style={inputStyle} autoComplete="new-password" autoFocus
                    />
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Confirm Password</label>
                    <input
                        type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••" style={inputStyle} autoComplete="new-password"
                    />
                    <div style={{ fontSize: '11px', color: '#999', marginBottom: '16px' }}>
                        Must be at least 8 characters.
                    </div>
                    <button type="submit" disabled={loading} style={btn(dark)}>
                        {loading ? 'Updating...' : 'Update Password'}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '11px', color: '#bbb' }}>
                    MafutaFlow Africa · Mafuta Salama · Nairobi, Kenya
                </div>
            </div>
        </div>
    );
}