// ═══════════════════════════════════════════════════════════════════════════
// pendingPayment.js — survives network drops during checkout
//
// WHAT THIS DOES (and doesn't do):
// We can't queue an actual charge offline the way WhatsApp queues a message —
// the money movement itself requires reaching Pesapal's live servers, so
// there's nothing to "send later." What we CAN do, safely, is make sure the
// browser never forgets an attempt was in progress, so that when connectivity
// returns — whether in 5 seconds or after the phone was in a dead zone for an
// hour — the app resumes checking that SAME attempt instead of either losing
// track of it, or letting the user accidentally start a second one.
//
// This is the same principle behind WhatsApp's local outbox: not "fire and
// forget," but "never forget where you left off."
// ═══════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'fuelsense_pending_payment';

// Call this the MOMENT an idempotency key is generated — before the fetch
// to /api/payments/initiate even fires. If the request never completes
// (network drop mid-flight), reloading the page will find this and reuse
// the SAME key on retry rather than generating a new one.
export function savePendingPayment({ idempotencyKey, planId, planName, billingCycle, stationId }) {
    const record = {
        idempotencyKey,
        planId,
        planName,
        billingCycle,
        stationId,
        orderTrackingId: null,   // filled in once initiate() actually succeeds
        createdAt: Date.now(),
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch (e) {
        console.error('[PendingPayment] Failed to persist:', e);
    }
    return record;
}

// Call this once /api/payments/initiate DOES respond successfully — before
// redirecting to Pesapal. This is what survives if the network drops WHILE
// the user is on Pesapal's site, or during the redirect back.
export function attachOrderTrackingId(orderTrackingId) {
    const existing = getPendingPayment();
    if (!existing) return;
    existing.orderTrackingId = orderTrackingId;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    } catch (e) {
        console.error('[PendingPayment] Failed to update:', e);
    }
}

export function getPendingPayment() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

// Call this once a payment DEFINITIVELY resolves (Completed or Failed) —
// clears the local record so it doesn't get treated as still-pending forever.
export function clearPendingPayment() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.error('[PendingPayment] Failed to clear:', e);
    }
}

// A pending record older than this is treated as abandoned rather than
// resumable — avoids resurrecting a genuinely dead attempt from days ago.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours

export function isPendingPaymentStale(record) {
    if (!record) return true;
    return Date.now() - record.createdAt > STALE_AFTER_MS;
}