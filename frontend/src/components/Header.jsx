import React, { useState } from 'react';
import { Camera, Radio, Volume2, VolumeX, User, LogOut, Package, Video, FileText, Users, BarChart3, Settings } from 'lucide-react';
import { sounds } from '../utils/audio';

export default function Header({
  systemStatus,
  activeTab,
  onLogoutToKiosk,
  cameraActive = false,
  userRole = 'admin'
}) {
  const [muted, setMuted] = useState(false);

  const toggleSound = () => {
    const isMuted = sounds.toggleMute();
    setMuted(isMuted);
  };

  // Derive system states from actual application state
  const isCameraOnline = cameraActive;
  const isRfidOnline = Boolean(systemStatus?.rfid?.connected);
  const isAiOnline = Boolean(systemStatus?.cctv?.aiRunning !== false);
  const isBackendOnline = Boolean(systemStatus?.backend?.online !== false);

  // Overall system status
  let overallStatusText = 'System Operational';
  let overallStatusColor = '#16803C';
  let overallStatusBg = '#EDFDF2';
  let overallStatusBorder = '#A6F4C5';

  if (!isCameraOnline && !isRfidOnline) {
    overallStatusText = 'System Offline';
    overallStatusColor = '#D92D20';
    overallStatusBg = '#FEF3F2';
    overallStatusBorder = '#FECDCA';
  } else if (!isCameraOnline) {
    overallStatusText = 'Camera Disconnected';
    overallStatusColor = '#D92D20';
    overallStatusBg = '#FEF3F2';
    overallStatusBorder = '#FECDCA';
  } else if (!isRfidOnline && systemStatus?.appMode === 'hardware') {
    overallStatusText = 'RFID Disconnected';
    overallStatusColor = '#D97706';
    overallStatusBg = '#FFFBEB';
    overallStatusBorder = '#FDE68A';
  } else if (!isAiOnline || !isBackendOnline) {
    overallStatusText = 'Attention Required';
    overallStatusColor = '#D97706';
    overallStatusBg = '#FFFBEB';
    overallStatusBorder = '#FDE68A';
  }

  // Active section info
  const tabNames = {
    placements: { label: 'Active Placements & Asset Registry', icon: Package },
    monitor: { label: 'Live CCTV Monitoring & Area Correlation', icon: Video },
    events: { label: 'System Audit Events & Evidence Trail', icon: FileText },
    employees: { label: 'User & RFID Management', icon: Users },
    users: { label: 'User, Supervisor & RFID Management', icon: Users },
    reports: { label: 'Compliance Reports & Analytics', icon: BarChart3 },
    settings: { label: 'System Configuration', icon: Settings }
  };
  const currentTabInfo = tabNames[activeTab] || { label: 'Red Tag Area Console', icon: Package };
  const TabIcon = currentTabInfo.icon;

  return (
    <header style={{
      background: '#FFFFFF',
      borderBottom: '1px solid var(--border-medium)',
      padding: '0 24px',
      height: '72px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 40,
      boxShadow: '0 1px 3px 0 rgba(16, 24, 40, 0.05)'
    }}>
      {/* Left: Active Section Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flexShrink: 1 }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-muted)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-primary)',
          flexShrink: 0
        }}>
          <TabIcon size={18} />
        </div>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div style={{
            fontSize: '0.92rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.25,
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden'
          }}>
            {currentTabInfo.label}
          </div>
          <div style={{
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            lineHeight: 1.2,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            letterSpacing: '0.02em'
          }}>
            <span style={{ color: 'var(--brand-red)', fontWeight: 700 }}>RED TAG AREA MONITOR</span> • Edge AI & RFID Surveillance
          </div>
        </div>
      </div>

      {/* Right: Operational Status Badges & Quick Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* Overall System Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 10px',
          borderRadius: 'var(--radius-sm)',
          background: overallStatusBg,
          border: `1px solid ${overallStatusBorder}`,
          fontSize: '0.73rem',
          fontWeight: 600,
          color: overallStatusColor,
          whiteSpace: 'nowrap'
        }}>
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: overallStatusColor
          }} />
          <span>{overallStatusText}</span>
        </div>

        {/* Camera Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '5px 8px',
          borderRadius: 'var(--radius-sm)',
          background: isCameraOnline ? 'var(--success-bg)' : 'var(--bg-muted)',
          border: `1px solid ${isCameraOnline ? 'var(--success-border)' : 'var(--border-subtle)'}`,
          fontSize: '0.72rem',
          color: isCameraOnline ? 'var(--success)' : 'var(--text-muted)',
          fontWeight: 600,
          whiteSpace: 'nowrap'
        }}>
          <Camera size={13} />
          <span>Camera</span>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: isCameraOnline ? 'var(--success)' : 'var(--text-dim)'
          }} />
        </div>

        {/* RFID Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '5px 8px',
          borderRadius: 'var(--radius-sm)',
          background: isRfidOnline ? 'var(--success-bg)' : (systemStatus?.appMode === 'hardware' ? 'var(--brand-red-bg)' : 'var(--warning-bg)'),
          border: `1px solid ${isRfidOnline ? 'var(--success-border)' : (systemStatus?.appMode === 'hardware' ? 'var(--brand-red-border)' : 'var(--warning-border)')}`,
          fontSize: '0.72rem',
          color: isRfidOnline ? 'var(--success)' : (systemStatus?.appMode === 'hardware' ? 'var(--brand-red)' : 'var(--warning)'),
          fontWeight: 600,
          whiteSpace: 'nowrap'
        }}>
          <Radio size={13} />
          <span>RFID</span>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: isRfidOnline ? 'var(--success)' : (systemStatus?.appMode === 'hardware' ? 'var(--brand-red)' : 'var(--warning)')
          }} />
        </div>

        {/* Audio Mute/Unmute Toggle */}
        <button
          onClick={toggleSound}
          title={muted ? 'Unmute Audio Alerts' : 'Mute Audio Alerts'}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-medium)',
            color: 'var(--text-secondary)',
            background: '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {muted ? <VolumeX size={15} color="#D92D20" /> : <Volume2 size={15} />}
        </button>

        {/* User Profile Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-muted)',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.75rem',
          fontWeight: 700,
          color: 'var(--text-primary)'
        }}>
          <div style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: ((userRole || '').toLowerCase() === 'operator' || (userRole || '').toLowerCase() === 'supervisor') ? '#2563EB' : 'var(--brand-red)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF'
          }}>
            <User size={12} />
          </div>
          <span style={{ textTransform: 'capitalize' }}>
            {((userRole || '').toLowerCase() === 'operator' || (userRole || '').toLowerCase() === 'supervisor') ? 'Supervisor' : 'Administrator'}
          </span>
        </div>

        {/* Return to Kiosk */}
        {onLogoutToKiosk && (
          <button
            onClick={onLogoutToKiosk}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#DC2626',
              border: '1px solid rgba(220, 38, 38, 0.4)',
              padding: '6px 12px',
              fontWeight: 700,
              fontSize: '0.75rem',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(220, 38, 38, 0.05)',
              cursor: 'pointer'
            }}
            title="Lock and return to Employee Kiosk screen"
          >
            <LogOut size={13} />
            <span>Kiosk Mode</span>
          </button>
        )}
      </div>
    </header>
  );
}
