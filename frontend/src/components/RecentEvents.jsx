import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, Radio, Eye, Clock, Search, Download, Camera } from 'lucide-react';

export default function RecentEvents({ events = [], onSelectEvidence, title = 'RECENT EVENTS' }) {
  const [filter, setFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEvents = events.filter((ev) => {
    if (filter === 'UNAUTHORIZED' && ev.event_type !== 'UNAUTHORIZED_PLACEMENT') return false;
    if (filter === 'AUTHORIZED' && ev.event_type !== 'AUTHORIZED_PLACEMENT') return false;
    if (filter === 'RFID' && ev.event_type !== 'RFID_SCAN') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        (ev.object_type || '').toLowerCase().includes(q) ||
        (ev.employee_name || '').toLowerCase().includes(q) ||
        (ev.rfid_uid || '').toLowerCase().includes(q) ||
        (ev.authorization_status || '').toLowerCase().includes(q) ||
        (ev.object_id || '').toLowerCase().includes(q) ||
        (ev.id || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const exportCSV = () => {
    if (!filteredEvents || filteredEvents.length === 0) return;
    const headers = ['Time', 'Event', 'Object ID', 'RFID', 'Result', 'Status', 'Employee', 'Evidence'];
    const rows = filteredEvents.map(ev => [
      `"${ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString('en-US', { hour12: false }) : ''}"`,
      `"${ev.event_type === 'RFID_SCAN' ? 'RFID Scan' : 'Object Placement'}"`,
      `"${ev.object_id || '—'}"`,
      `"${ev.rfid_uid || 'Not detected'}"`,
      `"${ev.authorization_status === 'AUTHORIZED' ? 'Authorized' : 'Unauthorized'}"`,
      `"${ev.alert_status === 'ALERT_TRIGGERED' || ev.authorization_status !== 'AUTHORIZED' ? 'Open' : 'Resolved'}"`,
      `"${(ev.employee_name || '—').replace(/"/g, '""')}"`,
      `"${ev.evidence_image || ''}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `redtag_events_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="soc-card" style={{
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }}>
      {/* Table Header Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={16} color="var(--text-muted)" />
          <h2 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0 }}>
            {title}
          </h2>
          <span style={{
            fontSize: '0.72rem',
            background: 'var(--bg-muted)',
            color: 'var(--text-muted)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-xs)',
            fontWeight: 600,
            border: '1px solid var(--border-subtle)'
          }}>
            {filteredEvents.length} events
          </span>
        </div>

        {/* Search + Filters + CSV */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search box */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} color="var(--text-dim)" style={{ position: 'absolute', left: '8px', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                fontSize: '0.75rem',
                padding: '6px 10px 6px 28px',
                width: '160px'
              }}
            />
          </div>

          {/* Filter Buttons */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {['ALL', 'UNAUTHORIZED', 'AUTHORIZED', 'RFID'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`btn btn-xs ${filter === f ? 'btn-outline' : 'btn-ghost'}`}
                style={{
                  fontWeight: 600,
                  borderColor: filter === f ? 'var(--info)' : 'transparent',
                  color: filter === f ? 'var(--info)' : 'var(--text-secondary)'
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Export CSV */}
          <button
            onClick={exportCSV}
            title="Export events as CSV"
            className="btn btn-outline btn-xs"
            disabled={filteredEvents.length === 0}
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Events Table (Section 12 Columns: Time, Event, Object ID, RFID, Result, Status) */}
      <div style={{
        overflowX: 'auto',
        maxHeight: '440px',
        border: '1px solid var(--border-medium)',
        borderRadius: 'var(--radius-sm)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{
              background: 'var(--bg-muted)',
              borderBottom: '1px solid var(--border-medium)',
              color: 'var(--text-secondary)',
              position: 'sticky',
              top: 0,
              zIndex: 1
            }}>
              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Time</th>
              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Event</th>
              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Object ID</th>
              <th style={{ padding: '10px 14px', fontWeight: 700 }}>RFID</th>
              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Result</th>
              <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'center' }}>Evidence</th>
              <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    No events found.
                  </div>
                  <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                    Live events will appear here when monitoring activity occurs.
                  </div>
                </td>
              </tr>
            ) : (
              filteredEvents.map((ev) => {
                const timeStr = ev.timestamp
                  ? new Date(ev.timestamp).toLocaleTimeString('en-US', { hour12: false })
                  : '—';
                const isAuth = ev.authorization_status === 'AUTHORIZED';
                const isUnauthorized = ev.event_type === 'UNAUTHORIZED_PLACEMENT' || (!isAuth && ev.event_type !== 'RFID_SCAN');
                const trackingId = ev.object_id || ev.tracking_id || (ev.event_type === 'RFID_SCAN' ? '—' : 'OBJ-1000');
                const eventName = ev.event_type === 'RFID_SCAN' ? 'RFID Scan' : 'Object Placement';
                const rfidDisplay = (ev.rfid_uid && ev.authorization_status !== 'NO_RFID') ? ev.rfid_uid : 'Not detected';
                const resultDisplay = isAuth ? 'Authorized' : (ev.event_type === 'RFID_SCAN' ? 'Scanned' : 'Unauthorized');
                const statusDisplay = isUnauthorized
                  ? (ev.alert_status === 'RESOLVED' ? 'Resolved' : 'Open')
                  : (isAuth ? 'Recorded' : 'Resolved');

                const hasEvidence = !!(ev.evidence_image || ev.evidenceImage);

                return (
                  <tr
                    key={ev.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: isUnauthorized ? 'var(--brand-red-bg)' : '#FFFFFF',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {timeStr}
                    </td>

                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {eventName}
                    </td>

                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      {trackingId}
                    </td>

                    <td style={{ padding: '10px 14px', fontSize: '0.78rem' }}>
                      {rfidDisplay === 'Not detected' ? (
                        <span style={{ color: 'var(--text-muted)' }}>Not detected</span>
                      ) : (
                        <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--info)' }}>
                          {rfidDisplay}
                        </code>
                      )}
                    </td>

                    <td style={{ padding: '10px 14px' }}>
                      <span className={isAuth ? 'badge badge-success' : (isUnauthorized ? 'badge badge-danger' : 'badge badge-info')}>
                        {isAuth ? <ShieldCheck size={11} /> : (isUnauthorized ? <ShieldAlert size={11} /> : <Radio size={11} />)}
                        {resultDisplay}
                      </span>
                    </td>

                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {hasEvidence ? (
                        <button
                          onClick={() => onSelectEvidence(ev)}
                          className={isUnauthorized ? 'btn btn-danger btn-xs' : 'btn btn-outline btn-xs'}
                          style={{ padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          title="View object evidence"
                        >
                          <Camera size={12} />
                          <span>View</span>
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: statusDisplay === 'Open' ? 'var(--brand-red)' : 'var(--success)'
                      }}>
                        {statusDisplay}
                      </span>
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
