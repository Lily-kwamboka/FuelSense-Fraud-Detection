app.post('/api/admin/atg-config', async (req, res) => {
  const { station_id, gateway_ip, gateway_port, connection_timeout_ms, console_type, is_active } = req.body;
  if (!station_id) return res.status(400).json({ error: 'station_id is required' });
  try {
    const client = await getDb();
    const result = await client.query(
      `INSERT INTO atg_gateway_config (station_id, gateway_ip, gateway_port, connection_timeout_ms, console_type, is_active, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (station_id) DO UPDATE SET
         gateway_ip=EXCLUDED.gateway_ip,
         gateway_port=EXCLUDED.gateway_port,
         connection_timeout_ms=EXCLUDED.connection_timeout_ms,
         console_type=EXCLUDED.console_type,
         is_active=EXCLUDED.is_active,
         updated_at=NOW()
       RETURNING *`,
      [station_id, gateway_ip || null, gateway_port || 10001, connection_timeout_ms || 5000, console_type || 'veeder_root_tls', is_active !== undefined ? is_active : true]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[API] POST atg-config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


module.exports = app; 