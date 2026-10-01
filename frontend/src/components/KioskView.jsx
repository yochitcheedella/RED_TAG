import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, CheckCircle2, AlertTriangle, ShieldCheck, Lock, RotateCcw, ArrowRight } from 'lucide-react';

const DURATION_PRESETS = [
  { value: 5, label: '5 Min' },
  { value: 15, label: '15 Min' },
  { value: 30, label: '30 Min' },
  { value: 60, label: '1 Hour' },
  { value: 1440, label: '24 Hours' },
  { value: 10080, label: '7 Days' }
];

export default function KioskView({ socket, onOpenAdmin, onOpenOperator, onCaptureCurrentFrame, onGetActiveTracker }) {
  // Kiosk step: 'WAITING_RFID' | 'RFID_VERIFIED' | 'PLACEMENT_ACTIVE' | 'PLACEMENT_COMPLETED'
  const [step, setStep] = useState('WAITING_RFID');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Verified Employee Data (Temporary, in-memory only — never stored in localStorage)
  const [verifiedEmployee, setVerifiedEmployee] = useState(null);

  // Customizable Placement Duration State
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [customValue, setCustomValue] = useState('30');
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
  const [isConfirmingPlacement, setIsConfirmingPlacement] = useState(false);
  const [itemDetectedInROI, setItemDetectedInROI] = useState(false);
  const [_detectedItemInfo, setDetectedItemInfo] = useState(null);

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
    setCustomValue('30');
    setCustomUnit('minutes');
    setIsConfirmingPlacement(false);
    setItemDetectedInROI(false);
    setDetectedItemInfo(null);
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

    // Listen for candidate item detected inside ROI
    const onItemDetected = (data) => {
      if (step === 'PLACEMENT_ACTIVE') {
        setItemDetectedInROI(true);
        setDetectedItemInfo(data);
      }
    };

    socket.on('rfid_scanned', onRfidScanned);
    socket.on('kiosk_placement_success', onKioskSuccess);
    socket.on('kiosk_item_detected', onItemDetected);

    return () => {
      socket.off('rfid_scanned', onRfidScanned);
      socket.off('kiosk_placement_success', onKioskSuccess);
      socket.off('kiosk_item_detected', onItemDetected);
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

    let durationMin = formData.duration_min;
    if (isCustomDuration) {
      const parsed = parseInt(customValue, 10);
      const validVal = (!isNaN(parsed) && parsed > 0) ? parsed : 1;
      const multiplier = customUnit === 'days' ? 1440 : customUnit === 'hours' ? 60 : 1;
      durationMin = validVal * multiplier;
    }

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
          duration_min: durationMin
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
              fetch('/api/kiosk/session/expire', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ registration_id: data.registration.id })
              }).catch(() => {});
              resetKiosk('Placement session expired. Time ran out before clicking "OBJECT PLACED".');
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

  // Manual Confirmation: Employee clicks "OBJECT PLACED" button
  const handleConfirmObjectPlaced = async () => {
    if (!activeItem || isConfirmingPlacement) return;
    setIsConfirmingPlacement(true);
    setErrorMsg(null);

    // Stop countdown timer immediately
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    const sessionStart = activeItem?.created_at ? new Date(activeItem.created_at).getTime() : Date.now();

    // Grab direct high-res optical frame from local camera if available
    let imageBase64 = null;
    if (typeof onCaptureCurrentFrame === 'function') {
      try {
        imageBase64 = onCaptureCurrentFrame({ sessionStart });
      } catch (err) {
        console.warn('Could not grab camera frame from local monitor:', err);
      }
    }

    // Grab tracker info from CCTV if object is in ROI
    let trackerInfo = null;
    if (typeof onGetActiveTracker === 'function') {
      try {
        trackerInfo = onGetActiveTracker({ sessionStart });
      } catch (err) {
        console.warn('Could not grab active tracker:', err);
      }
    }

    try {
      const res = await fetch('/api/kiosk/confirm-placement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_id: activeItem.id,
          imageBase64: imageBase64 || null,
          objectType: activeItem.item_name,
          objectId: trackerInfo?.objectId || null,
          box: trackerInfo?.box || null
        })
      });

      const data = await res.json();
      setIsConfirmingPlacement(false);

      if (res.ok && data.success) {
        setCompletedPlacement({
          ...data,
          itemName: activeItem.item_name,
          employeeName: verifiedEmployee?.name || activeItem.employee_name,
          evidenceImage: data.evidenceImage
        });
        setStep('PLACEMENT_COMPLETED');
        startAutoResetCountdown();
      } else {
        setErrorMsg(data.error || 'Failed to confirm placement.');
      }
    } catch (err) {
      setIsConfirmingPlacement(false);
      setErrorMsg('Network error confirming placement.');
    }
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

        {/* Portal Access Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Operator Portal Button */}
          <button
            onClick={onOpenOperator}
            title="Operator Portal Login"
            style={{
              background: 'rgba(37, 99, 235, 0.1)',
              border: '1px solid rgba(37, 99, 235, 0.25)',
              color: '#93C5FD',
              borderRadius: '8px',
              padding: '7px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.78rem',
              fontWeight: 600,
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#FFFFFF';
              e.currentTarget.style.background = 'rgba(37, 99, 235, 0.25)';
              e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#93C5FD';
              e.currentTarget.style.background = 'rgba(37, 99, 235, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.25)';
            }}
          >
            <ShieldCheck size={14} color="#60A5FA" />
            <span>Operator Portal</span>
          </button>

          {/* Admin Lock Access */}
          <button
            onClick={onOpenAdmin}
            title="Administrator Login"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94A3B8',
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
              e.currentTarget.style.color = '#94A3B8';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            <Lock size={13} />
            <span>Admin Portal</span>
          </button>
        </div>
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
                          const parsed = parseInt(customValue, 10);
                          const validVal = (!isNaN(parsed) && parsed > 0) ? parsed : 30;
                          setCustomValue(String(validVal));
                          const multiplier = customUnit === 'days' ? 1440 : customUnit === 'hours' ? 60 : 1;
                          setFormData(prev => ({ ...prev, duration_min: validVal * multiplier }));
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
                          const parsed = parseInt(customValue, 10);
                          const validVal = (!isNaN(parsed) && parsed > 0) ? parsed : 30;
                          setCustomValue(String(validVal));
                          const multiplier = customUnit === 'days' ? 1440 : customUnit === 'hours' ? 60 : 1;
                          setFormData(prev => ({ ...prev, duration_min: validVal * multiplier }));
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const current = parseInt(customValue, 10) || 1;
                            const nextVal = Math.max(1, current - 1);
                            setCustomValue(String(nextVal));
                            const multiplier = customUnit === 'days' ? 1440 : customUnit === 'hours' ? 60 : 1;
                            setFormData(prev => ({ ...prev, duration_min: nextVal * multiplier }));
                          }}
                          style={{
                            width: '36px',
                            height: '38px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            color: '#FFF',
                            fontSize: '1.2rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="9999"
                          value={customValue}
                          placeholder="30"
                          onChange={(e) => {
                            const raw = e.target.value;
                            setCustomValue(raw);
                            const parsed = parseInt(raw, 10);
                            if (!isNaN(parsed) && parsed > 0) {
                              const multiplier = customUnit === 'days' ? 1440 : customUnit === 'hours' ? 60 : 1;
                              setFormData(prev => ({ ...prev, duration_min: parsed * multiplier }));
                            }
                          }}
                          onBlur={() => {
                            const parsed = parseInt(customValue, 10);
                            const validVal = (!isNaN(parsed) && parsed > 0) ? parsed : 1;
                            setCustomValue(String(validVal));
                            const multiplier = customUnit === 'days' ? 1440 : customUnit === 'hours' ? 60 : 1;
                            setFormData(prev => ({ ...prev, duration_min: validVal * multiplier }));
                          }}
                          style={{
                            width: '76px',
                            padding: '10px 8px',
                            borderRadius: '8px',
                            background: 'rgba(0, 0, 0, 0.35)',
                            border: '1px solid rgba(255, 255, 255, 0.25)',
                            color: '#FFF',
                            fontSize: '1rem',
                            fontWeight: 700,
                            textAlign: 'center',
                            boxSizing: 'border-box'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const current = parseInt(customValue, 10) || 1;
                            const nextVal = current + 1;
                            setCustomValue(String(nextVal));
                            const multiplier = customUnit === 'days' ? 1440 : customUnit === 'hours' ? 60 : 1;
                            setFormData(prev => ({ ...prev, duration_min: nextVal * multiplier }));
                          }}
                          style={{
                            width: '36px',
                            height: '38px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            color: '#FFF',
                            fontSize: '1.2rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}
                        >
                          +
                        </button>
                        <select
                          value={customUnit}
                          onChange={(e) => {
                            const unit = e.target.value;
                            setCustomUnit(unit);
                            const parsed = parseInt(customValue, 10);
                            const validVal = (!isNaN(parsed) && parsed > 0) ? parsed : 1;
                            const multiplier = unit === 'days' ? 1440 : unit === 'hours' ? 60 : 1;
                            setFormData(prev => ({ ...prev, duration_min: validVal * multiplier }));
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

                      {/* Quick preset buttons for touch/fast entry */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {[
                          { label: '15m', val: 15, unit: 'minutes' },
                          { label: '30m', val: 30, unit: 'minutes' },
                          { label: '45m', val: 45, unit: 'minutes' },
                          { label: '1h', val: 1, unit: 'hours' },
                          { label: '2h', val: 2, unit: 'hours' },
                          { label: '4h', val: 4, unit: 'hours' },
                          { label: '1d', val: 1, unit: 'days' }
                        ].map(chip => (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={() => {
                              setCustomValue(String(chip.val));
                              setCustomUnit(chip.unit);
                              const multiplier = chip.unit === 'days' ? 1440 : chip.unit === 'hours' ? 60 : 1;
                              setFormData(prev => ({ ...prev, duration_min: chip.val * multiplier }));
                            }}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              color: '#94A3B8',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
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
              background: itemDetectedInROI ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              border: itemDetectedInROI ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
              padding: '10px 18px',
              borderRadius: '10px',
              fontSize: '0.85rem',
              color: itemDetectedInROI ? '#34D399' : '#94A3B8',
              fontWeight: itemDetectedInROI ? 700 : 500
            }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: itemDetectedInROI ? '#10B981' : '#3B82F6',
                boxShadow: itemDetectedInROI ? '0 0 10px #10B981' : 'none',
                animation: itemDetectedInROI ? 'none' : 'pulse 1.5s infinite',
                display: 'inline-block'
              }} />
              <span>
                {itemDetectedInROI
                  ? '✓ Item detected in Red Tag Area! Click "OBJECT PLACED" below to capture evidence.'
                  : 'Sensors monitoring Red Tag Area in real time...'}
              </span>
            </div>

            {/* Primary Action Button: "OBJECT PLACED" */}
            <button
              type="button"
              id="btn-kiosk-object-placed"
              onClick={handleConfirmObjectPlaced}
              disabled={isConfirmingPlacement}
              style={{
                width: '100%',
                maxWidth: '380px',
                marginTop: '10px',
                background: itemDetectedInROI
                  ? 'linear-gradient(135deg, #059669 0%, #10B981 100%)'
                  : 'linear-gradient(135deg, #2563EB 0%, #10B981 100%)',
                color: '#FFFFFF',
                padding: '18px 24px',
                borderRadius: '14px',
                border: 'none',
                fontWeight: 800,
                fontSize: '1.25rem',
                letterSpacing: '1px',
                cursor: isConfirmingPlacement ? 'wait' : 'pointer',
                boxShadow: itemDetectedInROI
                  ? '0 10px 30px rgba(16, 185, 129, 0.5)'
                  : '0 10px 30px rgba(37, 99, 235, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                transition: 'all 0.2s ease',
                transform: isConfirmingPlacement ? 'scale(0.98)' : 'scale(1)'
              }}
            >
              <CheckCircle2 size={26} />
              <span>{isConfirmingPlacement ? 'CAPTURING EVIDENCE...' : 'OBJECT PLACED'}</span>
            </button>

            <div style={{ fontSize: '0.82rem', color: '#94A3B8', maxWidth: '360px', lineHeight: 1.4 }}>
              After placing your item in the Red Tag polygon, click <strong>"OBJECT PLACED"</strong> to capture photographic evidence and conclude the session.
            </div>

            <button
              type="button"
              onClick={() => {
                if (activeItem?.id) {
                  fetch('/api/kiosk/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ registration_id: activeItem.id })
                  }).catch(() => {});
                }
                resetKiosk('Placement cancelled by operator.');
              }}
              style={{
                marginTop: '8px',
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
            gap: '16px'
          }}>
            <div style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '2px solid #10B981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 30px rgba(16, 185, 129, 0.35)'
            }}>
              <CheckCircle2 size={42} color="#10B981" />
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
              Your item <strong style={{ color: '#93C5FD' }}>{completedPlacement?.itemName || activeItem?.item_name}</strong> has been registered successfully.
              <br />
              <strong style={{ color: '#10B981' }}>You may leave the area.</strong>
            </p>

            {/* Display Captured High-Resolution Evidence Photo */}
            {completedPlacement?.evidenceImage && (
              <div style={{
                marginTop: '6px',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                maxWidth: '320px',
                background: '#0B0F19',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
              }}>
                <img
                  src={`/evidence/${completedPlacement.evidenceImage}`}
                  alt="Captured Placement Evidence"
                  style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '180px', objectFit: 'contain' }}
                />
                <div style={{ padding: '6px 12px', fontSize: '0.75rem', color: '#10B981', fontWeight: 600 }}>
                  ✓ Evidence Captured: {completedPlacement.evidenceImage}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => resetKiosk()}
              style={{
                marginTop: '10px',
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
              SCAN NEXT RFID ({autoResetSec}s)
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
