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
    evidence_image_path TEXT,
    mail_job_id TEXT,
    email_status TEXT DEFAULT 'PENDING',
    email_sent_at DATETIME,
    email_error TEXT
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mail_jobs (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    alert_id TEXT,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    evidence_path TEXT,
    status TEXT DEFAULT 'PENDING', -- PENDING, SENT, FAILED
    attempt_count INTEGER DEFAULT 0,
    last_attempt_at DATETIME,
    sent_at DATETIME,
    failure_reason TEXT,
    payload TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS kiosk_registrations (
    id TEXT PRIMARY KEY,
    rfid_uid TEXT NOT NULL,
    employee_id TEXT,
    employee_name TEXT,
    department TEXT,
    item_name TEXT NOT NULL,
    serial_number TEXT,
    description TEXT,
    reason TEXT,
    duration_min INTEGER DEFAULT 5,
    status TEXT DEFAULT 'PENDING_PLACEMENT',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    placed_at DATETIME,
    event_id TEXT,
    object_id TEXT
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
  if (!existingCols.includes('item_name')) db.exec(`ALTER TABLE events ADD COLUMN item_name TEXT;`);
  if (!existingCols.includes('serial_number')) db.exec(`ALTER TABLE events ADD COLUMN serial_number TEXT;`);
  if (!existingCols.includes('description')) db.exec(`ALTER TABLE events ADD COLUMN description TEXT;`);
  if (!existingCols.includes('placement_reason')) db.exec(`ALTER TABLE events ADD COLUMN placement_reason TEXT;`);
  if (!existingCols.includes('placement_duration_min')) db.exec(`ALTER TABLE events ADD COLUMN placement_duration_min INTEGER DEFAULT 5;`);
  if (!existingCols.includes('department')) db.exec(`ALTER TABLE events ADD COLUMN department TEXT;`);
  if (!existingCols.includes('registered_at')) db.exec(`ALTER TABLE events ADD COLUMN registered_at DATETIME;`);

  const existingObjCols = db.prepare(`PRAGMA table_info(objects)`).all().map(c => c.name);
  if (!existingObjCols.includes('item_name')) db.exec(`ALTER TABLE objects ADD COLUMN item_name TEXT;`);
  if (!existingObjCols.includes('serial_number')) db.exec(`ALTER TABLE objects ADD COLUMN serial_number TEXT;`);
  if (!existingObjCols.includes('description')) db.exec(`ALTER TABLE objects ADD COLUMN description TEXT;`);
  if (!existingObjCols.includes('placement_reason')) db.exec(`ALTER TABLE objects ADD COLUMN placement_reason TEXT;`);
  if (!existingObjCols.includes('placement_duration_min')) db.exec(`ALTER TABLE objects ADD COLUMN placement_duration_min INTEGER DEFAULT 5;`);
  if (!existingObjCols.includes('department')) db.exec(`ALTER TABLE objects ADD COLUMN department TEXT;`);
  if (!existingObjCols.includes('registered_at')) db.exec(`ALTER TABLE objects ADD COLUMN registered_at DATETIME;`);

  const existingAlertCols = db.prepare(`PRAGMA table_info(alerts)`).all().map(c => c.name);
  if (!existingAlertCols.includes('mail_job_id')) db.exec(`ALTER TABLE alerts ADD COLUMN mail_job_id TEXT;`);
  if (!existingAlertCols.includes('email_status')) db.exec(`ALTER TABLE alerts ADD COLUMN email_status TEXT DEFAULT 'PENDING';`);
  if (!existingAlertCols.includes('email_sent_at')) db.exec(`ALTER TABLE alerts ADD COLUMN email_sent_at DATETIME;`);
  if (!existingAlertCols.includes('email_error')) db.exec(`ALTER TABLE alerts ADD COLUMN email_error TEXT;`);
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
  capture_authorized_evidence: 'true',
  alert_email_recipient: 'yochitcheedella@gmail.com',
  admin_username: 'admin',
  admin_password: 'admin123'
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

// Employee registry is populated via Admin Portal or direct user registration

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
      time_difference, evidence_image, camera_id, notes,
      item_name, serial_number, description, placement_reason, placement_duration_min, department, registered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    eventData.notes || null,
    eventData.item_name || null,
    eventData.serial_number || null,
    eventData.description || null,
    eventData.placement_reason || null,
    eventData.placement_duration_min !== undefined ? eventData.placement_duration_min : 5,
    eventData.department || null,
    eventData.registered_at || null
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
          'OPEN',
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
    data.status || 'OPEN',
    data.message,
    data.evidence_image_path || null
  );
}

