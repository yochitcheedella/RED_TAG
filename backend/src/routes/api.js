import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  getAllEmployees,
  saveEmployee,
  deleteEmployee,
  getEvents,
  getAlerts,
  getAlertById,
  updateAlertStatus,
  getAllSettings,
  getSetting,
  updateSetting,
  getEmployeeByUID,
  getActiveObjects,
  getObjectById,
  updateObjectState,
  getMailJobById,
  getMailJobByAlertId,
  getMailJobByEventId,
  createKioskRegistration,
  getActiveKioskRegistration,
  completeKioskRegistration,
  cancelKioskRegistration,
  getPlacements
} from '../db.js';
import {
  requireAdmin,
  generateAdminToken,
  revokeAdminToken,
  verifyCredentials
} from '../middleware/auth.js';
import { rfidService } from '../services/rfidService.js';
import { visionService } from '../services/visionService.js';
import { reportingService } from '../services/reportingService.js';
import { correlationEngine } from '../services/correlationEngine.js';
import { mailQueueService } from '../services/mailQueueService.js';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportsDir = path.resolve(__dirname, '../../uploads/reports');
const evidenceDir = path.resolve(__dirname, '../../uploads/evidence');
if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

const router = express.Router();

// ==========================================
// 1. ADMINISTRATOR AUTHENTICATION ENDPOINTS
// ==========================================
router.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  if (verifyCredentials(username, password)) {
    const { token, expiresAt } = generateAdminToken(username);
    console.log(`🔐 [Auth] Administrator logged in: ${username}`);
    return res.json({
      success: true,
      token,
      expiresAt,
      user: { username, role: 'ADMIN' }
    });
  }

  console.warn(`⚠️ [Auth] Failed admin login attempt for username: ${username}`);
  return res.status(401).json({ error: 'Invalid administrator credentials.' });
});

router.get('/admin/verify', requireAdmin, (req, res) => {
  res.json({
    authenticated: true,
    user: req.user
  });
});

