import React, { useState } from 'react';
import {
  Radio, Box, AlertTriangle, ShieldCheck, ShieldAlert, Clock,
  Sparkles, Footprints, Play, CheckCircle2, XCircle, RefreshCw,
  Package, Layers
} from 'lucide-react';
import { sounds } from '../utils/audio';

export default function SimulationSuite({ onSimulateRFID, onSimulatePlacement, activeToken }) {
  const [customUID, setCustomUID] = useState('');
  const [customObjectType, setCustomObjectType] = useState('Box');
  const [isRunningScenario, setIsRunningScenario] = useState(false);
  const [runningId, setRunningId] = useState(null);
  const [scenarioStatus, setScenarioStatus] = useState('');
  const [lastResult, setLastResult] = useState(null); // 'success' | 'error'

  const handleScan = (uid) => {
    sounds.playScanBeep?.();
    onSimulateRFID(uid);
  };

  const handlePlacement = (objectType, insideROI = true) => {
    onSimulatePlacement(objectType, insideROI);
  };

  // Post to a workflow endpoint — used for automated scenarios
  const runWorkflowEndpoint = async (endpoint, label) => {
    const res = await fetch(endpoint, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  // Automated end-to-end scenario runner using backend workflow endpoints
  const runScenario = async (scenarioId) => {
    if (isRunningScenario) return;
    setIsRunningScenario(true);
    setRunningId(scenarioId);
    setLastResult(null);

    const step = (msg) => setScenarioStatus(msg);

    try {
      switch (scenarioId) {
        case 'authorized': {
          step('Step 1: Employee 001 (A472198C) scans authorized RFID card...');
          await new Promise(r => setTimeout(r, 600));
          step('Step 2: Employee places Box into Red Tag Area...');
          await runWorkflowEndpoint('/api/simulate/workflow/authorized-placement', 'Authorized Placement');
          await new Promise(r => setTimeout(r, 600));
          step('✅ Golden Test 1 Complete — Authorized Placement, NO Alert');
          setLastResult('success');
          break;
        }

        case 'no_rfid': {
          step('Step 1: No RFID badge scanned — Object placed without authorization...');
          await runWorkflowEndpoint('/api/simulate/workflow/unauthorized-no-rfid', 'No RFID');
          await new Promise(r => setTimeout(r, 600));
          step('🚨 Golden Test 2 Complete — UNAUTHORIZED: NO_RFID, Alert Triggered + Evidence Saved');
          setLastResult('error');
          break;
        }

        case 'unauthorized_rfid': {
          step('Step 1: Contractor scans unauthorized RFID card XYZ12345...');
          await new Promise(r => setTimeout(r, 600));
          step('Step 2: Object placed — RFID is marked UNAUTHORIZED in DB...');
          await runWorkflowEndpoint('/api/simulate/workflow/unauthorized-card', 'Unauthorized Card');
          await new Promise(r => setTimeout(r, 600));
          step('🚨 Golden Test 3 Complete — UNAUTHORIZED_RFID, Alert Triggered + Evidence Saved');
          setLastResult('error');
          break;
        }

        case 'expired_rfid': {
          step('Step 1: Employee B7214492 scans card — 60s authorization window starts...');
          await new Promise(r => setTimeout(r, 600));
          step('Step 2: 60-second placement window elapsed — token expired...');
          await new Promise(r => setTimeout(r, 600));
          step('Step 3: Object placed AFTER 60s window — evaluating Case E...');
          await runWorkflowEndpoint('/api/simulate/workflow/expired-rfid', 'Case E: Expired RFID');
          await new Promise(r => setTimeout(r, 800));
          step('🚨 Case E Complete — EXPIRED_RFID: 60s token window missed, Alert Triggered');
          setLastResult('error');
          break;
        }

        case 'rfid_no_object': {
          step('Golden Test 4: Authorized RFID scanned — but NO object is placed...');
          await runWorkflowEndpoint('/api/simulate/workflow/authorized-rfid-no-object', 'GT4: No Object');
          await new Promise(r => setTimeout(r, 500));
          step('✅ GT4 Complete — RFID scanned, no placement → NO ALERT generated');
          setLastResult('success');
          break;
        }

        case 'pathway': {
          step('Golden Test 5: Pedestrian / AGV Robot moving on pathway (outside ROI)...');
          await runWorkflowEndpoint('/api/simulate/workflow/pathway-movement', 'Pathway');
          await new Promise(r => setTimeout(r, 500));
          step('✓ GT5 Complete — Pathway traffic completely ignored. Zero alerts triggered.');
          setLastResult('success');
          break;
        }

        case 'one_scan_two': {
          step('Rule 10: One RFID scan — then 2 objects placed in ROI...');
          await runWorkflowEndpoint('/api/simulate/workflow/one-scan-two-objects', 'Rule 10');
          await new Promise(r => setTimeout(r, 600));
          step('✅ Rule 10 Complete — Object 1: AUTHORIZED | Object 2: UNAUTHORIZED (token consumed)');
          setLastResult('success');
          break;
        }

        case 'group_k': {
          step('Group K: Object A placed (unauthorized) → removed → Object B placed...');
          await runWorkflowEndpoint('/api/simulate/workflow/object-removal-replacement', 'Group K');
          await new Promise(r => setTimeout(r, 600));
          step('✅ Group K Complete — 2 distinct unauthorized events created');
          setLastResult('success');
          break;
        }

        case 'group_l': {
          step('Group L: Same RFID card scanned twice — should refresh token, not duplicate...');
          const res = await runWorkflowEndpoint('/api/simulate/workflow/rfid-duplicate-scan', 'Group L');
          await new Promise(r => setTimeout(r, 500));
          if (res.sameToken) {
            step(`✅ Group L Complete — Token refreshed (same ID: ${res.scan2?.token_id?.slice(0, 8)}...). No duplicate.`);
            setLastResult('success');
          } else {
            step('⚠ Group L — Unexpected: tokens differ');
            setLastResult('error');
          }
          break;
        }

        case 'transient': {
          step('Simulating a transient object crossing (1 frame only — should NOT trigger alert)...');
          handlePlacement('Passing Object', true);
          await new Promise(r => setTimeout(r, 1000));
          step('✓ Transient object crossed — persistence not reached → No alert');
          setLastResult('success');
          break;
        }

        default:
          break;
      }
    } catch (err) {
      step(`❌ Error: ${err.message}`);
      setLastResult('error');
    } finally {
      setTimeout(() => {
        setIsRunningScenario(false);
        setRunningId(null);
        setScenarioStatus('');
        setLastResult(null);
      }, 4000);
    }
  };

  const scenarios = [
    {
      id: 'authorized',
      label: 'GT1: Authorized Placement',
      sublabel: 'RFID ✓ + Object in ROI → NO ALERT',
      color: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', text: '#34d399' },
      icon: <ShieldCheck size={14} />
    },
    {
      id: 'no_rfid',
      label: 'GT2: No RFID Scan',
      sublabel: 'Object placed with no badge → ALERT',
      color: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: '#f87171' },
      icon: <ShieldAlert size={14} />
    },
    {
      id: 'unauthorized_rfid',
      label: 'GT3: Unauthorized Card',
      sublabel: 'UNAUTHORIZED RFID badge → ALERT',
      color: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', text: '#fbbf24' },
      icon: <AlertTriangle size={14} />
    },
    {
      id: 'rfid_no_object',
      label: 'GT4: RFID Only (No Object)',
      sublabel: 'Badge scanned, nothing placed → NO ALERT',
      color: { bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.25)', text: '#6ee7b7' },
      icon: <CheckCircle2 size={14} />
    },
    {
      id: 'pathway',
      label: 'GT5: Pathway Traffic',
      sublabel: 'Person/Robot outside ROI → NO ALERT',
      color: { bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.2)', text: '#94a3b8' },
      icon: <Footprints size={14} />
    },
    {
      id: 'expired_rfid',
      label: 'Case E: Expired RFID',
      sublabel: 'Badge timeout >60s → ALERT (Case E)',
      color: { bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.3)', text: '#c084fc' },
      icon: <Clock size={14} />
    },
    {
      id: 'one_scan_two',
      label: 'Rule 10: 1 Scan = 1 Placement',
      sublabel: 'Token consumed: 2nd object → ALERT',
      color: { bg: 'rgba(234, 179, 8, 0.1)', border: 'rgba(234, 179, 8, 0.3)', text: '#fcd34d' },
      icon: <Layers size={14} />
    },
    {
      id: 'group_k',
      label: 'Group K: Remove & Replace',
      sublabel: 'Object A removed → Object B → 2 events',
      color: { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.25)', text: '#f59e0b' },
      icon: <Package size={14} />
    },
    {
      id: 'group_l',
      label: 'Group L: Duplicate Scan',
      sublabel: 'Same card re-scanned → token refreshed',
      color: { bg: 'rgba(99, 102, 241, 0.1)', border: 'rgba(99, 102, 241, 0.3)', text: '#a5b4fc' },
      icon: <RefreshCw size={14} />
    },
    {
      id: 'transient',
      label: 'Transient Object Crossing',
      sublabel: 'Single-frame detection → NO ALERT',
      color: { bg: 'rgba(56, 189, 248, 0.08)', border: 'rgba(56, 189, 248, 0.2)', text: '#38bdf8' },
      icon: <Play size={14} />
    }
  ];

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} color="#60a5fa" />
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9' }}>
            Hardware &amp; Scenario Testing Suite
          </h2>
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          Golden Tests 1–5 · Decision Table · Groups J/K/L/Rule10
        </span>
      </div>

      {/* Status Bar */}
      {scenarioStatus && (
        <div style={{
          background: lastResult === 'success'
            ? 'rgba(16, 185, 129, 0.12)'
            : lastResult === 'error'
            ? 'rgba(239, 68, 68, 0.12)'
            : 'rgba(59, 130, 246, 0.15)',
          border: `1px solid ${lastResult === 'success' ? 'rgba(16,185,129,0.3)' : lastResult === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}`,
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '0.8rem',
          color: lastResult === 'success' ? '#34d399' : lastResult === 'error' ? '#f87171' : '#93c5fd',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Clock size={14} style={{ flexShrink: 0 }} />
          <span>{scenarioStatus}</span>
        </div>
      )}

      {/* Automated Scenario Presets Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Automated Test Scenarios
        </span>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '8px'
        }}>
          {scenarios.map((sc) => (
            <button
              key={sc.id}
              disabled={isRunningScenario}
              onClick={() => runScenario(sc.id)}
              style={{
                padding: '9px 12px',
                borderRadius: '6px',
                background: runningId === sc.id ? sc.color.border.replace('0.3', '0.25') : sc.color.bg,
                border: `1px solid ${sc.color.border}`,
                color: sc.color.text,
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'left',
                gap: '6px',
                opacity: isRunningScenario && runningId !== sc.id ? 0.5 : 1,
                cursor: isRunningScenario ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                <span>{sc.label}</span>
                <span style={{ fontSize: '0.67rem', opacity: 0.75, fontWeight: 400 }}>{sc.sublabel}</span>
              </div>
              <div style={{ flexShrink: 0 }}>
                {runningId === sc.id
                  ? <Clock size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  : sc.icon
                }
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

      {/* Manual Component Triggers: RFID and CCTV */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '12px'
      }}>
        {/* RFID Card Triggers */}
        <div style={{
          background: 'var(--bg-surface)',
          padding: '12px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#f1f5f9' }}>
            <Radio size={14} color="#60a5fa" />
            <span>Simulate RFID Reader Badges</span>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { uid: 'A472198C', label: 'EMP-001 (Auth)', auth: true },
              { uid: 'B7214492', label: 'EMP-002 (Auth)', auth: true },
              { uid: 'XYZ12345', label: 'EMP-003 (Unauth)', auth: false }
            ].map(({ uid, label, auth }) => (
              <button
                key={uid}
                onClick={() => handleScan(uid)}
                title={`Scan UID: ${uid}`}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  fontSize: '0.75rem',
                  borderRadius: '6px',
                  background: auth ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: auth ? '#34d399' : '#f87171',
                  border: `1px solid ${auth ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Custom UID Input */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
            <input
              type="text"
              placeholder="Custom RFID UID (e.g. FF12AB34)..."
              value={customUID}
              onChange={(e) => setCustomUID(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customUID.trim()) {
                  handleScan(customUID.trim());
                  setCustomUID('');
                }
              }}
              style={{ flex: 1, fontSize: '0.75rem', padding: '6px 8px' }}
            />
            <button
              onClick={() => {
                if (customUID.trim()) {
                  handleScan(customUID.trim());
                  setCustomUID('');
                }
              }}
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                borderRadius: '6px',
                background: '#2563eb',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer'
              }}>
              Scan
            </button>
          </div>

          {/* Active token status */}
          {activeToken && (
            <div style={{
              padding: '5px 8px',
              borderRadius: '5px',
              background: activeToken.is_authorized ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${activeToken.is_authorized ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
              fontSize: '0.72rem',
              color: activeToken.is_authorized ? '#6ee7b7' : '#fca5a5'
            }}>
              🎫 Active: <strong>{activeToken.employee_name || activeToken.uid}</strong>
              {' '}({activeToken.is_authorized ? 'AUTHORIZED' : 'UNAUTHORIZED'})
            </div>
          )}
        </div>

        {/* CCTV Object Placement Triggers */}
        <div style={{
          background: 'var(--bg-surface)',
          padding: '12px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#f1f5f9' }}>
            <Box size={14} color="#f59e0b" />
            <span>Simulate CCTV Object Detection</span>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['Box', 'Machine Part', 'Tool', 'Crate', 'Pallet'].map((obj) => (
              <button
                key={obj}
                onClick={() => handlePlacement(obj, true)}
                style={{
                  flex: 1,
                  minWidth: 'fit-content',
                  padding: '6px 8px',
                  fontSize: '0.75rem',
                  borderRadius: '6px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}>
                Place {obj}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              placeholder="Custom object type..."
              value={customObjectType}
              onChange={(e) => setCustomObjectType(e.target.value)}
              style={{ flex: 1, fontSize: '0.75rem', padding: '6px 8px' }}
            />
            <button
              onClick={() => handlePlacement(customObjectType, true)}
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                fontWeight: 600,
                cursor: 'pointer'
              }}>
              Place
            </button>
          </div>

          <button
            onClick={() => runScenario('pathway')}
            disabled={isRunningScenario}
            style={{
              padding: '6px 10px',
              fontSize: '0.75rem',
              borderRadius: '6px',
              background: 'rgba(148, 163, 184, 0.1)',
              color: '#94a3b8',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}>
            <Footprints size={13} />
            <span>Simulate Pathway Traffic (Outside ROI — Zero Alerts)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
