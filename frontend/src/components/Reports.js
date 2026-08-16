import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function Reports({ deliveries, reconciliation, tanks, darkMode }) {
  const [exportLoading, setExportLoading] = useState(false);
  const bgColor   = darkMode ? '#1e1e2e' : '#ffffff';
  const textColor = darkMode ? '#e0e0e0' : '#1a1a2e';
  const subColor  = darkMode ? '#888'    : '#666';
  const borderColor = darkMode ? '#2a2a3e' : '#f0f0f0';

  // ── Summary stats ──────────────────────────────────────────
  const totalDeliveries  = deliveries.length;
  const confirmedCount   = deliveries.filter(d => d.status === 'confirmed').length;
  const flaggedCount     = deliveries.filter(d => d.status === 'flagged').length;
  const totalBOL         = deliveries.reduce((s, d) => s + parseFloat(d.bol_nsv_litres || 0), 0);
  const totalReceived    = deliveries.reduce((s, d) => s + parseFloat(d.received_nsv_litres || 0), 0);
  const totalVariance    = deliveries.reduce((s, d) => s + parseFloat(d.variance_litres || 0), 0);
  const totalDailyVar    = reconciliation.reduce((s, r) => s + parseFloat(r.variance_litres || 0), 0);

  // ── Export to CSV ──────────────────────────────────────────
  function exportDeliveriesCSV() {
    const headers = ['BOL Number', 'Supplier', 'Tank', 'Fuel Type', 'BOL NSV (L)', 'Received NSV (L)', 'Variance (L)', 'Variance %', 'Status', 'Classification'];
    const rows = deliveries.map(d => [
      d.bol_number,
      d.supplier_name,
      'Tank ' + d.tank_number,
      d.fuel_type,
      parseFloat(d.bol_nsv_litres || 0).toFixed(0),
      parseFloat(d.received_nsv_litres || 0).toFixed(0),
      parseFloat(d.variance_litres || 0).toFixed(0),
      parseFloat(d.variance_pct || 0).toFixed(3) + '%',
      d.status,
      d.variance_classification || '—',
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    downloadFile('MafutaFlow Africa-deliveries.csv', 'text/csv', csv);
  }

  function exportReconciliationCSV() {
    const headers = ['Date', 'Tank', 'Fuel Type', 'Opening NSV (L)', 'Deliveries (L)', 'Pump Sales (L)', 'Theoretical Closing (L)', 'Actual Closing (L)', 'Variance (L)'];
    const rows = reconciliation.map(r => [
      new Date(r.recon_date).toLocaleDateString(),
      'Tank ' + r.tank_number,
      r.fuel_type,
      parseFloat(r.opening_nsv).toFixed(0),
      parseFloat(r.deliveries_nsv).toFixed(0),
      parseFloat(r.pump_sales_litres).toFixed(0),
      parseFloat(r.theoretical_closing).toFixed(0),
      parseFloat(r.closing_nsv).toFixed(0),
      parseFloat(r.variance_litres).toFixed(0),
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    downloadFile('MafutaFlow Africa-reconciliation.csv', 'text/csv', csv);
  }

  // ── Export to PDF ──────────────────────────────────────────
  function exportPDF() {
    setExportLoading(true);
    const doc = new jsPDF();

    // Header
    doc.setFillColor(26, 26, 46);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('MafutaFlow Africa — Mafuta Salama', 14, 16);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Fuel Inventory Management Report', 14, 24);
    doc.text('Generated: ' + new Date().toLocaleString(), 14, 30);

    // Summary
    doc.setTextColor(26, 26, 46);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 14, 48);

    autoTable(doc, {
      startY: 52,
      head: [['Metric', 'Value']],
      body: [
        ['Total Deliveries',    totalDeliveries],
        ['Confirmed',           confirmedCount],
        ['Flagged',             flaggedCount],
        ['Total BOL NSV',       totalBOL.toFixed(0) + ' L'],
        ['Total Received NSV',  totalReceived.toFixed(0) + ' L'],
        ['Total Delivery Variance', (totalVariance > 0 ? '+' : '') + totalVariance.toFixed(0) + ' L'],
        ['Total Daily Variance',    (totalDailyVar > 0 ? '+' : '') + totalDailyVar.toFixed(0) + ' L'],
      ],
      theme: 'striped',
      headStyles: { fillColor: [26, 26, 46] },
      styles: { fontSize: 10 },
    });

    // Deliveries table
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Delivery History', 14, doc.lastAutoTable.finalY + 16);

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 20,
      head: [['BOL No.', 'Supplier', 'Tank', 'BOL NSV', 'Received', 'Variance', 'Status']],
      body: deliveries.map(d => [
        d.bol_number,
        d.supplier_name,
        'Tank ' + d.tank_number + ' (' + d.fuel_type + ')',
        parseFloat(d.bol_nsv_litres || 0).toFixed(0) + 'L',
        parseFloat(d.received_nsv_litres || 0).toFixed(0) + 'L',
        (parseFloat(d.variance_litres || 0) > 0 ? '+' : '') + parseFloat(d.variance_litres || 0).toFixed(0) + 'L',
        d.status.toUpperCase(),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [26, 26, 46] },
      styles: { fontSize: 9 },
      didParseCell: function(data) {
        if (data.column.index === 6 && data.section === 'body') {
          if (data.cell.raw === 'FLAGGED') {
            data.cell.styles.textColor = [231, 76, 60];
            data.cell.styles.fontStyle = 'bold';
          } else if (data.cell.raw === 'CONFIRMED') {
            data.cell.styles.textColor = [39, 174, 96];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    // Daily reconciliation
    if (reconciliation.length > 0) {
      doc.addPage();
      doc.setFillColor(26, 26, 46);
      doc.rect(0, 0, 210, 20, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Daily Reconciliation', 14, 13);

      doc.setTextColor(26, 26, 46);
      autoTable(doc, {
        startY: 28,
        head: [['Date', 'Tank', 'Opening', 'Deliveries', 'Sales', 'Theoretical', 'Actual', 'Variance']],
        body: reconciliation.map(r => [
          new Date(r.recon_date).toLocaleDateString(),
          'Tank ' + r.tank_number,
          parseFloat(r.opening_nsv).toFixed(0) + 'L',
          parseFloat(r.deliveries_nsv).toFixed(0) + 'L',
          parseFloat(r.pump_sales_litres).toFixed(0) + 'L',
          parseFloat(r.theoretical_closing).toFixed(0) + 'L',
          parseFloat(r.closing_nsv).toFixed(0) + 'L',
          (parseFloat(r.variance_litres) > 0 ? '+' : '') + parseFloat(r.variance_litres).toFixed(0) + 'L',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [26, 26, 46] },
        styles: { fontSize: 9 },
      });
    }

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('MafutaFlow Africa · Mafuta Salama · Nairobi, Kenya', 14, 290);
      doc.text('Page ' + i + ' of ' + pageCount, 180, 290);
    }

    doc.save('MafutaFlow Africa-report-' + new Date().toISOString().split('T')[0] + '.pdf');
    setExportLoading(false);
  }

  function downloadFile(filename, type, content) {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <ReportStat label="Total Deliveries" value={totalDeliveries}                                         color="#3498db" bg={bgColor} text={textColor} sub={subColor} />
        <ReportStat label="Confirmed"         value={confirmedCount}                                         color="#27ae60" bg={bgColor} text={textColor} sub={subColor} />
        <ReportStat label="Flagged"           value={flaggedCount}                                           color="#e74c3c" bg={bgColor} text={textColor} sub={subColor} />
        <ReportStat label="Total BOL NSV"     value={totalBOL.toFixed(0) + ' L'}                            color="#f39c12" bg={bgColor} text={textColor} sub={subColor} />
        <ReportStat label="Total Received"    value={totalReceived.toFixed(0) + ' L'}                       color="#4CAF50" bg={bgColor} text={textColor} sub={subColor} />
        <ReportStat label="Total Variance"    value={(totalVariance > 0 ? '+' : '') + totalVariance.toFixed(0) + ' L'} color={totalVariance < 0 ? '#e74c3c' : '#27ae60'} bg={bgColor} text={textColor} sub={subColor} />
      </div>

      {/* Export buttons */}
      <div style={{ ...styles.exportCard, background: bgColor, borderColor }}>
        <div style={{ ...styles.exportTitle, color: textColor }}>📤 Export Reports</div>
        <div style={{ ...styles.exportSub, color: subColor }}>Download your fuel management data in PDF or CSV format.</div>

        <div style={styles.exportGrid}>
          <ExportButton
            icon="📄"
            title="Full Report PDF"
            description="Complete report with summary, deliveries and reconciliation"
            onClick={exportPDF}
            loading={exportLoading}
            color="#e74c3c"
          />
          <ExportButton
            icon="📊"
            title="Deliveries CSV"
            description="All delivery records with variance and classification"
            onClick={exportDeliveriesCSV}
            color="#3498db"
          />
          <ExportButton
            icon="📋"
            title="Reconciliation CSV"
            description="Daily stock reconciliation data for all tanks"
            onClick={exportReconciliationCSV}
            color="#27ae60"
          />
        </div>
      </div>

      {/* Delivery summary table */}
      <div style={{ ...styles.tableCard, background: bgColor, borderColor }}>
        <div style={{ ...styles.exportTitle, color: textColor, marginBottom: '16px' }}>Delivery Summary</div>
        {deliveries.length === 0 ? (
          <div style={{ color: subColor, textAlign: 'center', padding: '24px' }}>No deliveries recorded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${borderColor}` }}>
                  {['BOL No.', 'Supplier', 'Tank', 'BOL NSV', 'Received', 'Variance', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: subColor, fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deliveries.map(d => {
                  const variance = parseFloat(d.variance_litres || 0);
                  return (
                    <tr key={d.id} style={{ borderBottom: `1px solid ${borderColor}` }}>
                      <td style={{ padding: '10px 12px', color: textColor, fontWeight: '500' }}>{d.bol_number}</td>
                      <td style={{ padding: '10px 12px', color: textColor }}>{d.supplier_name}</td>
                      <td style={{ padding: '10px 12px', color: textColor }}>Tank {d.tank_number}</td>
                      <td style={{ padding: '10px 12px', color: textColor }}>{parseFloat(d.bol_nsv_litres || 0).toFixed(0)}L</td>
                      <td style={{ padding: '10px 12px', color: textColor }}>{d.received_nsv_litres ? parseFloat(d.received_nsv_litres).toFixed(0) + 'L' : '—'}</td>
                      <td style={{ padding: '10px 12px', color: variance < 0 ? '#e74c3c' : '#27ae60', fontWeight: '600' }}>
                        {d.variance_litres ? (variance > 0 ? '+' : '') + variance.toFixed(0) + 'L' : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '600',
                          background: d.status === 'flagged' ? '#fdecea' : d.status === 'confirmed' ? '#eafaf1' : '#fff3cd',
                          color: d.status === 'flagged' ? '#e74c3c' : d.status === 'confirmed' ? '#27ae60' : '#856404',
                        }}>
                          {d.status.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportStat({ label, value, color, bg, text, sub }) {
  return (
    <div style={{ background: bg, borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: '11px', color: sub, marginBottom: '6px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: '700', color }}>{value}</div>
    </div>
  );
}

function ExportButton({ icon, title, description, onClick, loading, color }) {
  return (
    <button style={{ ...styles.exportBtn, borderColor: color }} onClick={onClick} disabled={loading}>
      <div style={{ fontSize: '28px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '13px', fontWeight: '600', color, marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '11px', color: '#999', lineHeight: '1.4' }}>{description}</div>
      {loading && <div style={{ fontSize: '11px', color, marginTop: '8px' }}>Generating...</div>}
    </button>
  );
}

const styles = {
  exportCard:  { borderRadius: '12px', border: '1px solid', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  exportTitle: { fontSize: '15px', fontWeight: '600', marginBottom: '4px' },
  exportSub:   { fontSize: '13px', marginBottom: '20px' },
  exportGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' },
  exportBtn:   { border: '1.5px solid', borderRadius: '10px', padding: '16px', background: 'transparent', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' },
  tableCard:   { borderRadius: '12px', border: '1px solid', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
};

export default Reports;