import React, { useState, useEffect, useCallback } from 'react';
import { Package, ShieldCheck, AlertTriangle, Activity } from 'lucide-react';
import DateRangeFilter from './DateRangeFilter';
import { isWithinDateRange, computePresetDates, formatYMD } from '../utils/dateFilterUtils';

export default function KPIMetricsBar({
  placements: externalPlacements = [],
  events = [],
  systemStatus,
  cameraActive = false,
  adminToken,
  socket
}) {
  const [internalPlacements, setInternalPlacements] = useState(externalPlacements || []);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState(() => formatYMD(new Date()));
  const [appliedEndDate, setAppliedEndDate] = useState(() => formatYMD(new Date()));
  const [quickPreset, setQuickPreset] = useState('TODAY');

  useEffect(() => {
    if (Array.isArray(externalPlacements) && externalPlacements.length > 0) {
      setInternalPlacements(externalPlacements);
    }
  }, [externalPlacements]);

  // Load placements from backend to ensure metrics match the Placements registry exactly
  const loadPlacements = useCallback(async () => {
    try {
      const token = adminToken || sessionStorage.getItem('redtag_admin_token') || localStorage.getItem('redtag_admin_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch('/api/admin/placements?limit=500', { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setInternalPlacements(data);
      }
    } catch (_) {}
  }, [adminToken]);

  useEffect(() => {
    if (!externalPlacements || externalPlacements.length === 0) {
      loadPlacements();
    }
  }, [externalPlacements, loadPlacements]);

  // Real-time synchronization via socket when placements update
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      loadPlacements();
    };
    socket.on('placement_deleted', handleUpdate);
    socket.on('placements_updated', handleUpdate);
    socket.on('kiosk_placement_success', handleUpdate);
    socket.on('placement_authorized', handleUpdate);
    socket.on('object_registered', handleUpdate);
    socket.on('object_removed', handleUpdate);
    socket.on('new_event_logged', handleUpdate);
    return () => {
      socket.off('placement_deleted', handleUpdate);
      socket.off('placements_updated', handleUpdate);
      socket.off('kiosk_placement_success', handleUpdate);
      socket.off('placement_authorized', handleUpdate);
      socket.off('object_registered', handleUpdate);
      socket.off('object_removed', handleUpdate);
      socket.off('new_event_logged', handleUpdate);
    };
  }, [socket, loadPlacements]);

  const handleApplyDateRange = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    if (!startDate && !endDate) {
      setQuickPreset('ALL');
    } else {
      setQuickPreset('CUSTOM');
    }
  };

  const handleQuickPreset = (e) => {
    const preset = e.target.value;
    setQuickPreset(preset);
    const { startDate: s, endDate: end } = computePresetDates(preset);
    setStartDate(s);
    setEndDate(end);
    setAppliedStartDate(s);
    setAppliedEndDate(end);
  };

  // Determine active dataset: prefer placements registry, fallback to events
  const activePlacementsList = (Array.isArray(internalPlacements) && internalPlacements.length > 0)
    ? internalPlacements
    : (Array.isArray(externalPlacements) && externalPlacements.length > 0 ? externalPlacements : []);

  const usePlacements = activePlacementsList.length > 0;

  // Filter placements by applied range (same exact matching logic as PlacementsManager)
  const rangePlacements = usePlacements
    ? activePlacementsList.filter((p) => {
        const rawDate = p.placed_at || p.registered_at || p.first_seen || p.last_seen || p.timestamp || '';
        return isWithinDateRange(rawDate, appliedStartDate, appliedEndDate);
      })
    : [];

  const rangeEvents = !usePlacements
    ? events.filter(e => isWithinDateRange(e.timestamp, appliedStartDate, appliedEndDate) && (e.event_type === 'AUTHORIZED_PLACEMENT' || e.event_type === 'UNAUTHORIZED_PLACEMENT'))
    : [];

  const totalPlacements = usePlacements ? rangePlacements.length : rangeEvents.length;

  const authCount = usePlacements
    ? rangePlacements.filter(p => p.authorization_status === 'AUTHORIZED' || p.is_authorized || p.isAuthorized).length
    : rangeEvents.filter(e => e.event_type === 'AUTHORIZED_PLACEMENT').length;

  const unauthCount = usePlacements
    ? rangePlacements.filter(p => p.authorization_status !== 'AUTHORIZED' && !p.is_authorized && !p.isAuthorized).length
    : rangeEvents.filter(e => e.event_type === 'UNAUTHORIZED_PLACEMENT').length;

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

  const rangeLabel = quickPreset === 'TODAY' ? 'TODAY' : 'IN RANGE';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
      {/* Live Monitor Date Range Control Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        padding: '10px 14px',
        background: '#FFFFFF',
        borderRadius: '8px',
        border: '1px solid var(--border-medium)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Live Metrics Filter:
          </span>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            {appliedStartDate || appliedEndDate ? `${appliedStartDate || 'Any'} to ${appliedEndDate || 'Now'}` : 'All Time'}
          </span>
        </div>
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onApply={handleApplyDateRange}
          quickPreset={quickPreset}
          onQuickPresetChange={handleQuickPreset}
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: '16px'
      }}>
        {/* 1. OBJECTS TODAY / IN RANGE */}
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
              OBJECTS {rangeLabel}
            </div>
            <div style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              lineHeight: 1.15,
              marginTop: '4px',
              fontFamily: 'var(--font-mono)'
            }}>
              {totalPlacements}
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
            {authCount}
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
            color: unauthCount > 0 ? 'var(--brand-red)' : 'var(--text-primary)',
            lineHeight: 1.15,
            marginTop: '4px',
            fontFamily: 'var(--font-mono)'
          }}>
            {unauthCount}
          </div>
          <div style={{
            fontSize: '0.75rem',
            color: unauthCount > 0 ? 'var(--brand-red)' : 'var(--text-muted)',
            marginTop: '4px',
            fontWeight: unauthCount > 0 ? 600 : 400
          }}>
            action required
          </div>
        </div>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: 'var(--radius-sm)',
          background: unauthCount > 0 ? 'var(--brand-red-bg)' : 'var(--bg-muted)',
          border: `1px solid ${unauthCount > 0 ? 'var(--brand-red-border)' : 'var(--border-subtle)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <AlertTriangle size={20} color={unauthCount > 0 ? 'var(--brand-red)' : 'var(--text-dim)'} />
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
  </div>
  );
}
