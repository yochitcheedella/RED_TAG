import React, { useState, useEffect } from 'react';
import {
  Cpu, Radio, RefreshCw, Layers, ShieldCheck, ShieldAlert,
  Send, Box, ArrowRight, CheckCircle2, Clock, AlertCircle
} from 'lucide-react';

const STATE_COLORS = {
  EXISTING_ITEM: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' },
  DEBOUNCING:    { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' },
  DETECTING:     { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' },
  IN_TRANSIT:    { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' },
  OCCLUDED:      { bg: 'rgba(239, 68, 68, 0.15)',  text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' }
};

export default function JavaDiagnosticsPanel({ systemStatus }) {
  const [inventory, setInventory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [testUID, setTestUID] = useState('A472198C');
  const [tcpStatus, setTcpStatus] = useState(null);

  const fetchInventory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/java/inventory');
      if (res.ok) {
        const data = await res.json();
        setInventory(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('Could not fetch Java inventory:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
    if (!autoRefresh) return;
    const interval = setInterval(fetchInventory, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const sendTestRFID = async () => {
    if (!testUID.trim()) return;
    setTcpStatus('transmitting');
    try {
      const res = await fetch('/api/simulate/rfid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: testUID.trim() })
      });
      if (res.ok) {
        setTcpStatus('success');
        setTimeout(() => setTcpStatus(null), 2000);
        fetchInventory();
      } else {
        setTcpStatus('error');
      }
    } catch {
      setTcpStatus('error');
    }
  };

  const engineOnline = systemStatus?.javaService?.online;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '18px',
      boxShadow: 'var(--shadow-card)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'rgba(192, 132, 252, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(192, 132, 252, 0.3)'
          }}>
            <Cpu size={20} color="#c084fc" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#f1f5f9' }}>
              Java 25 LTS Industrial Core &amp; Memory Tracking Diagnostics
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Real-time Spatio-Temporal Correlation, 60-Second Debounce Engine, and Relocation Inventory Pool
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setAutoRefresh(v => !v)}
            style={{
              padding: '6px 12px',
              fontSize: '0.75rem',
              borderRadius: '6px',
              background: autoRefresh ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-surface)',
              color: autoRefresh ? '#34d399' : 'var(--text-secondary)',
              border: `1px solid ${autoRefresh ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-subtle)'}`,
              cursor: 'pointer'
            }}>
            Auto-Refresh: {autoRefresh ? 'ON (3s)' : 'OFF'}
          </button>

          <button
            onClick={fetchInventory}
            disabled={isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
            <RefreshCw size={13} className={isLoading ? 'beacon-dot' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Subsystem Health Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px'
      }}>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px'
        }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>REST Micro-Bridge</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: engineOnline ? '#34d399' : '#f87171', marginTop: '2px' }}>
            {engineOnline ? 'ONLINE' : 'OFFLINE'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: '#60a5fa', marginTop: '2px' }}>
            http://localhost:8080
          </div>
        </div>

        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px'
        }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Industrial RFID TCP Listener</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#34d399', marginTop: '2px' }}>
            LISTENING
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: '#60a5fa', marginTop: '2px' }}>
            tcp://localhost:9090
          </div>
        </div>

        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px'
        }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Stationary Debounce Policy</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', marginTop: '2px' }}>
            60,000ms
          </div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
            Velocity threshold: 12 px/s
          </div>
        </div>

        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px'
        }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Settlement &amp; Occlusion</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#c084fc', marginTop: '2px' }}>
            30s / 8s Grace
          </div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
            NEW → EXISTING transition
          </div>
        </div>
      </div>

      {/* Industrial RFID Tag Transmitter Bar */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Radio size={16} color="#60a5fa" />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f1f5f9' }}>
            Industrial RFID Test Packet Transmitter
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['A472198C', 'B7214492', 'XYZ12345'].map(uid => (
              <button
                key={uid}
                type="button"
                onClick={() => setTestUID(uid)}
                style={{
                  padding: '3px 8px',
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono)',
                  borderRadius: '4px',
                  background: testUID === uid ? '#2563eb' : 'rgba(255, 255, 255, 0.05)',
                  color: '#fff',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer'
                }}>
                {uid}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={testUID}
            onChange={(e) => setTestUID(e.target.value.toUpperCase())}
            placeholder="TAG UID"
            style={{
              padding: '4px 8px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              width: '110px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              background: '#0d1117',
              color: '#e2e8f0'
            }}
          />

          <button
            onClick={sendTestRFID}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 12px',
              borderRadius: '4px',
              background: tcpStatus === 'success' ? '#10b981' : tcpStatus === 'error' ? '#ef4444' : '#2563eb',
              color: '#fff',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
            <Send size={12} />
            {tcpStatus === 'success' ? 'Dispatched' : tcpStatus === 'error' ? 'Failed' : 'Transmit'}
          </button>
        </div>
      </div>

      {/* Memory Tracking Pool Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9' }}>
            <Layers size={14} color="#38bdf8" />
            Active Memory Tracking Pool ({inventory.length} items recorded)
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Maintained by MemoryTrackingEngine.java
          </span>
        </div>

        <div style={{
          overflowX: 'auto',
          maxHeight: '340px',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Object ID</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Classification</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Engine State</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Authorization Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Correlated RFID Badge</th>
              </tr>
            </thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No objects currently registered in the Java memory pool. Run simulations or place items to track.
                  </td>
                </tr>
              ) : (
                inventory.map((item, idx) => {
                  const stateCfg = STATE_COLORS[item.state] || { bg: 'rgba(148,163,184,0.1)', text: '#94a3b8', border: 'transparent' };
                  return (
                    <tr
                      key={item.id || idx}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)'
                      }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: '#60a5fa', fontWeight: 600 }}>
                        {item.id}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#f1f5f9', fontWeight: 500 }}>
                        {item.label}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: stateCfg.bg,
                          color: stateCfg.text,
                          border: `1px solid ${stateCfg.border}`,
                          fontFamily: 'var(--font-mono)'
                        }}>
                          {item.state}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {item.is_authorized ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#34d399', fontWeight: 600 }}>
                            <ShieldCheck size={13} /> Authorized
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f87171', fontWeight: 600 }}>
                            <ShieldAlert size={13} /> Unauthorized
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: item.rfid_uid ? '#38bdf8' : 'var(--text-muted)' }}>
                        {item.rfid_uid || 'None (No Badge Scanned)'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
