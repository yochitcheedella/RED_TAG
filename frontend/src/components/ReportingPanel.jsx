import React, { useState } from 'react';
import { FileSpreadsheet, Archive, Send, Mail, CheckCircle2, Download, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function ReportingPanel({ onGenerateReports }) {
  const [recipientEmail, setRecipientEmail] = useState('plant-manager@factory.com');
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [teamsStatus, setTeamsStatus] = useState(null);
  const [emailStatus, setEmailStatus] = useState(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setReportResult(null);
    try {
      const res = await fetch('/api/reports/generate', { method: 'POST' });
      const data = await res.json();
      setReportResult(data);
    } catch (err) {
      console.warn('Report generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendTeams = async () => {
    setTeamsStatus('sending');
    try {
      const res = await fetch('/api/reports/send-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            object_type: 'Machine Part (Ground Placed)',
            rfid_uid: 'None',
            event_type: 'UNAUTHORIZED_PLACEMENT',
            notes: 'Item stationary inside red-and-blue floor-tape polygon for >60 seconds without RFID.'
          }
        })
      });
      const data = await res.json();
      setTeamsStatus(data.success ? 'success' : 'error');
      setTimeout(() => setTeamsStatus(null), 3000);
    } catch {
      setTeamsStatus('error');
    }
  };

  const handleSendEmail = async () => {
    setEmailStatus('sending');
    try {
      const res = await fetch('/api/reports/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recipientEmail,
          event: {
            object_type: 'Machine Part',
            notes: 'Incident verified via floor-tape polygon footprint analysis.'
          }
        })
      });
      const data = await res.json();
      setEmailStatus(data.success ? 'success' : 'error');
      setTimeout(() => setEmailStatus(null), 3000);
    } catch {
      setEmailStatus('error');
    }
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '18px',
      boxShadow: 'var(--shadow-card)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FileSpreadsheet size={20} color="#10b981" />
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#f1f5f9' }}>
              Automated Incident Reporting & Stakeholder Alerts
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Dynamic Excel Generation, Zero-Human ZIP Bundling, and Teams/Email Integration
            </p>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '6px',
            background: '#2563eb',
            color: '#fff',
            fontSize: '0.8rem',
            fontWeight: 600
          }}>
          <Archive size={14} />
          {isGenerating ? 'Compiling Bundle...' : 'Generate New Compliance Bundle'}
        </button>
      </div>

      {/* Generated Report Result Banner */}
      {reportResult && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 size={20} color="#34d399" />
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9' }}>
                Compliance Bundle Generated ({Math.round((reportResult.bytes || 0) / 1024)} KB)
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Includes formatted Excel audit workbook and strictly cropped object evidence photos.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <a
              href={reportResult.excelUrl}
              download={reportResult.excelFilename}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                fontSize: '0.75rem',
                fontWeight: 600,
                textDecoration: 'none'
              }}>
              <FileSpreadsheet size={13} />
              Download Excel (.xlsx)
            </a>

            <a
              href={reportResult.zipUrl}
              download={reportResult.zipFilename}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: '#10b981',
                color: '#fff',
                fontSize: '0.75rem',
                fontWeight: 600,
                textDecoration: 'none'
              }}>
              <Download size={13} />
              Download Full ZIP
            </a>
          </div>
        </div>
      )}

      {/* Grid: Teams Webhook & Email Dispatches */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '16px'
      }}>
        {/* Microsoft Teams Channel Alerts */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Send size={16} color="#60a5fa" />
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f1f5f9' }}>
              Microsoft Teams Group Alerts
            </h3>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Automatically pushes Adaptive Card incident alerts directly to plant operations and safety response Teams channels.
          </p>

          <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
            <button
              onClick={handleSendTeams}
              disabled={teamsStatus === 'sending'}
              style={{
                width: '100%',
                padding: '8px 14px',
                borderRadius: '6px',
                background: teamsStatus === 'success' ? '#10b981' : 'rgba(59, 130, 246, 0.15)',
                color: teamsStatus === 'success' ? '#fff' : '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                fontSize: '0.78rem',
                fontWeight: 600
              }}>
              {teamsStatus === 'sending' ? 'Dispatching...' :
               teamsStatus === 'success' ? '✓ Alert Dispatched to Teams!' :
               'Test Teams Webhook Alert'}
            </button>
          </div>
        </div>

        {/* Nodemailer Email Reports */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={16} color="#f59e0b" />
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f1f5f9' }}>
              Nodemailer Management Email Dispatch
            </h3>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Transmits the encrypted/clean ZIP compliance archive directly to plant managers and audit personnel.
          </p>

          <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="Recipient Email..."
              style={{ flex: 1, fontSize: '0.75rem' }}
            />
            <button
              onClick={handleSendEmail}
              disabled={emailStatus === 'sending'}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                background: emailStatus === 'success' ? '#10b981' : '#f59e0b',
                color: '#fff',
                fontSize: '0.78rem',
                fontWeight: 600
              }}>
              {emailStatus === 'sending' ? 'Sending...' :
               emailStatus === 'success' ? '✓ Dispatched' :
               'Send Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
