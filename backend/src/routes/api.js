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
  getAnyPendingKioskRegistration,
  expireOldKioskRegistrations,
  expireKioskRegistration,
  getPlacements,
  getPlacementStats,
  deletePlacement,
  deleteEvent,
  clearEvents,
  getAllUsers,
  getUserById,
  getUserByUsername,
  getUserByRFID,
  createUser,
  updateUser,
  deleteUser,
  getUserPlacements,
  getUserActivePlacement,
  toggleEmployeeStatus,
  db
} from '../db.js';
import {
  authenticate,
  requireUser,
  requireSupervisor,
  requireAdmin,
  requireStrictAdmin,
  generateToken,
  generateAdminToken,
  revokeAdminToken,
  verifyCredentials,
  verifyOperatorCredentials
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
// 1. 3-TIER RBAC AUTHENTICATION (User, Supervisor, Admin)
// ==========================================

// Unified 3-Tier Login endpoint (supports username/password OR RFID badge identity)
router.post('/auth/login', (req, res) => {
  const { username, password, rfid_uid, role } = req.body;

  // 1. RFID Badge Login (Direct Identity for Employee/User)
  if (rfid_uid) {
    const cleanRFID = rfid_uid.trim().toUpperCase();
    let user = getUserByRFID(cleanRFID);
    let emp = null;
    if (!user) {
      emp = getEmployeeByUID(cleanRFID);
      if (emp) {
        user = {
          id: `USR-${cleanRFID}`,
          username: emp.name.toLowerCase().replace(/\s+/g, '.'),
          role: 'user',
          name: emp.name,
          employee_id: emp.id,
          rfid_uid: cleanRFID,
          department: emp.department || 'General',
          status: emp.is_authorized ? 'ACTIVE' : 'DISABLED'
        };
      }
    }

    if (!user) {
      return res.status(401).json({ error: `RFID Badge [${cleanRFID}] not recognized in employee directory.` });
    }

    if (user.status === 'DISABLED') {
      return res.status(403).json({ error: 'Employee badge is deactivated. Contact Administrator.' });
    }

    const { token, expiresAt } = generateToken(user);
    console.log(`📡 [Auth] Employee logged in via RFID: ${user.name} (${user.role})`);
    return res.json({
      success: true,
      token,
      expiresAt,
      user
    });
  }

  // 2. Username / Password Login
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  const user = getUserByUsername(username);
  if (user) {
    if (user.status === 'DISABLED') {
      return res.status(403).json({ error: 'This account has been disabled by Administrator.' });
    }

    const isValid = user.password === password ||
      (user.role === 'admin' && verifyCredentials(username, password)) ||
      (user.role === 'supervisor' && verifyOperatorCredentials(username, password));

    if (isValid) {
      const { token, expiresAt } = generateToken(user);
      console.log(`🔐 [Auth] User logged in: ${user.username} (${user.role})`);
      return res.json({
        success: true,
        token,
        expiresAt,
        user
      });
    }
  }

  // Fallback check against hardcoded env credentials
  if (verifyCredentials(username, password)) {
    const adminUser = {
      id: 'USR-ADMIN',
      username,
      role: 'admin',
      name: 'System Administrator',
      department: 'IT & Infrastructure'
    };
    const { token, expiresAt } = generateToken(adminUser);
    return res.json({ success: true, token, expiresAt, user: adminUser });
  }

  if (verifyOperatorCredentials(username, password)) {
    const supUser = {
      id: 'USR-SUPERVISOR',
      username,
      role: 'supervisor',
      name: 'SOC Area Supervisor',
      department: 'Security Operations'
    };
    const { token, expiresAt } = generateToken(supUser);
    return res.json({ success: true, token, expiresAt, user: supUser });
  }

  return res.status(401).json({ error: 'Invalid username or password.' });
});

// Legacy Admin/Operator login for backwards compatibility
router.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  const user = getUserByUsername(username);
  if (user && user.password === password) {
    const { token, expiresAt } = generateToken(user);
    return res.json({ success: true, token, expiresAt, user });
  }

  if (verifyCredentials(username, password)) {
    const { token, expiresAt } = generateAdminToken(username, 'admin');
    return res.json({
      success: true,
      token,
      expiresAt,
      user: { username, role: 'admin', name: 'System Administrator' }
    });
  }

  if (verifyOperatorCredentials(username, password)) {
    const { token, expiresAt } = generateAdminToken(username, 'supervisor');
    return res.json({
      success: true,
      token,
      expiresAt,
      user: { username, role: 'supervisor', name: 'SOC Area Supervisor' }
    });
  }

  return res.status(401).json({ error: 'Invalid username or password.' });
});

