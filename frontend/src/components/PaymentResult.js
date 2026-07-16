import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function PaymentResult({ darkMode }) {
  const [status, setStatus] = useState('processing'); // processing | success | failed | still_processing
  const [countdown, setCountdown] = useState(5);

  const colors = {
    text: darkMode ? '#e0e0e0' : '#1a1a2e',
    subtext: darkMode ? '#888' : '#666',
    card: darkMode ? '#1e1e2e' : '#ffffff',
    border: darkMode ? '#2a2a3e' : '#e0e0e0',
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const orderTrackingId = urlParams.get('OrderTrackingId') || sessionStorage.getItem('orderTrackingId');

    sessionStorage.removeItem('paymentStatus');
    sessionStorage.removeItem('orderTrackingId');

    if (!orderTrackingId) {
      // No way to check real status — don't claim success/failure we can't verify
      setStatus('failed');
      return;
    }

    let attempts = 0;
    const maxAttempts = 20; // ~60s at 3s intervals
    let poll;

    async function checkStatus() {
      attempts++;
      try {
        const res = await fetch(`${API}/api/payments/status?orderTrackingId=${orderTrackingId}`);
        const data = await res.json();

        if (data.status === 'Completed') {
          setStatus('success');
          clearInterval(poll);
        } else if (['Failed', 'Invalid', 'Cancelled', 'Error'].includes(data.status)) {
          setStatus('failed');
          clearInterval(poll);
        } else if (attempts >= maxAttempts) {
          setStatus('still_processing');
          clearInterval(poll);
        }
        // otherwise still pending — keep polling silently
      } catch (err) {
        console.error('[PaymentResult] Status poll failed:', err);
        if (attempts >= maxAttempts) {
          setStatus('still_processing');
          clearInterval(poll);
        }
      }
    }

    checkStatus(); // immediate first check, don't wait 3s for the first poll
    poll = setInterval(checkStatus, 3000);

    return () => clearInterval(poll);
  }, []);

  // Auto-redirect countdown only runs once we have a DEFINITIVE outcome —
  // never while still genuinely processing, so a lagging payment never gets
  // silently bounced away from its own status page.
  useEffect(() => {
    if (status !== 'success' && status !== 'failed') return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = '/?tab=billing';
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  const containerStyle = {
    maxWidth: '500px',
    margin: '50px auto',
    padding: '40px',
    background: colors.card,
    borderRadius: '16px',
    textAlign: 'center',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    border: `1px solid ${colors.border}`,
  };

  const buttonStyle = {
    background: '#1a1a2e',
    color: '#fff',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '20px',
  };

  const goToBilling = () => {
    window.location.href = '/?tab=billing';
  };

  if (status === 'processing') {
    return (
      <div style={containerStyle}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>⏳</div>
        <h2 style={{ color: colors.text, marginBottom: '10px' }}>Processing Payment...</h2>
        <p style={{ color: colors.subtext }}>
          Please wait while we confirm your payment.
        </p>
        <p style={{ color: colors.subtext, fontSize: '12px', marginTop: '20px' }}>
          Do not close this page.
        </p>
      </div>
    );
  }

  if (status === 'still_processing') {
    return (
      <div style={containerStyle}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>⏳</div>
        <h2 style={{ color: colors.text, marginBottom: '10px' }}>Still Processing</h2>
        <p style={{ color: colors.text, marginBottom: '5px' }}>
          This is taking longer than usual — mobile money confirmations sometimes lag a few extra minutes.
        </p>
        <p style={{ color: colors.subtext, fontSize: '13px', marginTop: '16px' }}>
          You'll see your updated subscription automatically once it confirms. It's safe to leave this page — we won't lose track of your payment.
        </p>
        <button style={buttonStyle} onClick={goToBilling}>
          Go to Billing
        </button>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={containerStyle}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>✅</div>
        <h2 style={{ color: '#27ae60', marginBottom: '10px' }}>Payment Successful!</h2>
        <p style={{ color: colors.text, marginBottom: '5px' }}>
          Your subscription has been activated successfully.
        </p>
        <p style={{ color: colors.subtext, fontSize: '14px', marginTop: '20px' }}>
          Redirecting to billing page in {countdown} seconds...
        </p>
        <button style={buttonStyle} onClick={goToBilling}>
          Go to Billing Now
        </button>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ fontSize: '64px', marginBottom: '20px' }}>❌</div>
      <h2 style={{ color: '#e74c3c', marginBottom: '10px' }}>Payment Failed</h2>
      <p style={{ color: colors.text, marginBottom: '5px' }}>
        Your payment could not be processed.
      </p>
      <p style={{ color: colors.subtext, fontSize: '14px', marginBottom: '20px' }}>
        No charge should have been made. If you see a deduction on your end, contact support and we'll resolve it immediately.
      </p>
      <p style={{ color: colors.subtext, fontSize: '12px', marginBottom: '20px' }}>
        Redirecting in {countdown} seconds...
      </p>
      <button style={buttonStyle} onClick={goToBilling}>
        Back to Billing
      </button>
    </div>
  );
}

export default PaymentResult;