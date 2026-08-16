'use strict';

const fetch = require('node-fetch');

const CONSUMER_KEY = process.env.PESAPAL_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET;
const IS_SANDBOX = process.env.PESAPAL_ENV !== 'live';

const BASE_URL = IS_SANDBOX
  ? 'https://cybqa.pesapal.com/pesapalv3'
  : 'https://pay.pesapal.com/v3';

console.log('[PESAPAL] Environment:', IS_SANDBOX ? 'SANDBOX' : 'LIVE', '| Base URL:', BASE_URL);

let cachedToken = null;
let tokenExpiry = null;

let cachedIpnId = null;
let cachedIpnPromise = null;

async function getToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  console.log('[PESAPAL] Requesting new token...');

  const res = await fetch(BASE_URL + '/api/Auth/RequestToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      consumer_key: CONSUMER_KEY,
      consumer_secret: CONSUMER_SECRET,
    }),
  });

  const data = await res.json();

  if (!data.token) {
    console.error('[PESAPAL] Auth failed:', JSON.stringify(data));
    throw new Error('Pesapal auth failed: ' + JSON.stringify(data));
  }

  cachedToken = data.token;
  tokenExpiry = Date.now() + (4 * 60 * 60 * 1000);
  console.log('[PESAPAL] Token obtained successfully');
  return cachedToken;
}

// ── Register IPN ──────────────────────────────────────────────────────────
// Registers once and caches the result for the lifetime of the process —
// the IPN ID does not change between transactions, so there is no reason
// to re-register it on every payment. This removes Pesapal's registration
// endpoint from the per-transaction critical path: a transient outage
// there (e.g. a Cloudflare 522 on pay.pesapal.com) can no longer take
// down live payments once the ID is cached.
//
// Retries transient failures (5xx / network errors) with backoff before
// giving up. Throws on final failure — callers must NOT fall back to a
// placeholder ID, since Pesapal's SubmitOrderRequest always rejects a
// non-UUID notification_id anyway (that's the "Invalid IPN URL ID" error).
async function registerIPN(callbackUrl) {
  if (cachedIpnId) return cachedIpnId;

  if (!cachedIpnPromise) {
    cachedIpnPromise = (async () => {
      const MAX_RETRIES = 3;
      let lastErr;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const token = await getToken();

          console.log('[PESAPAL] Registering IPN for URL:', callbackUrl);

          const res = await fetch(BASE_URL + '/api/URLSetup/RegisterIPN', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify({
              url: callbackUrl,
              ipn_notification_type: 'GET',
            }),
          });

          const data = await res.json();

          if (!data.ipn_id) {
            const err = new Error('No ipn_id in response: ' + JSON.stringify(data));
            err.status = res.status;
            throw err;
          }

          console.log('[PESAPAL] IPN registered:', data.ipn_id);
          cachedIpnId = data.ipn_id;
          return cachedIpnId;
        } catch (err) {
          lastErr = err;
          const status = err.status;
          const isTransient = !status || status >= 500;

          console.error(
            `[PESAPAL] IPN registration attempt ${attempt}/${MAX_RETRIES} failed:`,
            err.message
          );

          if (!isTransient || attempt === MAX_RETRIES) break;
          await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1))); // 500ms, 1s, 2s
        }
      }

      throw lastErr;
    })().finally(() => {
      cachedIpnPromise = null;
    });
  }

  return cachedIpnPromise;
}

async function submitOrder(order) {
  const token = await getToken();
  console.log('[PESAPAL] Submitting order:', JSON.stringify(order));

  const payload = {
    ...order,
    amount: parseFloat(order.amount).toFixed(2),
  };

  const url = `${BASE_URL}/api/Transactions/SubmitOrderRequest`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();

    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      console.error('[PESAPAL] Received HTML instead of JSON.');
      throw new Error(`Pesapal returned HTML (status ${res.status}). Check API configuration.`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('[PESAPAL] Failed to parse JSON:', e.message);
      throw new Error(`Invalid JSON response from Pesapal: ${text.substring(0, 200)}`);
    }

    if (!data.redirect_url) {
      console.error('[PESAPAL] Order failed:', JSON.stringify(data));
      throw new Error('Pesapal order failed: ' + JSON.stringify(data));
    }

    console.log('[PESAPAL] Order submitted successfully, redirect URL:', data.redirect_url);
    return data;
  } catch (err) {
    console.error('[PESAPAL] Submit order error:', err.message);
    throw err;
  }
}

async function getTransactionStatus(orderTrackingId) {
  const token = await getToken();

  console.log('[PESAPAL] Getting transaction status for:', orderTrackingId);

  const res = await fetch(
    BASE_URL + '/api/Transactions/GetTransactionStatus?orderTrackingId=' + orderTrackingId,
    {
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
    }
  );

  const text = await res.text();

  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    console.error('[PESAPAL] Received HTML for transaction status');
    throw new Error('Pesapal returned HTML for transaction status');
  }

  const data = JSON.parse(text);
  console.log('[PESAPAL] Transaction status retrieved for:', orderTrackingId, '| Status:', data.payment_status_description);
  return data;
}

// ── Request Refund ────────────────────────────────────────────
// Pesapal's refund endpoint is asynchronous — it acknowledges the request
// but actual reversal to the client's card/M-Pesa/Airtel Money account
// typically takes 3-7 business days depending on the channel. Use this to
// KICK OFF a refund; pair it with an immediate internal account credit
// (extend subscription / mark prepaid) so the client isn't left waiting on
// the bank rail before their MafutaFlow Africa access reflects the correction.
async function requestRefund(orderTrackingId, amount, remarks) {
  const token = await getToken();

  console.log('[PESAPAL] Requesting refund for:', orderTrackingId, '| Amount:', amount);

  const res = await fetch(BASE_URL + '/api/Transactions/RequestRefund', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + token,
    },
    body: JSON.stringify({
      confirmation_code: orderTrackingId,
      amount: parseFloat(amount).toFixed(2),
      username: 'MafutaFlow Africa Admin',
      remarks: remarks || 'Duplicate payment reversal',
    }),
  });

  const text = await res.text();

  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    console.error('[PESAPAL] Received HTML for refund request');
    throw new Error('Pesapal returned HTML for refund request');
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON response from Pesapal refund: ${text.substring(0, 200)}`);
  }

  console.log('[PESAPAL] Refund response:', JSON.stringify(data));
  return data;
}

module.exports = { getToken, registerIPN, submitOrder, getTransactionStatus, requestRefund };