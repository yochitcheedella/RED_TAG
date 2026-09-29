import React, { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, ShieldCheck, Download, AlertOctagon, Info, ImageOff, Mail, RefreshCw } from 'lucide-react';

export default function EvidenceModal({ event, onClose }) {
  const [zoomLevel, setZoomLevel] = useState(1.5);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [isHovering, setIsHovering] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const imgContainerRef = useRef(null);

  if (!event) return null;

  const evidenceFile = event.evidence_image || event.evidenceImage || event.evidence_image_path || event.evidenceImagePath;
  const baseFilename = evidenceFile ? evidenceFile.split(/[/\\]/).pop() : null;

  useEffect(() => {
    setImgError(false);
    setRetryCount(0);
  }, [event?.id, baseFilename]);

  const imageUrl = baseFilename ? `/evidence/${baseFilename}${retryCount > 0 ? `?t=${retryCount}` : ''}` : null;

  const handleImageError = () => {
    if (retryCount < 2) {
      setTimeout(() => {
        setRetryCount(r => r + 1);
        setImgError(false);
      }, 400);
    } else {
      setImgError(true);
    }
  };
  const eventId = event.id || event.eventId || 'EVT-UNKNOWN';
  const timeStr = event.timestamp
    ? new Date(event.timestamp).toLocaleString()
    : new Date().toLocaleString();

  const isAuth = event.event_type === 'AUTHORIZED_PLACEMENT' || event.authorization_status === 'AUTHORIZED';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(17, 24, 39, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }} onClick={onClose}>
      <div
        className="soc-card"
        style={{
          width: '100%',
          maxWidth: '680px',
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{
          background: '#FFFFFF',
          borderBottom: '1px solid var(--border-medium)',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-sm)',
              background: isAuth ? 'var(--success-bg)' : 'var(--brand-red-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {isAuth ? <ShieldCheck size={18} color="var(--success)" /> : <AlertOctagon size={18} color="var(--brand-red)" />}
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                PLACEMENT EVIDENCE
              </h3>
              <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {eventId} • {isAuth ? 'Authorized Placement' : 'Unauthorized Placement'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-xs" style={{ padding: '6px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Privacy Notice Banner (Section 22: OBJECT-FOCUSED EVIDENCE) */}
          <div style={{
            background: 'var(--bg-muted)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <ShieldCheck size={18} color="var(--success)" />
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <strong>OBJECT-FOCUSED EVIDENCE:</strong> Evidence capture is limited to the placed object within the Red Tag Area.
            </div>
          </div>

          {/* Image Inspection Area */}
          <div
            style={{
              background: '#0F172A',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              position: 'relative',
              height: '320px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: imgError ? 'default' : 'crosshair'
            }}
            ref={imgContainerRef}
            onMouseEnter={() => !imgError && setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onMouseMove={(e) => {
              if (!imgContainerRef.current || imgError) return;
              const rect = imgContainerRef.current.getBoundingClientRect();
              setMousePos({
                x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
                y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
              });
            }}
          >
            {!imageUrl || imgError ? (
              <div style={{ textAlign: 'center', color: '#94A3B8', padding: '20px' }}>
                <ImageOff size={42} style={{ marginBottom: '10px', opacity: 0.5 }} />
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Evidence image unavailable
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                  {baseFilename || 'No evidence file recorded'}
                </div>
                {baseFilename && (
                  <button
                    type="button"
                    onClick={() => {
                      setImgError(false);
                      setRetryCount(r => r + 1);
                    }}
                    className="btn btn-outline btn-xs"
                    style={{ marginTop: '12px', color: '#E2E8F0', borderColor: '#475569', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <RefreshCw size={12} />
                    <span>Reload Evidence Image</span>
                  </button>
                )}
              </div>
            ) : (
              <img
                key={imageUrl}
                src={imageUrl}
                alt={event.object_type || 'Placed Object'}
                onError={handleImageError}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  transformOrigin: `${mousePos.x}% ${mousePos.y}%`,
                  transform: isHovering ? `scale(${zoomLevel})` : 'scale(1)',
                  transition: isHovering ? 'transform 0.05s ease-out' : 'transform 0.2s ease'
                }}
              />
            )}

            {/* Zoom Controls Overlay */}
            <div style={{
              position: 'absolute',
              bottom: '12px',
              right: '12px',
              background: 'rgba(15, 23, 42, 0.85)',
              borderRadius: 'var(--radius-xs)',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <button
                onClick={() => setZoomLevel(z => Math.max(1.2, z - 0.5))}
                style={{ color: '#E2E8F0' }}
                title="Zoom Out"
              >
                <ZoomOut size={13} />
              </button>
              <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#FFFFFF' }}>
                {zoomLevel.toFixed(1)}x
              </span>
              <button
                onClick={() => setZoomLevel(z => Math.min(3.5, z + 0.5))}
                style={{ color: '#E2E8F0' }}
                title="Zoom In"
              >
                <ZoomIn size={13} />
              </button>
            </div>
          </div>

          {/* Forensic Metadata Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '12px',
            background: 'var(--bg-muted)',
            padding: '14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.8125rem'
          }}>
            <div>
              <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>EVENT ID</span>
              <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{eventId}</div>
            </div>

            <div>
              <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>TIMESTAMP</span>
              <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{timeStr}</div>
            </div>

            <div>
              <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>OBJECT ID</span>
              <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{event.object_id || event.tracking_id || 'OBJ-UNKNOWN'}</div>
            </div>

            <div>
              <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>RFID</span>
              <div style={{ fontWeight: 600, color: (event.rfid_uid && event.authorization_status !== 'NO_RFID') ? 'var(--info)' : 'var(--brand-red)' }}>
                {(event.rfid_uid && event.authorization_status !== 'NO_RFID') ? (event.employee_name ? `${event.employee_name} (${event.rfid_uid})` : event.rfid_uid) : 'Not detected'}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>AUTHORIZATION</span>
              <div style={{ fontWeight: 700, color: isAuth ? 'var(--success)' : 'var(--brand-red)' }}>
                {isAuth ? 'AUTHORIZED' : 'UNAUTHORIZED'}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
                {isAuth ? 'STATUS' : 'ALERT'}
              </span>
              <div style={{ fontWeight: 700, color: isAuth ? 'var(--success)' : (event.alert_status === 'RESOLVED' ? 'var(--success)' : 'var(--brand-red)') }}>
                {isAuth ? 'Recorded' : (event.alert_status || 'OPEN')}
              </div>
            </div>
          </div>

          {/* Notes */}
          {event.notes && (
            <div style={{
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              background: isAuth ? 'var(--success-bg)' : 'var(--brand-red-bg)',
              borderLeft: `3px solid ${isAuth ? 'var(--success)' : 'var(--brand-red)'}`,
              padding: '8px 12px',
              borderRadius: '0 var(--radius-xs) var(--radius-xs) 0'
            }}>
              {event.notes}
            </div>
          )}

          {/* Incident Email Dispatch Status */}
          {!isAuth && (
            <div style={{
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              background: '#F8FAFC',
              border: '1px solid var(--border-subtle)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-xs)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mail size={13} color="var(--brand-red)" />
                <span>
                  <strong>INCIDENT EMAIL:</strong> Forensic crop embedded & attached to <em>{event.recipient || 'yochitcheedella@gmail.com'}</em>
                </span>
              </div>
              <span className="badge badge-success" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                AUTOMATED DISPATCH
              </span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          background: '#FFFFFF',
          borderTop: '1px solid var(--border-medium)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          {imageUrl && (
            <a
              href={imageUrl}
              download={`evidence_${eventId}.jpg`}
              className="btn btn-outline btn-sm"
              style={{ textDecoration: 'none' }}
            >
              <Download size={14} />
              <span>Download Image</span>
            </a>
          )}
          <button onClick={onClose} className="btn btn-primary btn-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
