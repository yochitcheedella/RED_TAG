import React, { useState, useEffect } from 'react';
import { X, Settings, Radio, Camera, Save, RefreshCw, Check, Shield, Eye, Coffee } from 'lucide-react';

export default function SettingsModal({ settings, systemStatus, onSaveSettings, onClose }) {
  const [formData, setFormData] = useState({
    auth_window_ms: '60000',
    persistence_ms: '1000',
    persistence_frames: '5',
    confidence_threshold: '0.40',
    evidence_padding_px: '20',
    rtsp_url: '',
    serial_port: '',
    baud_rate: '9600',
    capture_authorized_evidence: 'true'
  });
  const [availablePorts, setAvailablePorts] = useState([]);
  const [isScanningPorts, setIsScanningPorts] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData({
        auth_window_ms: String(settings.auth_window_ms || '60000'),
        persistence_ms: String(settings.persistence_ms || '1000'),
        persistence_frames: String(settings.persistence_frames || '5'),
        confidence_threshold: String(settings.confidence_threshold || '0.40'),
        evidence_padding_px: String(settings.evidence_padding_px || '20'),
        rtsp_url: settings.rtsp_url || '',
        serial_port: settings.serial_port || '',
        baud_rate: String(settings.baud_rate || '9600'),
        capture_authorized_evidence: String(settings.capture_authorized_evidence ?? 'true')
      });
    }
    fetchSerialPorts();
  }, [settings]);

  const fetchSerialPorts = async () => {
    setIsScanningPorts(true);
    try {
      const res = await fetch('/api/serial-ports');
      const data = await res.json();
      setAvailablePorts(data);
    } catch (err) {
      console.warn('Could not list serial ports:', err);
    } finally {
      setIsScanningPorts(false);
    }
  };

  const set = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

  const handleSave = (e) => {
    e.preventDefault();
    onSaveSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const FieldDivider = () => (
    <div style={{ height: '1px', background: 'var(--border-subtle)' }} />
  );

  const SectionLabel = ({ icon, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '2px' }}>
      {icon}
      {children}
    </div>
  );

  const HelpText = ({ children }) => (
    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{children}</span>
  );

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        width: '100%',
        maxWidth: '580px',
        maxHeight: '90vh',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={18} color="#60a5fa" />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
              System Configuration &amp; Thresholds
            </h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <form onSubmit={handleSave} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

            {/* 1. RFID Authorization Window */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                <span>RFID Authorization Sliding Window</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#3b82f6' }}>
                  {(parseInt(formData.auth_window_ms, 10) / 1000).toFixed(1)} seconds
                </span>
              </label>
              <input
                type="range" min="1000" max="180000" step="1000"
                value={formData.auth_window_ms}
                onChange={(e) => set('auth_window_ms', e.target.value)}
                style={{ width: '100%', accentColor: '#3b82f6' }}
              />
              <HelpText>
                Placement must be confirmed within this window after an RFID scan. Scans expire automatically (Case E in Decision Table).
              </HelpText>
            </div>

            <FieldDivider />

            {/* 2. Persistence Confirmation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                <span>Multi-Frame Persistence Confirmation</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#10b981' }}>
                  {(parseInt(formData.persistence_ms, 10) / 1000).toFixed(1)}s · {formData.persistence_frames} frames
                </span>
              </label>
              <input
                type="range" min="400" max="3000" step="200"
                value={formData.persistence_ms}
                onChange={(e) => {
                  const ms = parseInt(e.target.value, 10);
                  set('persistence_ms', e.target.value);
                  set('persistence_frames', String(Math.max(2, Math.round(ms / 200))));
                }}
                style={{ width: '100%', accentColor: '#10b981' }}
              />
              <HelpText>
                Object must stay stationary inside the Red Tag ROI for this duration before a placement event is triggered (Rules 14–16). Eliminates shadows and transient crossings.
              </HelpText>
            </div>

            <FieldDivider />

            {/* 3. Object Detection Confidence Threshold */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Eye size={13} color="#f59e0b" /> Object Detection Confidence Threshold
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>
                  {Math.round(parseFloat(formData.confidence_threshold) * 100)}%
                </span>
              </label>
              <input
                type="range" min="0.10" max="0.90" step="0.05"
                value={formData.confidence_threshold}
                onChange={(e) => set('confidence_threshold', e.target.value)}
                style={{ width: '100%', accentColor: '#f59e0b' }}
              />
              <HelpText>
                Minimum AI confidence required before a detection is passed to the persistence tracker. Lower values detect more objects but may increase false positives.
              </HelpText>
            </div>

            <FieldDivider />

            {/* 4. Evidence Crop Padding */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={13} color="#c084fc" /> Evidence Crop Padding (Privacy Rule 17)
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#c084fc' }}>
                  {formData.evidence_padding_px}px
                </span>
              </label>
              <input
                type="range" min="5" max="60" step="5"
                value={formData.evidence_padding_px}
                onChange={(e) => set('evidence_padding_px', e.target.value)}
                style={{ width: '100%', accentColor: '#c084fc' }}
              />
              <HelpText>
                Object-only evidence bounding box will be expanded by this many pixels on each side. Ensures the full object is visible while maintaining zero-human privacy standard.
              </HelpText>
            </div>

            <FieldDivider />

            {/* 5. Capture Evidence for Authorized Placements Toggle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={13} color="#10b981" /> Capture Evidence for Authorized Placements
                </span>
                <input
                  type="checkbox"
                  checked={formData.capture_authorized_evidence === 'true'}
                  onChange={(e) => set('capture_authorized_evidence', e.target.checked ? 'true' : 'false')}
                  style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                />
              </label>
              <HelpText>
                When enabled, cropped object photos are captured and viewable for authorized item deposits as well as unauthorized placement violations.
              </HelpText>
            </div>

            <FieldDivider />

            {/* 5. Serial Port */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SectionLabel icon={<Radio size={14} color="#60a5fa" />}>
                  Physical RFID Reader Serial Port
                </SectionLabel>
                <button
                  type="button"
                  onClick={fetchSerialPorts}
                  style={{ fontSize: '0.72rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <RefreshCw size={12} className={isScanningPorts ? 'beacon-dot' : ''} />
                  {isScanningPorts ? 'Scanning...' : 'Refresh Ports'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                <select
                  value={formData.serial_port}
                  onChange={(e) => set('serial_port', e.target.value)}>
                  <option value="">Virtual Reader (Simulator Ready)</option>
                  {availablePorts.map((p) => (
                    <option key={p.path} value={p.path}>
                      {p.path} ({p.manufacturer})
                    </option>
                  ))}
                </select>

                <select
                  value={formData.baud_rate}
                  onChange={(e) => set('baud_rate', e.target.value)}>
                  <option value="9600">9600 Baud</option>
                  <option value="19200">19200 Baud</option>
                  <option value="38400">38400 Baud</option>
                  <option value="115200">115200 Baud</option>
                </select>
              </div>
              <HelpText>
                Standard USB/Serial RFID card readers (COM ports). When blank, system runs seamlessly in software simulator mode.
              </HelpText>
            </div>

            <FieldDivider />

            {/* 6. RTSP Stream URL */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <SectionLabel icon={<Camera size={14} color="#f87171" />}>
                CCTV Camera RTSP Stream URL (Optional)
              </SectionLabel>
              <input
                type="text"
                placeholder="rtsp://admin:password@192.168.1.100:554/stream1"
                value={formData.rtsp_url}
                onChange={(e) => set('rtsp_url', e.target.value)}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
              />
              <HelpText>
                Leave blank to use the browser webcam (default). RTSP streams require the Java processing service on port 8080 to be running.
              </HelpText>
            </div>

            <FieldDivider />

            {/* 7. Java 25 LTS Industrial Engine */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SectionLabel icon={<Coffee size={14} color="#c084fc" />}>
                  Java 25 Industrial Engine &amp; Parallel Core
                </SectionLabel>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: systemStatus?.javaService?.online ? '#34d399' : '#f87171',
                  background: systemStatus?.javaService?.online ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: `1px solid ${systemStatus?.javaService?.online ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                }}>
                  {systemStatus?.javaService?.online ? '● ONLINE (SYNCED)' : '○ OFFLINE'}
                </span>
              </div>

              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '10px'
              }}>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>REST Micro-Bridge</div>
                  <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>:8080 /api</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Industrial RFID TCP</div>
                  <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: '#34d399' }}>tcp://:9090</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Engine Version</div>
                  <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: '#c084fc' }}>{systemStatus?.javaService?.engine || 'Java-LTS-25'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Tracked Inventory</div>
                  <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: '#fbbf24' }}>{systemStatus?.javaService?.inventoryCount ?? 0} items</div>
                </div>
              </div>

              <HelpText>
                High-performance Spatio-Temporal Correlation and Debounce engine running concurrently. Synchronizes frame detections and raw RFID tags in parallel with Node.js.
              </HelpText>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '4px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.8rem'
                }}>
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 20px',
                  borderRadius: '6px',
                  background: savedSuccess ? '#10b981' : '#2563eb',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.8rem'
                }}>
                {savedSuccess ? <Check size={16} /> : <Save size={16} />}
                {savedSuccess ? 'Settings Applied!' : 'Save Configuration'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
