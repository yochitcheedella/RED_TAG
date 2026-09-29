import React from 'react';
import { AlertTriangle, ShieldAlert, Eye, X } from 'lucide-react';

export default function AlertPanel({ alert, onViewEvidence, onDismiss }) {
  if (!alert) return null;

  const event = alert.event || alert;
  const eventId = alert.eventId || event.id || 'EVT-UNAUTH';
  const timestamp = alert.timestamp || event.timestamp || new Date().toISOString();
  const timeStr = new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
  const objectType = alert.objectType || alert.object || event.object_type || 'Placed Object';
  const objectId = alert.objectId || event.object_id || 'OBJ-UNKNOWN';
  const rfidStatus = alert.rfidStatus || alert.reason || event.authorization_status || 'Not detected';
  const employeeStatus = alert.employeeStatus || (alert.employee ? `${alert.employee}` : 'Not detected');
  const areaName = alert.area || 'Red Tag Area';
  const evidenceImage = alert.evidenceImage || event.evidence_image;

  return (
    <div
      role="alert"
      style={{
        background: 'var(--brand-red-bg)',
        border: '1.5px solid var(--brand-red)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        color: 'var(--text-primary)',
        boxShadow: 'var(--shadow-card-elevated)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        position: 'relative',
        zIndex: 30
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            background: 'var(--brand-red)',
            borderRadius: 'var(--radius-sm)',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF'
          }}>
            <ShieldAlert size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--brand-red-dark)', letterSpacing: '0.04em' }}>
              CRITICAL MONITORING ALERT
            </div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--brand-red-dark)', margin: 0, lineHeight: 1.2 }}>
              UNAUTHORIZED PLACEMENT DETECTED
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '0.73rem',
            fontFamily: 'var(--font-mono)',
            background: '#FFFFFF',
            padding: '3px 8px',
            borderRadius: 'var(--radius-xs)',
            border: '1px solid var(--brand-red-border)',
            fontWeight: 600,
            color: 'var(--brand-red-dark)'
          }}>
            {eventId}
          </span>
          {onDismiss && (
            <button
              onClick={onDismiss}
              title="Acknowledge Alert"
              className="btn btn-outline btn-xs"
              style={{
                borderColor: 'var(--brand-red-border)',
                color: 'var(--brand-red-dark)',
                background: '#FFFFFF'
              }}
            >
              <X size={14} />
              <span>Acknowledge</span>
            </button>
          )}
        </div>
      </div>

      {/* Forensic Information Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '12px',
        background: '#FFFFFF',
        padding: '12px 16px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--brand-red-border)'
      }}>
        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
            Time
          </div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {timeStr}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
            Object ID
          </div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {objectId}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
            RFID Status
          </div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--brand-red)' }}>
            {rfidStatus === 'NO_RFID' ? 'Not detected' : rfidStatus}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
            Object Type
          </div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {objectType}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
            Monitored Area
          </div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {areaName}
          </div>
        </div>
      </div>

      {/* Footer Info & Evidence Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <strong>OBJECT-FOCUSED EVIDENCE:</strong> Evidence capture is limited to the placed object within the Red Tag Area.
        </div>

        {evidenceImage && onViewEvidence && (
          <button
            onClick={() => onViewEvidence({
              ...event,
              id: eventId,
              timestamp,
              object_id: objectId,
              object_type: objectType,
              authorization_status: rfidStatus,
              evidence_image: evidenceImage,
              notes: alert.notes || event.notes || 'Unauthorized object placement detected.'
            })}
            className="btn btn-danger btn-sm"
            style={{ fontWeight: 700 }}
          >
            <Eye size={15} />
            <span>View Object Evidence</span>
          </button>
        )}
      </div>
    </div>
  );
}
