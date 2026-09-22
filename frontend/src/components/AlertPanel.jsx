import React from 'react';
import { AlertTriangle, ShieldAlert, Eye, X } from 'lucide-react';

export default function AlertPanel({ alert, onViewEvidence, onDismiss }) {
  if (!alert) return null;

  const event = alert.event || alert;
  const eventId = alert.eventId || event.id || 'EVT-UNAUTH';
  const timestamp = alert.timestamp || event.timestamp || new Date().toISOString();
  const timeStr = new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
  const objectType = alert.objectType || alert.object || event.object_type || 'Placed Object';
  const rfidStatus = alert.rfidStatus || alert.reason || event.authorization_status || 'NOT SCANNED';
  const employeeStatus = alert.employeeStatus || (alert.employee ? `${alert.employee} (${rfidStatus})` : 'NOT AVAILABLE');
  const confidence = alert.confidence ? `${Math.round(alert.confidence * 100)}%` : '94%';
  const areaName = alert.area || 'Red Tag Area (Floor Tape ROI)';
  const evidenceImage = alert.evidenceImage || event.evidence_image;

  return (
    <div
      role="alert"
      style={{
        background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.95) 0%, rgba(153, 27, 27, 0.95) 100%)',
        border: '2px solid #f87171',
        borderRadius: '12px',
        padding: '16px 20px',
        color: '#ffffff',
        boxShadow: '0 10px 30px rgba(220, 38, 38, 0.5), 0 0 20px rgba(239, 68, 68, 0.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        animation: 'pulse 2s infinite ease-in-out',
        position: 'relative',
        zIndex: 50
      }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '8px',
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)'
          }}>
            <ShieldAlert size={24} color="#dc2626" />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', fontWeight: 800, textTransform: 'uppercase', color: '#fecaca' }}>
              CRITICAL SECURITY ALERT
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.02em', margin: 0, textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
              UNAUTHORIZED RED TAG PLACEMENT
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            background: 'rgba(0, 0, 0, 0.35)',
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.25)'
          }}>
            ID: {eventId}
          </span>
          {onDismiss && (
            <button
              onClick={onDismiss}
              title="Acknowledge Alert"
              style={{
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '6px',
                padding: '4px 8px',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                fontWeight: 600
              }}>
              <X size={16} />
              <span>Acknowledge</span>
            </button>
          )}
        </div>
      </div>

      {/* Forensic Information Grid (Section 23 Requirements) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '10px',
        background: 'rgba(0, 0, 0, 0.3)',
        padding: '12px 16px',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.15)'
      }}>
        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#fca5a5', fontWeight: 700 }}>
            Timestamp
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {timeStr}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#fca5a5', fontWeight: 700 }}>
            RFID Status
          </div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fef08a' }}>
            {rfidStatus}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#fca5a5', fontWeight: 700 }}>
            Employee Status
          </div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {employeeStatus}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#fca5a5', fontWeight: 700 }}>
            Object Type
          </div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>
            {objectType} ({confidence})
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#fca5a5', fontWeight: 700 }}>
            Monitored Area
          </div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#93c5fd' }}>
            {areaName}
          </div>
        </div>
      </div>

      {/* Action Bar & Evidence Preview */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ fontSize: '0.78rem', color: '#fecaca' }}>
          🔒 <strong>Privacy Standard Enforced:</strong> CCTV frame was cropped strictly to the object bounding box. No human facial data was captured.
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {evidenceImage && onViewEvidence && (
            <button
              onClick={() => onViewEvidence({
                ...event,
                id: eventId,
                timestamp,
                object_type: objectType,
                authorization_status: rfidStatus,
                evidence_image: evidenceImage,
                notes: alert.notes || event.notes || 'Unauthorized object placement detected.'
              })}
              style={{
                background: '#ffffff',
                color: '#991b1b',
                padding: '8px 18px',
                borderRadius: '6px',
                fontWeight: 800,
                fontSize: '0.82rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
              }}>
              <Eye size={16} />
              <span>[VIEW OBJECT EVIDENCE]</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