export function getAlerts(filter = 'ALL', limit = 100) {
  // Normalize any legacy TRIGGERED alerts to OPEN
  try {
    db.prepare("UPDATE alerts SET status = 'OPEN' WHERE status = 'TRIGGERED'").run();
  } catch (e) {}

  let query = `
    SELECT 
      a.id,
      a.object_event_id,
      a.timestamp,
      a.status,
      a.message,
      a.mail_job_id,
      COALESCE(a.email_status, 'PENDING') as email_status,
      a.email_sent_at,
      a.email_error,
      COALESCE(a.evidence_image_path, e.evidence_image) as evidence_image,
      COALESCE(e.object_id, 'OBJ-' || SUBSTR(a.id, -4)) as object_id,
      COALESCE(e.object_type, 'Placed Object') as object_type,
      e.rfid_uid,
      e.employee_name,
      e.employee_id,
      COALESCE(e.authorization_status, 'NO_RFID') as authorization_status,
      e.time_difference,
      e.confidence,
      e.camera_id,
      e.notes
    FROM alerts a
    LEFT JOIN events e ON a.object_event_id = e.id
  `;
  const params = [];
  if (filter && filter !== 'ALL') {
    query += ` WHERE UPPER(a.status) = ?`;
    params.push(filter.toUpperCase());
  }
  query += ` ORDER BY a.timestamp DESC LIMIT ?`;
  params.push(limit);
  return db.prepare(query).all(...params);
}

export function getAlertById(id) {
  return db.prepare(`
    SELECT 
      a.id,
      a.object_event_id,
      a.timestamp,
      a.status,
      a.message,
      a.mail_job_id,
      COALESCE(a.email_status, 'PENDING') as email_status,
      a.email_sent_at,
      a.email_error,
      COALESCE(a.evidence_image_path, e.evidence_image) as evidence_image,
      COALESCE(e.object_id, 'OBJ-' || SUBSTR(a.id, -4)) as object_id,
      COALESCE(e.object_type, 'Placed Object') as object_type,
      e.rfid_uid,
      e.employee_name,
      e.employee_id,
      COALESCE(e.authorization_status, 'NO_RFID') as authorization_status,
      e.time_difference,
      e.confidence,
      e.camera_id,
      e.notes
    FROM alerts a
    LEFT JOIN events e ON a.object_event_id = e.id
    WHERE a.id = ?
  `).get(id);
}

export function updateAlertStatus(id, status) {
  const normStatus = status.toUpperCase();
  const res = db.prepare('UPDATE alerts SET status = ? WHERE id = ?').run(normStatus, id);
  const alertRow = db.prepare('SELECT object_event_id FROM alerts WHERE id = ?').get(id);
  if (alertRow && alertRow.object_event_id) {
    db.prepare('UPDATE events SET alert_status = ? WHERE id = ?').run(normStatus, alertRow.object_event_id);
  }
  return res.changes > 0;
}

// ─── MAIL JOBS MANAGEMENT (Section: Mail Processing Pipeline) ─────────────────

export function createMailJob(job) {
  const id = job.id || `MAIL-${Date.now().toString().slice(-5)}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
  const stmt = db.prepare(`
    INSERT INTO mail_jobs (
      id, event_id, alert_id, recipient, subject, evidence_path,
      status, attempt_count, last_attempt_at, sent_at, failure_reason, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    job.event_id,
    job.alert_id || null,
    job.recipient,
    job.subject,
    job.evidence_path || null,
    job.status || 'PENDING',
    job.attempt_count || 0,
    job.last_attempt_at || null,
    job.sent_at || null,
    job.failure_reason || null,
    typeof job.payload === 'object' ? JSON.stringify(job.payload) : (job.payload || null)
  );

  // Link alert if alert_id is provided or found by event_id
  if (job.alert_id) {
    db.prepare('UPDATE alerts SET mail_job_id = ?, email_status = ? WHERE id = ?').run(id, job.status || 'PENDING', job.alert_id);
  } else if (job.event_id) {
    db.prepare('UPDATE alerts SET mail_job_id = ?, email_status = ? WHERE object_event_id = ?').run(id, job.status || 'PENDING', job.event_id);
  }

  return getMailJobById(id);
}

