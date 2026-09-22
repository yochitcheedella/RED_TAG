import { rfidService } from './rfidService.js';
import { logEvent, getSetting, registerObject, updateObjectState, getActiveObjects, clearAllActiveObjects } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const evidenceDir = path.resolve(__dirname, '../../uploads/evidence');
const authorizedEvidenceDir = path.resolve(evidenceDir, 'authorized');
const unauthorizedEvidenceDir = path.resolve(evidenceDir, 'unauthorized');

if (!fs.existsSync(authorizedEvidenceDir)) fs.mkdirSync(authorizedEvidenceDir, { recursive: true });
if (!fs.existsSync(unauthorizedEvidenceDir)) fs.mkdirSync(unauthorizedEvidenceDir, { recursive: true });

class CorrelationEngine {
  constructor() {
    this.io = null;
    // Section 80 & 82: In-memory registry of active tracked objects in the Red Tag Area
    // key -> { objectId, label, box, state: 'PRESENT' | 'REMOVED', isAuthorized, authStatus, employeeId, employeeName, rfidUID, evidenceImage, firstSeen, lastSeen }
    this.registeredObjects = new Map();
  }

  init(io) {
    this.io = io;
  }

  /**
   * Section 89: Find an existing object that is already tracked in the Red Tag Area
   * Matches by explicit objectId, trackerKey, spatial IoU (>= 0.15), or spatial center proximity (< 100px)
   */
  findExistingObject(placementData) {
    const box = placementData.box;
    const candCenterX = box ? (box.x + (box.width || 0) / 2) : null;
    const candCenterY = box ? (box.y + (box.height || 0) / 2) : null;

    for (const [id, obj] of this.registeredObjects.entries()) {
      if (obj.state !== 'PRESENT') continue;

      // 1. Explicit ID match
      if (placementData.objectId && (obj.objectId === placementData.objectId || id === placementData.objectId)) {
        return obj;
      }

      // If both have different explicit IDs specified (e.g. TRACK-008B vs TRACK-009B), they are separate objects!
      if (placementData.objectId && obj.objectId && placementData.objectId !== obj.objectId) {
        continue;
      }

      // 2. Spatial Overlap or Proximity matching for objects without distinct IDs or slight coordinate shift
      if (box && obj.box && candCenterX !== null && candCenterY !== null) {
        const xA = Math.max(box.x, obj.box.x);
        const yA = Math.max(box.y, obj.box.y);
        const xB = Math.min(box.x + (box.width || 0), obj.box.x + (obj.box.width || 0));
        const yB = Math.min(box.y + (box.height || 0), obj.box.y + (obj.box.height || 0));
        const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        const boxAArea = (box.width || 0) * (box.height || 0);
        const boxBArea = (obj.box.width || 0) * (obj.box.height || 0);
        const unionArea = boxAArea + boxBArea - interArea;
        const iou = unionArea > 0 ? interArea / unionArea : 0;

        const objCenterX = obj.box.x + (obj.box.width || 0) / 2;
        const objCenterY = obj.box.y + (obj.box.height || 0) / 2;
        const dist = Math.hypot(candCenterX - objCenterX, candCenterY - objCenterY);

        if (iou >= 0.35 || dist < 45) {
          return obj;
        }
      }

      // 3. If same specific label was placed recently and remains PRESENT nearby
      if (placementData.objectType && obj.objectType === placementData.objectType && (Date.now() - obj.lastSeen < 10000)) {
        return obj;
      }
    }

    return null;
  }

  /**
   * Section 87 & 88: Handle removal of an object from the Red Tag Area
   */
  handleObjectRemoved(identifier) {
    let target = null;
    if (identifier) {
      for (const [id, obj] of this.registeredObjects.entries()) {
        if (obj.objectId === identifier || obj.objectType === identifier || id === identifier) {
          target = obj;
          break;
        }
      }
    }

    if (target) {
      target.state = 'REMOVED';
      target.lastSeen = Date.now();
      updateObjectState(target.objectId, 'REMOVED');
      console.log(`📦 [CorrelationEngine] Object ${target.objectId} (${target.objectType}) marked as REMOVED (No alert)`);

      if (this.io) {
        this.io.emit('object_removed', {
          objectId: target.objectId,
          objectType: target.objectType,
          state: 'REMOVED'
        });
      }

      return { success: true, objectId: target.objectId, state: 'REMOVED' };
    }

    return { success: false, reason: 'Object not found' };
  }

