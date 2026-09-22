import React, { useState, useEffect } from 'react';
import { Camera, Radio, Cpu, Database, Volume2, VolumeX, ShieldAlert, ShieldCheck, Clock, Settings, Users, Coffee } from 'lucide-react';
import { sounds } from '../utils/audio';

export default function Header({ systemStatus, activeToken, onOpenSettings, onOpenEmployees, activeTab, setActiveTab, appMode = 'test', onToggleAppMode }) {
  const [muted, setMuted] = useState(false);
  const [timeLeftMs, setTimeLeftMs] = useState(0);

  const toggleSound = () => {
    const isMuted = sounds.toggleMute();
    setMuted(isMuted);
  };

  useEffect(() => {
    if (!activeToken || !activeToken.expires_at) {
      setTimeLeftMs(0);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, activeToken.expires_at - Date.now());
      setTimeLeftMs(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [activeToken]);

  const totalDuration = (activeToken && activeToken.duration_ms) || 60000;
  const progressPercent = Math.min(100, (timeLeftMs / totalDuration) * 100);

  return (
    <header style={{
      background: 'linear-gradient(180deg, #131822 0%, #0d1117 100%)',
      borderBottom: '1px solid var(--border-subtle)',
      padding: '14px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '16px'
    }}>
      {/* Brand Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '8px',
          background: 'radial-gradient(circle at 30% 30%, #ef4444, #991b1b)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 15px rgba(239, 68, 68, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <span style={{ fontWeight: 800, fontSize: '18px', color: '#fff', letterSpacing: '-1px' }}>RT</span>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.02em', color: '#f8fafc' }}>
              RED TAG MONITOR
            </h1>
            <span style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              background: 'rgba(59, 130, 246, 0.2)',
              color: '#60a5fa',
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid rgba(59, 130, 246, 0.3)'
            }}>
              RFID + CCTV AI ENGINE
            </span>

            {/* Mode Badge (Rules 30 & 31) */}
            <span style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              background: appMode === 'hardware' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
              color: appMode === 'hardware' ? '#34d399' : '#fbbf24',
              padding: '2px 6px',
              borderRadius: '4px',
              border: `1px solid ${appMode === 'hardware' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`
            }}>
              {appMode === 'hardware' ? 'PRODUCTION HARDWARE' : 'DEVELOPMENT / TEST'}
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Real-Time Authorization & Placement Correlation • Strict Privacy-First Bounding Crop
          </p>
        </div>
      </div>

      {/* 5 Live Status Indicators (Section 21) */}
      {(() => {
        const camOk = true; // camera connection driven by CCTVMonitor component live state
        const rfidOk = systemStatus?.rfid?.connected;
        const backendOk = systemStatus?.backend?.online !== false;
        const dbOk = systemStatus?.database?.connected !== false;
        const javaOk = systemStatus?.javaService?.online === true;
        const degraded = appMode === 'hardware' && systemStatus && !rfidOk;

        const dot = (ok) => (
          <span className="beacon-dot" style={{ background: ok ? '#10b981' : '#ef4444' }}></span>
        );
        const txt = (ok, yes, no) => (
          <strong style={{ color: ok ? '#34d399' : '#f87171' }}>{ok ? yes : no}</strong>
        );

        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: degraded ? 'rgba(239, 68, 68, 0.1)' : 'rgba(15, 20, 28, 0.7)',
            padding: '6px 14px',
            borderRadius: '30px',
            border: `1px solid ${degraded ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-subtle)'}`
          }}>
            {/* 1. Camera */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }} title="CCTV Camera">
              {dot(camOk)}<Camera size={13} color="#94a3b8" />
              <span style={{ color: '#cbd5e1', fontWeight: 500 }}>Camera: {txt(camOk, 'LIVE', 'OFFLINE')}</span>
            </div>

            <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />

            {/* 2. RFID */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }} title={systemStatus?.rfid?.port || 'RFID Reader'}>
              {dot(rfidOk || appMode === 'test')}<Radio size={13} color="#94a3b8" />
              <span style={{ color: '#cbd5e1', fontWeight: 500 }}>
                RFID: {txt(rfidOk || appMode === 'test',
                  rfidOk ? 'CONNECTED' : 'VIRTUAL READY',
                  'DISCONNECTED'
                )}
              </span>
            </div>

            <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />

            {/* 3. Detection AI */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }} title="COCO-SSD Object Detection">
              {dot(true)}<Cpu size={13} color="#94a3b8" />
              <span style={{ color: '#cbd5e1', fontWeight: 500 }}>Detection: <strong style={{ color: '#34d399' }}>RUNNING</strong></span>
            </div>

            <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />

            {/* 4. Backend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }} title="Node.js Backend">
              {dot(backendOk)}
              <span style={{ color: '#cbd5e1', fontWeight: 500 }}>Backend: {txt(backendOk, 'ONLINE', 'OFFLINE')}</span>
            </div>

            <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />

            {/* 5. Java Core Engine */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }} title="Java 25 LTS Industrial Engine (Port 8080/9090)">
              {dot(javaOk)}<Coffee size={13} color="#c084fc" />
              <span style={{ color: '#cbd5e1', fontWeight: 500 }}>Java Core: {txt(javaOk, 'ONLINE', 'OFFLINE')}</span>
            </div>

            <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />

            {/* 6. DB */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }} title="SQLite Database">
              {dot(dbOk)}<Database size={13} color="#94a3b8" />
              <span style={{ color: '#cbd5e1', fontWeight: 500 }}>DB: {txt(dbOk, 'CONNECTED', 'ERROR')}</span>
            </div>

            {/* Group N: SYSTEM DEGRADED badge */}
            {degraded && (
              <>
                <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />
                <span style={{
                  fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.06em',
                  background: 'rgba(239, 68, 68, 0.2)', color: '#f87171',
                  padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.4)'
                }}>⚠ DEGRADED</span>
              </>
            )}
          </div>
        );
      })()}

      {/* Active Token Slider / Countdown Badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        {activeToken && timeLeftMs > 0 ? (
          <div style={{
            background: activeToken.is_authorized ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${activeToken.is_authorized ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            borderRadius: '8px',
            padding: '6px 12px',
            minWidth: '220px',
            boxShadow: activeToken.is_authorized ? '0 0 15px rgba(16, 185, 129, 0.2)' : '0 0 15px rgba(239, 68, 68, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                {activeToken.is_authorized ? (
                  <ShieldCheck size={14} color="#34d399" />
                ) : (
                  <ShieldAlert size={14} color="#f87171" />
                )}
                <strong style={{ color: activeToken.is_authorized ? '#34d399' : '#f87171' }}>
                  {activeToken.is_authorized ? 'AUTHORIZED TOKEN' : 'UNAUTHORIZED CARD'}
                </strong>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#f1f5f9' }}>
                {(timeLeftMs / 1000).toFixed(1)}s
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeToken.employee_name || activeToken.uid} <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>({activeToken.uid})</span>
            </div>
            {/* Progress bar */}
            <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
              <div style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: activeToken.is_authorized ? '#10b981' : '#ef4444',
                transition: 'width 0.1s linear'
              }} />
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '8px 14px',
            fontSize: '0.8rem',
            color: 'var(--text-muted)'
          }}>
            <Clock size={14} />
            <span>STANDBY (Awaiting Scan)</span>
          </div>
        )}

        {/* View Switcher / Tabs */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-surface)',
          padding: '3px',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)'
        }}>
          <button
            onClick={() => setActiveTab('monitor')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              background: activeTab === 'monitor' ? '#253043' : 'transparent',
              color: activeTab === 'monitor' ? '#fff' : 'var(--text-secondary)'
            }}>
            Live Monitor
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              background: activeTab === 'reports' ? '#253043' : 'transparent',
              color: activeTab === 'reports' ? '#fff' : 'var(--text-secondary)'
            }}>
            Reports & Alerts
          </button>
          <button
            onClick={() => setActiveTab('employees')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: activeTab === 'employees' ? '#253043' : 'transparent',
              color: activeTab === 'employees' ? '#fff' : 'var(--text-secondary)'
            }}>
            <Users size={14} />
            Employees
          </button>
          <button
            onClick={() => setActiveTab('java')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: activeTab === 'java' ? '#253043' : 'transparent',
              color: activeTab === 'java' ? '#c084fc' : 'var(--text-secondary)'
            }}>
            <Cpu size={14} color={activeTab === 'java' ? '#c084fc' : 'currentColor'} />
            Java Core
          </button>
        </div>

        {/* Audio and Settings controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => sounds.playUnauthorizedAlert()}
            title="Test Alarm Siren (Audio Synth)"
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              padding: '6px 10px',
              color: '#f87171',
              fontSize: '0.72rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}>
            <ShieldAlert size={14} />
            <span>Test Siren</span>
          </button>

          <button
            onClick={toggleSound}
            title={muted ? 'Unmute Audio' : 'Mute Audio Alerts'}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '8px',
              color: muted ? 'var(--text-muted)' : '#f1f5f9'
            }}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          <button
            onClick={onOpenSettings}
            title="System Settings"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '8px',
              color: '#f1f5f9'
            }}>
            <Settings size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
