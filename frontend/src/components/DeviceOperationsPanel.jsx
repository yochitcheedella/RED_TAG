import React, { useState } from 'react';
import { Camera, Radio, ShieldCheck, ShieldAlert, Cpu, Database, Volume2, VolumeX, RefreshCw, KeyRound, Check, AlertCircle, Play, Sparkles, Sliders, Coffee } from 'lucide-react';
import { sounds } from '../utils/audio';

export default function DeviceOperationsPanel({
  onSimulateRFID,
  activeToken,
  systemStatus,
  polygonVertices,
  appMode = 'test',
  onToggleAppMode
}) {
  const [badgeInput, setBadgeInput] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [scenarioFeedback, setScenarioFeedback] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleManualScan = (uid) => {
    if (!uid) return;
    sounds.playScanBeep();
    onSimulateRFID(uid);
    setScenarioFeedback(`Badge ${uid} Processed`);
    setTimeout(() => setScenarioFeedback(null), 3000);
  };

  const toggleMute = () => {
    const muted = sounds.toggleMute();
    setIsMuted(muted);
  };

  // Run backend scenario workflow (Rules 30, 32 & 41)
  const runWorkflow = async (endpoint, name) => {
    if (isExecuting) return;
    setIsExecuting(true);
    setScenarioFeedback(`Executing: ${name}...`);
    sounds.playScanBeep();

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setScenarioFeedback(`Completed: ${name}`);
      setTimeout(() => setScenarioFeedback(null), 4000);
    } catch (err) {
      setScenarioFeedback(`Error executing ${name}: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

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
      {/* Top Header with Mode Switcher (Rules 30 & 31) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Radio size={16} color={appMode === 'hardware' ? '#10b981' : '#f59e0b'} />
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9' }}>
            System Operations & Controls
          </h2>
        </div>

        {/* Dual Mode Switch (Rules 30 & 31) */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-surface)',
          padding: '3px',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)'
        }}>
          <button
            onClick={() => onToggleAppMode && onToggleAppMode('test')}
            style={{
              padding: '4px 10px',
              fontSize: '0.72rem',
              fontWeight: 700,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: appMode === 'test' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
              color: appMode === 'test' ? '#fbbf24' : 'var(--text-secondary)'
            }}>
            TEST MODE
          </button>
          <button
            onClick={() => onToggleAppMode && onToggleAppMode('hardware')}
            style={{
              padding: '4px 10px',
              fontSize: '0.72rem',
              fontWeight: 700,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: appMode === 'hardware' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              color: appMode === 'hardware' ? '#34d399' : 'var(--text-secondary)'
            }}>
            HARDWARE MODE
          </button>
        </div>
      </div>

      {/* Mode Indicator Banner */}
      {appMode === 'test' ? (
        <div style={{
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '8px',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: '#fde047'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={14} color="#f59e0b" />
            <strong>DEVELOPMENT / TEST MODE</strong>
          </div>
          <span style={{ fontSize: '0.68rem', color: '#fef08a' }}>
            Simulates real events through internal event pipeline
          </span>
        </div>
      ) : (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '8px',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: '#6ee7b7'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="beacon-dot" style={{ background: '#10b981' }}></span>
            <strong>PRODUCTION / HARDWARE MODE</strong>
          </div>
          <span style={{ fontSize: '0.68rem', color: '#a7f3d0' }}>
            Live Logitech C920 Camera & Serial RFID Active
          </span>
        </div>
      )}

      {/* Scenario Feedback Alert */}
      {scenarioFeedback && (
        <div style={{
          background: 'rgba(59, 130, 246, 0.15)',
          border: '1px solid rgba(59, 130, 246, 0.35)',
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '0.75rem',
          color: '#93c5fd',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <RefreshCw size={12} className={isExecuting ? 'spin' : ''} />
          <span>{scenarioFeedback}</span>
        </div>
      )}

      {/* SECTION 30: TEST MODE CONTROLS (Rendered in Test Mode) */}
      {appMode === 'test' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Core Test Pipeline Triggers (Section 30)
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '8px'
          }}>
            {/* 1. TEST RFID AUTHORIZED */}
            <button
              disabled={isExecuting}
              onClick={() => handleManualScan('A472198C')}
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#34d399',
                fontSize: '0.72rem',
                fontWeight: 700,
                textAlign: 'left',
                cursor: 'pointer'
              }}>
              [TEST RFID AUTHORIZED]
              <div style={{ fontSize: '0.65rem', color: '#a7f3d0', marginTop: '2px', fontWeight: 400 }}>
                EMP-001 (A472198C)
              </div>
            </button>

            {/* 2. TEST RFID UNAUTHORIZED */}
            <button
              disabled={isExecuting}
              onClick={() => handleManualScan('XYZ12345')}
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#f87171',
                fontSize: '0.72rem',
                fontWeight: 700,
                textAlign: 'left',
                cursor: 'pointer'
              }}>
              [TEST RFID UNAUTHORIZED]
              <div style={{ fontSize: '0.65rem', color: '#fca5a5', marginTop: '2px', fontWeight: 400 }}>
                EMP-003 (XYZ12345)
              </div>
            </button>

            {/* 3. TEST OBJECT PLACEMENT */}
            <button
              disabled={isExecuting}
              onClick={() => runWorkflow('/api/simulate/placement', 'Object Placement')}
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                color: '#60a5fa',
                fontSize: '0.72rem',
                fontWeight: 700,
                textAlign: 'left',
                cursor: 'pointer'
              }}>
              [TEST OBJECT PLACEMENT]
              <div style={{ fontSize: '0.65rem', color: '#93c5fd', marginTop: '2px', fontWeight: 400 }}>
                Box placed inside ROI
              </div>
            </button>

            {/* 4. TEST AUTHORIZED PLACEMENT */}
            <button
              disabled={isExecuting}
              onClick={() => runWorkflow('/api/simulate/workflow/authorized-placement', 'Authorized Placement (Scan + Place)')}
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.25)',
                border: '1px solid rgba(16, 185, 129, 0.5)',
                color: '#ffffff',
                fontSize: '0.72rem',
                fontWeight: 700,
                textAlign: 'left',
                cursor: 'pointer'
              }}>
              [TEST AUTHORIZED PLACEMENT]
              <div style={{ fontSize: '0.65rem', color: '#d1fae5', marginTop: '2px', fontWeight: 400 }}>
                Scan + Place (No Alert)
              </div>
            </button>

            {/* 5. TEST UNAUTHORIZED PLACEMENT */}
            <button
              disabled={isExecuting}
              onClick={() => runWorkflow('/api/simulate/workflow/unauthorized-no-rfid', 'Unauthorized Placement (No Scan)')}
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                background: 'rgba(220, 38, 38, 0.3)',
                border: '1px solid #ef4444',
                color: '#ffffff',
                fontSize: '0.72rem',
                fontWeight: 700,
                textAlign: 'left',
                cursor: 'pointer'
              }}>
              [TEST UNAUTHORIZED PLACEMENT]
              <div style={{ fontSize: '0.65rem', color: '#fee2e2', marginTop: '2px', fontWeight: 400 }}>
                Place Without Scan (Alert)
              </div>
            </button>
          </div>

          {/* Additional Acceptance Test Scenarios (Rule 41) */}
          <div style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Edge Case Workflows (Section 20 &amp; 41)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px' }}>
            <button
              disabled={isExecuting}
              onClick={() => runWorkflow('/api/simulate/workflow/one-scan-two-objects', '1-Scan = 1-Placement (Rule 10)')}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: '#e2e8f0',
                fontSize: '0.7rem',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer'
              }}>
              1 Scan = 2 Placements (Rule 10)
            </button>

            <button
              disabled={isExecuting}
              onClick={() => runWorkflow('/api/simulate/workflow/pathway-movement', 'Pathway Movement')}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: '#e2e8f0',
                fontSize: '0.7rem',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer'
              }}>
              GT5: Pathway Person/Robot (No Alert)
            </button>

            <button
              disabled={isExecuting}
              onClick={() => runWorkflow('/api/simulate/workflow/transient-object', 'Transient Crossing')}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: '#e2e8f0',
                fontSize: '0.7rem',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer'
              }}>
              Transient Object Crossing (No Alert)
            </button>

            <button
              disabled={isExecuting}
              onClick={() => runWorkflow('/api/simulate/workflow/authorized-rfid-no-object', 'GT4: Authorized RFID No Object')}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: '#6ee7b7',
                fontSize: '0.7rem',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer'
              }}>
              GT4: RFID No Object (No Alert)
            </button>

            <button
              disabled={isExecuting}
              onClick={() => runWorkflow('/api/simulate/workflow/rfid-duplicate-scan', 'Group L: Duplicate RFID Scan')}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                color: '#a5b4fc',
                fontSize: '0.7rem',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer'
              }}>
              Group L: Duplicate RFID Scan
            </button>

            <button
              disabled={isExecuting}
              onClick={() => runWorkflow('/api/simulate/workflow/object-removal-replacement', 'Group K: Remove + Replace Object')}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#fcd34d',
                fontSize: '0.7rem',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer'
              }}>
              Group K: Remove &amp; Replace Object
            </button>

            <button
              disabled={isExecuting}
              onClick={async () => {
                setIsExecuting(true);
                setScenarioFeedback('Clearing all object trackers...');
                try {
                  await fetch('/api/vision/clear-objects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                  });
                  window.dispatchEvent(new CustomEvent('redtag:clear_objects'));
                  setScenarioFeedback('Object trackers cleared — next placement will trigger fresh event.');
                  setTimeout(() => setScenarioFeedback(null), 4000);
                } catch (err) {
                  setScenarioFeedback('Error: ' + err.message);
                } finally {
                  setIsExecuting(false);
                }
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: '0.7rem',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer'
              }}>
              🧹 Clear Object Trackers (Reset)
            </button>
          </div>
        </div>
      )}

      {/* HARDWARE MODE SECTION */}
      {appMode === 'hardware' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Hardware Telemetry Cards (Rule 21) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '8px'
          }}>
            <div style={{ background: 'var(--bg-surface)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                <Camera size={12} color="#38bdf8" />
                <span>CCTV Camera</span>
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#f1f5f9', marginTop: '2px' }}>
                Logitech C920
              </div>
              <div style={{ fontSize: '0.65rem', color: '#10b981', marginTop: '2px' }}>
                ● Video Stream Active
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                <Radio size={12} color="#f59e0b" />
                <span>RFID Reader</span>
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#f1f5f9', marginTop: '2px' }}>
                {systemStatus?.rfid?.port || 'COM / Serial'}
              </div>
              <div style={{ fontSize: '0.65rem', color: systemStatus?.rfid?.connected ? '#10b981' : '#f59e0b', marginTop: '2px' }}>
                {systemStatus?.rfid?.connected ? '● Serial Port Open' : '○ Standby Listener'}
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                <Cpu size={12} color="#a855f7" />
                <span>AI Vision Engine</span>
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#f1f5f9', marginTop: '2px' }}>
                COCO-SSD Real-Time
              </div>
              <div style={{ fontSize: '0.65rem', color: '#10b981', marginTop: '2px' }}>
                ● Spatial Filter Active
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                <Coffee size={12} color="#c084fc" />
                <span>Java Industrial Engine</span>
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#f1f5f9', marginTop: '2px' }}>
                :8080 &amp; tcp://:9090
              </div>
              <div style={{ fontSize: '0.65rem', color: systemStatus?.javaService?.online ? '#10b981' : '#f59e0b', marginTop: '2px' }}>
                {systemStatus?.javaService?.online ? '● Spatio-Temporal Sync' : '○ Standby Engine'}
              </div>
            </div>
          </div>

          {/* Quick Instant Placement Alert Check Button */}
          <button
            onClick={async () => {
              sounds.playScanBeep();
              await fetch('/api/vision/placement-confirmed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  objectType: 'Physical Floor Object',
                  box: { x: 250, y: 300, width: 80, height: 70 }
                })
              });
            }}
            style={{
              padding: '10px 14px',
              fontSize: '0.78rem',
              fontWeight: 700,
              borderRadius: '6px',
              background: '#d97706',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 2px 8px rgba(217, 119, 6, 0.3)'
            }}>
            <AlertCircle size={15} />
            <span>🚨 Trigger Live Placement Verification Check</span>
          </button>
        </div>
      )}

      {/* Manual RFID UID Badge Input (Usable in both modes) */}
      <div style={{
        background: 'var(--bg-surface)',
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 600, color: '#f1f5f9' }}>
          <KeyRound size={13} color="#60a5fa" />
          <span>Manual Badge Swipe / Entry</span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="Enter or scan RFID UID (e.g. A472198C)..."
            value={badgeInput}
            onChange={(e) => setBadgeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && badgeInput.trim()) {
                handleManualScan(badgeInput.trim());
                setBadgeInput('');
              }
            }}
            style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: '#fff' }}
          />
          <button
            onClick={() => {
              if (badgeInput.trim()) {
                handleManualScan(badgeInput.trim());
                setBadgeInput('');
              }
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '4px',
              background: '#2563eb',
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer'
            }}>
            Authorize
          </button>
        </div>
      </div>

      {/* Footer controls: Siren mute and vertex info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px' }}>
        <button
          onClick={toggleMute}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.72rem',
            color: isMuted ? 'var(--text-muted)' : '#f1f5f9',
            background: 'var(--bg-surface)',
            padding: '5px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            cursor: 'pointer'
          }}>
          {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          <span>{isMuted ? 'Siren Muted' : 'Siren Audio Active'}</span>
        </button>

        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {polygonVertices?.length || 4} ROI Vertices Calibrated
        </span>
      </div>
    </div>
  );
}
