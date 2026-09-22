import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getSetting } from '../db.js';
import { correlationEngine } from './correlationEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const evidenceDir = path.resolve(__dirname, '../../uploads/evidence');

if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

const roiConfigPath = path.resolve(__dirname, '../../../config/roi_config.json');

class VisionService {
  constructor() {
    this.io = null;
    // key -> { objectType, box, firstSeen, lastSeen, frameCount, confirmed, alertFired, candidateFrames }
    this.persistenceTracker = new Map();
    this.lastFrameDetections = [];
    this.currentROI = { x: 160, y: 180, width: 320, height: 240 };
    this.polygonVertices = [
      { x: 130, y: 180 },
      { x: 510, y: 180 },
      { x: 560, y: 440 },
      { x: 80, y: 440 }
    ];
    this.activeObjectsInROI = [];
    this.isAiRunning = true;
  }

  init(io) {
    this.io = io;
    this.loadROI();
  }

  loadROI() {
    try {
      if (fs.existsSync(roiConfigPath)) {
        const config = JSON.parse(fs.readFileSync(roiConfigPath, 'utf8'));
        if (config?.floor_tape_roi?.polygon_vertices?.length >= 3) {
          this.polygonVertices = config.floor_tape_roi.polygon_vertices;
          console.log(`📐 [VisionService] Loaded physical floor polygon (${this.polygonVertices.length} vertices).`);
        }
      }
      const roiSetting = getSetting('roi');
      if (roiSetting) {
        this.currentROI = typeof roiSetting === 'string' ? JSON.parse(roiSetting) : roiSetting;
      }
    } catch (err) {
      console.warn('Could not parse ROI setting, using default:', err.message);
    }
  }

  setPolygon(vertices) {
    if (Array.isArray(vertices) && vertices.length >= 3) {
      this.polygonVertices = vertices;
      console.log(`📐 [VisionService] Floor polygon updated (${vertices.length} points).`);
      if (this.io) {
        this.io.emit('polygon_updated', this.polygonVertices);
      }
    }
  }

  getPolygon() {
    return this.polygonVertices;
  }

  /**
   * Group K — explicit object tracker reset for test reset / hardware Object Removal
   * If label is provided, only that tracker is removed.
   */
  clearTrackers(label = null) {
    if (label) {
      for (const [key, tracker] of this.persistenceTracker.entries()) {
        if (tracker.label === label) {
          this.persistenceTracker.delete(key);
          console.log(`🧹 [VisionService] Tracker cleared for label [${label}]`);
        }
      }
      correlationEngine.handleObjectRemoved(label);
    } else {
      this.persistenceTracker.clear();
      correlationEngine.clearAllObjects();
    }
    this.activeObjectsInROI = [];
    if (!label) {
      console.log('🧹 [VisionService] All object persistence trackers cleared.');
    }
  }

  setROI(newROI) {
    this.currentROI = newROI;
    if (this.io) {
      this.io.emit('roi_updated', this.currentROI);
    }
  }

  getROI() {
    return this.currentROI;
  }

  /**
   * Ray-casting point-in-polygon (Sections 68–71)
   */
  isPointInPolygon(pt, poly = this.polygonVertices) {
    if (!poly || poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > pt.y) !== (yj > pt.y))
          && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * CRITICAL (Sections 68–79):
   * Test the object's BOTTOM-CENTER contact point:
   *   baseX = (x1 + x2) / 2  =  box.x + box.width / 2
   *   baseY = y2              =  box.y + box.height
   * NOT the bounding-box centre!
   */
  isInsideROI(box) {
    const baseX = box.x + box.width / 2;
    const baseY = box.y + box.height;

    if (this.polygonVertices && this.polygonVertices.length >= 3) {
      return this.isPointInPolygon({ x: baseX, y: baseY }, this.polygonVertices);
    }

    // Fallback: rectangle test
    const roi = this.currentROI;
    return (
      baseX >= roi.x &&
      baseX <= roi.x + roi.width &&
      baseY >= roi.y &&
      baseY <= roi.y + roi.height
    );
  }

