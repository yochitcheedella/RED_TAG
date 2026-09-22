import React from 'react';
import { ShieldCheck, ShieldAlert, Clock, Layers, CheckCircle2, TrendingUp, Cpu } from 'lucide-react';

export default function KPIMetricsBar({ events = [], systemStatus, activeObjectsCount = 0 }) {
  // Filter today's events
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayEvents = events.filter(e => e.timestamp && e.timestamp.startsWith(todayStr));

  const authPlacements = todayEvents.filter(e => e.event_type === 'AUTHORIZED_PLACEMENT');
  const unauthPlacements = todayEvents.filter(e => e.event_type === 'UNAUTHORIZED_PLACEMENT');
  const totalPlacements = authPlacements.length + unauthPlacements.length;

  const complianceRate = totalPlacements > 0
    ? Math.round((authPlacements.length / totalPlacements) * 100)
    : 100;

  // Compute average correlation latency
  const latencies = authPlacements
    .map(e => e.time_difference)
    .filter(t => t !== null && t !== undefined && !isNaN(t));

  const avgLatency = latencies.length > 0
    ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)
    : '0.00';

  const inventoryCount = systemStatus?.javaService?.inventoryCount ?? activeObjectsCount;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
      gap: '12px'
    }}>
      {/* 1. Total Placements */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Today's Placements
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.2, marginTop: '2px' }}>
            {totalPlacements}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2px' }}>
            {authPlacements.length} auth · {unauthPlacements.length} unauth
          </div>
        </div>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '8px',
          background: 'rgba(59, 130, 246, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(59, 130, 246, 0.25)'
        }}>
          <Layers size={20} color="#60a5fa" />
        </div>
      </div>

      {/* 2. RFID Compliance Rate */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            RFID Compliance Rate
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: complianceRate >= 90 ? '#34d399' : complianceRate >= 70 ? '#fbbf24' : '#f87171', lineHeight: 1.2, marginTop: '2px' }}>
            {complianceRate}%
          </div>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2px' }}>
            Target: ≥95.0% compliance
          </div>
        </div>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '8px',
          background: complianceRate >= 90 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${complianceRate >= 90 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`
        }}>
          <ShieldCheck size={20} color={complianceRate >= 90 ? '#34d399' : '#fbbf24'} />
        </div>
      </div>

      {/* 3. Security Violations */}
      <div style={{
        background: 'var(--bg-card)',
        border: unauthPlacements.length > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Violations Today
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: unauthPlacements.length > 0 ? '#f87171' : '#f8fafc', lineHeight: 1.2, marginTop: '2px' }}>
            {unauthPlacements.length}
          </div>
          <div style={{ fontSize: '0.68rem', color: unauthPlacements.length > 0 ? '#fca5a5' : '#94a3b8', marginTop: '2px' }}>
            {unauthPlacements.length > 0 ? 'Object evidence recorded' : 'Zero violations recorded'}
          </div>
        </div>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '8px',
          background: unauthPlacements.length > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(148, 163, 184, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${unauthPlacements.length > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`
        }}>
          <ShieldAlert size={20} color={unauthPlacements.length > 0 ? '#ef4444' : '#94a3b8'} />
        </div>
      </div>

      {/* 4. Avg Correlation Latency */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Mean Correl. Latency
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.2, marginTop: '2px' }}>
            {avgLatency}s
          </div>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2px' }}>
            Allowed Window: {systemStatus?.settings?.auth_window_ms ? `${(parseInt(systemStatus.settings.auth_window_ms, 10) / 1000).toFixed(1)}s` : '60.0s'}
          </div>
        </div>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '8px',
          background: 'rgba(168, 85, 247, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(168, 85, 247, 0.25)'
        }}>
          <Clock size={20} color="#c084fc" />
        </div>
      </div>

      {/* 5. Live Floor Inventory */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Live Floor Inventory
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.2, marginTop: '2px' }}>
            {inventoryCount} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>items</span>
          </div>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2px' }}>
            Java Memory Tracker sync
          </div>
        </div>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '8px',
          background: 'rgba(245, 158, 11, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(245, 158, 11, 0.25)'
        }}>
          <Cpu size={20} color="#fbbf24" />
        </div>
      </div>
    </div>
  );
}
