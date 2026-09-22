import React from 'react';
import { Package, ShieldCheck, ShieldAlert, Clock, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';

export default function ActiveObjectsPanel({ activeObjects = [] }) {
  const presentObjects = activeObjects.filter(o => o.state === 'PRESENT');

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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={16} color="#60a5fa" />
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9' }}>
            Active Tracked Objects (Red Tag Area)
          </h2>
        </div>
        <span style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          background: presentObjects.length > 0 ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-surface)',
          color: presentObjects.length > 0 ? '#60a5fa' : 'var(--text-muted)',
          padding: '2px 8px',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)'
        }}>
          {presentObjects.length} Present
        </span>
      </div>

      {/* Grid of Active Objects */}
      {presentObjects.length === 0 ? (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.8rem',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--border-subtle)'
        }}>
          <Package size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
          No objects currently present in the Red Tag Floor Area.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '10px'
        }}>
          {presentObjects.map(obj => {
            const isAuth = obj.authorization_status === 'AUTHORIZED';
            const trackingId = obj.id || obj.objectId || 'TRACK';
            const label = obj.object_type || obj.objectType || 'Object';

            return (
              <div
                key={trackingId}
                style={{
                  background: isAuth ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                  border: `1px solid ${isAuth ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    color: isAuth ? '#34d399' : '#f87171'
                  }}>
                    {trackingId}
                  </span>
                  <span style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: isAuth ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: isAuth ? '#34d399' : '#f87171',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {isAuth ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
                    {isAuth ? 'AUTHORIZED' : 'UNAUTHORIZED'}
                  </span>
                </div>

                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                  Object: <span style={{ fontWeight: 700 }}>{label}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#94a3b8', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px', marginTop: '2px' }}>
                  <span>State: <strong style={{ color: '#38bdf8' }}>PRESENT</strong></span>
                  {obj.rfid_uid && <span>RFID: <code style={{ color: '#60a5fa' }}>{obj.rfid_uid}</code></span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
