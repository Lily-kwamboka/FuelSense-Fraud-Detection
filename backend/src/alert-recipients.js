/**
 * MafutaFlow Africa — Alert Recipient Resolver
 *
 * Determines WHO should receive an email alert for a given station,
 * based on the role + station assignment of each user in `user_profiles`,
 * cross-referenced with their email address from Supabase Auth.
 *
 * Permission model:
 *  - owner, headquarters, supervisor, compliance_officer
 *      -> "global" roles: notified for ALL stations
 *  - station_manager, shift_supervisor
 *      -> notified ONLY for the station they are assigned to
 *  - attendant
 *      -> never notified (no edit/report permissions)
 *
 * Requires env vars:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY   (service role key, NOT the anon key)
 */

'use strict';

// Node 20 does not have a native WebSocket global (added in Node 22).
// @supabase/supabase-js always initializes a realtime client internally,
// which requires WebSocket to exist — even though we never use realtime
// features here (only auth.admin.listUsers). Polyfill it with `ws`.
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require('ws');
}

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Roles that should be notified about alerts at EVERY station
const GLOBAL_ALERT_ROLES = ['owner', 'headquarters', 'supervisor', 'compliance_officer'];

// Roles that should be notified only for their assigned station
const STATION_ALERT_ROLES = ['station_manager', 'shift_supervisor'];

let supabaseAdmin = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
} else {
  console.warn(
    '[ALERT-RECIPIENTS] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — ' +
    'will fall back to ALERT_TO_EMAIL for all alerts.'
  );
}

// ── In-memory cache (alert-checker runs every 5 min via cron, so a short
//    cache avoids hammering the Auth admin API on every single check) ──────
let cache = {
  profiles: null,   // [{ supabase_uid, role, station_id }]
  emailMap: null,   // { [supabase_uid]: email }
  fetchedAt: 0,
};
const CACHE_TTL_MS = 4 * 60 * 1000; // 4 minutes

/**
 * Fetch ALL users from Supabase Auth (paginated) and build a uid -> email map.
 */
async function fetchEmailMap() {
  const emailMap = {};
  if (!supabaseAdmin) return emailMap;

  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });

    if (error) {
      console.error('[ALERT-RECIPIENTS] auth.admin.listUsers failed:', error.message);
      break;
    }

    for (const user of data.users) {
      if (user.email) emailMap[user.id] = user.email;
    }

    if (!data.users || data.users.length < perPage) break;
    page += 1;
  }

  return emailMap;
}

/**
 * Fetch role/station assignments from the user_profiles table.
 * @param {import('pg').Client} db - active pg client
 */
async function fetchProfiles(db) {
  const res = await db.query(`SELECT supabase_uid, role, station_id FROM user_profiles`);
  return res.rows;
}

/**
 * Refresh the in-memory cache of profiles + emails.
 * @param {import('pg').Client} db
 */
async function refreshCache(db) {
  const [profiles, emailMap] = await Promise.all([
    fetchProfiles(db),
    fetchEmailMap(),
  ]);

  cache = { profiles, emailMap, fetchedAt: Date.now() };
  return cache;
}

/**
 * Get the list of email addresses that should be notified for an alert
 * occurring at the given station.
 *
 * @param {import('pg').Client} db - active pg client (reused from alert-checker)
 * @param {string|null} stationId - the station_id the alert relates to.
 *        Pass null for system-wide alerts (no specific station).
 * @returns {Promise<string[]>} de-duplicated list of recipient emails
 */
async function getAlertRecipients(db, stationId = null) {
  try {
    if (!cache.profiles || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
      await refreshCache(db);
    }

    const { profiles, emailMap } = cache;
    const recipients = new Set();

    for (const profile of profiles) {
      const email = emailMap[profile.supabase_uid];
      if (!email) continue; // user has no resolvable auth email — skip

      if (GLOBAL_ALERT_ROLES.includes(profile.role)) {
        recipients.add(email);
      } else if (
        STATION_ALERT_ROLES.includes(profile.role) &&
        stationId &&
        profile.station_id === stationId
      ) {
        recipients.add(email);
      }
      // attendant (and any other role) -> never added
    }

    if (recipients.size > 0) {
      return Array.from(recipients);
    }
  } catch (err) {
    console.error('[ALERT-RECIPIENTS] Failed to resolve recipients:', err.message);
  }

  // ── Fallback: if resolution failed or returned nobody, use the
  //    original static ALERT_TO_EMAIL so alerts never silently disappear.
  const fallback = process.env.ALERT_TO_EMAIL || process.env.ALERT_EMAIL;
  if (fallback) {
    console.warn('[ALERT-RECIPIENTS] Falling back to ALERT_TO_EMAIL');
    return fallback.split(',').map((e) => e.trim()).filter(Boolean);
  }

  console.warn('[ALERT-RECIPIENTS] No recipients resolved and no fallback configured.');
  return [];
}

/**
 * Force a cache refresh on the next call (useful after editing user roles).
 */
function invalidateCache() {
  cache = { profiles: null, emailMap: null, fetchedAt: 0 };
}

module.exports = {
  getAlertRecipients,
  invalidateCache,
  GLOBAL_ALERT_ROLES,
  STATION_ALERT_ROLES,
};