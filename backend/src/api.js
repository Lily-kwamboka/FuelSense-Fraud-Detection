require('dotenv').config();
'use strict';

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { getAlerts, acknowledgeAlert, checkHighWaterAlert, checkLowStockAlert } = require('./alerts');
const { openShift, closeShift, getAllShifts, getShifts } = require('./shift-manager');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.API_PORT || 3001;
const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://fuelsense-dashboard.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'https://fuelsense-fraud-detection.onrender.com'
];

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  maxAge: 86400,
}));

app.use(express.json());

// Initialize Resend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ── DB ────────────────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });

pool.on('error', (err) => {
  console.error('[API] Unexpected DB pool error:', err.message);
});

async function getDb() {
  return pool;
}

async function getTransactionClient() {
  const client = await pool.connect();
  return client;
}

// ── Role access levels ────────────────────────────────────────────────────────
function getRoleAccessLevel(role) {
  return {
    owner: 100, headquarters: 80, supervisor: 70, compliance_officer: 65,
    station_manager: 50, shift_supervisor: 30, attendant: 10
  }[role] || 0;
}

// ── Multi-tenant: resolve caller's organization_id from supabase_uid ─────────
async function resolveUser(db, supabaseUid) {
  if (!supabaseUid) return null;
  const res = await db.query(
    `SELECT role, station_id, organization_id FROM user_profiles WHERE supabase_uid = $1`,
    [supabaseUid]
  );
  if (!res.rows.length) return null;
  const { role, station_id, organization_id } = res.rows[0];
  return { orgId: organization_id, role, stationId: station_id, accessLevel: getRoleAccessLevel(role) };
}

// ── Super admin check ─────────────────────────────────────────────────────────
async function isSuperAdmin(db, email) {
  if (!email) return false;
  const res = await db.query(`SELECT id FROM super_admins WHERE email = $1`, [email]);
  return res.rows.length > 0;
}

