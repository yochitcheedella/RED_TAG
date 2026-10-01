import React, { useState } from 'react';
import { Lock, Shield, ArrowLeft, KeyRound, AlertCircle, ShieldCheck, UserCheck } from 'lucide-react';

export default function AdminLoginModal({ onLoginSuccess, onCancel, initialRole = 'operator' }) {
  const [activeRole, setActiveRole] = useState(initialRole || 'operator');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRoleChange = (newRole) => {
    setActiveRole(newRole);
    setErrorMsg(null);
    setUsername('');
    setPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('Please enter both username and password.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });

      const data = await res.json();
      setIsLoading(false);

      if (res.ok && data.success && data.token) {
        sessionStorage.setItem('redtag_admin_token', data.token);
        const resolvedRole = (data.user?.role || activeRole).toLowerCase();
        sessionStorage.setItem('redtag_user_role', resolvedRole);
        onLoginSuccess(data.token, data.user || { username, role: resolvedRole });
      } else {
        setErrorMsg(data.error || 'Invalid credentials. Access denied.');
      }
    } catch (err) {
      setIsLoading(false);
      setErrorMsg('Network error connecting to backend auth service.');
    }
  };

  const isOperator = activeRole === 'operator';
  const themeColor = isOperator ? '#2563EB' : '#EF4444';
  const themeBg = isOperator ? 'rgba(37, 99, 235, 0.15)' : 'rgba(239, 68, 68, 0.15)';
  const themeBorder = isOperator ? 'rgba(37, 99, 235, 0.35)' : 'rgba(239, 68, 68, 0.35)';

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
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        width: '100%',
        maxWidth: '440px',
        padding: '28px 28px',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9)',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px'
      }}>
        {/* Role Selector Tabs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          background: 'var(--bg-muted)',
          padding: '4px',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)',
          gap: '4px'
        }}>
          <button
            type="button"
            onClick={() => handleRoleChange('operator')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.82rem',
              transition: 'all 0.2s ease',
              background: isOperator ? '#2563EB' : 'transparent',
              color: isOperator ? '#FFFFFF' : 'var(--text-secondary)',
              boxShadow: isOperator ? '0 2px 8px rgba(37, 99, 235, 0.35)' : 'none'
            }}
          >
            <ShieldCheck size={14} />
            <span>Operator Portal</span>
          </button>

          <button
            type="button"
            onClick={() => handleRoleChange('admin')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.82rem',
              transition: 'all 0.2s ease',
              background: !isOperator ? '#DC2626' : 'transparent',
              color: !isOperator ? '#FFFFFF' : 'var(--text-secondary)',
              boxShadow: !isOperator ? '0 2px 8px rgba(220, 38, 38, 0.35)' : 'none'
            }}
          >
            <Lock size={14} />
            <span>Admin Portal</span>
          </button>
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            background: themeBg,
            border: `1px solid ${themeBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto',
            boxShadow: `0 0 20px ${themeBg}`
          }}>
            {isOperator ? <UserCheck size={26} color={themeColor} /> : <Lock size={26} color={themeColor} />}
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            {isOperator ? 'Operator Portal Login' : 'Administrator Access'}
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {isOperator
              ? 'Enter operator credentials to monitor the Red Tag Area in real-time.'
              : 'Enter authorized administrator credentials to unlock full configuration control.'}
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#FCA5A5',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={15} color="#EF4444" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '5px' }}>
              Username
            </label>
            <input
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'var(--bg-muted)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '5px' }}>
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
                background: 'var(--bg-muted)',
                border: '1px solid var(--border-subtle)',
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
              padding: '11px',
              fontSize: '0.9rem',
              fontWeight: 700,
              marginTop: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: isOperator
                ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)'
                : 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              boxShadow: isOperator ? '0 4px 14px rgba(37, 99, 235, 0.4)' : '0 4px 14px rgba(220, 38, 38, 0.4)'
            }}
          >
            <KeyRound size={16} />
            <span>{isLoading ? 'Verifying...' : (isOperator ? 'Login as Operator' : 'Authenticate & Unlock')}</span>
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
          <span>Return to Employee Kiosk</span>
        </button>
      </div>
    </div>
  );
}

