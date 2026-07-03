import React, { useState, useEffect } from 'react';

export default function Stations({ api, session }) {
    const [stations, setStations] = useState([]);
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', location: '', organization_id: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [orgFilter, setOrgFilter] = useState('');

    const adminEmail = session?.user?.email || '';

    async function loadOrgs() {
        try {
            const res = await fetch(`${api}/api/admin/organizations?admin_email=${encodeURIComponent(adminEmail)}`);
            const data = await res.json();
            setOrgs(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load organizations:', err);
        }
    }

    async function loadStations() {
        setLoading(true);
        try {
            const url = orgFilter
                ? `${api}/api/admin/stations?organization_id=${orgFilter}`
                : `${api}/api/admin/stations`;
            const res = await fetch(url);
            const data = await res.json();
            setStations(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load stations:', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadOrgs(); }, [adminEmail]);
    useEffect(() => { loadStations(); }, [orgFilter]);

    function openAdd() {
        setEditing(null);
        setForm({ name: '', location: '', organization_id: orgFilter || '' });
        setError('');
        setShowForm(true);
    }

    function openEdit(station) {
        setEditing(station);
        setForm({
            name: station.name,
            location: station.location || '',
            organization_id: station.organization_id || '',
        });
        setError('');
        setShowForm(true);
    }

    async function handleSave() {
        if (!form.organization_id) { setError('Please select an organisation first.'); return; }
        if (!form.name.trim()) { setError('Station name is required.'); return; }
        setSaving(true);
        setError('');
        try {
            const url = editing ? `${api}/api/admin/stations/${editing.id}` : `${api}/api/admin/stations`;
            const method = editing ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.error) { setError(data.error); return; }
            setShowForm(false);
            loadStations();
        } catch (err) {
            setError('Failed to save station.');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(station) {
        if (!window.confirm(`Delete station "${station.name}"? This cannot be undone.`)) return;
        try {
            await fetch(`${api}/api/admin/stations/${station.id}`, { method: 'DELETE' });
            loadStations();
        } catch (err) {
            alert('Failed to delete station.');
        }
    }

    const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#f8f8f8' };
    const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '500', color: '#666', marginBottom: '4px' };
    const getOrgName = (orgId) => orgs.find(o => o.id === orgId)?.name || 'Unknown org';

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontSize: '14px', color: '#666' }}>
                        {stations.length} station{stations.length !== 1 ? 's' : ''} total
                    </div>
                    <select
                        value={orgFilter}
                        onChange={e => setOrgFilter(e.target.value)}
                        style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', background: '#f8f8f8', cursor: 'pointer', outline: 'none' }}
                    >
                        <option value="">All organisations</option>
                        {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                </div>
                <button
                    onClick={openAdd}
                    style={{ padding: '9px 18px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                >
                    + Add Station
                </button>
            </div>

            {/* No orgs warning */}
            {orgs.length === 0 && !loading && (
                <div style={{ background: '#fff3cd', border: '1px solid #ffc107', color: '#856404', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                    No organisations found. Please <strong>create an organisation first</strong> before adding stations.
                </div>
            )}

            {/* Form */}
            {showForm && (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e0e0e0' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '4px' }}>
                        {editing ? 'Edit Station' : 'Add New Station'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
                        Select an organisation first, then fill in the station details.
                    </div>

                    {error && (
                        <div style={{ background: '#fdecea', color: '#721c24', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                            {error}
                        </div>
                    )}

                    {/* Step 1 — Organisation */}
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px' }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#0369a1', marginBottom: '8px' }}>
                            STEP 1 — Select Organisation *
                        </div>
                        {orgs.length === 0 ? (
                            <div style={{ fontSize: '13px', color: '#e74c3c' }}>
                                No organisations available. Please create one first from the Organisations page.
                            </div>
                        ) : (
                            <select
                                value={form.organization_id}
                                onChange={e => setForm({ ...form, organization_id: e.target.value })}
                                style={inputStyle}
                            >
                                <option value="">— Select an organisation —</option>
                                {orgs.map(o => (
                                    <option key={o.id} value={o.id}>
                                        {o.name} ({o.subscription_status || 'trial'})
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Step 2 — Station details */}
                    {form.organization_id && (
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#1a1a2e', marginBottom: '12px' }}>
                                STEP 2 — Station Details
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Station Name *</label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        placeholder="e.g. Mafuta Salama Westlands"
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Location</label>
                                    <input
                                        type="text"
                                        value={form.location}
                                        onChange={e => setForm({ ...form, location: e.target.value })}
                                        placeholder="e.g. Westlands, Nairobi"
                                        style={inputStyle}
                                    />
                                </div>
                            </div>
                            <div style={{ background: '#f8f8f8', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#666', marginBottom: '16px' }}>
                                Adding station to: <strong style={{ color: '#1a1a2e' }}>{getOrgName(form.organization_id)}</strong>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={handleSave}
                            disabled={saving || !form.organization_id}
                            style={{ padding: '9px 20px', background: saving || !form.organization_id ? '#aaa' : '#27ae60', color: '#fff', border: 'none', borderRadius: '8px', cursor: saving || !form.organization_id ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}
                        >
                            {saving ? 'Saving...' : editing ? 'Update Station' : 'Add Station'}
                        </button>
                        <button
                            onClick={() => setShowForm(false)}
                            style={{ padding: '9px 20px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Station list */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Loading stations...</div>
            ) : stations.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏪</div>
                    <div style={{ fontSize: '16px', fontWeight: '500', color: '#1a1a2e', marginBottom: '8px' }}>No stations yet</div>
                    <div style={{ fontSize: '13px', color: '#888' }}>
                        {orgFilter ? 'No stations for this organisation.' : 'Add your first station to get started.'}
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {stations.map(station => (
                        <div key={station.id} style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '15px', fontWeight: '600', color: '#1a1a2e', marginBottom: '4px' }}>
                                    🏪 {station.name}
                                </div>
                                <div style={{ fontSize: '13px', color: '#888' }}>
                                    {station.location || 'No location set'} &nbsp;·&nbsp;
                                    <span style={{ color: '#3498db' }}>{station.tank_count || 0} tank{station.tank_count !== '1' ? 's' : ''}</span>
                                    {station.organization_name && (
                                        <> &nbsp;·&nbsp; <span style={{ color: '#8e44ad' }}>🏢 {station.organization_name}</span></>
                                    )}
                                </div>
                                <div style={{ fontSize: '11px', color: '#bbb', marginTop: '4px' }}>ID: {station.id}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => openEdit(station)} style={{ padding: '7px 14px', background: '#e8f4fd', color: '#1a5276', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                                    Edit
                                </button>
                                <button onClick={() => handleDelete(station)} style={{ padding: '7px 14px', background: '#fdecea', color: '#e74c3c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}