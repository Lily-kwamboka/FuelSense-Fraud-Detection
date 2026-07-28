import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

// npm install socket.io-client   (frontend)

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// How long to animate FROM the old value TO the new one, once a new reading
// arrives. Setting this close to the scheduler's real polling interval
// (60s) means the number is always smoothly "in motion" toward the next
// real value, rather than sitting static and then jumping.
const ANIMATION_DURATION_MS = 55000; // slightly under 60s, so it settles
// just before the next real reading

export default function useTankSocket(activeStation, initialTanks) {
    const [tanks, setTanks] = useState(initialTanks || []);
    const socketRef = useRef(null);
    const animationFramesRef = useRef({}); // tank_id -> requestAnimationFrame id

    // Keep in sync if the parent's initial/polled data changes (e.g. from
    // App.js's existing loadData() — this hook layers ON TOP of that as a
    // fallback, it doesn't replace it).
    useEffect(() => {
        setTanks(initialTanks || []);
    }, [initialTanks]);

    useEffect(() => {
        if (!activeStation) return;

        const socket = io(API, { transports: ['websocket', 'polling'] });
        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('subscribe-station', activeStation);
        });

        socket.on('tank-reading', (reading) => {
            animateTankUpdate(reading);
        });

        return () => {
            socket.disconnect();
            Object.values(animationFramesRef.current).forEach(cancelAnimationFrame);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeStation]);

    function animateTankUpdate(reading) {
        setTanks(prevTanks => {
            const existing = prevTanks.find(t => t.id === reading.tank_id);
            if (!existing) return prevTanks; // tank not in current view — ignore

            const startNSV = parseFloat(existing.nsv_litres) || 0;
            const endNSV = parseFloat(reading.nsv_litres) || 0;
            const startFill = parseFloat(existing.fill_pct) || 0;
            const endFill = parseFloat(reading.fill_pct) || 0;
            const startTime = performance.now();

            if (animationFramesRef.current[reading.tank_id]) {
                cancelAnimationFrame(animationFramesRef.current[reading.tank_id]);
            }

            function step(now) {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
                const eased = 1 - Math.pow(1 - progress, 2);

                const currentNSV = startNSV + (endNSV - startNSV) * eased;
                const currentFill = startFill + (endFill - startFill) * eased;

                setTanks(prev => prev.map(t =>
                    t.id === reading.tank_id
                        ? {
                            ...t, nsv_litres: currentNSV.toFixed(1), fill_pct: currentFill.toFixed(1),
                            innage_mm: reading.innage_mm, water_mm: reading.water_mm,
                            temperature_c: reading.temperature_c, vcf: reading.vcf,
                            recorded_at: reading.recorded_at
                        }
                        : t
                ));

                if (progress < 1) {
                    animationFramesRef.current[reading.tank_id] = requestAnimationFrame(step);
                } else {
                    delete animationFramesRef.current[reading.tank_id];
                }
            }

            animationFramesRef.current[reading.tank_id] = requestAnimationFrame(step);
            return prevTanks;
        });
    }

    return tanks;
}