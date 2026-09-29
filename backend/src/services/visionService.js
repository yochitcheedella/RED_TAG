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
   * Crop strictly the object bounding box + generous 50px context padding.
   * NEVER capture human faces, employees, or full CCTV frames.
   */
  async cropAndSaveObjectEvidence(imageBuffer, box, objectLabel) {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      const imgWidth = metadata.width || 640;
      const imgHeight = metadata.height || 480;

      const padding = parseInt(getSetting('evidence_padding_px') || '50', 10);

      const left   = Math.max(0, Math.min(Math.round(box.x - padding), imgWidth - 10));
      const top    = Math.max(0, Math.min(Math.round(box.y - padding), imgHeight - 10));
      const width  = Math.max(10, Math.min(Math.round(box.width  + padding * 2), imgWidth  - left));
      const height = Math.max(10, Math.min(Math.round(box.height + padding * 2), imgHeight - top));

      const filename = `evidence_${Date.now()}_${objectLabel.toLowerCase().replace(/[^a-z0-9]/g, '')}.jpg`;
      const outputPath = path.join(evidenceDir, filename);

      let pipeline = sharp(imageBuffer).extract({ left, top, width, height });

      // Ensure evidence has high resolution (min 800px wide) for clear forensic inspection
      if (width < 800) {
        pipeline = pipeline.resize({
          width: 800,
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3
        });
      }

      await pipeline
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toFile(outputPath);

      console.log(`🔒 High-Res Optical Evidence Saved (Object Crop + ${padding}px): ${filename} [Extracted: ${width}x${height}px, Output: min 800px width @ 95% quality]`);
      return filename;
    } catch (err) {
      console.error('Failed to crop object evidence:', err.message);
      return this.generateObjectOnlyBadge(objectLabel, box);
    }
  }

  /**
   * Fallback synthetic evidence badge (when using simulated/virtual frames) - High Definition
   */
  async generateObjectOnlyBadge(objectLabel, box) {
    try {
      const filename = `evidence_${Date.now()}_${objectLabel.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`;
      const outputPath = path.join(evidenceDir, filename);

      const width = 800;
      const height = 480;

      const svg = `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0b0f19" />
              <stop offset="100%" stop-color="#161e2e" />
            </linearGradient>
            <linearGradient id="boxGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#ef4444" stop-opacity="0.35" />
              <stop offset="100%" stop-color="#b91c1c" stop-opacity="0.15" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#bgGrad)" />
          <rect x="16" y="16" width="${width - 32}" height="${height - 32}" fill="#0f172a" rx="14" stroke="#334155" stroke-width="2" />

          <!-- Header badge -->
          <rect x="36" y="36" width="220" height="34" rx="8" fill="#10b981" fill-opacity="0.15" stroke="#059669" stroke-width="1.5" />
          <text x="50" y="58" fill="#34d399" font-family="'JetBrains Mono', monospace" font-size="13" font-weight="bold">🔒 ZERO-HUMAN PRIVACY</text>

          <text x="${width - 40}" y="58" fill="#94a3b8" font-family="'JetBrains Mono', monospace" font-size="13" font-weight="600" text-anchor="end">
            RED TAG ZONE EVIDENCE
          </text>

          <line x1="36" y1="84" x2="${width - 36}" y2="84" stroke="#1e293b" stroke-width="2" />

          <!-- High-definition simulated object bounding region -->
          <rect x="180" y="110" width="440" height="240" rx="12" fill="url(#boxGrad)" stroke="#ef4444" stroke-width="3" stroke-dasharray="6 4" />

          <!-- Stylized container/object icon -->
          <path d="M340 160 L460 160 L490 200 L490 290 L310 290 L310 200 Z" fill="#ef4444" fill-opacity="0.75" stroke="#fca5a5" stroke-width="3" />
          <line x1="310" y1="200" x2="490" y2="200" stroke="#fca5a5" stroke-width="2.5" />
          <line x1="400" y1="160" x2="400" y2="290" stroke="#fca5a5" stroke-width="2.5" />

          <!-- Label and metadata -->
          <text x="400" y="375" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="24" font-weight="800" text-anchor="middle" letter-spacing="1">
            ${objectLabel.toUpperCase()}
          </text>
          <text x="400" y="405" fill="#94a3b8" font-family="'JetBrains Mono', monospace" font-size="14" text-anchor="middle">
            OPTICAL CROP: ${Math.round(box.width)}x${Math.round(box.height)}px (+50px PADDING) | RESOLUTION: ${width}x${height}px
          </text>

          <!-- Footer banner -->
          <rect x="16" y="${height - 40}" width="${width - 32}" height="24" fill="#020617" opacity="0.8" rx="4" />
          <text x="32" y="${height - 24}" fill="#64748b" font-family="'JetBrains Mono', monospace" font-size="11">
            FORENSIC EVIDENCE CAPTURE SYSTEM • AUTOMATIC ISOLATION OF PHYSICAL OBJECT
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
