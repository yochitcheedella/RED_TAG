import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import KioskView from './components/KioskView';
import AdminLoginModal from './components/AdminLoginModal';
import PlacementsManager from './components/PlacementsManager';
import Header from './components/Header';
import CCTVMonitor from './components/CCTVMonitor';
import DeviceOperationsPanel from './components/DeviceOperationsPanel';
import RecentEvents from './components/RecentEvents';
import EvidenceModal from './components/EvidenceModal';
import SettingsModal from './components/SettingsModal';
import ReportingPanel from './components/ReportingPanel';
import AlertPanel from './components/AlertPanel';
import AlertsManager from './components/AlertsManager';
import EventsManager from './components/EventsManager';
import KPIMetricsBar from './components/KPIMetricsBar';
import ActiveObjectsPanel from './components/ActiveObjectsPanel';
import EmployeeManager from './components/EmployeeManager';
import { sounds } from './utils/audio';

const SOCKET_SERVER = 'http://localhost:3001';

export default function App() {
  // Primary Architecture Mode: 'kiosk' (Employee-Facing) | 'admin' (Administrator Portal)
  const [viewMode, setViewMode] = useState('kiosk');
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem('redtag_admin_token') || null);
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
  const [settings, setSettings] = useState(null);
  const [activeObjects, setActiveObjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [currentActivity, setCurrentActivity] = useState('Waiting for an object...');

  // Admin Tab Navigation
  const [activeTab, setActiveTab] = useState('placements'); // 'placements' | 'monitor' | 'alerts' | 'events' | 'employees' | 'reports'
  const [userRole, setUserRole] = useState('admin');
  const [unauthorizedAlert, setUnauthorizedAlert] = useState(null);
  const [selectedEvidenceEvent, setSelectedEvidenceEvent] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const cctvMonitorRef = useRef(null);

  const handleCaptureCurrentFrame = useCallback(() => {
    if (cctvMonitorRef.current && typeof cctvMonitorRef.current.captureCurrentFrame === 'function') {
      return cctvMonitorRef.current.captureCurrentFrame();
    }
    return null;
  }, []);

  // Authenticated Data Fetching (Strictly executed when Admin is verified)
  const fetchAdminData = useCallback(async (tokenToUse) => {
    const token = tokenToUse || adminToken || sessionStorage.getItem('redtag_admin_token');
    if (!token) return;

    const headers = { 'Authorization': `Bearer ${token}` };

    try {
      const [statusRes, eventsRes, settingsRes, polyRes, activeRes, employeesRes] = await Promise.all([
        fetch('/api/status').then(r => r.json()).catch(() => null),
        fetch('/api/events?limit=50', { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/settings', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/config/polygon').then(r => r.json()).catch(() => null),
        fetch('/api/objects/active', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/employees', { headers }).then(r => r.ok ? r.json() : []).catch(() => [])
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
    } catch (err) {
      console.warn('Admin data fetch error:', err.message);
    }
  }, [adminToken]);

  // Initial Verification: Check if user already holds a valid admin session or requested #admin
  useEffect(() => {
    const savedToken = sessionStorage.getItem('redtag_admin_token');
    const urlParams = new URLSearchParams(window.location.search);
    const wantsAdmin = urlParams.get('view') === 'admin' || window.location.pathname.includes('/admin') || window.location.hash === '#admin';

    if (savedToken) {
      fetch('/api/admin/verify', {
        headers: { 'Authorization': `Bearer ${savedToken}` }
      })
        .then(r => r.json())
        .then(data => {
          if (data.authenticated) {
            setAdminToken(savedToken);
            if (wantsAdmin) {
              setViewMode('admin');
              fetchAdminData(savedToken);
            }
          } else {
            sessionStorage.removeItem('redtag_admin_token');
            setAdminToken(null);
            if (wantsAdmin) setShowAdminLogin(true);
          }
        })
        .catch(() => {
          sessionStorage.removeItem('redtag_admin_token');
          setAdminToken(null);
        });
    } else if (wantsAdmin) {
      setShowAdminLogin(true);
    }
  }, [fetchAdminData]);

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
          department: data.employee?.department || 'General'
        });
      } else {
        sounds.playUnauthorized?.();
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
    });

    s.on('placement_unauthorized_alert', (data) => {
      sounds.playUnauthorized?.();
      setUnauthorizedAlert(data);
      if (data.event) {
        setEvents(prev => [data.event, ...prev.filter(e => e.id !== data.eventId)]);
      }
    });

    s.on('object_removed', (data) => {
      setActiveObjects(prev => prev.filter(o =>
        o.id !== data.objectId &&
        o.objectId !== data.objectId &&
        o.object_type !== data.label &&
        o.objectType !== data.label
      ));
    });

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  // Handlers
  const handleSaveROI = async (newROI) => {
    setROI(newROI);
    if (!adminToken) return;
    await fetch('/api/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ roi: newROI })
    });
  };

  const handleSaveSettings = async (newSettings) => {
    setSettings(newSettings);
    if (!adminToken) return;
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(newSettings)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
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

  // Logout from Admin and return to Kiosk Mode (Rule 5 & 7)
  const handleLogoutToKiosk = async () => {
    if (adminToken) {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }).catch(() => {});
    }
    sessionStorage.removeItem('redtag_admin_token');
    setAdminToken(null);
    setViewMode('kiosk');
    setShowAdminLogin(false);
    setEvents([]);
    setEmployees([]);
    setActiveObjects([]);
  };

  // ─────────────────────────────────────────────────────────────
  // VIEW MODE 1 & 2: EMPLOYEE KIOSK & ADMIN PORTAL
  // ─────────────────────────────────────────────────────────────
  const openAlertsCount = events.filter(e =>
    (e.event_type === 'UNAUTHORIZED_PLACEMENT' || e.alert_status === 'ALERT_TRIGGERED' || e.alert_status === 'OPEN') &&
    e.status !== 'RESOLVED' && e.alert_status !== 'RESOLVED'
  ).length;

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────
          VIEW MODE 1: EMPLOYEE KIOSK (Rule 1 & 2: Zero Admin Leaks)
      ────────────────────────────────────────────────────────────── */}
      <div style={{ display: viewMode === 'kiosk' ? 'block' : 'none', minHeight: '100vh' }}>
        <KioskView
          socket={socket}
          onCaptureCurrentFrame={handleCaptureCurrentFrame}
          onOpenAdmin={() => {
            if (adminToken) {
              setViewMode('admin');
              fetchAdminData(adminToken);
            } else {
              setShowAdminLogin(true);
            }
          }}
        />

        {showAdminLogin && (
          <AdminLoginModal
            onLoginSuccess={(token) => {
              setAdminToken(token);
              setShowAdminLogin(false);
              setViewMode('admin');
              fetchAdminData(token);
            }}
            onCancel={() => setShowAdminLogin(false)}
          />
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          VIEW MODE 2: ADMINISTRATOR PORTAL (Rule 3, 4, & 10)
      ────────────────────────────────────────────────────────────── */}
      <div style={{ display: viewMode === 'admin' ? 'flex' : 'none', minHeight: '100vh', flexDirection: 'column', background: 'var(--bg-core)' }}>
        {/* Global Admin Header */}
        <Header
          systemStatus={systemStatus}
          activeToken={activeToken}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onLogoutToKiosk={handleLogoutToKiosk}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          cameraActive={cameraActive}
          alertsCount={openAlertsCount}
          userRole={userRole}
          setUserRole={setUserRole}
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
            <PlacementsManager adminToken={adminToken} />
          </div>

          {/* Tab 2: Live Monitor (CCTVMonitor remains mounted persistently) */}
          <div style={{ display: activeTab === 'monitor' ? 'block' : 'none' }}>
            {/* Four Primary KPI Cards */}
            <KPIMetricsBar
              events={events}
              systemStatus={systemStatus}
              cameraActive={cameraActive}
            />

            {/* Main Live Monitoring Area (65% / 35% Grid) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.85fr) minmax(0, 1fr)',
              gap: '20px',
              alignItems: 'start'
            }}>
              {/* Live Red Tag Area Camera & Polygon */}
              <CCTVMonitor
                cctvRef={cctvMonitorRef}
                roi={roi}
                onSaveROI={handleSaveROI}
                telemetry={telemetry}
                unauthorizedAlert={unauthorizedAlert}
                onUnauthorizedAlert={setUnauthorizedAlert}
                activeToken={activeToken}
                polygonVertices={polygonVertices}
                onPolygonChange={(newPoly) => setPolygonVertices(newPoly)}
                onCameraStateChange={setCameraActive}
                onActivityChange={setCurrentActivity}
              />

              {/* Operations Panel */}
              <DeviceOperationsPanel
                onSimulateRFID={handleSimulateRFID}
                activeToken={activeToken}
                systemStatus={systemStatus}
                polygonVertices={polygonVertices}
                cameraActive={cameraActive}
                currentActivity={currentActivity}
                unauthorizedAlert={unauthorizedAlert}
                onViewEvidence={(ev) => setSelectedEvidenceEvent(ev)}
              />
            </div>

            {/* Active Tracked Objects */}
            <ActiveObjectsPanel activeObjects={activeObjects} />

            {/* Recent Events Audit Trail */}
            <RecentEvents
              events={events}
              onSelectEvidence={(ev) => setSelectedEvidenceEvent(ev)}
            />
          </div>

          {/* Tab 3: Alerts Manager */}
          <div style={{ display: activeTab === 'alerts' ? 'block' : 'none' }}>
            <AlertsManager
              socket={socket}
              onViewEvidence={(ev) => setSelectedEvidenceEvent(ev)}
            />
          </div>

          {/* Tab 4: Events Log */}
          <div style={{ display: activeTab === 'events' ? 'block' : 'none' }}>
            <EventsManager
              events={events}
              onSelectEvidence={(ev) => setSelectedEvidenceEvent(ev)}
            />
          </div>

          {/* Tab 5: Employees Manager */}
          <div style={{ display: activeTab === 'employees' ? 'block' : 'none' }}>
            <EmployeeManager
              employees={employees}
              onSaveEmployee={handleSaveEmployee}
              onDeleteEmployee={handleDeleteEmployee}
              onSimulateRFID={handleSimulateRFID}
            />
          </div>

          {/* Tab 6: Reports */}
          <div style={{ display: activeTab === 'reports' ? 'block' : 'none' }}>
            <ReportingPanel events={events} />
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
        />
      )}
      </div>
    </>
  );
}
