import React, { useState } from 'react';
import { FileSpreadsheet, Archive, Download, CheckCircle2, AlertTriangle, Send, Mail, Calendar } from 'lucide-react';

export default function ReportingPanel({ events = [], adminToken, defaultEmail }) {
  const [dateRange, setDateRange] = useState('ALL'); // 'TODAY', 'WEEK', 'MONTH', 'ALL'
  const [recipientEmail, setRecipientEmail] = useState(() => {
    return localStorage.getItem('redtag_report_recipient') || '';
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailFeedback, setEmailFeedback] = useState('');

  // Filter events based on date range
  const now = Date.now();
  const todayStr = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const filteredEvents = events.filter((e) => {
    if (e.event_type !== 'AUTHORIZED_PLACEMENT' && e.event_type !== 'UNAUTHORIZED_PLACEMENT') return false;
    if (dateRange === 'TODAY') return e.timestamp && e.timestamp.startsWith(todayStr);
    if (dateRange === 'WEEK') return e.timestamp && e.timestamp >= sevenDaysAgo;
    if (dateRange === 'MONTH') return e.timestamp && e.timestamp >= thirtyDaysAgo;
    return true;
  });

  const totalPlacements = filteredEvents.length;
  const authorizedPlacements = filteredEvents.filter(e => e.event_type === 'AUTHORIZED_PLACEMENT').length;
  const unauthorizedPlacements = filteredEvents.filter(e => e.event_type === 'UNAUTHORIZED_PLACEMENT').length;

  // Authorization rate: authorized / total placements * 100. If total = 0, display N/A!
  const authorizationRate = totalPlacements > 0
    ? `${((authorizedPlacements / totalPlacements) * 100).toFixed(1)}%`
    : 'N/A';

  const handleGenerate = async () => {
    setIsGenerating(true);
    setReportResult(null);
    try {
      const token = adminToken || sessionStorage.getItem('redtag_admin_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ limit: 100 })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReportResult(data);
      } else {
        alert(data.error || 'Report generation failed');
      }
    } catch (err) {
      console.warn('Report generation failed:', err);
      alert('Report generation failed: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    const targetEmail = recipientEmail.trim();
    if (!targetEmail) {
      alert('Please enter a recipient email address.');
      return;
    }

    localStorage.setItem('redtag_report_recipient', targetEmail);
    setEmailStatus('sending');
    setEmailFeedback('');
    try {
      const token = adminToken || sessionStorage.getItem('redtag_admin_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      const res = await fetch('/api/reports/send-email', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: targetEmail,
          event: {
            object_type: 'Compliance Audit Report',
            notes: `Industrial Red Tag Monitoring Report - ${totalPlacements} placements (${authorizationRate} compliance rate). Range: ${dateRange}.`
          }
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailStatus('success');
        setEmailFeedback(`✓ Report successfully dispatched to ${data.recipient || targetEmail}`);
      } else {
        setEmailStatus('error');
        setEmailFeedback(data.error || 'Failed to dispatch report email.');
      }
      setTimeout(() => setEmailStatus(null), 10000);
    } catch (err) {
      setEmailStatus('error');
      setEmailFeedback('Network error while dispatching email: ' + err.message);
      setTimeout(() => setEmailStatus(null), 10000);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header Card */}
      <div className="soc-card" style={{ padding: '20px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              REPORTS & AUDIT SUMMARY
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Operational Compliance Metrics, Excel Audits, and Incident Packages
            </p>
          </div>

          {/* Date Range Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={15} color="var(--text-muted)" />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>RANGE:</span>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '6px 12px' }}
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today Only</option>
              <option value="WEEK">Past 7 Days</option>
              <option value="MONTH">Past 30 Days</option>
            </select>
          </div>
        </div>

        {/* 4 Report Summary KPI Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '14px',
          marginTop: '20px'
        }}>
          {/* Total Placements */}
          <div style={{
            background: 'var(--bg-muted)',
            padding: '16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Total Placements
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              {totalPlacements}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Recorded in selected range
            </div>
          </div>

          {/* Authorized Placements */}
          <div style={{
            background: 'var(--bg-muted)',
            padding: '16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Authorized Placements
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--success)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              {authorizedPlacements}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              RFID verified
            </div>
          </div>

          {/* Unauthorized Placements */}
          <div style={{
            background: 'var(--bg-muted)',
            padding: '16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Unauthorized Placements
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: unauthorizedPlacements > 0 ? 'var(--brand-red)' : 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              {unauthorizedPlacements}
            </div>
            <div style={{ fontSize: '0.72rem', color: unauthorizedPlacements > 0 ? 'var(--brand-red)' : 'var(--text-muted)', marginTop: '2px', fontWeight: unauthorizedPlacements > 0 ? 600 : 400 }}>
              Action required
            </div>
          </div>

          {/* Authorization Rate */}
          <div style={{
            background: 'var(--bg-muted)',
            padding: '16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Authorization Rate
            </div>
            <div style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: authorizationRate === 'N/A' ? 'var(--text-muted)' : (parseFloat(authorizationRate) >= 90 ? 'var(--success)' : 'var(--warning)'),
              marginTop: '4px',
              fontFamily: 'var(--font-mono)'
            }}>
              {authorizationRate}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {totalPlacements === 0 ? 'No data in range' : 'Compliance percentage'}
            </div>
          </div>
        </div>
      </div>

      {/* Compliance Bundle Export Card */}
      <div className="soc-card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Export Incident & Compliance Bundle
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Compiles formatted Excel spreadsheet with object-focused evidence images
            </p>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="btn btn-primary btn-sm"
          >
            <Archive size={14} />
            <span>{isGenerating ? 'Generating Bundle...' : 'Export Report Bundle'}</span>
          </button>
        </div>

        {/* Download Links if Generated */}
        {reportResult && (
          <div style={{
            marginTop: '16px',
            padding: '14px 18px',
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CheckCircle2 size={18} color="var(--success)" />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--success)' }}>
                  Report Generated Successfully ({Math.round((reportResult.bytes || 0) / 1024)} KB)
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Includes Excel audit workbook and strictly object-focused evidence crops.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {reportResult.excelUrl && (
                <a
                  href={reportResult.excelUrl}
                  download
                  className="btn btn-outline btn-xs"
                  style={{ textDecoration: 'none' }}
                >
                  <FileSpreadsheet size={13} color="var(--success)" />
                  <span>Download Excel</span>
                </a>
              )}
              {reportResult.zipUrl && (
                <a
                  href={reportResult.zipUrl}
                  download
                  className="btn btn-success btn-xs"
                  style={{ textDecoration: 'none' }}
                >
                  <Download size={13} />
                  <span>Download ZIP Bundle</span>
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stakeholder Notification Card */}
      <div className="soc-card" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Stakeholder Email Dispatch
        </h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
          Transmit compliance status report to industrial operations management
        </p>

        <div style={{ display: 'flex', gap: '8px', maxWidth: '560px' }}>
          <input
            type="text"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="Enter recipient email (e.g. nishapanneerv@gmail.com)"
            style={{ flex: 1 }}
          />
          <button
            onClick={handleSendEmail}
            disabled={emailStatus === 'sending'}
            className="btn btn-outline btn-sm"
          >
            <Mail size={14} />
            <span>{emailStatus === 'sending' ? 'Sending Report...' : 'Send Report'}</span>
          </button>
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '6px 0 0' }}>
          Dispatches the Excel compliance audit report directly to the email address entered above.
        </p>

        {emailStatus === 'success' && (
          <div style={{
            fontSize: '0.8rem',
            color: 'var(--success-dark)',
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            marginTop: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 600,
            maxWidth: '500px'
          }}>
            <CheckCircle2 size={16} color="var(--success)" />
            <span>{emailFeedback || `✓ Report dispatched to ${recipientEmail}`}</span>
          </div>
        )}

        {emailStatus === 'error' && (
          <div style={{
            fontSize: '0.8rem',
            color: 'var(--brand-red-dark)',
            background: 'var(--brand-red-bg)',
            border: '1px solid var(--brand-red-border)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            marginTop: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 600,
            maxWidth: '500px'
          }}>
            <AlertTriangle size={16} color="var(--brand-red)" />
            <span>{emailFeedback || 'Failed to dispatch report. Please check recipient email and network.'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
