import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, CheckCircle2, AlertTriangle, ShieldCheck, Lock, RotateCcw, ArrowRight } from 'lucide-react';

const DURATION_PRESETS = [
  { value: 1, label: '1 Min' },
  { value: 2, label: '2 Min (Max Preset)' }
];

export default function KioskView({ socket, isPaused = false, onOpenAdmin, onOpenOperator, onOpenSupervisor, onOpenUser, onCaptureCurrentFrame, onGetActiveTracker }) {
  // Kiosk step: 'WAITING_RFID' | 'RFID_VERIFIED' | 'PLACEMENT_ACTIVE' | 'PLACEMENT_COMPLETED'
  const [step, setStep] = useState('WAITING_RFID');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Verified Employee Data (Temporary, in-memory only — never stored in localStorage)
  const [verifiedEmployee, setVerifiedEmployee] = useState(null);

  // Customizable Placement Duration State
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [customValue, setCustomValue] = useState('10');
  const [customUnit, setCustomUnit] = useState('minutes'); // 'minutes' | 'hours' | 'days'

  // Item Details Form State
  const [formData, setFormData] = useState({
    item_name: '',
    serial_number: '',
    description: '',
    reason: '',
    duration_min: 2
  });

  // Active Placement State
  const [activeItem, setActiveItem] = useState(null);
  const [timeRemainingSec, setTimeRemainingSec] = useState(120);
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
      duration_min: 2
    });
    setActiveItem(null);
    setCompletedPlacement(null);
    setIsLoading(false);
    setErrorMsg(preserveError);
  };

  // If kiosk is paused (e.g. login modal open), ensure background registration form is not active
  useEffect(() => {
    if (isPaused && step === 'RFID_VERIFIED') {
      resetKiosk();
    }
  }, [isPaused, step]);

  // 1. USB HID RFID Scanner Listener for the Kiosk
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e) => {
      // If modal or other overlay is active, ignore all kiosk scans
      if (isPaused) {
        return;
      }

      // If typing inside an input/textarea/select field (or inside modal), don't capture as kiosk swipe
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return;
      }

      if (step !== 'WAITING_RFID') {
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
  }, [step, isPaused]);

  // 2. Socket.IO Listeners for hardware scan & AI placement confirmation
  useEffect(() => {
    if (!socket) return;

    // Listen for hardware RFID scan broadcast
    const onRfidScanned = (data) => {
      if (!isPaused && step === 'WAITING_RFID' && data?.uid) {
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
  }, [socket, step, isPaused]);

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
        imageBase64 = onCaptureCurrentFrame({ sessionStart, itemName: activeItem.item_name, isAuthorized: true });
      } catch (err) {
        console.warn('Could not grab camera frame from local monitor:', err);
      }
    }

    // Grab tracker info from CCTV if object is in ROI
    let trackerInfo = null;
    if (typeof onGetActiveTracker === 'function') {
      try {
        trackerInfo = onGetActiveTracker({ sessionStart, itemName: activeItem.item_name, isAuthorized: true });
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
      background: 'var(--bg-core)',
      color: 'var(--text-primary)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0 0 24px 0',
      boxSizing: 'border-box',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      userSelect: 'none'
    }}>
      {/* Top Header / Kiosk Branding (Full-width, Light Theme) */}
      <header style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        background: '#FFFFFF',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '12px 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        boxSizing: 'border-box'
      }}>
        {/* Left: Brand & Kiosk Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          {/* Nokia Wordmark */}
          <svg
            width="105"
            height="22"
            viewBox="0 0 338.667 79.687"
            fill="#005AFF"
            xmlns="http://www.w3.org/2000/svg"
            style={{ display: 'block' }}
          >
            <path d="M114.194 1.145c-21.865 0-38.831 15.914-38.831 38.698 0 23.81 16.965 38.699 38.831 38.698s38.866-14.889 38.831-38.698c-.032-21.587-16.965-38.698-38.831-38.698zm0 10.654c15.258 0 27.627 11.484 27.627 28.044 0 16.867-12.369 28.045-27.627 28.045S86.567 56.709 86.567 39.843c0-16.561 12.369-28.044 27.627-28.044zm119.913-9.376v74.839h11.224V2.423zm-30.985 0l-41.655 37.419 41.655 37.42h16.702l-41.718-37.42 41.718-37.419zM296.843 0l-6.092 11.252 20.667 38.388h-41.447l-14.953 27.623h12.348l9.03-16.573h40.895l9.029 16.573h12.347zM0 0v77.263h11.455v-51.06L70.98 79.686V63.667z" />
          </svg>

          <div style={{ width: '1px', height: '20px', background: 'var(--border-medium)' }} />

          <div style={{
            background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
            color: '#FFF',
            padding: '5px 11px',
            borderRadius: '6px',
            fontWeight: 800,
            fontSize: '0.82rem',
            letterSpacing: '1.2px',
            boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)',
            whiteSpace: 'nowrap'
          }}>
            RED TAG AREA
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Physical Drop-off Kiosk
          </span>
        </div>

        {/* Right: Portal Access Buttons (completely to the right) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Employee Placement Portal Button */}
          {(onOpenUser || onOpenOperator) && (
            <button
              onClick={onOpenUser || onOpenOperator}
              title="Employee Placement Dashboard"
              style={{
                background: 'rgba(0, 90, 255, 0.08)',
                border: '1px solid rgba(0, 90, 255, 0.25)',
                color: '#005AFF',
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
                e.currentTarget.style.background = 'rgba(0, 90, 255, 0.16)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0, 90, 255, 0.08)';
              }}
            >
              <CreditCard size={14} color="#005AFF" />
              <span>Employee Portal</span>
            </button>
          )}

          {/* Supervisor Portal Button */}
          <button
            onClick={onOpenSupervisor || onOpenOperator}
            title="Supervisor Operations Console"
            style={{
              background: 'rgba(37, 99, 235, 0.08)',
              border: '1px solid rgba(37, 99, 235, 0.25)',
              color: '#2563EB',
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
              e.currentTarget.style.background = 'rgba(37, 99, 235, 0.16)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(37, 99, 235, 0.08)';
            }}
          >
            <ShieldCheck size={14} color="#2563EB" />
            <span>Supervisor Portal</span>
          </button>

          {/* Admin Lock Access */}
          <button
            onClick={onOpenAdmin}
            title="Administrator Login"
            style={{
              background: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid rgba(220, 38, 38, 0.25)',
              color: '#DC2626',
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
              e.currentTarget.style.background = 'rgba(220, 38, 38, 0.16)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(220, 38, 38, 0.08)';
            }}
          >
            <Lock size={13} color="#DC2626" />
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
            background: 'var(--brand-red-bg)',
            border: '1px solid var(--brand-red-border)',
            color: 'var(--brand-red-dark)',
            padding: '12px 16px',
            borderRadius: '10px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.9rem',
            animation: 'fadeIn 0.3s ease'
          }}>
            <AlertTriangle size={18} color="#D92D20" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            STATE 1: PLEASE SCAN YOUR RFID
        ────────────────────────────────────────────────────────────── */}
        {step === 'WAITING_RFID' && (
          <div style={{
            width: '100%',
            background: '#FFFFFF',
            border: '1px solid var(--border-medium)',
            borderRadius: '16px',
            padding: '48px 36px',
            textAlign: 'center',
            boxShadow: 'var(--shadow-card-elevated)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px'
          }}>
            <div style={{
              fontSize: '0.9rem',
              fontWeight: 800,
              color: '#D92D20',
              letterSpacing: '2px',
              textTransform: 'uppercase'
            }}>
              RED TAG AREA
            </div>

            <h1 style={{
              fontSize: '2.1rem',
              fontWeight: 800,
              margin: '0',
              color: 'var(--text-primary)',
              letterSpacing: '-0.5px'
            }}>
              PLEASE SCAN YOUR RFID
            </h1>

            <p style={{
              fontSize: '0.95rem',
              color: 'var(--text-secondary)',
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
                border: '2px dashed rgba(217, 45, 32, 0.35)',
                animation: 'spin 20s linear infinite'
              }} />
              <div style={{
                position: 'absolute',
                inset: '14px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(217, 45, 32, 0.12) 0%, rgba(217, 45, 32, 0) 70%)',
                animation: 'pulse 2.2s ease-in-out infinite'
              }} />
              <div style={{
                width: '84px',
                height: '84px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, rgba(217, 45, 32, 0.1) 0%, rgba(217, 45, 32, 0.04) 100%)',
                border: '1.5px solid rgba(217, 45, 32, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 20px rgba(217, 45, 32, 0.15)'
              }}>
                <CreditCard size={42} color="#D92D20" />
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--success)',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: 'var(--success-bg)',
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid var(--success-border)'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
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
            background: '#FFFFFF',
            border: '1px solid var(--border-medium)',
            borderRadius: '16px',
            padding: '32px 32px',
            boxShadow: 'var(--shadow-card-elevated)'
          }}>
            {/* Verified Header Badge */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              paddingBottom: '20px',
              borderBottom: '1px solid var(--border-subtle)',
              marginBottom: '24px'
            }}>
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--success)',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  marginBottom: '8px'
                }}>
                  <CheckCircle2 size={20} />
                  <span>✓ RFID VERIFIED</span>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {verifiedEmployee.name}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                  Department: <strong style={{ color: 'var(--text-secondary)' }}>{verifiedEmployee.department || 'AI & DS'}</strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() => resetKiosk()}
                style={{
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border-medium)',
                  color: 'var(--text-secondary)',
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
              <div style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                ITEM DETAILS
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
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
                    background: '#FFFFFF',
                    border: '1px solid var(--border-medium)',
                    color: 'var(--text-primary)',
                    fontSize: '0.92rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Placement Time</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--info)', background: 'var(--info-bg)', border: '1px solid var(--info-border)', padding: '1px 6px', borderRadius: '4px' }}>
                      Preset Max 2 Min
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isCustomDuration;
                      setIsCustomDuration(next);
                      if (!next) {
                        setFormData(prev => ({ ...prev, duration_min: 2 }));
                      } else {
                        const parsed = parseInt(customValue, 10);
                        const validVal = (!isNaN(parsed) && parsed > 0) ? parsed : 5;
                        setCustomValue(String(validVal));
                        const multiplier = customUnit === 'days' ? 1440 : customUnit === 'hours' ? 60 : 1;
                        setFormData(prev => ({ ...prev, duration_min: validVal * multiplier }));
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--info)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline'
                    }}
                  >
                    {isCustomDuration ? '← Use Presets (1-2m)' : '+ Custom Time'}
                  </button>
                </div>

                {/* Quick Preset Buttons (1 Min, 2 Min Max + Custom) */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  {DURATION_PRESETS.map((opt) => {
                    const isSelected = !isCustomDuration && formData.duration_min === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setIsCustomDuration(false);
                          setFormData(prev => ({ ...prev, duration_min: opt.value }));
                        }}
                        style={{
                          flex: 1,
                          padding: '8px 4px',
                          borderRadius: '6px',
                          background: isSelected
                            ? '#2563EB'
                            : 'var(--bg-muted)',
                          border: isSelected
                            ? '1px solid #1D4ED8'
                            : '1px solid var(--border-medium)',
                          color: isSelected ? '#FFF' : 'var(--text-secondary)',
                          fontSize: '0.78rem',
                          fontWeight: isSelected ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        <span>{opt.value} Min</span>
                        {opt.value === 2 && (
                          <span style={{ fontSize: '0.65rem', opacity: isSelected ? 0.9 : 0.7, fontWeight: 700 }}>
                            (Max)
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomDuration(true);
                      const parsed = parseInt(customValue, 10);
                      const validVal = (!isNaN(parsed) && parsed > 0) ? parsed : 5;
                      setCustomValue(String(validVal));
                      const multiplier = customUnit === 'days' ? 1440 : customUnit === 'hours' ? 60 : 1;
                      setFormData(prev => ({ ...prev, duration_min: validVal * multiplier }));
                    }}
                    style={{
                      flex: 1.2,
                      padding: '8px 6px',
                      borderRadius: '6px',
                      background: isCustomDuration
                        ? '#7C3AED'
                        : 'var(--bg-muted)',
                      border: isCustomDuration
                        ? '1px solid #6D28D9'
                        : '1px solid var(--border-medium)',
                      color: isCustomDuration ? '#FFF' : 'var(--text-secondary)',
                      fontSize: '0.78rem',
                      fontWeight: isCustomDuration ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    ⚙ Custom
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
                          const validVal = (!isNaN(parsed) && parsed > 0) ? parsed : 10;
                          setCustomValue(String(validVal));
                          const multiplier = customUnit === 'days' ? 1440 : customUnit === 'hours' ? 60 : 1;
                          setFormData(prev => ({ ...prev, duration_min: validVal * multiplier }));
                        } else {
                          setFormData(prev => ({ ...prev, duration_min: parseInt(val, 10) }));
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        background: '#FFFFFF',
                        border: '1px solid var(--border-medium)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        boxSizing: 'border-box'
                      }}
                    >
                      {DURATION_PRESETS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                      <option value="custom">⚙ Custom Duration (Extended)...</option>
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
                            background: 'var(--bg-muted)',
                            border: '1px solid var(--border-medium)',
                            color: 'var(--text-primary)',
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
                          placeholder="10"
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
                            background: '#FFFFFF',
                            border: '1px solid var(--border-medium)',
                            color: 'var(--text-primary)',
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
                            background: 'var(--bg-muted)',
                            border: '1px solid var(--border-medium)',
                            color: 'var(--text-primary)',
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
                            background: '#FFFFFF',
                            border: '1px solid var(--border-medium)',
                            color: 'var(--text-primary)',
                            fontSize: '0.85rem'
                          }}
                        >
                          <option value="minutes">Minutes</option>
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                        </select>
                      </div>

                      {/* Quick custom shortcut chips for extended placement */}
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {[
                          { label: '10m', val: 10, unit: 'minutes' },
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
                              borderRadius: '5px',
                              background: 'var(--bg-muted)',
                              border: '1px solid var(--border-medium)',
                              color: 'var(--text-secondary)',
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

                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '5px' }}>
                    Active window: <strong style={{ color: 'var(--info)' }}>{formData.duration_min} minutes</strong>
                    {formData.duration_min >= 60 && ` (${(formData.duration_min / 60).toFixed(1)} hrs)`}
                    <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>
                      {formData.duration_min <= 2 ? '(Standard Preset)' : '(Custom Extended)'}
                    </span>
                  </div>
                </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
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
                    background: '#FFFFFF',
                    border: '1px solid var(--border-medium)',
                    color: 'var(--text-primary)',
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
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
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
            background: '#FFFFFF',
            border: '1px solid var(--border-medium)',
            borderRadius: '16px',
            padding: '44px 36px',
            textAlign: 'center',
            boxShadow: 'var(--shadow-card-elevated)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            <div style={{
              background: 'var(--info-bg)',
              color: 'var(--info)',
              border: '1px solid var(--info-border)',
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '0.85rem',
              fontWeight: 800,
              letterSpacing: '1.5px',
              textTransform: 'uppercase'
            }}>
              PLACEMENT ACTIVE
            </div>

            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Item: <span style={{ color: 'var(--info)' }}>{activeItem.item_name}</span>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '-10px' }}>
              Time Remaining
            </div>

            {/* Giant Countdown Clock */}
            <div style={{
              fontSize: '4.2rem',
              fontFamily: 'monospace',
              fontWeight: 900,
              color: timeRemainingSec < 60 ? '#D92D20' : 'var(--text-primary)',
              letterSpacing: '2px',
              background: 'var(--bg-card-hover)',
              padding: '16px 40px',
              borderRadius: '16px',
              border: '1px solid var(--border-medium)',
              boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.04)'
            }}>
              {formatTime(timeRemainingSec)}
            </div>

            <div style={{
              fontSize: '1.05rem',
              color: 'var(--text-secondary)',
              maxWidth: '380px',
              lineHeight: 1.5,
              fontWeight: 500
            }}>
              Please place your item in the <strong style={{ color: '#D92D20' }}>Red Tag Area</strong> floor polygon now.
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: itemDetectedInROI ? 'var(--success-bg)' : 'var(--bg-muted)',
              border: itemDetectedInROI ? '1px solid var(--success-border)' : '1px solid var(--border-medium)',
              padding: '10px 18px',
              borderRadius: '10px',
              fontSize: '0.85rem',
              color: itemDetectedInROI ? 'var(--success)' : 'var(--text-secondary)',
              fontWeight: itemDetectedInROI ? 700 : 500
            }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: itemDetectedInROI ? 'var(--success)' : '#2563EB',
                boxShadow: itemDetectedInROI ? '0 0 10px rgba(22, 128, 60, 0.5)' : 'none',
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
                  ? '0 8px 24px rgba(16, 185, 129, 0.4)'
                  : '0 8px 24px rgba(37, 99, 235, 0.35)',
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

            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '360px', lineHeight: 1.4 }}>
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
                background: 'var(--bg-muted)',
                border: '1px solid var(--border-medium)',
                color: 'var(--text-secondary)',
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
            background: '#FFFFFF',
            border: '1px solid var(--border-medium)',
            borderRadius: '16px',
            padding: '48px 36px',
            textAlign: 'center',
            boxShadow: 'var(--shadow-card-elevated)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              background: 'var(--success-bg)',
              border: '2px solid var(--success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(22, 128, 60, 0.2)'
            }}>
              <CheckCircle2 size={42} color="var(--success)" />
            </div>

            <h2 style={{
              fontSize: '1.8rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0',
              letterSpacing: '-0.5px'
            }}>
              ✓ PLACEMENT COMPLETED
            </h2>

            <p style={{
              fontSize: '1.05rem',
              color: 'var(--text-secondary)',
              maxWidth: '380px',
              lineHeight: 1.6,
              margin: '0'
            }}>
              Your item <strong style={{ color: 'var(--info)' }}>{completedPlacement?.itemName || activeItem?.item_name}</strong> has been registered successfully.
              <br />
              <strong style={{ color: 'var(--success)' }}>You may leave the area.</strong>
            </p>

            {/* Display Captured High-Resolution Evidence Photo */}
            {completedPlacement?.evidenceImage && (
              <div style={{
                marginTop: '6px',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid var(--border-medium)',
                maxWidth: '320px',
                background: '#F8FAFC',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
              }}>
                <img
                  src={`/evidence/${completedPlacement.evidenceImage}`}
                  alt="Captured Placement Evidence"
                  style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '180px', objectFit: 'contain' }}
                />
                <div style={{ padding: '6px 12px', fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
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
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
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
        color: 'var(--text-muted)',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <ShieldCheck size={14} color="var(--success)" />
        <span>Privacy-Protected Kiosk — Zero sensitive history or camera feeds displayed.</span>
      </footer>
    </div>
  );
}