  /**
   * Clear all active tracked objects (e.g. during test resets or full area clearing)
   */
  clearAllObjects() {
    for (const [id, obj] of this.registeredObjects.entries()) {
      obj.state = 'REMOVED';
      updateObjectState(obj.objectId, 'REMOVED');
    }
    this.registeredObjects.clear();
    clearAllActiveObjects();
    console.log('🧹 [CorrelationEngine] All registered objects cleared.');
  }

  /**
   * Handle placement confirmed by CCTV vision service.
   * Sections 80–98 strictly implemented.
   *
   * placementData: { objectType, confidence, box, duration, evidenceImage, objectId }
   */
  async handlePlacementConfirmed(placementData) {
    const now = Date.now();
    const authWindowMs = parseInt(getSetting('auth_window_ms') || process.env.RFID_AUTHORIZATION_WINDOW_MS || '60000', 10);

    console.log('\n========================================');
    console.log(`🔍 [CORRELATION ENGINE] Evaluating Object Placement: ${placementData.objectType}`);

    // Section 84, 85, 89: CHECK IF THIS OBJECT IS ALREADY REGISTERED AS PRESENT
    const existing = this.findExistingObject(placementData);
    if (existing && existing.state === 'PRESENT') {
      existing.lastSeen = now;
      if (existing.isAuthorized) {
        console.log(`🛡️ [Section 84] Object ${existing.objectId} (${existing.objectType}) is ALREADY AUTHORIZED and PRESENT.`);
        console.log(`🛡️ [Section 85] DO NOT create duplicate placement event. DO NOT generate alert.`);
        console.log('========================================\n');
        return {
          success: true,
          alreadyAuthorized: true,
          objectId: existing.objectId,
          object_id: existing.objectId,
          event_type: 'AUTHORIZED_PLACEMENT',
          authorization_status: 'AUTHORIZED',
          alert_status: 'NO_ALERT',
          object_state: 'PRESENT',
          state: 'PRESENT',
          objectType: existing.objectType,
          evidence_image: existing.evidenceImage
        };
      } else {
        // Group J: Duplicate Alert Prevention for already-alerted stationary object
        console.log(`ℹ️ [Group J] Object ${existing.objectId} is already present and alerted. Suppressing duplicate event and alert.`);
        console.log('========================================\n');
        return {
          success: true,
          alreadyRecorded: true,
          objectId: existing.objectId,
          object_id: existing.objectId,
          event_type: 'UNAUTHORIZED_PLACEMENT',
          authorization_status: existing.authStatus,
          alert_status: 'NO_ALERT',
          object_state: 'PRESENT',
          state: 'PRESENT',
          objectType: existing.objectType,
          evidence_image: existing.evidenceImage
        };
      }
    }

    // NEW OBJECT BEING PLACED IN THE RED TAG AREA
    let isAuthorized = false;
    let authStatus = 'NO_RFID';
    let rfidUID = null;
    let employeeId = null;
    let employeeName = null;
    let timeDifference = null;
    let notes = '';

    const activeToken = rfidService.getActiveToken();

    if (activeToken) {
      rfidUID = activeToken.uid;
      employeeId = activeToken.employee_id || null;
      employeeName = activeToken.employee_name;
      timeDifference = ((now - activeToken.scanned_at) / 1000).toFixed(1);

      if (activeToken.is_authorized && now <= activeToken.expires_at) {
        // CASE 1: AUTHORIZED PLACEMENT (Section 81 & 93)
        isAuthorized = true;
        authStatus = 'AUTHORIZED';
        notes = `Authorized placement by ${employeeName} (${rfidUID}). Correlated in ${timeDifference}s (within ${authWindowMs / 1000}s window).`;

        // Rule 10: ONE RFID SCAN = ONE PLACEMENT — consume immediately
        rfidService.consumeToken();
      } else if (!activeToken.is_authorized) {
        // CASE 3: UNAUTHORIZED RFID CARD
        isAuthorized = false;
        authStatus = 'UNAUTHORIZED_RFID';
        notes = `Unauthorized placement: RFID UID ${rfidUID} (${employeeName}) is marked UNAUTHORIZED in the database.`;

        // Rule 10: 1 Scan = 1 Placement — consume immediately so unauthorized tokens do not leak
        rfidService.consumeToken();
      }
    } else {
      // No active token — check if this is an immediate back-to-back duplicate placement (Rule 10) or expired scan (Case E)
      const lastToken = rfidService.getLastScannedToken();
      if (lastToken && lastToken.consumed && (now - lastToken.scanned_at < 3000)) {
        // CASE F: 1 Scan = 1 Placement — already consumed immediately prior (within 3 seconds)
        rfidUID = lastToken.uid;
        employeeId = lastToken.employee_id || null;
        employeeName = lastToken.employee_name;
        timeDifference = ((now - lastToken.scanned_at) / 1000).toFixed(1);
        authStatus = 'TOKEN_ALREADY_CONSUMED';
        notes = `Unauthorized placement: RFID badge for ${employeeName} (${rfidUID}) was already consumed by a prior placement (Rule 10 — 1 Scan = 1 Placement).`;
      } else if (lastToken && !lastToken.consumed && now > lastToken.expires_at && (now - lastToken.expires_at < 3000)) {
        // CASE E: EXPIRED RFID SCAN (within 3 seconds of expiration)
        rfidUID = lastToken.uid;
        employeeId = lastToken.employee_id || null;
        employeeName = lastToken.employee_name;
        timeDifference = ((now - lastToken.scanned_at) / 1000).toFixed(1);
        const expiredAgo = ((now - lastToken.expires_at) / 1000).toFixed(1);
        authStatus = 'EXPIRED_RFID';
        notes = `Unauthorized placement: RFID authorization for ${employeeName} (${rfidUID}) expired ${expiredAgo}s ago (allowed window: ${authWindowMs / 1000}s).`;
      } else {
        // CASE 2: NO RFID SCANNED AT ALL
        rfidUID = null;
        employeeId = null;
        employeeName = null;
        timeDifference = null;
        authStatus = 'NO_RFID';
        notes = `Unauthorized placement: Object placed in Red Tag ROI with NO RFID badge scanned.`;
      }
    }

    // Section 82 & Section 4: Generate unique internal Object Tracking ID
    let objectId = placementData.objectId;
    if (!objectId) {
      objectId = `TRACK-${Date.now().toString().slice(-4)}`;
    }
    const eventId = `EVT-${Date.now()}-${uuidv4().slice(0, 4).toUpperCase()}`;

    // Section 81, 93, 94 & Section 30: Universal Image Capture for BOTH Authorized and Unauthorized placements
    let finalEvidenceFilename = placementData.evidenceImage || null;

    if (finalEvidenceFilename) {
      try {
        // Categorize file into authorized/ or unauthorized/ subfolder
        const targetSubfolder = isAuthorized ? 'authorized' : 'unauthorized';
        const baseName = path.basename(finalEvidenceFilename);
        const srcFile = path.resolve(evidenceDir, baseName);
        const subfolderFile = path.resolve(evidenceDir, targetSubfolder, baseName);

        if (fs.existsSync(srcFile) && !fs.existsSync(subfolderFile)) {
          fs.copyFileSync(srcFile, subfolderFile);
        }
      } catch (err) {
        console.warn('Evidence subfolder indexing note:', err.message);
      }
    } else {
      // If evidence missing on unauthorized event
      if (!isAuthorized) {
        console.warn('⚠️ [CorrelationEngine] Unauthorized event without evidence image — recording flag.');
        notes += ' [EVIDENCE_MISSING]';
      }
    }

    const eventType = isAuthorized ? 'AUTHORIZED_PLACEMENT' : 'UNAUTHORIZED_PLACEMENT';
    const alertStatus = isAuthorized ? 'NO_ALERT' : 'ALERT_TRIGGERED';

    // Section 82: Register Authorized / Tracked Object Record in SQLite and in-memory registry
    const objectRecord = {
      id: objectId,
      objectId,
      event_id: eventId,
      object_type: placementData.objectType,
      objectType: placementData.objectType,
      rfid_uid: rfidUID,
      employee_id: employeeId,
      employee_name: employeeName,
      authorization_status: authStatus,
      authStatus,
      isAuthorized,
      state: 'PRESENT',
      bounding_box: placementData.box,
      box: placementData.box,
      evidence_image: finalEvidenceFilename,
      evidenceImage: finalEvidenceFilename,
      camera_id: 'CAM-01-REDTAG',
      firstSeen: now,
      lastSeen: now
    };

    registerObject(objectRecord);
    this.registeredObjects.set(objectId, objectRecord);

    // Section 95 & Section 31: Persist final Event Model
    const savedEvent = logEvent({
      id: eventId,
      timestamp: new Date().toISOString(),
      event_type: eventType,
      rfid_uid: rfidUID,
      employee_id: employeeId,
      employee_name: employeeName,
      object_type: placementData.objectType,
      object_id: objectId,
      object_state: 'PRESENT',
      authorization_status: authStatus,
      alert_status: alertStatus,
      confidence: placementData.confidence || 0.94,
      time_difference: timeDifference !== null ? parseFloat(timeDifference) : null,
      evidence_image: finalEvidenceFilename,
      camera_id: 'CAM-01-REDTAG',
      notes
    });

    // Section 37 Tagged Logging Format
    console.log(`[DETECTION] New object detected: ${placementData.objectType}`);
    console.log(`[TRACKING] ${objectId} placement confirmed`);
    console.log(`[EVIDENCE] Best frame selected for ${objectId}`);
    console.log(`[EVIDENCE] Object crop saved: ${finalEvidenceFilename || 'N/A'}`);
    if (isAuthorized) {
      console.log(`[RFID] Valid authorization found: ${employeeName} (${rfidUID})`);
      console.log(`[AUTHORIZATION] ${objectId} = AUTHORIZED`);
      console.log(`[EVENT] Placement event created: ${eventId}`);
      console.log(`[TRACKING] ${objectId} = PRESENT`);
    } else {
      console.log(`[AUTHORIZATION] No valid RFID authorization (${authStatus})`);
      console.log(`[AUTHORIZATION] ${objectId} = UNAUTHORIZED`);
      console.log(`[EVENT] Placement event created: ${eventId}`);
      console.log(`[ALERT] Unauthorized placement alert created for ${objectId}`);
      console.log(`[TRACKING] ${objectId} = PRESENT`);
    }
    console.log('========================================\n');

    // Broadcast to React Dashboard via Socket.IO
    if (this.io) {
      if (isAuthorized) {
        this.io.emit('placement_authorized', {
          eventId,
          objectId,
          event: savedEvent,
          employee: employeeName,
          rfid: rfidUID,
          object: placementData.objectType,
          object_state: 'PRESENT',
          evidenceImage: finalEvidenceFilename,
          timeDifference,
          notes
        });
      } else {
        this.io.emit('placement_unauthorized_alert', {
          eventId,
          objectId,
          event: savedEvent,
          timestamp: savedEvent.timestamp,
          reason: authStatus,
          rfidStatus: authStatus,
          employeeStatus: employeeName ? `${employeeName} (${authStatus})` : 'NOT SCANNED / UNKNOWN',
          objectType: placementData.objectType,
          confidence: placementData.confidence || 0.94,
          area: 'Red Tag Area (Physical Floor Tape Polygon)',
          rfid: rfidUID,
          employee: employeeName,
          object_state: 'PRESENT',
          evidenceImage: finalEvidenceFilename,
          notes
        });
      }

      this.io.emit('object_registered', objectRecord);
      this.io.emit('new_event_logged', savedEvent);
    }

    return {
      ...savedEvent,
      object_id: objectId,
      object_state: 'PRESENT'
    };
  }
}

export const correlationEngine = new CorrelationEngine();

