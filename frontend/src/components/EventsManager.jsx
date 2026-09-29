import React, { useState } from 'react';
import { FileText, Search, Download, ShieldCheck, ShieldAlert, Radio, Eye, Filter, Calendar, Camera } from 'lucide-react';

export default function EventsManager({ events = [], onSelectEvidence }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [authFilter, setAuthFilter] = useState('ALL'); // ALL, AUTHORIZED, UNAUTHORIZED, RFID_MISSING, RFID_INVALID
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, OPEN, RESOLVED
  const [dateFilter, setDateFilter] = useState('ALL'); // ALL, TODAY, WEEK

  const todayStr = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const filteredEvents = events.filter((ev) => {
    // Date filtering
    if (dateFilter === 'TODAY' && (!ev.timestamp || !ev.timestamp.startsWith(todayStr))) return false;
    if (dateFilter === 'WEEK' && (!ev.timestamp || ev.timestamp < sevenDaysAgo)) return false;

    // Authorization filtering
    if (authFilter === 'AUTHORIZED' && ev.authorization_status !== 'AUTHORIZED') return false;
    if (authFilter === 'UNAUTHORIZED' && (ev.authorization_status === 'AUTHORIZED' || ev.event_type === 'RFID_SCAN')) return false;
    if (authFilter === 'RFID_MISSING' && ev.authorization_status !== 'NO_RFID') return false;
    if (authFilter === 'RFID_INVALID' && !['UNAUTHORIZED_RFID', 'EXPIRED_RFID', 'TOKEN_ALREADY_CONSUMED'].includes(ev.authorization_status)) return false;

    // Status filtering
    const isOpen = ev.alert_status === 'ALERT_TRIGGERED' || (ev.authorization_status !== 'AUTHORIZED' && ev.event_type !== 'RFID_SCAN');
    if (statusFilter === 'OPEN' && !isOpen) return false;
    if (statusFilter === 'RESOLVED' && isOpen) return false;

    // Search query
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
    const headers = ['Time', 'Event', 'Object ID', 'RFID', 'Result', 'Status', 'Employee', 'Notes'];
    const rows = filteredEvents.map(ev => [
      `"${ev.timestamp ? new Date(ev.timestamp).toLocaleString() : ''}"`,
      `"${ev.event_type || ''}"`,
      `"${ev.object_id || '—'}"`,
      `"${ev.rfid_uid || 'Not detected'}"`,
      `"${ev.authorization_status || ''}"`,
      `"${ev.alert_status === 'ALERT_TRIGGERED' ? 'Open' : 'Resolved'}"`,
      `"${(ev.employee_name || '—').replace(/"/g, '""')}"`,
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="soc-card" style={{ padding: '20px' }}>
        {/* Header & Export */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              EVENTS
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Comprehensive Audit Trail of Placements, RFID Verifications, and Access Activity
            </p>
          </div>

          <button
            onClick={exportCSV}
            className="btn btn-outline btn-sm"
            disabled={filteredEvents.length === 0}
          >
            <Download size={14} />
            <span>Export CSV Report</span>
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          marginTop: '16px',
          padding: '12px 14px',
          background: 'var(--bg-muted)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)'
        }}>
          {/* Search box */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: '220px' }}>
            <Search size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '10px', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search by ID, UID, object..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '32px'
              }}
            />
          </div>

          {/* Date Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>DATE:</span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{ fontSize: '0.75rem', padding: '6px 10px' }}
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today Only</option>
              <option value="WEEK">Past 7 Days</option>
            </select>
          </div>

          {/* Authorization Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>AUTHORIZATION:</span>
            <select
              value={authFilter}
              onChange={(e) => setAuthFilter(e.target.value)}
              style={{ fontSize: '0.75rem', padding: '6px 10px' }}
            >
              <option value="ALL">All Authorizations</option>
              <option value="AUTHORIZED">Authorized</option>
              <option value="UNAUTHORIZED">Unauthorized</option>
              <option value="RFID_MISSING">RFID Missing (No RFID)</option>
              <option value="RFID_INVALID">RFID Invalid / Expired</option>
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>STATUS:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ fontSize: '0.75rem', padding: '6px 10px' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open Incidents</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>

          <span style={{
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            marginLeft: 'auto',
            fontWeight: 600
          }}>
            Showing {filteredEvents.length} records
          </span>
        </div>

        {/* Events Table */}
        <div style={{
          marginTop: '16px',
          overflowX: 'auto',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-sm)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border-medium)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Time</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Event</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Object ID</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>RFID UID</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Employee</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Result</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
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
                  const isAuth = ev.authorization_status === 'AUTHORIZED';
                  const isUnauthorized = ev.event_type === 'UNAUTHORIZED_PLACEMENT' || (!isAuth && ev.event_type !== 'RFID_SCAN');
                  const statusDisplay = isUnauthorized
                    ? (ev.alert_status === 'RESOLVED' ? 'Resolved' : 'Open')
                    : (isAuth ? 'Recorded' : 'Resolved');

                  const hasEvidence = !!(ev.evidence_image || ev.evidenceImage);

                  return (
                    <tr
                      key={ev.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: isUnauthorized ? 'var(--brand-red-bg)' : '#FFFFFF'
                      }}
                    >
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '—'}
                      </td>

                      <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {ev.event_type === 'RFID_SCAN' ? 'RFID Scan' : 'Object Placement'}
                      </td>

                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {ev.object_id || '—'}
                      </td>

                      <td style={{ padding: '10px 14px' }}>
                        {ev.rfid_uid ? (
                          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--info)' }}>{ev.rfid_uid}</code>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Not detected</span>
                        )}
                      </td>

                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        {ev.employee_name || '—'}
                      </td>

                      <td style={{ padding: '10px 14px' }}>
                        <span className={isAuth ? 'badge badge-success' : (isUnauthorized ? 'badge badge-danger' : 'badge badge-info')}>
                          {isAuth ? <ShieldCheck size={11} /> : (isUnauthorized ? <ShieldAlert size={11} /> : <Radio size={11} />)}
                          {isAuth ? 'Authorized' : (ev.event_type === 'RFID_SCAN' ? 'Scanned' : 'Unauthorized')}
                        </span>
                      </td>

                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: statusDisplay === 'Open' ? 'var(--brand-red)' : 'var(--success)'
                        }}>
                          {statusDisplay}
                        </span>
                      </td>

                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {hasEvidence ? (
                          <button
                            onClick={() => onSelectEvidence?.(ev)}
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
