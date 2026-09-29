import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, CheckCircle2, Clock, AlertTriangle, ShieldCheck, Lock, RotateCcw, Package, ArrowRight, Sparkles } from 'lucide-react';

const DURATION_PRESETS = [
  { value: 5, label: '5 Min' },
  { value: 15, label: '15 Min' },
  { value: 30, label: '30 Min' },
  { value: 60, label: '1 Hour' },
  { value: 1440, label: '24 Hours' },
  { value: 10080, label: '7 Days' }
];

export default function KioskView({ socket, onOpenAdmin }) {
  // Kiosk step: 'WAITING_RFID' | 'RFID_VERIFIED' | 'PLACEMENT_ACTIVE' | 'PLACEMENT_COMPLETED'
  const [step, setStep] = useState('WAITING_RFID');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Verified Employee Data (Temporary, in-memory only — never stored in localStorage)
  const [verifiedEmployee, setVerifiedEmployee] = useState(null);

  // Customizable Placement Duration State
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [customValue, setCustomValue] = useState(45);
  const [customUnit, setCustomUnit] = useState('minutes'); // 'minutes' | 'hours' | 'days'

  // Item Details Form State
  const [formData, setFormData] = useState({
    item_name: '',
    serial_number: '',
    description: '',
    reason: '',
    duration_min: 5
  });

  // Active Placement State
  const [activeItem, setActiveItem] = useState(null);
  const [timeRemainingSec, setTimeRemainingSec] = useState(300);
  const [completedPlacement, setCompletedPlacement] = useState(null);
  const [autoResetSec, setAutoResetSec] = useState(5);

  const resetTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const autoResetTimerRef = useRef(null);

  // Reset entire kiosk session (Rule 7 & 8: Zero sensitive data retained)
  const resetKiosk = (preserveError = null) => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (autoResetTimerRef.current) clearInterval(autoResetTimerRef.current);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

    setStep('WAITING_RFID');
    setVerifiedEmployee(null);
    setIsCustomDuration(false);
    setCustomValue(45);
    setCustomUnit('minutes');
    setFormData({
      item_name: '',
      serial_number: '',
      description: '',
      reason: '',
      duration_min: 5
    });
    setActiveItem(null);
    setCompletedPlacement(null);
    setIsLoading(false);
    setErrorMsg(preserveError);
  };

  // 1. USB HID RFID Scanner Listener for the Kiosk
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e) => {
      // If typing inside an input field during form entry, don't capture as card swipe
      const activeTag = document.activeElement?.tagName;
      if (step !== 'WAITING_RFID' && (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT')) {
        return;
      }

      const now = Date.now();
      if (now - lastKeyTime > 500) {
        scanBuffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        const uid = scanBuffer.trim();
        scanBuffer = '';
        if (uid.length >= 3) {
          e.preventDefault();
          handleVerifyCard(uid);
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        scanBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [step]);

  // 2. Socket.IO Listeners for hardware scan & AI placement confirmation
  useEffect(() => {
    if (!socket) return;

    // Listen for hardware RFID scan broadcast
    const onRfidScanned = (data) => {
      if (step === 'WAITING_RFID' && data?.uid) {
        handleVerifyCard(data.uid);
      }
    };

    // Listen for vision AI placement confirmation
    const onKioskSuccess = (data) => {
      if (step === 'PLACEMENT_ACTIVE') {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setCompletedPlacement(data);
        setStep('PLACEMENT_COMPLETED');
        startAutoResetCountdown();
      }
    };

    socket.on('rfid_scanned', onRfidScanned);
    socket.on('kiosk_placement_success', onKioskSuccess);

    return () => {
      socket.off('rfid_scanned', onRfidScanned);
      socket.off('kiosk_placement_success', onKioskSuccess);
    };
  }, [socket, step]);

  // Verify RFID Badge via backend kiosk endpoint
  const handleVerifyCard = async (uid) => {
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/kiosk/verify-rfid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfid_uid: uid })
      });

      const data = await res.json();
      setIsLoading(false);

      if (res.ok && data.authorized) {
        setVerifiedEmployee(data);
        setStep('RFID_VERIFIED');
        setErrorMsg(null);

        // Auto-timeout if employee walks away without registering (90 seconds)
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
          resetKiosk('Session timed out due to inactivity.');
        }, 90000);
      } else {
        setErrorMsg(data.reason || 'Unauthorized or unregistered RFID badge.');
        setTimeout(() => setErrorMsg(null), 5000);
      }
    } catch (err) {
      setIsLoading(false);
      setErrorMsg('Communication error connecting to Red Tag system.');
      setTimeout(() => setErrorMsg(null), 5000);
    }
  };

  // Submit Item Details Form
  const handleSubmitItem = async (e) => {
    e.preventDefault();
    if (!formData.item_name.trim()) {
      setErrorMsg('Please enter the Item Name.');
      return;
    }
    if (!formData.reason.trim()) {
      setErrorMsg('Please specify the Reason for Placement.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/kiosk/register-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfid_uid: verifiedEmployee.uid,
          item_name: formData.item_name.trim(),
          serial_number: formData.serial_number.trim(),
          description: formData.description.trim(),
          reason: formData.reason.trim(),
          duration_min: formData.duration_min
        })
      });

      const data = await res.json();
      setIsLoading(false);

      if (res.ok && data.success) {
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

        setActiveItem(data.registration);
        const durationSec = data.registration.duration_min * 60;
        setTimeRemainingSec(durationSec);
        setStep('PLACEMENT_ACTIVE');

        // Start countdown timer
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = setInterval(() => {
          setTimeRemainingSec((prev) => {
            if (prev <= 1) {
              clearInterval(countdownTimerRef.current);
              resetKiosk('Placement time expired.');
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setErrorMsg(data.error || 'Failed to register item.');
      }
    } catch (err) {
      setIsLoading(false);
      setErrorMsg('Network error submitting item registration.');
    }
  };

  // Auto reset countdown after successful placement
  const startAutoResetCountdown = () => {
    setAutoResetSec(5);
    if (autoResetTimerRef.current) clearInterval(autoResetTimerRef.current);

    autoResetTimerRef.current = setInterval(() => {
      setAutoResetSec((prev) => {
        if (prev <= 1) {
          clearInterval(autoResetTimerRef.current);
          resetKiosk();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Format countdown clock dynamically (Seconds, Minutes, Hours, Days)
  const formatTime = (totalSeconds) => {
    if (totalSeconds <= 0) return '00:00';
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (days > 0) {
      return `${days}d ${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
    }
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: 'radial-gradient(ellipse at top, #161b26 0%, #090d16 100%)',
      color: '#F8FAFC',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '24px 20px',
      boxSizing: 'border-box',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      userSelect: 'none'
    }}>
      {/* Top Header / Kiosk Branding */}
      <header style={{
        width: '100%',
        maxWidth: '820px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
            color: '#FFF',
            padding: '6px 12px',
            borderRadius: '6px',
            fontWeight: 800,
            fontSize: '0.85rem',
            letterSpacing: '1.5px',
            boxShadow: '0 0 15px rgba(220, 38, 38, 0.4)'
          }}>
            RED TAG AREA
          </div>
          <span style={{ fontSize: '0.82rem', color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Physical Drop-off Kiosk
          </span>
        </div>

        {/* Discreet Admin Lock Access */}
        <button
          onClick={onOpenAdmin}
          title="Administrator Login"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#64748B',
            borderRadius: '8px',
            padding: '7px 12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.78rem',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#CBD5E1';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#64748B';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          }}
        >
          <Lock size={13} />
          <span>Admin Portal</span>
        </button>
      </header>

      {/* Main Kiosk Content Area */}
      <main style={{
        width: '100%',
        maxWidth: '680px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        margin: '20px 0'
      }}>
        {/* Error Alert Banner */}
        {errorMsg && (
          <div style={{
            width: '100%',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#FCA5A5',
            padding: '12px 16px',
            borderRadius: '10px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.9rem',
            animation: 'fadeIn 0.3s ease'
          }}>
            <AlertTriangle size={18} color="#EF4444" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            STATE 1: PLEASE SCAN YOUR RFID
        ────────────────────────────────────────────────────────────── */}
        {step === 'WAITING_RFID' && (
          <div style={{
            width: '100%',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            padding: '48px 36px',
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px'
          }}>
            <div style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: '#EF4444',
              letterSpacing: '2px',
              textTransform: 'uppercase'
            }}>
              RED TAG AREA
            </div>

            <h1 style={{
              fontSize: '2.1rem',
              fontWeight: 800,
              margin: '0',
              color: '#FFFFFF',
              letterSpacing: '-0.5px'
            }}>
              PLEASE SCAN YOUR RFID
            </h1>

            <p style={{
              fontSize: '0.95rem',
              color: '#94A3B8',
              maxWidth: '380px',
              lineHeight: 1.5,
              margin: 0
            }}>
              Hold your employee badge near the card scanner to begin item placement.
            </p>

            {/* Animated RFID Reader Target */}
            <div style={{
              position: 'relative',
              width: '150px',
              height: '150px',
              margin: '16px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {/* Pulsing concentric rings */}
              <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '2px dashed rgba(239, 68, 68, 0.3)',
                animation: 'spin 20s linear infinite'
              }} />
              <div style={{
                position: 'absolute',
                inset: '14px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(239, 68, 68, 0.18) 0%, rgba(239, 68, 68, 0) 70%)',
                animation: 'pulse 2.2s ease-in-out infinite'
              }} />
              <div style={{
                width: '84px',
                height: '84px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(185, 28, 28, 0.15) 100%)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 25px rgba(239, 68, 68, 0.35)'
              }}>
                <CreditCard size={42} color="#F87171" />
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#64748B',
              fontSize: '0.8rem',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
              <span>RFID Scanner Active & Ready</span>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            STATE 2: RFID VERIFIED & ITEM REGISTRATION FORM
        ────────────────────────────────────────────────────────────── */}
        {step === 'RFID_VERIFIED' && verifiedEmployee && (
          <div style={{
            width: '100%',
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '20px',
            padding: '32px 32px',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)'
          }}>
            {/* Verified Header Badge */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              paddingBottom: '20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: '24px'
            }}>
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#10B981',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  marginBottom: '8px'
                }}>
                  <CheckCircle2 size={20} />
                  <span>✓ RFID VERIFIED</span>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#FFF' }}>
                  {verifiedEmployee.name}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#94A3B8', marginTop: '3px' }}>
                  Department: <strong style={{ color: '#E2E8F0' }}>{verifiedEmployee.department || 'AI & DS'}</strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() => resetKiosk()}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#94A3B8',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <RotateCcw size={12} />
                <span>Cancel</span>
              </button>
            </div>

            {/* Item Details Form */}
            <form onSubmit={handleSubmitItem} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '1px', color: '#94A3B8', textTransform: 'uppercase' }}>
                ITEM DETAILS
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#E2E8F0', marginBottom: '6px' }}>
                  Item Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hydraulic Pump, Motor Bearing, Carton Box"
                  value={formData.item_name}
                  onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#FFF',
                    fontSize: '0.92rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#E2E8F0', marginBottom: '6px' }}>
                    Item / Serial Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. HP-2045 or Batch #8"
                    value={formData.serial_number}
                    onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#FFF',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#E2E8F0' }}>
                      Placement Time
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isCustomDuration;
                        setIsCustomDuration(next);
                        if (!next) {
                          setFormData(prev => ({ ...prev, duration_min: 5 }));
                        } else {
                          const multiplier = customUnit === 'days' ? 1440 : customUnit === 'hours' ? 60 : 1;
                          setFormData(prev => ({ ...prev, duration_min: customValue * multiplier }));
                        }
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#60A5FA',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline'
                      }}
                    >
                      {isCustomDuration ? 'Use Presets' : 'Custom Time'}
                    </button>
                  </div>

                  {!isCustomDuration ? (
                    <select
                      value={formData.duration_min}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setIsCustomDuration(true);
                          const multiplier = customUnit === 'days' ? 1440 : customUnit === 'hours' ? 60 : 1;
                          setFormData(prev => ({ ...prev, duration_min: customValue * multiplier }));
                        } else {
                          setFormData(prev => ({ ...prev, duration_min: parseInt(val, 10) }));
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: 'rgba(15, 23, 42, 0.9)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#FFF',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box'
                      }}
                    >
                      {DURATION_PRESETS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                      <option value="custom">Custom Duration...</option>
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={customValue}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value || '1', 10));
                          setCustomValue(val);
                          const multiplier = customUnit === 'days' ? 1440 : customUnit === 'hours' ? 60 : 1;
                          setFormData(prev => ({ ...prev, duration_min: val * multiplier }));
                        }}
                        style={{
                          width: '75px',
                          padding: '10px 10px',
                          borderRadius: '8px',
                          background: 'rgba(0, 0, 0, 0.35)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#FFF',
                          fontSize: '0.9rem',
                          textAlign: 'center'
                        }}
                      />
                      <select
                        value={customUnit}
                        onChange={(e) => {
                          const unit = e.target.value;
                          setCustomUnit(unit);
                          const multiplier = unit === 'days' ? 1440 : unit === 'hours' ? 60 : 1;
                          setFormData(prev => ({ ...prev, duration_min: customValue * multiplier }));
                        }}
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          borderRadius: '8px',
                          background: 'rgba(15, 23, 42, 0.9)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#FFF',
                          fontSize: '0.85rem'
                        }}
                      >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                    </div>
                  )}

                  <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '4px' }}>
                    Active window: <strong style={{ color: '#38BDF8' }}>{formData.duration_min} minutes</strong>
                    {formData.duration_min >= 60 && ` (${(formData.duration_min / 60).toFixed(1)} hrs)`}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#E2E8F0', marginBottom: '6px' }}>
                  Reason for Placement *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Scheduled Maintenance, Defective Part, Quality Inspection"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#FFF',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#E2E8F0', marginBottom: '6px' }}>
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pressure valve gasket replacement required"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#FFF',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  marginTop: '10px',
                  background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                  color: '#FFFFFF',
                  padding: '14px',
                  borderRadius: '10px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: isLoading ? 'wait' : 'pointer',
                  boxShadow: '0 6px 20px rgba(37, 99, 235, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'transform 0.1s ease'
                }}
              >
                <span>{isLoading ? 'Registering...' : 'REGISTER ITEM'}</span>
                <ArrowRight size={18} />
              </button>
            </form>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            STATE 3: PLACEMENT ACTIVE & COUNTDOWN TIMER
        ────────────────────────────────────────────────────────────── */}
        {step === 'PLACEMENT_ACTIVE' && activeItem && (
          <div style={{
            width: '100%',
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '20px',
            padding: '44px 36px',
            textAlign: 'center',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            <div style={{
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60A5FA',
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '0.85rem',
              fontWeight: 800,
              letterSpacing: '1.5px',
              textTransform: 'uppercase'
            }}>
              PLACEMENT ACTIVE
            </div>

            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#FFFFFF' }}>
              Item: <span style={{ color: '#93C5FD' }}>{activeItem.item_name}</span>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginTop: '-10px' }}>
              Time Remaining
            </div>

            {/* Giant Countdown Clock */}
            <div style={{
              fontSize: '4.2rem',
              fontFamily: 'monospace',
              fontWeight: 900,
              color: timeRemainingSec < 60 ? '#EF4444' : '#F8FAFC',
              letterSpacing: '2px',
              textShadow: timeRemainingSec < 60 ? '0 0 25px rgba(239, 68, 68, 0.6)' : '0 0 25px rgba(59, 130, 246, 0.4)',
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '16px 40px',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              {formatTime(timeRemainingSec)}
            </div>

            <div style={{
              fontSize: '1.05rem',
              color: '#CBD5E1',
              maxWidth: '380px',
              lineHeight: 1.5,
              fontWeight: 500
            }}>
              Please place your item in the <strong>Red Tag Area</strong> floor polygon now.
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(255, 255, 255, 0.04)',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              color: '#94A3B8'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3B82F6', animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
              <span>Sensors detecting placement in real time...</span>
            </div>

            <button
              type="button"
              onClick={() => resetKiosk('Placement cancelled by operator.')}
              style={{
                marginTop: '10px',
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#94A3B8',
                padding: '8px 18px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              Cancel Placement
            </button>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            STATE 4: PLACEMENT COMPLETED & AUTO RESET
        ────────────────────────────────────────────────────────────── */}
        {step === 'PLACEMENT_COMPLETED' && (
          <div style={{
            width: '100%',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: '20px',
            padding: '48px 36px',
            textAlign: 'center',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '2px solid #10B981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 30px rgba(16, 185, 129, 0.35)'
            }}>
              <CheckCircle2 size={46} color="#10B981" />
            </div>

            <h2 style={{
              fontSize: '1.8rem',
              fontWeight: 800,
              color: '#FFFFFF',
              margin: '0',
              letterSpacing: '-0.5px'
            }}>
              ✓ PLACEMENT COMPLETED
            </h2>

            <p style={{
              fontSize: '1.05rem',
              color: '#CBD5E1',
              maxWidth: '380px',
              lineHeight: 1.6,
              margin: '0'
            }}>
              Your item has been registered successfully.
              <br />
              <strong style={{ color: '#10B981' }}>You may leave the area.</strong>
            </p>

            <button
              type="button"
              onClick={() => resetKiosk()}
              style={{
                marginTop: '12px',
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                color: '#FFF',
                padding: '12px 28px',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
              }}
            >
              NEXT EMPLOYEE ({autoResetSec}s)
            </button>
          </div>
        )}
      </main>

      {/* Kiosk Footer Privacy Notice */}
      <footer style={{
        fontSize: '0.75rem',
        color: '#64748B',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <ShieldCheck size={14} color="#10B981" />
        <span>Privacy-Protected Kiosk — Zero sensitive history or camera feeds displayed.</span>
      </footer>
    </div>
  );
}
