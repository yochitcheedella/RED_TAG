import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../data/redtag.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    rfid_uid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    department TEXT DEFAULT 'General',
    is_authorized INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT NOT NULL, -- AUTHORIZED_PLACEMENT, UNAUTHORIZED_PLACEMENT, RFID_SCAN, OBJECT_REMOVED
    rfid_uid TEXT,
    employee_id TEXT,
    employee_name TEXT,
    object_type TEXT,
    object_id TEXT, -- Section 82 & 95: OBJ-xxx
    object_state TEXT DEFAULT 'PRESENT', -- Section 83: PRESENT, REMOVED
    authorization_status TEXT, -- AUTHORIZED, UNAUTHORIZED, NO_RFID, EXPIRED_RFID, TOKEN_ALREADY_CONSUMED
    alert_status TEXT DEFAULT 'NO_ALERT', -- NO_ALERT, ALERT_TRIGGERED, UNAUTHORIZED_SCAN
    confidence REAL DEFAULT 0.90,
    time_difference REAL, -- in seconds between RFID scan and placement confirmation
    evidence_image TEXT, -- relative filename of cropped object in uploads/evidence/
    camera_id TEXT DEFAULT 'CAM-01-REDTAG',
    notes TEXT
  );

  -- Section 82: Authorized & Tracked Objects Registry
  CREATE TABLE IF NOT EXISTS objects (
    id TEXT PRIMARY KEY,
    event_id TEXT,
    object_type TEXT,
    rfid_uid TEXT,
    employee_id TEXT,
    employee_name TEXT,
    authorization_status TEXT, -- AUTHORIZED, UNAUTHORIZED
    state TEXT DEFAULT 'PRESENT', -- PRESENT, REMOVED
    bounding_box TEXT,
    evidence_image TEXT,
    camera_id TEXT DEFAULT 'CAM-01-REDTAG',
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    removed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Section 31 Database Tables
  CREATE TABLE IF NOT EXISTS rfid_events (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    rfid_uid TEXT NOT NULL,
    employee_id TEXT,
    authorization_status TEXT,
    consumed INTEGER DEFAULT 0,
    expires_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS object_events (
    id TEXT PRIMARY KEY,
    tracking_id TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    object_type TEXT,
    authorization_status TEXT,
    object_state TEXT DEFAULT 'PRESENT',
    rfid_uid TEXT,
    employee_id TEXT,
    evidence_image_path TEXT,
    camera_id TEXT DEFAULT 'CAM-01-REDTAG'
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    object_event_id TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'TRIGGERED',
    message TEXT,
    evidence_image_path TEXT
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Migration to ensure existing DB files get new columns if they don't exist
try {
  const existingCols = db.prepare(`PRAGMA table_info(events)`).all().map(c => c.name);
  if (!existingCols.includes('employee_id')) db.exec(`ALTER TABLE events ADD COLUMN employee_id TEXT;`);
  if (!existingCols.includes('alert_status')) db.exec(`ALTER TABLE events ADD COLUMN alert_status TEXT DEFAULT 'NO_ALERT';`);
  if (!existingCols.includes('confidence')) db.exec(`ALTER TABLE events ADD COLUMN confidence REAL DEFAULT 0.90;`);
  if (!existingCols.includes('camera_id')) db.exec(`ALTER TABLE events ADD COLUMN camera_id TEXT DEFAULT 'CAM-01-REDTAG';`);
  if (!existingCols.includes('object_id')) db.exec(`ALTER TABLE events ADD COLUMN object_id TEXT;`);
  if (!existingCols.includes('object_state')) db.exec(`ALTER TABLE events ADD COLUMN object_state TEXT DEFAULT 'PRESENT';`);
} catch (e) {
  console.warn('Migration note:', e.message);
}

// Seed default settings if not exists
const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
const setSystemSettingStmt = db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)');

const defaultSettings = {
  app_mode: 'test', // 'hardware' or 'test' (Rule 30 & 31)
  roi: JSON.stringify({ x: 160, y: 180, width: 320, height: 240 }),
  auth_window_ms: '60000', // 60 seconds authorization window
  rfid_authorization_window_ms: '60000',
  persistence_ms: '5000', // Section 1: 5000ms confirmation
  min_object_persistence_ms: '5000',
  object_missed_grace_ms: '1500', // Section 2: 1500ms miss grace
  object_removal_timeout_ms: '3000', // Section 2 & 22: 3000ms removal timeout
  tracking_iou_threshold: '0.3', // Section 6: IoU 0.3
  tracking_center_distance_threshold: '80', // Section 6: 80px distance
  persistence_frames: '4', // 4 consecutive frames
  confidence_threshold: '0.25', // Object detection confidence
  evidence_padding_px: '20', // Crop padding (Rule 17)
  rtsp_url: '',
  serial_port: '',
  baud_rate: '9600',
  camera_mode: 'webcam',
  capture_authorized_evidence: 'true'
};

for (const [key, val] of Object.entries(defaultSettings)) {
  if (!getSettingStmt.get(key)) {
    setSettingStmt.run(key, val);
  }
  setSystemSettingStmt.run(key, val);
}

// Migrate any existing 5000ms auth window to 60000ms (60 seconds)
try {
  db.prepare("UPDATE settings SET value = '60000' WHERE key = 'auth_window_ms' AND value = '5000'").run();
} catch (e) {
  console.warn('Settings migration note:', e.message);
}

// Seed default employees if none exist
const countEmployees = db.prepare('SELECT COUNT(*) as count FROM employees').get().count;
if (countEmployees === 0) {
  const insertEmp = db.prepare(
    'INSERT INTO employees (id, rfid_uid, name, department, is_authorized) VALUES (?, ?, ?, ?, ?)'
  );
  insertEmp.run('EMP-001', 'A472198C', 'Employee 001', 'Logistics', 1);
  insertEmp.run('EMP-002', 'B7214492', 'Employee 002', 'Quality Control', 1);
  insertEmp.run('EMP-003', 'XYZ12345', 'Employee 003', 'Contractor', 0);
  console.log('✅ Seeded default employees (A472198C, B7214492, XYZ12345)');
}

export function getEmployeeByUID(rfidUID) {
  if (!rfidUID) return null;
  const cleanUID = rfidUID.trim().toUpperCase();
  return db.prepare('SELECT * FROM employees WHERE UPPER(rfid_uid) = ?').get(cleanUID);
}

export function getAllEmployees() {
  return db.prepare('SELECT * FROM employees ORDER BY created_at DESC').all();
}

export function saveEmployee({ id, rfid_uid, name, department, is_authorized }) {
  const stmt = db.prepare(`
    INSERT INTO employees (id, rfid_uid, name, department, is_authorized)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      rfid_uid = excluded.rfid_uid,
      name = excluded.name,
      department = excluded.department,
      is_authorized = excluded.is_authorized
  `);
  stmt.run(id, rfid_uid.trim().toUpperCase(), name, department || 'General', is_authorized ? 1 : 0);
  return getEmployeeByUID(rfid_uid);
}

export function deleteEmployee(id) {
  return db.prepare('DELETE FROM employees WHERE id = ?').run(id);
}

export function logEvent(eventData) {
  const stmt = db.prepare(`
    INSERT INTO events (
      id, timestamp, event_type, rfid_uid, employee_id, employee_name,
      object_type, object_id, object_state, authorization_status, alert_status, confidence,
      time_difference, evidence_image, camera_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const timestamp = eventData.timestamp || new Date().toISOString();
  stmt.run(
    eventData.id,
    timestamp,
    eventData.event_type,
    eventData.rfid_uid || null,
    eventData.employee_id || null,
    eventData.employee_name || null,
    eventData.object_type || null,
    eventData.object_id || null,
    eventData.object_state || 'PRESENT',
    eventData.authorization_status || null,
    eventData.alert_status || 'NO_ALERT',
    eventData.confidence !== undefined ? eventData.confidence : 0.92,
    eventData.time_difference !== undefined ? eventData.time_difference : null,
    eventData.evidence_image || null,
    eventData.camera_id || 'CAM-01-REDTAG',
    eventData.notes || null
  );

  // Section 31: Sync to normalized tables
  try {
    if (eventData.event_type === 'RFID_SCAN') {
      db.prepare(`
        INSERT INTO rfid_events (id, timestamp, rfid_uid, employee_id, authorization_status, consumed)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        eventData.id,
        timestamp,
        eventData.rfid_uid || '',
        eventData.employee_id || null,
        eventData.authorization_status || 'UNKNOWN',
        0
      );
    } else if (eventData.event_type === 'AUTHORIZED_PLACEMENT' || eventData.event_type === 'UNAUTHORIZED_PLACEMENT') {
      db.prepare(`
        INSERT INTO object_events (
          id, tracking_id, timestamp, object_type, authorization_status,
          object_state, rfid_uid, employee_id, evidence_image_path, camera_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        eventData.id,
        eventData.object_id || eventData.id,
        timestamp,
        eventData.object_type || 'Object',
        eventData.authorization_status || 'PENDING',
        eventData.object_state || 'PRESENT',
        eventData.rfid_uid || null,
        eventData.employee_id || null,
        eventData.evidence_image || null,
        eventData.camera_id || 'CAM-01-REDTAG'
      );

      if (eventData.alert_status === 'ALERT_TRIGGERED' || eventData.authorization_status !== 'AUTHORIZED') {
        db.prepare(`
          INSERT INTO alerts (id, object_event_id, timestamp, status, message, evidence_image_path)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `ALT-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
          eventData.id,
          timestamp,
          'TRIGGERED',
          eventData.notes || `Unauthorized placement of ${eventData.object_type || 'object'} in Red Tag Area`,
          eventData.evidence_image || null
        );
      }
    }
  } catch (err) {
    console.warn('Normalized table sync note:', err.message);
  }

  return { ...eventData, timestamp };
}

export function logRfidEvent(data) {
  const timestamp = data.timestamp || new Date().toISOString();
  db.prepare(`
    INSERT INTO rfid_events (id, timestamp, rfid_uid, employee_id, authorization_status, consumed, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id,
    timestamp,
    data.rfid_uid,
    data.employee_id || null,
    data.authorization_status || 'UNKNOWN',
    data.consumed ? 1 : 0,
    data.expires_at || null
  );
}

export function logObjectEvent(data) {
  const timestamp = data.timestamp || new Date().toISOString();
  db.prepare(`
    INSERT INTO object_events (
      id, tracking_id, timestamp, object_type, authorization_status,
      object_state, rfid_uid, employee_id, evidence_image_path, camera_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id,
    data.tracking_id,
    timestamp,
    data.object_type,
    data.authorization_status,
    data.object_state || 'PRESENT',
    data.rfid_uid || null,
    data.employee_id || null,
    data.evidence_image_path || null,
    data.camera_id || 'CAM-01-REDTAG'
  );
}

export function logAlert(data) {
  const timestamp = data.timestamp || new Date().toISOString();
  db.prepare(`
    INSERT INTO alerts (id, object_event_id, timestamp, status, message, evidence_image_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.id,
    data.object_event_id,
    timestamp,
    data.status || 'TRIGGERED',
    data.message,
    data.evidence_image_path || null
  );
}

export function getAlerts(limit = 50) {
  return db.prepare('SELECT * FROM alerts ORDER BY timestamp DESC LIMIT ?').all(limit);
}

// Section 82: Register Authorized/Tracked Object Record
export function registerObject(obj) {
  const stmt = db.prepare(`
    INSERT INTO objects (
      id, event_id, object_type, rfid_uid, employee_id, employee_name,
      authorization_status, state, bounding_box, evidence_image, camera_id,
      first_seen, last_seen
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      event_id = excluded.event_id,
      object_type = excluded.object_type,
      rfid_uid = excluded.rfid_uid,
      employee_id = excluded.employee_id,
      employee_name = excluded.employee_name,
      authorization_status = excluded.authorization_status,
      state = excluded.state,
      last_seen = excluded.last_seen,
      bounding_box = excluded.bounding_box,
      evidence_image = excluded.evidence_image
  `);
  const now = new Date().toISOString();
  stmt.run(
    obj.id,
    obj.event_id || null,
    obj.object_type || 'Object',
    obj.rfid_uid || null,
    obj.employee_id || null,
    obj.employee_name || null,
    obj.authorization_status || 'AUTHORIZED',
    obj.state || 'PRESENT',
    typeof obj.bounding_box === 'object' ? JSON.stringify(obj.bounding_box) : (obj.bounding_box || null),
    obj.evidence_image || null,
    obj.camera_id || 'CAM-01-REDTAG',
    obj.first_seen || now,
    obj.last_seen || now
  );
  return getObjectById(obj.id);
}

export function getObjectById(id) {
  return db.prepare('SELECT * FROM objects WHERE id = ?').get(id);
}

export function getActiveObjects() {
  return db.prepare("SELECT * FROM objects WHERE state = 'PRESENT'").all();
}

export function clearAllActiveObjects() {
  const now = new Date().toISOString();
  return db.prepare("UPDATE objects SET state = 'REMOVED', removed_at = ?, last_seen = ? WHERE state = 'PRESENT'").run(now, now);
}

export function updateObjectState(id, state) {
  const now = new Date().toISOString();
  if (state === 'REMOVED') {
    return db.prepare("UPDATE objects SET state = ?, removed_at = ?, last_seen = ? WHERE id = ?").run(state, now, now, id);
  }
  return db.prepare("UPDATE objects SET state = ?, last_seen = ? WHERE id = ?").run(state, now, id);
}

export function markObjectRemoved(id) {
  return updateObjectState(id, 'REMOVED');
}

export function getEvents(limit = 100) {
  return db.prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT ?').all(limit);
}

export function getSetting(key) {
  const row = getSettingStmt.get(key);
  return row ? row.value : null;
}

export function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }
  return result;
}

export function updateSetting(key, value) {
  const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
  setSettingStmt.run(key, valStr);
  try {
    setSystemSettingStmt.run(key, valStr);
  } catch (err) {}
  return valStr;
}

export default db;
