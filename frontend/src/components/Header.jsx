import React, { useState } from 'react';
import { Camera, Radio, Video, FileText, BarChart3, Settings, Shield, User, Users, Volume2, VolumeX, Package, LogOut } from 'lucide-react';
import { sounds } from '../utils/audio';

export default function Header({
  systemStatus,
  activeToken,
  activeTab,
  setActiveTab,
  onOpenSettings,
  onLogoutToKiosk,
  cameraActive = false,
  userRole = 'admin',
  setUserRole
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
  let overallStatusColor = '#16803C'; // Success Green
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
    overallStatusText = 'System Attention Required';
    overallStatusColor = '#D97706';
    overallStatusBg = '#FFFBEB';
    overallStatusBorder = '#FDE68A';
  }

  // Section 35: Role-based navigation
  // Operator: Live Monitor, Alerts, Events
  // Admin & Developer: Operator + Reports + Settings
  const baseNavItems = [
    { id: 'placements', label: 'Placements', icon: Package },
    { id: 'monitor', label: 'Live Monitor', icon: Video },
    { id: 'events', label: 'Events', icon: FileText },
    { id: 'employees', label: 'Employees', icon: Users }
  ];

  if (userRole !== 'operator') {
    baseNavItems.push({ id: 'reports', label: 'Reports', icon: BarChart3 });
  }

  const navItems = baseNavItems;

  return (
    <header style={{
      background: '#FFFFFF',
      borderBottom: '1px solid var(--border-medium)',
      padding: '0 24px',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      boxShadow: '0 1px 3px 0 rgba(16, 24, 40, 0.05)',
      position: 'sticky',
      top: 0,
      zIndex: 40
    }}>
      {/* Brand Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '280px' }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--brand-red)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF',
          fontWeight: 800,
          fontSize: '15px',
          letterSpacing: '-0.02em',
          boxShadow: '0 1px 2px 0 rgba(217, 45, 32, 0.2)'
        }}>
          RT
        </div>
        <div>
          <h1 style={{
            fontSize: '1.05rem',
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            margin: 0
          }}>
            RED TAG MONITOR
          </h1>
          <p style={{
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            margin: 0,
            lineHeight: 1.2,
            fontWeight: 500
          }}>
            Real-Time Red Tag Area Monitoring System
          </p>
        </div>
      </div>

      {/* Global Navigation */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '100%' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                height: '42px',
                padding: '0 14px',
                fontSize: '0.8125rem',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--info)' : 'var(--text-secondary)',
                background: isActive ? 'var(--info-bg)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                borderColor: isActive ? 'var(--info-border)' : 'transparent',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={16} color={isActive ? 'var(--info)' : 'currentColor'} />
              <span>{item.label}</span>
              {item.badge && (
                <span style={{
                  background: 'var(--brand-red)',
                  color: '#FFFFFF',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-full)',
                  lineHeight: 1.2
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {userRole !== 'operator' && (
          <button
            onClick={onOpenSettings}
            style={{
              height: '42px',
              padding: '0 14px',
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              background: 'transparent',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid transparent',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        )}
      </nav>

      {/* Right Side: Operational Status Badges & Admin User */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Overall System Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 10px',
          borderRadius: 'var(--radius-sm)',
          background: overallStatusBg,
          border: `1px solid ${overallStatusBorder}`,
          fontSize: '0.75rem',
          fontWeight: 600,
          color: overallStatusColor
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
          gap: '6px',
          padding: '5px 9px',
          borderRadius: 'var(--radius-sm)',
          background: isCameraOnline ? 'var(--success-bg)' : 'var(--bg-muted)',
          border: `1px solid ${isCameraOnline ? 'var(--success-border)' : 'var(--border-subtle)'}`,
          fontSize: '0.73rem',
          color: isCameraOnline ? 'var(--success)' : 'var(--text-muted)',
          fontWeight: 600
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
          gap: '6px',
          padding: '5px 9px',
          borderRadius: 'var(--radius-sm)',
          background: isRfidOnline ? 'var(--success-bg)' : (systemStatus?.appMode === 'hardware' ? 'var(--brand-red-bg)' : 'var(--warning-bg)'),
          border: `1px solid ${isRfidOnline ? 'var(--success-border)' : (systemStatus?.appMode === 'hardware' ? 'var(--brand-red-border)' : 'var(--warning-border)')}`,
          fontSize: '0.73rem',
          color: isRfidOnline ? 'var(--success)' : (systemStatus?.appMode === 'hardware' ? 'var(--brand-red)' : 'var(--warning)'),
          fontWeight: 600
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
            background: '#FFFFFF'
          }}
        >
          {muted ? <VolumeX size={15} color="#D92D20" /> : <Volume2 size={15} />}
        </button>

        {/* Admin User Badge */}
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
            background: 'var(--brand-red)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF'
          }}>
            <User size={12} />
          </div>
          <span>Admin</span>
        </div>

        {/* Return to Kiosk */}
        {onLogoutToKiosk && (
          <button
            onClick={onLogoutToKiosk}
            className="btn btn-outline btn-xs"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#DC2626',
              borderColor: 'rgba(220, 38, 38, 0.4)',
              padding: '6px 12px',
              fontWeight: 700,
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(220, 38, 38, 0.05)'
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
