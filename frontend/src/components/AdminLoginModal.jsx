import React, { useState, useEffect } from 'react';
import { Lock, Shield, ArrowLeft, KeyRound, AlertCircle, ShieldCheck, UserCheck, CreditCard, User } from 'lucide-react';

export default function AdminLoginModal({ onLoginSuccess, onCancel, initialRole = 'supervisor', socket }) {
  // Roles: 'user' (Employee) | 'supervisor' | 'admin'
  const normalizedInitial = initialRole === 'operator' ? 'supervisor' : initialRole;
  const [activeRole, setActiveRole] = useState(normalizedInitial || 'supervisor');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rfidUid, setRfidUid] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRoleChange = (newRole) => {
    setActiveRole(newRole);
    setErrorMsg(null);
    setUsername('');
    setPassword('');
    setRfidUid('');
  };

  const authenticate = async (payload) => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      // Unified Auth API endpoint
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      setIsLoading(false);

      if (res.ok && data.success && data.token) {
        sessionStorage.setItem('redtag_admin_token', data.token);
        localStorage.setItem('redtag_admin_token', data.token);
        const resolvedRole = (data.user?.role || activeRole).toLowerCase();
        sessionStorage.setItem('redtag_user_role', resolvedRole);
        localStorage.setItem('redtag_user_role', resolvedRole);
        if (data.user) {
          sessionStorage.setItem('redtag_user_profile', JSON.stringify(data.user));
          localStorage.setItem('redtag_user_profile', JSON.stringify(data.user));
        }
        onLoginSuccess(data.token, data.user || { username, role: resolvedRole });
      } else {
        setErrorMsg(data.error || 'Authentication failed. Please verify your credentials or RFID card.');
      }
    } catch (err) {
      setIsLoading(false);
      setErrorMsg('Network error connecting to authentication service.');
    }
  };

  // Listen for hardware RFID scan broadcast while in Employee login tab
  useEffect(() => {
    if (!socket || activeRole !== 'user') return;

    const handleRfidScanned = (data) => {
      if (data?.uid) {
        const uid = String(data.uid).trim().toUpperCase();
        setRfidUid(uid);
        authenticate({ rfid_uid: uid });
      }
    };

    socket.on('rfid_scanned', handleRfidScanned);
    return () => socket.off('rfid_scanned', handleRfidScanned);
  }, [socket, activeRole]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (activeRole === 'user') {
      if (!rfidUid.trim()) {
        setErrorMsg('Please tap or enter your RFID Badge UID.');
        return;
      }
      await authenticate({ rfid_uid: rfidUid.trim().toUpperCase() });
    } else {
      if (!username.trim() || !password) {
        setErrorMsg('Please enter both username and password.');
        return;
      }
      await authenticate({ username: username.trim(), password });
    }
  };

  // Theme styling based on active role
  const isEmployee = activeRole === 'user';
  const isSupervisor = activeRole === 'supervisor';
  const isAdmin = activeRole === 'admin';

  let themeColor = '#005AFF';
  let themeBg = 'rgba(0, 90, 255, 0.12)';
  let themeBorder = 'rgba(0, 90, 255, 0.35)';
  let roleTitle = 'Employee Placement Station';
  let roleDesc = 'Tap your employee RFID badge or enter badge UID to access your placement dashboard.';

  if (isSupervisor) {
    themeColor = '#2563EB';
    themeBg = 'rgba(37, 99, 235, 0.12)';
    themeBorder = 'rgba(37, 99, 235, 0.35)';
    roleTitle = 'Supervisor Operations Portal';
    roleDesc = 'Live CCTV monitoring, polygon detection, placement countdowns, and optical evidence review.';
  } else if (isAdmin) {
    themeColor = '#DC2626';
    themeBg = 'rgba(220, 38, 38, 0.12)';
    themeBorder = 'rgba(220, 38, 38, 0.35)';
    roleTitle = 'System Administrator Console';
    roleDesc = 'Full access: User & Supervisor management, RFID mapping, ROI calibration, reports, and system settings.';
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }}>
      <div style={{
        background: '#FFFFFF',
        border: '1px solid var(--border-medium)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '460px',
        padding: '28px',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {/* 3-Role Tab Selector */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          background: 'var(--bg-muted)',
          padding: '4px',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)',
          gap: '4px'
        }}>
          {/* Tab 1: Employee */}
          <button
            type="button"
            onClick={() => handleRoleChange('user')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 6px',
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.78rem',
              transition: 'all 0.2s ease',
              background: isEmployee ? '#005AFF' : 'transparent',
              color: isEmployee ? '#FFFFFF' : 'var(--text-secondary)',
              boxShadow: isEmployee ? '0 2px 8px rgba(0, 90, 255, 0.35)' : 'none'
            }}
          >
            <User size={13} />
            <span>Employee</span>
          </button>

          {/* Tab 2: Supervisor */}
          <button
            type="button"
            onClick={() => handleRoleChange('supervisor')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 6px',
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.78rem',
              transition: 'all 0.2s ease',
              background: isSupervisor ? '#2563EB' : 'transparent',
              color: isSupervisor ? '#FFFFFF' : 'var(--text-secondary)',
              boxShadow: isSupervisor ? '0 2px 8px rgba(37, 99, 235, 0.35)' : 'none'
            }}
          >
            <ShieldCheck size={13} />
            <span>Supervisor</span>
          </button>

          {/* Tab 3: Admin */}
          <button
            type="button"
            onClick={() => handleRoleChange('admin')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 6px',
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.78rem',
              transition: 'all 0.2s ease',
              background: isAdmin ? '#DC2626' : 'transparent',
              color: isAdmin ? '#FFFFFF' : 'var(--text-secondary)',
              boxShadow: isAdmin ? '0 2px 8px rgba(220, 38, 38, 0.35)' : 'none'
            }}
          >
            <Lock size={13} />
            <span>Admin</span>
          </button>
        </div>

        {/* Header Icon + Role Description */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: themeBg,
            border: `1px solid ${themeBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 10px auto'
          }}>
            {isEmployee && <User size={26} color={themeColor} />}
            {isSupervisor && <ShieldCheck size={26} color={themeColor} />}
            {isAdmin && <Lock size={26} color={themeColor} />}
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            {roleTitle}
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.35 }}>
            {roleDesc}
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#DC2626',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={15} color="#DC2626" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {isEmployee ? (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Tap Employee Badge or Enter RFID UID
              </label>
              <div style={{ position: 'relative' }}>
                <CreditCard size={17} style={{ position: 'absolute', left: '12px', top: '12px', color: '#005AFF' }} />
                <input
                  type="text"
                  placeholder="Tap badge or enter RFID UID (e.g. 3369735914)"
                  value={rfidUid}
                  onChange={(e) => setRfidUid(e.target.value.toUpperCase())}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '11px 12px 11px 38px',
                    borderRadius: '8px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-medium)',
                    color: 'var(--text-primary)',
                    fontSize: '0.92rem',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '6px 0 0 0' }}>
                Swiping or tapping your physical RFID badge will automatically populate this field.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '5px' }}>
                  Username
                </label>
                <input
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-medium)',
                    color: 'var(--text-primary)',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '5px' }}>
                  Password
                </label>
                <input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-medium)',
                    color: 'var(--text-primary)',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              padding: '11px',
              fontSize: '0.9rem',
              fontWeight: 800,
              marginTop: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: themeColor,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              boxShadow: `0 4px 14px ${themeBg}`,
              transition: 'all 0.15s ease'
            }}
          >
            {isEmployee ? <CreditCard size={16} /> : <KeyRound size={16} />}
            <span>
              {isLoading ? 'Verifying...' : isEmployee ? 'Verify RFID & Access Dashboard' : `Access ${activeRole.toUpperCase()} Console`}
            </span>
          </button>
        </form>

        {/* Back to Kiosk */}
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <ArrowLeft size={14} />
          <span>Cancel & Close</span>
        </button>
      </div>
    </div>
  );
}
