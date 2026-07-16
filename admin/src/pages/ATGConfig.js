import React, { useState, useEffect } from 'react';

const CONSOLE_TYPES = [
    { value: 'veeder_root_tls', label: 'Veeder-Root TLS (default)' },
    { value: 'franklin_fueling', label: 'Franklin Fueling EVO' },
    { value: 'modbus_rtu', label: 'Modbus RTU' },
    { value: 'generic_tls', label: 'Generic TLS Protocol' },
];

export default function ATGConfig({ api, session }) {
    const [stations, setStations] = useState([]);
    const [orgs, setOrgs] = useState([]);
    const [tanks, setTanks] = useState([]);
    const [selectedOrg, setSelectedOrg] = useState('');
    const [selectedStation, setSelectedStation] = useState('');
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [saved, setSaved] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [error, setError] = useState('');

    const adminEmail = session?.user?.email || '';

    // Stations filtered by selected org
    const filteredStations = selectedOrg
        ? stations.filter(s => s.organization_id === selectedOrg)
        : stations;

    async function loadInitialData() {
        try {
            const [stationsRes, orgsRes] = await Promise.all([
                fetch(`${api}/api/admin/stations`),
                fetch(`${api}/api/admin/organizations?admin_email=${encodeURIComponent(adminEmail)}`),
            ]);
            const stationsData = await stationsRes.json();
            const orgsData = await orgsRes.json();
            setStations(Array.isArray(stationsData) ? stationsData : []);
            setOrgs(Array.isArray(orgsData) ? orgsData : []);
        } catch (err) {
            console.error('Failed to load initial data:', err);
        }
    }

    async function loadConfig(stationId) {
        setLoading(true);
        setError('');
        setTestResult(null);
        try {
            const [configRes, tanksRes] = await Promise.all([
                fetch(`${api}/api/admin/atg-config/${stationId}`),
                fetch(`${api}/api/admin/tanks?station_id=${stationId}`),
            ]);
            const configData = await configRes.json();
            const tanksData = await tanksRes.json();
            if (configData.error) { setError(configData.error); return; }
            setConfig(configData);
            setTanks(Array.isArray(tanksData) ? tanksData : []);
        } catch (err) {
            setError('Failed to load ATG config.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadInitialData(); }, []);

    // Reset station when org changes
    useEffect(() => {
        setSelectedStation('');
        setConfig(null);
        setTanks([]);
    }, [selectedOrg]);

    useEffect(() => {
        if (selectedStation) loadConfig(selectedStation);
        else { setConfig(null); setTanks([]); }
    }, [selectedStation]);

    async function handleSave() {
        if (!selectedStation) { setError('Please select a station.'); return; }
        setSaving(true);
        setError('');
        setSaved(false);
        try {
            const res = await fetch(`${api}/api/admin/atg-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...config, station_id: selectedStation }),
            });
            const data = await res.json();
            if (data.error) { setError(data.error); return; }
            setConfig(data);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            setError('Failed to save config.');
        } finally {
            setSaving(false);
        }
    }

    async function handleTest() {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch(`${api}/api/admin/atg-config/${selectedStation}/test`, { method: 'POST' });
            const data = await res.json();
            setTestResult(data);
        } catch (err) {
            setTestResult({ success: false, message: 'Test request failed — check API server.' });
        } finally {
            setTesting(false);
        }
    }

    const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#f8f8f8' };
    const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '500', color: '#666', marginBottom: '4px' };
    const sectionStyle = { background: '#fff', borderRadius: '12px', padding: '24px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e0e0e0' };

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
                    Configure the ATG hardware connection for each station. These settings tell FuelSense how to reach the physical tank gauge on site.
                </div>

                {/* ── Organisation + Station filter ── */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                        value={selectedOrg}
                        onChange={e => setSelectedOrg(e.target.value)}
                        style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', background: '#fff', outline: 'none', minWidth: '220px' }}
                    >
                        <option value="">All Organisations</option>
                        {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>

                    <select
                        value={selectedStation}
                        onChange={e => setSelectedStation(e.target.value)}
                        style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', background: '#fff', outline: 'none', minWidth: '220px' }}
                    >
                        <option value="">Select a station...</option>
                        {filteredStations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>

                    {(selectedOrg || selectedStation) && (
                        <button
                            onClick={() => { setSelectedOrg(''); setSelectedStation(''); }}
                            style={{ padding: '7px 12px', background: '#fdecea', color: '#e74c3c', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}
                        >
                            ✕ Clear
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div style={{ background: '#fdecea', color: '#721c24', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>
            )}

            {saved && (
                <div style={{ background: '#eafaf1', color: '#1e8449', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                    ✅ ATG gateway configuration saved successfully
                </div>
            )}

            {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Loading config...</div>}

            {config && !loading && (
                <>
                    {/* Gateway Connection */}
                    <div style={sectionStyle}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '6px' }}>🌐 Gateway Connection</div>
                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
                            The IP address and port where the ATG console is reachable on the station network.
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                            <div>
                                <label style={labelStyle}>Gateway IP Address</label>
                                <input type="text" value={config.gateway_ip || ''} onChange={e => setConfig({ ...config, gateway_ip: e.target.value })} placeholder="e.g. 196.216.10.45" style={inputStyle} />
                                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Local or public IP of the ATG console or cellular gateway</div>
                            </div>
                            <div>
                                <label style={labelStyle}>Port</label>
                                <input type="number" value={config.gateway_port || 10001} onChange={e => setConfig({ ...config, gateway_port: parseInt(e.target.value) })} placeholder="10001" style={inputStyle} />
                                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Default is 10001 for Veeder-Root TLS</div>
                            </div>
                            <div>
                                <label style={labelStyle}>Connection Timeout (ms)</label>
                                <input type="number" value={config.connection_timeout_ms || 5000} onChange={e => setConfig({ ...config, connection_timeout_ms: parseInt(e.target.value) })} placeholder="5000" style={inputStyle} />
                                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>How long to wait before declaring connection failed</div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                            <div>
                                <label style={labelStyle}>ATG Console Type</label>
                                <select value={config.console_type || 'veeder_root_tls'} onChange={e => setConfig({ ...config, console_type: e.target.value })} style={inputStyle}>
                                    {CONSOLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Determines which protocol FuelSense uses to communicate with the hardware</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '22px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px 14px', background: config.is_active ? '#eafaf1' : '#f8f8f8', borderRadius: '8px', border: `1px solid ${config.is_active ? '#a9dfbf' : '#e0e0e0'}`, width: '100%' }}>
                                    <input type="checkbox" checked={config.is_active || false} onChange={e => setConfig({ ...config, is_active: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: '500', color: '#1a1a2e' }}>Gateway active</div>
                                        <div style={{ fontSize: '11px', color: '#888' }}>Uncheck to pause polling this station without deleting config</div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {(config.last_connected_at || config.last_error) && (
                            <div style={{ background: '#f8f8f8', borderRadius: '8px', padding: '12px 14px', fontSize: '12px' }}>
                                {config.last_connected_at && <div style={{ color: '#1e8449', marginBottom: '4px' }}>✅ Last connected: {new Date(config.last_connected_at).toLocaleString()}</div>}
                                {config.last_error && <div style={{ color: '#e74c3c' }}>❌ Last error: {config.last_error}</div>}
                            </div>
                        )}
                    </div>

                    {/* Probe to Tank Mapping */}
                    <div style={sectionStyle}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '6px' }}>🔌 Probe → Tank Mapping</div>
                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
                            These are the tanks configured for this station. The ATG Probe ID on each tank tells FuelSense which probe reading belongs to which tank. Edit probe IDs from the Tanks page.
                        </div>
                        {tanks.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '24px', color: '#888', fontSize: '13px' }}>
                                No tanks configured for this station yet. Add tanks from the Tanks page first.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {tanks.map(tank => (
                                    <div key={tank.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8f8f8', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontSize: '20px' }}>🛢</span>
                                            <div>
                                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e' }}>Tank {tank.tank_number} — {tank.fuel_type.toUpperCase()}</div>
                                                <div style={{ fontSize: '11px', color: '#888' }}>Capacity: {parseFloat(tank.capacity_litres).toLocaleString()}L</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '12px', color: '#888' }}>ATG Probe ID:</span>
                                            {tank.atg_probe_id ? (
                                                <span style={{ background: '#eafaf1', color: '#1e8449', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', fontFamily: 'monospace' }}>{tank.atg_probe_id}</span>
                                            ) : (
                                                <span style={{ background: '#fdecea', color: '#e74c3c', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>⚠ Not set — go to Tanks page</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Test Connection */}
                    <div style={sectionStyle}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '6px' }}>🔧 Test Connection</div>
                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
                            Save your config first, then test the TCP connection to verify FuelSense can reach the ATG gateway.
                        </div>
                        <button onClick={handleTest} disabled={testing || !config.gateway_ip} style={{ padding: '9px 20px', background: testing || !config.gateway_ip ? '#ccc' : '#1a5276', color: '#fff', border: 'none', borderRadius: '8px', cursor: testing || !config.gateway_ip ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>
                            {testing ? 'Testing connection...' : '🔌 Test TCP Connection'}
                        </button>
                        {testResult && (
                            <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '8px', background: testResult.success ? '#eafaf1' : '#fdecea', color: testResult.success ? '#1e8449' : '#721c24', fontSize: '13px' }}>
                                {testResult.success ? '✅' : '❌'} {testResult.message}
                                {testResult.ip && <span style={{ marginLeft: '8px', fontSize: '12px', opacity: 0.8 }}>({testResult.ip}:{testResult.port})</span>}
                            </div>
                        )}
                    </div>

                    {/* Save button */}
                    <button onClick={handleSave} disabled={saving} style={{ padding: '11px 28px', background: saving ? '#888' : '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '600' }}>
                        {saving ? 'Saving...' : '💾 Save ATG Configuration'}
                    </button>
                </>
            )}

            {!selectedStation && !loading && (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📡</div>
                    <div style={{ fontSize: '16px', fontWeight: '500', color: '#1a1a2e', marginBottom: '8px' }}>No station selected</div>
                    <div style={{ fontSize: '13px', color: '#888' }}>Select an organisation and station above to configure its ATG hardware connection.</div>
                </div>
            )}
        </div>
    );
}