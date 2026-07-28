import { useState, useEffect, useRef, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// How often to check while healthy.
const HEALTHY_INTERVAL_MS = 30000;
// How often to retry while DOWN — faster, so recovery is noticed quickly.
const DOWN_RETRY_INTERVAL_MS = 5000;
// Don't flip to "down" on a single dropped request — that's normal network
// jitter, not an outage. Require a few in a row before showing anything.
const FAILURES_BEFORE_DOWN = 3;
// A single request shouldn't hang forever waiting on a dead server.
const REQUEST_TIMEOUT_MS = 6000;

export default function useHealthCheck() {
    const [status, setStatus] = useState('checking'); // checking | online | down | offline
    const [lastCheckedAt, setLastCheckedAt] = useState(null);
    const failureCountRef = useRef(0);
    const timerRef = useRef(null);

    const checkHealth = useCallback(async () => {
        if (!navigator.onLine) {
            setStatus('offline');
            setLastCheckedAt(new Date());
            return false;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const res = await fetch(`${API}/api/health`, { signal: controller.signal });
            clearTimeout(timeout);
            setLastCheckedAt(new Date());

            if (res.ok) {
                failureCountRef.current = 0;
                setStatus('online');
                return true;
            } else {
                failureCountRef.current += 1;
            }
        } catch (err) {
            clearTimeout(timeout);
            failureCountRef.current += 1;
            setLastCheckedAt(new Date());
        }

        if (failureCountRef.current >= FAILURES_BEFORE_DOWN) {
            setStatus('down');
        }
        return false;
    }, []);

    useEffect(() => {
        function scheduleNext(delay) {
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(async () => {
                const ok = await checkHealth();
                scheduleNext(ok ? HEALTHY_INTERVAL_MS : DOWN_RETRY_INTERVAL_MS);
            }, delay);
        }

        // Check immediately on mount, then settle into the interval loop.
        (async () => {
            const ok = await checkHealth();
            scheduleNext(ok ? HEALTHY_INTERVAL_MS : DOWN_RETRY_INTERVAL_MS);
        })();

        // Also react instantly to the browser's own online/offline events —
        // no need to wait for the next poll if the OS already knows.
        function handleOnline() { checkHealth(); }
        function handleOffline() { setStatus('offline'); setLastCheckedAt(new Date()); }
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            clearTimeout(timerRef.current);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const retryNow = useCallback(() => {
        checkHealth();
    }, [checkHealth]);

    return { status, lastCheckedAt, retryNow };
}