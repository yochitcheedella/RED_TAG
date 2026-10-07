import React, { useState, useEffect } from 'react';
import { X, Settings, Camera, Save, Check, Sliders, Terminal, RefreshCw, Video } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('detection'); // 'detection' | 'camera' | 'developer'

  const [formData, setFormData] = useState({
    auth_window_ms: '60000',
    persistence_ms: '5000', // Default 5.0 seconds
    confidence_threshold: '0.25',
    evidence_padding_px: '20',
    rtsp_url: '',
    preferred_camera_device_id: '',
    serial_port: '',
    baud_rate: '9600',
    capture_authorized_evidence: 'true',
    alert_auto_dismiss: 'false',
    alert_email_recipient: 'safety-admin@company.com'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [cameraList, setCameraList] = useState([]);
  const [isScanningCameras, setIsScanningCameras] = useState(false);

  const scanLocalCameras = async () => {
    setIsScanningCameras(true);
    try {
      let devices = await navigator.mediaDevices?.enumerateDevices();
      let videoInputs = (devices || []).filter(d => d.kind === 'videoinput');
      // If camera names are empty strings due to lack of active permission, prompt stream briefly
      if (videoInputs.length > 0 && !videoInputs[0].label) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach(t => t.stop());
          devices = await navigator.mediaDevices?.enumerateDevices();
          videoInputs = (devices || []).filter(d => d.kind === 'videoinput');
        } catch (_) {}
      }
      setCameraList(videoInputs);
    } catch (err) {
      console.warn('Camera scan failed:', err);
    } finally {
      setIsScanningCameras(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'camera') {
      scanLocalCameras();
    }
  }, [activeTab]);

  useEffect(() => {
    if (settings) {
      setFormData({
        auth_window_ms: String(settings.auth_window_ms || '60000'),
        persistence_ms: String(settings.persistence_ms || '5000'),
        confidence_threshold: String(settings.confidence_threshold || '0.25'),
        evidence_padding_px: String(settings.evidence_padding_px || '20'),
        rtsp_url: settings.rtsp_url || '',
        preferred_camera_device_id: settings.preferred_camera_device_id || '',
        serial_port: settings.serial_port || '',
        baud_rate: String(settings.baud_rate || '9600'),
        capture_authorized_evidence: String(settings.capture_authorized_evidence ?? 'true'),
        alert_auto_dismiss: String(settings.alert_auto_dismiss ?? 'false'),
        alert_email_recipient: settings.alert_email_recipient || 'safety-admin@company.com'
      });
    }
  }, [settings]);

  const set = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    try {
      if (typeof onSaveSettings === 'function') {
        const result = await onSaveSettings(formData);
        if (result && result.success === false) {
          setSaveError(result.error || 'Failed to save configuration.');
          return;
        }
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error('Settings save exception:', err);
      setSaveError(err.message || 'Error communicating with backend.');
    } finally {
      setIsSaving(false);
    }
  };

  const allTabs = [
    { id: 'detection', label: 'Detection & Timing', icon: Sliders },
    { id: 'camera', label: 'Camera', icon: Camera },
    { id: 'developer', label: 'Developer Tools', icon: Terminal, isDev: true }
  ];

  // Developer Tools accessible to Admin and Developer
  const isElevated = (userRole || '').toLowerCase() === 'developer' || (userRole || '').toLowerCase() === 'admin';
  const settingsTabs = isElevated
    ? allTabs
    : allTabs.filter(t => !t.isDev);

  useEffect(() => {
    if (!isElevated && activeTab === 'developer') {
      setActiveTab('detection');
    }
  }, [isElevated, activeTab]);

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
          maxWidth: activeTab === 'developer' ? '920px' : '620px',
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
                Operational Thresholds, Camera Stream, and Developer Diagnostics
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
                  padding: '10px 16px',
                  fontSize: '0.78rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? (t.isDev ? 'var(--warning)' : 'var(--info)') : 'var(--text-secondary)',
                  borderBottom: isActive ? `2px solid ${t.isDev ? 'var(--warning)' : 'var(--info)'}` : '2px solid transparent',
                  background: isActive ? '#FFFFFF' : 'transparent',
                  borderTopLeftRadius: 'var(--radius-sm)',
                  borderTopRightRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer'
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
            /* DEVELOPER / TESTING MODE */
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

                  {/* RFID Authorization Window */}
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
                        RFID Authorization Window:
                      </label>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--info)', fontSize: '0.95rem' }}>
                        {Math.round(parseInt(formData.auth_window_ms, 10) / 1000)} seconds
                      </span>
                    </div>

                    <input
                      type="range"
                      min="5000"
                      max="120000"
                      step="5000"
                      value={formData.auth_window_ms}
                      onChange={(e) => set('auth_window_ms', e.target.value)}
                      style={{ width: '100%', accentColor: 'var(--info)', margin: '8px 0' }}
                    />

                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Duration an RFID badge scan remains valid for subsequent object placement inside the Red Tag Area. Default: 60.0 seconds.
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
                      Minimum COCO-SSD object confidence required inside the Red Tag Area. Default: 25%.
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
                      Forensic boundary margin around placed item for object-focused evidence crop. Default: 20 px.
                    </div>
                  </div>
                </div>
              )}

              {/* 2. CAMERA */}
              {activeTab === 'camera' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Local Hardware Cameras */}
                  <div style={{
                    background: 'var(--bg-muted)',
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Video size={16} color="var(--info)" />
                        <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                          Connected USB / Integrated Webcams
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={scanLocalCameras}
                        disabled={isScanningCameras}
                        className="btn btn-outline btn-xs"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <RefreshCw size={11} className={isScanningCameras ? 'spin' : ''} />
                        <span>Scan Cameras</span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {cameraList.length === 0 ? (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No cameras detected yet or permissions pending. Click "Scan Cameras" above or allow browser camera permissions.
                        </div>
                      ) : (
                        cameraList.map((cam, idx) => {
                          const label = cam.label || `Camera ${idx + 1} (USB Video Device)`;
                          const isLogitech = label.toLowerCase().includes('logitech') || label.toLowerCase().includes('c920');
                          const isPreferred = formData.preferred_camera_device_id === cam.deviceId;
                          return (
                            <div
                              key={cam.deviceId || idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '8px 12px',
                                background: isPreferred ? 'rgba(37, 99, 235, 0.05)' : '#FFFFFF',
                                border: isPreferred ? '1px solid var(--info)' : '1px solid var(--border-medium)',
                                borderRadius: 'var(--radius-xs)',
                                fontSize: '0.78rem'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {label}
                                </span>
                                {isPreferred && (
                                  <span style={{ fontSize: '0.65rem', background: 'var(--info)', color: '#FFFFFF', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 }}>
                                    PRIMARY
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                  type="button"
                                  onClick={() => set('preferred_camera_device_id', cam.deviceId)}
                                  className="btn btn-ghost btn-xs"
                                  style={{ fontSize: '0.68rem', padding: '2px 6px' }}
                                >
                                  {isPreferred ? 'Selected' : 'Use This Camera'}
                                </button>
                                <span style={{
                                  fontSize: '0.68rem',
                                  color: isLogitech ? 'var(--info)' : 'var(--success)',
                                  background: isLogitech ? 'rgba(56, 189, 248, 0.1)' : 'var(--success-bg)',
                                  border: `1px solid ${isLogitech ? 'rgba(56, 189, 248, 0.3)' : 'var(--success-border)'}`,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontWeight: 700
                                }}>
                                  ● ONLINE
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Hardware Diagnostic Note */}
                    <div style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      lineHeight: 1.45,
                      background: 'rgba(255, 255, 255, 0.6)',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border-subtle)'
                    }}>
                      💡 <strong>Logitech C920 Note:</strong> If your Logitech C920 is plugged in but not visible in the list, check that its USB cable is firmly inserted directly into a powered USB port (Windows reported Code 45: Disconnected). Once connected, it will be automatically selected for live surveillance.
                    </div>
                  </div>

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
                {saveError && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--error)', fontWeight: 600 }}>
                    {saveError}
                  </span>
                )}
                <button type="button" onClick={onClose} className="btn btn-outline btn-sm">
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} className="btn btn-primary btn-sm">
                  {isSaving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                  <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