export function getMailJobById(id) {
  return db.prepare('SELECT * FROM mail_jobs WHERE id = ?').get(id);
}

export function getMailJobByEventId(eventId) {
  return db.prepare('SELECT * FROM mail_jobs WHERE event_id = ? ORDER BY created_at DESC LIMIT 1').get(eventId);
}

export function getMailJobByAlertId(alertId) {
  return db.prepare('SELECT * FROM mail_jobs WHERE alert_id = ? ORDER BY created_at DESC LIMIT 1').get(alertId);
}

export function updateMailJob(id, updates) {
  const current = getMailJobById(id);
  if (!current) return null;

  const status = updates.status !== undefined ? updates.status : current.status;
  const attempt_count = updates.attempt_count !== undefined ? updates.attempt_count : current.attempt_count;
  const last_attempt_at = updates.last_attempt_at !== undefined ? updates.last_attempt_at : current.last_attempt_at;
  const sent_at = updates.sent_at !== undefined ? updates.sent_at : current.sent_at;
  const failure_reason = updates.failure_reason !== undefined ? updates.failure_reason : current.failure_reason;

  db.prepare(`
    UPDATE mail_jobs
    SET status = ?, attempt_count = ?, last_attempt_at = ?, sent_at = ?, failure_reason = ?
    WHERE id = ?
  `).run(status, attempt_count, last_attempt_at, sent_at, failure_reason, id);

  // Synchronize alert row with email delivery status
  if (current.alert_id) {
    db.prepare(`
      UPDATE alerts
      SET email_status = ?, email_sent_at = ?, email_error = ?, mail_job_id = ?
      WHERE id = ?
    `).run(status, sent_at, failure_reason, id, current.alert_id);
  } else if (current.event_id) {
    db.prepare(`
      UPDATE alerts
      SET email_status = ?, email_sent_at = ?, email_error = ?, mail_job_id = ?
      WHERE object_event_id = ?
    `).run(status, sent_at, failure_reason, id, current.event_id);
  }

  return getMailJobById(id);
}

export function getPendingMailJobs() {
  return db.prepare("SELECT * FROM mail_jobs WHERE status = 'PENDING' OR (status = 'FAILED' AND attempt_count < 3) ORDER BY created_at ASC").all();
}