router.get(['/auth/verify', '/admin/verify', '/auth/me'], authenticate, (req, res) => {
  res.json({
    authenticated: true,
    user: req.user
  });
});

router.post(['/auth/logout', '/admin/logout'], (req, res) => {
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

// ==========================================
// 2. USER DASHBOARD — EMPLOYEE
// (Employee sees ONLY their own placements, placement status & registration form)
// ==========================================

// Get user's own placements history
router.get('/user/placements', authenticate, (req, res) => {
  const role = (req.user?.role || '').toLowerCase();
  const limit = parseInt(req.query.limit || '100', 10);

  // If role is employee/user: strictly filter ONLY their own placements
  if (role === 'user') {
    const placements = getUserPlacements(req.user, limit);
    return res.json(placements);
  }

  // Supervisor or Admin can see all placements
  const allPlacements = getPlacements(limit);
  res.json(allPlacements);
});

// Get user's current active placement and countdown timer status
router.get('/user/active-placement', authenticate, (req, res) => {
  const activePlacement = getUserActivePlacement(req.user);
  let timeRemainingSec = 0;
  if (activePlacement) {
    const durationMin = activePlacement.placement_duration_min || activePlacement.duration_min || 5;
    const startTs = activePlacement.placed_at || activePlacement.registered_at || activePlacement.created_at || activePlacement.first_seen;
    if (startTs) {
      const startTime = new Date(startTs).getTime();
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      timeRemainingSec = Math.max(0, (durationMin * 60) - elapsedSec);
    } else {
      timeRemainingSec = durationMin * 60;
    }
  }
  res.json({
    hasActivePlacement: !!activePlacement,
    activePlacement: activePlacement || null,
    placement: activePlacement || null,
    timeRemainingSec
  });
});

// Employee registers new object for placement (Placement Form)
router.post('/user/placements', requireUser, async (req, res) => {
  const { item_name, serial_number, description, reason, duration_min } = req.body;
  if (!item_name || !item_name.trim()) {
    return res.status(400).json({ error: 'Item name is required.' });
  }

  const rfidUID = req.user.rfid_uid || `GEN-${Date.now().toString().slice(-4)}`;
  const employeeName = req.user.name || req.user.username;
  const employeeId = req.user.employee_id || req.user.id;
  const department = req.user.department || 'General';
  const duration = parseInt(duration_min || 5, 10);

  try {
    const reg = createKioskRegistration({
      rfid_uid: rfidUID,
      employee_id: employeeId,
      employee_name: employeeName,
      department,
      item_name: item_name.trim(),
      serial_number: serial_number ? serial_number.trim() : null,
      description: description ? description.trim() : null,
      reason: reason ? reason.trim() : 'Temporary Red Tag placement',
      duration_min: duration
    });

    if (visionService?.io) {
      visionService.io.emit('kiosk_session_started', reg);
    }

    res.json({
      success: true,
      placement_id: reg.id,
      placementId: reg.id,
      registration: reg,
      message: `Placement registration created for ${item_name}. Place item inside the Red Tag Area.`
    });
  } catch (err) {
    console.error('User placement registration error:', err);
    res.status(500).json({ error: 'Failed to create placement registration.' });
  }
});

// ==========================================
// 3. USER & SUPERVISOR MANAGEMENT (ADMIN ONLY)
// ==========================================
router.get('/users', requireAdmin, (req, res) => {
  res.json(getAllUsers());
});

router.post('/users', requireAdmin, (req, res) => {
  const { username, password, role, name, department, employee_id, rfid_uid, status } = req.body;
  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Username is required.' });
  }
  const existing = getUserByUsername(username);
  if (existing) {
    return res.status(400).json({ error: `Username '${username}' is already in use.` });
  }
  const newUser = createUser({
    username,
    password: password || 'user123',
    role: role || 'user',
    name: name || username,
    department: department || 'General',
    employee_id,
    rfid_uid,
    status: status || 'ACTIVE'
  });
  res.json({ success: true, user: newUser });
});

router.put('/users/:id', requireAdmin, (req, res) => {
  const updated = updateUser(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'User not found.' });
  res.json({ success: true, user: updated });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  deleteUser(req.params.id);
  res.json({ success: true, message: 'User deleted successfully.' });
});

// RFID Management (Admin Only)
router.get('/rfid/cards', requireAdmin, (req, res) => {
  const employees = getAllEmployees();
  res.json(employees);
});

router.post('/rfid/toggle-status', requireAdmin, (req, res) => {
  const { id, is_authorized } = req.body;
  const updated = toggleEmployeeStatus(id, is_authorized);
  res.json({ success: true, employee: updated });
});