// ── Utility endpoints ─────────────────────────────────────────────────────────
app.get('/api/ping', (req, res) => res.json({ message: 'pong', timestamp: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── GET /api/user-profile ─────────────────────────────────────────────────────
app.get('/api/user-profile', async (req, res) => {
  try {
    const client = await getDb();
    const { uid } = req.query;
    if (!uid) return res.status(400).json({ error: 'uid required' });

    const result = await client.query(
      `SELECT u.*, s.name AS station_name, o.name AS organization_name
         FROM user_profiles u
         LEFT JOIN stations s ON s.id = u.station_id
         LEFT JOIN organizations o ON o.id = u.organization_id
        WHERE u.supabase_uid = $1`,
      [uid]
    );
    if (!result.rows.length) return res.json({ role: 'attendant', station_id: null });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stations ─────────────────────────────────────────────────────────
app.get('/api/stations', async (req, res) => {
  try {
    const client = await getDb();
    const user = await resolveUser(client, req.query.uid);

    if (!user || !user.orgId) return res.json([]);

    let query = `SELECT id, name, location FROM stations WHERE organization_id = $1`;
    const params = [user.orgId];

    if (user.accessLevel < 65 && user.stationId) {
      params.push(user.stationId);
      query += ` AND id = $2`;
    }

    query += ` ORDER BY name`;
    const result = await client.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tanks ────────────────────────────────────────────────────────────
app.get('/api/tanks', async (req, res) => {
  try {
    const client = await getDb();
    const user = await resolveUser(client, req.query.uid);
    const stationId = req.query.station_id;

    if (!user || !user.orgId) return res.json([]);

    const params = [user.orgId];
    let where = `s.organization_id = $1`;

    if (stationId) {
      params.push(stationId);
      where += ` AND t.station_id = $${params.length}`;
    } else if (user.accessLevel < 65 && user.stationId) {
      params.push(user.stationId);
      where += ` AND t.station_id = $${params.length}`;
    }

    const result = await client.query(`
      SELECT
         t.id, t.tank_number, t.fuel_type, t.capacity_litres,
         t.fuel_density_at_15c, t.low_stock_threshold_pct,
         s.name AS station_name, s.id AS station_id,
         r.innage_mm, r.water_mm, r.temperature_c, r.nsv_litres,
         r.vcf, r.recorded_at,
         ROUND((r.nsv_litres / t.capacity_litres) * 100, 1) AS fill_pct
       FROM tanks t
       JOIN stations s ON s.id = t.station_id
       LEFT JOIN LATERAL (
         SELECT * FROM atg_readings WHERE tank_id = t.id
         ORDER BY recorded_at DESC LIMIT 1
       ) r ON TRUE
       WHERE ${where}
       ORDER BY s.name, t.tank_number`, params);

    res.json(result.rows);
  } catch (err) {
    console.error('[API] /api/tanks error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tanks/:id/readings ───────────────────────────────────────────────
app.get('/api/tanks/:id/readings', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT innage_mm, nsv_litres, temperature_c, water_mm, vcf, recorded_at
         FROM atg_readings WHERE tank_id = $1
         ORDER BY recorded_at DESC LIMIT 60`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tanks ───────────────────────────────────────────────────────
app.post('/api/tanks', async (req, res) => {
  const { station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c, low_stock_threshold_pct, deadwood_litres, atg_probe_id } = req.body;
  if (!station_id || !tank_number || !fuel_type || !capacity_litres)
    return res.status(400).json({ error: 'station_id, tank_number, fuel_type and capacity_litres are required.' });
  try {
    const client = await getDb();
    const result = await client.query(
      `INSERT INTO tanks (station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c, low_stock_threshold_pct, deadwood_litres, atg_probe_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c || 0.835, low_stock_threshold_pct || 20, deadwood_litres || 0, atg_probe_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[API] POST /api/tanks error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/tanks/:id ────────────────────────────────────────────────────
app.put('/api/tanks/:id', async (req, res) => {
  const { tank_number, fuel_type, capacity_litres, fuel_density_at_15c, low_stock_threshold_pct, deadwood_litres, atg_probe_id } = req.body;
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE tanks SET tank_number=$1, fuel_type=$2, capacity_litres=$3, fuel_density_at_15c=$4, low_stock_threshold_pct=$5, deadwood_litres=$6, atg_probe_id=$7
       WHERE id=$8 RETURNING *`,
      [tank_number, fuel_type, capacity_litres, fuel_density_at_15c || 0.835, low_stock_threshold_pct || 20, deadwood_litres || 0, atg_probe_id || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Tank not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[API] PUT /api/tanks error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/tanks/:id ─────────────────────────────────────────────────
app.delete('/api/tanks/:id', async (req, res) => {
  try {
    const client = await getDb();
    const id = req.params.id;
    await client.query(`UPDATE deliveries SET opening_reading_id = NULL, closing_reading_id = NULL WHERE tank_id=$1`, [id]);
    await client.query(`UPDATE shifts SET opening_reading_id = NULL, closing_reading_id = NULL WHERE tank_id=$1`, [id]);
    await client.query(`DELETE FROM alerts WHERE tank_id=$1`, [id]);
    await client.query(`DELETE FROM daily_reconciliation WHERE tank_id=$1`, [id]);
    await client.query(`DELETE FROM deliveries WHERE tank_id=$1`, [id]);
    await client.query(`DELETE FROM shifts WHERE tank_id=$1`, [id]);
    await client.query(`DELETE FROM atg_readings WHERE tank_id=$1`, [id]);
    await client.query(`DELETE FROM strapping_table_entries WHERE tank_id=$1`, [id]);
    await client.query(`DELETE FROM tanks WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE /api/tanks error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/deliveries ───────────────────────────────────────────────────────
app.get('/api/deliveries', async (req, res) => {
  try {
    const client = await getDb();
    const user = await resolveUser(client, req.query.uid);
    const stationId = req.query.station_id;

    if (!user || !user.orgId) return res.json([]);

    const params = [user.orgId];
    let where = `s.organization_id = $1`;

    if (stationId) {
      params.push(stationId);
      where += ` AND t.station_id = $${params.length}`;
    } else if (user.accessLevel < 65 && user.stationId) {
      params.push(user.stationId);
      where += ` AND t.station_id = $${params.length}`;
    }

    const result = await client.query(`
      SELECT d.id, d.status, d.supplier_name, d.bol_number, d.bol_nsv_litres,
             d.received_nsv_litres, d.variance_litres, d.variance_pct,
             d.variance_classification, d.tolerance_pct, d.truck_arrived_at,
             d.stabilisation_at, t.tank_number, t.fuel_type
        FROM deliveries d
        JOIN tanks t ON t.id = d.tank_id
        JOIN stations s ON s.id = t.station_id
       WHERE ${where}
       ORDER BY d.truck_arrived_at DESC NULLS LAST
       LIMIT 20`, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/deliveries/:id ───────────────────────────────────────────────────
app.get('/api/deliveries/:id', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT d.*, t.tank_number, t.fuel_type,
              o.innage_mm AS opening_innage_mm, o.temperature_c AS opening_temp,
              o.nsv_litres AS opening_nsv, o.recorded_at AS opening_recorded_at,
              c.innage_mm AS closing_innage_mm, c.temperature_c AS closing_temp,
              c.nsv_litres AS closing_nsv, c.recorded_at AS closing_recorded_at
         FROM deliveries d
         JOIN tanks t ON t.id = d.tank_id
         LEFT JOIN atg_readings o ON o.id = d.opening_reading_id
         LEFT JOIN atg_readings c ON c.id = d.closing_reading_id
        WHERE d.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Delivery not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/deliveries ──────────────────────────────────────────────────────
app.post('/api/deliveries', async (req, res) => {
  const { tank_id, supplier_name, bol_number, bol_nsv_litres } = req.body;
  if (!tank_id || !supplier_name || !bol_number || !bol_nsv_litres)
    return res.status(400).json({ error: 'Missing required fields' });
  try {
    const client = await getDb();
    const readingRes = await client.query(
      `SELECT id, nsv_litres FROM atg_readings WHERE tank_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [tank_id]
    );
    if (!readingRes.rows.length) return res.status(400).json({ error: 'No ATG readings found for this tank' });

    const opening = readingRes.rows[0];
    await client.query('UPDATE atg_readings SET is_locked = TRUE WHERE id = $1', [opening.id]);

    const delRes = await client.query(
      `INSERT INTO deliveries (tank_id, supplier_name, bol_number, bol_nsv_litres, truck_arrived_at, opening_reading_id, status)
       VALUES ($1, $2, $3, $4, NOW(), $5, 'in_progress') RETURNING id`,
      [tank_id, supplier_name, bol_number, bol_nsv_litres, opening.id]
    );
    res.status(201).json({ delivery_id: delRes.rows[0].id, opening_nsv: opening.nsv_litres });
  } catch (err) {
    console.error('[API] POST /api/deliveries error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reconciliation ───────────────────────────────────────────────────
app.get('/api/reconciliation', async (req, res) => {
  try {
    const client = await getDb();
    const user = await resolveUser(client, req.query.uid);
    const stationId = req.query.station_id;

    if (!user || !user.orgId) return res.json([]);

    const params = [user.orgId];
    let where = `s.organization_id = $1`;

    if (stationId) {
      params.push(stationId);
      where += ` AND t.station_id = $${params.length}`;
    } else if (user.accessLevel < 65 && user.stationId) {
      params.push(user.stationId);
      where += ` AND t.station_id = $${params.length}`;
    }

    const result = await client.query(`
      SELECT r.recon_date, r.opening_nsv, r.closing_nsv, r.deliveries_nsv,
             r.pump_sales_litres, r.theoretical_closing, r.variance_litres,
             t.tank_number, t.fuel_type
        FROM daily_reconciliation r
        JOIN tanks t ON t.id = r.tank_id
        JOIN stations s ON s.id = t.station_id
       WHERE ${where}
       ORDER BY r.recon_date DESC, t.tank_number
       LIMIT 60`, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/reconciliation/pump-sales ──────────────────────────────────────
app.post('/api/reconciliation/pump-sales', async (req, res) => {
  const { tank_id, recon_date, pump_sales_litres } = req.body;
  if (!tank_id || !recon_date || pump_sales_litres === undefined)
    return res.status(400).json({ error: 'Missing required fields' });
  try {
    const client = await getDb();
    const openRes = await client.query(
      `SELECT nsv_litres FROM atg_readings WHERE tank_id=$1 AND recorded_at::date=$2::date ORDER BY recorded_at ASC  LIMIT 1`, [tank_id, recon_date]);
    const closeRes = await client.query(
      `SELECT nsv_litres FROM atg_readings WHERE tank_id=$1 AND recorded_at::date=$2::date ORDER BY recorded_at DESC LIMIT 1`, [tank_id, recon_date]);

    if (!openRes.rows.length || !closeRes.rows.length)
      return res.status(400).json({ error: 'No readings found for this tank on this date' });

    const openNSV = parseFloat(openRes.rows[0].nsv_litres);
    const closeNSV = parseFloat(closeRes.rows[0].nsv_litres);
    const delivRes = await client.query(
      `SELECT COALESCE(SUM(received_nsv_litres), 0) AS total FROM deliveries
        WHERE tank_id=$1 AND status IN ('confirmed','flagged') AND stabilisation_at::date=$2::date`,
      [tank_id, recon_date]
    );
    const delivNSV = parseFloat(delivRes.rows[0].total) || 0;
    const sales = parseFloat(pump_sales_litres);
    const theoCl = openNSV + delivNSV - sales;
    const variance = closeNSV - theoCl;

    await client.query(
      `INSERT INTO daily_reconciliation (tank_id, recon_date, opening_nsv, closing_nsv, deliveries_nsv, pump_sales_litres, theoretical_closing, variance_litres)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tank_id, recon_date) DO UPDATE SET
         pump_sales_litres=EXCLUDED.pump_sales_litres,
         theoretical_closing=EXCLUDED.theoretical_closing,
         variance_litres=EXCLUDED.variance_litres`,
      [tank_id, recon_date, openNSV.toFixed(3), closeNSV.toFixed(3), delivNSV.toFixed(3), sales.toFixed(3), theoCl.toFixed(3), variance.toFixed(3)]
    );

    res.json({ ok: true, variance_litres: variance.toFixed(1) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/alerts ───────────────────────────────────────────────────────────
app.get('/api/alerts', async (req, res) => {
  try {
    const client = await getDb();
    const alerts = await getAlerts(client, { status: req.query.status || null, limit: parseInt(req.query.limit) || 50 });
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/alerts/summary ───────────────────────────────────────────────────
app.get('/api/alerts/summary', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT severity, COUNT(*) AS count FROM alerts WHERE status='open' GROUP BY severity`
    );
    const summary = { critical: 0, warning: 0, info: 0 };
    for (const row of result.rows) summary[row.severity] = parseInt(row.count);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/alerts/:id/acknowledge ─────────────────────────────────────────
app.post('/api/alerts/:id/acknowledge', async (req, res) => {
  if (!req.body.acknowledged_by) return res.status(400).json({ error: 'acknowledged_by is required' });
  try {
    const client = await getDb();
    await acknowledgeAlert(client, req.params.id, req.body.acknowledged_by);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/alerts/test ─────────────────────────────────────────────────────
app.post('/api/alerts/test', async (req, res) => {
  const { sendTestAlert } = require('./email-alerts');
  const success = await sendTestAlert();
  success
    ? res.json({ message: 'Test alert sent' })
    : res.status(500).json({ error: 'Failed to send test alert' });
});

// ── Shifts ────────────────────────────────────────────────────────────────────
app.get('/api/shifts', async (req, res) => {
  try {
    const client = await getDb();
    res.json(await getAllShifts(client, parseInt(req.query.limit) || 50, req.query.station_id || null));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/shifts/tank/:tankId', async (req, res) => {
  try {
    const client = await getDb();
    res.json(await getShifts(client, req.params.tankId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/shifts/open', async (req, res) => {
  if (!req.body.tank_id) return res.status(400).json({ error: 'tank_id is required' });
  try {
    const client = await getDb();
    res.status(201).json(await openShift(client, req.body.tank_id, req.body.attendant_name));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/shifts/:id/close', async (req, res) => {
  try {
    const client = await getDb();
    res.json(await closeShift(client, req.params.id, {
      pumpMeterOpening: req.body.pump_meter_opening,
      pumpMeterClosing: req.body.pump_meter_closing,
      notes: req.body.notes,
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/pump-vs-dip ──────────────────────────────────────────────────────
app.get('/api/pump-vs-dip', async (req, res) => {
  try {
    const client = await getDb();
    const stationId = req.query.station_id;
    const params = [];
    let where = `s.status IN ('closed','flagged') AND s.dip_sales IS NOT NULL`;
    if (stationId) {
      params.push(stationId);
      where += ` AND t.station_id = ${params.length}`;
    }
    const result = await client.query(
      `SELECT s.id, s.shift_name, s.shift_date, s.opening_nsv, s.closing_nsv,
              s.pump_meter_sales, s.dip_sales, s.variance_litres, s.variance_pct,
              s.status, s.attendant_name, t.tank_number, t.fuel_type
         FROM shifts s JOIN tanks t ON t.id = s.tank_id
        WHERE ${where}
        ORDER BY s.shift_date DESC, s.started_at DESC LIMIT 60`,
      params
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Audit log ─────────────────────────────────────────────────────────────────
app.post('/api/audit-log', async (req, res) => {
  const { user_email, user_role, action, entity_type, entity_id, station_id, old_value, new_value } = req.body;
  if (!user_email || !action || !entity_type) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const client = await getDb();
    await client.query(
      `INSERT INTO audit_log (user_email, user_role, action, entity_type, entity_id, station_id, old_value, new_value, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [user_email, user_role || null, action, entity_type, entity_id || null, station_id || null,
        old_value ? JSON.stringify(old_value) : null,
        new_value ? JSON.stringify(new_value) : null,
        req.headers['x-forwarded-for'] || req.socket.remoteAddress || null]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/audit-log', async (req, res) => {
  try {
    const client = await getDb();
    const params = [];
    let where = '';
    if (req.query.station_id) { params.push(req.query.station_id); where = `WHERE station_id = $${params.length}`; }
    params.push(parseInt(req.query.limit || '50'));
    const result = await client.query(
      `SELECT id, user_email, user_role, action, entity_type, entity_id, station_id, old_value, new_value, ip_address, created_at
         FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Subscription plans ────────────────────────────────────────────────────────
app.get('/api/plans', async (req, res) => {
  try {
    const client = await getDb();
    res.json((await client.query(`SELECT * FROM subscription_plans ORDER BY price_monthly ASC`)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/subscription ─────────────────────────────────────────────────────
app.get('/api/subscription', async (req, res) => {
  try {
    const client = await getDb();
    const uid = req.query.uid;
    const stationId = req.query.station_id;

    let orgId = null;

    if (uid) {
      const user = await resolveUser(client, uid);
      orgId = user?.orgId || null;
    } else if (stationId) {
      const stRes = await client.query(`SELECT organization_id FROM stations WHERE id=$1`, [stationId]);
      orgId = stRes.rows[0]?.organization_id || null;
    }

    if (!orgId) return res.json(null);

    const orgSub = await client.query(
      `SELECT s.*, p.name AS plan_name, p.price_monthly, p.price_annual, p.max_stations, p.max_tanks, p.features
         FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
        WHERE s.organization_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
      [orgId]
    );
    if (orgSub.rows.length) return res.json(orgSub.rows[0]);

    if (stationId) {
      const stSub = await client.query(
        `SELECT s.*, p.name AS plan_name, p.price_monthly, p.price_annual, p.max_stations, p.max_tanks, p.features
           FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
          WHERE s.station_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
        [stationId]
      );
      if (stSub.rows.length) return res.json(stSub.rows[0]);
    }

    const org = await client.query(`SELECT * FROM organizations WHERE id=$1`, [orgId]);
    if (org.rows.length) {
      const o = org.rows[0];
      return res.json({
        status: o.subscription_status,
        trial_ends_at: o.trial_ends_at,
        plan_name: 'Trial',
        organization_id: orgId,
      });
    }

    res.json(null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Payments ──────────────────────────────────────────────────────────────────

// ── POST /api/payments/initiate ──────────────────────────────────────────────
app.post('/api/payments/initiate', async (req, res) => {
  const { station_id, plan_id, billing_cycle, user_email, user_name, phone, test_amount, idempotency_key } = req.body;

  if (!station_id || !plan_id || !billing_cycle || !user_email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!idempotency_key) {
    return res.status(400).json({ error: 'idempotency_key is required' });
  }

  try {
    const client = await getDb();
    const pesapal = require('./pesapal');

    const existing = await client.query(
      `SELECT * FROM payments WHERE idempotency_key = $1`, [idempotency_key]
    );
    if (existing.rows.length) {
      const p = existing.rows[0];
      console.log('[PAYMENT] Idempotent replay — returning existing payment', p.id);
      return res.json({
        payment_id: p.id,
        redirect_url: p.pesapal_redirect_url,
        amount: p.amount_kes,
        plan_name: p.plan_name,
        billing_cycle: p.billing_cycle,
        is_test: p.plan_name === 'TEST_PAYMENT',
      });
    }

    let plan;
    let amount;
    let isTest = false;

    if (test_amount) {
      isTest = true;
      amount = parseFloat(test_amount);
      plan = { name: 'TEST_PAYMENT', id: 'test' };
    } else {
      const planRes = await client.query(`SELECT * FROM subscription_plans WHERE id = $1`, [plan_id]);
      if (!planRes.rows.length) return res.status(404).json({ error: 'Plan not found' });
      plan = planRes.rows[0];
      amount = billing_cycle === 'annual' ? plan.price_annual : plan.price_monthly;
    }

    console.log('[PAYMENT]', isTest ? 'TEST PAYMENT' : 'LIVE PAYMENT', 'Amount:', amount);

    let paymentId;
    try {
      const payRes = await client.query(
        `INSERT INTO payments (station_id, amount_kes, billing_cycle, plan_name, status, idempotency_key)
         VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING id`,
        [station_id, amount, billing_cycle, plan.name, idempotency_key]
      );
      paymentId = payRes.rows[0].id;
    } catch (err) {
      if (err.code === '23505') {
        const raced = await client.query(`SELECT * FROM payments WHERE idempotency_key = $1`, [idempotency_key]);
        const p = raced.rows[0];
        return res.json({
          payment_id: p.id, redirect_url: p.pesapal_redirect_url,
          amount: p.amount_kes, plan_name: p.plan_name, billing_cycle: p.billing_cycle, is_test: isTest,
        });
      }
      throw err;
    }

    const callbackUrl = process.env.API_BASE_URL + '/api/payments/callback';

    // Fail clearly if IPN registration fails — never fall back to a
    // placeholder ID. A fallback here just guarantees a confusing
    // downstream Pesapal rejection instead of an honest "try again".
    let ipnId;
    try {
      ipnId = await pesapal.registerIPN(callbackUrl);
    } catch (err) {
      console.error('[PAYMENT] IPN registration failed, aborting:', err.message);
      return res.status(503).json({ error: 'Payment provider temporarily unavailable. Please try again in a moment.' });
    }

    const order = {
      id: paymentId,
      currency: 'KES',
      amount: parseFloat(amount),
      description: isTest ? 'FuelSense Test Payment' : `FuelSense ${plan.name} - ${billing_cycle} subscription`,
      callback_url: process.env.FRONTEND_URL + '/?tab=payment-result',
      notification_id: ipnId,
      billing_address: {
        email_address: user_email,
        phone_number: phone || '',
        country_code: 'KE',
        first_name: user_name?.split(' ')[0] || 'Customer',
        last_name: user_name?.split(' ')[1] || '',
      },
    };

    const pesapalRes = await pesapal.submitOrder(order);

    await client.query(
      `UPDATE payments SET pesapal_order_id = $1, pesapal_redirect_url = $2 WHERE id = $3`,
      [pesapalRes.order_tracking_id, pesapalRes.redirect_url, paymentId]
    );

    res.json({
      payment_id: paymentId,
      redirect_url: pesapalRes.redirect_url,
      amount,
      plan_name: plan.name,
      billing_cycle,
      is_test: isTest,
    });

  } catch (err) {
    console.error('[API] payment initiate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payments/status ──────────────────────────────────────────────────
app.get('/api/payments/status', async (req, res) => {
  const { orderTrackingId } = req.query;
  if (!orderTrackingId) return res.status(400).json({ error: 'orderTrackingId required' });

  try {
    const client = await getDb();

    const payRes = await client.query(
      `SELECT status FROM payments WHERE pesapal_order_id = $1`, [orderTrackingId]
    );
    if (payRes.rows.length && payRes.rows[0].status === 'completed') {
      return res.json({ status: 'Completed' });
    }
    if (payRes.rows.length && payRes.rows[0].status === 'failed') {
      return res.json({ status: 'Failed' });
    }

    const pesapal = require('./pesapal');
    const live = await pesapal.getTransactionStatus(orderTrackingId);
    res.json({ status: live.payment_status_description });
  } catch (err) {
    console.error('[API] payment status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payments/callback ───────────────────────────────────────────────
app.get('/api/payments/callback', async (req, res) => {
  const { OrderTrackingId, OrderMerchantReference } = req.query;

  const client = await getTransactionClient();
  try {
    const pesapal = require('./pesapal');
    const status = await pesapal.getTransactionStatus(OrderTrackingId);

    await client.query('BEGIN');

    if (status.payment_status_description === 'Completed') {
      await client.query(
        `UPDATE payments SET status = 'completed', pesapal_tracking_id = $1 WHERE id = $2`,
        [OrderTrackingId, OrderMerchantReference]
      );

      const payRes = await client.query(`SELECT * FROM payments WHERE id = $1`, [OrderMerchantReference]);
      const payment = payRes.rows[0];

      if (payment && payment.plan_name !== 'TEST_PAYMENT') {
        const planRes = await client.query(`SELECT * FROM subscription_plans WHERE name = $1`, [payment.plan_name]);
        const plan = planRes.rows[0];

        if (plan) {
          const now = new Date();
          const end = new Date(now);
          if (payment.billing_cycle === 'annual') {
            end.setFullYear(end.getFullYear() + 1);
          } else {
            end.setMonth(end.getMonth() + 1);
          }

          await client.query(
            `INSERT INTO subscriptions
               (station_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
             VALUES ($1, $2, $3, 'active', $4, $5)
             ON CONFLICT (station_id, plan_id) DO UPDATE SET
               status = 'active',
               current_period_start = EXCLUDED.current_period_start,
               current_period_end = EXCLUDED.current_period_end`,
            [payment.station_id, plan.id, payment.billing_cycle, now, end]
          );
        }
      }
      console.log('[PESAPAL] Payment completed for station:', payment?.station_id);
    } else if (['Failed', 'Invalid'].includes(status.payment_status_description)) {
      await client.query(
        `UPDATE payments SET status = 'failed', pesapal_tracking_id = $1 WHERE id = $2`,
        [OrderTrackingId, OrderMerchantReference]
      );
    }

    await client.query('COMMIT');
    res.redirect(process.env.FRONTEND_URL + '/?tab=payment-result&OrderTrackingId=' + OrderTrackingId);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
    console.error('[API] payment callback error:', err.message);
    res.redirect(process.env.FRONTEND_URL + '?payment=error');
  } finally {
    client.release();
  }
});

// ── POST /api/payments/refund ─────────────────────────────────────────────────
app.post('/api/payments/refund', async (req, res) => {
  const { payment_id, reason } = req.body;
  if (!payment_id) return res.status(400).json({ error: 'payment_id is required' });

  try {
    const client = await getDb();
    const payRes = await client.query(`SELECT * FROM payments WHERE id = $1`, [payment_id]);
    if (!payRes.rows.length) return res.status(404).json({ error: 'Payment not found' });

    const payment = payRes.rows[0];
    if (payment.status !== 'completed') {
      return res.status(400).json({ error: 'Only completed payments can be refunded' });
    }
    if (payment.refund_status === 'requested') {
      return res.status(400).json({ error: 'Refund already requested for this payment' });
    }

    const pesapal = require('./pesapal');
    const refundRes = await pesapal.requestRefund(
      payment.pesapal_tracking_id || payment.pesapal_order_id,
      payment.amount_kes,
      reason || 'Duplicate payment reversal'
    );

    await client.query(
      `UPDATE payments SET refund_status = 'requested', refund_requested_at = NOW() WHERE id = $1`,
      [payment_id]
    );

    res.json({ ok: true, pesapal_response: refundRes });
  } catch (err) {
    console.error('[API] refund error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payments/history ────────────────────────────────────────────────
app.get('/api/payments/history', async (req, res) => {
  try {
    const client = await getDb();
    const { station_id, uid } = req.query;
    const user = uid ? await resolveUser(client, uid) : null;
    const params = [];
    let where = '';

    if (user?.orgId) {
      params.push(user.orgId);
      where = `WHERE organization_id = $${params.length}`;
    } else if (station_id) {
      params.push(station_id);
      where = `WHERE station_id = $${params.length}`;
    } else {
      return res.status(400).json({ error: 'station_id or uid required' });
    }
    params.push(20);
    const result = await client.query(
      `SELECT * FROM payments ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/payments/test ───────────────────────────────────────────────────
app.post('/api/payments/test', async (req, res) => {
  const { station_id, amount, user_email, user_name, phone } = req.body;
  if (!amount || !user_email) return res.status(400).json({ error: 'Missing required fields: amount, user_email' });
  try {
    const client = await getDb();
    const pesapal = require('./pesapal');
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let realStationId = station_id;
    if (!station_id || !uuidRegex.test(station_id)) {
      const stRes = await client.query(`SELECT id FROM stations LIMIT 1`);
      realStationId = stRes.rows[0]?.id;
      if (!realStationId) return res.status(400).json({ error: 'No stations found' });
    }
    const stRes = await client.query(`SELECT organization_id FROM stations WHERE id=$1`, [realStationId]);
    const orgId = stRes.rows[0]?.organization_id || null;
    const payRes = await client.query(
      `INSERT INTO payments (station_id, organization_id, amount_kes, billing_cycle, plan_name, status)
       VALUES ($1,$2,$3,'monthly','TEST_PAYMENT','pending') RETURNING id`,
      [realStationId, orgId, amount]
    );
    const paymentId = payRes.rows[0].id;

    // Use the same cached/registered IPN as /initiate instead of a
    // hardcoded ID, so there's only ever one IPN registration to track
    // in the Pesapal dashboard.
    const callbackUrl = process.env.API_BASE_URL + '/api/payments/callback';
    let ipnId;
    try {
      ipnId = await pesapal.registerIPN(callbackUrl);
    } catch (err) {
      console.error('[PAYMENT] IPN registration failed, aborting:', err.message);
      return res.status(503).json({ error: 'Payment provider temporarily unavailable. Please try again in a moment.' });
    }

    const pesapalRes = await pesapal.submitOrder({
      id: paymentId, currency: 'KES', amount: parseFloat(amount),
      description: `FuelSense Test Payment - KES ${amount}`,
      callback_url: process.env.FRONTEND_URL + '/payment-success',
      notification_id: ipnId,
      billing_address: {
        email_address: user_email, phone_number: phone || '', country_code: 'KE',
        first_name: user_name?.split(' ')[0] || 'Customer', last_name: user_name?.split(' ')[1] || ''
      },
    });
    await client.query(`UPDATE payments SET pesapal_order_id=$1 WHERE id=$2`, [pesapalRes.order_tracking_id, paymentId]);
    res.json({ payment_id: paymentId, redirect_url: pesapalRes.redirect_url, amount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/debug-pesapal ────────────────────────────────────────────────────
app.get('/api/debug-pesapal', (req, res) => {
  const IS_SANDBOX = process.env.PESAPAL_ENV !== 'live';
  res.json({
    pesapal_env: process.env.PESAPAL_ENV, is_sandbox: IS_SANDBOX,
    base_url: IS_SANDBOX ? 'https://cybqa.pesapal.com/pesapalv3' : 'https://pay.pesapal.com/v3',
    consumer_key_exists: !!process.env.PESAPAL_CONSUMER_KEY,
    consumer_secret_exists: !!process.env.PESAPAL_CONSUMER_SECRET,
  });
});

// ── SUPER ADMIN: manage organizations ────────────────────────────────────────
app.post('/api/admin/organizations', async (req, res) => {
  const { admin_email, name, slug, owner_email, plan_id, max_stations, max_tanks } = req.body;
  if (!admin_email || !name || !owner_email)
    return res.status(400).json({ error: 'admin_email, name, owner_email required' });

  try {
    const client = await getDb();
    const isAdmin = await isSuperAdmin(client, admin_email);
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden: super admin only' });

    let maxSt = max_stations || 1, maxTk = max_tanks || 5;
    if (plan_id) {
      const planRes = await client.query(`SELECT max_stations, max_tanks FROM subscription_plans WHERE id=$1`, [plan_id]);
      if (planRes.rows.length) { maxSt = planRes.rows[0].max_stations; maxTk = planRes.rows[0].max_tanks; }
    }

    const orgRes = await client.query(
      `INSERT INTO organizations (name, slug, owner_email, plan_id, max_stations, max_tanks, subscription_status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'trial',$7) RETURNING *`,
      [name, slug || name.toLowerCase().replace(/\s+/g, '-'), owner_email, plan_id || null, maxSt, maxTk, admin_email]
    );
    const org = orgRes.rows[0];
    console.log('[SUPER-ADMIN] Created org:', org.name, '| owner:', owner_email);

    let inviteResult = null;
    let inviteError = null;

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { createClient } = require('@supabase/supabase-js');
        if (typeof globalThis.WebSocket === 'undefined') {
          globalThis.WebSocket = require('ws');
        }
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(owner_email, {
          redirectTo: process.env.FRONTEND_URL || 'https://fuelsense-dashboard.vercel.app',
        });

        if (error) {
          inviteError = error.message;
          console.error('[SUPER-ADMIN] Invite failed:', error.message);
        } else {
          inviteResult = data.user;
          console.log('[SUPER-ADMIN] Invite sent to:', owner_email, '| uid:', inviteResult.id);

          await client.query(
            `INSERT INTO user_profiles (supabase_uid, email, role, station_id, organization_id)
             VALUES ($1,$2,'owner',NULL,$3)
             ON CONFLICT (supabase_uid) DO UPDATE SET role='owner', organization_id=$3`,
            [inviteResult.id, owner_email, org.id]
          );
          console.log('[SUPER-ADMIN] Linked user_profiles for:', owner_email, '-> org:', org.id);
        }
      } catch (err) {
        inviteError = err.message;
        console.error('[SUPER-ADMIN] Invite/link error:', err.message);
      }
    } else {
      inviteError = 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured — invite not sent automatically.';
    }

    res.status(201).json({
      ok: true,
      organization: org,
      invite_sent: !!inviteResult,
      invite_error: inviteError,
      message: inviteResult
        ? `Organization "${name}" created and an invite email has been sent to ${owner_email}. They'll set a password and be automatically linked as the owner.`
        : `Organization "${name}" created, but the automatic invite failed (${inviteError}). Please invite ${owner_email} manually via Supabase Auth, then set their user_profiles.organization_id to ${org.id}.`,
    });
  } catch (err) {
    console.error('[SUPER-ADMIN] Create org error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/organizations', async (req, res) => {
  const { admin_email } = req.query;
  try {
    const client = await getDb();
    const isAdmin = await isSuperAdmin(client, admin_email);
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden: super admin only' });

    const result = await client.query(`
      SELECT o.*,
             COUNT(DISTINCT s.id)  AS station_count,
             COUNT(DISTINCT u.id)  AS user_count
        FROM organizations o
        LEFT JOIN stations s ON s.organization_id = o.id
        LEFT JOIN user_profiles u ON u.organization_id = o.id
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/organizations/:id', async (req, res) => {
  const { admin_email } = req.query;
  try {
    const client = await getDb();
    const isAdmin = await isSuperAdmin(client, admin_email);
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden: super admin only' });

    const [orgRes, stationsRes, usersRes] = await Promise.all([
      client.query(`SELECT o.*, p.name AS plan_name FROM organizations o LEFT JOIN subscription_plans p ON p.id=o.plan_id WHERE o.id=$1`, [req.params.id]),
      client.query(`SELECT id, name, location, created_at FROM stations WHERE organization_id=$1 ORDER BY name`, [req.params.id]),
      client.query(`SELECT supabase_uid, email, full_name, role, station_id, created_at FROM user_profiles WHERE organization_id=$1 ORDER BY role`, [req.params.id]),
    ]);
    if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
    res.json({ organization: orgRes.rows[0], stations: stationsRes.rows, users: usersRes.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/user-profiles/:uid', async (req, res) => {
  const { admin_email, role, station_id } = req.body;
  try {
    const client = await getDb();
    const isAdmin = await isSuperAdmin(client, admin_email);
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden: super admin only' });
    if (!role) return res.status(400).json({ error: 'role required' });

    await client.query(
      `UPDATE user_profiles SET role=$1, station_id=$2 WHERE supabase_uid=$3`,
      [role, station_id || null, req.params.uid]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Owner: add a station to their org ────────────────────────────────────────
app.post('/api/stations', async (req, res) => {
  const { uid, name, location, timezone } = req.body;
  if (!uid || !name) return res.status(400).json({ error: 'uid and name required' });
  try {
    const client = await getDb();
    const user = await resolveUser(client, uid);
    if (!user || user.accessLevel < 100) return res.status(403).json({ error: 'Owner access required' });

    const org = await client.query(`SELECT max_stations FROM organizations WHERE id=$1`, [user.orgId]);
    const countRes = await client.query(`SELECT COUNT(*) AS count FROM stations WHERE organization_id=$1`, [user.orgId]);
    const current = parseInt(countRes.rows[0].count);
    const maxSt = org.rows[0]?.max_stations || 1;
    if (maxSt !== -1 && current >= maxSt)
      return res.status(403).json({ error: `Station limit reached (${maxSt}). Upgrade your plan to add more stations.` });

    const result = await client.query(
      `INSERT INTO stations (name, location, timezone, organization_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, location || '', timezone || 'Africa/Nairobi', user.orgId]
    );
    console.log('[API] Station created:', result.rows[0].name, '| org:', user.orgId);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[API] POST /api/stations error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN PORTAL ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

async function resolveAdminOrg(db, uid) {
  if (uid) {
    const user = await resolveUser(db, uid);
    if (user?.orgId) return user.orgId;
  }
  const res = await db.query(`SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1`);
  return res.rows[0]?.id || null;
}

// ── STATIONS (admin CRUD) ─────────────────────────────────────────────────────
app.get('/api/admin/stations', async (req, res) => {
  try {
    const client = await getDb();
    const filterOrgId = req.query.organization_id || null;
    const orgId = await resolveAdminOrg(client, req.query.uid);
    if (!orgId && !filterOrgId) return res.json([]);

    const result = await client.query(`
      SELECT s.id, s.name, s.location, s.organization_id,
       COUNT(t.id) AS tank_count
        FROM stations s
        LEFT JOIN tanks t ON t.station_id = s.id
       WHERE ($1::uuid IS NULL OR s.organization_id = $1)
       GROUP BY s.id
       ORDER BY s.name`, [filterOrgId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/stations', async (req, res) => {
  const { name, location, uid, organization_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Station name is required.' });
  try {
    const client = await getDb();
    const resolvedOrgId = await resolveAdminOrg(client, uid);
    const orgId = organization_id || resolvedOrgId;
    if (!orgId) return res.status(400).json({ error: 'No organization found for this user.' });

    const countRes = await client.query(`SELECT COUNT(*) AS count FROM stations WHERE organization_id=$1`, [orgId]);
    const orgRes = await client.query(`SELECT max_stations FROM organizations WHERE id=$1`, [orgId]);
    const maxSt = orgRes.rows[0]?.max_stations ?? 1;
    if (maxSt !== -1 && parseInt(countRes.rows[0].count) >= maxSt) {
      return res.status(403).json({ error: `Station limit reached (${maxSt}). Upgrade your plan to add more stations.` });
    }

    const result = await client.query(
      `INSERT INTO stations (name, location, organization_id) VALUES ($1,$2,$3) RETURNING *`,
      [name, location || '', orgId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/stations/:id', async (req, res) => {
  const { name, location } = req.body;
  if (!name) return res.status(400).json({ error: 'Station name is required.' });
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE stations SET name=$1, location=$2 WHERE id=$3 RETURNING *`,
      [name, location || '', req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Station not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/stations/:id', async (req, res) => {
  try {
    const client = await getDb();
    const id = req.params.id;

    await client.query(`UPDATE deliveries SET opening_reading_id = NULL, closing_reading_id = NULL WHERE tank_id IN (SELECT id FROM tanks WHERE station_id=$1)`, [id]);
    await client.query(`UPDATE shifts SET opening_reading_id = NULL, closing_reading_id = NULL WHERE tank_id IN (SELECT id FROM tanks WHERE station_id=$1)`, [id]);
    await client.query(`DELETE FROM alerts WHERE tank_id IN (SELECT id FROM tanks WHERE station_id=$1)`, [id]);
    await client.query(`DELETE FROM daily_reconciliation WHERE tank_id IN (SELECT id FROM tanks WHERE station_id=$1)`, [id]);
    await client.query(`DELETE FROM deliveries WHERE tank_id IN (SELECT id FROM tanks WHERE station_id=$1)`, [id]);
    await client.query(`DELETE FROM shifts WHERE tank_id IN (SELECT id FROM tanks WHERE station_id=$1)`, [id]);
    await client.query(`DELETE FROM atg_readings WHERE tank_id IN (SELECT id FROM tanks WHERE station_id=$1)`, [id]);
    await client.query(`DELETE FROM strapping_table_entries WHERE tank_id IN (SELECT id FROM tanks WHERE station_id=$1)`, [id]);
    await client.query(`DELETE FROM tanks WHERE station_id=$1`, [id]);
    await client.query(`DELETE FROM alert_config WHERE station_id=$1`, [id]);
    await client.query(`DELETE FROM audit_log WHERE station_id=$1`, [id]);
    await client.query(`DELETE FROM payments WHERE station_id=$1`, [id]);
    await client.query(`DELETE FROM reconciliation_config WHERE station_id=$1`, [id]);
    await client.query(`DELETE FROM station_settings WHERE station_id=$1`, [id]);
    await client.query(`DELETE FROM subscriptions WHERE station_id=$1`, [id]);
    await client.query(`UPDATE user_profiles SET station_id = NULL WHERE station_id=$1`, [id]);
    await client.query(`DELETE FROM stations WHERE id=$1`, [id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[API] Delete station error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── USERS (admin CRUD) ────────────────────────────────────────────────────────
app.get('/api/admin/users', async (req, res) => {
  try {
    const client = await getDb();
    const orgId = await resolveAdminOrg(client, req.query.uid);
    if (!orgId) return res.json([]);

    const result = await client.query(`
      SELECT u.id, u.supabase_uid, u.email, u.full_name, u.role, u.station_id,
             s.name AS station_name
        FROM user_profiles u
        LEFT JOIN stations s ON s.id = u.station_id
       WHERE u.organization_id = $1
       ORDER BY u.role, u.email`, [orgId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users', async (req, res) => {
  const { supabase_uid, email, full_name, role, station_id, uid } = req.body;
  if (!supabase_uid || !email || !role)
    return res.status(400).json({ error: 'Supabase UID, email and role are required.' });
  try {
    const client = await getDb();
    const orgId = await resolveAdminOrg(client, uid);
    if (!orgId) return res.status(400).json({ error: 'No organization found for this user.' });

    const result = await client.query(
      `INSERT INTO user_profiles (supabase_uid, email, full_name, role, station_id, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [supabase_uid, email, full_name || null, role, station_id || null, orgId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A user with this Supabase UID already exists.' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:id', async (req, res) => {
  const { email, full_name, role, station_id } = req.body;
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE user_profiles SET email=$1, full_name=$2, role=$3, station_id=$4 WHERE id=$5 RETURNING *`,
      [email, full_name || null, role, station_id || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const client = await getDb();
    await client.query(`DELETE FROM user_profiles WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SUPPLIERS (admin CRUD) ────────────────────────────────────────────────────
app.get('/api/admin/suppliers', async (req, res) => {
  try {
    const client = await getDb();
    const orgId = await resolveAdminOrg(client, req.query.uid);
    if (!orgId) return res.json([]);

    const result = await client.query(
      `SELECT * FROM suppliers WHERE organization_id = $1 ORDER BY name`, [orgId]
    );
    res.json(result.rows);
  } catch (err) {
    if (err.message.includes('does not exist')) return res.json([]);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/suppliers', async (req, res) => {
  const { name, contact_name, phone, email, address, tolerance_pct, uid } = req.body;
  if (!name) return res.status(400).json({ error: 'Supplier name is required.' });
  try {
    const client = await getDb();
    const orgId = await resolveAdminOrg(client, uid);
    if (!orgId) return res.status(400).json({ error: 'No organization found for this user.' });

    const result = await client.query(
      `INSERT INTO suppliers (name, contact_name, phone, email, address, tolerance_pct, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, contact_name || null, phone || null, email || null, address || null, tolerance_pct || 0.25, orgId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/suppliers/:id', async (req, res) => {
  const { name, contact_name, phone, email, address, tolerance_pct } = req.body;
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE suppliers SET name=$1, contact_name=$2, phone=$3, email=$4, address=$5, tolerance_pct=$6 WHERE id=$7 RETURNING *`,
      [name, contact_name || null, phone || null, email || null, address || null, tolerance_pct || 0.25, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Supplier not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/suppliers/:id', async (req, res) => {
  try {
    const client = await getDb();
    await client.query(`DELETE FROM suppliers WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('[API] FuelSense API running on port ' + PORT);
  console.log('[API] Multi-tenant mode: enabled');
});

// ── Cron jobs ─────────────────────────────────────────────────────────────────
async function checkExpiredSubscriptions() {
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE subscriptions SET status='expired'
        WHERE status='active' AND current_period_end < NOW()
        RETURNING station_id, organization_id`
    );
    if (result.rows.length) {
      console.log(`[CRON] Expired ${result.rows.length} subscription(s)`);
      for (const row of result.rows) {
        if (row.organization_id) {
          await client.query(
            `UPDATE organizations SET subscription_status='expired'
              WHERE id=$1 AND NOT EXISTS (
                SELECT 1 FROM subscriptions WHERE organization_id=$1 AND status='active'
              )`,
            [row.organization_id]
          );
        }
      }
    }
  } catch (err) { console.error('[CRON] checkExpiredSubscriptions:', err.message); }
}

async function sendRenewalReminder(orgId, daysLeft, userEmail, planName) {
  if (!resend) return;
  try {
    await resend.emails.send({
      from: 'FuelSense <noreply@fuelsense.com>', to: userEmail,
      subject: `Your ${planName} plan renews in ${daysLeft} days`,
      html: `<p>Your <strong>${planName}</strong> plan renews in <strong>${daysLeft} days</strong>. <a href="${process.env.FRONTEND_URL}/?tab=pricing">Manage subscription</a></p>`
    });
  } catch (err) { console.error('[EMAIL] Renewal reminder failed:', err.message); }
}

async function checkUpcomingRenewals() {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT s.organization_id, s.current_period_end, p.name AS plan_name,
              o.owner_email
         FROM subscriptions s
         JOIN subscription_plans p ON p.id=s.plan_id
         JOIN organizations o ON o.id=s.organization_id
        WHERE s.status='active'
          AND s.current_period_end BETWEEN NOW() AND NOW() + INTERVAL '7 days'`
    );
    for (const row of result.rows) {
      const daysLeft = Math.ceil((new Date(row.current_period_end) - new Date()) / 86400000);
      await sendRenewalReminder(row.organization_id, daysLeft, row.owner_email, row.plan_name);
    }
  } catch (err) { console.error('[CRON] checkUpcomingRenewals:', err.message); }
}

setInterval(checkExpiredSubscriptions, 60 * 60 * 1000);
setInterval(checkUpcomingRenewals, 6 * 60 * 60 * 1000);
setTimeout(async () => { await checkExpiredSubscriptions(); await checkUpcomingRenewals(); }, 5000);

// ── GET /api/admin/alert-config/:stationId ───────────────────────────────────
app.get('/api/admin/alert-config/:stationId', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(`SELECT * FROM alert_config WHERE station_id = $1`, [req.params.stationId]);
    if (!result.rows.length) {
      return res.json({
        station_id: req.params.stationId,
        low_stock_threshold_pct: 20,
        high_water_mm: 50,
        reading_gap_minutes: 5,
        stabilisation_timeout_hours: 14,
        delivery_variance_tolerance_pct: 0.25,
        notify_email: '',
        notify_phone: '',
        notify_on_low_stock: true,
        notify_on_high_water: true,
        notify_on_reading_gap: true,
        notify_on_delivery_flagged: true,
      });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[API] GET alert-config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/alert-config ─────────────────────────────────────────────
app.post('/api/admin/alert-config', async (req, res) => {
  const {
    station_id,
    low_stock_threshold_pct,
    high_water_mm,
    reading_gap_minutes,
    stabilisation_timeout_hours,
    delivery_variance_tolerance_pct,
    notify_email,
    notify_phone,
    notify_on_low_stock,
    notify_on_high_water,
    notify_on_reading_gap,
    notify_on_delivery_flagged,
  } = req.body;

  if (!station_id) return res.status(400).json({ error: 'station_id is required' });

  try {
    const client = await getDb();
    const result = await client.query(
      `INSERT INTO alert_config (
        station_id, low_stock_threshold_pct, high_water_mm,
        reading_gap_minutes, stabilisation_timeout_hours,
        delivery_variance_tolerance_pct, notify_email, notify_phone,
        notify_on_low_stock, notify_on_high_water,
        notify_on_reading_gap, notify_on_delivery_flagged, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
      ON CONFLICT (station_id) DO UPDATE SET
        low_stock_threshold_pct = EXCLUDED.low_stock_threshold_pct,
        high_water_mm = EXCLUDED.high_water_mm,
        reading_gap_minutes = EXCLUDED.reading_gap_minutes,
        stabilisation_timeout_hours = EXCLUDED.stabilisation_timeout_hours,
        delivery_variance_tolerance_pct = EXCLUDED.delivery_variance_tolerance_pct,
        notify_email = EXCLUDED.notify_email,
        notify_phone = EXCLUDED.notify_phone,
        notify_on_low_stock = EXCLUDED.notify_on_low_stock,
        notify_on_high_water = EXCLUDED.notify_on_high_water,
        notify_on_reading_gap = EXCLUDED.notify_on_reading_gap,
        notify_on_delivery_flagged = EXCLUDED.notify_on_delivery_flagged,
        updated_at = NOW()
      RETURNING *`,
      [
        station_id,
        low_stock_threshold_pct ?? 20,
        high_water_mm ?? 50,
        reading_gap_minutes ?? 5,
        stabilisation_timeout_hours ?? 14,
        delivery_variance_tolerance_pct ?? 0.25,
        notify_email || null,
        notify_phone || null,
        notify_on_low_stock ?? true,
        notify_on_high_water ?? true,
        notify_on_reading_gap ?? true,
        notify_on_delivery_flagged ?? true,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[API] POST alert-config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/reconciliation-config/:stationId ──────────────────────────
app.get('/api/admin/reconciliation-config/:stationId', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(`SELECT * FROM reconciliation_config WHERE station_id = $1`, [req.params.stationId]);
    if (!result.rows.length) {
      return res.json({
        station_id: req.params.stationId,
        default_tolerance_pct: 0.25,
        stabilisation_std_dev_threshold: 0.3,
        delivery_detection_threshold_mm: 50,
        atg_polling_interval_seconds: 60,
        stabilisation_timeout_hours: 14,
      });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[API] GET reconciliation-config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/reconciliation-config ────────────────────────────────────
app.post('/api/admin/reconciliation-config', async (req, res) => {
  const { station_id, default_tolerance_pct, stabilisation_std_dev_threshold, delivery_detection_threshold_mm, atg_polling_interval_seconds, stabilisation_timeout_hours } = req.body;
  if (!station_id) return res.status(400).json({ error: 'station_id is required' });
  try {
    const client = await getDb();
    const result = await client.query(
      `INSERT INTO reconciliation_config (station_id, default_tolerance_pct, stabilisation_std_dev_threshold, delivery_detection_threshold_mm, atg_polling_interval_seconds, stabilisation_timeout_hours, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (station_id) DO UPDATE SET
         default_tolerance_pct=EXCLUDED.default_tolerance_pct,
         stabilisation_std_dev_threshold=EXCLUDED.stabilisation_std_dev_threshold,
         delivery_detection_threshold_mm=EXCLUDED.delivery_detection_threshold_mm,
         atg_polling_interval_seconds=EXCLUDED.atg_polling_interval_seconds,
         stabilisation_timeout_hours=EXCLUDED.stabilisation_timeout_hours,
         updated_at=NOW()
       RETURNING *`,
      [station_id, default_tolerance_pct ?? 0.25, stabilisation_std_dev_threshold ?? 0.3, delivery_detection_threshold_mm ?? 50, atg_polling_interval_seconds ?? 60, stabilisation_timeout_hours ?? 14]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[API] POST reconciliation-config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── ATG simulator ─────────────────────────────────────────────────────────────
if (process.env.USE_ATG_SIMULATOR === 'true') {
  try {
    require('./atg-simulator');
    console.log('[API] ATG simulator started on port 10001 ✓');
  } catch (err) {
    console.error('[API] Failed to start ATG simulator:', err.message);
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
setTimeout(() => {
  try {
    require('./scheduler');
    console.log('[API] Scheduler started ✓');
  } catch (err) {
    console.error('[API] Failed to start scheduler:', err.message);
  }
}, 3000);

// ── ADMIN ROUTES (duplicate) ─────────────────────────────────────────────────
app.get('/api/admin/stations', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(`SELECT s.*, COUNT(t.id)::text AS tank_count FROM stations s LEFT JOIN tanks t ON t.station_id = s.id GROUP BY s.id ORDER BY s.name`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/stations', async (req, res) => {
  const { name, location, timezone } = req.body;
  if (!name) return res.status(400).json({ error: 'Station name is required' });
  try {
    const client = await getDb();
    const result = await client.query(`INSERT INTO stations (id, name, location, timezone) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING *`, [name, location || null, timezone || 'Africa/Nairobi']);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/stations/:id', async (req, res) => {
  const { name, location, timezone } = req.body;
  try {
    const client = await getDb();
    const result = await client.query(`UPDATE stations SET name=$1, location=$2, timezone=$3 WHERE id=$4 RETURNING *`, [name, location || null, timezone || 'Africa/Nairobi', req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Station not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/stations/:id', async (req, res) => {
  try {
    const client = await getDb();
    await client.query(`DELETE FROM stations WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/tanks', async (req, res) => {
  try {
    const client = await getDb();
    const stationId = req.query.station_id;
    let query = `SELECT t.*, s.name AS station_name FROM tanks t JOIN stations s ON s.id = t.station_id`;
    const params = [];
    if (stationId) { params.push(stationId); query += ` WHERE t.station_id = $1`; }
    query += ` ORDER BY s.name, t.tank_number`;
    const result = await client.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/tanks', async (req, res) => {
  const { station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c, low_stock_threshold_pct, deadwood_litres, atg_probe_id } = req.body;
  if (!station_id || !tank_number || !fuel_type || !capacity_litres) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const client = await getDb();
    const result = await client.query(
      `INSERT INTO tanks (id, station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c, low_stock_threshold_pct, deadwood_litres, atg_probe_id) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c || 0.835, low_stock_threshold_pct || 20, deadwood_litres || 0, atg_probe_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/tanks/:id', async (req, res) => {
  const { station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c, low_stock_threshold_pct, deadwood_litres, atg_probe_id } = req.body;
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE tanks SET station_id=$1, tank_number=$2, fuel_type=$3, capacity_litres=$4, fuel_density_at_15c=$5, low_stock_threshold_pct=$6, deadwood_litres=$7, atg_probe_id=$8 WHERE id=$9 RETURNING *`,
      [station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c, low_stock_threshold_pct, deadwood_litres || 0, atg_probe_id || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Tank not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/tanks/:id', async (req, res) => {
  try {
    const client = await getDb();
    await client.query(`DELETE FROM tanks WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(`SELECT u.*, s.name AS station_name FROM user_profiles u LEFT JOIN stations s ON s.id = u.station_id ORDER BY u.email`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/users', async (req, res) => {
  const { supabase_uid, email, full_name, role, station_id } = req.body;
  if (!supabase_uid || !email) return res.status(400).json({ error: 'supabase_uid and email are required' });
  try {
    const client = await getDb();
    const result = await client.query(`INSERT INTO user_profiles (supabase_uid, email, full_name, role, station_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [supabase_uid, email, full_name || null, role || 'attendant', station_id || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/users/:id', async (req, res) => {
  const { email, full_name, role, station_id } = req.body;
  try {
    const client = await getDb();
    const result = await client.query(`UPDATE user_profiles SET email=$1, full_name=$2, role=$3, station_id=$4 WHERE id=$5 RETURNING *`, [email, full_name || null, role, station_id || null, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const client = await getDb();
    await client.query(`DELETE FROM user_profiles WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/suppliers', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(`SELECT * FROM suppliers ORDER BY name`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/suppliers', async (req, res) => {
  const { name, contact_name, phone, email, address, tolerance_pct } = req.body;
  if (!name) return res.status(400).json({ error: 'Supplier name is required' });
  try {
    const client = await getDb();
    const result = await client.query(`INSERT INTO suppliers (id, name, contact_name, phone, email, address, is_active, tolerance_pct) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,true,$6) RETURNING *`, [name, contact_name || null, phone || null, email || null, address || null, tolerance_pct || 0.25]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/suppliers/:id', async (req, res) => {
  const { name, contact_name, phone, email, address, is_active, tolerance_pct } = req.body;
  try {
    const client = await getDb();
    const result = await client.query(`UPDATE suppliers SET name=$1, contact_name=$2, phone=$3, email=$4, address=$5, is_active=$6, tolerance_pct=$7 WHERE id=$8 RETURNING *`, [name, contact_name || null, phone || null, email || null, address || null, is_active !== undefined ? is_active : true, tolerance_pct || 0.25, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Supplier not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/suppliers/:id', async (req, res) => {
  try {
    const client = await getDb();
    await client.query(`DELETE FROM suppliers WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/alert-config/:stationId', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(`SELECT * FROM alert_config WHERE station_id = $1`, [req.params.stationId]);
    if (!result.rows.length) {
      return res.json({ station_id: req.params.stationId, low_stock_threshold_pct: 20, high_water_mm: 50, reading_gap_minutes: 5, stabilisation_timeout_hours: 14, delivery_variance_tolerance_pct: 0.25, notify_email: '', notify_phone: '', notify_on_low_stock: true, notify_on_high_water: true, notify_on_reading_gap: true, notify_on_delivery_flagged: true });
    }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/alert-config', async (req, res) => {
  const { station_id, low_stock_threshold_pct, high_water_mm, reading_gap_minutes, stabilisation_timeout_hours, delivery_variance_tolerance_pct, notify_email, notify_phone, notify_on_low_stock, notify_on_high_water, notify_on_reading_gap, notify_on_delivery_flagged } = req.body;
  if (!station_id) return res.status(400).json({ error: 'station_id is required' });
  try {
    const client = await getDb();
    const result = await client.query(
      `INSERT INTO alert_config (station_id, low_stock_threshold_pct, high_water_mm, reading_gap_minutes, stabilisation_timeout_hours, delivery_variance_tolerance_pct, notify_email, notify_phone, notify_on_low_stock, notify_on_high_water, notify_on_reading_gap, notify_on_delivery_flagged, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (station_id) DO UPDATE SET low_stock_threshold_pct=EXCLUDED.low_stock_threshold_pct, high_water_mm=EXCLUDED.high_water_mm, reading_gap_minutes=EXCLUDED.reading_gap_minutes, stabilisation_timeout_hours=EXCLUDED.stabilisation_timeout_hours, delivery_variance_tolerance_pct=EXCLUDED.delivery_variance_tolerance_pct, notify_email=EXCLUDED.notify_email, notify_phone=EXCLUDED.notify_phone, notify_on_low_stock=EXCLUDED.notify_on_low_stock, notify_on_high_water=EXCLUDED.notify_on_high_water, notify_on_reading_gap=EXCLUDED.notify_on_reading_gap, notify_on_delivery_flagged=EXCLUDED.notify_on_delivery_flagged, updated_at=NOW()
       RETURNING *`,
      [station_id, low_stock_threshold_pct ?? 20, high_water_mm ?? 50, reading_gap_minutes ?? 5, stabilisation_timeout_hours ?? 14, delivery_variance_tolerance_pct ?? 0.25, notify_email || null, notify_phone || null, notify_on_low_stock ?? true, notify_on_high_water ?? true, notify_on_reading_gap ?? true, notify_on_delivery_flagged ?? true]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/reconciliation-config/:stationId', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(`SELECT * FROM reconciliation_config WHERE station_id = $1`, [req.params.stationId]);
    if (!result.rows.length) {
      return res.json({ station_id: req.params.stationId, default_tolerance_pct: 0.25, stabilisation_std_dev_threshold: 0.3, delivery_detection_threshold_mm: 50, atg_polling_interval_seconds: 60, stabilisation_timeout_hours: 14 });
    }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/reconciliation-config', async (req, res) => {
  const { station_id, default_tolerance_pct, stabilisation_std_dev_threshold, delivery_detection_threshold_mm, atg_polling_interval_seconds, stabilisation_timeout_hours } = req.body;
  if (!station_id) return res.status(400).json({ error: 'station_id is required' });
  try {
    const client = await getDb();
    const result = await client.query(
      `INSERT INTO reconciliation_config (station_id, default_tolerance_pct, stabilisation_std_dev_threshold, delivery_detection_threshold_mm, atg_polling_interval_seconds, stabilisation_timeout_hours, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (station_id) DO UPDATE SET default_tolerance_pct=EXCLUDED.default_tolerance_pct, stabilisation_std_dev_threshold=EXCLUDED.stabilisation_std_dev_threshold, delivery_detection_threshold_mm=EXCLUDED.delivery_detection_threshold_mm, atg_polling_interval_seconds=EXCLUDED.atg_polling_interval_seconds, stabilisation_timeout_hours=EXCLUDED.stabilisation_timeout_hours, updated_at=NOW()
       RETURNING *`,
      [station_id, default_tolerance_pct ?? 0.25, stabilisation_std_dev_threshold ?? 0.3, delivery_detection_threshold_mm ?? 50, atg_polling_interval_seconds ?? 60, stabilisation_timeout_hours ?? 14]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/atg-config/:stationId', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(`SELECT * FROM atg_gateway_config WHERE station_id = $1`, [req.params.stationId]);
    if (!result.rows.length) {
      return res.json({ station_id: req.params.stationId, gateway_ip: '', gateway_port: 10001, connection_timeout_ms: 5000, console_type: 'veeder_root_tls', is_active: true, last_connected_at: null, last_error: null });
    }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/atg-config', async (req, res) => {
  const { station_id, gateway_ip, gateway_port, connection_timeout_ms, console_type, is_active } = req.body;
  if (!station_id) return res.status(400).json({ error: 'station_id is required' });
  try {
    const client = await getDb();
    const result = await client.query(
      `INSERT INTO atg_gateway_config (station_id, gateway_ip, gateway_port, connection_timeout_ms, console_type, is_active, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (station_id) DO UPDATE SET gateway_ip=EXCLUDED.gateway_ip, gateway_port=EXCLUDED.gateway_port, connection_timeout_ms=EXCLUDED.connection_timeout_ms, console_type=EXCLUDED.console_type, is_active=EXCLUDED.is_active, updated_at=NOW()
       RETURNING *`,
      [station_id, gateway_ip || null, gateway_port || 10001, connection_timeout_ms || 5000, console_type || 'veeder_root_tls', is_active !== undefined ? is_active : true]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/atg-config/:stationId/test', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(`SELECT * FROM atg_gateway_config WHERE station_id = $1`, [req.params.stationId]);
    if (!result.rows.length) return res.status(404).json({ error: 'No gateway config found for this station' });
    const config = result.rows[0];
    if (!config.gateway_ip) return res.status(400).json({ error: 'No gateway IP configured' });
    const net = require('net');
    const socket = new net.Socket();
    let connected = false;
    const timeout = setTimeout(() => {
      socket.destroy();
      client.query(`UPDATE atg_gateway_config SET last_error=$1, updated_at=NOW() WHERE station_id=$2`, [`Connection timeout after ${config.connection_timeout_ms}ms`, req.params.stationId]);
      res.json({ success: false, message: `Connection timeout after ${config.connection_timeout_ms}ms`, ip: config.gateway_ip, port: config.gateway_port });
    }, config.connection_timeout_ms || 5000);
    socket.on('connect', () => {
      connected = true;
      clearTimeout(timeout);
      socket.destroy();
      client.query(`UPDATE atg_gateway_config SET last_connected_at=NOW(), last_error=NULL, updated_at=NOW() WHERE station_id=$1`, [req.params.stationId]);
      res.json({ success: true, message: `Successfully connected to ${config.gateway_ip}:${config.gateway_port}`, ip: config.gateway_ip, port: config.gateway_port });
    });
    socket.on('error', (err) => {
      if (connected) return;
      clearTimeout(timeout);
      socket.destroy();
      client.query(`UPDATE atg_gateway_config SET last_error=$1, updated_at=NOW() WHERE station_id=$2`, [err.message, req.params.stationId]);
      res.json({ success: false, message: err.message, ip: config.gateway_ip, port: config.gateway_port });
    });
    socket.connect(config.gateway_port || 10001, config.gateway_ip);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Strapping upload ──────────────────────────────────────────────────────────
const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');
const path = require('path');
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

app.post('/api/tanks/:tankId/strapping-upload', upload.single('file'), async (req, res) => {
  const { tankId } = req.params;
  const rows = [];
  try {
    const client = await getDb();
    const tank = await client.query('SELECT id FROM tanks WHERE id = $1', [tankId]);
    if (!tank.rows.length) return res.status(404).json({ error: 'Tank not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csvParser())
        .on('data', (row) => {
          const depth = parseInt(row.depth_mm || row.Depth_mm || row.depth);
          const volume = parseFloat(row.volume_litres || row.Volume_litres || row.litres);
          if (!isNaN(depth) && !isNaN(volume)) rows.push({ depth_mm: depth, volume_litres: volume });
        })
        .on('end', resolve)
        .on('error', reject);
    });
    if (rows.length === 0) return res.status(400).json({ error: 'No valid rows found. CSV must have columns: depth_mm, volume_litres' });
    await client.query('DELETE FROM strapping_table_entries WHERE tank_id = $1', [tankId]);
    await client.query('BEGIN');
    try {
      for (const row of rows) {
        await client.query(`INSERT INTO strapping_table_entries (id, tank_id, depth_mm, volume_litres) VALUES (gen_random_uuid(), $1, $2, $3)`, [tankId, row.depth_mm, row.volume_litres]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.json({ ok: true, tank_id: tankId, rows_inserted: rows.length, message: `Successfully uploaded ${rows.length} calibration rows` });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// ── ATG simulator (duplicate) ────────────────────────────────────────────────
if (process.env.USE_ATG_SIMULATOR === 'true') {
  try {
    require('./atg-simulator');
    console.log('[API] ATG simulator started on port 10001 ✓');
  } catch (err) {
    console.error('[API] Failed to start ATG simulator:', err.message);
  }
}

// ── Scheduler (duplicate) ────────────────────────────────────────────────────
setTimeout(() => {
  try {
    require('./scheduler');
    console.log('[API] Scheduler started ✓');
  } catch (err) {
    console.error('[API] Failed to start scheduler:', err.message);
  }
}, 3000);

// ── PAYMENTS ADMIN ROUTES ─────────────────────────────────────────────────

// GET all payments with org and station details
app.get('/api/admin/payments', async (req, res) => {
  try {
    const client = await getDb();
    const orgId = req.query.organization_id;
    const stationId = req.query.station_id;
    const status = req.query.status;

    let query = `
      SELECT p.*, 
             s.name AS station_name,
             o.name AS organization_name
      FROM payments p
      LEFT JOIN stations s ON s.id = p.station_id
      LEFT JOIN organizations o ON o.id = p.organization_id
      WHERE 1=1
    `;
    const params = [];

    if (orgId) { params.push(orgId); query += ` AND p.organization_id = $${params.length}`; }
    if (stationId) { params.push(stationId); query += ` AND p.station_id = $${params.length}`; }
    if (status) { params.push(status); query += ` AND p.status = $${params.length}`; }

    query += ` ORDER BY p.created_at DESC LIMIT 100`;
    const result = await client.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[API] GET admin/payments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET all subscriptions with org, station and plan details
app.get('/api/admin/subscriptions', async (req, res) => {
  try {
    const client = await getDb();
    const orgId = req.query.organization_id;
    const status = req.query.status;

    let query = `
      SELECT sub.*,
             s.name AS station_name,
             o.name AS organization_name,
             p.name AS plan_name,
             p.price_monthly,
             p.price_annual
      FROM subscriptions sub
      LEFT JOIN stations s ON s.id = sub.station_id
      LEFT JOIN organizations o ON o.id = sub.organization_id
      LEFT JOIN subscription_plans p ON p.id = sub.plan_id
      WHERE 1=1
    `;
    const params = [];

    if (orgId) { params.push(orgId); query += ` AND sub.organization_id = $${params.length}`; }
    if (status) { params.push(status); query += ` AND sub.status = $${params.length}`; }

    query += ` ORDER BY sub.created_at DESC`;
    const result = await client.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[API] GET admin/subscriptions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST manually activate or extend a subscription
app.post('/api/admin/subscriptions/:id/activate', async (req, res) => {
  const { months, plan_id, notes } = req.body;
  try {
    const client = await getDb();

    // Get current subscription
    const subRes = await client.query(`SELECT * FROM subscriptions WHERE id = $1`, [req.params.id]);
    if (!subRes.rows.length) return res.status(404).json({ error: 'Subscription not found' });

    const sub = subRes.rows[0];
    const now = new Date();

    // Calculate new period end
    const currentEnd = sub.current_period_end ? new Date(sub.current_period_end) : now;
    const startFrom = currentEnd > now ? currentEnd : now;
    const newEnd = new Date(startFrom);
    newEnd.setMonth(newEnd.getMonth() + (months || 1));

    // Update subscription
    const result = await client.query(
      `UPDATE subscriptions SET 
         status = 'active',
         plan_id = COALESCE($1, plan_id),
         current_period_start = $2,
         current_period_end = $3
       WHERE id = $4
       RETURNING *`,
      [plan_id || null, startFrom, newEnd, req.params.id]
    );

    // Log payment record for manual activation
    await client.query(
      `INSERT INTO payments (id, subscription_id, station_id, organization_id, amount_kes, status, billing_cycle, plan_name, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 0, 'manual', 'monthly', $4, NOW())`,
      [req.params.id, sub.station_id, sub.organization_id, notes || 'Manual activation by admin']
    );

    res.json({ ok: true, subscription: result.rows[0], new_period_end: newEnd });
  } catch (err) {
    console.error('[API] activate subscription error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST manually expire/cancel a subscription
app.post('/api/admin/subscriptions/:id/cancel', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE subscriptions SET status = 'cancelled', current_period_end = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Subscription not found' });
    res.json({ ok: true, subscription: result.rows[0] });
  } catch (err) {
    console.error('[API] cancel subscription error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET payment summary stats
app.get('/api/admin/payments/summary', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') AS total_completed,
        COUNT(*) FILTER (WHERE status = 'pending') AS total_pending,
        COUNT(*) FILTER (WHERE status = 'failed') AS total_failed,
        COALESCE(SUM(amount_kes) FILTER (WHERE status = 'completed'), 0) AS total_revenue_kes,
        COALESCE(SUM(amount_kes) FILTER (WHERE status = 'completed' AND created_at >= date_trunc('month', NOW())), 0) AS revenue_this_month,
        COUNT(DISTINCT organization_id) FILTER (WHERE status = 'completed') AS paying_orgs
      FROM payments
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[API] payments summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET subscription plans
app.get('/api/admin/plans', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(`SELECT * FROM subscription_plans ORDER BY price_monthly ASC`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update a subscription plan price
app.put('/api/admin/plans/:id', async (req, res) => {
  const { price_monthly, price_annual, name } = req.body;
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE subscription_plans SET price_monthly=$1, price_annual=$2, name=COALESCE($3, name) WHERE id=$4 RETURNING *`,
      [price_monthly, price_annual, name || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Plan not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = app;