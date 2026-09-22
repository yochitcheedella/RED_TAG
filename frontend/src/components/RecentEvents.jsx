import React, { useState } from 'react';
import {
  ListFilter, ShieldAlert, ShieldCheck, Radio, Eye, Clock, Search, Download
} from 'lucide-react';

const AUTH_STATUS_COLORS = {
  AUTHORIZED:             { bg: 'rgba(16,185,129,0.15)',  text: '#34d399',  label: 'AUTHORIZED' },
  NO_RFID:                { bg: 'rgba(239,68,68,0.15)',   text: '#f87171',  label: 'NOT SCANNED RFID' },
  UNAUTHORIZED_RFID:      { bg: 'rgba(239,68,68,0.15)',   text: '#f87171',  label: 'UNAUTH RFID' },
  EXPIRED_RFID:           { bg: 'rgba(168,85,247,0.15)',  text: '#c084fc',  label: 'EXPIRED' },
  TOKEN_ALREADY_CONSUMED: { bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24',  label: 'CONSUMED' },
  UNKNOWN_CARD:           { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8',  label: 'UNKNOWN' },
};

export default function RecentEvents({ events = [], onSelectEvidence }) {
  const [filter, setFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEvents = events.filter((ev) => {
    if (filter === 'UNAUTHORIZED' && ev.event_type !== 'UNAUTHORIZED_PLACEMENT') return false;
    if (filter === 'AUTHORIZED'   && ev.event_type !== 'AUTHORIZED_PLACEMENT')   return false;
    if (filter === 'RFID'         && ev.event_type !== 'RFID_SCAN')              return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        (ev.object_type         || '').toLowerCase().includes(q) ||
        (ev.employee_name       || '').toLowerCase().includes(q) ||
        (ev.rfid_uid            || '').toLowerCase().includes(q) ||
        (ev.authorization_status|| '').toLowerCase().includes(q) ||
        (ev.id                  || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const exportCSV = () => {
    if (!filteredEvents || filteredEvents.length === 0) return;
    const headers = ['Event ID', 'Timestamp', 'Event Type', 'Authorization Status', 'Alert Status', 'Employee ID', 'Employee Name', 'RFID UID', 'Object Type', 'Confidence', 'Time Diff (s)', 'Evidence File', 'Notes'];
    const rows = filteredEvents.map(ev => [
      `"${ev.id || ''}"`,
      `"${ev.timestamp ? new Date(ev.timestamp).toLocaleString() : ''}"`,
      `"${ev.event_type || ''}"`,
      `"${ev.authorization_status || ''}"`,
      `"${ev.alert_status || ''}"`,
      `"${ev.employee_id || ''}"`,
      `"${(ev.employee_name || '').replace(/"/g, '""')}"`,
      `"${ev.rfid_uid || ''}"`,
      `"${(ev.object_type || '').replace(/"/g, '""')}"`,
      `"${ev.confidence !== undefined ? ev.confidence : ''}"`,
      `"${ev.time_difference !== null && ev.time_difference !== undefined ? ev.time_difference : ''}"`,
      `"${ev.evidence_image || ''}"`,
      `"${(ev.notes || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `redtag_audit_events_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getTypeBadge = (ev) => {
    switch (ev.event_type) {
      case 'AUTHORIZED_PLACEMENT':
        return (
          <span className="badge-green" style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '3px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600
          }}>
            <ShieldCheck size={12} />Authorized
          </span>
        );
      case 'UNAUTHORIZED_PLACEMENT':
        return (
          <span className="badge-red" style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '3px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700
          }}>
            <ShieldAlert size={12} />🚨 Unauthorized
          </span>
        );
      case 'RFID_SCAN':
        return (
          <span className="badge-blue" style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '3px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 500
          }}>
            <Radio size={12} />RFID Scan
          </span>
        );
      default:
        return (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ev.event_type}</span>
        );
    }
  };

  const getAuthChip = (status) => {
    if (!status) return null;
    const cfg = AUTH_STATUS_COLORS[status] || { bg: 'rgba(148,163,184,0.1)', text: '#94a3b8', label: status };
    return (
      <span style={{
        display: 'inline-block',
        background: cfg.bg,
        color: cfg.text,
        fontSize: '0.67rem',
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: '4px',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap'
      }}>
        {cfg.label}
      </span>
    );
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      boxShadow: 'var(--shadow-card)'
    }}>
      {/* Table Header Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={16} color="#94a3b8" />
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9' }}>
            Event Log &amp; Correlation Audit
          </h2>
          <span style={{
            fontSize: '0.7rem',
            background: 'var(--bg-surface)',
            color: 'var(--text-muted)',
            padding: '2px 6px',
            borderRadius: '10px',
            border: '1px solid var(--border-subtle)'
          }}>
            {filteredEvents.length} Events
          </span>
        </div>

        {/* Search + Filters */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search box */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={12} color="#64748b" style={{ position: 'absolute', left: '8px', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                fontSize: '0.75rem',
                padding: '5px 8px 5px 26px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                color: '#e2e8f0',
                width: '160px'
              }}
            />
          </div>

            {/* Filter Chips */}
          <div style={{ display: 'flex', gap: '5px' }}>
            {['ALL', 'UNAUTHORIZED', 'AUTHORIZED', 'RFID'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.72rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  background: filter === f ? '#253043' : 'transparent',
                  color: filter === f ? '#fff' : 'var(--text-secondary)',
                  border: filter === f ? '1px solid #3b82f6' : '1px solid transparent',
                  cursor: 'pointer'
                }}>
                {f}
              </button>
            ))}
          </div>

          {/* Export CSV Button */}
          <button
            onClick={exportCSV}
            title="Export filtered events as CSV"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              fontSize: '0.72rem',
              borderRadius: '6px',
              fontWeight: 600,
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              cursor: 'pointer'
            }}>
            <Download size={12} />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Events Table */}
      <div style={{
        overflowX: 'auto',
        maxHeight: '400px',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Time</th>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Object ID</th>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Result / Alert</th>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Auth Status</th>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Object</th>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>State</th>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>RFID Badge</th>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Employee</th>
              <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  No events found. Live events appear here when items are placed in the Red Tag Area or RFID badges are scanned.
                </td>
              </tr>
            ) : (
              filteredEvents.map((ev) => {
                const timeStr = ev.timestamp
                  ? new Date(ev.timestamp).toLocaleTimeString('en-US', { hour12: false })
                  : '—';
                const isUnauthorized = ev.event_type === 'UNAUTHORIZED_PLACEMENT';
                const trackingId = ev.object_id || ev.tracking_id || (ev.event_type === 'RFID_SCAN' ? '—' : 'TRACK');
                const objectState = ev.object_state || 'PRESENT';

                return (
                  <tr
                    key={ev.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: isUnauthorized ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
                      transition: 'background 0.15s ease'
                    }}>
                    <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {timeStr}
                    </td>
                    <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#38bdf8', whiteSpace: 'nowrap' }}>
                      {trackingId}
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      {getTypeBadge(ev)}
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      {getAuthChip(ev.authorization_status)}
                    </td>
                    <td style={{ padding: '9px 14px', fontWeight: 500, color: '#f1f5f9', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.object_type || '—'}
                    </td>
                    <td style={{ padding: '9px 14px', fontSize: '0.75rem' }}>
                      {ev.event_type === 'RFID_SCAN' ? '—' : (
                        <span style={{
                          color: objectState === 'PRESENT' ? '#34d399' : '#94a3b8',
                          fontWeight: 600,
                          fontSize: '0.72rem'
                        }}>
                          {objectState}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '9px 14px', fontSize: '0.78rem' }}>
                      {(ev.rfid_uid && ev.authorization_status !== 'NO_RFID') ? (
                        <span style={{ fontFamily: 'var(--font-mono)', color: '#60a5fa', fontWeight: 600 }}>
                          {ev.rfid_uid}
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          color: '#f87171',
                          background: 'rgba(239, 68, 68, 0.12)',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          fontSize: '0.71rem',
                          fontWeight: 600,
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          whiteSpace: 'nowrap'
                        }}>
                          Not Scanned RFID
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '9px 14px', color: '#cbd5e1', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(!ev.rfid_uid || ev.authorization_status === 'NO_RFID') ? (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        ev.employee_name || '—'
                      )}
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--text-muted)' }}>
                      {ev.time_difference !== null && ev.time_difference !== undefined
                        ? <span style={{ fontFamily: 'var(--font-mono)', color: '#94a3b8' }}>{ev.time_difference}s</span>
                        : '—'
                      }
                    </td>
                    <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                      {ev.evidence_image ? (
                        <button
                          onClick={() => onSelectEvidence(ev)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            background: isUnauthorized ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            border: isUnauthorized ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                            color: isUnauthorized ? '#f87171' : '#34d399',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}>
                          <Eye size={12} />View
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
