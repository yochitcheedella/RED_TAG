import React from 'react';
import { Package, Video, FileText, Users, BarChart3, Settings, LogOut, ShieldCheck, Lock } from 'lucide-react';

export default function Sidebar({
  activeTab,
  setActiveTab,
  onOpenSettings,
  onLogoutToKiosk,
  userRole = 'admin'
}) {
  const isSupervisor = userRole === 'supervisor' || userRole === 'operator';
  const isAdmin = userRole === 'admin';

  // Role-Based Navigation Items
  const navItems = [
    { id: 'monitor', label: 'Live Monitor', icon: Video },
    { id: 'placements', label: 'Placements', icon: Package },
    { id: 'events', label: 'Events', icon: FileText }
  ];

  // Admin exclusive tabs
  if (isAdmin) {
    navItems.push({ id: 'users', label: 'Users & RFID', icon: Users });
    navItems.push({ id: 'reports', label: 'Reports', icon: BarChart3 });
  }

  return (
    <aside style={{
      width: '240px',
      minWidth: '240px',
      background: '#FFFFFF',
      borderRight: '1px solid var(--border-medium)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      boxShadow: '1px 0 4px 0 rgba(16, 24, 40, 0.04)'
    }}>
      {/* Brand Header */}
      <div style={{
        padding: '18px 16px 14px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
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
          {/* Nokia N Lettermark */}
          <svg viewBox="0 0 100 100" width="24" height="24">
            <path
              d="M0 0v77.263h11.455v-51.06L70.98 79.686V63.667z"
              transform="translate(14.5, 10.15)"
              fill="#FFFFFF"
            />
          </svg>
        </div>
        <div style={{ overflow: 'hidden' }}>
          {/* Official Nokia Geometric Wordmark */}
          <svg
            width="105"
            height="22"
            viewBox="0 0 338.667 79.687"
            fill="#005aff"
            xmlns="http://www.w3.org/2000/svg"
            style={{ display: 'block', marginBottom: '3px' }}
          >
            <path d="M114.194 1.145c-21.865 0-38.831 15.914-38.831 38.698 0 23.81 16.965 38.699 38.831 38.698s38.866-14.889 38.831-38.698c-.032-21.587-16.965-38.698-38.831-38.698zm0 10.654c15.258 0 27.627 11.484 27.627 28.044 0 16.867-12.369 28.045-27.627 28.045S86.567 56.709 86.567 39.843c0-16.561 12.369-28.044 27.627-28.044zm119.913-9.376v74.839h11.224V2.423zm-30.985 0l-41.655 37.419 41.655 37.42h16.702l-41.718-37.42 41.718-37.419zM296.843 0l-6.092 11.252 20.667 38.388h-41.447l-14.953 27.623h12.348l9.03-16.573h40.895l9.029 16.573h12.347zM0 0v77.263h11.455v-51.06L70.98 79.686V63.667z" />
          </svg>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: '4px',
              background: isAdmin ? 'rgba(220, 38, 38, 0.1)' : 'rgba(37, 99, 235, 0.1)',
              color: isAdmin ? '#DC2626' : '#2563EB',
              textTransform: 'uppercase'
            }}>
              {isAdmin ? 'Admin Console' : 'Supervisor Portal'}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <nav style={{
        padding: '16px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        flex: 1,
        overflowY: 'auto'
      }}>
        <div style={{
          fontSize: '0.675rem',
          fontWeight: 700,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          padding: '2px 10px 6px'
        }}>
          {isAdmin ? 'Administration' : 'Supervisor Monitoring'}
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                width: '100%',
                height: '42px',
                padding: '0 14px',
                fontSize: '0.85rem',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--info)' : 'var(--text-secondary)',
                background: isActive ? 'var(--info-bg)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                borderColor: isActive ? 'var(--info-border)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '12px',
                transition: 'all 0.15s ease',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--bg-muted)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <Icon size={18} color={isActive ? 'var(--info)' : 'currentColor'} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {isActive && (
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--info)'
                }} />
              )}
            </button>
          );
        })}

        {/* Settings button strictly Admin only */}
        {isAdmin && (
          <button
            onClick={onOpenSettings}
            style={{
              width: '100%',
              height: '42px',
              padding: '0 14px',
              fontSize: '0.85rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              background: 'transparent',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '12px',
              transition: 'all 0.15s ease',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Settings size={18} />
            <span style={{ flex: 1 }}>System Settings</span>
          </button>
        )}
      </nav>

      {/* Bottom Action: Return to Kiosk / Sign Out */}
      {onLogoutToKiosk && (
        <div style={{
          padding: '12px 10px',
          borderTop: '1px solid var(--border-subtle)'
        }}>
          <button
            onClick={onLogoutToKiosk}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              color: '#DC2626',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              padding: '9px 12px',
              fontWeight: 600,
              fontSize: '0.8rem',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(220, 38, 38, 0.04)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(220, 38, 38, 0.04)'; }}
            title="Lock and sign out to station standby"
          >
            <LogOut size={15} />
            <span>Sign Out / Lock</span>
          </button>
        </div>
      )}
    </aside>
  );
}
