'use strict';

const net = require('net');
const { parseTLSInventory } = require('./tls-parser');

const ATG_HOST = process.env.ATG_HOST || '127.0.0.1';
const ATG_PORT = parseInt(process.env.ATG_PORT || '10001', 10);
const ATG_TIMEOUT_MS = parseInt(process.env.ATG_TIMEOUT_MS || '5000', 10);

const CMD_INVENTORY = Buffer.from('\x01i10100FF', 'binary');
const ETX = 0x03;

// Real ATG connection function
function fetchInventoryReal() {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const chunks = [];
    let timer = null;
    let settled = false;

    function settle(fn, val) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      fn(val);
    }

    timer = setTimeout(() => {
      settle(reject, new Error(`ATG timeout after ${ATG_TIMEOUT_MS}ms`));
    }, ATG_TIMEOUT_MS);

    socket.on('error', err => {
      settle(reject, new Error(`ATG connection error: ${err.message}`));
    });

    socket.connect(ATG_PORT, ATG_HOST, () => {
      socket.write(CMD_INVENTORY);
    });

    socket.on('data', chunk => {
      chunks.push(chunk);
      const combined = Buffer.concat(chunks);
      if (combined.includes(ETX)) {
        const raw = combined.toString('binary');
        const result = parseTLSInventory(raw);
        settle(resolve, result);
      }
    });

    socket.on('end', () => {
      if (!settled) {
        const raw = Buffer.concat(chunks).toString('binary');
        const result = parseTLSInventory(raw);
        if (result.readings.length > 0) {
          settle(resolve, result);
        } else {
          settle(reject, new Error('Connection closed before complete response'));
        }
      }
    });
  });
}

// Mock data that will trigger low stock alert
let mockReadings = [
  {
    tankNumber: 1,
    product: 'PETROL',
    innage_mm: 1450,
    water_mm: 0,
    temperature_c: 25
  },
  {
    tankNumber: 2,
    product: 'DIESEL',
    innage_mm: 350,  // Low level - will trigger alert (<20% of 2000mm)
    water_mm: 0,
    temperature_c: 25
  }
];

let pollCount = 0;

// Main getInventory function - used by scheduler
// Returns array of readings with properties expected by api.js
async function getInventory() {
  let readings = [];

  // Try real ATG connection first
  try {
    const result = await fetchInventoryReal();
    if (result && result.readings && result.readings.length > 0) {
      readings = result.readings;
      console.log(`[ATG] Connected to simulator, received ${readings.length} readings`);
      // Convert to format expected by scheduler
      return readings.map(r => ({
        tankNumber: r.tankNumber,
        product: r.product,
        innageMm: r.innage_mm,
        waterMm: r.water_mm,
        tempC: r.temperature_c
      }));
    }
  } catch (err) {
    console.log(`[ATG] Real connection failed: ${err.message}`);
  }

  // Fallback to mock data
  pollCount++;

  // Gradually decrease diesel tank (every 10 polls)
  if (pollCount % 10 === 0 && mockReadings[1].innage_mm > 100) {
    mockReadings[1].innage_mm -= 50;
    console.log(`[MOCK] Diesel tank decreased to ${mockReadings[1].innage_mm}mm`);
  }

  // Convert to format expected by scheduler
  readings = mockReadings.map(r => ({
    tankNumber: r.tankNumber,
    product: r.product,
    innageMm: r.innage_mm,
    waterMm: r.water_mm,
    tempC: r.temperature_c
  }));

  const tank1Pct = (readings[0].innageMm / 2000 * 100).toFixed(1);
  const tank2Pct = (readings[1].innageMm / 2000 * 100).toFixed(1);
  console.log(`[MOCK] Tank 1 (PETROL): ${tank1Pct}% | Tank 2 (DIESEL): ${tank2Pct}%`);

  return readings;
}

// Alias for fetchInventory (returns full result object with parsedAt)
async function fetchInventory() {
  const readings = await getInventory();
  // Convert camelCase to snake_case for scheduler compatibility and add parsedAt
  const converted = readings.map(r => ({
    tankNumber: r.tankNumber,
    product: r.product,
    innage_mm: r.innageMm,
    water_mm: r.waterMm,
    temperature_c: r.tempC,
  }));
  return { readings: converted, parsedAt: new Date() };
}

function ping() {
  return new Promise(resolve => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 3000);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    socket.connect(ATG_PORT, ATG_HOST);
  });
}

async function _integrationTest() {
  console.log(`[CLIENT TEST] Connecting to ATG at ${ATG_HOST}:${ATG_PORT} ...`);

  const reachable = await ping();
  if (!reachable) {
    console.log('[CLIENT TEST] ATG not reachable, using mock data mode');
  } else {
    console.log('[CLIENT TEST] Ping OK ✅');
  }

  const readings = await getInventory();
  console.log(`[CLIENT TEST] Readings received: ${readings.length}`);

  for (const r of readings) {
    const pct = (r.innageMm / 2000 * 100).toFixed(1);
    console.log(`  Tank ${r.tankNumber} (${r.product})`);
    console.log(`    Innage:      ${r.innageMm}mm`);
    console.log(`    Water:       ${r.waterMm}mm`);
    console.log(`    Temperature: ${r.tempC}°C`);
    console.log(`    Fill %:      ${pct}%`);
  }
  console.log('[CLIENT TEST] PASS ✅');
}

module.exports = { fetchInventory, ping, getInventory };

if (require.main === module) {
  _integrationTest().catch(err => {
    console.error('[CLIENT TEST] ERROR:', err.message);
    process.exit(1);
  });
}