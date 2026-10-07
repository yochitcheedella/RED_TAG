import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  User,
  ShieldCheck,
  CreditCard,
  Building,
  LogOut,
  RefreshCw,
  Search,
  PlusCircle,
  Tag,
  AlertCircle,
  FileText,
  Calendar,
  CheckCircle,
  XCircle,
  ArrowRight,
  Camera,
  Eye,
  Download,
  X,
  ExternalLink
} from 'lucide-react';
import DateRangeFilter from './DateRangeFilter';
import { isWithinDateRange, computePresetDates } from '../utils/dateFilterUtils';

const DURATION_PRESETS = [
  { value: 1, label: '1 Min' },
  { value: 2, label: '2 Min (Max Preset)' }
];

export default function UserDashboard({ user, token, onLogout, socket }) {
  const [profile, setProfile] = useState(user || {});
  const [activePlacement, setActivePlacement] = useState(null);
  const [timeRemainingSec, setTimeRemainingSec] = useState(null);
  const [myPlacements, setMyPlacements] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');
  const [quickPreset, setQuickPreset] = useState('ALL');
  const [formSuccess, setFormSuccess] = useState(null);
  const [formError, setFormError] = useState(null);
  const [selectedPlacement, setSelectedPlacement] = useState(null);

  const handleApplyDateRange = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    if (!startDate && !endDate) {
      setQuickPreset('ALL');
    } else {
      setQuickPreset('CUSTOM');
    }
  };

  const handleQuickPreset = (e) => {
    const preset = e.target.value;
    setQuickPreset(preset);
    const { startDate: s, endDate: end } = computePresetDates(preset);
    setStartDate(s);
    setEndDate(end);
    setAppliedStartDate(s);
    setAppliedEndDate(end);
  };

  // Form State
  const [itemName, setItemName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [durationMin, setDurationMin] = useState(2);
  const [customDuration, setCustomDuration] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [reason, setReason] = useState('Defective Unit Quarantine');
  const [department, setDepartment] = useState(user?.department || 'Quality Engineering');

  const countdownRef = useRef(null);

  // Format timestamps nicely (e.g. 11:48:25 06/10/2026)
  const formatTimestamp = (ts) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString();
    } catch {
      return String(ts);
    }
  };

  // Download user placement record
  const handleDownloadPlacement = (e, p) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (!p) return;
    const data = {
      system: 'RED TAG AREA SURVEILLANCE & RFID MONITOR',
      report_type: 'EMPLOYEE_PLACEMENT_RECORD',
      exported_at: new Date().toISOString(),
      placement_id: p.placement_id || p.object_id || p.id || 'N/A',
      item_name: p.item_name || 'N/A',
      serial_number: p.serial_number || 'N/A',
      department: p.department || profile?.department || 'General',
      employee_name: p.employee_name || profile?.name || 'Employee',
      employee_id: p.employee_id || profile?.employee_id || 'N/A',
      rfid_uid: p.rfid_uid || profile?.rfid_uid || 'N/A',
      placement_reason: p.placement_reason || p.reason || 'N/A',
      duration_minutes: p.duration_minutes || p.placement_duration_min || p.duration_min || 5,
      authorization_status: p.authorization_status || p.status || 'AUTHORIZED',
      state: p.state || 'PRESENT',
      registered_at: p.registered_at || p.created_at || null,
      placed_at: p.placed_at || null,
      evidence_image: p.evidence_image || null
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeId = (p.placement_id || p.object_id || p.item_name || 'placement').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.href = url;
    link.setAttribute('download', `redtag_placement_${safeId}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Fetch user profile and their placements
  const fetchUserData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      // 1. Fetch user active placement
      const activeRes = await fetch('/api/user/active-placement', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (activeRes.ok) {
        const activeData = await activeRes.json();
        setActivePlacement(activeData.activePlacement || activeData.placement || null);
        if (activeData.timeRemainingSec !== undefined) {
          setTimeRemainingSec(activeData.timeRemainingSec);
        }
      }

      // 2. Fetch user placement history
      const placementsRes = await fetch('/api/user/placements', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (placementsRes.ok) {
        const placementsData = await placementsRes.json();
        setMyPlacements(Array.isArray(placementsData) ? placementsData : []);
      }
    } catch (err) {
      console.warn('Failed to load employee placement data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  // Real-time countdown timer
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);

    if (activePlacement && timeRemainingSec !== null && timeRemainingSec > 0) {
      countdownRef.current = setInterval(() => {
        setTimeRemainingSec((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            fetchUserData();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [activePlacement, timeRemainingSec, fetchUserData]);

  // Socket event listener for real-time placement updates
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      fetchUserData();
    };

    socket.on('kiosk_placement_success', handleUpdate);
    socket.on('placement_authorized', handleUpdate);
    socket.on('object_registered', handleUpdate);
    socket.on('placement_completed', handleUpdate);
    socket.on('placement_expired', handleUpdate);

    return () => {
      socket.off('kiosk_placement_success', handleUpdate);
      socket.off('placement_authorized', handleUpdate);
      socket.off('object_registered', handleUpdate);
      socket.off('placement_completed', handleUpdate);
      socket.off('placement_expired', handleUpdate);
    };
  }, [socket, fetchUserData]);

  // Format seconds to MM:SS
  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return '--:--';
    const m = Math.floor(Math.max(0, seconds) / 60);
    const s = Math.max(0, seconds) % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Submit new placement
  const handleSubmitPlacement = async (e) => {
    e.preventDefault();
    if (!itemName.trim()) {
      setFormError('Please enter the object or item name.');
      return;
    }

    const duration = isCustom ? parseInt(customDuration, 10) : durationMin;
    if (!duration || duration <= 0) {
      setFormError('Please enter a valid placement duration in minutes.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const payload = {
        item_name: itemName.trim(),
        serial_number: serialNumber.trim() || `SN-${Date.now().toString().slice(-6)}`,
        duration_min: duration,
        reason: reason.trim(),
        department: department.trim()
      };

      const res = await fetch('/api/user/placements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      setIsSubmitting(false);

      if (res.ok && data.success) {
        setFormSuccess({
          placement_id: data.placement_id,
          item_name: itemName.trim(),
          duration_min: duration
        });
        // Reset form inputs
        setItemName('');
        setSerialNumber('');
        setReason('Defective Unit Quarantine');
        setIsCustom(false);
        // Refresh active placement & history
        fetchUserData();
      } else {
        setFormError(data.error || 'Failed to register object for placement.');
      }
    } catch (err) {
      setIsSubmitting(false);
      setFormError('Network error connecting to placement service.');
    }
  };

  // Filtered placement history
  const filteredPlacements = myPlacements.filter((p) => {
    // Date range filter
    const ts = p.placed_at || p.registered_at || p.created_at || p.timestamp || '';
    if (!isWithinDateRange(ts, appliedStartDate, appliedEndDate)) return false;

    const status = (p.status || '').toUpperCase();
    if (filterStatus === 'ACTIVE') {
      if (status !== 'AUTHORIZED' && status !== 'PENDING' && status !== 'DETECTED') return false;
    } else if (filterStatus === 'COMPLETED') {
      if (status !== 'COMPLETED') return false;
    } else if (filterStatus === 'EXPIRED') {
      if (status !== 'EXPIRED') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (p.item_name || p.object_name || '').toLowerCase().includes(q);
      const matchId = (p.placement_id || p.object_id || p.id || '').toString().toLowerCase().includes(q);
      const matchSerial = (p.serial_number || '').toLowerCase().includes(q);
      if (!matchName && !matchId && !matchSerial) return false;
    }

    return true;
  });

  // Calculate percentage of time remaining for progress bar
  const totalDurationSec = (activePlacement?.duration_minutes || activePlacement?.duration_min || 5) * 60;
  const progressPercent = timeRemainingSec !== null && totalDurationSec > 0
    ? Math.min(100, Math.max(0, (timeRemainingSec / totalDurationSec) * 100))
    : 100;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-core)',
      color: 'var(--text-primary)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* ─────────────────────────────────────────────────────────────
          1. EMPLOYEE HEADER: Branding + User Identity + Sign Out
      ────────────────────────────────────────────────────────────── */}
      <header style={{
        background: '#FFFFFF',
        borderBottom: '1px solid var(--border-medium)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        {/* Left: Nokia Branding & Station Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            background: '#005AFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px 0 rgba(0, 90, 255, 0.35)',
            flexShrink: 0
          }}>
            <svg viewBox="0 0 100 100" width="22" height="22">
              <path
                d="M0 0v77.263h11.455v-51.06L70.98 79.686V63.667z"
                transform="translate(14.5, 10.15)"
                fill="#FFFFFF"
              />
            </svg>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Nokia Wordmark */}
              <svg
                width="88"
                height="19"
                viewBox="0 0 338.667 79.687"
                fill="#005AFF"
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: 'block' }}
              >
                <path d="M114.194 1.145c-21.865 0-38.831 15.914-38.831 38.698 0 23.81 16.965 38.699 38.831 38.698s38.866-14.889 38.831-38.698c-.032-21.587-16.965-38.698-38.831-38.698zm0 10.654c15.258 0 27.627 11.484 27.627 28.044 0 16.867-12.369 28.045-27.627 28.045S86.567 56.709 86.567 39.843c0-16.561 12.369-28.044 27.627-28.044zm119.913-9.376v74.839h11.224V2.423zm-30.985 0l-41.655 37.419 41.655 37.42h16.702l-41.718-37.42 41.718-37.419zM296.843 0l-6.092 11.252 20.667 38.388h-41.447l-14.953 27.623h12.348l9.03-16.573h40.895l9.029 16.573h12.347zM0 0v77.263h11.455v-51.06L70.98 79.686V63.667z" />
              </svg>

              <div style={{ width: '1px', height: '16px', background: 'var(--border-medium)' }} />

              <h1 style={{
                fontSize: '1.05rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: 0,
                letterSpacing: '-0.01em'
              }}>
                RED TAG AREA
              </h1>
              <span style={{
                background: 'rgba(37, 99, 235, 0.1)',
                color: '#2563EB',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                Employee Placement Portal
              </span>
            </div>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
              Authorized Object Registration & Placement Tracking
            </p>
          </div>
        </div>

        {/* Right: Employee Profile Info & Sign Out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'var(--bg-muted)',
            padding: '6px 14px',
            borderRadius: '10px',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#2563EB',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.85rem'
            }}>
              {(user?.name || user?.username || 'E').charAt(0).toUpperCase()}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {user?.name || user?.username || 'Employee'}
              </div>
              <div style={{
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>Badge: {user?.rfid_uid || user?.employee_id || 'RFID Verified'}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              background: 'rgba(220, 38, 38, 0.05)',
              color: '#DC2626',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(220, 38, 38, 0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(220, 38, 38, 0.05)'; }}
            title="Sign out of Employee Placement Portal"
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          2. MAIN CONTENT CONTAINER (Full-Width Responsive Expansion)
      ────────────────────────────────────────────────────────────── */}
      <main style={{
        maxWidth: '100%',
        width: '100%',
        padding: '18px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        flex: 1,
        boxSizing: 'border-box'
      }}>
        {/* Placement Status Notification Banner */}
        {activePlacement && (activePlacement.status === 'COMPLETED' || activePlacement.status === 'EXPIRED') && (
          <div style={{
            background: activePlacement.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${activePlacement.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {activePlacement.status === 'COMPLETED' ? (
                <CheckCircle2 size={24} color="#10B981" />
              ) : (
                <AlertTriangle size={24} color="#EF4444" />
              )}
              <div>
                <h3 style={{
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  margin: 0,
                  color: activePlacement.status === 'COMPLETED' ? '#047857' : '#B91C1C'
                }}>
                  {activePlacement.status === 'COMPLETED'
                    ? `Placement #${activePlacement.placement_id || activePlacement.id} has Completed Successfully`
                    : `Placement #${activePlacement.placement_id || activePlacement.id} has Expired!`}
                </h3>
                <p style={{
                  fontSize: '0.8rem',
                  margin: '2px 0 0',
                  color: activePlacement.status === 'COMPLETED' ? '#065F46' : '#991B1B'
                }}>
                  {activePlacement.status === 'COMPLETED'
                    ? 'The object duration has concluded and the red tag placement has been archived.'
                    : 'The allowed duration has elapsed. Please remove your object from the Red Tag Area immediately.'}
                </p>
              </div>
            </div>
            <button
              onClick={fetchUserData}
              style={{
                background: 'transparent',
                border: '1px solid currentColor',
                color: activePlacement.status === 'COMPLETED' ? '#047857' : '#B91C1C',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Acknowledge & Refresh
            </button>
          </div>
        )}

        {/* 2-Column Layout: Compact Form Sidebar (320px) + Expanded Placement Table (1fr) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          gap: '20px',
          alignItems: 'start',
          width: '100%'
        }}>
          {/* ─────────────────────────────────────────────────────────
              COLUMN A: ACTIVE PLACEMENT + NEW REGISTRATION FORM
          ────────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* CARD 1: ACTIVE PLACEMENT STATUS */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid var(--border-medium)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-muted)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Package size={18} color="#2563EB" />
                  <h2 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    MY ACTIVE PLACEMENT
                  </h2>
                </div>
                <button
                  onClick={fetchUserData}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                    borderRadius: '6px'
                  }}
                  title="Refresh active status"
                >
                  <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>
              </div>

              <div style={{ padding: '20px' }}>
                {activePlacement ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Status Pill & Placement ID Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                          Placement ID
                        </div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#005AFF' }}>
                          #{activePlacement.placement_id || activePlacement.id}
                        </div>
                      </div>

                      {/* Status Badge */}
                      {(() => {
                        const status = (activePlacement.status || 'PENDING').toUpperCase();
                        let bg = 'rgba(245, 158, 11, 0.15)';
                        let color = '#D97706';
                        let border = 'rgba(245, 158, 11, 0.3)';

                        if (status === 'AUTHORIZED') {
                          bg = 'rgba(37, 99, 235, 0.15)';
                          color = '#2563EB';
                          border = 'rgba(37, 99, 235, 0.3)';
                        } else if (status === 'DETECTED') {
                          bg = 'rgba(16, 185, 129, 0.15)';
                          color = '#059669';
                          border = 'rgba(16, 185, 129, 0.3)';
                        } else if (status === 'COMPLETED') {
                          bg = 'rgba(16, 185, 129, 0.2)';
                          color = '#047857';
                          border = 'rgba(16, 185, 129, 0.4)';
                        } else if (status === 'EXPIRED') {
                          bg = 'rgba(239, 68, 68, 0.15)';
                          color = '#DC2626';
                          border = 'rgba(239, 68, 68, 0.3)';
                        }

                        return (
                          <div style={{
                            background: bg,
                            color,
                            border: `1px solid ${border}`,
                            padding: '6px 14px',
                            borderRadius: '20px',
                            fontWeight: 800,
                            fontSize: '0.8rem',
                            letterSpacing: '0.04em',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <span style={{
                              width: '7px',
                              height: '7px',
                              borderRadius: '50%',
                              background: color
                            }} />
                            {status}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Object Details */}
                    <div style={{
                      background: 'var(--bg-muted)',
                      padding: '14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Object Name:</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {activePlacement.item_name || activePlacement.object_name || 'Industrial Component'}
                        </span>
                      </div>
                    </div>

                    {/* Countdown Timer Display */}
                    <div style={{
                      background: timeRemainingSec === 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(37, 99, 235, 0.05)',
                      border: `1px solid ${timeRemainingSec === 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(37, 99, 235, 0.2)'}`,
                      borderRadius: '10px',
                      padding: '16px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                        {timeRemainingSec === 0 ? 'Placement Status' : 'Remaining Allowed Time'}
                      </div>
                      <div style={{
                        fontSize: '2.4rem',
                        fontWeight: 900,
                        fontFamily: 'monospace',
                        color: timeRemainingSec === 0 ? '#DC2626' : '#005AFF',
                        margin: '4px 0'
                      }}>
                        {timeRemainingSec === 0 ? 'EXPIRED' : formatTime(timeRemainingSec)}
                      </div>

                      {/* Progress Bar */}
                      <div style={{
                        width: '100%',
                        height: '8px',
                        background: 'rgba(0,0,0,0.08)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        margin: '10px 0 6px'
                      }}>
                        <div style={{
                          width: `${progressPercent}%`,
                          height: '100%',
                          background: timeRemainingSec < 60 ? '#EF4444' : '#2563EB',
                          transition: 'width 1s linear'
                        }} />
                      </div>

                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.72rem',
                        color: 'var(--text-muted)'
                      }}>
                        <span>Start: {activePlacement.created_at ? new Date(activePlacement.created_at).toLocaleTimeString() : 'Active'}</span>
                        <span>Expires: {activePlacement.expires_at ? new Date(activePlacement.expires_at).toLocaleTimeString() : `${activePlacement.duration_minutes || 5} min`}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    textAlign: 'center',
                    padding: '30px 10px',
                    color: 'var(--text-muted)'
                  }}>
                    <Package size={40} style={{ opacity: 0.35, margin: '0 auto 10px' }} />
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                      No Active Placement
                    </h3>
                    <p style={{ fontSize: '0.8rem', maxWidth: '300px', margin: '0 auto' }}>
                      You currently have no objects authorized in the Red Tag Area. Use the form below to authorize a new placement.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* CARD 2: REGISTER NEW OBJECT FOR PLACEMENT FORM */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid var(--border-medium)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <PlusCircle size={18} color="#005AFF" />
                <h2 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  REGISTER OBJECT FOR PLACEMENT
                </h2>
              </div>

              <div style={{ padding: '20px' }}>
                {formSuccess && (
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    borderRadius: '8px',
                    padding: '14px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px'
                  }}>
                    <CheckCircle2 size={18} color="#10B981" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#047857' }}>
                        Object Authorized! Placement ID: #{formSuccess.placement_id}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#065F46', marginTop: '2px' }}>
                        Authorized for {formSuccess.duration_min} minutes. Please proceed to place the item inside the red floor tape boundary.
                      </div>
                    </div>
                  </div>
                )}

                {formError && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#DC2626',
                    fontSize: '0.8rem'
                  }}>
                    <AlertCircle size={16} />
                    <span>{formError}</span>
                  </div>
                )}

                <form onSubmit={handleSubmitPlacement} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Object Name */}
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                      Object / Item Description *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 5G RF Filter Assembly, PCB Board #2"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-medium)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Placement Duration */}
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                      Placement Duration:
                    </label>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '8px',
                      marginBottom: '8px'
                    }}>
                      {DURATION_PRESETS.map((p) => {
                        const isSelected = !isCustom && durationMin === p.value;
                        return (
                          <button
                            type="button"
                            key={p.value}
                            onClick={() => {
                              setIsCustom(false);
                              setDurationMin(p.value);
                            }}
                            style={{
                              padding: '8px 8px',
                              borderRadius: '6px',
                              border: '1px solid',
                              borderColor: isSelected ? '#005AFF' : 'var(--border-medium)',
                              background: isSelected ? '#005AFF' : 'var(--bg-surface)',
                              color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
                              fontWeight: isSelected ? 800 : 600,
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              textAlign: 'center',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Duration Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)'
                      }}>
                        <input
                          type="checkbox"
                          checked={isCustom}
                          onChange={(e) => setIsCustom(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>Custom Duration (Minutes)</span>
                      </label>
                      {isCustom && (
                        <input
                          type="number"
                          min="1"
                          max="480"
                          placeholder="Mins"
                          value={customDuration}
                          onChange={(e) => setCustomDuration(e.target.value)}
                          style={{
                            width: '90px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-medium)',
                            fontSize: '0.8rem'
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Reason / Tag Category */}
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                      Reason for Red Tag Placement
                    </label>
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-medium)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="Defective Unit Quarantine">Defective Component Quarantine</option>
                      <option value="Quality Inspection Pending">Quality Inspection / Audit Pending</option>
                      <option value="Rework Required">Rework / Engineering Modification</option>
                      <option value="Scrap Disposal Evaluation">Scrap / Disposition Evaluation</option>
                      <option value="Calibration Verification">Tool / Fixture Calibration Verification</option>
                    </select>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    style={{
                      marginTop: '6px',
                      background: '#005AFF',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '12px 18px',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      opacity: isSubmitting ? 0.7 : 1,
                      boxShadow: '0 2px 10px rgba(0, 90, 255, 0.35)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        <span>Authorizing Placement...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={18} />
                        <span>Authorize & Generate Placement ID</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────
              COLUMN B: MY PLACEMENTS & PLACEMENT HISTORY TABLE
          ────────────────────────────────────────────────────────── */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid var(--border-medium)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Header & Search / Filter Controls */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} color="#2563EB" />
                  <h2 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    MY PLACEMENT HISTORY
                  </h2>
                  <span style={{
                    fontSize: '0.75rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    color: 'var(--text-muted)'
                  }}>
                    {filteredPlacements.length} records
                  </span>
                </div>

                {/* Filter Pills */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['ALL', 'ACTIVE', 'COMPLETED', 'EXPIRED'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setFilterStatus(st)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: filterStatus === st ? '#2563EB' : 'transparent',
                        background: filterStatus === st ? '#2563EB' : 'transparent',
                        color: filterStatus === st ? '#FFFFFF' : 'var(--text-secondary)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Filter & Search Bar Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <DateRangeFilter
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  onApply={handleApplyDateRange}
                  quickPreset={quickPreset}
                  onQuickPresetChange={handleQuickPreset}
                />
                <div style={{ position: 'relative', flex: '1 1 200px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search by object name or reason..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px 8px 32px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-medium)',
                      background: '#FFFFFF',
                      fontSize: '0.82rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Table Area */}
            <div style={{ overflowX: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 16px' }}>Object Name</th>
                    <th style={{ padding: '12px 16px' }}>Reason</th>
                    <th style={{ padding: '12px 16px' }}>Placed At</th>
                    <th style={{ padding: '12px 16px' }}>Duration</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Evidence</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlacements.length > 0 ? (
                    filteredPlacements.map((p, idx) => {
                      const id = p.placement_id || p.object_id || p.id || `RT-${idx}`;
                      const name = p.item_name || p.object_name || 'Industrial Object';
                      const reasonText = p.placement_reason || p.reason || '—';
                      const duration = p.duration_minutes || p.placement_duration_min || p.duration_min || 5;
                      const placedTs = p.placed_at || p.registered_at || p.created_at || p.first_seen;
                      const dateStr = formatTimestamp(placedTs);
                      const status = (p.authorization_status || p.status || 'AUTHORIZED').toUpperCase();

                      let statusBadge = (
                        <span style={{
                          background: 'rgba(37, 99, 235, 0.1)',
                          color: '#2563EB',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: 700
                        }}>
                          {status}
                        </span>
                      );

                      if (status === 'COMPLETED' || (p.state === 'REMOVED' && status === 'AUTHORIZED')) {
                        statusBadge = (
                          <span style={{
                            background: 'rgba(16, 185, 129, 0.1)',
                            color: '#059669',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '0.72rem',
                            fontWeight: 700
                          }}>
                            {p.state === 'REMOVED' ? 'COMPLETED' : status}
                          </span>
                        );
                      } else if (status === 'EXPIRED') {
                        statusBadge = (
                          <span style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#DC2626',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '0.72rem',
                            fontWeight: 700
                          }}>
                            EXPIRED
                          </span>
                        );
                      } else if (status === 'DETECTED' || p.state === 'PRESENT') {
                        statusBadge = (
                          <span style={{
                            background: 'rgba(5, 150, 105, 0.1)',
                            color: '#059669',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '0.72rem',
                            fontWeight: 700
                          }}>
                            {p.state === 'PRESENT' ? 'ACTIVE' : 'DETECTED'}
                          </span>
                        );
                      }

                      return (
                        <tr
                          key={id}
                          style={{
                            borderBottom: '1px solid var(--border-subtle)',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          {/* Object Name */}
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            <button
                              type="button"
                              onClick={() => setSelectedPlacement(p)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                padding: 0,
                                margin: 0,
                                fontWeight: 800,
                                color: '#005AFF',
                                cursor: 'pointer',
                                fontSize: 'inherit',
                                textAlign: 'left',
                                display: 'inline-flex',
                                alignItems: 'center'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                              title="Click to view placement details"
                            >
                              {name}
                            </button>
                          </td>

                          {/* Reason */}
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {reasonText}
                          </td>

                          {/* Placed At */}
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                            {dateStr}
                          </td>

                          {/* Duration */}
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {duration} min
                          </td>

                          {/* Evidence */}
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            {p.evidence_image ? (
                              <button
                                onClick={() => setSelectedPlacement(p)}
                                style={{
                                  background: 'rgba(0, 90, 255, 0.08)',
                                  border: '1px solid rgba(0, 90, 255, 0.3)',
                                  color: '#005AFF',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px'
                                }}
                                title="View Optical Evidence Photo"
                              >
                                <Camera size={12} />
                                <span>View</span>
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>—</span>
                            )}
                          </td>

                          {/* Status */}
                          <td style={{ padding: '12px 16px' }}>
                            {statusBadge}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="6" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <FileText size={28} style={{ opacity: 0.35, margin: '0 auto 8px' }} />
                        <div style={{ fontWeight: 600 }}>No placement records found</div>
                        <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                          Placements you create will appear here and are only visible to your employee profile.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* ─────────────────────────────────────────────────────────────
          EMPLOYEE PLACEMENT DETAILS & OPTICAL EVIDENCE MODAL
      ────────────────────────────────────────────────────────────── */}
      {selectedPlacement && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '780px',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-muted)'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Package size={20} color="#005AFF" />
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    PLACEMENT DETAILS & EVIDENCE
                  </h3>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Record ID: #{selectedPlacement.placement_id || selectedPlacement.object_id || selectedPlacement.id}
                </div>
              </div>
              <button
                onClick={() => setSelectedPlacement(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Employee & Department Card */}
              <div style={{
                background: 'var(--bg-muted)',
                borderRadius: '10px',
                padding: '16px 20px',
                border: '1px solid var(--border-subtle)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '14px'
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Employee
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '3px' }}>
                    {selectedPlacement.employee_name || profile?.name || 'Authorized Personnel'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Employee ID
                  </div>
                  <div style={{ fontSize: '0.95rem', fontFamily: 'monospace', color: 'var(--text-primary)', marginTop: '3px' }}>
                    {selectedPlacement.employee_id || profile?.employee_id || '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    RFID Badge
                  </div>
                  <div style={{ fontSize: '0.95rem', fontFamily: 'monospace', color: 'var(--text-primary)', marginTop: '3px' }}>
                    {selectedPlacement.rfid_uid || profile?.rfid_uid || 'VALIDATED'}
                  </div>
                </div>
              </div>

              {/* Item Details Card */}
              <div style={{
                background: 'var(--bg-surface)',
                borderRadius: '10px',
                padding: '16px 20px',
                border: '1px solid var(--border-subtle)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '14px'
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Item Name
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '3px' }}>
                    {selectedPlacement.item_name || 'Industrial Component'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Reason
                  </div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    {selectedPlacement.placement_reason || selectedPlacement.reason || '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Duration
                  </div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    {selectedPlacement.duration_minutes || selectedPlacement.placement_duration_min || selectedPlacement.duration_min || 5} Minutes
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Status
                  </div>
                  <div style={{ marginTop: '3px' }}>
                    <span style={{
                      background: 'rgba(16, 185, 129, 0.1)',
                      color: '#059669',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 800
                    }}>
                      {(selectedPlacement.authorization_status || selectedPlacement.status || 'AUTHORIZED').toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '14px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)'
              }}>
                <div style={{ background: 'var(--bg-muted)', padding: '10px 14px', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Registered: </span>
                  <strong>{formatTimestamp(selectedPlacement.registered_at || selectedPlacement.created_at)}</strong>
                </div>
                <div style={{ background: 'var(--bg-muted)', padding: '10px 14px', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Placed At: </span>
                  <strong>{formatTimestamp(selectedPlacement.placed_at || selectedPlacement.first_seen || selectedPlacement.registered_at)}</strong>
                </div>
              </div>

              {/* Optical Evidence Photo Preview */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Camera size={14} color="#005AFF" />
                  <span>Optical Evidence Photo (Physical Object In ROI)</span>
                </div>
                {selectedPlacement.evidence_image ? (
                  <div style={{
                    borderRadius: '10px',
                    overflow: 'hidden',
                    border: '1px solid var(--border-subtle)',
                    background: '#0a0f1d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '260px',
                    maxHeight: '400px',
                    position: 'relative'
                  }}>
                    <img
                      src={`/evidence/${selectedPlacement.evidence_image}?token=${token}`}
                      alt="Placement Evidence"
                      style={{ maxWidth: '100%', maxHeight: '400px', width: 'auto', height: 'auto', objectFit: 'contain' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextSibling.style.display = 'flex';
                      }}
                    />
                    <div style={{
                      display: 'none',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      gap: '8px',
                      padding: '40px'
                    }}>
                      <Camera size={36} style={{ opacity: 0.4 }} />
                      <div style={{ fontSize: '0.85rem' }}>Evidence file: {selectedPlacement.evidence_image}</div>
                      <div style={{ fontSize: '0.75rem' }}>Image recorded into system surveillance archive.</div>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: 'var(--bg-muted)',
                    borderRadius: '8px',
                    padding: '24px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    border: '1px dashed var(--border-medium)'
                  }}>
                    <Camera size={30} style={{ opacity: 0.35, margin: '0 auto 6px' }} />
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Optical evidence recorded in secure area archive</div>
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '10px',
                marginTop: '6px',
                paddingTop: '14px',
                borderTop: '1px solid var(--border-subtle)'
              }}>
                <button
                  type="button"
                  onClick={(e) => handleDownloadPlacement(e, selectedPlacement)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 90, 255, 0.3)',
                    background: 'rgba(0, 90, 255, 0.08)',
                    color: '#005AFF',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  <Download size={14} />
                  <span>Download Placement Record</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlacement(null)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#005AFF',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