// Section 82: Register Authorized/Tracked Object Record
export function registerObject(obj) {
  const stmt = db.prepare(`
    INSERT INTO objects (
      id, event_id, object_type, rfid_uid, employee_id, employee_name,
      authorization_status, state, bounding_box, evidence_image, camera_id,
      first_seen, last_seen,
      item_name, serial_number, description, placement_reason, placement_duration_min, department, registered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      evidence_image = excluded.evidence_image,
      item_name = COALESCE(excluded.item_name, objects.item_name),
      serial_number = COALESCE(excluded.serial_number, objects.serial_number),
      description = COALESCE(excluded.description, objects.description),
      placement_reason = COALESCE(excluded.placement_reason, objects.placement_reason),
      placement_duration_min = COALESCE(excluded.placement_duration_min, objects.placement_duration_min),
      department = COALESCE(excluded.department, objects.department),
      registered_at = COALESCE(excluded.registered_at, objects.registered_at)
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
    obj.last_seen || now,
    obj.item_name || null,
    obj.serial_number || null,
    obj.description || null,
    obj.placement_reason || null,
    obj.placement_duration_min !== undefined ? obj.placement_duration_min : 5,
    obj.department || null,
    obj.registered_at || null
  );
  return getObjectById(obj.id);
}

// Kiosk Session and Item Registration Store
export function createKioskRegistration(data) {
  const id = data.id || `REG-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
  const now = new Date().toISOString();
  const durationMin = parseInt(data.duration_min || 5, 10);
  const expiresAt = new Date(Date.now() + durationMin * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO kiosk_registrations (
      id, rfid_uid, employee_id, employee_name, department,
      item_name, serial_number, description, reason, duration_min,
      status, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.rfid_uid.trim().toUpperCase(),
    data.employee_id || null,
    data.employee_name || null,
    data.department || 'General',
    data.item_name.trim(),
    data.serial_number ? data.serial_number.trim() : null,
    data.description ? data.description.trim() : null,
    data.reason ? data.reason.trim() : null,
    durationMin,
    'PENDING_PLACEMENT',
    now,
    expiresAt
  );

  return db.prepare('SELECT * FROM kiosk_registrations WHERE id = ?').get(id);
}

export function getKioskRegistrationById(id) {
  return db.prepare('SELECT * FROM kiosk_registrations WHERE id = ?').get(id);
}

export function expireOldKioskRegistrations() {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE kiosk_registrations 
    SET status = 'EXPIRED' 
    WHERE status = 'PENDING_PLACEMENT' AND datetime(expires_at) <= datetime(?)
  `).run(now);
}

export function getAnyPendingKioskRegistration() {
  expireOldKioskRegistrations();
  return db.prepare(`
    SELECT * FROM kiosk_registrations 
    WHERE status = 'PENDING_PLACEMENT' AND datetime(expires_at) > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get();
}

export function getActiveKioskRegistration(rfidUID) {
  expireOldKioskRegistrations();
  if (!rfidUID) {
    return db.prepare("SELECT * FROM kiosk_registrations WHERE status = 'PENDING_PLACEMENT' AND datetime(expires_at) > datetime('now') ORDER BY created_at DESC LIMIT 1").get();
  }
  return db.prepare(`
    SELECT * FROM kiosk_registrations 
    WHERE UPPER(rfid_uid) = ? AND status = 'PENDING_PLACEMENT' AND datetime(expires_at) > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(rfidUID.trim().toUpperCase());
}

export function completeKioskRegistration(regId, eventId, objectId) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE kiosk_registrations 
    SET status = 'PLACED', placed_at = ?, event_id = ?, object_id = ?
    WHERE id = ?
  `).run(now, eventId, objectId, regId);
  return db.prepare('SELECT * FROM kiosk_registrations WHERE id = ?').get(regId);
}

export function expireKioskRegistration(regId) {
  db.prepare("UPDATE kiosk_registrations SET status = 'EXPIRED' WHERE id = ?").run(regId);
}

export function cancelKioskRegistration(regId) {
  db.prepare("UPDATE kiosk_registrations SET status = 'CANCELLED' WHERE id = ?").run(regId);
}

export function getPlacements(limit = 100) {
  return db.prepare(`
    SELECT 
      o.id as object_id,
      o.event_id,
      COALESCE(o.item_name, o.object_type) as item_name,
      o.serial_number,
      o.description,
      o.placement_reason,
      o.placement_duration_min,
      COALESCE(o.department, (SELECT department FROM employees WHERE UPPER(employees.rfid_uid) = UPPER(o.rfid_uid) LIMIT 1), 'General') as department,
      o.registered_at,
      o.first_seen as placed_at,
      o.last_seen,
      o.state,
      o.authorization_status,
      o.employee_name,
      o.employee_id,
      o.rfid_uid,
      o.evidence_image,
      o.camera_id
    FROM objects o
    WHERE o.authorization_status = 'AUTHORIZED'
      AND o.employee_name IS NOT NULL
      AND o.employee_name != 'Unidentified'
    ORDER BY o.first_seen DESC
    LIMIT ?
  `).all(limit);
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

export function deletePlacement(objectId) {
  const obj = db.prepare('SELECT event_id FROM objects WHERE id = ?').get(objectId);
  const eventId = obj?.event_id;

  if (eventId) {
    try {
      db.prepare('DELETE FROM mail_jobs WHERE event_id = ?').run(eventId);
    } catch (_) {}
    try {
      db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
    } catch (_) {}
    try {
      db.prepare('DELETE FROM kiosk_registrations WHERE event_id = ?').run(eventId);
    } catch (_) {}
  }

  try {
    db.prepare('DELETE FROM events WHERE object_id = ?').run(objectId);
  } catch (_) {}

  try {
    db.prepare('DELETE FROM kiosk_registrations WHERE object_id = ?').run(objectId);
  } catch (_) {}

  return db.prepare('DELETE FROM objects WHERE id = ?').run(objectId);
}

export function deleteEvent(eventId) {
  try {
    db.prepare('DELETE FROM mail_jobs WHERE event_id = ?').run(eventId);
  } catch (_) {}
  try {
    db.prepare('DELETE FROM kiosk_registrations WHERE event_id = ?').run(eventId);
  } catch (_) {}
  return db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
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
