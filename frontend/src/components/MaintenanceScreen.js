import React from 'react';

export default function MaintenanceScreen({ status, lastCheckedAt, retryNow }) {
    const dark = '#1a1a2e';

    const card = {
        minHeight: '100vh', background: '#0f0f1e',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif', padding: '24px',
    };

    const box = {
        background: '#fff', borderRadius: '16px', padding: '40px',
        width: '100%', maxWidth: '440px', textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
    };

    const btn = {
        padding: '13px 24px', border: 'none', borderRadius: '8px',
        background: dark, color: '#fff', fontSize: '14px', fontWeight: '600',
        cursor: 'pointer', marginTop: '8px',
    };

    const isOffline = status === 'offline';

    return (
        <div style={card}>
            <div style={box}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                    {isOffline ? '📶' : '🔧'}
                </div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: dark, marginBottom: '10px' }}>
                    {isOffline ? "You're offline" : "We'll be right back"}
                </div>
                <div style={{ fontSize: '14px', color: '#666', lineHeight: '1.6', marginBottom: '20px' }}>
                    {isOffline ? (
                        <>Check your internet connection. FuelSense will reconnect automatically the moment you're back online.</>
                    ) : (
                        <>FuelSense is temporarily unavailable — this is on our side, not yours. Your data is safe, and we're already retrying automatically.</>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f39c12', display: 'inline-block', animation: 'fs-pulse 1.4s ease-in-out infinite' }} />
                    <span style={{ fontSize: '12px', color: '#999' }}>
                        Retrying automatically{lastCheckedAt ? ` · last checked ${lastCheckedAt.toLocaleTimeString()}` : ''}
                    </span>
                </div>

                <button onClick={retryNow} style={btn}>
                    Try again now
                </button>

                <div style={{ fontSize: '11px', color: '#bbb', marginTop: '24px' }}>
                    FuelSense · Mafuta Salama · Nairobi, Kenya
                </div>
            </div>

            <style>{`
        @keyframes fs-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
        </div>
    );
}