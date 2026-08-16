'use strict';

// ---------------------------------------------------------------------------
// MafutaFlow Africa - Alerts Engine
// Phase 5
//
// Creates, retrieves, and manages alerts.
// Called by: scheduler.js, reconciliation.js, shift-manager.js
// ---------------------------------------------------------------------------

const THRESHOLDS = {
  variance_pct:      0.25,   // % delivery variance before alert
  high_water_mm:     50,     // mm water level
  low_stock_pct:     20,     // % tank capacity
  pump_vs_dip_pct:   0.5,    // % discrepancy between pump meter and dip
  reading_gap_ms:    5 * 60 * 1000, // 5 minutes
};

// ---------------------------------------------------------------------------
// Create a new alert
// ---------------------------------------------------------------------------
async function createAlert(db, {
  tank_id         = null,
  delivery_id     = null,
  alert_type,
  severity        = 'warning',
  message,
  value_actual    = null,
  value_expected  = null,
  value_threshold = null,
}) {
  // Avoid duplicate open alerts of the same type for the same tank
  if (tank_id) {
    const existing = await db.query(
      `SELECT id FROM alerts
        WHERE tank_id = $1
          AND alert_type = $2
          AND status = 'open'
        LIMIT 1`,
      [tank_id, alert_type]
    );
    if (existing.rows.length) {
      return existing.rows[0].id;
    }
  }

  const result = await db.query(
    `INSERT INTO alerts
       (tank_id, delivery_id, alert_type, severity, message,
        value_actual, value_expected, value_threshold)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      tank_id, delivery_id, alert_type, severity, message,
      value_actual, value_expected, value_threshold,
    ]
  );

  console.log('[ALERTS] ' + severity.toUpperCase() + ' | ' + alert_type + ' | ' + message);
  return result.rows[0].id;
}

// ---------------------------------------------------------------------------
// Auto-resolve alerts when condition clears
// ---------------------------------------------------------------------------
async function resolveAlert(db, tankId, alertType) {
  await db.query(
    `UPDATE alerts
        SET status = 'resolved', resolved_at = NOW()
      WHERE tank_id = $1
        AND alert_type = $2
        AND status = 'open'`,
    [tankId, alertType]
  );
}

// ---------------------------------------------------------------------------
// Check variance alert after reconciliation
// ---------------------------------------------------------------------------
async function checkVarianceAlert(db, deliveryId) {
  const res = await db.query(
    `SELECT d.variance_pct, d.variance_litres, d.tank_id,
            d.variance_classification, t.tank_number, t.fuel_type
       FROM deliveries d
       JOIN tanks t ON t.id = d.tank_id
      WHERE d.id = $1`,
    [deliveryId]
  );

  if (!res.rows.length) return;

  const d = res.rows[0];
  const variancePct = Math.abs(parseFloat(d.variance_pct));
  const varianceLitres = parseFloat(d.variance_litres);

  if (d.variance_classification === 'unexplained') {
    await createAlert(db, {
      tank_id:         d.tank_id,
      delivery_id:     deliveryId,
      alert_type:      'variance_exceeded',
      severity:        variancePct > 1.0 ? 'critical' : 'warning',
      message:         `Tank ${d.tank_number} (${d.fuel_type}) delivery variance ${variancePct.toFixed(3)}% (${varianceLitres.toFixed(1)}L) exceeds tolerance — unexplained`,
      value_actual:    variancePct,
      value_expected:  0,
      value_threshold: THRESHOLDS.variance_pct,
    });
  }
}

// ---------------------------------------------------------------------------
// Check high water alert
// ---------------------------------------------------------------------------
async function checkHighWaterAlert(db, tankId, tankNumber, waterMm) {
  if (waterMm > THRESHOLDS.high_water_mm) {
    await createAlert(db, {
      tank_id:         tankId,
      alert_type:      'high_water',
      severity:        'critical',
      message:         `Tank ${tankNumber} water level ${waterMm}mm exceeds limit of ${THRESHOLDS.high_water_mm}mm`,
      value_actual:    waterMm,
      value_threshold: THRESHOLDS.high_water_mm,
    });
  } else {
    await resolveAlert(db, tankId, 'high_water');
  }
}

// ---------------------------------------------------------------------------
// Check low stock alert
// ---------------------------------------------------------------------------
async function checkLowStockAlert(db, tankId, tankNumber, fuelType, fillPct, threshold) {
  const limit = threshold || THRESHOLDS.low_stock_pct;

  if (fillPct < limit) {
    await createAlert(db, {
      tank_id:         tankId,
      alert_type:      'low_stock',
      severity:        fillPct < 10 ? 'critical' : 'warning',
      message:         `Tank ${tankNumber} (${fuelType}) is at ${fillPct.toFixed(1)}% — below ${limit}% threshold`,
      value_actual:    fillPct,
      value_threshold: limit,
    });
  } else {
    await resolveAlert(db, tankId, 'low_stock');
  }
}

// ---------------------------------------------------------------------------
// Check pump vs dip discrepancy
// ---------------------------------------------------------------------------
async function checkPumpVsDip(db, shiftId, tankId, tankNumber, fuelType, pumpSales, dipSales) {
  if (!pumpSales || !dipSales || dipSales === 0) return;

  const discrepancyLitres = Math.abs(pumpSales - dipSales);
  const discrepancyPct    = (discrepancyLitres / dipSales) * 100;

  if (discrepancyPct > THRESHOLDS.pump_vs_dip_pct) {
    await createAlert(db, {
      tank_id:         tankId,
      alert_type:      'pump_vs_dip',
      severity:        discrepancyPct > 2.0 ? 'critical' : 'warning',
      message:         `Tank ${tankNumber} (${fuelType}) pump meter shows ${pumpSales.toFixed(1)}L sold but dip shows ${dipSales.toFixed(1)}L — ${discrepancyPct.toFixed(2)}% discrepancy`,
      value_actual:    discrepancyLitres,
      value_expected:  dipSales,
      value_threshold: THRESHOLDS.pump_vs_dip_pct,
    });
  }
}

// ---------------------------------------------------------------------------
// Get all alerts (for API)
// ---------------------------------------------------------------------------
async function getAlerts(db, { status = null, limit = 50 } = {}) {
  const conditions = [];
  const params     = [];

  if (status) {
    params.push(status);
    conditions.push(`a.status = $${params.length}`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  params.push(limit);
  const result = await db.query(
    `SELECT
       a.*,
       t.tank_number,
       t.fuel_type
     FROM alerts a
     LEFT JOIN tanks t ON t.id = a.tank_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows;
}

// ---------------------------------------------------------------------------
// Acknowledge an alert
// ---------------------------------------------------------------------------
async function acknowledgeAlert(db, alertId, acknowledgedBy) {
  await db.query(
    `UPDATE alerts
        SET status = 'acknowledged',
            acknowledged_by = $1,
            acknowledged_at = NOW()
      WHERE id = $2`,
    [acknowledgedBy, alertId]
  );
}

module.exports = {
  createAlert,
  resolveAlert,
  checkVarianceAlert,
  checkHighWaterAlert,
  checkLowStockAlert,
  checkPumpVsDip,
  getAlerts,
  acknowledgeAlert,
  THRESHOLDS,
};