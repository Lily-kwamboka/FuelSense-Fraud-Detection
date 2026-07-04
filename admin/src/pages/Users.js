import React, { useState, useEffect } from 'react';

const ROLES = ['owner', 'headquarters', 'supervisor', 'compliance_officer', 'station_manager', 'shift_supervisor', 'attendant'];

const ROLE_COLORS = {
    owner: { bg: '#fdecea', text: '#e74c3c' },
    headquarters: { bg: '#f3e8ff', text: '#7c3aed' },
    supervisor: { bg: '#eafaf1', text: '#1e8449' },
    compliance_officer: { bg: '#e8f4fd', text: '#1a5276' },
    station_manager: { bg: '#fff3cd', text: '#856404' },
    shift_supervisor: { bg: '#fef9e7', text: '#7d6608' },
    attendant: { bg: '#f0f0f0', text: '#555' },
};

export default function Users({ api, session }) {
    const [users, setUsers] = useState([]);
    const [stations, setStations] = useState([]);
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const adminEmail = session?.user?.email || '';
    const adminUid = session?.user?.id || '';

    const [form, setForm] = useState({
        supabase_uid: '',
        email: '',
        full_name: '',
        role: 'station_manager',
        organization_id: '',
        station_id: '',
    });

    // Stations filtered by selected org in form
    const filteredStations = form.organization_id
        ? stations.filter(s => s.organization_id === form.organization_id)
        : stations;

    async function loadData() {
        setLoading(true);
        try {
            const [usersRes, stationsRes, orgsRes] = await Promise.all([
                fetch(`${api}/api/admin/users`),
                fetch(`${api}/api/admin/stations`),
                fetch(`${api}/api/admin/organizations?admin_email=${encodeURIComponent(adminEmail)}`),
            ]);
            const usersData = await usersRes.json();
            const stationsData = await stationsRes.json();
            const orgsData = await orgsRes.json();
            setUsers(Array.isArray(usersData) ? usersData : []);
            setStations(Array.isArray(stationsData) ? stationsData : []);
            setOrgs(Array.isArray(orgsData) ? orgsData : []);
        } catch (err) {
            console.error('Failed to load data:', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadData(); }, []);

    function openAdd() {
        setEditing(null);
        setForm({ supabase_uid: '', email: '', full_name: '', role: 'station_manager', organization_id: '', station_id: '' });
        setError('');
        setShowForm(true);
    }

    function openEdit(user) {
        setEditing(user);
        const station = stations.find(s => s.id === user.station_id);
        setForm({
            supabase_uid: user.supabase_uid,
            email: user.email || '',
            full_name: user.full_name || '',
            role: user.role || 'station_manager',
            organization_id: station?.organization_id || '',
            station_id: user.station_id || '',
        });
        setError('');
        setShowForm(true);
    }

    async function handleSave() {
        if (!form.supabase_uid.trim()) { setError('Supabase UID is required.'); return; }
        if (!form.email.trim()) { setError('Email is required.'); return; }
        if (!form.organization_id) { setError('Please select an organisation.'); return; }
        if (!form.role) { setError('Role is required.'); return; }
        setSaving(true);
        setError('');
        try {
            const url = editing ? `${api}/api/admin/users/${editing.id}` : `${api}/api/admin/users`;
            const method = editing ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    station_id: form.station_id || null,
                    organization_id: form.organization_id,
                }),
            });
            const data = await res.json();
            if (data.error) { setError(data.error); return; }
            setShowForm(false);
            loadData();
        } catch (err) {
            setError('Failed to save user.');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(user) {
        if (!window.confirm(`Delete user "${user.email}"? This cannot be undone.`)) return;
        try {
            await fetch(`${api}/api/admin/users/${user.id}`, { method: 'DELETE' });
            loadData();
        } catch (err) {
            alert('Failed to delete user.');
        }
    }

    const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#f8f8f8' };
    const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '500', color: '#666', marginBottom: '4px' };
    const getOrgName = (orgId) => orgs.find(o => o.id === orgId)?.name || '';

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', color: '#666' }}>{users.length} user{users.length !== 1 ? 's' : ''} total</div>
                <button onClick={openAdd} style={{ padding: '9px 18px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                    + Add User
                </button>
            </div>

            {/* Form */}
            {showForm && (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e0e0e0' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '4px' }}>
                        {editing ? 'Edit User' : 'Add New User'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
                        Select an organisation first, then fill in the user details.
                    </div>

                    {error && (
                        <div style={{ background: '#fdecea', color: '#721c24', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                            {error}
                        </div>
                    )}

                    {/* Step 1 — Organisation */}
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '14px 16px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#0369a1', marginBottom: '8px' }}>STEP 1 — Select Organisation *</div>
                        <select
                            value={form.organization_id}
                            onChange={e => setForm({ ...form, organization_id: e.target.value, station_id: '' })}
                            style={inputStyle}
                        >
                            <option value="">— Select an organisation —</option>
                            {orgs.map(o => <option key={o.id} value={o.id}>{o.name} ({o.subscription_status || 'trial'})</option>)}
                        </select>
                    </div>

                    {/* Step 2 — User details */}
                    {form.organization_id && (
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#1a1a2e', marginBottom: '12px' }}>STEP 2 — User Details</div>

                            <div style={{ background: '#f8f8f8', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#666', marginBottom: '14px' }}>
                                Adding user to: <strong style={{ color: '#1a1a2e' }}>{getOrgName(form.organization_id)}</strong>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                <div>
                                    <label style={labelStyle}>Supabase UID *</label>
                                    <input
                                        type="text"
                                        value={form.supabase_uid}
                                        onChange={e => setForm({ ...form, supabase_uid: e.target.value })}
                                        placeholder="e.g. d94bcc21-f979-44b4..."
                                        style={inputStyle}
                                        disabled={!!editing}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Email *</label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={e => setForm({ ...form, email: e.target.value })}
                                        placeholder="e.g. john@fuelsense.com"
                                        style={inputStyle}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Full Name</label>
                                    <input
                                        type="text"
                                        value={form.full_name}
                                        onChange={e => setForm({ ...form, full_name: e.target.value })}
                                        placeholder="e.g. John Kamau"
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Role *</label>
                                    <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={inputStyle}>
                                        {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Station</label>
                                    <select value={form.station_id} onChange={e => setForm({ ...form, station_id: e.target.value })} style={inputStyle}>
                                        <option value="">All stations (admin)</option>
                                        {filteredStations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
                                Get the Supabase UID from Supabase dashboard → Authentication → Users
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={handleSave}
                            disabled={saving || !form.organization_id}
                            style={{ padding: '9px 20px', background: saving || !form.organization_id ? '#aaa' : '#27ae60', color: '#fff', border: 'none', borderRadius: '8px', cursor: saving || !form.organization_id ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}
                        >
                            {saving ? 'Saving...' : editing ? 'Update User' : 'Add User'}
                        </button>
                        <button onClick={() => setShowForm(false)} style={{ padding: '9px 20px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* User list */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Loading users...</div>
            ) : users.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
                    <div style={{ fontSize: '16px', fontWeight: '500', color: '#1a1a2e', marginBottom: '8px' }}>No users yet</div>
                    <div style={{ fontSize: '13px', color: '#888' }}>Add your first user to get started.</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {users.map(user => {
                        const rc = ROLE_COLORS[user.role] || ROLE_COLORS.attendant;
                        return (
                            <div key={user.id} style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#1a1a2e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700' }}>
                                            {user.email?.[0]?.toUpperCase() || 'U'}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>{user.full_name || user.email}</div>
                                            <div style={{ fontSize: '12px', color: '#888' }}>{user.email}</div>
                                        </div>
                                        <span style={{ ...rc, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                                            {user.role?.replace(/_/g, ' ').toUpperCase()}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#888' }}>
                                        {user.station_name || 'All stations'} &nbsp;·&nbsp;
                                        UID: {user.supabase_uid?.substring(0, 8)}...
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => openEdit(user)} style={{ padding: '7px 14px', background: '#e8f4fd', color: '#1a5276', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Edit</button>
                                    <button onClick={() => handleDelete(user)} style={{ padding: '7px 14px', background: '#fdecea', color: '#e74c3c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Delete</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}