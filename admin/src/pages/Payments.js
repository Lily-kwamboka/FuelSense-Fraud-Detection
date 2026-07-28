import React, { useState, useEffect, useRef } from 'react';

const STATUS_COLORS = {
    completed: { bg: '#eafaf1', text: '#1e8449' },
    pending: { bg: '#fff3cd', text: '#856404' },
    failed: { bg: '#fdecea', text: '#e74c3c' },
    manual: { bg: '#e8f4fd', text: '#1a5276' },
    cancelled: { bg: '#f0f0f0', text: '#555' },
    active: { bg: '#eafaf1', text: '#1e8449' },
    trial: { bg: '#f3e8ff', text: '#7c3aed' },
    expired: { bg: '#fdecea', text: '#e74c3c' },
    requested: { bg: '#fff3cd', text: '#856404' }, // NEW — refund_status: 'requested'
};

export default function Payments({ api, session }) {
    const [summary, setSummary] = useState(null);
    const [payments, setPayments] = useState([]);
    const [subscriptions, setSubscriptions] = useState([]);
    const [plans, setPlans] = useState([]);
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [filterOrg, setFilterOrg] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [showActivateModal, setShowActivateModal] = useState(null);
    const [showEditPlan, setShowEditPlan] = useState(null);
    const [activateForm, setActivateForm] = useState({ months: 1, plan_id: '', notes: '' });
    const [editPlanForm, setEditPlanForm] = useState({ price_monthly: '', price_annual: '', name: '' });
    const [saving, setSaving] = useState(false);
    const [actionMsg, setActionMsg] = useState('');
    const adminEmail = session?.user?.email || '';

    // Refund state
    const [showRefundModal, setShowRefundModal] = useState(null); // holds the payment being refunded
    const [refundReason, setRefundReason] = useState('');
    const [refundConfirmText, setRefundConfirmText] = useState('');
    const [refunding, setRefunding] = useState(false);
    const [refundJustCompleted, setRefundJustCompleted] = useState(null); // shows the "credit their account now" reminder

    async function loadAll() {
        setLoading(true);
        try {
            const [summaryRes, paymentsRes, subsRes, plansRes, orgsRes] = await Promise.all([
                fetch(`${api}/api/admin/payments/summary`),
                fetch(`${api}/api/admin/payments`),
                fetch(`${api}/api/admin/subscriptions`),
                fetch(`${api}/api/admin/plans`),
                fetch(`${api}/api/admin/organizations?admin_email=${encodeURIComponent(adminEmail)}`),
            ]);
            setSummary(await summaryRes.json());
            setPayments(await paymentsRes.json());
            setSubscriptions(await subsRes.json());
            setPlans(await plansRes.json());
            setOrgs(Array.isArray(await orgsRes.json()) ? await orgsRes.json() : []);
        } catch (err) {
            console.error('Failed to load payments data:', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadAll(); }, []);

    // ── Filtered data ──
    const filteredPayments = payments.filter(p => {
        if (filterOrg && p.organization_id !== filterOrg) return false;
        if (filterStatus && p.status !== filterStatus) return false;
        return true;
    });

    const filteredSubs = subscriptions.filter(s => {
        if (filterOrg && s.organization_id !== filterOrg) return false;
        if (filterStatus && s.status !== filterStatus) return false;
        return true;
    });

    // ── Activate / extend subscription ──
    async function handleActivate() {
        setSaving(true);
        try {
            const res = await fetch(`${api}/api/admin/subscriptions/${showActivateModal.id}/activate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(activateForm),
            });
            const data = await res.json();
            if (data.error) { alert(data.error); return; }
            setShowActivateModal(null);
            setActionMsg('Subscription activated successfully');
            setTimeout(() => setActionMsg(''), 3000);
            loadAll();
        } catch (err) { alert('Failed to activate subscription'); }
        finally { setSaving(false); }
    }

    // ── Cancel subscription ──
    async function handleCancel(sub) {
        if (!window.confirm(`Cancel subscription for ${sub.organization_name || sub.station_name}? This will immediately end their access.`)) return;
        try {
            await fetch(`${api}/api/admin/subscriptions/${sub.id}/cancel`, { method: 'POST' });
            setActionMsg('Subscription cancelled');
            setTimeout(() => setActionMsg(''), 3000);
            loadAll();
        } catch (err) { alert('Failed to cancel subscription'); }
    }

    // ── Update plan price ──
    async function handleUpdatePlan() {
        setSaving(true);
        try {
            const res = await fetch(`${api}/api/admin/plans/${showEditPlan.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editPlanForm),
            });
            const data = await res.json();
            if (data.error) { alert(data.error); return; }
            setShowEditPlan(null);
            setActionMsg('Plan updated successfully');
            setTimeout(() => setActionMsg(''), 3000);
            loadAll();
        } catch (err) { alert('Failed to update plan'); }
        finally { setSaving(false); }
    }

    // ── Refund handler ──
    async function handleRefund() {
        const payment = showRefundModal;
        const expectedText = String(parseFloat(payment.amount_kes)); // e.g. "18000" — must match exactly to confirm
        if (refundConfirmText.trim() !== expectedText) {
            alert(`Type the exact amount (${expectedText}) to confirm.`);
            return;
        }
        if (!refundReason.trim()) {
            alert('A reason is required for the audit trail.');
            return;
        }
        setRefunding(true);
        try {
            const res = await fetch(`${api}/api/payments/refund`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payment_id: payment.id, reason: refundReason }),
            });
            const data = await res.json();
            if (data.error) { alert(data.error); return; }
            setShowRefundModal(null);
            setRefundReason('');
            setRefundConfirmText('');
            setRefundJustCompleted(payment); // triggers the "credit their account" reminder banner
            setActionMsg('Refund requested with Pesapal — see reminder below');
            setTimeout(() => setActionMsg(''), 3000);
            loadAll();
        } catch (err) {
            alert('Failed to request refund: ' + err.message);
        } finally {
            setRefunding(false);
        }
    }

    // ── Generate Invoice PDF ──
    function generateInvoice(payment) {
        const invoiceNumber = `INV-${payment.id.substring(0, 8).toUpperCase()}`;
        const date = new Date(payment.created_at).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice ${invoiceNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #1a1a2e; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #22c55e; padding-bottom: 20px; }
          .logo { font-size: 28px; font-weight: bold; color: #1a1a2e; }
          .logo span { color: #22c55e; }
          .invoice-title { font-size: 32px; font-weight: bold; color: #1a1a2e; text-align: right; }
          .invoice-number { font-size: 14px; color: #666; text-align: right; margin-top: 4px; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 12px; font-weight: bold; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
          .section-value { font-size: 15px; color: #1a1a2e; }
          .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #1a1a2e; color: white; padding: 12px 16px; text-align: left; font-size: 13px; }
          td { padding: 12px 16px; border-bottom: 1px solid #e0e0e0; font-size: 14px; }
          .total-row { background: #f8f8f8; font-weight: bold; }
          .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; background: #eafaf1; color: #1e8449; }
          .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #888; text-align: center; }
          .amount { font-size: 24px; font-weight: bold; color: #22c55e; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo">Fuel<span>Sense</span></div>
            <div style="font-size:13px;color:#666;margin-top:6px;">Fuel Operations Intelligence</div>
            <div style="font-size:12px;color:#888;margin-top:4px;">fuelsense.co.ke · support@fuelsense.co.ke</div>
          </div>
          <div>
            <div class="invoice-title">INVOICE</div>
            <div class="invoice-number">${invoiceNumber}</div>
            <div class="invoice-number">Date: ${date}</div>
          </div>
        </div>

        <div class="two-col">
          <div class="section">
            <div class="section-title">Billed To</div>
            <div class="section-value" style="font-weight:bold;">${payment.organization_name || 'N/A'}</div>
            <div class="section-value">${payment.station_name || ''}</div>
          </div>
          <div class="section">
            <div class="section-title">Payment Details</div>
            <div class="section-value">Status: <span class="status-badge">${payment.status?.toUpperCase()}</span></div>
            <div class="section-value" style="margin-top:6px;">Billing: ${payment.billing_cycle || 'monthly'}</div>
            ${payment.pesapal_tracking_id ? `<div class="section-value" style="margin-top:6px;font-size:12px;color:#888;">Ref: ${payment.pesapal_tracking_id}</div>` : ''}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Plan</th>
              <th>Billing Cycle</th>
              <th style="text-align:right;">Amount (KES)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>FuelSense Subscription</td>
              <td>${payment.plan_name || 'N/A'}</td>
              <td>${payment.billing_cycle || 'monthly'}</td>
              <td style="text-align:right;">KES ${parseFloat(payment.amount_kes || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr class="total-row">
              <td colspan="3" style="text-align:right;font-weight:bold;">Total</td>
              <td style="text-align:right;" class="amount">KES ${parseFloat(payment.amount_kes || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <p>Thank you for using FuelSense. This invoice was generated automatically.</p>
          <p>For queries, contact support@fuelsense.co.ke</p>
          <p style="margin-top:8px;color:#bbb;">FuelSense · Nairobi, Kenya · fuelsense.co.ke</p>
        </div>
      </body>
      </html>
    `;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); }, 500);
    }

    const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#f8f8f8' };
    const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '500', color: '#666', marginBottom: '4px' };

    if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>Loading payments...</div>;

    return (
        <div>
            {actionMsg && (
                <div style={{ background: '#eafaf1', color: '#1e8449', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                    {actionMsg}
                </div>
            )}

            {/* Refund reminder banner */}
            {refundJustCompleted && (
                <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#856404', marginBottom: '4px' }}>
                            ⚠️ Action needed: credit their account now
                        </div>
                        <div style={{ fontSize: '13px', color: '#856404', lineHeight: '1.5' }}>
                            Pesapal's refund to {refundJustCompleted.organization_name || refundJustCompleted.station_name} typically
                            takes <strong>3–7 business days</strong> to reach their M-Pesa/card. To avoid leaving them without
                            service in the meantime, go to <strong>Subscriptions</strong> and extend or activate their access now —
                            the money-back is already in motion on Pesapal's side independently.
                        </div>
                    </div>
                    <button
                        onClick={() => setRefundJustCompleted(null)}
                        style={{ background: 'transparent', border: 'none', color: '#856404', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #e0e0e0', paddingBottom: '0' }}>
                {['overview', 'payments', 'subscriptions', 'plans'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '10px 20px', background: activeTab === tab ? '#1a1a2e' : 'transparent', color: activeTab === tab ? '#fff' : '#666', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: '13px', fontWeight: activeTab === tab ? '600' : '400', textTransform: 'capitalize' }}>
                        {tab}
                    </button>
                ))}
            </div>

            {/* ── OVERVIEW TAB ── */}
            {activeTab === 'overview' && summary && (
                <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                        {[
                            { label: 'Total Revenue', value: `KES ${parseFloat(summary.total_revenue_kes || 0).toLocaleString()}`, sub: 'All time completed payments', color: '#22c55e' },
                            { label: 'This Month', value: `KES ${parseFloat(summary.revenue_this_month || 0).toLocaleString()}`, sub: 'Revenue this calendar month', color: '#3b82f6' },
                            { label: 'Paying Organisations', value: summary.paying_orgs || 0, sub: 'With at least one completed payment', color: '#f97316' },
                            { label: 'Completed Payments', value: summary.total_completed || 0, sub: 'Successfully processed', color: '#1e8449' },
                            { label: 'Pending Payments', value: summary.total_pending || 0, sub: 'Awaiting confirmation', color: '#856404' },
                            { label: 'Failed Payments', value: summary.total_failed || 0, sub: 'Requires follow up', color: '#e74c3c' },
                        ].map((stat, i) => (
                            <div key={i} style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', border: '1px solid #e0e0e0' }}>
                                <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>{stat.label}</div>
                                <div style={{ fontSize: '24px', fontWeight: '700', color: stat.color }}>{stat.value}</div>
                                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>{stat.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* Recent payments */}
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', border: '1px solid #e0e0e0' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '16px' }}>Recent Payments</div>
                        {payments.slice(0, 5).map(p => {
                            const sc = STATUS_COLORS[p.status] || STATUS_COLORS.pending;
                            return (
                                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e' }}>{p.organization_name || p.station_name || 'Unknown'}</div>
                                        <div style={{ fontSize: '11px', color: '#888' }}>{p.plan_name} · {p.billing_cycle} · {new Date(p.created_at).toLocaleDateString()}</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span style={{ background: sc.bg, color: sc.text, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>{p.status?.toUpperCase()}</span>
                                        <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a2e' }}>KES {parseFloat(p.amount_kes || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── PAYMENTS TAB ── */}
            {activeTab === 'payments' && (
                <div>
                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select value={filterOrg} onChange={e => setFilterOrg(e.target.value)} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', background: '#fff', outline: 'none', minWidth: '200px' }}>
                            <option value="">All Organisations</option>
                            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', background: '#fff', outline: 'none' }}>
                            <option value="">All Statuses</option>
                            {['completed', 'pending', 'failed', 'manual'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                        </select>
                        {(filterOrg || filterStatus) && (
                            <button onClick={() => { setFilterOrg(''); setFilterStatus(''); }} style={{ padding: '7px 12px', background: '#fdecea', color: '#e74c3c', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                                Clear filters
                            </button>
                        )}
                        <span style={{ fontSize: '13px', color: '#888', marginLeft: 'auto' }}>{filteredPayments.length} payments</span>
                    </div>

                    {/* Payments table */}
                    <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8f8f8' }}>
                                    {['Organisation', 'Plan', 'Amount', 'Billing', 'Status', 'Date', 'Actions'].map(h => (
                                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666', borderBottom: '1px solid #e0e0e0' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPayments.length === 0 ? (
                                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#888' }}>No payments found</td></tr>
                                ) : filteredPayments.map(p => {
                                    const sc = STATUS_COLORS[p.status] || STATUS_COLORS.pending;
                                    return (
                                        <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                            <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                                                <div style={{ fontWeight: '600', color: '#1a1a2e' }}>{p.organization_name || 'N/A'}</div>
                                                <div style={{ fontSize: '11px', color: '#888' }}>{p.station_name}</div>
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#666' }}>{p.plan_name || 'N/A'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#1a1a2e' }}>KES {parseFloat(p.amount_kes || 0).toLocaleString()}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#666', textTransform: 'capitalize' }}>{p.billing_cycle}</td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{ background: sc.bg, color: sc.text, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>{p.status?.toUpperCase()}</span>
                                                {p.refund_status === 'requested' && (
                                                    <span style={{ background: STATUS_COLORS.requested.bg, color: STATUS_COLORS.requested.text, padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', marginLeft: '6px' }}>
                                                        REFUND REQUESTED
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <button onClick={() => generateInvoice(p)} style={{ padding: '5px 10px', background: '#e8f4fd', color: '#1a5276', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}>
                                                        Invoice
                                                    </button>
                                                    {p.status === 'completed' && p.refund_status !== 'requested' && (
                                                        <button
                                                            onClick={() => setShowRefundModal(p)}
                                                            style={{ padding: '5px 10px', background: '#fdecea', color: '#e74c3c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                                                        >
                                                            Refund
                                                        </button>
                                                    )}
                                                    {p.refund_status === 'requested' && (
                                                        <span style={{ background: STATUS_COLORS.requested.bg, color: STATUS_COLORS.requested.text, padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600' }}>
                                                            REFUND REQUESTED
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── SUBSCRIPTIONS TAB ── */}
            {activeTab === 'subscriptions' && (
                <div>
                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select value={filterOrg} onChange={e => setFilterOrg(e.target.value)} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', background: '#fff', outline: 'none', minWidth: '200px' }}>
                            <option value="">All Organisations</option>
                            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', background: '#fff', outline: 'none' }}>
                            <option value="">All Statuses</option>
                            {['active', 'trial', 'expired', 'cancelled'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                        </select>
                        {(filterOrg || filterStatus) && (
                            <button onClick={() => { setFilterOrg(''); setFilterStatus(''); }} style={{ padding: '7px 12px', background: '#fdecea', color: '#e74c3c', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                                Clear filters
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {filteredSubs.length === 0 ? (
                            <div style={{ background: '#fff', borderRadius: '12px', padding: '60px 24px', textAlign: 'center' }}>
                                <div style={{ fontSize: '13px', color: '#888' }}>No subscriptions found</div>
                            </div>
                        ) : filteredSubs.map(sub => {
                            const sc = STATUS_COLORS[sub.status] || STATUS_COLORS.pending;
                            const daysLeft = sub.current_period_end ? Math.ceil((new Date(sub.current_period_end) - new Date()) / (1000 * 60 * 60 * 24)) : null;
                            return (
                                <div key={sub.id} style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', border: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '15px', fontWeight: '600', color: '#1a1a2e' }}>{sub.organization_name || sub.station_name || 'Unknown'}</span>
                                            <span style={{ background: sc.bg, color: sc.text, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>{sub.status?.toUpperCase()}</span>
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#666' }}>
                                            Plan: <strong>{sub.plan_name || 'N/A'}</strong> &nbsp;·&nbsp;
                                            {sub.billing_cycle} &nbsp;·&nbsp;
                                            KES {parseFloat(sub.price_monthly || 0).toLocaleString()}/mo
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                                            {sub.current_period_end && (
                                                <span style={{ color: daysLeft !== null && daysLeft < 7 ? '#e74c3c' : '#888' }}>
                                                    {daysLeft !== null ? (daysLeft > 0 ? `${daysLeft} days remaining` : 'Expired') : 'No end date'} · Ends {new Date(sub.current_period_end).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => { setShowActivateModal(sub); setActivateForm({ months: 1, plan_id: sub.plan_id || '', notes: '' }); }}
                                            style={{ padding: '7px 14px', background: '#eafaf1', color: '#1e8449', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}
                                        >
                                            Activate / Extend
                                        </button>
                                        <button
                                            onClick={() => handleCancel(sub)}
                                            style={{ padding: '7px 14px', background: '#fdecea', color: '#e74c3c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── PLANS TAB ── */}
            {activeTab === 'plans' && (
                <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                        {plans.map(plan => (
                            <div key={plan.id} style={{ background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', border: '1px solid #e0e0e0' }}>
                                <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a2e', marginBottom: '8px' }}>{plan.name}</div>
                                <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e', marginBottom: '4px' }}>
                                    KES {parseFloat(plan.price_monthly || 0).toLocaleString()}
                                    <span style={{ fontSize: '13px', color: '#888', fontWeight: '400' }}>/mo</span>
                                </div>
                                <div style={{ fontSize: '13px', color: '#888', marginBottom: '16px' }}>
                                    KES {parseFloat(plan.price_annual || 0).toLocaleString()}/yr
                                </div>
                                <button
                                    onClick={() => { setShowEditPlan(plan); setEditPlanForm({ price_monthly: plan.price_monthly, price_annual: plan.price_annual, name: plan.name }); }}
                                    style={{ width: '100%', padding: '9px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                                >
                                    Edit Pricing
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── ACTIVATE MODAL ── */}
            {showActivateModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '440px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '6px' }}>Activate / Extend Subscription</div>
                        <div style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>
                            {showActivateModal.organization_name || showActivateModal.station_name}
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                            <label style={labelStyle}>Extend by (months)</label>
                            <input type="number" min="1" max="24" value={activateForm.months} onChange={e => setActivateForm({ ...activateForm, months: parseInt(e.target.value) })} style={inputStyle} />
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                            <label style={labelStyle}>Change Plan (optional)</label>
                            <select value={activateForm.plan_id} onChange={e => setActivateForm({ ...activateForm, plan_id: e.target.value })} style={inputStyle}>
                                <option value="">Keep current plan</option>
                                {plans.map(p => <option key={p.id} value={p.id}>{p.name} — KES {parseFloat(p.price_monthly).toLocaleString()}/mo</option>)}
                            </select>
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={labelStyle}>Notes (internal)</label>
                            <input type="text" value={activateForm.notes} onChange={e => setActivateForm({ ...activateForm, notes: e.target.value })} placeholder="e.g. Manual activation — bank transfer received" style={inputStyle} />
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleActivate} disabled={saving} style={{ flex: 1, padding: '10px', background: saving ? '#aaa' : '#27ae60', color: '#fff', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>
                                {saving ? 'Saving...' : 'Activate / Extend'}
                            </button>
                            <button onClick={() => setShowActivateModal(null)} style={{ flex: 1, padding: '10px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── EDIT PLAN MODAL ── */}
            {showEditPlan && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '400px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '20px' }}>Edit Plan: {showEditPlan.name}</div>
                        <div style={{ marginBottom: '12px' }}>
                            <label style={labelStyle}>Plan Name</label>
                            <input type="text" value={editPlanForm.name} onChange={e => setEditPlanForm({ ...editPlanForm, name: e.target.value })} style={inputStyle} />
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                            <label style={labelStyle}>Monthly Price (KES)</label>
                            <input type="number" value={editPlanForm.price_monthly} onChange={e => setEditPlanForm({ ...editPlanForm, price_monthly: e.target.value })} style={inputStyle} />
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={labelStyle}>Annual Price (KES)</label>
                            <input type="number" value={editPlanForm.price_annual} onChange={e => setEditPlanForm({ ...editPlanForm, price_annual: e.target.value })} style={inputStyle} />
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleUpdatePlan} disabled={saving} style={{ flex: 1, padding: '10px', background: saving ? '#aaa' : '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>
                                {saving ? 'Saving...' : 'Update Plan'}
                            </button>
                            <button onClick={() => setShowEditPlan(null)} style={{ flex: 1, padding: '10px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── REFUND MODAL ── */}
            {showRefundModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '460px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '6px' }}>
                            Refund Payment
                        </div>
                        <div style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>
                            {showRefundModal.organization_name || showRefundModal.station_name} · {showRefundModal.plan_name}
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#e74c3c', marginBottom: '16px' }}>
                            KES {parseFloat(showRefundModal.amount_kes).toLocaleString()}
                        </div>

                        <div style={{ background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#721c24' }}>
                            This requests a real refund from Pesapal. It cannot be undone from here once submitted.
                            The actual money-back takes 3–7 business days on Pesapal's side.
                        </div>

                        <div style={{ marginBottom: '12px' }}>
                            <label style={labelStyle}>Reason (required — kept for audit trail)</label>
                            <input
                                type="text"
                                value={refundReason}
                                onChange={e => setRefundReason(e.target.value)}
                                placeholder="e.g. Client paid twice for the same billing period"
                                style={inputStyle}
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={labelStyle}>
                                Type <strong>{parseFloat(showRefundModal.amount_kes)}</strong> to confirm
                            </label>
                            <input
                                type="text"
                                value={refundConfirmText}
                                onChange={e => setRefundConfirmText(e.target.value)}
                                placeholder={String(parseFloat(showRefundModal.amount_kes))}
                                style={inputStyle}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={handleRefund}
                                disabled={refunding}
                                style={{ flex: 1, padding: '10px', background: refunding ? '#aaa' : '#e74c3c', color: '#fff', border: 'none', borderRadius: '8px', cursor: refunding ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}
                            >
                                {refunding ? 'Requesting...' : 'Confirm Refund'}
                            </button>
                            <button
                                onClick={() => { setShowRefundModal(null); setRefundReason(''); setRefundConfirmText(''); }}
                                style={{ flex: 1, padding: '10px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}