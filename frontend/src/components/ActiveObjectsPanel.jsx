import React from 'react';
import { Package, ShieldCheck, ShieldAlert, Layers } from 'lucide-react';

export default function ActiveObjectsPanel({ activeObjects = [] }) {
  const presentObjects = activeObjects.filter(o => o.state === 'PRESENT');

  return (
    <div className="soc-card" style={{
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={16} color="var(--info)" />
          <h2 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Active Tracked Objects (Red Tag Area)
          </h2>
        </div>
        <span style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          background: 'var(--bg-muted)',
          color: presentObjects.length > 0 ? 'var(--info)' : 'var(--text-muted)',
          padding: '2px 8px',
          borderRadius: 'var(--radius-xs)',
          border: '1px solid var(--border-subtle)'
        }}>
          {presentObjects.length} Present
        </span>
      </div>

      {/* Grid of Active Objects */}
      {presentObjects.length === 0 ? (
        <div style={{
          padding: '28px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.8125rem',
          background: 'var(--bg-muted)',
          borderRadius: 'var(--radius-sm)',
          border: '1px dashed var(--border-medium)'
        }}>
          <Package size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
          No objects currently present in the Red Tag Floor Area.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '12px'
        }}>
          {presentObjects.map(obj => {
            const isAuth = obj.authorization_status === 'AUTHORIZED';
            const trackingId = obj.id || obj.objectId || 'TRACK';
            const label = obj.object_type || obj.objectType || 'Object';

            return (
              <div
                key={trackingId}
                style={{
                  background: isAuth ? 'var(--success-bg)' : 'var(--brand-red-bg)',
                  border: `1px solid ${isAuth ? 'var(--success-border)' : 'var(--brand-red-border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    color: isAuth ? 'var(--success)' : 'var(--brand-red)'
                  }}>
                    {trackingId}
                  </span>
                  <span className={isAuth ? 'badge badge-success' : 'badge badge-danger'}>
                    {isAuth ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
                    {isAuth ? 'AUTHORIZED' : 'UNAUTHORIZED'}
                  </span>
                </div>

                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Object: <span style={{ fontWeight: 700 }}>{label}</span>
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '6px',
                  marginTop: '2px'
                }}>
                  <span>State: <strong style={{ color: 'var(--info)' }}>PRESENT</strong></span>
                  {obj.rfid_uid && <span>RFID: <code style={{ color: 'var(--text-primary)' }}>{obj.rfid_uid}</code></span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