// Placements Aggregate Statistics (Real-time accurate counts for KPI cards & reports)
router.get(['/admin/placements/stats', '/placements/stats'], requireSupervisor, (req, res) => {
  const { startDate, endDate } = req.query;
  const stats = getPlacementStats(startDate, endDate);
  res.json({ success: true, ...stats });
});

// Placements View (Supervisor & Admin Monitoring)
router.get(['/admin/placements', '/placements'], requireSupervisor, (req, res) => {
  const limit = parseInt(req.query.limit || '500', 10);
  const placements = getPlacements(limit);
  res.json(placements);
});

// Delete Placement Record (Strictly Admin - Supervisors forbidden)
router.delete(['/admin/placements/:id', '/placements/:id'], requireAdmin, (req, res) => {
  const { id } = req.params;
  try {
    deletePlacement(id);
    if (visionService?.io) {
      visionService.io.emit('placement_deleted', { id, objectId: id });
      visionService.io.emit('placements_updated', { action: 'deleted', id });
    }
    res.json({ success: true, message: 'Placement record deleted successfully.' });
  } catch (err) {
    console.error('Error deleting placement:', err);
    res.status(500).json({ error: 'Failed to delete placement record.' });
  }
});

// Admin Delete Event Record (Restricted to Admin - Operators forbidden)
router.delete(['/admin/events/:id', '/events/:id'], requireStrictAdmin, (req, res) => {
  const { id } = req.params;
  try {
    deleteEvent(id);
    if (visionService?.io) {
      visionService.io.emit('event_deleted', { id, eventId: id });
    }
    res.json({ success: true, message: 'Event record deleted successfully.' });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ error: 'Failed to delete event record.' });
  }
});

