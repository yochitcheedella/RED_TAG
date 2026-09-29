import React, { useState } from 'react';
import { Lock, Shield, ArrowLeft, KeyRound, AlertCircle } from 'lucide-react';

export default function AdminLoginModal({ onLoginSuccess, onCancel }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

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
        // Store in sessionStorage (never permanent in localStorage)
        sessionStorage.setItem('redtag_admin_token', data.token);
        onLoginSuccess(data.token, data.user);
      } else {
        setErrorMsg(data.error || 'Invalid credentials. Access denied.');
      }
    } catch (err) {
      setIsLoading(false);
      setErrorMsg('Network error connecting to backend auth service.');
    }
  };

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
        maxWidth: '420px',
        padding: '32px 28px',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.2) 0%, rgba(185, 28, 28, 0.1) 100%)',
            border: '1px solid rgba(220, 38, 38, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px auto',
            boxShadow: '0 0 20px rgba(220, 38, 38, 0.25)'
          }}>
            <Lock size={26} color="#EF4444" />
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            Administrator Access
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Enter authorized security credentials to access the central monitoring dashboard.
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
              type="text"
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
              placeholder="••••••••"
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

          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Default credentials: <code style={{ color: 'var(--brand-primary)', fontFamily: 'monospace' }}>admin</code> / <code style={{ color: 'var(--brand-primary)', fontFamily: 'monospace' }}>admin123</code>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
            style={{
              padding: '11px',
              fontSize: '0.9rem',
              fontWeight: 700,
              marginTop: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <KeyRound size={16} />
            <span>{isLoading ? 'Verifying...' : 'Authenticate & Unlock'}</span>
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
