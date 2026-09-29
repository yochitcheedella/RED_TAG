import React, { useState, useEffect } from 'react';
import { Camera, Radio, Cpu, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, Clock, KeyRound, Eye, Check } from 'lucide-react';
import { sounds } from '../utils/audio';

export default function DeviceOperationsPanel({
  onSimulateRFID,
  activeToken,
  systemStatus,
  polygonVertices,
  cameraActive = false,
  currentActivity = 'Waiting for an object...',
  unauthorizedAlert = null,
  onViewEvidence = null
}) {
  const [badgeInput, setBadgeInput] = useState('');
  const [remainingTime, setRemainingTime] = useState(0);

  // Active token live countdown
  useEffect(() => {
    if (!activeToken || !activeToken.expires_at) {
      setRemainingTime(0);
      return;
    }

    const timer = setInterval(() => {
      const left = Math.max(0, activeToken.expires_at - Date.now());
      setRemainingTime(left);
      if (left <= 0) clearInterval(timer);
    }, 100);

    return () => clearInterval(timer);
  }, [activeToken]);

  const handleManualScan = (uid) => {
    if (!uid) return;
    sounds.playScanBeep?.();
    onSimulateRFID?.(uid);
  };

  const isCameraOnline = cameraActive;
  const isRfidOnline = Boolean(systemStatus?.rfid?.connected);
  const isAiOnline = Boolean(systemStatus?.cctv?.aiRunning !== false);
  const isRoiConfigured = Array.isArray(polygonVertices) && polygonVertices.length >= 3;

  const totalDuration = (activeToken && activeToken.duration_ms) || 60000;
  const progressPct = Math.min(100, Math.max(0, (remainingTime / totalDuration) * 100));

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      {/* 1. SYSTEM STATUS PANEL */}
      <div className="soc-card" style={{ padding: '18px' }}>
        <div style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: '12px'
        }}>
          SYSTEM STATUS
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '10px'
        }}>
          {/* Camera */}
          <div style={{
            background: 'var(--bg-muted)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <Camera size={13} />
              <span>Camera</span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '4px',
              fontSize: '0.8125rem',
              fontWeight: 700,
              color: isCameraOnline ? 'var(--success)' : 'var(--brand-red)'
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isCameraOnline ? 'var(--success)' : 'var(--brand-red)'
              }} />
              <span>{isCameraOnline ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>

          {/* RFID Reader */}
          <div style={{
            background: 'var(--bg-muted)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <Radio size={13} />
              <span>RFID Reader</span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '4px',
              fontSize: '0.8125rem',
              fontWeight: 700,
              color: isRfidOnline ? 'var(--success)' : (systemStatus?.appMode === 'hardware' ? 'var(--brand-red)' : 'var(--warning)')
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isRfidOnline ? 'var(--success)' : (systemStatus?.appMode === 'hardware' ? 'var(--brand-red)' : 'var(--warning)')
              }} />
              <span>{isRfidOnline ? 'Connected' : (systemStatus?.appMode === 'hardware' ? 'Disconnected' : 'Waiting')}</span>
            </div>
          </div>

          {/* AI Vision */}
          <div style={{
            background: 'var(--bg-muted)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <Cpu size={13} />
              <span>AI Vision</span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '4px',
              fontSize: '0.8125rem',
              fontWeight: 700,
              color: isAiOnline ? 'var(--success)' : 'var(--brand-red)'
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isAiOnline ? 'var(--success)' : 'var(--brand-red)'
              }} />
              <span>{isAiOnline ? 'Running' : 'Stopped'}</span>
            </div>
          </div>

          {/* ROI */}
          <div style={{
            background: 'var(--bg-muted)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <ShieldCheck size={13} />
              <span>ROI</span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '4px',
              fontSize: '0.8125rem',
              fontWeight: 700,
              color: isRoiConfigured ? 'var(--success)' : 'var(--warning)'
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isRoiConfigured ? 'var(--success)' : 'var(--warning)'
              }} />
              <span>{isRoiConfigured ? `Configured (${polygonVertices.length} pts)` : 'Not Configured'}</span>
            </div>
          </div>
        </div>

        {/* CURRENT ACTIVITY */}
        <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: '6px'
          }}>
            CURRENT ACTIVITY
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            background: currentActivity.includes('Unauthorized')
              ? 'var(--brand-red-bg)'
              : currentActivity.includes('Authorized')
                ? 'var(--success-bg)'
                : currentActivity.includes('verified') || currentActivity.includes('detected')
                  ? 'var(--warning-bg)'
                  : 'var(--bg-muted)',
            border: '1px solid',
            borderColor: currentActivity.includes('Unauthorized')
              ? 'var(--brand-red-border)'
              : currentActivity.includes('Authorized')
                ? 'var(--success-border)'
                : currentActivity.includes('verified') || currentActivity.includes('detected')
                  ? 'var(--warning-border)'
                  : 'var(--border-subtle)'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: currentActivity.includes('Unauthorized')
                ? 'var(--brand-red)'
                : currentActivity.includes('Authorized')
                  ? 'var(--success)'
                  : currentActivity.includes('verified') || currentActivity.includes('detected')
                    ? 'var(--warning)'
                    : 'var(--text-dim)'
            }} />
            <span style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: currentActivity.includes('Unauthorized')
                ? 'var(--brand-red-dark)'
                : currentActivity.includes('Authorized')
                  ? 'var(--success)'
                  : currentActivity.includes('verified') || currentActivity.includes('detected')
                    ? 'var(--warning)'
                    : 'var(--text-secondary)'
            }}>
              {currentActivity}
            </span>
          </div>
        </div>
      </div>

      {/* 2. RFID STATUS SECTION */}
      <div className="soc-card" style={{ padding: '18px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px'
        }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}>
            RFID STATUS
          </div>
          <span style={{
            fontSize: '0.72rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            color: isRfidOnline ? 'var(--success)' : 'var(--warning)'
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: isRfidOnline ? 'var(--success)' : 'var(--warning)'
            }} />
            {isRfidOnline ? 'Reader Connected' : 'Waiting for Reader'}
          </span>
        </div>

        {/* Current Active Scan State */}
        {activeToken && remainingTime > 0 ? (
          <div style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            background: activeToken.is_authorized ? 'var(--success-bg)' : 'var(--brand-red-bg)',
            border: `1px solid ${activeToken.is_authorized ? 'var(--success-border)' : 'var(--brand-red-border)'}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: activeToken.is_authorized ? 'var(--success)' : 'var(--brand-red)'
              }}>
                RFID DETECTED
              </span>
              <span style={{
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: activeToken.is_authorized ? 'var(--success)' : 'var(--brand-red)'
              }}>
                {(remainingTime / 1000).toFixed(1)}s window
              </span>
            </div>

            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {activeToken.employee_name || 'Unknown RFID'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                UID: <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>{activeToken.uid}</code>
              </div>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                marginTop: '4px',
                color: activeToken.is_authorized ? 'var(--success)' : 'var(--brand-red)'
              }}>
                Authorization: {activeToken.is_authorized ? 'Authorized' : 'Unauthorized'}
              </div>
            </div>

            {/* Window Countdown Progress */}
            <div style={{ width: '100%', height: '4px', background: 'rgba(0, 0, 0, 0.1)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                width: `${progressPct}%`,
                height: '100%',
                background: activeToken.is_authorized ? 'var(--success)' : 'var(--brand-red)',
                transition: 'width 0.1s linear'
              }} />
            </div>
          </div>
        ) : (
          <div style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-muted)',
            border: '1px dashed var(--border-medium)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Radio size={16} color="var(--text-dim)" />
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Waiting for RFID scan...
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Tap badge on reader or enter card UID below
              </div>
            </div>
          </div>
        )}

        {/* Hardware / HID Reader Input */}
        <div style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Enter card UID..."
              value={badgeInput}
              onChange={(e) => setBadgeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && badgeInput.trim()) {
                  handleManualScan(badgeInput.trim());
                  setBadgeInput('');
                }
              }}
              style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
            />
            <button
              onClick={() => {
                if (badgeInput.trim()) {
                  handleManualScan(badgeInput.trim());
                  setBadgeInput('');
                }
              }}
              className="btn btn-outline btn-sm"
              disabled={!badgeInput.trim()}
            >
              Scan
            </button>
          </div>
        </div>
      </div>

      {/* 3. ACTIVE ALERTS PANEL */}
      <div className="soc-card" style={{ padding: '18px' }}>
        <div style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: '12px'
        }}>
          ACTIVE ALERTS
        </div>

        {unauthorizedAlert ? (
          <div style={{
            background: 'var(--brand-red-bg)',
            border: '1px solid var(--brand-red-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} color="var(--brand-red)" />
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-red-dark)' }}>
                ⚠ Unauthorized Placement
              </span>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <div>Time: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{new Date(unauthorizedAlert.timestamp || Date.now()).toLocaleTimeString()}</span></div>
              <div>RFID: <span style={{ fontWeight: 600, color: 'var(--brand-red)' }}>{unauthorizedAlert.rfid || 'Not detected'}</span></div>
              <div>Object: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{unauthorizedAlert.objectId || unauthorizedAlert.object_id || 'OBJ-UNKNOWN'}</span></div>
            </div>

            {onViewEvidence && (
              <button
                onClick={() => onViewEvidence(unauthorizedAlert.event || unauthorizedAlert)}
                className="btn btn-danger btn-xs"
                style={{ alignSelf: 'flex-start', marginTop: '4px' }}
              >
                <Eye size={12} />
                <span>View Details</span>
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)'
          }}>
            <CheckCircle2 size={16} color="var(--success)" />
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--success)' }}>
                ✓ No active alerts
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                All monitored placements are currently clear.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
