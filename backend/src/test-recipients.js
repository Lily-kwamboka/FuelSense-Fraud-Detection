/**
 * MafutaFlow Africa — Alert Recipient Test Script
 *
 * Prints out exactly who would receive an email alert for each station,
 * based on the current `user_profiles` (role + station_id) and Supabase
 * Auth emails. Use this to verify the recipient logic BEFORE relying on
 * the 5-minute cron job to surface issues.
 *
 * Usage:
 *   node src/test-recipients.js          -> checks ALL stations + global
 *   node src/test-recipients.js <id>     -> checks a single station_id
 */

'use strict';

require('dotenv').config();

const { Client } = require('pg');
const { getAlertRecipients, invalidateCache } = require('./alert-recipients');

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  try {
    const onlyStationId = process.argv[2] || null;

    // Pull all stations so we can label results nicely
    const stationsRes = await db.query(`SELECT id, name, location FROM stations ORDER BY name`);
    const stations = stationsRes.rows;

    // Also show the raw user_profiles + resolved emails for context
    const profilesRes = await db.query(`SELECT supabase_uid, role, station_id FROM user_profiles`);
    console.log('═══════════════════════════════════════════════════');
    console.log(' RAW user_profiles');
    console.log('═══════════════════════════════════════════════════');
    for (const p of profilesRes.rows) {
      const station = stations.find((s) => s.id === p.station_id);
      console.log(`  role=${p.role.padEnd(18)} station=${station ? station.name : '(all stations)'}`);
    }
    console.log('');

    invalidateCache(); // force a fresh resolve for this test run

    // 1. Global / system-wide alert (no specific station)
    console.log('═══════════════════════════════════════════════════');
    console.log(' SYSTEM-WIDE alert (station_id = null)');
    console.log('═══════════════════════════════════════════════════');
    const globalRecipients = await getAlertRecipients(db, null);
    globalRecipients.forEach((e) => console.log('  →', e));
    console.log('');

    // 2. Per-station alerts
    const targetStations = onlyStationId
      ? stations.filter((s) => s.id === onlyStationId)
      : stations;

    if (onlyStationId && targetStations.length === 0) {
      console.log(`No station found with id ${onlyStationId}`);
    }

    for (const station of targetStations) {
      console.log('═══════════════════════════════════════════════════');
      console.log(` STATION: ${station.name}  (${station.id})`);
      console.log(` Location: ${station.location || 'n/a'}`);
      console.log('═══════════════════════════════════════════════════');
      const recipients = await getAlertRecipients(db, station.id);
      if (recipients.length === 0) {
        console.log('  (no recipients resolved)');
      } else {
        recipients.forEach((e) => console.log('  →', e));
      }
      console.log('');
    }

    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('[TEST-RECIPIENTS] Fatal error:', err.message);
    process.exit(1);
  } finally {
    await db.end();
  }
}

main();