import React from 'react';
import { Package, ShieldCheck, AlertTriangle, Activity } from 'lucide-react';

export default function KPIMetricsBar({ events = [], systemStatus, cameraActive = false }) {
  // Filter today's placement events
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayEvents = events.filter(e => e.timestamp && e.timestamp.startsWith(todayStr));

  const authPlacements = todayEvents.filter(e => e.event_type === 'AUTHORIZED_PLACEMENT');
  const unauthPlacements = todayEvents.filter(e => e.event_type === 'UNAUTHORIZED_PLACEMENT');
  const totalPlacementsToday = authPlacements.length + unauthPlacements.length;

  // System status calculation based on real camera + RFID + AI
  const isCameraOnline = cameraActive;
  const isRfidOnline = Boolean(systemStatus?.rfid?.connected);
  const isAiOnline = Boolean(systemStatus?.cctv?.aiRunning !== false);

  let systemStatusValue = 'Monitoring';
  let systemStatusColor = '#16803C';
  let systemStatusBg = '#EDFDF2';
  let systemStatusSubtitle = 'All subsystems operational';

  if (!isCameraOnline && !isRfidOnline) {
    systemStatusValue = 'Offline';
    systemStatusColor = '#D92D20';
    systemStatusBg = '#FEF3F2';
    systemStatusSubtitle = 'Camera and RFID reader offline';
  } else if (!isCameraOnline) {
    systemStatusValue = 'Attention';
    systemStatusColor = '#D97706';
    systemStatusBg = '#FFFBEB';
    systemStatusSubtitle = 'Camera stream disconnected';
  } else if (!isRfidOnline && systemStatus?.appMode === 'hardware') {
    systemStatusValue = 'Attention';
    systemStatusColor = '#D97706';
    systemStatusBg = '#FFFBEB';
    systemStatusSubtitle = 'RFID reader not detected';
  } else if (!isAiOnline) {
    systemStatusValue = 'Attention';
    systemStatusColor = '#D97706';
    systemStatusBg = '#FFFBEB';
    systemStatusSubtitle = 'AI Vision detector stopped';
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      gap: '16px'
    }}>
      {/* 1. OBJECTS TODAY */}
      <div className="soc-card" style={{
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}>
            OBJECTS TODAY
          </div>
          <div style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1.15,
            marginTop: '4px',
            fontFamily: 'var(--font-mono)'
          }}>
            {totalPlacementsToday}
          </div>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            marginTop: '4px'
          }}>
            placements
          </div>
        </div>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--info-bg)',
          border: '1px solid var(--info-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Package size={20} color="var(--info)" />
        </div>
      </div>

      {/* 2. AUTHORIZED */}
      <div className="soc-card" style={{
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}>
            AUTHORIZED
          </div>
          <div style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            color: 'var(--success)',
            lineHeight: 1.15,
            marginTop: '4px',
            fontFamily: 'var(--font-mono)'
          }}>
            {authPlacements.length}
          </div>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            marginTop: '4px'
          }}>
            RFID verified
          </div>
        </div>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--success-bg)',
          border: '1px solid var(--success-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <ShieldCheck size={20} color="var(--success)" />
        </div>
      </div>

      {/* 3. UNAUTHORIZED */}
      <div className="soc-card" style={{
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}>
            UNAUTHORIZED
          </div>
          <div style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            color: unauthPlacements.length > 0 ? 'var(--brand-red)' : 'var(--text-primary)',
            lineHeight: 1.15,
            marginTop: '4px',
            fontFamily: 'var(--font-mono)'
          }}>
            {unauthPlacements.length}
          </div>
          <div style={{
            fontSize: '0.75rem',
            color: unauthPlacements.length > 0 ? 'var(--brand-red)' : 'var(--text-muted)',
            marginTop: '4px',
            fontWeight: unauthPlacements.length > 0 ? 600 : 400
          }}>
            action required
          </div>
        </div>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: 'var(--radius-sm)',
          background: unauthPlacements.length > 0 ? 'var(--brand-red-bg)' : 'var(--bg-muted)',
          border: `1px solid ${unauthPlacements.length > 0 ? 'var(--brand-red-border)' : 'var(--border-subtle)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <AlertTriangle size={20} color={unauthPlacements.length > 0 ? 'var(--brand-red)' : 'var(--text-dim)'} />
        </div>
      </div>

      {/* 4. SYSTEM STATUS */}
      <div className="soc-card" style={{
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}>
            SYSTEM STATUS
          </div>
          <div style={{
            fontSize: '1.45rem',
            fontWeight: 800,
            color: systemStatusColor,
            lineHeight: 1.15,
            marginTop: '6px'
          }}>
            {systemStatusValue}
          </div>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            marginTop: '4px',
            maxWidth: '180px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {systemStatusSubtitle}
          </div>
        </div>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: 'var(--radius-sm)',
          background: systemStatusBg,
          border: `1px solid ${systemStatusColor}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Activity size={20} color={systemStatusColor} />
        </div>
      </div>
    </div>
  );
}