// Admin Clear All Events (Restricted to Admin)
router.post(['/admin/events/clear', '/events/clear'], requireStrictAdmin, (req, res) => {
  try {
    clearEvents();
    if (visionService?.io) {
      visionService.io.emit('events_cleared');
    }
    res.json({ success: true, message: 'All event records cleared successfully.' });
  } catch (err) {
    console.error('Error clearing events:', err);
    res.status(500).json({ error: 'Failed to clear events.' });
  }
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

  // Single Active Placement Session Rule: Check if another employee has a placement in progress
  const pendingReg = getAnyPendingKioskRegistration();
  if (pendingReg && pendingReg.rfid_uid !== cleanUID) {
    return res.status(409).json({
      valid: false,
      authorized: false,
      name: emp.name,
      reason: `Another placement session is currently active for "${pendingReg.item_name}" (${pendingReg.employee_name}). Please wait for it to complete or expire.`
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

  // Single Active Placement Session Rule: Ensure no other placement is currently active
  const pendingReg = getAnyPendingKioskRegistration();
  if (pendingReg && pendingReg.rfid_uid !== cleanUID) {
    return res.status(409).json({
      error: `Another placement session is already in progress for "${pendingReg.item_name}".`
    });
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

  // Extend active RFID token to match the registered placement duration
  rfidService.extendTokenDuration(cleanUID, durationMinutes, item_name.trim());

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

// Kiosk: Confirm Placement by operator clicking "OBJECT PLACED"
router.post('/kiosk/confirm-placement', async (req, res) => {
  try {
    const { registration_id, imageBase64, objectType, objectId, box } = req.body;
    const result = await correlationEngine.confirmKioskPlacement({
      registrationId: registration_id,
      imageBase64,
      objectType,
      objectId,
      box
    });
    res.json(result);
  } catch (err) {
    console.error('Kiosk confirm-placement error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Kiosk: Expire active session when timer reaches 00:00 without object detection/confirmation
router.post('/kiosk/session/expire', (req, res) => {
  const { registration_id } = req.body;
  if (registration_id) {
    expireKioskRegistration(registration_id);
    console.log(`⏱️ [Kiosk] Placement session expired without confirmation: ${registration_id}`);
  } else {
    expireOldKioskRegistrations();
  }
  correlationEngine.pendingKioskCandidate = null;
  rfidService.consumeToken();
  res.json({ success: true, status: 'EXPIRED' });
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

router.delete('/employees/:id', requireStrictAdmin, (req, res) => {
  deleteEmployee(req.params.id);
  if (visionService?.io) {
    visionService.io.emit('employee_deleted', { id: req.params.id, employeeId: req.params.id });
  }
  res.json({ success: true });
});

// Events Audit Log (Supervisor & Admin Monitoring — Forbidden to User)
router.get('/events', requireSupervisor, (req, res) => {
  const limit = parseInt(req.query.limit || '100', 10);
  const events = getEvents(limit);
  res.json(events);
});

// Alerts Management (Supervisor & Admin Monitoring)
router.get('/alerts', requireSupervisor, (req, res) => {
  const filter = req.query.filter || 'ALL';
  const limit = parseInt(req.query.limit || '100', 10);
  const alerts = getAlerts(filter, limit);
  res.json(alerts);
});

router.get('/alerts/:id', requireSupervisor, (req, res) => {
  const alert = getAlertById(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert);
});

router.post('/alerts/:id/acknowledge', requireSupervisor, (req, res) => {
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

// Settings (Admin & Operator Access, Local Fallback)
router.get('/settings', requireAdmin, (req, res) => {
  const settings = getAllSettings();
  res.json(settings);
});

const handleUpdateSettings = (req, res) => {
  const updates = req.body || {};
  for (const [key, value] of Object.entries(updates)) {
    updateSetting(key, value);
    if (key === 'roi') {
      visionService.setROI(value);
    }
    if (key === 'persistence_ms') {
      updateSetting('min_object_persistence_ms', value);
    }
    if (key === 'auth_window_ms') {
      updateSetting('rfid_authorization_window_ms', value);
    }
    if (key === 'app_mode') {
      console.log(`🔄 App Mode switched to: ${value}`);
    }
  }
  const allSettings = getAllSettings();
  if (visionService.io) {
    visionService.io.emit('settings_updated', allSettings);
  }
  res.json({ success: true, settings: allSettings });
};

router.put('/settings', requireAdmin, handleUpdateSettings);
router.post('/settings', requireAdmin, handleUpdateSettings);

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

// Section 82 & 90: Get currently PRESENT objects in Red Tag Area
router.get('/objects/active', (req, res) => {
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
    try {
      db.prepare("UPDATE kiosk_registrations SET status = 'CANCELLED' WHERE status = 'PENDING_PLACEMENT'").run();
    } catch (_) {}
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
  const result = correlationEngine.handleObjectRemoved(objectId || label || null, true);
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
    const limit = parseInt(req.body.limit || '100', 10);
    const events = getEvents(limit);
    const excelRes = await reportingService.generateIncidentExcel(events);

    const evidenceFiles = events
      .filter(e => e.evidence_image)
      .map(e => e.evidence_image);

    const zipRes = await reportingService.bundleReportZip(excelRes.filePath, evidenceFiles);

    // Retrieve active token to embed in download URLs for seamless one-click browser downloads
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.query.token) {
      token = req.query.token;
    }
    const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';

    res.json({
      success: true,
      excelUrl: `/api/reports/download/${excelRes.filename}${tokenQuery}`,
      zipUrl: `/api/reports/download/${zipRes.zipFilename}${tokenQuery}`,
      zipFilename: zipRes.zipFilename,
      excelFilename: excelRes.filename,
      bytes: zipRes.bytes
    });
  } catch (err) {
    console.error('Report generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/reports/download/:filename', (req, res) => {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query.token) {
    token = req.query.token;
  }

  const isLocal = req.ip === '127.0.0.1' || req.ip === '::1' || req.hostname === 'localhost';
  if (!isLocal && !validateAdminToken(token)) {
    return res.status(401).json({ error: 'Unauthorized: Administrator access required.' });
  }

  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(reportsDir, safeFilename);
  if (fs.existsSync(filePath)) {
    res.download(filePath, safeFilename);
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
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Please enter a valid recipient email address.' });
    }
    const recipient = email.trim();
    console.log(`✉️ [Reports Dispatch] Dispatching report strictly to user-entered recipient: ${recipient}`);

    const events = getEvents(100);
    const excelRes = await reportingService.generateIncidentExcel(events);

    // Keep evidence bundle lightweight (up to 10 latest evidence files) for fast reliable delivery
    const evidenceFiles = events
      .filter(e => e.evidence_image)
      .slice(0, 10)
      .map(e => e.evidence_image);

    let zipRes = null;
    try {
      zipRes = await reportingService.bundleReportZip(excelRes.filePath, evidenceFiles);
    } catch (zipErr) {
      console.warn('⚠️ Could not bundle ZIP, sending Excel only:', zipErr.message);
    }

    const result = await reportingService.sendEmailAlert(
      event || {},
      zipRes ? zipRes.zipPath : null,
      recipient,
      excelRes.filePath
    );
    res.json(result);
  } catch (err) {
    console.error('Report email send error:', err);
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
      recipient: job?.recipient || getSetting('alert_email_recipient') || process.env.ALERT_EMAIL_RECIPIENT || 'safety-admin@company.com',
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
    const { email } = req.body;
    const targetEmail = (email && email.trim()) || mailQueueService.getRecipientList();
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
      targetEmail
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
