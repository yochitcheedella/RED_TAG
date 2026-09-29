import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
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

  const [activeTab, setActiveTab] = useState('monitor'); // 'monitor' | 'alerts' | 'events' | 'employees' | 'reports'
  const [userRole, setUserRole] = useState('admin'); // 'operator' | 'admin' | 'developer' (Section 35)
  const [unauthorizedAlert, setUnauthorizedAlert] = useState(null);
  const [selectedEvidenceEvent, setSelectedEvidenceEvent] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Initial Data Fetching from actual database & endpoints
  const fetchAllData = async () => {
    try {
      const [statusRes, eventsRes, settingsRes, polyRes, activeRes, employeesRes] = await Promise.all([
        fetch('/api/status').then(r => r.json()).catch(() => null),
        fetch('/api/events?limit=50').then(r => r.json()).catch(() => []),
        fetch('/api/settings').then(r => r.json()).catch(() => null),
        fetch('/api/config/polygon').then(r => r.json()).catch(() => null),
        fetch('/api/objects/active').then(r => r.json()).catch(() => null),
        fetch('/api/employees').then(r => r.json()).catch(() => [])
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
      console.warn('Backend connection pending:', err.message);
    }
  };

  useEffect(() => {
    fetchAllData();

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
          duration_ms: data.duration_ms,
          is_authorized: true
        });
      } else {
        sounds.playUnauthorizedAlert?.();
        setActiveToken({
          uid: data.uid,
          employee_name: data.employee?.name || 'Unregistered Cardholder',
          expires_at: Date.now() + 5000,
          duration_ms: 5000,
          is_authorized: false
        });
      }
    });

    s.on('rfid_token_expired', () => {
      setActiveToken(null);
    });

    s.on('placement_authorized', (data) => {
      sounds.playAuthorized?.();
      setUnauthorizedAlert(null);
      setCurrentActivity('Authorized placement');
    });

    s.on('placement_unauthorized_alert', (data) => {
      sounds.playUnauthorizedAlert?.();
      setUnauthorizedAlert(data);
      setCurrentActivity('Unauthorized placement');
    });

    s.on('new_event_logged', (newEvent) => {
      setEvents(prev => [newEvent, ...prev.slice(0, 49)]);
    });

    s.on('alert_status_changed', (data) => {
      if (data.status === 'RESOLVED') {
        setUnauthorizedAlert(null);
      }
      fetchAllData();
    });

    s.on('vision_telemetry', (data) => {
      setTelemetry(data);
    });

    s.on('objects_cleared', () => {
      setUnauthorizedAlert(null);
      window.dispatchEvent(new CustomEvent('redtag:clear_objects'));
      fetchAllData();
    });

    s.on('roi_updated', (newROI) => {
      setROI(newROI);
    });

    s.on('polygon_updated', (vertices) => {
      if (Array.isArray(vertices) && vertices.length >= 3) {
        setPolygonVertices(vertices);
      }
    });

    s.on('object_registered', (newObj) => {
      setActiveObjects(prev => {
        const id = newObj.id || newObj.objectId;
        const exists = prev.some(o => (o.id === id || o.objectId === id));
        if (exists) {
          return prev.map(o => (o.id === id || o.objectId === id) ? { ...o, ...newObj, state: 'PRESENT' } : o);
        }
        return [{ ...newObj, state: 'PRESENT' }, ...prev];
      });
    });

    s.on('object_removed', (data) => {
      setActiveObjects(prev => prev.filter(o =>
        o.id !== data.objectId &&
        o.objectId !== data.objectId &&
        o.object_type !== data.label &&
        o.objectType !== data.label
      ));
      window.dispatchEvent(new CustomEvent('redtag:object_removed', { detail: data }));
    });

    setSocket(s);

    const statusPoll = setInterval(() => {
      fetch('/api/status').then(r => r.json()).then(data => {
        setSystemStatus(data);
        if (data.rfid?.activeToken) setActiveToken(data.rfid.activeToken);
      }).catch(() => {});
    }, 6000);

    return () => {
      s.disconnect();
      clearInterval(statusPoll);
    };
  }, []);

  // Global USB HID RFID Scanner Listener
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return;
      }

      const now = Date.now();
      if (now - lastKeyTime > 500) {
        scanBuffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (scanBuffer.trim().length >= 3) {
          e.preventDefault();
          e.stopPropagation();
          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
          handleSimulateRFID(scanBuffer.trim());
          scanBuffer = '';
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        scanBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, []);

  // Handlers
  const handleSaveROI = async (newROI) => {
    setROI(newROI);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roi: newROI })
    });
  };

  const handleSaveSettings = async (newSettings) => {
    setSettings(newSettings);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings)
    });
    setIsSettingsOpen(false);
    fetchAllData();
  };

  const handleSimulateRFID = async (uid) => {
    await fetch('/api/simulate/rfid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid })
    });
  };

  const handleSimulatePlacement = async (objectType, insideROI = true) => {
    await fetch('/api/simulate/placement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectType, insideROI })
    });
  };

  const handleSaveEmployee = async (empData) => {
    await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(empData)
    });
    fetchAllData();
  };

  const handleDeleteEmployee = async (id) => {
    await fetch(`/api/employees/${id}`, { method: 'DELETE' });
    fetchAllData();
  };

  // Compute open alerts count
  const openAlertsCount = events.filter(e =>
    (e.alert_status === 'ALERT_TRIGGERED' || (e.authorization_status !== 'AUTHORIZED' && e.event_type !== 'RFID_SCAN')) &&
    e.alert_status !== 'RESOLVED'
  ).length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-core)' }}>
      {/* Global Header (Section 3) */}
      <Header
        systemStatus={systemStatus}
        activeToken={activeToken}
        onOpenSettings={() => setIsSettingsOpen(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        cameraActive={cameraActive}
        alertsCount={openAlertsCount}
        userRole={userRole}
        setUserRole={setUserRole}
      />

      {/* Main Operational Container */}
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

        {/* Tab Route Switching */}
        {activeTab === 'monitor' ? (
          <>
            {/* Section 5: Four Primary KPI Cards */}
            <KPIMetricsBar
              events={events}
              systemStatus={systemStatus}
              cameraActive={cameraActive}
            />

            {/* Section 6: Main Live Monitoring Area (65% / 35% Grid) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.85fr) minmax(0, 1fr)',
              gap: '20px',
              alignItems: 'start'
            }}>
              {/* Left Panel (~65% width): Live Red Tag Area Camera & Polygon */}
              <CCTVMonitor
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

              {/* Right Panel (~35% width): System Status, RFID Status, Active Alerts */}
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

            {/* Active Tracked Objects in Red Tag Area */}
            <ActiveObjectsPanel activeObjects={activeObjects} />

            {/* Section 12: Recent Events Audit Trail */}
            <RecentEvents
              events={events}
              onSelectEvidence={(ev) => setSelectedEvidenceEvent(ev)}
            />
          </>
        ) : activeTab === 'alerts' ? (
          /* Section 13: Alerts Page */
          <AlertsManager
            socket={socket}
            onViewEvidence={(ev) => setSelectedEvidenceEvent(ev)}
          />
        ) : activeTab === 'events' ? (
          /* Section 14: Events Page */
          <EventsManager
            events={events}
            onSelectEvidence={(ev) => setSelectedEvidenceEvent(ev)}
          />
        ) : activeTab === 'employees' ? (
          /* Employee & RFID Registry Page */
          <EmployeeManager
            employees={employees}
            onSaveEmployee={handleSaveEmployee}
            onDeleteEmployee={handleDeleteEmployee}
            onSimulateRFID={handleSimulateRFID}
          />
        ) : (
          /* Section 15: Reports Page */
          <ReportingPanel events={events} />
        )}
      </main>

      {/* Object-Focused Evidence Inspector Modal (Section 22) */}
      {selectedEvidenceEvent && (
        <EvidenceModal
          event={selectedEvidenceEvent}
          onClose={() => setSelectedEvidenceEvent(null)}
        />
      )}

      {/* System Settings & Developer Tools Modal (Section 16 & 17) */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          systemStatus={systemStatus}
          onSaveSettings={handleSaveSettings}
          onClose={() => setIsSettingsOpen(false)}
          onSimulateRFID={handleSimulateRFID}
          onSimulatePlacement={handleSimulatePlacement}
          activeToken={activeToken}
          userRole={userRole}
        />
      )}
    </div>
  );
}