  /**
   * Process a frame's detected objects (from either webcam AI or simulator).
   * Sections 45–79 compliant, with Group J duplicate-alert prevention.
   *
   * detections: Array<{ label, confidence, box: { x, y, width, height } }>
   * frameBuffer: optional raw PNG/JPEG buffer for privacy-crop evidence
   */
  async processFrameDetections(detections, frameBuffer = null) {
    if (!this.isAiRunning) return;

    const now = Date.now();
    const persistenceMs = parseInt(getSetting('persistence_ms') || '1000', 10);
    const persistenceFrames = parseInt(getSetting('persistence_frames') || '4', 10);

    const objectsInROI = [];
    const seenTrackerKeys = new Set();

    for (const det of detections) {
      // Section 49 — STRICTLY NEVER flag humans as object placements
      const labelLower = det.label.toLowerCase();
      if (labelLower === 'person' || labelLower === 'human') {
        continue;
      }

      const insideROI = this.isInsideROI(det.box);

      if (insideROI) {
        // Quantize position to a coarse grid to match the same object across frames
        const gridX = Math.round(det.box.x / 25) * 25;
        const gridY = Math.round(det.box.y / 25) * 25;
        const trackerKey = `${det.label}_${gridX}_${gridY}`;
        seenTrackerKeys.add(trackerKey);

        let tracker = this.persistenceTracker.get(trackerKey);
        if (!tracker) {
          tracker = {
            key: trackerKey,
            label: det.label,
            box: det.box,
            confidence: det.confidence || 0.90,
            firstSeen: now,
            lastSeen: now,
            frameCount: 1,
            confirmed: false,
            // Group J: alertFired prevents duplicate events for a stationary object
            alertFired: false,
            candidateFrames: []
          };
          this.persistenceTracker.set(trackerKey, tracker);
        } else {
          tracker.lastSeen = now;
          tracker.frameCount += 1;
          tracker.box = det.box;
          if (det.confidence) tracker.confidence = Math.max(tracker.confidence, det.confidence);
        }

        // Rule 16: Collect best candidate frames during the persistence window
        if (frameBuffer && tracker.candidateFrames.length < 5) {
          tracker.candidateFrames.push({
            buffer: frameBuffer,
            box: det.box,
            confidence: det.confidence || 0.90
          });
        }

        const duration = now - tracker.firstSeen;
        const persistenceProgress = Math.min(100, Math.round((duration / persistenceMs) * 100));

        objectsInROI.push({
          ...det,
          trackerKey,
          duration,
          frameCount: tracker.frameCount,
          confirmed: tracker.confirmed,
          persistenceProgress
        });

        // Trigger once: persistence criteria met AND alert not yet fired (Group J)
        if (!tracker.confirmed && !tracker.alertFired &&
            (duration >= persistenceMs || tracker.frameCount >= persistenceFrames)) {
          tracker.confirmed = true;
          tracker.alertFired = true;

          console.log(`🎯 CCTV Placement CONFIRMED for [${det.label}] inside Red Tag ROI after ${duration}ms (${tracker.frameCount} frames)`);

          // Rule 16: Select best-confidence frame from collected candidates
          let bestCandidate = { buffer: frameBuffer, box: det.box, confidence: det.confidence || 0.90 };
          if (tracker.candidateFrames.length > 0) {
            bestCandidate = tracker.candidateFrames.reduce(
              (best, curr) => curr.confidence > best.confidence ? curr : best,
              tracker.candidateFrames[0]
            );
          }

          // Rule 17: Privacy-crop object-only bounding box + configurable padding
          let evidenceFilename = null;
          if (bestCandidate.buffer) {
            evidenceFilename = await this.cropAndSaveObjectEvidence(
              bestCandidate.buffer, bestCandidate.box, det.label
            );
          } else {
            evidenceFilename = await this.generateObjectOnlyBadge(det.label, det.box);
          }

          // Hand off to the Correlation Engine
          await correlationEngine.handlePlacementConfirmed({
            objectType: det.label,
            confidence: bestCandidate.confidence,
            box: det.box,
            duration,
            evidenceImage: evidenceFilename
          });
        }
      }
    }

    // Clean up stale trackers (object removed / moved away — Section 87 configurable removal timeout)
    const removalTimeoutMs = parseInt(getSetting('object_removal_timeout_ms') || '3000', 10);
    for (const [key, tracker] of this.persistenceTracker.entries()) {
      if (!seenTrackerKeys.has(key) && (now - tracker.lastSeen > removalTimeoutMs)) {
        if (tracker.confirmed) {
          console.log(`📦 Object [${tracker.label}] removed from Red Tag ROI after ${removalTimeoutMs}ms`);
          correlationEngine.handleObjectRemoved(tracker.label);
          if (this.io) {
            this.io.emit('object_removed', { label: tracker.label, state: 'REMOVED' });
          }
        }
        this.persistenceTracker.delete(key);
      }
    }

    this.activeObjectsInROI = objectsInROI;
    this.lastFrameDetections = detections;

    // Parallel dual-engine streaming: relay frame detections to Java Engine (non-blocking)
    if (detections && detections.length > 0) {
      fetch('http://localhost:8080/api/frame-detections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detections })
      })
        .then(r => r.json())
        .then(javaData => {
          if (javaData && this.io) {
            this.io.emit('java_telemetry', javaData);
          }
        })
        .catch(() => {});
    }

