import React, { useState, useRef } from 'react';
import { X, ZoomIn, ZoomOut, ShieldCheck, Download, AlertOctagon, Info, ImageOff } from 'lucide-react';

export default function EvidenceModal({ event, onClose }) {
  const [zoomLevel, setZoomLevel] = useState(1.5);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [isHovering, setIsHovering] = useState(false);
  const [imgError, setImgError] = useState(false);
  const imgContainerRef = useRef(null);

  if (!event) return null;

  const evidenceFile = event.evidence_image || event.evidenceImage;
  const imageUrl = evidenceFile ? `/evidence/${evidenceFile}` : null;
  const eventId = event.id || event.eventId || 'EVT-UNKNOWN';
  const timeStr = event.timestamp
    ? new Date(event.timestamp).toLocaleString()
    : new Date().toLocaleString();

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        width: '100%',
        maxWidth: '680px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div style={{
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {(() => {
            const isAuth = event.event_type === 'AUTHORIZED_PLACEMENT' || event.authorization_status === 'AUTHORIZED';
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isAuth ? <ShieldCheck size={20} color="#34d399" /> : <AlertOctagon size={20} color="#ef4444" />}
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', lineHeight: 1.2 }}>
                    {isAuth ? 'Authorized Placement Verification' : 'Unauthorized Object Evidence Inspector'}
                  </h3>
                  <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {eventId}
                  </span>
                </div>
              </div>
            );
          })()}
          <button
            onClick={onClose}
            style={{ color: 'var(--text-secondary)', background: 'transparent', borderRadius: '6px', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Privacy Notice Banner */}
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <ShieldCheck size={18} color="#34d399" />
            <div style={{ fontSize: '0.78rem', color: '#a7f3d0' }}>
              <strong>Zero-Human Privacy Standard:</strong> The surveillance camera discarded full CCTV frames, pedestrians, and facial pixels at the edge. Only the cropped bounding box of the unauthorized placed object is stored.
            </div>
          </div>

          {/* Image Inspection Area */}
          <div style={{
            background: '#090d14',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
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
          }}>
            {!imageUrl || imgError ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                <ImageOff size={48} style={{ marginBottom: '12px', opacity: 0.4 }} />
                <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#94a3b8' }}>
                  Evidence image unavailable
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {evidenceFile || 'No evidence file recorded'}
                </div>
              </div>
            ) : (
              <img
                src={imageUrl}
                alt={event.object_type || 'Placed Object'}
                onError={() => setImgError(true)}
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
              background: 'rgba(15, 20, 28, 0.85)',
              backdropFilter: 'blur(4px)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <button
                onClick={() => setZoomLevel(z => Math.max(1.2, z - 0.5))}
                style={{ color: 'var(--text-secondary)' }}
                title="Zoom Out">
                <ZoomOut size={14} />
              </button>
              <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#f1f5f9' }}>
                {zoomLevel.toFixed(1)}x
              </span>
              <button
                onClick={() => setZoomLevel(z => Math.min(3.5, z + 0.5))}
                style={{ color: 'var(--text-secondary)' }}
                title="Zoom In">
                <ZoomIn size={14} />
              </button>
            </div>

            {/* Floating Zoom Instruction */}
            <div style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              background: 'rgba(0, 0, 0, 0.65)',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '0.7rem',
              color: 'var(--text-secondary)'
            }}>
              Hover to inspect details with zoom loupe
            </div>
          </div>

          {/* Forensic Metadata Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px',
            background: 'var(--bg-surface)',
            padding: '14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>INCIDENT TIME</span>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                {timeStr}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>DETECTED OBJECT</span>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f87171' }}>
                {event.object_type || 'Unknown Object'}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>RFID BADGE</span>
              <div style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                fontFamily: (event.rfid_uid && event.authorization_status !== 'NO_RFID') ? 'var(--font-mono)' : 'inherit',
                color: (event.rfid_uid && event.authorization_status !== 'NO_RFID') ? '#60a5fa' : '#f87171'
              }}>
                {(event.rfid_uid && event.authorization_status !== 'NO_RFID') ? event.rfid_uid : 'Not Scanned RFID'}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CORRELATION REASON</span>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fbbf24' }}>
                {event.authorization_status}
              </div>
            </div>
          </div>

          {/* Detailed Note */}
          <div style={{
            fontSize: '0.8rem',
            color: '#cbd5e1',
            background: 'rgba(239, 68, 68, 0.08)',
            borderLeft: '3px solid #ef4444',
            padding: '8px 12px',
            borderRadius: '0 6px 6px 0'
          }}>
            {event.notes}
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          <a
            href={imageUrl || '#'}
            download={imageUrl ? `evidence_${eventId}.png` : undefined}
            target="_blank"
            rel="noreferrer"
            style={{
              textDecoration: 'none',
              display: imageUrl ? 'flex' : 'none',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '6px',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.8rem',
              fontWeight: 500
            }}>
            <Download size={14} />
            Export Evidence
          </a>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 600
            }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
