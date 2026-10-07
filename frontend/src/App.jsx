import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import KioskView from './components/KioskView';
import AdminLoginModal from './components/AdminLoginModal';
import UserDashboard from './components/UserDashboard';
import PlacementsManager from './components/PlacementsManager';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import CCTVMonitor from './components/CCTVMonitor';
import EvidenceModal from './components/EvidenceModal';
import SettingsModal from './components/SettingsModal';
import ReportingPanel from './components/ReportingPanel';
import AlertPanel from './components/AlertPanel';
import EventsManager from './components/EventsManager';
import KPIMetricsBar from './components/KPIMetricsBar';
import UserManager from './components/UserManager';
import { sounds } from './utils/audio';

const SOCKET_SERVER = 'http://localhost:3001';

export default function App() {
  // Primary Architecture Mode: 'kiosk' (Standby) | 'user' (Employee Dashboard) | 'admin' (Supervisor & Admin Portal)
  const [viewMode, setViewMode] = useState(() => {
    const role = sessionStorage.getItem('redtag_user_role') || localStorage.getItem('redtag_user_role');
    const token = sessionStorage.getItem('redtag_admin_token') || localStorage.getItem('redtag_admin_token');
    if (token && role === 'user') return 'user';
    return 'kiosk';
  });
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem('redtag_admin_token') || null);
  const [userRole, setUserRole] = useState(() => sessionStorage.getItem('redtag_user_role') || 'admin');
  const [userProfile, setUserProfile] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('redtag_user_profile') || localStorage.getItem('redtag_user_profile') || 'null');
    } catch {
      return null;
    }
  });
  const [loginRole, setLoginRole] = useState('supervisor');
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  // Core System State
  const [socket, setSocket] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);
  const [appMode, setAppMode] = useState('test');
  const [activeToken, setActiveToken] = useState(null);
  const [roi, setROI] = useState({ x: 160, y: 180, width: 320, height: 240 });
  const [polygonVertices, setPolygonVertices] = useState([
    { x: 130, y: 180 },
    { x: 510, y: 180 },
    { x: 560, y: 440 },
    { x: 80, y: 440 }
  ]);
  const [telemetry, setTelemetry] = useState(null);
  const [events, setEvents] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [settings, setSettings] = useState(null);
  const [activeObjects, setActiveObjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [currentActivity, setCurrentActivity] = useState('Waiting for an object...');

  // Admin Tab Navigation - Live Monitor is the primary default view
  const [activeTab, setActiveTab] = useState('monitor'); // 'monitor' | 'placements' | 'events' | 'employees' | 'reports'
  useEffect(() => {
    if (activeTab === 'alerts') setActiveTab('monitor');
  }, [activeTab]);

  const [unauthorizedAlert, setUnauthorizedAlert] = useState(null);
  const [selectedEvidenceEvent, setSelectedEvidenceEvent] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const cctvMonitorRef = useRef(null);

  const handleCaptureCurrentFrame = useCallback((options) => {
    if (cctvMonitorRef.current && typeof cctvMonitorRef.current.captureCurrentFrame === 'function') {
      return cctvMonitorRef.current.captureCurrentFrame(options);
    }
    return null;
  }, []);

  const handleGetActiveTracker = useCallback((options) => {
    if (cctvMonitorRef.current && typeof cctvMonitorRef.current.getActiveTracker === 'function') {
      return cctvMonitorRef.current.getActiveTracker(options);
    }
    return null;
  }, []);

  // Authenticated Data Fetching (Strictly executed when Admin is verified)
  const fetchAdminData = useCallback(async (tokenToUse) => {
    const token = tokenToUse || adminToken || sessionStorage.getItem('redtag_admin_token') || localStorage.getItem('redtag_admin_token');
    if (!token) return;

    const headers = { 'Authorization': `Bearer ${token}` };

    try {
      const [statusRes, eventsRes, settingsRes, polyRes, activeRes, employeesRes, placementsRes] = await Promise.all([
        fetch('/api/status').then(r => r.json()).catch(() => null),
        fetch('/api/events?limit=200', { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/settings', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/config/polygon').then(r => r.json()).catch(() => null),
        fetch('/api/objects/active', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/employees', { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/admin/placements?limit=500', { headers }).then(r => r.ok ? r.json() : []).catch(() => [])
      ]);

      if (statusRes) {
        setSystemStatus(statusRes);
        if (statusRes.appMode) setAppMode(statusRes.appMode);
        if (statusRes.rfid?.activeToken) setActiveToken(statusRes.rfid.activeToken);
        if (statusRes.cctv?.roi) setROI(statusRes.cctv.roi);
      }
      if (polyRes?.floor_tape_roi?.polygon_vertices?.length >= 3) {
        setPolygonVertices(polyRes.floor_tape_roi.polygon_vertices);
      }
      if (activeRes?.objects) {
        setActiveObjects(activeRes.objects);
      }
      if (Array.isArray(eventsRes)) {
        setEvents(eventsRes);
      }
      if (settingsRes) {
        setSettings(settingsRes);
      }
      if (Array.isArray(employeesRes)) {
        setEmployees(employeesRes);
      }
      if (Array.isArray(placementsRes)) {
        setPlacements(placementsRes);
      }
    } catch (err) {
      console.warn('Admin data fetch error:', err.message);
    }
  }, [adminToken]);

  // Automatically refresh admin data when switching to Events or Placements tab
  useEffect(() => {
    if (viewMode === 'admin' && (activeTab === 'events' || activeTab === 'placements')) {
      fetchAdminData();
    }
  }, [activeTab, viewMode, fetchAdminData]);

  // Initial Verification: Check if user already holds a valid admin session or requested #admin / /operator
  useEffect(() => {
    const savedToken = sessionStorage.getItem('redtag_admin_token') || localStorage.getItem('redtag_admin_token');
    const urlParams = new URLSearchParams(window.location.search);
    const wantsAdmin = urlParams.get('view') === 'admin' || window.location.pathname.includes('/admin') || window.location.hash === '#admin' || window.location.pathname.includes('/operator');

    if (savedToken) {
      fetch('/api/admin/verify', {
        headers: { 'Authorization': `Bearer ${savedToken}` }
      })
        .then(r => r.json())
        .then(data => {
          if (data.authenticated) {
            setAdminToken(savedToken);
            const verifiedRole = (data.user?.role || sessionStorage.getItem('redtag_user_role') || localStorage.getItem('redtag_user_role') || 'admin').toLowerCase();
            setUserRole(verifiedRole);
            sessionStorage.setItem('redtag_user_role', verifiedRole);
            localStorage.setItem('redtag_user_role', verifiedRole);
            if (wantsAdmin) {
              setViewMode('admin');
              fetchAdminData(savedToken);
            }
          } else {
            sessionStorage.removeItem('redtag_admin_token');
            sessionStorage.removeItem('redtag_user_role');
            localStorage.removeItem('redtag_admin_token');
            localStorage.removeItem('redtag_user_role');
            setAdminToken(null);
            if (wantsAdmin) setShowAdminLogin(true);
          }
        })
        .catch(() => {
          sessionStorage.removeItem('redtag_admin_token');
          sessionStorage.removeItem('redtag_user_role');
          localStorage.removeItem('redtag_admin_token');
          localStorage.removeItem('redtag_user_role');
          setAdminToken(null);
        });
    } else if (wantsAdmin) {
      setShowAdminLogin(true);
    }
  }, [fetchAdminData]);

  // Always fetch system settings on initial mount so settings are populated immediately
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (data && typeof data === 'object') setSettings(data);
      })
      .catch(() => {});
  }, []);

  // Connect Socket.IO for real-time events
  useEffect(() => {
    const s = io(SOCKET_SERVER, {
      transports: ['websocket', 'polling']
    });

    s.on('connect', () => {
      console.log('⚡ Connected to RED TAG MONITOR Backend Socket');
    });

    s.on('initial_state', (data) => {
      if (data.roi) setROI(data.roi);
      if (Array.isArray(data.polygon_vertices) && data.polygon_vertices.length >= 3) {
        setPolygonVertices(data.polygon_vertices);
      }
      if (data.activeToken) setActiveToken(data.activeToken);
    });

    s.on('rfid_scanned', (data) => {
      if (data.is_authorized) {
        sounds.playAuthorized?.();
        setActiveToken({
          ...data.activeToken,
          uid: data.uid,
          employee_name: data.employee?.name || data.uid,
          expires_at: data.valid_until,
          department: data.employee?.department || 'General',
          is_authorized: true,
          auth_status: 'AUTHORIZED'
        });
      } else {
        sounds.playUnauthorized?.();
      }
    });

    s.on('rfid_token_extended', (data) => {
      if (data?.activeToken) {
        setActiveToken({
          ...data.activeToken,
          is_authorized: true,
          auth_status: 'AUTHORIZED'
        });
      }
    });

    s.on('rfid_token_expired', (data) => {
      setActiveToken(prev => (prev && prev.uid === data.uid ? null : prev));
    });

    s.on('placement_authorized', (data) => {
      sounds.playAuthorized?.();
      setActiveToken(null);
      if (data.event) {
        setEvents(prev => [data.event, ...prev.filter(e => e.id !== data.eventId)]);
      }
      if (data.objectId) {
        setActiveObjects(prev => {
          const exists = prev.some(o => o.id === data.objectId || o.objectId === data.objectId);
          if (exists) return prev;
          return [{
            id: data.objectId,
            objectId: data.objectId,
            object_type: data.object || 'Object',
            item_name: data.item_name,
            serial_number: data.serial_number,
            department: data.department,
            employee_name: data.employee,
            rfid_uid: data.rfid,
            authorization_status: 'AUTHORIZED',
            state: 'PRESENT',
            first_seen: new Date().toISOString()
          }, ...prev];
        });
      }
      fetchAdminData();
    });

    s.on('placement_unauthorized_alert', (data) => {
      sounds.playUnauthorized?.();
      setUnauthorizedAlert(data);
      if (data.event) {
        setEvents(prev => [data.event, ...prev.filter(e => e.id !== data.eventId)]);
      }
      fetchAdminData();
    });

    // Catch-all: add any new event the backend logs (authorized or unauthorized)
    s.on('new_event_logged', (ev) => {
      if (ev && ev.id) {
        setEvents(prev => {
          if (prev.some(e => e.id === ev.id)) return prev;
          return [ev, ...prev];
        });
      }
    });

    // Real-Time Placement Registry Synchronization
    s.on('object_registered', (obj) => {
      if (obj && (obj.id || obj.object_id)) {
        const objId = obj.object_id || obj.id;
        setPlacements(prev => {
          const exists = prev.some(p => (p.object_id === objId || p.id === objId));
          if (exists) return prev.map(p => (p.object_id === objId || p.id === objId ? { ...p, ...obj } : p));
          return [{ ...obj, object_id: objId }, ...prev];
        });
      }
      fetchAdminData();
    });

    s.on('placements_updated', () => {
      fetchAdminData();
    });

    s.on('kiosk_placement_success', () => {
      fetchAdminData();
    });

    s.on('object_removed', (data) => {
      setActiveObjects(prev => prev.filter(o =>
        o.id !== data.objectId &&
        o.objectId !== data.objectId &&
        o.object_type !== data.label &&
        o.objectType !== data.label
      ));
      fetchAdminData();
    });

    // Real-Time Deletion Synchronization across all open clients (Admin & Operator)
    s.on('event_deleted', (data) => {
      const delId = data?.id || data?.eventId;
      if (delId) {
        setEvents(prev => prev.filter(e => e.id !== delId && e.event_id !== delId && e.eventId !== delId));
        setUnauthorizedAlert(curr => (curr?.eventId === delId || curr?.event?.id === delId ? null : curr));
        setSelectedEvidenceEvent(curr => (curr?.id === delId ? null : curr));
      }
    });

    s.on('events_cleared', () => {
      setEvents([]);
      setUnauthorizedAlert(null);
      setSelectedEvidenceEvent(null);
    });

    s.on('placement_deleted', (data) => {
      const delId = data?.id || data?.objectId;
      if (delId) {
        setActiveObjects(prev => prev.filter(o => o.id !== delId && o.objectId !== delId));
        setPlacements(prev => prev.filter(p => p.object_id !== delId && p.id !== delId));
      }
      fetchAdminData();
    });

    s.on('employee_deleted', (data) => {
      const delId = data?.id || data?.employeeId;
      if (delId) {
        setEmployees(prev => prev.filter(emp => emp.id !== delId));
      }
    });

    // Real-Time System Settings Synchronization across all connected dashboards
    s.on('settings_updated', (updatedSettings) => {
      if (updatedSettings && typeof updatedSettings === 'object') {
        setSettings(updatedSettings);
      }
    });

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  // Automatically clear activeToken when its validity expires
  useEffect(() => {
    if (!activeToken) return;
    const checkExpiry = () => {
      if (activeToken.expires_at && Date.now() > new Date(activeToken.expires_at).getTime()) {
        setActiveToken(null);
      }
    };
    checkExpiry();
    const timer = setInterval(checkExpiry, 1000);
    return () => clearInterval(timer);
  }, [activeToken]);

  // Handlers
  const handleSaveROI = async (newROI) => {
    setROI(newROI);
    const token = adminToken || sessionStorage.getItem('redtag_admin_token') || localStorage.getItem('redtag_admin_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ roi: newROI })
      });
    } catch (err) {
      console.warn('ROI save error:', err);
    }
  };

  const handleSaveSettings = async (newSettings) => {
    setSettings(newSettings);
    const token = adminToken || sessionStorage.getItem('redtag_admin_token') || localStorage.getItem('redtag_admin_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) setSettings(data.settings);
        return { success: true, settings: data.settings };
      } else {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error || 'Failed to update settings.' };
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      return { success: false, error: err.message || 'Network error saving settings.' };
    }
  };

  const handleSimulatePlacement = async (objectType = 'Box', insideROI = true) => {
    try {
      const res = await fetch('/api/simulate/placement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectType, insideROI })
      });
      return await res.json();
    } catch (err) {
      console.error('Simulate placement error:', err);
      return { error: err.message };
    }
  };

  const handleSimulateRFID = async (uid) => {
    const res = await fetch('/api/simulate/rfid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid })
    });
    return res.json();
  };

  const handleSaveEmployee = async (empData) => {
    if (!adminToken) return;
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(empData)
    });
    if (res.ok) {
      const saved = await res.json();
      setEmployees(prev => {
        const filtered = prev.filter(e => e.id !== saved.id);
        return [saved, ...filtered];
      });
    }
  };

  const handleDeleteEmployee = async (id) => {
    if (!adminToken) return;
    const res = await fetch(`/api/employees/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (res.ok) {
      setEmployees(prev => prev.filter(e => e.id !== id));
    }
  };

  // Logout from Admin/Operator/User and return to Kiosk Mode (Rule 5 & 7)
  const handleLogoutToKiosk = async () => {
    if (adminToken) {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }).catch(() => {});
    }
    sessionStorage.removeItem('redtag_admin_token');
    sessionStorage.removeItem('redtag_user_role');
    sessionStorage.removeItem('redtag_user_profile');
    localStorage.removeItem('redtag_admin_token');
    localStorage.removeItem('redtag_user_role');
    localStorage.removeItem('redtag_user_profile');
    setAdminToken(null);
    setUserRole('admin');
    setUserProfile(null);
    setViewMode('kiosk');
    setShowAdminLogin(false);
    setEvents([]);
    setEmployees([]);
    setActiveObjects([]);
  };

  // ─────────────────────────────────────────────────────────────
  // VIEW MODES: 1. KIOSK | 2. USER DASHBOARD | 3. SUPERVISOR & ADMIN
  // ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────
          VIEW MODE 1: STANDBY KIOSK (Rule 1 & 2: Zero Admin Leaks)
      ────────────────────────────────────────────────────────────── */}
      <div style={{ display: viewMode === 'kiosk' ? 'block' : 'none', minHeight: '100vh', background: 'var(--bg-core)' }}>
        <KioskView
          socket={socket}
          isPaused={showAdminLogin}
          onCaptureCurrentFrame={handleCaptureCurrentFrame}
          onGetActiveTracker={handleGetActiveTracker}
          onOpenUser={() => {
            setLoginRole('user');
            setShowAdminLogin(true);
          }}
          onOpenSupervisor={() => {
            setLoginRole('supervisor');
            setShowAdminLogin(true);
          }}
          onOpenOperator={() => {
            setLoginRole('supervisor');
            setShowAdminLogin(true);
          }}
          onOpenAdmin={() => {
            setLoginRole('admin');
            setShowAdminLogin(true);
          }}
        />

        {showAdminLogin && (
          <AdminLoginModal
            socket={socket}
            initialRole={loginRole}
            onLoginSuccess={(token, user) => {
              setAdminToken(token);
              const resolvedRole = (user?.role || loginRole || 'admin').toLowerCase();
              setUserRole(resolvedRole);
              setUserProfile(user);
              sessionStorage.setItem('redtag_user_role', resolvedRole);
              if (user) {
                sessionStorage.setItem('redtag_user_profile', JSON.stringify(user));
                localStorage.setItem('redtag_user_profile', JSON.stringify(user));
              }
              setShowAdminLogin(false);
              if (resolvedRole === 'user') {
                setViewMode('user');
              } else {
                setActiveTab('monitor');
                setViewMode('admin');
                fetchAdminData(token);
              }
            }}
            onCancel={() => setShowAdminLogin(false)}
          />
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          VIEW MODE: EMPLOYEE DASHBOARD (Strict Role Isolation)
      ────────────────────────────────────────────────────────────── */}
      {viewMode === 'user' && (
        <UserDashboard
          user={userProfile}
          token={adminToken}
          onLogout={handleLogoutToKiosk}
          socket={socket}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          VIEW MODE 2: ADMINISTRATOR PORTAL (Rule 3, 4, & 10)
      ────────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'row',
          background: 'var(--bg-core)',
          ...(viewMode === 'admin'
            ? {}
            : {
                position: 'fixed',
                top: 0,
                left: '-99999px',
                width: '100vw',
                height: '100vh',
                opacity: 0,
                pointerEvents: 'none',
                zIndex: -9999
              })
        }}
      >
        {/* Left Vertical Sidebar Navigation (Ordered Top-to-Bottom) */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onLogoutToKiosk={handleLogoutToKiosk}
          userRole={userRole}
        />

        {/* Content Column: Top Header + Main Body */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Global Header with Highlighted Larger Nokia Logo */}
          <Header
            systemStatus={systemStatus}
            activeToken={activeToken}
            onLogoutToKiosk={handleLogoutToKiosk}
            activeTab={activeTab}
            cameraActive={cameraActive}
            userRole={userRole}
          />

        {/* Main Admin Operational Container */}
        <main style={{
          flex: 1,
          padding: '24px',
          maxWidth: '1600px',
          width: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
          {/* Active Unauthorized Placement Banner */}
          {unauthorizedAlert && (
            <AlertPanel
              alert={unauthorizedAlert}
              onViewEvidence={(ev) => setSelectedEvidenceEvent(ev)}
              onDismiss={() => setUnauthorizedAlert(null)}
            />
          )}

          {/* Tab 1: Placements Manager */}
          <div style={{ display: activeTab === 'placements' ? 'block' : 'none' }}>
            <PlacementsManager
              adminToken={adminToken}
              userRole={userRole}
              socket={socket}
              isActive={activeTab === 'placements'}
            />
          </div>

          {/* Tab 2: Live Monitor (CCTVMonitor remains mounted persistently and alive) */}
          <div
            style={{
              display: 'block',
              ...(activeTab === 'monitor'
                ? {}
                : {
                    position: 'fixed',
                    top: 0,
                    left: '-99999px',
                    width: '100%',
                    opacity: 0,
                    pointerEvents: 'none',
                    zIndex: -9999
                  })
            }}
          >
            {/* Four Primary KPI Cards */}
            <KPIMetricsBar
              placements={placements}
              events={events}
              systemStatus={systemStatus}
              cameraActive={cameraActive}
              adminToken={adminToken}
              socket={socket}
            />

            {/* Main Live Monitoring Area (Full Width Professional Dashboard) */}
            <div style={{ width: '100%' }}>
              {/* Live Red Tag Area Camera & Polygon */}
              <CCTVMonitor
                cctvRef={cctvMonitorRef}
                roi={roi}
                onSaveROI={handleSaveROI}
                telemetry={telemetry}
                unauthorizedAlert={unauthorizedAlert}
                onUnauthorizedAlert={(alertData) => {
                  setUnauthorizedAlert(alertData);
                  if (alertData?.event && alertData.event.id) {
                    setEvents(prev => {
                      if (prev.some(e => e.id === alertData.event.id)) return prev;
                      return [alertData.event, ...prev];
                    });
                  }
                }}
                activeToken={activeToken}
                polygonVertices={polygonVertices}
                onPolygonChange={(newPoly) => setPolygonVertices(newPoly)}
                onCameraStateChange={setCameraActive}
                onActivityChange={setCurrentActivity}
                isActive={true}
                socket={socket}
                settings={settings}
                userRole={userRole}
              />
            </div>
          </div>



          {/* Tab 4: Events Log */}
          <div style={{ display: activeTab === 'events' ? 'block' : 'none' }}>
            <EventsManager
              events={events}
              adminToken={adminToken}
              userRole={userRole}
              socket={socket}
              onSelectEvidence={(ev) => setSelectedEvidenceEvent(ev)}
              onDeleteEvent={(id) => setEvents(prev => prev.filter(e => e.id !== id && e.event_id !== id && e.eventId !== id))}
              onClearEvents={() => setEvents([])}
            />
          </div>

          {/* Tab 5: Users & RFID Manager (Admin Role) */}
          <div style={{ display: (activeTab === 'users' || activeTab === 'employees') ? 'block' : 'none' }}>
            <UserManager
              adminToken={adminToken}
              userRole={userRole}
              onSimulateRFID={handleSimulateRFID}
            />
          </div>

          {/* Tab 6: Reports */}
          <div style={{ display: activeTab === 'reports' ? 'block' : 'none' }}>
            <ReportingPanel
              events={events}
              adminToken={adminToken}
              defaultEmail={settings?.alert_email_recipient || 'safety-admin@company.com'}
            />
          </div>
        </main>

        {/* Evidence Inspector Modal */}
        {selectedEvidenceEvent && (
          <EvidenceModal
            event={selectedEvidenceEvent}
            onClose={() => setSelectedEvidenceEvent(null)}
          />
        )}

      {/* System Settings & Developer Tools Modal */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          systemStatus={systemStatus}
          onSaveSettings={handleSaveSettings}
          onClose={() => setIsSettingsOpen(false)}
          userRole={userRole}
          activeToken={activeToken}
          onSimulateRFID={handleSimulateRFID}
          onSimulatePlacement={handleSimulatePlacement}
        />
      )}
        </div>
      </div>
    </>
  );
}
