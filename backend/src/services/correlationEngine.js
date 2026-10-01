import { rfidService } from './rfidService.js';
import { reportingService } from './reportingService.js';
import { mailQueueService } from './mailQueueService.js';
import { db, logEvent, getSetting, registerObject, updateObjectState, getActiveObjects, clearAllActiveObjects, getActiveKioskRegistration, completeKioskRegistration, getAnyPendingKioskRegistration, getKioskRegistrationById } from '../db.js';
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
    this.pendingKioskCandidate = null;
    this.loadActiveObjectsFromDb();
  }

  loadActiveObjectsFromDb() {
    try {
      const activeObjs = getActiveObjects();
      for (const obj of activeObjs) {
        let box = null;
        if (obj.bounding_box) {
          try {
            box = typeof obj.bounding_box === 'string' ? JSON.parse(obj.bounding_box) : obj.bounding_box;
          } catch (e) {}
        }
        const isAuth = obj.authorization_status === 'AUTHORIZED';
        const rec = {
          id: obj.id,
          objectId: obj.id,
          event_id: obj.event_id,
          object_type: obj.object_type,
          objectType: obj.object_type,
          item_name: obj.item_name,
          serial_number: obj.serial_number,
          description: obj.description,
          placement_reason: obj.placement_reason,
          placement_duration_min: obj.placement_duration_min,
          department: obj.department,
          registered_at: obj.registered_at,
          rfid_uid: obj.rfid_uid,
          employee_id: obj.employee_id,
          employee_name: obj.employee_name,
          authorization_status: obj.authorization_status,
          authStatus: obj.authorization_status,
          isAuthorized: isAuth,
          state: obj.state || 'PRESENT',
          bounding_box: box,
          box: box,
          evidence_image: obj.evidence_image,
          evidenceImage: obj.evidence_image,
          camera_id: obj.camera_id || 'CAM-01-REDTAG',
          firstSeen: obj.first_seen ? new Date(obj.first_seen).getTime() : Date.now(),
          lastSeen: obj.last_seen ? new Date(obj.last_seen).getTime() : Date.now()
        };
        this.registeredObjects.set(obj.id, rec);
      }
      if (activeObjs.length > 0) {
        console.log(`📦 [CorrelationEngine] Loaded ${activeObjs.length} active PRESENT objects from database.`);
      }
    } catch (err) {
      console.warn('Could not load active objects from DB:', err.message);
    }
  }

  init(io) {
    this.io = io;
    mailQueueService.setIO(io);
    this.loadActiveObjectsFromDb();
  }

  /**
   * Section 89: Find an existing object that is already tracked in the Red Tag Area
   * Matches by explicit objectId, trackerKey, spatial IoU (>= 0.15), or spatial center proximity (< 140px)
   */
  findExistingObject(placementData) {
    const box = placementData.box;
    const candCenterX = box ? (box.x + (box.width || 0) / 2) : null;
    const candCenterY = box ? (box.y + (box.height || 0) / 2) : null;

    // 1. Explicit ID match
    for (const [id, obj] of this.registeredObjects.entries()) {
      if (obj.state !== 'PRESENT') continue;
      if (placementData.objectId && (obj.objectId === placementData.objectId || id === placementData.objectId)) {
        return obj;
      }
    }

    // 2. Spatial Overlap & Proximity matching
    let bestMatch = null;
    let highestIou = 0;
    let closestDist = Infinity;

    for (const [id, obj] of this.registeredObjects.entries()) {
      if (obj.state !== 'PRESENT') continue;

      let objBox = obj.box;
      if (!objBox && obj.bounding_box) {
        try {
          objBox = typeof obj.bounding_box === 'string' ? JSON.parse(obj.bounding_box) : obj.bounding_box;
          obj.box = objBox;
        } catch (e) {}
      }

      if (box && objBox && candCenterX !== null && candCenterY !== null) {
        const xA = Math.max(box.x, objBox.x);
        const yA = Math.max(box.y, objBox.y);
        const xB = Math.min(box.x + (box.width || 0), objBox.x + (objBox.width || 0));
        const yB = Math.min(box.y + (box.height || 0), objBox.y + (objBox.height || 0));
        const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        const boxAArea = (box.width || 0) * (box.height || 0);
        const boxBArea = (objBox.width || 0) * (objBox.height || 0);
        const unionArea = boxAArea + boxBArea - interArea;
        const iou = unionArea > 0 ? interArea / unionArea : 0;

        const objCenterX = objBox.x + (objBox.width || 0) / 2;
        const objCenterY = objBox.y + (objBox.height || 0) / 2;
        const dist = Math.hypot(candCenterX - objCenterX, candCenterY - objCenterY);

        // Generous spatial match: IoU >= 0.15 or proximity < 140px
        if (iou >= 0.15 && iou > highestIou) {
          highestIou = iou;
          bestMatch = obj;
        } else if (highestIou === 0 && dist < 140 && dist < closestDist) {
          closestDist = dist;
          bestMatch = obj;
        }
      }
    }

    if (bestMatch) return bestMatch;

    // 3. Fallback: If an authorized object is PRESENT in the Red Tag area but had no initial bounding box
    // (e.g. from Kiosk placement confirmation where camera coordinates were not yet bound),
    // and this detected stationary object is inside the polygon:
    // Bind the detected box to that authorized object!
    const activeAuthorized = Array.from(this.registeredObjects.values()).filter(o => 
      o.state === 'PRESENT' && (o.isAuthorized || o.authorization_status === 'AUTHORIZED' || o.authStatus === 'AUTHORIZED')
    );

    if (activeAuthorized.length === 1 && !activeAuthorized[0].box) {
      const singleAuth = activeAuthorized[0];
      singleAuth.box = box;
      singleAuth.bounding_box = box;
      try {
        db.prepare('UPDATE objects SET bounding_box = ? WHERE id = ?').run(JSON.stringify(box), singleAuth.id);
      } catch (e) {}
      console.log(`🔗 [CorrelationEngine] Bound physical camera box to existing authorized item "${singleAuth.item_name || singleAuth.objectId}".`);
      return singleAuth;
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

    // Section 49 & Project Guideline: STRICTLY REJECT persons, pedestrians, or humans as placed objects
    const objTypeLower = (placementData.objectType || '').toLowerCase();
    if (objTypeLower === 'person' || objTypeLower === 'human' || objTypeLower === 'pedestrian' || objTypeLower === 'worker') {
      console.warn(`🛡️ [CorrelationEngine] Rejected placement event for human entity: ${placementData.objectType}`);
      return { success: false, reason: 'Persons cannot be registered as placed objects.' };
    }

    // Section 84, 85, 89: CHECK IF THIS OBJECT IS ALREADY REGISTERED AS PRESENT
    const existing = this.findExistingObject(placementData);
    if (existing && existing.state === 'PRESENT') {
      existing.lastSeen = now;
      if (placementData.box && !existing.box) {
        existing.box = placementData.box;
        existing.bounding_box = placementData.box;
      }
      const isAuth = !!(existing.isAuthorized || existing.authorization_status === 'AUTHORIZED' || existing.authStatus === 'AUTHORIZED');
      if (isAuth) {
        existing.isAuthorized = true;
        existing.authStatus = 'AUTHORIZED';
        existing.authorization_status = 'AUTHORIZED';
        console.log(`🛡️ [Section 84] Object ${existing.objectId} (${existing.objectType || existing.item_name}) is ALREADY AUTHORIZED and PRESENT.`);
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
          objectType: existing.objectType || existing.item_name,
          evidence_image: existing.evidenceImage || existing.evidence_image
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
          authorization_status: existing.authStatus || 'UNAUTHORIZED',
          alert_status: 'NO_ALERT',
          object_state: 'PRESENT',
          state: 'PRESENT',
          objectType: existing.objectType || existing.item_name,
          evidence_image: existing.evidenceImage || existing.evidence_image
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

    // Priority 1: Check if an active Kiosk placement session is in progress (Rule: Active Placement Session)
    const kioskReg = getAnyPendingKioskRegistration();
    const activeToken = rfidService.getActiveToken();

    if (kioskReg && new Date(kioskReg.expires_at).getTime() > now) {
      // CASE 0: KIOSK-REGISTERED PENDING PLACEMENT
      // Store candidate detection for the active kiosk session. Awaits employee pressing "OBJECT PLACED".
      this.pendingKioskCandidate = {
        kioskRegId: kioskReg.id,
        objectType: placementData.objectType,
        box: placementData.box,
        confidence: placementData.confidence || 0.94,
        evidenceImage: placementData.evidenceImage,
        objectId: objectId,
        detectedAt: now
      };

      console.log(`📋 [CorrelationEngine] Candidate item detected in Red Tag Area for Kiosk session "${kioskReg.item_name}" (${placementData.objectType}). Waiting for employee to click "OBJECT PLACED".`);

      if (this.io) {
        this.io.emit('kiosk_item_detected', {
          kioskRegId: kioskReg.id,
          objectType: placementData.objectType,
          itemName: kioskReg.item_name,
          evidenceImage: placementData.evidenceImage,
          message: `Object detected in Red Tag Area: ${placementData.objectType}`
        });
      }

      return {
        event: {
          id: `PENDING-${objectId}`,
          object_id: objectId,
          authorization_status: 'PENDING_CONFIRMATION',
          alert_status: 'NO_ALERT',
          alreadyAuthorized: false,
          evidence_image: placementData.evidenceImage
        },
        object_id: objectId,
        object_state: 'PLACEMENT_CONFIRMING',
        pendingKiosk: true
      };
    } else if (activeToken) {
      rfidUID = activeToken.uid;
      employeeId = activeToken.employee_id || null;
      employeeName = activeToken.employee_name;
      timeDifference = ((now - activeToken.scanned_at) / 1000).toFixed(1);

      if (activeToken.is_authorized && now <= activeToken.expires_at) {
        // CASE 1: AUTHORIZED PLACEMENT VIA DIRECT BADGE SCAN (Section 81 & 93)
        isAuthorized = true;
        authStatus = 'AUTHORIZED';
        // In industrial operations, an authorized badge tap grants an active drop-off window (default: 60s).
        // Any objects placed by that authorized employee within the active window are AUTHORIZED.
        // In live camera surveillance (allowMultiPlacement=true), an authorized badge tap grants an active drop-off session (60s).
        // Any objects placed by that authorized employee within the active window are AUTHORIZED.
        // In synthetic test workflows (without allowMultiPlacement), single-item token consumption is preserved.
        const singlePlacementPerScan = getSetting('single_placement_per_scan') === 'true';
        const forceSingleItem = placementData.consumeTokenImmediately || singlePlacementPerScan || !placementData.allowMultiPlacement;
        if (forceSingleItem) {
          rfidService.consumeToken();
        }
      } else if (!activeToken.is_authorized) {
        // CASE 3: UNAUTHORIZED RFID CARD
        isAuthorized = false;
        authStatus = 'UNAUTHORIZED_RFID';
        notes = `Unauthorized placement: RFID UID ${rfidUID} (${employeeName}) is marked UNAUTHORIZED in the database.`;

        // Unauthorized tokens are consumed immediately so they do not leak
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

    // Populate item metadata from the active kiosk registration (or placement data)
    const finalItemName = kioskReg?.item_name || placementData.objectType || 'Object';
    const finalSerialNo = kioskReg?.serial_number || null;
    const finalDescription = kioskReg?.description || null;
    const finalReason = kioskReg?.reason || null;
    const finalDurationMin = kioskReg?.duration_min !== undefined ? kioskReg.duration_min : 5;
    const finalDept = kioskReg?.department || activeToken?.department || 'General';
    const registeredAt = kioskReg?.created_at || null;

    // Section 82: Register Authorized / Tracked Object Record in SQLite and in-memory registry
    const objectRecord = {
      id: objectId,
      objectId,
      event_id: eventId,
      object_type: placementData.objectType,
      objectType: placementData.objectType,
      item_name: finalItemName,
      serial_number: finalSerialNo,
      description: finalDescription,
      placement_reason: finalReason,
      placement_duration_min: finalDurationMin,
      department: finalDept,
      registered_at: registeredAt,
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

    if (kioskReg) {
      completeKioskRegistration(kioskReg.id, eventId, objectId);
    }

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
      notes,
      item_name: finalItemName,
      serial_number: finalSerialNo,
      description: finalDescription,
      placement_reason: finalReason,
      placement_duration_min: finalDurationMin,
      department: finalDept,
      registered_at: registeredAt
    });

    // Section 37 Tagged Logging Format
    console.log(`[DETECTION] New object detected: ${placementData.objectType} (Item: ${finalItemName})`);
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

    // Broadcast to React Dashboard & Kiosk via Socket.IO
    if (this.io) {
      if (isAuthorized) {
        // Emit Kiosk placement success (ONLY for the current item/employee, zero admin data)
        this.io.emit('kiosk_placement_success', {
          success: true,
          eventId,
          objectId,
          itemName: finalItemName,
          serialNumber: finalSerialNo,
          employeeName: employeeName,
          department: finalDept,
          message: 'Your item has been registered successfully. You may leave the area.'
        });

        this.io.emit('placement_authorized', {
          eventId,
          objectId,
          event: savedEvent,
          employee: employeeName,
          rfid: rfidUID,
          object: placementData.objectType,
          item_name: finalItemName,
          serial_number: finalSerialNo,
          department: finalDept,
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

        // Section: RED TAG MONITOR — MAIL PROCESSING PIPELINE
        // Enqueue mail job with verified evidence crop, HTML formatting, multipart attachments, and retry engine
        mailQueueService.enqueueMailJob(savedEvent, finalEvidenceFilename).catch(err => {
          console.warn('⚠️ [CorrelationEngine] Mail queue enqueue error:', err.message);
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

  /**
   * Finalize and confirm a registered Kiosk placement when employee clicks "OBJECT PLACED".
   * Captures optical evidence, records AUTHORIZED_PLACEMENT event, completes kiosk registration,
   * stops the countdown timer, and emits success socket events.
   */
  async confirmKioskPlacement({ registrationId, imageBase64, objectType }) {
    const reg = registrationId ? getKioskRegistrationById(registrationId) : getAnyPendingKioskRegistration();
    if (!reg) {
      throw new Error('No active pending placement session found.');
    }
    if (reg.status !== 'PENDING_PLACEMENT') {
      throw new Error(`Registration is already ${reg.status}.`);
    }

    const now = Date.now();
    const eventId = `EVT-${now}-${uuidv4().slice(0, 4).toUpperCase()}`;

    // Prefer using the candidate objectId and box tracked by CCTV during this session!
    const targetObjectId = (this.pendingKioskCandidate && this.pendingKioskCandidate.objectId) || `TRACK-${String(Math.floor(Math.random() * 900) + 100)}`;
    const targetBox = (this.pendingKioskCandidate && this.pendingKioskCandidate.box) || null;

    // 1. Evidence image resolution
    let finalEvidenceFilename = null;
    if (imageBase64) {
      try {
        const filename = `evidence_${now}_${uuidv4().slice(0, 8)}.jpg`;
        const filePath = path.join(evidenceDir, filename);
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
        finalEvidenceFilename = filename;
        console.log(`📸 [Kiosk] Saved direct evidence frame from camera crop: ${filename}`);
      } catch (err) {
        console.warn('Could not save uploaded evidence image:', err.message);
      }
    }

    // If client didn't supply an imageBase64, use the candidate captured by CCTV during placement
    if (!finalEvidenceFilename && this.pendingKioskCandidate && this.pendingKioskCandidate.kioskRegId === reg.id) {
      finalEvidenceFilename = this.pendingKioskCandidate.evidenceImage;
      console.log(`📸 [Kiosk] Linked CCTV candidate evidence image: ${finalEvidenceFilename}`);
    }

    // If still no evidence image, generate high-definition optical badge
    if (!finalEvidenceFilename) {
      try {
        const { visionService } = await import('./visionService.js');
        finalEvidenceFilename = await visionService.generateObjectOnlyBadge(reg.item_name || 'Object', { x: 200, y: 200, width: 240, height: 180 });
      } catch (e) {
        console.warn('Fallback evidence generation error:', e.message);
      }
    }

    const finalItemName = reg.item_name || 'Object';
    const finalSerialNo = reg.serial_number || null;
    const finalDescription = reg.description || null;
    const finalReason = reg.reason || null;
    const finalDurationMin = reg.duration_min !== undefined ? reg.duration_min : 5;
    const finalDept = reg.department || 'General';
    const registeredAt = reg.created_at || new Date(now).toISOString();
    const timeDifference = ((now - new Date(registeredAt).getTime()) / 1000).toFixed(1);

    const objectRecord = {
      id: targetObjectId,
      objectId: targetObjectId,
      event_id: eventId,
      object_type: objectType || reg.item_name || 'Object',
      objectType: objectType || reg.item_name || 'Object',
      item_name: finalItemName,
      serial_number: finalSerialNo,
      description: finalDescription,
      placement_reason: finalReason,
      placement_duration_min: finalDurationMin,
      rfid_uid: reg.rfid_uid,
      employee_id: reg.employee_id,
      employee_name: reg.employee_name,
      department: finalDept,
      authorization_status: 'AUTHORIZED',
      authStatus: 'AUTHORIZED',
      isAuthorized: true,
      state: 'PRESENT',
      box: targetBox,
      bounding_box: targetBox,
      confidence: 0.95,
      first_seen: new Date(now).toISOString(),
      last_seen: new Date(now).toISOString(),
      firstSeen: now,
      lastSeen: now,
      evidence_image: finalEvidenceFilename,
      evidenceImage: finalEvidenceFilename,
      camera_id: 'CAM-01-REDTAG',
      notes: `Authorized Kiosk placement: ${finalItemName} confirmed by ${reg.employee_name} (${reg.rfid_uid})`
    };

    registerObject(objectRecord);
    this.registeredObjects.set(targetObjectId, objectRecord);

    // Complete the kiosk registration in DB
    completeKioskRegistration(reg.id, eventId, targetObjectId);

    // Log the authorized event in DB
    const savedEvent = logEvent({
      id: eventId,
      timestamp: new Date(now).toISOString(),
      event_type: 'AUTHORIZED_PLACEMENT',
      rfid_uid: reg.rfid_uid,
      employee_id: reg.employee_id,
      employee_name: reg.employee_name,
      object_type: reg.item_name || 'Object',
      object_id: targetObjectId,
      object_state: 'PRESENT',
      authorization_status: 'AUTHORIZED',
      alert_status: 'NO_ALERT',
      confidence: 0.95,
      time_difference: parseFloat(timeDifference),
      evidence_image: finalEvidenceFilename,
      camera_id: 'CAM-01-REDTAG',
      notes: objectRecord.notes,
      item_name: finalItemName,
      serial_number: finalSerialNo,
      description: finalDescription,
      placement_reason: finalReason,
      placement_duration_min: finalDurationMin,
      department: finalDept,
      registered_at: registeredAt
    });

    // Clear active RFID token and pending candidate
    rfidService.consumeToken();
    this.pendingKioskCandidate = null;

    console.log(`✅ [Kiosk] Placement confirmed by operator: "${finalItemName}" for ${reg.employee_name} (${reg.rfid_uid}) -> Object: ${targetObjectId}`);

    // Emit Socket.IO events to Kiosk & Admin Dashboard
    if (this.io) {
      this.io.emit('kiosk_placement_success', {
        success: true,
        eventId,
        objectId: targetObjectId,
        box: targetBox,
        itemName: finalItemName,
        serialNumber: finalSerialNo,
        employeeName: reg.employee_name,
        department: finalDept,
        evidenceImage: finalEvidenceFilename,
        message: 'Your item has been registered successfully. You may leave the area.'
      });

      this.io.emit('placement_authorized', {
        eventId,
        objectId: targetObjectId,
        box: targetBox,
        event: savedEvent,
        employee: reg.employee_name,
        rfid: reg.rfid_uid,
        object: finalItemName,
        item_name: finalItemName,
        serial_number: finalSerialNo,
        department: finalDept,
        object_state: 'PRESENT',
        evidenceImage: finalEvidenceFilename,
        timeDifference,
        notes: objectRecord.notes
      });

      this.io.emit('object_registered', objectRecord);
      this.io.emit('new_event_logged', savedEvent);
    }

    return {
      success: true,
      event: savedEvent,
      eventId: savedEvent.id,
      objectId: targetObjectId,
      evidenceImage: finalEvidenceFilename
    };
  }
}

export const correlationEngine = new CorrelationEngine();