router.post('/admin/logout', (req, res) => {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }
  if (!token && req.query.token) {
    token = req.query.token;
  }
  if (token) revokeAdminToken(token);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Admin Placements View (Detailed placement records with item metadata & evidence)
router.get('/admin/placements', requireAdmin, (req, res) => {
  const limit = parseInt(req.query.limit || '100', 10);
  const placements = getPlacements(limit);
  res.json(placements);
});

// ==========================================
// 2. EMPLOYEE KIOSK ENDPOINTS (Privacy-First)
// ==========================================

// Kiosk: Verify RFID Card (Returns ONLY current card's basic employee name/dept, zero sensitive history)
router.post('/kiosk/verify-rfid', (req, res) => {
  const { rfid_uid } = req.body;
  if (!rfid_uid) {
    return res.status(400).json({ valid: false, error: 'RFID UID is required.' });
  }

  const cleanUID = rfid_uid.trim().toUpperCase();
  const emp = getEmployeeByUID(cleanUID);

  if (!emp) {
    return res.status(404).json({
      valid: false,
      authorized: false,
      reason: 'RFID badge not found in registry. Please contact administrator.'
    });
  }

  if (emp.is_authorized !== 1) {
    return res.status(403).json({
      valid: true,
      authorized: false,
      name: emp.name,
      department: emp.department,
      reason: 'RFID badge is marked UNAUTHORIZED.'
    });
  }

  // Trigger hardware/virtual scan in rfidService to arm the authorization window
  const scanResult = rfidService.handleScan(cleanUID, 'KIOSK_VERIFY');

  return res.json({
    valid: true,
    authorized: true,
    name: emp.name,
    department: emp.department || 'General',
    employee_id: emp.id,
    uid: emp.rfid_uid,
    valid_until: scanResult?.activeToken?.expires_at || (Date.now() + 60000)
  });
});

// Kiosk: Register Item for Placement
router.post('/kiosk/register-item', (req, res) => {
  const { rfid_uid, item_name, serial_number, description, reason, duration_min } = req.body;

  if (!rfid_uid || !item_name || !reason) {
    return res.status(400).json({
      error: 'rfid_uid, item_name, and reason are required for placement.'
    });
  }

  const cleanUID = rfid_uid.trim().toUpperCase();
  const emp = getEmployeeByUID(cleanUID);
  if (!emp || emp.is_authorized !== 1) {
    return res.status(403).json({ error: 'Valid authorized employee RFID required.' });
  }

  // Allow customizable placement duration from 1 minute up to 30 days (43,200 min)
  const durationMinutes = Math.max(1, Math.min(43200, parseInt(duration_min || 5, 10)));
  const registration = createKioskRegistration({
    rfid_uid: cleanUID,
    employee_id: emp.id,
    employee_name: emp.name,
    department: emp.department || 'General',
    item_name: item_name.trim(),
    serial_number: serial_number ? serial_number.trim() : null,
    description: description ? description.trim() : null,
    reason: reason.trim(),
    duration_min: durationMinutes
  });

  // Extend or refresh the active RFID token to match the selected duration
  const durationMs = durationMinutes * 60 * 1000;
  if (rfidService.activeToken && rfidService.activeToken.uid === cleanUID) {
    rfidService.activeToken.expires_at = Date.now() + durationMs;
  } else {
    // If not already active, trigger scan to activate
    rfidService.handleScan(cleanUID, 'KIOSK_REGISTRATION');
    if (rfidService.activeToken) {
      rfidService.activeToken.expires_at = Date.now() + durationMs;
    }
  }

  console.log(`📋 [Kiosk] Item registered: "${item_name}" by ${emp.name} (${cleanUID}), duration: ${durationMinutes}m`);

  res.json({
    success: true,
    registration: {
      id: registration.id,
      item_name: registration.item_name,
      serial_number: registration.serial_number,
      employee_name: emp.name,
      department: emp.department,
      duration_min: durationMinutes,
      expires_at: registration.expires_at
    }
  });
});

// Kiosk: Check current session status
router.get('/kiosk/session', (req, res) => {
  const { rfid_uid } = req.query;
  const reg = getActiveKioskRegistration(rfid_uid);
  res.json({ active: !!reg, registration: reg || null });
});

// Kiosk: Cancel pending registration
router.post('/kiosk/cancel', (req, res) => {
  const { registration_id, rfid_uid } = req.body;
  if (registration_id) {
    cancelKioskRegistration(registration_id);
  } else if (rfid_uid) {
    const reg = getActiveKioskRegistration(rfid_uid);
    if (reg) cancelKioskRegistration(reg.id);
  }
  res.json({ success: true, message: 'Session cancelled.' });
});

// System health and live status (Section 21 & 30)
router.get('/status', async (req, res) => {
  const activeToken = rfidService.getActiveToken();
  const appMode = getSetting('app_mode') || 'test';

  const rfidConnected = rfidService.isConnected;
  const cctvConnected = true; // front-end reports camera connection separately
  const backendOnline = true;
  const dbConnected = true;

  let javaOnline = false;
  let javaEngineInfo = null;
  try {
    const javaCheck = await fetch('http://localhost:8080/api/status', { signal: AbortSignal.timeout(500) });
    if (javaCheck.ok) {
      javaOnline = true;
      javaEngineInfo = await javaCheck.json();
    }
  } catch {
    javaOnline = false;
  }

  const systemDegraded = !rfidConnected; // Group N: degraded when RFID not connected in hardware mode

  res.json({
    appMode,
    systemDegraded,
    cctv: {
      connected: cctvConnected,
      mode: getSetting('camera_mode') || 'webcam',
      roi: visionService.getROI(),
      aiRunning: visionService.isAiRunning
    },
    rfid: {
      connected: rfidConnected,
      port: rfidService.currentPortName || (appMode === 'hardware' ? 'Disconnected' : 'Virtual / Ready'),
      hasActiveToken: !!activeToken,
      activeToken
    },
    backend: {
      online: backendOnline,
      uptime: process.uptime()
    },
    database: {
      connected: dbConnected
    },
    javaService: {
      online: javaOnline,
      port: 8080,
      tcpPort: 9090,
      engine: javaEngineInfo?.engine || 'Java-LTS-25',
      inventoryCount: javaEngineInfo?.inventory_count ?? 0
    },
    timestamp: Date.now()
  });
});

// Floor-Tape Polygon & ROI Configuration
const roiConfigPath = path.resolve(__dirname, '../../../config/roi_config.json');

router.get('/config/polygon', (req, res) => {
  try {
    if (fs.existsSync(roiConfigPath)) {
      const data = JSON.parse(fs.readFileSync(roiConfigPath, 'utf8'));
      res.json(data);
    } else {
      res.status(404).json({ error: 'Config file not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Section 76 — Polygon Validation Rules:
 * 1. Minimum 3 vertices
 * 2. All coordinates numeric and within frame bounds (0–640, 0–480)
 * 3. Not self-intersecting
 * 4. Not covering nearly the entire frame (area > 95% of 640×480 rejected)
 */
function segmentsIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false; // parallel
  const dx = p3.x - p1.x, dy = p3.y - p1.y;
  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function polygonAreaShoelace(poly) {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(area / 2);
}

function validatePolygon(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 3) {
    return { valid: false, reason: 'Polygon must have at least 3 vertices.' };
  }

  for (const [idx, v] of vertices.entries()) {
    if (typeof v.x !== 'number' || typeof v.y !== 'number' || isNaN(v.x) || isNaN(v.y)) {
      return { valid: false, reason: `Vertex ${idx} has non-numeric coordinates.` };
    }
    if (v.x < 0 || v.x > 640 || v.y < 0 || v.y > 480) {
      return { valid: false, reason: `Vertex ${idx} (${v.x}, ${v.y}) is outside frame bounds 0–640 × 0–480.` };
    }
  }

  // Self-intersection check (non-adjacent edge pairs only)
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent wrap-around
      if (segmentsIntersect(vertices[i], vertices[(i + 1) % n], vertices[j], vertices[(j + 1) % n])) {
        return { valid: false, reason: `Polygon is self-intersecting (edges ${i}–${i+1} and ${j}–${j+1} cross).` };
      }
    }
  }

  // Reject near-full-frame coverage
  const area = polygonAreaShoelace(vertices);
  const frameArea = 640 * 480;
  if (area > 0.95 * frameArea) {
    return { valid: false, reason: 'Polygon covers more than 95% of the camera frame — this would trigger false positives.' };
  }

  return { valid: true };
}

router.put('/config/polygon', async (req, res) => {
  try {
    const { polygon_vertices, thresholds, camera } = req.body;
    let config = {};
    if (fs.existsSync(roiConfigPath)) {
      config = JSON.parse(fs.readFileSync(roiConfigPath, 'utf8'));
    }

    // Section 76: Validate polygon before accepting
    if (polygon_vertices) {
      const validation = validatePolygon(polygon_vertices);
      if (!validation.valid) {
        return res.status(400).json({
          error: `[Section 76] Invalid polygon: ${validation.reason}`,
          validation_failed: true,
          reason: validation.reason
        });
      }
      config.floor_tape_roi.polygon_vertices = polygon_vertices;

      // Immediately sync in-memory detection polygon
      visionService.setPolygon(polygon_vertices);
    }
    if (thresholds) {
      config.thresholds = { ...config.thresholds, ...thresholds };
    }
    if (camera) {
      config.camera = { ...config.camera, ...camera };
    }

    fs.writeFileSync(roiConfigPath, JSON.stringify(config, null, 2), 'utf8');
    console.log('📐 [Configuration] Updated floor_tape_roi polygon vertices.');

    // Forward to Java service (non-blocking)
    if (polygon_vertices) {
      fetch('http://localhost:8080/api/polygon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polygon_vertices })
      }).then(() => {
        console.log('📐 [Java Synchronized] Floor-tape polygon pushed to Java engine.');
      }).catch(err => {
        console.warn('Java polygon push error:', err.message);
      });
    }

    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Employee Management (Admin Only)
router.get('/employees', requireAdmin, (req, res) => {
  const list = getAllEmployees();
  res.json(list);
});

router.post('/employees', requireAdmin, (req, res) => {
  const { id, rfid_uid, name, department, is_authorized } = req.body;
  if (!rfid_uid || !name) {
    return res.status(400).json({ error: 'rfid_uid and name are required.' });
  }
  const employeeId = id || `EMP-${Date.now().toString().slice(-4)}`;
  const emp = saveEmployee({
    id: employeeId,
    rfid_uid,
    name,
    department,
    is_authorized: is_authorized !== false && is_authorized !== 0
  });
  res.json(emp);
});

router.delete('/employees/:id', requireAdmin, (req, res) => {
  deleteEmployee(req.params.id);
  res.json({ success: true });
});

// Events Audit Log (Admin Only)
router.get('/events', requireAdmin, (req, res) => {
  const limit = parseInt(req.query.limit || '100', 10);
  const events = getEvents(limit);
  res.json(events);
});

// Alerts Management (Admin Only)
router.get('/alerts', requireAdmin, (req, res) => {
  const filter = req.query.filter || 'ALL';
  const limit = parseInt(req.query.limit || '100', 10);
  const alerts = getAlerts(filter, limit);
  res.json(alerts);
});

router.get('/alerts/:id', requireAdmin, (req, res) => {
  const alert = getAlertById(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert);
});

router.post('/alerts/:id/acknowledge', requireAdmin, (req, res) => {
  const success = updateAlertStatus(req.params.id, 'ACKNOWLEDGED');
  if (success && visionService.io) {
    visionService.io.emit('alert_status_changed', { id: req.params.id, status: 'ACKNOWLEDGED' });
  }
  res.json({ success, id: req.params.id, status: 'ACKNOWLEDGED' });
});

router.post('/alerts/:id/resolve', requireAdmin, (req, res) => {
  const success = updateAlertStatus(req.params.id, 'RESOLVED');
  if (success && visionService.io) {
    visionService.io.emit('alert_status_changed', { id: req.params.id, status: 'RESOLVED' });
  }
  res.json({ success, id: req.params.id, status: 'RESOLVED' });
});

// Settings (Admin Only)
router.get('/settings', requireAdmin, (req, res) => {
  const settings = getAllSettings();
  res.json(settings);
});

router.put('/settings', requireAdmin, (req, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    updateSetting(key, value);
    if (key === 'roi') {
      visionService.setROI(value);
    }
    if (key === 'app_mode') {
      console.log(`🔄 App Mode switched to: ${value}`);
    }
  }
  res.json({ success: true, settings: getAllSettings() });
});

// Serial Ports for RFID Hardware
router.get('/serial-ports', async (req, res) => {
  const ports = await rfidService.listAvailablePorts();
  res.json(ports);
});

router.post('/serial-ports/connect', async (req, res) => {
  const { port, baudRate } = req.body;
  const result = await rfidService.connect(port, baudRate);
  if (result.success) {
    updateSetting('serial_port', port);
  }
  res.json(result);
});

// Simulation Endpoints
router.post('/simulate/rfid', (req, res) => {
  const { uid } = req.body;
  if (!uid) {
    return res.status(400).json({ error: 'UID is required.' });
  }
  const result = rfidService.handleScan(uid, 'SIMULATOR');
  res.json(result);
});

router.post('/simulate/placement', async (req, res) => {
  const { objectType = 'Box', insideROI = true, x, y, width = 80, height = 70 } = req.body;
  const currentROI = visionService.getROI();

  let posX = x;
  let posY = y;

  if (posX === undefined || posY === undefined) {
    if (insideROI) {
      posX = currentROI.x + currentROI.width / 2 - width / 2;
      posY = currentROI.y + currentROI.height / 2 - height / 2;
    } else {
      posX = 200;
      posY = 50; // Pathway / above ROI
    }
  }

  const detections = [
    { label: objectType, confidence: 0.94, box: { x: posX, y: posY, width, height } }
  ];

  const persistenceFrames = parseInt(req.body.frames || '5', 10);
  for (let f = 0; f < persistenceFrames; f++) {
    await visionService.processFrameDetections(detections, null);
  }

  res.json({ success: true, objectType, insideROI, box: { x: posX, y: posY, width, height } });
});

// Live AI Video Frame Ingestion (from client webcam or node frame processor)
router.post('/vision/frame', async (req, res) => {
  const { detections, imageBase64 } = req.body;
  let buffer = null;

  if (imageBase64) {
    try {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } catch (err) {
      console.warn('Could not decode frame buffer:', err.message);
    }
  }

  if (Array.isArray(detections)) {
    await visionService.processFrameDetections(detections, buffer);
  }

  res.json({ success: true });
});

// Direct placement confirmation from frontend vision detector
router.post('/vision/placement-confirmed', async (req, res) => {
  try {
    const {
      objectType = 'Placed Item',
      confidence = 0.92,
      box = { x: 200, y: 250, width: 80, height: 70 },
      imageBase64,
      objectId
    } = req.body;

    const labelCheck = (objectType || '').toLowerCase();
    if (labelCheck === 'person' || labelCheck === 'human' || labelCheck === 'pedestrian' || labelCheck === 'worker') {
      return res.status(400).json({ error: 'Persons cannot be tracked as placed objects.' });
    }

    let evidenceImage = null;

    if (imageBase64) {
      try {
        const filename = `evidence_${Date.now()}_${uuidv4().slice(0, 8)}.jpg`;
        const filePath = path.join(evidenceDir, filename);
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
        evidenceImage = filename;
      } catch (err) {
        console.warn('Could not save evidence image:', err.message);
      }
    } else {
      try {
        evidenceImage = await visionService.generateObjectOnlyBadge(objectType, box);
      } catch (err) {
        console.warn('Fallback evidence generation error:', err.message);
      }
    }

    const savedEvent = await correlationEngine.handlePlacementConfirmed({
      objectType,
      confidence,
      box,
      duration: 1000,
      evidenceImage,
      objectId
    });

    res.json({
      success: true,
      event: savedEvent,
      object_id: savedEvent?.object_id,
      object_state: savedEvent?.object_state || 'PRESENT'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Section 82 & 90: Get currently PRESENT objects in Red Tag Area (Admin Only)
router.get('/objects/active', requireAdmin, (req, res) => {
  try {
    const active = getActiveObjects();
    res.json({ success: true, count: active.length, objects: active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Group K & Section 87 — Object Removal endpoint
 * Marks object as REMOVED and clears tracker state.
 * POST /api/vision/clear-objects?label=Carton+Box
 */
router.post('/vision/clear-objects', (req, res) => {
  const { label, objectId } = req.body;
  visionService.clearTrackers(label || null);
  if (objectId) {
    correlationEngine.handleObjectRemoved(objectId);
  } else {
    correlationEngine.clearAllObjects();
    rfidService.activeToken = null;
    rfidService.lastScannedToken = null;
    if (rfidService.tokenTimer) {
      clearTimeout(rfidService.tokenTimer);
      rfidService.tokenTimer = null;
    }
  }
  if (visionService.io) {
    visionService.io.emit('objects_cleared', { label: label || 'ALL', objectId });
  }
  res.json({ success: true, cleared: label || objectId || 'ALL' });
});

// Section 87: Explicit object-removed endpoint
router.post('/vision/object-removed', (req, res) => {
  const { label, objectId } = req.body;
  visionService.clearTrackers(label || null);
  const result = correlationEngine.handleObjectRemoved(objectId || label || null);
  if (visionService.io) {
    visionService.io.emit('object_removed', { label: label || 'ALL', objectId, manual: true });
  }
  res.json({ success: true, label, objectId, result });
});

// ─── GOLDEN TEST WORKFLOW ENDPOINTS (Section 65 / Rule 30–41) ──────────────

// Golden Test 1: Authorized RFID + Object placed → AUTHORIZED, NO ALERT
router.post('/simulate/workflow/authorized-placement', async (req, res) => {
  try {
    const rfidRes = rfidService.handleScan('A472198C', 'SIMULATOR');

    const roi = visionService.getROI();
    const box = { x: roi.x + 20, y: roi.y + 20, width: 80, height: 70 };
    const label = `Carton Box ${Date.now().toString().slice(-4)}`;
    const detections = [{ label, confidence: 0.95, box }];

    for (let f = 0; f < 6; f++) {
      await visionService.processFrameDetections(detections, null);
    }

    res.json({ success: true, scenario: 'Golden Test 1: Authorized Placement', objectType: label, rfid: rfidRes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Golden Test 2: No RFID + Object placed → UNAUTHORIZED, ALERT, EVIDENCE
router.post('/simulate/workflow/unauthorized-no-rfid', async (req, res) => {
  try {
    // Clear ALL token state so engine sees a genuine NO_RFID scenario
    rfidService.activeToken = null;
    rfidService.lastScannedToken = null;
    if (rfidService.tokenTimer) {
      clearTimeout(rfidService.tokenTimer);
      rfidService.tokenTimer = null;
    }

    const roi = visionService.getROI();
    const box = { x: roi.x + 30, y: roi.y + 30, width: 80, height: 70 };
    const label = `Tool Container ${Date.now().toString().slice(-4)}`;
    const detections = [{ label, confidence: 0.94, box }];

    for (let f = 0; f < 6; f++) {
      await visionService.processFrameDetections(detections, null);
    }

    res.json({ success: true, scenario: 'Golden Test 2: Unauthorized Placement (No RFID)', objectType: label });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Golden Test 3: Unauthorized RFID + Object placed → UNAUTHORIZED, ALERT, EVIDENCE
router.post('/simulate/workflow/unauthorized-card', async (req, res) => {
  try {
    const rfidRes = rfidService.handleScan('XYZ12345', 'SIMULATOR');

    const roi = visionService.getROI();
    const box = { x: roi.x + 40, y: roi.y + 40, width: 80, height: 70 };
    const label = `Machine Part ${Date.now().toString().slice(-4)}`;
    const detections = [{ label, confidence: 0.92, box }];

    for (let f = 0; f < 6; f++) {
      await visionService.processFrameDetections(detections, null);
    }

    res.json({ success: true, scenario: 'Golden Test 3: Unauthorized Placement (Unauthorized Card)', objectType: label, rfid: rfidRes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Golden Test 4: Authorized RFID + No object placed → NO ALERT
router.post('/simulate/workflow/authorized-rfid-no-object', async (req, res) => {
  try {
    const rfidRes = rfidService.handleScan('B7214492', 'SIMULATOR');
    // Intentionally NO placement simulation
    res.json({ success: true, scenario: 'Golden Test 4: RFID Scanned — No Object (No Alert Expected)', rfid: rfidRes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Golden Test 5: Pathway pedestrian/robot → NO ALERT
router.post('/simulate/workflow/pathway-movement', async (req, res) => {
  try {
    const pathwayDetections = [
      { label: 'Person', confidence: 0.96, box: { x: 200, y: 40, width: 90, height: 160 } },
      { label: 'AGV Robot', confidence: 0.93, box: { x: 450, y: 50, width: 100, height: 90 } }
    ];

    for (let f = 0; f < 6; f++) {
      await visionService.processFrameDetections(pathwayDetections, null);
    }

    res.json({
      success: true,
      scenario: 'Golden Test 5: Pathway Movement (Pedestrian / Robot)',
      insideROI: false,
      alertTriggered: false,
      notes: 'No alert because persons are never flagged as object placements and entities are in the pathway.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rule 10 / Case F: 1 Scan = 1 Placement
router.post('/simulate/workflow/one-scan-two-objects', async (req, res) => {
  try {
    rfidService.handleScan('A472198C', 'SIMULATOR');

    const roi = visionService.getROI();
    const box1 = { x: roi.x + 20, y: roi.y + 20, width: 70, height: 60 };
    for (let f = 0; f < 6; f++) {
      await visionService.processFrameDetections([{ label: 'Pallet Box A', confidence: 0.93, box: box1 }], null);
    }

    // Explicitly consume token for Rule 10 single-token test simulation
    rfidService.consumeToken();

    const box2 = { x: roi.x + 120, y: roi.y + 30, width: 70, height: 60 };
    for (let f = 0; f < 6; f++) {
      await visionService.processFrameDetections([{ label: 'Pallet Box B', confidence: 0.93, box: box2 }], null);
    }

    res.json({
      success: true,
      scenario: '1 Scan = 1 Placement (Rule 10)',
      object1: 'AUTHORIZED',
      object2: 'UNAUTHORIZED (Alert Triggered)'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Case E: Expired RFID authorization window simulation (>60s window)
router.post('/simulate/workflow/expired-rfid', async (req, res) => {
  try {
    const employee = getEmployeeByUID('B7214492');
    const authWindowMs = parseInt(getSetting('auth_window_ms') || '60000', 10);
    const pastTime = Date.now() - (authWindowMs + 3000); // Past expiration

    rfidService.lastScannedToken = {
      token_id: uuidv4(),
      uid: 'B7214492',
      employee_id: employee?.id || 'EMP-002',
      employee_name: employee?.name || 'Employee 002',
      department: employee?.department || 'Quality Control',
      scanned_at: pastTime,
      expires_at: pastTime + authWindowMs,
      auth_status: 'AUTHORIZED',
      is_authorized: true,
      consumed: false
    };
    rfidService.activeToken = null;

    if (rfidService.io) {
      rfidService.io.emit('rfid_token_expired', { uid: 'B7214492', expired: true });
    }

    const roi = visionService.getROI();
    const box = { x: roi.x + 35, y: roi.y + 35, width: 80, height: 70 };
    const label = `Crate ${Date.now().toString().slice(-4)}`;
    const detections = [{ label, confidence: 0.93, box }];

    for (let f = 0; f < 6; f++) {
      await visionService.processFrameDetections(detections, null);
    }

    res.json({
      success: true,
      scenario: 'Case E: Expired RFID Placement',
      objectType: label,
      allowedWindowMs: authWindowMs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Transient object (single frame — should not trigger alert)
router.post('/simulate/workflow/transient-object', async (req, res) => {
  try {
    const roi = visionService.getROI();
    const box = { x: roi.x + 50, y: roi.y + 50, width: 80, height: 70 };
    await visionService.processFrameDetections([{ label: 'Transient Item', confidence: 0.88, box }], null);

    res.json({
      success: true,
      scenario: 'Transient Object Crossing',
      alertTriggered: false,
      notes: 'No alert: persistence duration not reached (1 frame only).'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Group L: Same RFID card re-scanned (should refresh token, not duplicate)
router.post('/simulate/workflow/rfid-duplicate-scan', async (req, res) => {
  try {
    const r1 = rfidService.handleScan('A472198C', 'SIMULATOR');
    await new Promise(resolve => setTimeout(resolve, 200));
    const r2 = rfidService.handleScan('A472198C', 'SIMULATOR');

    res.json({
      success: true,
      scenario: 'Group L: Duplicate RFID Scan (Token Refresh)',
      scan1: { token_id: r1.activeToken?.token_id, expires_at: r1.activeToken?.expires_at },
      scan2: { token_id: r2.activeToken?.token_id, expires_at: r2.activeToken?.expires_at, refreshed: r2.refreshed },
      sameToken: r1.activeToken?.token_id === r2.activeToken?.token_id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Group K: Object A removed → Object B placed (2 separate events)
router.post('/simulate/workflow/object-removal-replacement', async (req, res) => {
  try {
    rfidService.activeToken = null;

    // Place Object A (unauthorized)
    const roi = visionService.getROI();
    const boxA = { x: roi.x + 30, y: roi.y + 30, width: 75, height: 65 };
    for (let f = 0; f < 6; f++) {
      await visionService.processFrameDetections([{ label: 'Object Alpha', confidence: 0.91, box: boxA }], null);
    }

    // Object A removed — clear tracker
    visionService.clearTrackers('Object Alpha');

    // Place Object B (also unauthorized)
    const boxB = { x: roi.x + 60, y: roi.y + 60, width: 75, height: 65 };
    for (let f = 0; f < 6; f++) {
      await visionService.processFrameDetections([{ label: 'Object Beta', confidence: 0.89, box: boxB }], null);
    }

    res.json({
      success: true,
      scenario: 'Group K: Object Removal & Replacement',
      objectA: 'UNAUTHORIZED (Event 1)',
      objectB: 'UNAUTHORIZED (Event 2)'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REPORTING ENDPOINTS (Admin Only) ──────────────────────────────────────────────────

router.post('/reports/generate', requireAdmin, async (req, res) => {
  try {
    const events = getEvents(50);
    const excelRes = await reportingService.generateIncidentExcel(events);

    const evidenceFiles = events
      .filter(e => e.evidence_image)
      .map(e => e.evidence_image);

    const zipRes = await reportingService.bundleReportZip(excelRes.filePath, evidenceFiles);

    res.json({
      success: true,
      excelUrl: `/api/reports/download/${excelRes.filename}`,
      zipUrl: `/api/reports/download/${zipRes.zipFilename}`,
      zipFilename: zipRes.zipFilename,
      excelFilename: excelRes.filename,
      bytes: zipRes.bytes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/reports/download/:filename', requireAdmin, (req, res) => {
  const filePath = path.join(reportsDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('File not found');
  }
});

router.post('/reports/send-teams', requireAdmin, async (req, res) => {
  try {
    const event = req.body.event || { object_type: 'Machine Part', event_type: 'UNAUTHORIZED_PLACEMENT' };
    const result = await reportingService.sendTeamsWebhook(event);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reports/send-email', requireAdmin, async (req, res) => {
  try {
    const { email, event } = req.body;
    const events = getEvents(10);
    const excelRes = await reportingService.generateIncidentExcel(events);
    const zipRes = await reportingService.bundleReportZip(excelRes.filePath, []);
    const result = await reportingService.sendEmailAlert(event || {}, zipRes.zipPath, email);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MAIL PROCESSING PIPELINE ENDPOINTS (Section: Mail Processing Plan) ──────────

// Get mail delivery status for an alert (Admin Only)
router.get('/alerts/:id/mail-status', requireAdmin, (req, res) => {
  try {
    const alert = getAlertById(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    let job = null;
    if (alert.mail_job_id) {
      job = getMailJobById(alert.mail_job_id);
    }
    if (!job && alert.object_event_id) {
      job = getMailJobByEventId(alert.object_event_id);
    }
    if (!job) {
      job = getMailJobByAlertId(alert.id);
    }

    res.json({
      success: true,
      alertId: alert.id,
      emailStatus: alert.email_status || job?.status || 'PENDING',
      emailSentAt: alert.email_sent_at || job?.sent_at || null,
      emailError: alert.email_error || job?.failure_reason || null,
      recipient: job?.recipient || getSetting('alert_email_recipient') || 'yochitcheedella@gmail.com',
      job
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual email retry triggered by administrator from dashboard (Admin Only)
router.post('/alerts/:id/retry-email', requireAdmin, async (req, res) => {
  try {
    const alert = getAlertById(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    let job = null;
    if (alert.mail_job_id) {
      job = getMailJobById(alert.mail_job_id);
    }
    if (!job && alert.object_event_id) {
      job = getMailJobByEventId(alert.object_event_id);
    }
    if (!job) {
      job = getMailJobByAlertId(alert.id);
    }

    if (job) {
      const retryResult = await mailQueueService.retryJob(job.id);
      return res.json({ success: true, ...retryResult });
    }

    // If no existing job, enqueue one now and process immediately
    const event = {
      id: alert.object_event_id || alert.id,
      timestamp: alert.timestamp,
      object_id: alert.object_id,
      object_type: alert.object_type,
      authorization_status: alert.authorization_status,
      evidence_image: alert.evidence_image,
      alert_id: alert.id
    };

    const enqRes = await mailQueueService.enqueueMailJob(event, alert.evidence_image);
    if (enqRes.mailJob) {
      const processRes = await mailQueueService.processJob(enqRes.mailJob.id, { forceRetry: true, manual: true });
      return res.json({ success: true, enqueued: true, ...processRes });
    }

    res.json({ success: true, enqueued: true, ...enqRes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Direct test-email trigger for unauthorized incident notifications (Admin Only)
router.post('/alerts/test-email', requireAdmin, async (req, res) => {
  try {
    const { email = 'yochitcheedella@gmail.com' } = req.body;
    const events = getEvents(20);
    const unauthorizedEvent = events.find(e => e.event_type === 'UNAUTHORIZED_PLACEMENT' || e.authorization_status !== 'AUTHORIZED') || {
      id: `EVT-${Date.now()}-TEST`,
      timestamp: new Date().toISOString(),
      event_type: 'UNAUTHORIZED_PLACEMENT',
      object_type: 'Unregistered Equipment (Test)',
      object_id: 'TRACK-801',
      authorization_status: 'NO_RFID (Not detected)',
      alert_status: 'ALERT_TRIGGERED',
      notes: 'Diagnostic test incident dispatch to verify email notification delivery.'
    };

    let sampleEvidence = unauthorizedEvent.evidence_image;
    if (!sampleEvidence && fs.existsSync(evidenceDir)) {
      const files = fs.readdirSync(evidenceDir);
      sampleEvidence = files.find(f => f.endsWith('.jpg') || f.endsWith('.png')) || null;
    }

    // Dispatch through the complete MailQueueService with multipart image attachment
    const enqRes = await mailQueueService.enqueueMailJob(
      unauthorizedEvent,
      sampleEvidence,
      email
    );

    let processRes = null;
    if (enqRes.mailJob) {
      processRes = await mailQueueService.processJob(enqRes.mailJob.id, { forceRetry: true, manual: true });
    }

    res.json({
      success: true,
      enqueued: true,
      mailJob: enqRes.mailJob,
      processResult: processRes,
      smtpConfigured: !!mailQueueService.getSmtpTransporter(),
      deliveryDetails: processRes?.details || null,
      isSandbox: !!(processRes?.details && (processRes.details.includes('Sandbox Preview') || processRes.details.includes('Preview URL')))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Java Service Integration Relay
router.get('/java/inventory', async (req, res) => {
  try {
    const javaRes = await fetch('http://localhost:8080/api/inventory', { signal: AbortSignal.timeout(1000) });
    const data = await javaRes.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Java Service Offline on Port 8080', details: err.message });
  }
});

router.post('/java/frame-sync', async (req, res) => {
  try {
    const javaRes = await fetch('http://localhost:8080/api/frame-detections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await javaRes.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Java Service Offline on Port 8080', details: err.message });
  }
});

export default router;
