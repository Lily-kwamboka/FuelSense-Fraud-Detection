/**
 * MafutaFlow Africa - Ingestion Scheduler
 * Phase 2, Step 4 & 5 + Phase 3 wired in
 */

require('dotenv').config();

const { getInventory }  = require('./atg-client');
const { calculateNSV }  = require('./measurement-engine');
const { Client }        = require('pg');

// ---------------------------------------------------------------------------
// Database — single persistent Client (same as api.js)
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
let db = null;

async function getDb() {
    if (db) return db;
    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();
    console.log('[scheduler] Database connected');
    return db;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS       = 60_000;
const DELIVERY_RISE_THRESHOLD = 50;
const STABLE_CYCLES_REQUIRED  = 10;
const READING_GAP_ALERT_MS    = 5 * 60_000;

// ---------------------------------------------------------------------------
// In-memory delivery state
// ---------------------------------------------------------------------------
const tankState = {};

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------
async function getTankByProbeNumber(probeNumber) {
    const client = await getDb();
    const result = await client.query(
        'SELECT * FROM tanks WHERE tank_number = $1 LIMIT 1',
        [probeNumber]
    );
    return result.rows[0] || null;
}

async function insertReading(tankId, reading, volumes) {
    const client = await getDb();
    const sql = `
        INSERT INTO atg_readings (
            id, tank_id, recorded_at,
            innage_mm, water_mm, temperature_c,
            tov_litres, water_litres, gov_litres, vcf, nsv_litres,
            is_locked
        ) VALUES (
            gen_random_uuid(), $1, NOW(),
            $2, $3, $4, $5, $6, $7, $8, $9,
            FALSE
        ) RETURNING id
    `;
    const result = await client.query(sql, [
        tankId,
        reading.innageMm, reading.waterMm, reading.tempC,
        volumes.tov_litres, volumes.water_litres, volumes.gov_litres,
        volumes.vcf, volumes.nsv_litres,
    ]);
    return result.rows[0].id;
}

async function createDelivery(tankId) {
    const client = await getDb();
    const result = await client.query(
        `INSERT INTO deliveries (id, tank_id, status, offload_started_at)
         VALUES (gen_random_uuid(), $1, 'in_progress', NOW()) RETURNING id`,
        [tankId]
    );
    return result.rows[0].id;
}

async function markOffloadEnded(deliveryId) {
    const client = await getDb();
    await client.query(
        `UPDATE deliveries SET offload_ended_at = NOW(), status = 'awaiting_stabilisation' WHERE id = $1`,
        [deliveryId]
    );
}

// ---------------------------------------------------------------------------
// Delivery detection
// ---------------------------------------------------------------------------
async function runDeliveryDetection(tankId, currentInnageMm) {
    if (!tankState[tankId]) {
        tankState[tankId] = { lastInnageMm: currentInnageMm, lastReadingAt: new Date(), risingCycles: 0, stableCycles: 0, deliveryId: null, deliveryStatus: 'none' };
        return;
    }

    const state = tankState[tankId];
    const delta = currentInnageMm - state.lastInnageMm;

    if (delta > DELIVERY_RISE_THRESHOLD) {
        state.stableCycles = 0;
        if (state.deliveryStatus === 'none') {
            const deliveryId = await createDelivery(tankId);
            state.deliveryId = deliveryId;
            state.deliveryStatus = 'in_progress';
            console.log('[scheduler] DELIVERY STARTED - tank ' + tankId + ' | rise: +' + delta.toFixed(1) + 'mm');
        } else {
            state.risingCycles++;
        }
    } else if (state.deliveryStatus === 'in_progress') {
        state.stableCycles++;
        if (state.stableCycles >= STABLE_CYCLES_REQUIRED) {
            await markOffloadEnded(state.deliveryId);
            state.deliveryStatus = 'awaiting_stabilisation';
            state.risingCycles = 0;
            state.stableCycles = 0;
            console.log('[scheduler] OFFLOAD ENDED - delivery: ' + state.deliveryId);
        }
    }

    state.lastInnageMm  = currentInnageMm;
    state.lastReadingAt = new Date();
}

// ---------------------------------------------------------------------------
// One poll cycle
// ---------------------------------------------------------------------------
async function runPollCycle() {
    const cycleStart = new Date();
    console.log('[scheduler] Poll cycle started at ' + cycleStart.toISOString());

    let readings;
    try {
        readings = await getInventory();
    } catch (err) {
        console.error('[scheduler] Failed to get inventory from ATG:', err.message);
        return;
    }

    for (const reading of readings) {
        let tank;
        try {
            tank = await getTankByProbeNumber(reading.tankNumber);
        } catch (err) {
            console.error('[scheduler] DB error looking up tank ' + reading.tankNumber + ':', err.message);
            db = null; // reset connection on error
            continue;
        }

        if (!tank) {
            console.warn('[scheduler] No tank found for probe number ' + reading.tankNumber);
            continue;
        }

        let volumes;
        try {
            volumes = await calculateNSV(tank.id, reading.innageMm, reading.waterMm, reading.tempC);
        } catch (err) {
            console.error('[scheduler] Volume calculation failed:', err.message);
            continue;
        }

        let readingId;
        try {
            readingId = await insertReading(tank.id, reading, volumes);
            console.log(
                '[scheduler] Reading saved | tank: ' + tank.tank_number +
                ' (' + reading.product + ')' +
                ' | innage: ' + reading.innageMm + 'mm' +
                ' | nsv: ' + volumes.nsv_litres + 'L'
            );
        } catch (err) {
            console.error('[scheduler] Failed to insert reading:', err.message);
            db = null;
            continue;
        }

        if (reading.waterMm > 50) {
            console.warn('[ALERT] High water level on tank ' + tank.id + ': ' + reading.waterMm + 'mm');
        }

        try {
            await runDeliveryDetection(tank.id, reading.innageMm);
        } catch (err) {
            console.error('[scheduler] Delivery detection error:', err.message);
        }
    }

    const elapsed = Date.now() - cycleStart.getTime();
    console.log('[scheduler] Poll cycle complete in ' + elapsed + 'ms\n');
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start() {
    console.log('\n================================================');
    console.log('  MafutaFlow Africa Ingestion Scheduler');
    console.log('  Poll interval: ' + (POLL_INTERVAL_MS / 1000) + 's');
    console.log('  DB: ' + DATABASE_URL);
    console.log('================================================\n');

    try {
        await getDb();
    } catch (err) {
        console.error('[scheduler] Database connection FAILED:', err.message);
        process.exit(1);
    }

    await runPollCycle();
    setInterval(runPollCycle, POLL_INTERVAL_MS);
}

start().catch(err => {
    console.error('[scheduler] Fatal error:', err.message);
    process.exit(1);
});
