import React, { useState, useEffect } from 'react';
import { X, Settings, Radio, Camera, Save, RefreshCw, Check, Shield, Eye, Sliders, Wrench, ShieldCheck, AlertTriangle, Terminal, Mail, Send } from 'lucide-react';
import SimulationSuite from './SimulationSuite';

export default function SettingsModal({
  settings,
  systemStatus,
  onSaveSettings,
  onClose,
  onSimulateRFID,
  onSimulatePlacement,
  activeToken,
  userRole = 'admin'
}) {
  const [activeTab, setActiveTab] = useState('detection'); // 'camera', 'rfid', 'roi', 'detection', 'alerts', 'developer'

  const [formData, setFormData] = useState({
    auth_window_ms: '60000',
    persistence_ms: '5000', // Default 5.0 seconds
    confidence_threshold: '0.35',
    evidence_padding_px: '20',
    rtsp_url: '',
    serial_port: '',
    baud_rate: '9600',
    capture_authorized_evidence: 'true',
    alert_auto_dismiss: 'false',
    alert_email_recipient: 'yochitcheedella@gmail.com'
  });

  const [availablePorts, setAvailablePorts] = useState([]);
  const [isScanningPorts, setIsScanningPorts] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState('idle'); // idle | sending | success | error
  const [testEmailDetails, setTestEmailDetails] = useState(null);

  useEffect(() => {
    if (settings) {
      setFormData({
        auth_window_ms: String(settings.auth_window_ms || '60000'),
        persistence_ms: String(settings.persistence_ms || '5000'),
        confidence_threshold: String(settings.confidence_threshold || '0.35'),
        evidence_padding_px: String(settings.evidence_padding_px || '20'),
        rtsp_url: settings.rtsp_url || '',
        serial_port: settings.serial_port || '',
        baud_rate: String(settings.baud_rate || '9600'),
        capture_authorized_evidence: String(settings.capture_authorized_evidence ?? 'true'),
        alert_auto_dismiss: String(settings.alert_auto_dismiss ?? 'false'),
        alert_email_recipient: settings.alert_email_recipient || 'yochitcheedella@gmail.com'
      });
    }
    fetchSerialPorts();
  }, [settings]);

  const handleTestEmail = async () => {
    setTestEmailStatus('sending');
    try {
      const res = await fetch('/api/alerts/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.alert_email_recipient || 'yochitcheedella@gmail.com' })
      });
      const data = await res.json();
      if (data.success) {
        setTestEmailDetails(data);
        setTestEmailStatus('success');
        setTimeout(() => setTestEmailStatus('idle'), 8000);
      } else {
        setTestEmailDetails(null);
        setTestEmailStatus('error');
        setTimeout(() => setTestEmailStatus('idle'), 6000);
      }
    } catch (err) {
      setTestEmailStatus('error');
      setTimeout(() => setTestEmailStatus('idle'), 4000);
    }
  };

  const fetchSerialPorts = async () => {
    setIsScanningPorts(true);
    try {
      const res = await fetch('/api/serial-ports');
      const data = await res.json();
      setAvailablePorts(Array.isArray(data) ? data : []);
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

  const allTabs = [
    { id: 'detection', label: 'Detection & Timing', icon: Sliders },
    { id: 'camera', label: 'Camera', icon: Camera },
    { id: 'rfid', label: 'RFID Reader', icon: Radio },
    { id: 'roi', label: 'ROI Configuration', icon: ShieldCheck },
    { id: 'alerts', label: 'Alerts & Evidence', icon: AlertTriangle },
    { id: 'developer', label: 'Developer Tools', icon: Terminal, isDev: true }
  ];

  // Section 35: Developer Tools only accessible to Developer role
  const settingsTabs = userRole === 'developer'
    ? allTabs
    : allTabs.filter(t => !t.isDev);

  useEffect(() => {
    if (userRole !== 'developer' && activeTab === 'developer') {
      setActiveTab('detection');
    }
  }, [userRole, activeTab]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(17, 24, 39, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }} onClick={onClose}>
      <div
        className="soc-card"
        style={{
          width: '100%',
          maxWidth: activeTab === 'developer' ? '920px' : '680px',
          maxHeight: '90vh',
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transition: 'max-width 0.2s ease'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          background: '#FFFFFF',
          borderBottom: '1px solid var(--border-medium)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)'
            }}>
              <Settings size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                System Settings
              </h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                Operational Thresholds, Hardware Connectors, and Developer Diagnostics
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-xs" style={{ padding: '6px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Settings Navigation Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-medium)',
          background: 'var(--bg-muted)',
          padding: '0 12px',
          overflowX: 'auto',
          gap: '4px'
        }}>
          {settingsTabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '10px 14px',
                  fontSize: '0.78rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? (t.isDev ? 'var(--warning)' : 'var(--info)') : 'var(--text-secondary)',
                  borderBottom: isActive ? `2px solid ${t.isDev ? 'var(--warning)' : 'var(--info)'}` : '2px solid transparent',
                  background: isActive ? '#FFFFFF' : 'transparent',
                  borderTopLeftRadius: 'var(--radius-sm)',
                  borderTopRightRadius: 'var(--radius-sm)',
                  gap: '6px',
                  whiteSpace: 'nowrap'
                }}
              >
                <Icon size={14} color={isActive ? (t.isDev ? 'var(--warning)' : 'var(--info)') : 'currentColor'} />
                <span>{t.label}</span>
                {t.isDev && (
                  <span style={{
                    fontSize: '0.62rem',
                    background: '#FEF3C7',
                    color: '#92400E',
                    padding: '1px 5px',
                    borderRadius: 'var(--radius-xs)',
                    fontWeight: 700
                  }}>
                    DEV
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px' }}>
          {activeTab === 'developer' ? (
            /* SECTION 17: DEVELOPER / TESTING MODE */
            <div>
              <SimulationSuite
                onSimulateRFID={onSimulateRFID}
                onSimulatePlacement={onSimulatePlacement}
                activeToken={activeToken}
              />
            </div>
          ) : (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* 1. DETECTION & TIMING */}
              {activeTab === 'detection' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Stationary Verification Duration */}
                  <div style={{
                    background: 'var(--bg-muted)',
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Stationary Verification:
                      </label>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--info)', fontSize: '0.95rem' }}>
                        {(parseInt(formData.persistence_ms, 10) / 1000).toFixed(1)} seconds
                      </span>
                    </div>

                    <input
                      type="range"
                      min="1000"
                      max="15000"
                      step="500"
                      value={formData.persistence_ms}
                      onChange={(e) => set('persistence_ms', e.target.value)}
                      style={{ width: '100%', accentColor: 'var(--info)', margin: '8px 0' }}
                    />

                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Duration an object must remain stationary inside the Red Tag Area before confirming placement and querying RFID authorization. Default: 5.0 seconds.
                    </div>
                  </div>

                  {/* Confidence Threshold */}
                  <div style={{
                    background: 'var(--bg-muted)',
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        AI Detection Confidence Threshold
                      </label>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {Math.round(parseFloat(formData.confidence_threshold) * 100)}%
                      </span>
                    </div>

                    <input
                      type="range"
                      min="0.10"
                      max="0.80"
                      step="0.05"
                      value={formData.confidence_threshold}
                      onChange={(e) => set('confidence_threshold', e.target.value)}
                      style={{ width: '100%', accentColor: 'var(--info)', margin: '8px 0' }}
                    />
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Minimum COCO-SSD object confidence required inside the Red Tag Area.
                    </div>
                  </div>

                  {/* Evidence Padding */}
                  <div style={{
                    background: 'var(--bg-muted)',
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Object Crop Padding
                      </label>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {formData.evidence_padding_px} px
                      </span>
                    </div>

                    <input
                      type="range"
                      min="5"
                      max="50"
                      step="5"
                      value={formData.evidence_padding_px}
                      onChange={(e) => set('evidence_padding_px', e.target.value)}
                      style={{ width: '100%', accentColor: 'var(--info)', margin: '8px 0' }}
                    />
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Forensic boundary margin around placed item for object-focused evidence crop.
                    </div>
                  </div>
                </div>
              )}

              {/* 2. CAMERA */}
              {activeTab === 'camera' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                      RTSP / Network Video Stream URL (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="rtsp://admin:pass@192.168.1.100:554/stream"
                      value={formData.rtsp_url}
                      onChange={(e) => set('rtsp_url', e.target.value)}
                      style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
                    />
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Leave blank to use local USB / Integrated HD webcam feed.
                    </div>
                  </div>
                </div>
              )}

              {/* 3. RFID */}
              {activeTab === 'rfid' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Sliding Window */}
                  <div style={{
                    background: 'var(--bg-muted)',
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        RFID Authorization Window
                      </label>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--info)' }}>
                        {(parseInt(formData.auth_window_ms, 10) / 1000).toFixed(0)} seconds
                      </span>
                    </div>

                    <input
                      type="range"
                      min="5000"
                      max="180000"
                      step="5000"
                      value={formData.auth_window_ms}
                      onChange={(e) => set('auth_window_ms', e.target.value)}
                      style={{ width: '100%', accentColor: 'var(--info)', margin: '8px 0' }}
                    />
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Valid placement window after an authorized card scan before credentials expire.
                    </div>
                  </div>

                  {/* Serial Port */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Hardware COM Serial Port
                      </label>
                      <button
                        type="button"
                        onClick={fetchSerialPorts}
                        disabled={isScanningPorts}
                        className="btn btn-outline btn-xs"
                      >
                        <RefreshCw size={11} className={isScanningPorts ? 'spin' : ''} />
                        <span>Scan Ports</span>
                      </button>
                    </div>

                    <select
                      value={formData.serial_port}
                      onChange={(e) => set('serial_port', e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">Auto-Detect USB HID / COM Port</option>
                      {availablePorts.map((p) => (
                        <option key={p.path} value={p.path}>
                          {p.path} {p.manufacturer ? `(${p.manufacturer})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* 4. ROI CONFIGURATION */}
              {activeTab === 'roi' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    The physical Red Tag Area is defined by a 4-point floor polygon calibrated on the live camera viewport.
                  </div>

                  <div style={{
                    padding: '12px 14px',
                    background: 'var(--bg-muted)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Calibrate Area Polygon
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Use 'Calibrate Area' on the live monitor feed to drag corners or draw boundary points.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. ALERTS & EVIDENCE */}
              {activeTab === 'alerts' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Universal Evidence Capture */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    background: 'var(--bg-muted)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Universal Evidence Capture
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Store forensic object crops for both authorized and unauthorized placements.
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={formData.capture_authorized_evidence === 'true'}
                      onChange={(e) => set('capture_authorized_evidence', String(e.target.checked))}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--info)' }}
                    />
                  </div>

                  {/* Alert Email Recipient */}
                  <div style={{
                    padding: '14px',
                    background: '#FFFFFF',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-medium)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Mail size={16} color="var(--brand-red)" />
                      <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        Automatic Incident Email Notification
                      </label>
                    </div>
                    <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', margin: 0 }}>
                      When an unauthorized placement is confirmed, the cropped object evidence and incident report will be automatically dispatched to this email address.
                    </p>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="email"
                        value={formData.alert_email_recipient}
                        onChange={(e) => set('alert_email_recipient', e.target.value)}
                        placeholder="yochitcheedella@gmail.com"
                        style={{
                          flex: 1,
                          fontSize: '0.8125rem',
                          fontFamily: 'var(--font-mono)',
                          padding: '8px 12px'
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleTestEmail}
                        disabled={testEmailStatus === 'sending'}
                        className="btn btn-outline btn-sm"
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        <Send size={13} />
                        <span>{testEmailStatus === 'sending' ? 'Sending...' : 'Test Alert Email'}</span>
                      </button>
                    </div>

                    {testEmailStatus === 'success' && (
                      <div style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '5px',
                        background: testEmailDetails?.smtpConfigured ? 'var(--success-bg)' : '#FFFBEB',
                        color: testEmailDetails?.smtpConfigured ? 'var(--success)' : '#B45309',
                        border: `1px solid ${testEmailDetails?.smtpConfigured ? 'var(--success)' : '#FDE68A'}`,
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-xs)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Check size={14} />
                          <span>
                            {testEmailDetails?.smtpConfigured
                              ? `Live Gmail SMTP dispatched to ${formData.alert_email_recipient}!`
                              : `Sandbox Preview Generated (Real Gmail SMTP is not configured).`}
                          </span>
                        </div>
                        {!testEmailDetails?.smtpConfigured && (
                          <div style={{ fontSize: '0.68rem', fontWeight: 400, color: '#92400E', lineHeight: 1.35 }}>
                            To receive genuine emails in your inbox, set <code>SMTP_USER</code> and <code>SMTP_PASS</code> (16-char Google App Password) in <code>backend/.env</code>.
                          </div>
                        )}
                      </div>
                    )}
                    {testEmailStatus === 'error' && (
                      <div style={{
                        fontSize: '0.72rem',
                        color: 'var(--brand-red)',
                        fontWeight: 600,
                        background: 'var(--brand-red-bg)',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-xs)'
                      }}>
                        Could not dispatch test email. Please check network and backend logs.
                      </div>
                    )}

                    <div style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-dim)',
                      lineHeight: 1.4,
                      background: 'var(--bg-muted)',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-xs)'
                    }}>
                      💡 <strong>Automated Delivery:</strong> Recipient set to <code>{formData.alert_email_recipient || 'yochitcheedella@gmail.com'}</code>. To connect live Gmail SMTP, set <code>SMTP_USER</code> and <code>SMTP_PASS</code> (App Password) in <code>backend/.env</code>.
                    </div>
                  </div>
                </div>
              )}

              {/* Save Footer Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '10px',
                paddingTop: '16px',
                borderTop: '1px solid var(--border-medium)',
                marginTop: '10px'
              }}>
                {savedSuccess && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={14} /> Saved configuration!
                  </span>
                )}
                <button type="button" onClick={onClose} className="btn btn-outline btn-sm">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  <Save size={14} />
                  <span>Save Configuration</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
