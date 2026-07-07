import React, { useState, useEffect } from 'react';

const FUEL_TYPES = ['petrol', 'diesel', 'kerosene'];
const FUEL_COLORS = {
    petrol: { bg: '#eafaf1', text: '#1e8449' },
    diesel: { bg: '#fff3cd', text: '#856404' },
    kerosene: { bg: '#e8f4fd', text: '#1a5276' },
};

export default function Tanks({ api, session }) {
    const [tanks, setTanks] = useState([]);
    const [stations, setStations] = useState([]);
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [filterStation, setFilterStation] = useState('');
    const [filterOrg, setFilterOrg] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [savedTankId, setSavedTankId] = useState(null);
    const [csvFile, setCsvFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [uploadError, setUploadError] = useState('');

    const adminEmail = session?.user?.email || '';

    const [form, setForm] = useState({
        organization_id: '',
        station_id: '',
        tank_number: '',
        fuel_type: 'petrol',
        capacity_litres: '',
        fuel_density_at_15c: '0.835',
        low_stock_threshold_pct: '20',
        deadwood_litres: '0',
        atg_probe_id: '',
    });

    const filteredStations = filterOrg
        ? stations.filter(s => s.organization_id === filterOrg)
        : stations;

    const filteredStationsForForm = form.organization_id
        ? stations.filter(s => s.organization_id === form.organization_id)
        : stations;

    const filteredTanks = tanks.filter(tank => {
        if (filterOrg && tank.organization_id !== filterOrg) return false;
        if (filterStation && tank.station_id !== filterStation) return false;
        return true;
    });

    async function loadData() {
        setLoading(true);
        try {
            const [tanksRes, stationsRes, orgsRes] = await Promise.all([
                fetch(`${api}/api/admin/tanks`),
                fetch(`${api}/api/admin/stations`),
                fetch(`${api}/api/admin/organizations?admin_email=${encodeURIComponent(adminEmail)}`),
            ]);
            const tanksData = await tanksRes.json();
            const stationsData = await stationsRes.json();
            const orgsData = await orgsRes.json();
            setTanks(Array.isArray(tanksData) ? tanksData : []);
            setStations(Array.isArray(stationsData) ? stationsData : []);
            setOrgs(Array.isArray(orgsData) ? orgsData : []);
        } catch (err) {
            console.error('Failed to load data:', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadData(); }, []);
    useEffect(() => { setFilterStation(''); }, [filterOrg]);

    function openAdd() {
        setEditing(null);
        setSavedTankId(null);
        setCsvFile(null);
        setUploadResult(null);
        setUploadError('');
        setForm({
            organization_id: filterOrg || '',
            station_id: filterStation || '',
            tank_number: '',
            fuel_type: 'petrol',
            capacity_litres: '',
            fuel_density_at_15c: '0.835',
            low_stock_threshold_pct: '20',
            deadwood_litres: '0',
            atg_probe_id: '',
        });
        setError('');
        setShowForm(true);
    }

    function openEdit(tank) {
        setEditing(tank);
        setSavedTankId(tank.id);
        setCsvFile(null);
        setUploadResult(null);
        setUploadError('');
        const station = stations.find(s => s.id === tank.station_id);
        setForm({
            organization_id: station?.organization_id || tank.organization_id || '',
            station_id: tank.station_id || '',
            tank_number: tank.tank_number,
            fuel_type: tank.fuel_type,
            capacity_litres: tank.capacity_litres,
            fuel_density_at_15c: tank.fuel_density_at_15c,
            low_stock_threshold_pct: tank.low_stock_threshold_pct,
            deadwood_litres: tank.deadwood_litres || '0',
            atg_probe_id: tank.atg_probe_id || '',
        });
        setError('');
        setShowForm(true);
    }

    async function handleSave() {
        if (!form.organization_id) { setError('Please select an organisation.'); return; }
        if (!form.station_id) { setError('Please select a station.'); return; }
        if (!form.tank_number) { setError('Tank number is required.'); return; }
        if (!form.capacity_litres) { setError('Capacity is required.'); return; }
        setSaving(true);
        setError('');
        try {
            const url = editing ? `${api}/api/admin/tanks/${editing.id}` : `${api}/api/admin/tanks`;
            const method = editing ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    capacity_litres: parseFloat(form.capacity_litres),
                    fuel_density_at_15c: parseFloat(form.fuel_density_at_15c),
                    low_stock_threshold_pct: parseFloat(form.low_stock_threshold_pct),
                    deadwood_litres: parseFloat(form.deadwood_litres) || 0,
                    atg_probe_id: form.atg_probe_id || null,
                }),
            });
            const data = await res.json();
            if (data.error) { setError(data.error); return; }
            setSavedTankId(data.id || editing?.id);
            loadData();
        } catch (err) {
            setError('Failed to save tank.');
        } finally {
            setSaving(false);
        }
    }

    async function handleCsvUpload() {
        if (!csvFile) { setUploadError('Please select a CSV file first.'); return; }
        if (!savedTankId) { setUploadError('Save the tank first before uploading.'); return; }
        setUploading(true);
        setUploadError('');
        setUploadResult(null);
        try {
            const formData = new FormData();
            formData.append('file', csvFile);
            const res = await fetch(`https://fuelsense-fraud-detection-1.onrender.com/api/tanks/${savedTankId}/strapping-upload`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (data.error) { setUploadError(data.error); return; }
            setUploadResult(data);
            setCsvFile(null);
            document.getElementById('csv-upload-input').value = '';
        } catch (err) {
            setUploadError('Upload failed. Make sure your API server is running.');
        } finally {
            setUploading(false);
        }
    }

    async function handleDelete(tank) {
        if (!window.confirm(`Delete Tank ${tank.tank_number} (${tank.fuel_type})? This cannot be undone.`)) return;
        try {
            await fetch(`${api}/api/admin/tanks/${tank.id}`, { method: 'DELETE' });
            loadData();
        } catch (err) {
            alert('Failed to delete tank.');
        }
    }

    const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#f8f8f8' };
    const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '500', color: '#666', marginBottom: '4px' };
    const getOrgName = (orgId) => orgs.find(o => o.id === orgId)?.name || '';

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '14px', color: '#666' }}>
                    {filteredTanks.length} of {tanks.length} tank{tanks.length !== 1 ? 's' : ''}
                </div>
                <button onClick={openAdd} style={{ padding: '9px 18px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                    + Add Tank
                </button>
            </div>

            {/* Filter bar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', padding: '14px 16px', background: '#f8f8f8', borderRadius: '10px', border: '1px solid #e0e0e0', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: '500', color: '#666' }}>Filter by:</span>
                <select value={filterOrg} onChange={e => setFilterOrg(e.target.value)} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', background: '#fff', outline: 'none', minWidth: '200px' }}>
                    <option value="">All Organisations</option>
                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <select value={filterStation} onChange={e => setFilterStation(e.target.value)} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', background: '#fff', outline: 'none', minWidth: '200px' }}>
                    <option value="">All Stations</option>
                    {filteredStations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {(filterOrg || filterStation) && (
                    <button onClick={() => { setFilterOrg(''); setFilterStation(''); }} style={{ padding: '7px 12px', background: '#fdecea', color: '#e74c3c', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                        ✕ Clear filters
                    </button>
                )}
            </div>

            {/* Form */}
            {showForm && (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e0e0e0' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '4px' }}>
                        {editing ? '✏️ Edit Tank' : '🛢 Add New Tank'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
                        Select an organisation and station first.
                    </div>

                    {error && (
                        <div style={{ background: '#fdecea', color: '#721c24', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                            {error}
                        </div>
                    )}

                    {/* Step 1 — Organisation */}
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '14px 16px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#0369a1', marginBottom: '8px' }}>STEP 1 — Select Organisation *</div>
                        <select value={form.organization_id} onChange={e => setForm({ ...form, organization_id: e.target.value, station_id: '' })} style={inputStyle}>
                            <option value="">— Select an organisation —</option>
                            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                    </div>

                    {/* Step 2 — Station */}
                    {form.organization_id && (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '14px 16px', marginBottom: '12px' }}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#15803d', marginBottom: '8px' }}>STEP 2 — Select Station *</div>
                            <select value={form.station_id} onChange={e => setForm({ ...form, station_id: e.target.value })} style={inputStyle}>
                                <option value="">— Select a station —</option>
                                {filteredStationsForForm.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    )}

                    {/* Step 3 — Tank details */}
                    {form.station_id && (
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#1a1a2e', marginBottom: '12px' }}>STEP 3 — Tank Details</div>

                            <div style={{ background: '#f8f8f8', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#666', marginBottom: '14px' }}>
                                Adding tank to: <strong style={{ color: '#1a1a2e' }}>{getOrgName(form.organization_id)}</strong> → <strong style={{ color: '#1a1a2e' }}>{stations.find(s => s.id === form.station_id)?.name}</strong>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                <div>
                                    <label style={labelStyle}>Tank Number *</label>
                                    <input type="number" value={form.tank_number} onChange={e => setForm({ ...form, tank_number: e.target.value })} placeholder="e.g. 1" style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Fuel Type *</label>
                                    <select value={form.fuel_type} onChange={e => setForm({ ...form, fuel_type: e.target.value })} style={inputStyle}>
                                        {FUEL_TYPES.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Capacity (Litres) *</label>
                                    <input type="number" value={form.capacity_litres} onChange={e => setForm({ ...form, capacity_litres: e.target.value })} placeholder="e.g. 30000" style={inputStyle} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                <div>
                                    <label style={labelStyle}>Fuel Density at 15°C</label>
                                    <input type="number" step="0.001" value={form.fuel_density_at_15c} onChange={e => setForm({ ...form, fuel_density_at_15c: e.target.value })} placeholder="e.g. 0.835" style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Low Stock Threshold (%)</label>
                                    <input type="number" value={form.low_stock_threshold_pct} onChange={e => setForm({ ...form, low_stock_threshold_pct: e.target.value })} placeholder="e.g. 20" style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>ATG Probe ID</label>
                                    <input type="text" value={form.atg_probe_id} onChange={e => setForm({ ...form, atg_probe_id: e.target.value })} placeholder="e.g. PROBE-001" style={inputStyle} />
                                    <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Links the physical ATG probe to this tank</div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Deadwood Litres</label>
                                    <input type="number" step="0.01" value={form.deadwood_litres} onChange={e => setForm({ ...form, deadwood_litres: e.target.value })} placeholder="e.g. 150" style={inputStyle} />
                                    <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Fixed volume in pipework — unique to each tank</div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={handleSave}
                            disabled={saving || !form.station_id}
                            style={{ padding: '9px 20px', background: saving || !form.station_id ? '#aaa' : '#27ae60', color: '#fff', border: 'none', borderRadius: '8px', cursor: saving || !form.station_id ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}
                        >
                            {saving ? 'Saving...' : editing ? 'Update Tank' : 'Add Tank'}
                        </button>
                        <button onClick={() => { setShowForm(false); setSavedTankId(null); }} style={{ padding: '9px 20px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                            Cancel
                        </button>
                    </div>

                    {/* ── CSV Upload Section ── appears after tank is saved ── */}
                    {savedTankId && (
                        <div style={{ marginTop: '24px', borderTop: '1px solid #e0e0e0', paddingTop: '20px' }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e', marginBottom: '6px' }}>
                                📋 Upload Calibration Table (CSV)
                            </div>
                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
                                CSV must have two columns: <code>depth_mm</code> and <code>volume_litres</code>
                            </div>
                            <div style={{ background: '#f8f8f8', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontFamily: 'monospace', fontSize: '11px', color: '#555' }}>
                                depth_mm,volume_litres<br />0,0<br />10,45<br />20,92<br />...
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <input
                                    id="csv-upload-input"
                                    type="file"
                                    accept=".csv"
                                    onChange={e => { setCsvFile(e.target.files[0]); setUploadResult(null); setUploadError(''); }}
                                    style={{ fontSize: '13px' }}
                                />
                                <button
                                    onClick={handleCsvUpload}
                                    disabled={uploading || !csvFile}
                                    style={{ padding: '9px 18px', background: uploading || !csvFile ? '#ccc' : '#1a5276', color: '#fff', border: 'none', borderRadius: '8px', cursor: uploading || !csvFile ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}
                                >
                                    {uploading ? 'Uploading...' : '⬆ Upload'}
                                </button>
                            </div>
                            {uploadError && (
                                <div style={{ background: '#fdecea', color: '#721c24', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginTop: '10px' }}>
                                    ❌ {uploadError}
                                </div>
                            )}
                            {uploadResult && (
                                <div style={{ background: '#eafaf1', color: '#1e8449', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginTop: '10px' }}>
                                    ✅ {uploadResult.message} ({uploadResult.rows_inserted} rows inserted)
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Tank list */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Loading tanks...</div>
            ) : filteredTanks.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🛢</div>
                    <div style={{ fontSize: '16px', fontWeight: '500', color: '#1a1a2e', marginBottom: '8px' }}>
                        {tanks.length === 0 ? 'No tanks yet' : 'No tanks match your filters'}
                    </div>
                    <div style={{ fontSize: '13px', color: '#888' }}>
                        {tanks.length === 0 ? 'Add your first tank to get started.' : 'Try clearing the filters above.'}
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {filteredTanks.map(tank => {
                        const fc = FUEL_COLORS[tank.fuel_type] || FUEL_COLORS.petrol;
                        return (
                            <div key={tank.id} style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a2e' }}>Tank {tank.tank_number}</span>
                                        <span style={{ background: fc.bg, color: fc.text, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                                            {tank.fuel_type.toUpperCase()}
                                        </span>
                                        {tank.organization_name && (
                                            <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                                                🏢 {tank.organization_name}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '13px', color: '#666' }}>
                                        🏪 {tank.station_name} &nbsp;·&nbsp;
                                        Capacity: <strong>{parseFloat(tank.capacity_litres).toLocaleString()}L</strong> &nbsp;·&nbsp;
                                        Density: <strong>{tank.fuel_density_at_15c}</strong> &nbsp;·&nbsp;
                                        Low stock: <strong>{tank.low_stock_threshold_pct}%</strong>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                                        {tank.atg_probe_id ? `Probe: ${tank.atg_probe_id}` : 'No probe ID'} &nbsp;·&nbsp;
                                        {tank.deadwood_litres ? `Deadwood: ${tank.deadwood_litres}L` : 'No deadwood set'}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#bbb', marginTop: '4px' }}>ID: {tank.id}</div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => openEdit(tank)} style={{ padding: '7px 14px', background: '#e8f4fd', color: '#1a5276', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                                        ✏️ Edit
                                    </button>
                                    <button onClick={() => handleDelete(tank)} style={{ padding: '7px 14px', background: '#fdecea', color: '#e74c3c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                                        🗑 Delete
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}