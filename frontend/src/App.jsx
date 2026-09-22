import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Header from './components/Header';
import CCTVMonitor from './components/CCTVMonitor';
import DeviceOperationsPanel from './components/DeviceOperationsPanel';
import RecentEvents from './components/RecentEvents';
import EvidenceModal from './components/EvidenceModal';
import EmployeeManager from './components/EmployeeManager';
import SettingsModal from './components/SettingsModal';
import ReportingPanel from './components/ReportingPanel';
import AlertPanel from './components/AlertPanel';
import SimulationSuite from './components/SimulationSuite';
import KPIMetricsBar from './components/KPIMetricsBar';
import JavaDiagnosticsPanel from './components/JavaDiagnosticsPanel';
import ActiveObjectsPanel from './components/ActiveObjectsPanel';
import { sounds } from './utils/audio';

const SOCKET_SERVER = 'http://localhost:3001';

export default function App() {
  const [socket, setSocket] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);
  const [appMode, setAppMode] = useState('test'); // 'hardware' | 'test'
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
  const [employees, setEmployees] = useState([]);
  const [settings, setSettings] = useState(null);
  const [activeObjects, setActiveObjects] = useState([]);

  const [activeTab, setActiveTab] = useState('monitor'); // 'monitor' | 'employees' | 'reports'
  const [unauthorizedAlert, setUnauthorizedAlert] = useState(null);
  const [selectedEvidenceEvent, setSelectedEvidenceEvent] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Initial Data Fetching
  const fetchAllData = async () => {
    try {
      const [statusRes, eventsRes, empRes, settingsRes, polyRes, activeRes] = await Promise.all([
        fetch('/api/status').then(r => r.json()),
        fetch('/api/events?limit=50').then(r => r.json()),
        fetch('/api/employees').then(r => r.json()),
        fetch('/api/settings').then(r => r.json()),
        fetch('/api/config/polygon').then(r => r.json()).catch(() => null),
        fetch('/api/objects/active').then(r => r.json()).catch(() => null)
      ]);

      setSystemStatus(statusRes);
      if (statusRes.appMode) {
        setAppMode(statusRes.appMode);
      }
      if (statusRes.rfid?.activeToken) {
        setActiveToken(statusRes.rfid.activeToken);
      }
      if (statusRes.cctv?.roi) {
        setROI(statusRes.cctv.roi);
      }
      if (polyRes?.floor_tape_roi?.polygon_vertices?.length >= 3) {
        setPolygonVertices(polyRes.floor_tape_roi.polygon_vertices);
      }
      if (activeRes?.objects) {
        setActiveObjects(activeRes.objects);
      }
      setEvents(eventsRes);
      setEmployees(empRes);
      setSettings(settingsRes);
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
      console.log('⚡ Connected to Red Tag Monitoring Backend Socket');
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
        sounds.playAuthorized();
        setActiveToken({
          ...data.activeToken,
          uid: data.uid,
          employee_name: data.employee?.name || data.uid,
          expires_at: data.valid_until,
          duration_ms: data.duration_ms,
          is_authorized: true
        });
      } else {
        sounds.playUnauthorizedAlert();
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
      sounds.playAuthorized();
      setUnauthorizedAlert(null);
    });

    s.on('placement_unauthorized_alert', (data) => {
      sounds.playUnauthorizedAlert();
      setUnauthorizedAlert(data);
    });

    s.on('new_event_logged', (newEvent) => {
      setEvents(prev => [newEvent, ...prev.slice(0, 49)]);
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

    // Sync polygon live when backend or Java engine updates it
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
    });

    setSocket(s);

    // Poll systemStatus every 8s to keep Header indicators live
    const statusPoll = setInterval(() => {
      fetch('/api/status').then(r => r.json()).then(data => {
        setSystemStatus(data);
        if (data.rfid?.activeToken) setActiveToken(data.rfid.activeToken);
      }).catch(() => {});
    }, 8000);

    return () => {
      s.disconnect();
      clearInterval(statusPoll);
    };
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

  const handleToggleAppMode = async (mode) => {
    setAppMode(mode);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_mode: mode })
    });
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-core)' }}>
      {/* Top SOC Navigation & Telemetry Header */}
      <Header
        systemStatus={systemStatus}
        activeToken={activeToken}
        appMode={appMode}
        onToggleAppMode={handleToggleAppMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Workspace */}
      <main style={{
        flex: 1,
        padding: '20px 24px',
        maxWidth: '1600px',
        width: '100%',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Section 23: Prominent Security Alert Panel */}
        {unauthorizedAlert && (
          <AlertPanel
            alert={unauthorizedAlert}
            onViewEvidence={(ev) => setSelectedEvidenceEvent(ev)}
            onDismiss={() => setUnauthorizedAlert(null)}
          />
        )}

        {activeTab === 'monitor' ? (
          <>
            {/* Real-Time Operational KPI Metrics Bar */}
            <KPIMetricsBar
              events={events}
              systemStatus={systemStatus}
              activeObjectsCount={telemetry?.objectsInROI?.length || 0}
            />

            {/* Top Grid: CCTV Video Stream & Production Device Operations Panel */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
              gap: '20px',
              alignItems: 'start'
            }}>
              <CCTVMonitor
                roi={roi}
                onSaveROI={handleSaveROI}
                telemetry={telemetry}
                unauthorizedAlert={unauthorizedAlert}
                onUnauthorizedAlert={setUnauthorizedAlert}
                activeToken={activeToken}
                polygonVertices={polygonVertices}
                onPolygonChange={(newPoly) => setPolygonVertices(newPoly)}
              />

              <DeviceOperationsPanel
                onSimulateRFID={handleSimulateRFID}
                activeToken={activeToken}
                systemStatus={systemStatus}
                polygonVertices={polygonVertices}
                appMode={appMode}
                onToggleAppMode={handleToggleAppMode}
                onResetPolygon={async () => {
                  const defaultPoly = [
                    { x: 130, y: 180 },
                    { x: 510, y: 180 },
                    { x: 560, y: 440 },
                    { x: 80, y: 440 }
                  ];
                  setPolygonVertices(defaultPoly);
                  await fetch('/api/config/polygon', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ polygon_vertices: defaultPoly })
                  });
                }}
              />
            </div>

            {/* Bottom row: SimulationSuite + Event Audit Log */}
            <SimulationSuite
              onSimulateRFID={handleSimulateRFID}
              onSimulatePlacement={handleSimulatePlacement}
              activeToken={activeToken}
            />

            {/* Section 32: Active Tracked Objects in Red Tag Area */}
            <ActiveObjectsPanel activeObjects={activeObjects} />

            {/* Comprehensive Event Audit Log */}
            <RecentEvents
              events={events}
              onSelectEvidence={(ev) => setSelectedEvidenceEvent(ev)}
            />
          </>
        ) : activeTab === 'reports' ? (
          <ReportingPanel />
        ) : activeTab === 'java' ? (
          <JavaDiagnosticsPanel systemStatus={systemStatus} />
        ) : (
          <EmployeeManager
            employees={employees}
            onSaveEmployee={handleSaveEmployee}
            onDeleteEmployee={handleDeleteEmployee}
            onSimulateRFID={handleSimulateRFID}
          />
        )}
      </main>

      {/* Privacy-Cropped Evidence Inspector Modal */}
      {selectedEvidenceEvent && (
        <EvidenceModal
          event={selectedEvidenceEvent}
          onClose={() => setSelectedEvidenceEvent(null)}
        />
      )}

      {/* System Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          systemStatus={systemStatus}
          onSaveSettings={handleSaveSettings}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
}