    // Broadcast frame telemetry to React dashboard
    if (this.io) {
      this.io.emit('vision_telemetry', {
        detections,
        objectsInROI,
        roi: this.currentROI,
        timestamp: now
      });
    }
  }

  /**
   * PRIVACY REQUIREMENT (Rule 17 / Section 54):
   * Crop strictly the object bounding box + configurable padding.
   * NEVER capture human faces, employees, or full CCTV frames.
   */
  async cropAndSaveObjectEvidence(imageBuffer, box, objectLabel) {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      const imgWidth = metadata.width || 640;
      const imgHeight = metadata.height || 480;

      const padding = parseInt(getSetting('evidence_padding_px') || '20', 10);

      const left   = Math.max(0, Math.min(Math.round(box.x - padding), imgWidth - 10));
      const top    = Math.max(0, Math.min(Math.round(box.y - padding), imgHeight - 10));
      const width  = Math.max(10, Math.min(Math.round(box.width  + padding * 2), imgWidth  - left));
      const height = Math.max(10, Math.min(Math.round(box.height + padding * 2), imgHeight - top));

      const filename = `evidence_${Date.now()}_${objectLabel.toLowerCase().replace(/[^a-z0-9]/g, '')}.jpg`;
      const outputPath = path.join(evidenceDir, filename);

      await sharp(imageBuffer)
        .extract({ left, top, width, height })
        .jpeg({ quality: 90 })
        .toFile(outputPath);

      console.log(`🔒 Privacy Evidence Saved (Object Crop + ${padding}px): ${filename} [${width}x${height}px]`);
      return filename;
    } catch (err) {
      console.error('Failed to crop object evidence:', err.message);
      return this.generateObjectOnlyBadge(objectLabel, box);
    }
  }

  /**
   * Fallback synthetic evidence badge (when using simulated/virtual frames)
   */
  async generateObjectOnlyBadge(objectLabel, box) {
    try {
      const filename = `evidence_${Date.now()}_${objectLabel.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`;
      const outputPath = path.join(evidenceDir, filename);

      const width = 360;
      const height = 240;

      const svg = `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#0d1117" />
          <rect x="10" y="10" width="${width - 20}" height="${height - 20}" fill="#161b22" rx="10" stroke="#30363d" stroke-width="2" />
          <rect x="20" y="20" width="160" height="24" rx="4" fill="#238636" opacity="0.2" />
          <text x="30" y="37" fill="#3fb950" font-family="sans-serif" font-size="11" font-weight="bold">🔒 PRIVACY COMPLIANT</text>
          <rect x="20" y="55" width="${width - 40}" height="1" fill="#30363d" />
          <rect x="90" y="75" width="180" height="110" rx="8" fill="#21262d" stroke="#f85149" stroke-width="2" stroke-dasharray="4" />
          <path d="M150 95 L210 95 L225 115 L225 165 L135 165 L135 115 Z" fill="#da3633" opacity="0.8" stroke="#ff7b72" stroke-width="2" />
          <line x1="135" y1="115" x2="225" y2="115" stroke="#ff7b72" stroke-width="2" />
          <line x1="180" y1="95" x2="180" y2="165" stroke="#ff7b72" stroke-width="2" />
          <text x="180" y="205" fill="#f0f6fc" font-family="sans-serif" font-size="15" font-weight="bold" text-anchor="middle">
            ${objectLabel.toUpperCase()}
          </text>
          <text x="180" y="222" fill="#8b949e" font-family="sans-serif" font-size="11" text-anchor="middle">
            CCTV ROI Object Crop (${Math.round(box.width)}x${Math.round(box.height)}px)
          </text>
        </svg>
      `;

      await sharp(Buffer.from(svg)).png().toFile(outputPath);
      return filename;
    } catch (err) {
      console.error('Error generating fallback evidence badge:', err.message);
      return null;
    }
  }
}

export const visionService = new VisionService();
