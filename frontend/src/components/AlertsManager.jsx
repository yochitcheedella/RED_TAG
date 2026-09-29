import React, { useState, useEffect } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, Eye, Clock, X, Check, Filter, Mail, RefreshCw } from 'lucide-react';

export default function AlertsManager({ onViewEvidence, socket }) {
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [loading, setLoading] = useState(false);
  const [retryingEmailId, setRetryingEmailId] = useState(null);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts?filter=${filter}`);
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Could not fetch alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [filter]);

  useEffect(() => {
    if (!socket) return;

    const handleMailUpdate = (data) => {
      setAlerts(prev => prev.map(alt => {
        if (alt.id === data.alertId || alt.object_event_id === data.eventId) {
          return {
            ...alt,
            email_status: data.status,
            email_sent_at: data.sentAt || alt.email_sent_at,
            email_error: data.failureReason || null
          };
        }
        return alt;
      }));

      setSelectedAlert(curr => {
        if (!curr) return null;
        if (curr.id === data.alertId || curr.object_event_id === data.eventId) {
          return {
            ...curr,
            email_status: data.status,
            email_sent_at: data.sentAt || curr.email_sent_at,
            email_error: data.failureReason || null
          };
        }
        return curr;
      });
    };

    socket.on('mail_status_updated', handleMailUpdate);
    socket.on('placement_unauthorized_alert', fetchAlerts);

    return () => {
      socket.off('mail_status_updated', handleMailUpdate);
      socket.off('placement_unauthorized_alert', fetchAlerts);
    };
  }, [socket]);

  const handleRetryEmail = async (alertId) => {
    setRetryingEmailId(alertId);
    try {
      const res = await fetch(`/api/alerts/${alertId}/retry-email`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        fetchAlerts();
        if (selectedAlert && selectedAlert.id === alertId) {
          setSelectedAlert(prev => ({
            ...prev,
            email_status: data.status || 'SENT',
            email_sent_at: data.job?.sent_at || new Date().toISOString(),
            email_error: null
          }));
        }
      }
    } catch (err) {
      console.warn('Retry email error:', err);
    } finally {
      setRetryingEmailId(null);
    }
  };

  const handleAcknowledge = async (alertId) => {
    try {
      const res = await fetch(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' });
      if (res.ok) {
        fetchAlerts();
        if (selectedAlert && selectedAlert.id === alertId) {
          setSelectedAlert(prev => ({ ...prev, status: 'ACKNOWLEDGED' }));
        }
      }
    } catch (err) {
      console.warn('Acknowledge error:', err);
    }
  };

  const handleResolve = async (alertId) => {
    try {
      const res = await fetch(`/api/alerts/${alertId}/resolve`, { method: 'POST' });
      if (res.ok) {
        fetchAlerts();
        if (selectedAlert && selectedAlert.id === alertId) {
          setSelectedAlert(prev => ({ ...prev, status: 'RESOLVED' }));
        }
      }
    } catch (err) {
      console.warn('Resolve error:', err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header and Filter Controls */}
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
              ALERTS
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Security Incidents and Red Tag Area Violation Tracking
            </p>
          </div>

          {/* Filter Buttons */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`btn btn-sm ${filter === f ? 'btn-outline' : 'btn-ghost'}`}
                style={{
                  fontWeight: 600,
                  borderColor: filter === f ? 'var(--brand-red)' : 'transparent',
                  color: filter === f ? 'var(--brand-red-dark)' : 'var(--text-secondary)',
                  background: filter === f ? 'var(--brand-red-bg)' : 'transparent'
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Alerts Table */}
        <div style={{
          marginTop: '16px',
          overflowX: 'auto',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-sm)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border-medium)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Event ID</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Timestamp</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Object ID</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>RFID Status</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Result</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Evidence</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Notification</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                    <CheckCircle2 size={32} color="var(--success)" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      No alerts found
                    </div>
                    <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                      All monitored placements are currently clear.
                    </div>
                  </td>
                </tr>
              ) : (
                alerts.map((alt) => {
                  const timeStr = alt.timestamp
                    ? new Date(alt.timestamp).toLocaleString()
                    : '—';
                  const isResolved = alt.status === 'RESOLVED';
                  const isAcknowledged = alt.status === 'ACKNOWLEDGED';

                  return (
                    <tr
                      key={alt.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: isResolved ? '#FFFFFF' : (isAcknowledged ? '#FFFBEB' : 'var(--brand-red-bg)'),
                        cursor: 'pointer'
                      }}
                      onClick={() => setSelectedAlert(alt)}
                    >
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {alt.id}
                      </td>

                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {timeStr}
                      </td>

                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {alt.object_id || 'OBJ-UNKNOWN'}
                      </td>

                      <td style={{ padding: '10px 14px', color: alt.rfid_uid ? 'var(--info)' : 'var(--brand-red)', fontWeight: 600 }}>
                        {alt.rfid_uid || 'Not detected'}
                      </td>

                      <td style={{ padding: '10px 14px' }}>
                        <span className="badge badge-danger">
                          <AlertTriangle size={11} />
                          {alt.authorization_status || 'Unauthorized'}
                        </span>
                      </td>

                      <td style={{ padding: '10px 14px' }}>
                        {alt.evidence_image ? (
                          <span className="badge badge-success">Available</span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>No image</span>
                        )}
                      </td>

                      <td style={{ padding: '10px 14px' }}>
                        {alt.email_status === 'SENT' ? (
                          <span className="badge badge-success" title={`Sent: ${alt.email_sent_at || 'Delivered'}`}>
                            ✓ SENT
                          </span>
                        ) : alt.email_status === 'FAILED' ? (
                          <span className="badge badge-danger" title={alt.email_error || 'Delivery failed'}>
                            ⚠ FAILED
                          </span>
                        ) : (
                          <span className="badge badge-outline" style={{ color: 'var(--text-muted)' }}>
                            PENDING
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '10px 14px' }}>
                        <span className={isResolved ? 'badge badge-success' : (isAcknowledged ? 'badge badge-warning' : 'badge badge-danger')}>
                          {alt.status || 'OPEN'}
                        </span>
                      </td>

                      <td style={{ padding: '10px 14px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          {!isAcknowledged && !isResolved && (
                            <button
                              onClick={() => handleAcknowledge(alt.id)}
                              className="btn btn-outline btn-xs"
                              title="Acknowledge alert"
                            >
                              Acknowledge
                            </button>
                          )}
                          {!isResolved && (
                            <button
                              onClick={() => handleResolve(alt.id)}
                              className="btn btn-success btn-xs"
                              title="Resolve alert"
                            >
                              <Check size={11} />
                              Resolve
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedAlert(alt)}
                            className="btn btn-outline btn-xs"
                            title="View alert details"
                          >
                            <Eye size={11} />
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ALERT DETAILS MODAL */}
      {selectedAlert && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(17, 24, 39, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }} onClick={() => setSelectedAlert(null)}>
          <div
            className="soc-card"
            style={{
              width: '100%',
              maxWidth: '560px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: 'var(--shadow-modal)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={20} color="var(--brand-red)" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  ALERT DETAILS
                </h3>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="btn btn-ghost btn-xs"
                style={{ padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Details Fields */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '12px',
              background: 'var(--bg-muted)',
              padding: '14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.8125rem'
            }}>
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Timestamp</span>
                <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                  {selectedAlert.timestamp ? new Date(selectedAlert.timestamp).toLocaleString() : '—'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Event Type</span>
                <div style={{ fontWeight: 600 }}>Unauthorized Placement</div>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Object ID</span>
                <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{selectedAlert.object_id || 'OBJ-UNKNOWN'}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>RFID Status</span>
                <div style={{ fontWeight: 600, color: selectedAlert.rfid_uid ? 'var(--info)' : 'var(--brand-red)' }}>
                  {selectedAlert.rfid_uid || 'Not detected'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Authorization</span>
                <div style={{ fontWeight: 700, color: 'var(--brand-red)' }}>{selectedAlert.authorization_status || 'Unauthorized'}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>ROI</span>
                <div style={{ fontWeight: 600 }}>Red Tag Area</div>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Detection Duration</span>
                <div style={{ fontWeight: 600 }}>5.0 seconds (Debounced)</div>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Alert Status</span>
                <div>
                  <span className={selectedAlert.status === 'RESOLVED' ? 'badge badge-success' : (selectedAlert.status === 'ACKNOWLEDGED' ? 'badge badge-warning' : 'badge badge-danger')}>
                    {selectedAlert.status || 'OPEN'}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 13: Dashboard Mail Status & Audit Card (Requirement 13) */}
            <div style={{
              background: selectedAlert.email_status === 'FAILED' ? '#FEF2F2' : (selectedAlert.email_status === 'SENT' ? '#F0FDF4' : 'var(--bg-muted)'),
              border: `1px solid ${selectedAlert.email_status === 'FAILED' ? '#FCA5A5' : (selectedAlert.email_status === 'SENT' ? '#BBF7D0' : 'var(--border-subtle)')}`,
              borderRadius: 'var(--radius-sm)',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                  NOTIFICATION AUDIT
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem' }}>
                  <span style={{
                    fontWeight: 700,
                    color: selectedAlert.email_status === 'SENT' ? 'var(--success)' : (selectedAlert.email_status === 'FAILED' ? 'var(--brand-red)' : 'var(--warning)')
                  }}>
                    Email: {selectedAlert.email_status === 'SENT' ? '✓ SENT' : (selectedAlert.email_status === 'FAILED' ? '⚠ FAILED' : '⏳ PENDING')}
                  </span>
                  {selectedAlert.email_sent_at && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      Sent: {new Date(selectedAlert.email_sent_at).toLocaleTimeString()}
                    </span>
                  )}
                  {selectedAlert.email_error && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--brand-red)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedAlert.email_error}>
                      Reason: {selectedAlert.email_error}
                    </span>
                  )}
                </div>
              </div>

              {/* Requirement 13: [ RETRY EMAIL ] Button */}
              <button
                onClick={() => handleRetryEmail(selectedAlert.id)}
                disabled={retryingEmailId === selectedAlert.id}
                className="btn btn-outline btn-xs"
                style={{
                  borderColor: selectedAlert.email_status === 'FAILED' ? 'var(--brand-red)' : 'var(--border-medium)',
                  color: selectedAlert.email_status === 'FAILED' ? 'var(--brand-red-dark)' : 'var(--text-secondary)',
                  fontWeight: 700
                }}
                title="Manually retry dispatching incident email with actual evidence crop"
              >
                {retryingEmailId === selectedAlert.id ? (
                  <span>Retrying...</span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <RefreshCw size={11} />
                    RETRY EMAIL
                  </span>
                )}
              </button>
            </div>

            {/* Evidence Image Preview */}
            {selectedAlert.evidence_image && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Object Evidence Photo
                </div>
                <div style={{
                  maxHeight: '220px',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                  border: '1px solid var(--border-medium)',
                  background: '#0F172A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <img
                    src={`/evidence/${selectedAlert.evidence_image}`}
                    alt="Object Evidence"
                    style={{ maxHeight: '220px', maxWidth: '100%', objectFit: 'contain' }}
                  />
                </div>
              </div>
            )}

            {/* Real Action Buttons */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              paddingTop: '10px',
              borderTop: '1px solid var(--border-subtle)'
            }}>
              {selectedAlert.status !== 'ACKNOWLEDGED' && selectedAlert.status !== 'RESOLVED' && (
                <button
                  onClick={() => handleAcknowledge(selectedAlert.id)}
                  className="btn btn-outline btn-sm"
                >
                  Acknowledge
                </button>
              )}

              {selectedAlert.status !== 'RESOLVED' && (
                <button
                  onClick={() => handleResolve(selectedAlert.id)}
                  className="btn btn-success btn-sm"
                >
                  <Check size={14} />
                  <span>Resolve Alert</span>
                </button>
              )}

              <button
                onClick={() => setSelectedAlert(null)}
                className="btn btn-ghost btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
