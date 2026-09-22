import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, Crosshair, ShieldCheck, ShieldAlert, Footprints, Clock, RotateCcw, Check, PenTool, Video, RefreshCw, AlertCircle } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { sounds } from '../utils/audio';

export default function CCTVMonitor({
  unauthorizedAlert,
  onUnauthorizedAlert,
  activeToken,
  onSaveROI,
  polygonVertices: externalPolygon,
  onPolygonChange
}) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [fps, setFps] = useState(0);

  // Red Tag Area Polygon Vertices (Manually configured by the user)
  const [polygonVertices, setPolygonVertices] = useState(externalPolygon || [
    { x: 130, y: 180 },
    { x: 510, y: 180 },
    { x: 560, y: 440 },
    { x: 80, y: 440 }
  ]);

  // Calibration Modes: 'none' | 'drag' | 'draw'
  const [calibrationMode, setCalibrationMode] = useState('none');
  const [drawPoints, setDrawPoints] = useState([]);
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [polygonError, setPolygonError] = useState(null);

  // Keep in sync with external polygon unless currently in active calibration
  useEffect(() => {
    if (calibrationMode === 'none' && externalPolygon && externalPolygon.length >= 3) {
      setPolygonVertices(externalPolygon);
    }
  }, [externalPolygon, calibrationMode]);

  // AI & Manual Object Detection Model
  const [model, setModel] = useState(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [manualObjects, setManualObjects] = useState([]);

  // Spatial Proximity Trackers & Execution References
  const trackersRef = useRef([]);
  const nextTrackerId = useRef(1);
  const isDetectingRef = useRef(false);
  const lastDetectTimeRef = useRef(0);
  const modelRef = useRef(null);
  const activeTokenRef = useRef(activeToken);
  const polygonVerticesRef = useRef(polygonVertices);
  const manualObjectsRef = useRef(manualObjects);
  const calibrationModeRef = useRef(calibrationMode);
  const drawPointsRef = useRef(drawPoints);
  const unauthorizedAlertRef = useRef(unauthorizedAlert);
  const onUnauthorizedAlertRef = useRef(onUnauthorizedAlert);
  const roiCanvasRef = useRef(null);
  const floorBaselineRef = useRef(null);
  const baselineFramesCount = useRef(0);

  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { activeTokenRef.current = activeToken; }, [activeToken]);
  useEffect(() => {
    polygonVerticesRef.current = polygonVertices;
    floorBaselineRef.current = null;
    baselineFramesCount.current = 0;
  }, [polygonVertices]);
  useEffect(() => { manualObjectsRef.current = manualObjects; }, [manualObjects]);
  useEffect(() => { calibrationModeRef.current = calibrationMode; }, [calibrationMode]);
  useEffect(() => { drawPointsRef.current = drawPoints; }, [drawPoints]);
  useEffect(() => { unauthorizedAlertRef.current = unauthorizedAlert; }, [unauthorizedAlert]);
  useEffect(() => { onUnauthorizedAlertRef.current = onUnauthorizedAlert; }, [onUnauthorizedAlert]);

  // Listen for reset/clear events to reset client trackers synchronously
  useEffect(() => {
    const handleClear = () => {
      trackersRef.current = [];
      setManualObjects([]);
      floorBaselineRef.current = null;
      baselineFramesCount.current = 0;
      onUnauthorizedAlertRef.current?.(null);
    };
    window.addEventListener('redtag:clear_objects', handleClear);
    return () => window.removeEventListener('redtag:clear_objects', handleClear);
  }, []);

  // Load configured polygon from backend
  useEffect(() => {
    fetch('/api/config/polygon')
      .then(r => r.json())
      .then(data => {
        if (data?.floor_tape_roi?.polygon_vertices?.length >= 3) {
          setPolygonVertices(data.floor_tape_roi.polygon_vertices);
        }
      })
      .catch(() => {});
  }, []);

  // Enumerate cameras & prioritize external / HD Pro webcam
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then(devices => {
        const inputs = devices.filter(d => d.kind === 'videoinput');
        setVideoDevices(inputs);
        if (inputs.length > 0) {
          const hdPro = inputs.find(d => {
            const label = (d.label || '').toLowerCase();
            return label.includes('hd pro') || label.includes('c920') || label.includes('external') || label.includes('logitech') || label.includes('usb');
          });
          if (hdPro) {
            setSelectedDeviceId(hdPro.deviceId);
          } else if (!selectedDeviceId) {
            setSelectedDeviceId(inputs[0].deviceId);
          }
        }
      })
      .catch(() => {});
  }, [selectedDeviceId]);

  // Load real-time COCO-SSD (mobilenet_v2 for small item detection accuracy with fallback)
  useEffect(() => {
    let active = true;
    const loadAi = async () => {
      try {
        setModelLoading(true);
        await tf.ready();
        let m = null;
        try {
          // mobilenet_v2 has significantly higher precision on small physical items
          m = await cocoSsd.load({ base: 'mobilenet_v2' });
          console.log('🤖 Real-Time Vision AI Model Initialized (mobilenet_v2)');
        } catch (loadErr) {
          console.warn('mobilenet_v2 load error, falling back to lite_mobilenet_v2:', loadErr);
          m = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
          console.log('🤖 Real-Time Vision AI Model Initialized (lite_mobilenet_v2 fallback)');
        }
        if (active) {
          setModel(m);
        }
      } catch (err) {
        console.warn('AI model error:', err);
      } finally {
        if (active) setModelLoading(false);
      }
    };
    loadAi();
    return () => { active = false; };
  }, []);

  // Start Camera Stream
  const startCamera = async (devId) => {
    setCameraError(null);
    const targetDevId = devId || selectedDeviceId;
    try {
      let stream = null;
      try {
        const constraints = {
          video: targetDevId
            ? { deviceId: { ideal: targetDevId }, width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 480 } }
            : { width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 480 }, facingMode: 'environment' }
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (strictErr) {
        console.warn('Initial camera constraints failed, attempting fallback:', strictErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: targetDevId ? { deviceId: targetDevId } : true
        });
      }

      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current.play();
            setCameraActive(true);
          } catch (err) {
            console.warn('Video playback on metadata:', err);
          }
        };
        try {
          await videoRef.current.play();
          setCameraActive(true);
        } catch (_) {}
      }

      // Re-populate device list with granted labels
      navigator.mediaDevices?.enumerateDevices().then(devices => {
        const inputs = devices.filter(d => d.kind === 'videoinput');
        if (inputs.length > 0) {
          setVideoDevices(inputs);
          const hdPro = inputs.find(d => {
            const label = (d.label || '').toLowerCase();
            return label.includes('hd pro') || label.includes('c920') || label.includes('external') || label.includes('logitech') || label.includes('usb');
          });
          if (hdPro && !devId) {
            setSelectedDeviceId(hdPro.deviceId);
          } else if (targetDevId) {
            setSelectedDeviceId(targetDevId);
          }
        }
      }).catch(() => {});
    } catch (err) {
      console.warn('Camera start error:', err);
      setCameraError(err.message || 'Could not access camera. Please check permissions and device.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setFps(0);
    trackersRef.current = [];
  };

  const handleDeviceChange = (newDeviceId) => {
    setSelectedDeviceId(newDeviceId);
    if (cameraActive) {
      stopCamera();
      setTimeout(() => {
        startCamera(newDeviceId);
      }, 150);
    }
  };

  const refreshDevices = async () => {
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices();
      const inputs = (devices || []).filter(d => d.kind === 'videoinput');
      setVideoDevices(inputs);
      if (inputs.length > 0) {
        const hdPro = inputs.find(d => {
          const label = (d.label || '').toLowerCase();
          return label.includes('hd pro') || label.includes('c920') || label.includes('external') || label.includes('logitech') || label.includes('usb');
        });
        if (hdPro) {
          setSelectedDeviceId(hdPro.deviceId);
          if (cameraActive) {
            handleDeviceChange(hdPro.deviceId);
          }
        } else if (!selectedDeviceId) {
          setSelectedDeviceId(inputs[0].deviceId);
        }
      }
    } catch (e) {
      console.warn('Refresh devices failed:', e);
    }
  };

  // Ray-casting point in polygon test
  const isPointInPolygon = useCallback((pt, poly = polygonVertices) => {
    if (!poly || poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }, [polygonVertices]);

  // Robust Multi-Object Floor Segmenter:
  // Uses an empty floor background baseline + local edge energy verification
  // to detect ONLY real physical objects placed on the floor, strictly rejecting empty space, carpet seams, and air.
  const detectFloorObjects = useCallback((roiCtx, roiCanvas, roiMinX, roiMinY, roiW, roiH, activePoly) => {
    const rw = roiCanvas.width;
    const rh = roiCanvas.height;
    if (rw < 30 || rh < 30) return [];

    try {
      const imgData = roiCtx.getImageData(0, 0, rw, rh).data;
      const blockSize = 6;
      const cols = Math.floor(rw / blockSize);
      const rows = Math.floor(rh / blockSize);

      const blockGrid = [];
      let inPolyCount = 0;

      for (let r = 0; r < rows; r++) {
        blockGrid[r] = [];
        for (let c = 0; c < cols; c++) {
          const canvasX = roiMinX + (c * blockSize / rw) * roiW;
          const canvasY = roiMinY + (r * blockSize / rh) * roiH;
          const inPoly = isPointInPolygon({ x: canvasX, y: canvasY }, activePoly);
          if (inPoly) inPolyCount++;

          let sumR = 0, sumG = 0, sumB = 0, sumL = 0;
          let count = 0;
          for (let dy = 0; dy < blockSize; dy += 2) {
            for (let dx = 0; dx < blockSize; dx += 2) {
              const px = c * blockSize + dx;
              const py = r * blockSize + dy;
              if (px < rw && py < rh) {
                const idx = (py * rw + px) * 4;
                const rVal = imgData[idx];
                const gVal = imgData[idx + 1];
                const bVal = imgData[idx + 2];
                sumR += rVal;
                sumG += gVal;
                sumB += bVal;
                sumL += (0.299 * rVal + 0.587 * gVal + 0.114 * bVal);
                count++;
              }
            }
          }
          const avgL = count > 0 ? sumL / count : 128;
          const avgR = count > 0 ? sumR / count : 128;
          const avgG = count > 0 ? sumG / count : 128;
          const avgB = count > 0 ? sumB / count : 128;
          blockGrid[r][c] = { avgL, r: avgR, g: avgG, b: avgB, inPoly };
        }
      }

      if (inPolyCount < 20) return [];

      // 1. Initial Empty Floor Baseline Calibration
      if (!floorBaselineRef.current || baselineFramesCount.current < 4) {
        if (!floorBaselineRef.current) floorBaselineRef.current = [];
        for (let r = 0; r < rows; r++) {
          if (!floorBaselineRef.current[r]) floorBaselineRef.current[r] = [];
          for (let c = 0; c < cols; c++) {
            const cell = blockGrid[r][c];
            if (!floorBaselineRef.current[r][c]) {
              floorBaselineRef.current[r][c] = { avgL: cell.avgL, r: cell.r, g: cell.g, b: cell.b };
            } else {
              const b = floorBaselineRef.current[r][c];
              b.avgL = b.avgL * 0.6 + cell.avgL * 0.4;
              b.r = b.r * 0.6 + cell.r * 0.4;
              b.g = b.g * 0.6 + cell.g * 0.4;
              b.b = b.b * 0.6 + cell.b * 0.4;
            }
          }
        }
        baselineFramesCount.current++;
        return []; // Floor calibrating, zero detections on empty floor!
      }

      // 2. Local Foreground Contrast against Floor Baseline
      const isFg = Array.from({ length: rows }, () => new Uint8Array(cols));
      let fgCount = 0;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = blockGrid[r][c];
          if (!cell.inPoly) continue;

          const base = floorBaselineRef.current[r]?.[c];
          if (!base) continue;

          const diffL = Math.abs(cell.avgL - base.avgL);
          const diffColor = Math.hypot(cell.r - base.r, cell.g - base.g, cell.b - base.b);

          // Carpet seams and tiles are already part of the baseline (diff ~0).
          // Real placed objects produce strong contrast against the floor (diffL >= 38 or diffColor >= 48)
          if (diffL >= 38 || diffColor >= 48) {
            isFg[r][c] = 1;
            fgCount++;
          } else {
            // Slow background adaptation for empty floor blocks
            base.avgL = base.avgL * 0.998 + cell.avgL * 0.002;
            base.r = base.r * 0.998 + cell.r * 0.002;
            base.g = base.g * 0.998 + cell.g * 0.002;
            base.b = base.b * 0.998 + cell.b * 0.002;
          }
        }
      }

      // If very few blocks changed from baseline, the floor is EMPTY — return immediately!
      if (fgCount < 10) return [];

      // 3. Connected-Component BFS Clustering to extract individual objects
      const visited = Array.from({ length: rows }, () => new Uint8Array(cols));
      const detectedObjects = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!isFg[r][c] || visited[r][c]) continue;

          const queue = [[r, c]];
          visited[r][c] = 1;
          const clusterCells = [[r, c]];
          let minC = c, maxC = c, minR = r, maxR = r;

          while (queue.length > 0) {
            const [cr, cc] = queue.shift();
            if (cc < minC) minC = cc;
            if (cc > maxC) maxC = cc;
            if (cr < minR) minR = cr;
            if (cr > maxR) maxR = cr;

            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = cr + dr;
                const nc = cc + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                  if (isFg[nr][nc] && !visited[nr][nc]) {
                    visited[nr][nc] = 1;
                    queue.push([nr, nc]);
                    clusterCells.push([nr, nc]);
                  }
                }
              }
            }
          }

          // A physical object must contain at least 5 blocks (approx 20x15px)
          if (clusterCells.length < 5) continue;

          const boxCols = maxC - minC + 1;
          const boxRows = maxR - minR + 1;
          const density = clusterCells.length / (boxCols * boxRows);

          // Physical object must have solid fill density (>= 15%), not scattered dust
          if (density < 0.15) continue;

          // Reject skinny line artifacts (such as seam lines: aspect ratio > 6.0)
          const aspect = Math.max(boxCols / boxRows, boxRows / boxCols);
          if (aspect > 6.0) continue;

          const candX = Math.round(roiMinX + (minC * blockSize / rw) * roiW);
          const candY = Math.round(roiMinY + (minR * blockSize / rh) * roiH);
          const candW = Math.round((boxCols * blockSize / rw) * roiW);
          const candH = Math.round((boxRows * blockSize / rh) * roiH);

          // Minimum physical dimensions: at least 12px wide, 12px tall
          if (candW < 12 || candH < 12) continue;
          if (candW > roiW * 0.70 || candH > roiH * 0.70) continue;

          // Physical Edge Gradient Check:
          // Check edge contrast around cluster perimeter to ensure this is a solid physical 3D object
          let boundaryDiffSum = 0;
          let boundaryCount = 0;
          for (const [cr, cc] of clusterCells) {
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const nr = cr + dr;
                const nc = cc + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !isFg[nr][nc]) {
                  boundaryDiffSum += Math.abs(blockGrid[cr][cc].avgL - blockGrid[nr][nc].avgL);
                  boundaryCount++;
                }
              }
            }
          }
          const avgEdgeGradient = boundaryCount > 0 ? (boundaryDiffSum / boundaryCount) : 0;
          // Physical object has sharp edge against floor (>= 16); empty space or soft shadow has < 12
          if (avgEdgeGradient < 16) continue;

          const candCenterX = Math.round(candX + candW / 2);
          const candBaseY = Math.round(candY + candH);
          const basePoint = { x: candCenterX, y: candBaseY };

          if (!isPointInPolygon(basePoint, activePoly)) continue;

          detectedObjects.push({
            class: 'Placed Object',
            score: 0.92,
            x: candX,
            y: candY,
            width: candW,
            height: candH,
            centerX: candCenterX,
            centerY: Math.round(candY + candH / 2),
            basePoint,
            rawBox: null
          });
        }
      }

      return detectedObjects;
    } catch (err) {
      return [];
    }
  }, [isPointInPolygon]);

  // Client-side Section 76 polygon validation (mirrors server logic)
  const validatePolygonClient = (vertices) => {
    if (!vertices || vertices.length < 3) return 'Polygon must have at least 3 vertices.';
    for (const [i, v] of vertices.entries()) {
      if (typeof v.x !== 'number' || typeof v.y !== 'number' || isNaN(v.x) || isNaN(v.y))
        return `Vertex ${i} has non-numeric coordinates.`;
      if (v.x < 0 || v.x > 640 || v.y < 0 || v.y > 480)
        return `Vertex ${i} (${Math.round(v.x)}, ${Math.round(v.y)}) is outside frame bounds 0–640 × 0–480.`;
    }
    // Compute area (Shoelace)
    let area = 0;
    const n = vertices.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      area += (vertices[j].x + vertices[i].x) * (vertices[j].y - vertices[i].y);
    }
    if (Math.abs(area / 2) > 0.95 * 640 * 480)
      return 'Polygon covers more than 95% of the frame — this would cause false positives.';
    return null; // valid
  };

  // Save manual polygon to backend and Java engine
  const savePolygon = async (vertices) => {
    const toSave = vertices || polygonVertices;
    setPolygonError(null);

    // Section 76: client-side validation first
    const clientError = validatePolygonClient(toSave);
    if (clientError) {
      setPolygonError(clientError);
      return;
    }

    try {
      const res = await fetch('/api/config/polygon', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polygon_vertices: toSave })
      });
      const data = await res.json();
      if (data.validation_failed) {
        setPolygonError(data.reason || 'Server rejected the polygon.');
        return;
      }
      setPolygonVertices(toSave);
      if (onPolygonChange) onPolygonChange(toSave);
      setCalibrationMode('none');
      setDrawPoints([]);
      console.log('✅ Red Tag Area Saved Successfully');
    } catch (err) {
      console.warn('Failed to save polygon:', err);
      setPolygonError('Network error saving polygon: ' + err.message);
    }
  };

  // Section 11: Sharpness calculation via luminance gradient variance
  const computeSharpness = (ctx, w, h) => {
    try {
      if (w < 6 || h < 6) return 10;
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      let sumGrad = 0;
      const step = 4;
      let count = 0;
      for (let y = 1; y < h - 1; y += step) {
        for (let x = 1; x < w - 1; x += step) {
          const idx = (y * w + x) * 4;
          const leftIdx = (y * w + (x - 1)) * 4;
          const rightIdx = (y * w + (x + 1)) * 4;
          const upIdx = ((y - 1) * w + x) * 4;
          const downIdx = ((y + 1) * w + x) * 4;

          const lumL = 0.299 * data[leftIdx] + 0.587 * data[leftIdx + 1] + 0.114 * data[leftIdx + 2];
          const lumR = 0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];
          const lumU = 0.299 * data[upIdx] + 0.587 * data[upIdx + 1] + 0.114 * data[upIdx + 2];
          const lumD = 0.299 * data[downIdx] + 0.587 * data[downIdx + 1] + 0.114 * data[downIdx + 2];

          sumGrad += Math.abs(lumR - lumL) + Math.abs(lumD - lumU);
          count++;
        }
      }
      return count > 0 ? (sumGrad / count) : 10;
    } catch {
      return 10;
    }
  };

  // Section 8 & 30: Strictly crop ONLY the target object's bounding box + 15px padding
  // NEVER capture full frame, NEVER capture entire ROI, NEVER capture Object A + B
  const cropTargetObjectOnly = (video, tracker, padding = 15) => {
    try {
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const sx = vw / 640;
      const sy = vh / 480;

      const pad = padding;
      const cropX = Math.max(0, tracker.x - pad);
      const cropY = Math.max(0, tracker.y - pad);
      const cropW = Math.min(640 - cropX, Math.max(tracker.width + pad * 2, 40));
      const cropH = Math.min(480 - cropY, Math.max(tracker.height + pad * 2, 40));

      const srcX = Math.max(0, cropX * sx);
      const srcY = Math.max(0, cropY * sy);
      const srcW = Math.min(vw - srcX, cropW * sx);
      const srcH = Math.min(vh - srcY, cropH * sy);

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(cropW);
      canvas.height = Math.round(cropH);
      const ctx = canvas.getContext('2d');

      // Draw ONLY the target object bounding box crop
      ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);

      // Subtle forensic label at bottom of crop
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(0, canvas.height - 18, canvas.width, 18);
      ctx.fillStyle = tracker.authorized ? '#34d399' : '#f87171';
      ctx.font = '700 9px JetBrains Mono, monospace';
      ctx.fillText(`● ${tracker.objectId || 'TRACK'} | ${tracker.bestClass.toUpperCase()}`, 6, canvas.height - 6);

      const sharpness = computeSharpness(ctx, canvas.width, canvas.height);
      return {
        dataUrl: canvas.toDataURL('image/jpeg', 0.92),
        sharpness
      };
    } catch (err) {
      console.warn('Object crop error:', err);
      return null;
    }
  };

  const captureFallbackBadge = (tracker) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 320, 240);
    ctx.strokeStyle = tracker.authorized ? '#10b981' : '#ef4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 40, 240, 160);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tracker.bestClass.toUpperCase(), 160, 110);
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(tracker.objectId || 'TRACK-001', 160, 135);
    ctx.fillText('STRICT OBJECT EVIDENCE CROP', 160, 155);
    return canvas.toDataURL('image/jpeg', 0.92);
  };

  // Section 10 & 11: Select best frame belonging to this NEW object's tracking ID
  const selectBestFrameCrop = (tracker) => {
    if (tracker.candidateFrames && tracker.candidateFrames.length > 0) {
      tracker.candidateFrames.sort((a, b) => b.score - a.score);
      console.log(`📸 [EVIDENCE] Best frame selected for ${tracker.objectId} from ${tracker.candidateFrames.length} candidates (Score: ${Math.round(tracker.candidateFrames[0].score)})`);
      return tracker.candidateFrames[0].cropDataUrl;
    }
    const directCrop = cropTargetObjectOnly(videoRef.current, tracker, 15);
    return directCrop ? directCrop.dataUrl : captureFallbackBadge(tracker);
  };

  // AI Object Detection Function: Strictly within Red Tag Area Only (Sections 68-79)
  const performAiDetection = async () => {
    if (isDetectingRef.current) return;
    const aiModel = modelRef.current;
    const video = videoRef.current;
    if (!aiModel || !video || video.readyState < 2 || calibrationModeRef.current !== 'none') return;

    const activePoly = polygonVerticesRef.current;
    if (!activePoly || activePoly.length < 3) return;

    isDetectingRef.current = true;
    try {
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const cw = 640;
      const ch = 480;

      // Exact mathematical mapping from native video stream to 640x480 overlay canvas
      // (Matches CSS object-fit: contain precisely)
      const videoAspect = vw / vh;
      const canvasAspect = cw / ch;
      let renderW, renderH, offsetX, offsetY;
      if (videoAspect > canvasAspect) {
        // Letterboxed (horizontal black bars top & bottom)
        renderW = cw;
        renderH = cw / videoAspect;
        offsetX = 0;
        offsetY = (ch - renderH) / 2;
      } else {
        // Pillarboxed (vertical black bars left & right)
        renderH = ch;
        renderW = ch * videoAspect;
        offsetX = (cw - renderW) / 2;
        offsetY = 0;
      }
      const scale = renderW / vw;

      // Classes to ignore (humans and wild animals/vehicles)
      const ignoredClasses = new Set([
        'person', 'elephant', 'zebra', 'giraffe', 'bear', 'horse', 'cow', 'sheep',
        'airplane', 'train', 'boat', 'bus', 'truck'
      ]);

      // Calculate tight bounding box of the Red Tag floor polygon
      const xs = activePoly.map(pt => pt.x);
      const ys = activePoly.map(pt => pt.y);
      const pad = 15;
      const roiMinX = Math.max(0, Math.min(...xs) - pad);
      const roiMinY = Math.max(0, Math.min(...ys) - pad);
      const roiMaxX = Math.min(cw, Math.max(...xs) + pad);
      const roiMaxY = Math.min(ch, Math.max(...ys) + pad);
      const roiW = roiMaxX - roiMinX;
      const roiH = roiMaxY - roiMinY;

      if (roiW < 40 || roiH < 40) return;

      // Convert canvas ROI bounds back to native video coordinates using exact letterbox scaling
      const srcX = Math.max(0, (roiMinX - offsetX) / scale);
      const srcY = Math.max(0, (roiMinY - offsetY) / scale);
      const srcW = Math.min(vw - srcX, roiW / scale);
      const srcH = Math.min(vh - srcY, roiH / scale);

      if (srcW < 20 || srcH < 20) return;

      // Prepare offscreen canvas matching native video aspect ratio (prevents squashing/distortion)
      if (!roiCanvasRef.current) roiCanvasRef.current = document.createElement('canvas');
      const roiCanvas = roiCanvasRef.current;
      roiCanvas.width = Math.round(srcW);
      roiCanvas.height = Math.round(srcH);
      const roiCtx = roiCanvas.getContext('2d');
      roiCtx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, roiCanvas.width, roiCanvas.height);

      // AI & Optical Placement Detection
      const rawCandidates = [];

      // 1. Neural Network Detection on Full Video (full perspective context)
      try {
        const fullPredictions = (await aiModel.detect(video, 20, 0.22)) || [];
        for (const fp of fullPredictions) {
          if (ignoredClasses.has(fp.class)) continue;
          const [vx, vy, vwBox, vhBox] = fp.bbox;
          const candX = Math.round(offsetX + vx * scale);
          const candY = Math.round(offsetY + vy * scale);
          const candW = Math.round(vwBox * scale);
          const candH = Math.round(vhBox * scale);

          // Reject candidates that span more than 65% of the Red Tag area (hallucinations covering entire floor)
          if (candW > roiW * 0.65 || candH > roiH * 0.65) continue;

          const candCenterX = Math.round(candX + candW / 2);
          const candBaseY = Math.round(candY + candH);
          const basePoint = { x: candCenterX, y: candBaseY };

          if (isPointInPolygon(basePoint, activePoly)) {
            rawCandidates.push({
              class: fp.class,
              score: fp.score,
              x: candX,
              y: candY,
              width: candW,
              height: candH,
              centerX: candCenterX,
              centerY: Math.round(candY + candH / 2),
              basePoint,
              rawBox: null
            });
          }
        }
      } catch (e) {}

      // 2. Neural Network Detection on Cropped Red Tag ROI Canvas
      try {
        const roiPredictions = (await aiModel.detect(roiCanvas, 10, 0.22)) || [];
        for (const rp of roiPredictions) {
          if (ignoredClasses.has(rp.class)) continue;
          const [cx, cy, cwBox, chBox] = rp.bbox;
          const candW = Math.round((cwBox / roiCanvas.width) * roiW);
          const candH = Math.round((chBox / roiCanvas.height) * roiH);

          // Reject boxes covering more than 65% of the Red Tag Area
          if (candW > roiW * 0.65 || candH > roiH * 0.65) continue;

          const candX = Math.round(roiMinX + (cx / roiCanvas.width) * roiW);
          const candY = Math.round(roiMinY + (cy / roiCanvas.height) * roiH);
          const candCenterX = Math.round(candX + candW / 2);
          const candBaseY = Math.round(candY + candH);
          const basePoint = { x: candCenterX, y: candBaseY };

          if (isPointInPolygon(basePoint, activePoly)) {
            rawCandidates.push({
              class: rp.class,
              score: rp.score,
              x: candX,
              y: candY,
              width: candW,
              height: candH,
              centerX: candCenterX,
              centerY: Math.round(candY + candH / 2),
              basePoint,
              rawBox: null
            });
          }
        }
      } catch (e) {}

      // 3. Physical Floor Object Segmenter (Reliably detects multiple boxes, blocks, tools, and industrial parts)
      const floorObjs = detectFloorObjects(roiCtx, roiCanvas, roiMinX, roiMinY, roiW, roiH, activePoly);
      for (const floorObj of floorObjs) {
        rawCandidates.push(floorObj);
      }

      // Include manual objects if placed inside polygon
      for (const m of manualObjectsRef.current) {
        const mBase = { x: Math.round(m.x + m.width / 2), y: Math.round(m.y + m.height) };
        if (isPointInPolygon(mBase, activePoly)) {
          rawCandidates.push({
            class: m.label || 'Placed Item',
            score: 0.95,
            x: m.x,
            y: m.y,
            width: m.width,
            height: m.height,
            centerX: Math.round(m.x + m.width / 2),
            centerY: Math.round(m.y + m.height / 2),
            basePoint: mBase,
            rawBox: null
          });
        }
      }

      // Non-Maximum Suppression (NMS): collapse multiple overlapping frames into ONE clean box
      const candidates = [];
      rawCandidates.sort((a, b) => b.score - a.score);
      for (const cand of rawCandidates) {
        const isOverlap = candidates.some(existing => {
          const xA = Math.max(cand.x, existing.x);
          const yA = Math.max(cand.y, existing.y);
          const xB = Math.min(cand.x + cand.width, existing.x + existing.width);
          const yB = Math.min(cand.y + cand.height, existing.y + existing.height);
          const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
          const boxAArea = cand.width * cand.height;
          const boxBArea = existing.width * existing.height;
          const iou = interArea / (boxAArea + boxBArea - interArea);
          const dist = Math.hypot(cand.centerX - existing.centerX, cand.centerY - existing.centerY);
          return iou > 0.35 || dist < 15;
        });
        if (!isOverlap) {
          candidates.push(cand);
        }
      }

      // Section 6: Multi-Feature Object Association (IoU >= 0.25 or Center Distance <= 90px)
      const now = Date.now();
      const currentTrackers = trackersRef.current;
      const matchedTrackerIds = new Set();

      for (const cand of candidates) {
        let bestMatch = null;
        let highestIou = 0;
        let minDistance = 90; // 90px distance threshold

        for (const tr of currentTrackers) {
          if (matchedTrackerIds.has(tr.id)) continue;

          // Compute IoU
          const xA = Math.max(cand.x, tr.x);
          const yA = Math.max(cand.y, tr.y);
          const xB = Math.min(cand.x + cand.width, tr.x + tr.width);
          const yB = Math.min(cand.y + cand.height, tr.y + tr.height);
          const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
          const boxAArea = cand.width * cand.height;
          const boxBArea = tr.width * tr.height;
          const unionArea = boxAArea + boxBArea - interArea;
          const iou = unionArea > 0 ? interArea / unionArea : 0;

          const d = Math.hypot(cand.centerX - tr.centerX, cand.centerY - tr.centerY);

          // For already confirmed/debounced objects, use generous spatial match
          const iouThresh = tr.debounced ? 0.15 : 0.25;
          const distThresh = tr.debounced ? 90 : 75;

          if (iou >= iouThresh && iou > highestIou) {
            highestIou = iou;
            bestMatch = tr;
          } else if (highestIou === 0 && d < distThresh && d < minDistance) {
            minDistance = d;
            bestMatch = tr;
          }
        }

        if (bestMatch) {
          matchedTrackerIds.add(bestMatch.id);
          bestMatch.lastSeen = now;

          // Section 80 & 84: If this object is already confirmed/PRESENT, keep state PRESENT and DO NOT re-confirm
          if (bestMatch.debounced) {
            bestMatch.state = 'PRESENT';
            // Slight coordinate smoothing
            bestMatch.x = Math.round(bestMatch.x * 0.7 + cand.x * 0.3);
            bestMatch.y = Math.round(bestMatch.y * 0.7 + cand.y * 0.3);
            bestMatch.width = Math.round(bestMatch.width * 0.7 + cand.width * 0.3);
            bestMatch.height = Math.round(bestMatch.height * 0.7 + cand.height * 0.3);
            bestMatch.centerX = Math.round(bestMatch.x + bestMatch.width / 2);
            bestMatch.centerY = Math.round(bestMatch.y + bestMatch.height / 2);
            continue;
          }

          const distMoved = Math.hypot(cand.centerX - bestMatch.centerX, cand.centerY - bestMatch.centerY);

          // Section 1: Stationary object jitter filtering
          // Minor jitter (<= 45px) must NOT reset stationary timer!
          // Only true continuous physical displacement (> 60px) flags moving & resets confirmation
          if (distMoved > 60) {
            bestMatch.stationaryStart = now;
            bestMatch.isMoving = true;
          } else {
            bestMatch.isMoving = false;
          }

          // Smooth coordinate update
          bestMatch.x = Math.round(bestMatch.x * 0.35 + cand.x * 0.65);
          bestMatch.y = Math.round(bestMatch.y * 0.35 + cand.y * 0.65);
          bestMatch.width = Math.round(bestMatch.width * 0.35 + cand.width * 0.65);
          bestMatch.height = Math.round(bestMatch.height * 0.35 + cand.height * 0.65);
          bestMatch.centerX = Math.round(bestMatch.x + bestMatch.width / 2);
          bestMatch.centerY = Math.round(bestMatch.y + bestMatch.height / 2);

          // Preserve highest confidence label
          bestMatch.currentClass = cand.class;
          bestMatch.currentScore = cand.score;
          if (cand.score > bestMatch.bestScore) {
            bestMatch.bestClass = cand.class;
            bestMatch.bestScore = cand.score;
          }
          if (cand.rawBox) bestMatch.rawBox = cand.rawBox;

          // Section 10: Collect candidate frames during PLACEMENT_CONFIRMING
          if (video && video.readyState >= 2) {
            if (!bestMatch.candidateFrames) bestMatch.candidateFrames = [];
            if (bestMatch.candidateFrames.length < 8 && (now - (bestMatch.lastCandidateTime || 0) >= 250)) {
              bestMatch.lastCandidateTime = now;
              const candCrop = cropTargetObjectOnly(video, bestMatch, 15);
              if (candCrop) {
                bestMatch.candidateFrames.push({
                  cropDataUrl: candCrop.dataUrl,
                  confidence: bestMatch.bestScore || 0.90,
                  sharpness: candCrop.sharpness || 10,
                  score: ((bestMatch.bestScore || 0.9) * 40) + ((candCrop.sharpness || 10) * 0.3) + 20,
                  timestamp: now
                });
              }
            }
          }
        } else {
          // New object entered scene (Section 4 & 7: Assign TRACK-xxx ID)
          const newId = nextTrackerId.current++;
          const formattedId = `TRACK-${String(newId).padStart(3, '0')}`;
          matchedTrackerIds.add(newId);

          const newTracker = {
            id: newId,
            objectId: formattedId,
            x: cand.x,
            y: cand.y,
            width: cand.width,
            height: cand.height,
            centerX: cand.centerX,
            centerY: cand.centerY,
            bestClass: cand.class,
            bestScore: cand.score,
            currentClass: cand.class,
            currentScore: cand.score,
            firstSeen: now,
            stationaryStart: now,
            lastSeen: now,
            debounced: false,
            isMoving: false,
            rawBox: cand.rawBox,
            candidateFrames: [],
            lastCandidateTime: 0,
            state: 'PLACEMENT_CONFIRMING'
          };

          // Capture initial candidate frame
          if (video && video.readyState >= 2) {
            const candCrop = cropTargetObjectOnly(video, newTracker, 15);
            if (candCrop) {
              newTracker.candidateFrames.push({
                cropDataUrl: candCrop.dataUrl,
                confidence: cand.score || 0.90,
                sharpness: candCrop.sharpness || 10,
                score: ((cand.score || 0.9) * 40) + ((candCrop.sharpness || 10) * 0.3) + 20,
                timestamp: now
              });
              newTracker.lastCandidateTime = now;
            }
          }

          console.log(`[TRACKING] ${formattedId} created for new object: ${cand.class}`);
          currentTrackers.push(newTracker);
        }
      }

      // Section 22: Prune trackers.
      // For unconfirmed objects: prune after 2500ms absence.
      // For confirmed PRESENT objects: DO NOT prune on temporary camera misses/noise!
      // Keep PRESENT objects permanently on floor until explicit removal or 45s sustained absence.
      trackersRef.current = currentTrackers.filter(tr => {
        const timeSinceSeen = now - tr.lastSeen;
        if (!tr.debounced) {
          return timeSinceSeen < 2500;
        }
        if (timeSinceSeen >= 45000) {
          console.log(`[TRACKING] ${tr.objectId} removed after sustained ${timeSinceSeen}ms absence`);
          fetch('/api/vision/object-removed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ objectId: tr.objectId, label: tr.bestClass })
          }).catch(() => {});
          return false;
        }
        return true;
      });

    } catch (err) {
      console.warn('Detection inference error:', err);
    } finally {
      isDetectingRef.current = false;
    }
  };

  // 60 FPS Continuous Render & Tracking Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let frameCount = 0;
    let lastFpsCalc = Date.now();

    const render = () => {
      frameCount++;
      const now = Date.now();
      if (now - lastFpsCalc >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsCalc = now;
      }

      const w = canvas.width;
      const h = canvas.height;

      // 1. Live Camera Stream vs Standby
      if (cameraActive) {
        ctx.clearRect(0, 0, w, h);

        // Run AI inference asynchronously every 100ms without blocking rendering
        if (now - lastDetectTimeRef.current >= 100) {
          lastDetectTimeRef.current = now;
          performAiDetection();
        }

        // Section 1: MIN_OBJECT_PERSISTENCE_MS = 5000ms strictly for all placements
        const targetPersistenceMs = 5000;
        const activePoly = calibrationModeRef.current === 'draw' ? drawPointsRef.current : polygonVerticesRef.current;

        for (const tracker of trackersRef.current) {
          tracker.targetPersistenceMs = targetPersistenceMs;
          // Section 12: Object base point on floor (x_center, y_bottom)
          const basePoint = { x: tracker.centerX, y: tracker.y + tracker.height };
          const inside = isPointInPolygon(basePoint, activePoly);
          tracker.inside = inside;
          tracker.footprint = basePoint;

          if (!inside) {
            // Section 2: Detector Miss Grace Period (OBJECT_MISSED_GRACE_MS = 1500ms)
            // If missed for < 1500ms, DO NOT reset confirmation timer!
            if ((now - tracker.lastSeen) > 1500) {
              tracker.stationaryStart = now;
              tracker.stationaryDuration = 0;
              tracker.debounceProgress = 0;
            }
            continue;
          }

          // Section 5 & 18: Existing confirmed objects stay PRESENT without re-confirming
          if (tracker.debounced) {
            tracker.state = 'PRESENT';
            continue;
          }

          tracker.state = 'PLACEMENT_CONFIRMING';
          const stationaryDuration = Math.max(0, now - tracker.stationaryStart);
          tracker.stationaryDuration = stationaryDuration;
          tracker.debounceProgress = Math.min(100, (stationaryDuration / targetPersistenceMs) * 100);

          // Section 1: If stationary inside polygon for full 5.0 seconds, confirm placement!
          if (stationaryDuration >= targetPersistenceMs && !tracker.debounced) {
            tracker.debounced = true;
            tracker.state = 'PRESENT';
            console.log(`[PLACEMENT] ${tracker.objectId} persistence = 5000/5000 ms`);
            console.log(`[PLACEMENT] ${tracker.objectId} placement confirmed`);

            // Section 10 & 11: Best frame selection from temporary buffer
            const imageBase64 = selectBestFrameCrop(tracker);
            const token = activeTokenRef.current;
            const isAuth = !!(token && token.is_authorized);
            tracker.authorized = isAuth;

            fetch('/api/vision/placement-confirmed', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                objectType: tracker.bestClass,
                box: { x: tracker.x, y: tracker.y, width: tracker.width, height: tracker.height },
                confidence: tracker.bestScore,
                imageBase64,
                objectId: tracker.objectId
              })
            })
              .then(r => r.json())
              .then(data => {
                if (data?.event) {
                  tracker.objectId = data.object_id || data.event.object_id || tracker.objectId;
                  tracker.authorized = (data.event.authorization_status === 'AUTHORIZED');
                  tracker.state = data.object_state || 'PRESENT';

                  // CRITICAL: Suppress duplicate alerts for already-registered stationary objects
                  if (data.event.alreadyRecorded || data.event.alreadyAuthorized || data.event.alert_status === 'NO_ALERT') {
                    console.log(`[TRACKING] Object ${tracker.objectId} already registered. Suppressing duplicate alert.`);
                    return;
                  }

                  if (tracker.authorized) {
                    sounds.playAuthorized();
                  } else {
                    sounds.playUnauthorizedAlert();
                    onUnauthorizedAlertRef.current?.({
                      eventId: data.event.id,
                      objectId: tracker.objectId,
                      event: data.event,
                      timestamp: data.event.timestamp,
                      reason: data.event.authorization_status,
                      rfidStatus: data.event.authorization_status,
                      employeeStatus: data.event.employee_name ? `${data.event.employee_name} (${data.event.authorization_status})` : 'NOT SCANNED / UNKNOWN',
                      objectType: data.event.object_type,
                      confidence: data.event.confidence,
                      area: 'Red Tag Area (Physical Floor Tape Polygon)',
                      evidenceImage: data.event.evidence_image,
                      notes: data.event.notes
                    });
                  }
                }
              })
              .catch(e => console.warn('Placement API error:', e));
          }
        }
      } else {
        // Standby Screen
        ctx.fillStyle = '#0a0d14';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
        ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = '600 14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('CAMERA FEED STANDBY', w / 2, h / 2 - 20);
        ctx.font = '400 11px Inter, sans-serif';
        ctx.fillStyle = '#475569';
        ctx.fillText('Click "Connect Camera" above to start live surveillance', w / 2, h / 2 + 6);
        ctx.textAlign = 'left';
      }

      // 2. Draw Manually Configured Red Tag Area Polygon
      const activePoly = calibrationModeRef.current === 'draw' ? drawPointsRef.current : polygonVerticesRef.current;
      if (activePoly && activePoly.length >= 2) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(activePoly[0].x, activePoly[0].y);
        for (let i = 1; i < activePoly.length; i++) {
          ctx.lineTo(activePoly[i].x, activePoly[i].y);
        }
        if (calibrationModeRef.current !== 'draw') ctx.closePath();

        // Polygon Fill
        ctx.fillStyle = calibrationModeRef.current !== 'none' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.1)';
        ctx.fill();

        // Dual Floor Tape Border
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Vertices Handles
        activePoly.forEach((v, idx) => {
          ctx.fillStyle = calibrationModeRef.current !== 'none' ? '#38bdf8' : (idx % 2 === 0 ? '#ef4444' : '#3b82f6');
          ctx.beginPath();
          ctx.arc(v.x, v.y, calibrationModeRef.current !== 'none' ? 8 : 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          if (calibrationModeRef.current !== 'none') {
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 9px JetBrains Mono, monospace';
            ctx.fillText(`P${idx + 1}`, v.x + 8, v.y + 4);
          }
        });

        // Polygon Header Tag
        if (activePoly.length >= 3 && calibrationModeRef.current === 'none') {
          ctx.fillStyle = '#991b1b';
          ctx.fillRect(activePoly[0].x + 6, activePoly[0].y - 20, 210, 20);
          ctx.fillStyle = '#ffffff';
          ctx.font = '700 10px Inter, sans-serif';
          ctx.fillText('🔴 RED TAG AREA (USER CONFIGURED)', activePoly[0].x + 10, activePoly[0].y - 6);
        }

        ctx.restore();
      }

      // 3. Draw Tracked Physical Objects Strictly Inside Red Tag Area Only (Section 33)
      if (cameraActive && trackersRef.current.length > 0) {
        trackersRef.current.filter(t => t.inside).forEach((tracker) => {
          ctx.save();
          const { x, y, width, height, footprint, inside, debounced, debounceProgress, stationaryDuration, isMoving } = tracker;
          const isAuthorized = !!(tracker.authorized && tracker.debounced);

          // Object Bounding Box (Green for Authorized, Red for Unauthorized, Amber for Confirming)
          ctx.strokeStyle = inside
            ? (isAuthorized ? '#10b981' : (debounced ? '#ef4444' : '#f59e0b'))
            : 'rgba(148, 163, 184, 0.4)';
          ctx.lineWidth = inside ? (isAuthorized ? 3 : 2.5) : 1.5;
          ctx.strokeRect(x, y, width, height);

          // Section 33: Label Pill with TRACK ID
          const labelText = isAuthorized
            ? `● ${tracker.objectId}: ${tracker.bestClass.toUpperCase()} (AUTHORIZED)`
            : (debounced
                ? `🚨 ${tracker.objectId}: ${tracker.bestClass.toUpperCase()} (UNAUTHORIZED)`
                : `NEW ${tracker.objectId}: ${tracker.bestClass.toUpperCase()}`);
          ctx.font = '700 10px JetBrains Mono, monospace';
          const textMetrics = ctx.measureText(labelText);
          const pillWidth = Math.max(100, textMetrics.width + 14);

          ctx.fillStyle = inside
            ? (isAuthorized ? '#059669' : (debounced ? '#dc2626' : '#d97706'))
            : '#334155';
          ctx.fillRect(x, y - 18, pillWidth, 18);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(labelText, x + 6, y - 5);

          // Bottom-Center Footprint Point P_footprint (Section 12)
          ctx.fillStyle = inside
            ? (isAuthorized ? '#10b981' : (debounced ? '#ef4444' : '#f59e0b'))
            : '#64748b';
          ctx.beginPath();
          ctx.arc(footprint.x, footprint.y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Footprint Coordinate Tag
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(footprint.x - 65, footprint.y + 6, 130, 16);
          ctx.fillStyle = inside ? (isAuthorized ? '#34d399' : '#38bdf8') : '#94a3b8';
          ctx.font = '600 8.5px JetBrains Mono, monospace';
          ctx.fillText(inside ? (isAuthorized ? `AUTH: [${Math.round(footprint.x)}, ${Math.round(footprint.y)}]` : `BASE: [${Math.round(footprint.x)}, ${Math.round(footprint.y)}]`) : 'OUTSIDE RED TAG', footprint.x - 60, footprint.y + 18);

          // Section 33: Placement-Confirmation Progress for NEW objects
          if (inside && !debounced) {
            const radius = 24;
            const ringCenterX = footprint.x;
            const ringCenterY = footprint.y - 18;

            if (isMoving) {
              ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(ringCenterX, ringCenterY, radius, 0, Math.PI * 2);
              ctx.stroke();

              ctx.fillStyle = '#f87171';
              ctx.font = '700 9px JetBrains Mono, monospace';
              ctx.fillText('Moving', ringCenterX - 18, ringCenterY + 3);
            } else {
              // Smooth circular countdown
              const startAngle = -Math.PI / 2;
              const progressAngle = startAngle + (Math.PI * 2 * (debounceProgress / 100));

              ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.arc(ringCenterX, ringCenterY, radius, 0, Math.PI * 2);
              ctx.stroke();

              ctx.strokeStyle = '#f59e0b';
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.arc(ringCenterX, ringCenterY, radius, startAngle, progressAngle);
              ctx.stroke();

              ctx.fillStyle = '#fef08a';
              ctx.font = '700 9px JetBrains Mono, monospace';
              const sec = ((stationaryDuration || 0) / 1000).toFixed(1);
              ctx.fillText(`Confirmation: ${sec} / 5.0s`, ringCenterX - 60, ringCenterY + 38);
            }
          } else if (inside && debounced) {
            // Section 33: Confirmed object permanent status banner
            if (isAuthorized) {
              ctx.fillStyle = '#059669';
              ctx.fillRect(footprint.x - 75, footprint.y - 32, 150, 20);
              ctx.fillStyle = '#ffffff';
              ctx.font = '700 9px JetBrains Mono, monospace';
              ctx.fillText(`● ${tracker.objectId}: AUTHORIZED`, footprint.x - 70, footprint.y - 18);
            } else {
              ctx.fillStyle = '#dc2626';
              ctx.fillRect(footprint.x - 75, footprint.y - 32, 150, 20);
              ctx.fillStyle = '#ffffff';
              ctx.font = '700 9px JetBrains Mono, monospace';
              ctx.fillText(`● ${tracker.objectId}: UNAUTHORIZED`, footprint.x - 70, footprint.y - 18);
            }
          }

          ctx.restore();
        });
      }

      // HUD Operational Status Banner
      let statusLabel = 'MONITORING';
      let statusText = '#34d399';
      let statusBorder = '#10b981';

      const hasUnauthorized = trackersRef.current.some(t => t.inside && t.debounced && !t.authorized);
      const hasAuthorized = trackersRef.current.some(t => t.inside && t.debounced && t.authorized);
      const hasConfirming = trackersRef.current.some(t => t.inside && !t.debounced);
      const hasTracked = trackersRef.current.length > 0;

      if (unauthorizedAlertRef.current || hasUnauthorized) {
        statusLabel = '🚨 UNAUTHORIZED PLACEMENT';
        statusText = '#fee2e2';
        statusBorder = '#ef4444';
      } else if (activeTokenRef.current && activeTokenRef.current.is_authorized) {
        statusLabel = 'PLACEMENT AUTHORIZED (READY)';
        statusText = '#a7f3d0';
        statusBorder = '#34d399';
      } else if (hasAuthorized) {
        statusLabel = 'AUTHORIZED OBJECT PRESENT';
        statusText = '#a7f3d0';
        statusBorder = '#10b981';
      } else if (hasConfirming) {
        statusLabel = 'PLACEMENT CONFIRMING';
        statusText = '#fef08a';
        statusBorder = '#f59e0b';
      } else if (hasTracked) {
        statusLabel = 'OBJECT DETECTED';
        statusText = '#93c5fd';
        statusBorder = '#3b82f6';
      }

      // Draw Status Pill (Top Left)
      ctx.save();
      ctx.fillStyle = 'rgba(15, 20, 28, 0.85)';
      ctx.strokeStyle = statusBorder;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(14, 14, 220, 28, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = statusText;
      ctx.font = '700 9.5px JetBrains Mono, monospace';
      ctx.fillText(`● ${statusLabel}`, 24, 32);
      ctx.restore();

      // Camera Stream Metadata (Top Right)
      if (cameraActive) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(w - 180, 10, 170, 48);
        ctx.fillStyle = '#10b981';
        ctx.font = '600 10px JetBrains Mono, monospace';
        ctx.fillText('LIVE CCTV STREAM', w - 170, 26);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`${new Date().toLocaleTimeString()} • ${fps} FPS`, w - 170, 44);
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [cameraActive, isPointInPolygon]);

  // Interactive Corner Dragging (Pointer Events)
  const handleStartDrag = (idx, e) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;

    const onPointerMove = (moveEv) => {
      const rect = container.getBoundingClientRect();
      const pctX = Math.max(0.01, Math.min(0.99, (moveEv.clientX - rect.left) / rect.width));
      const pctY = Math.max(0.01, Math.min(0.99, (moveEv.clientY - rect.top) / rect.height));
      const newX = Math.round(pctX * 640);
      const newY = Math.round(pctY * 480);

      setPolygonVertices(prev => {
        const copy = [...prev];
        copy[idx] = { x: newX, y: newY };
        return copy;
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setPolygonVertices(curr => {
        if (onPolygonChange) onPolygonChange(curr);
        return curr;
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const nudgeVertex = (idx, dx, dy) => {
    setPolygonVertices(prev => {
      const copy = [...prev];
      copy[idx] = {
        x: Math.max(10, Math.min(630, copy[idx].x + dx)),
        y: Math.max(10, Math.min(470, copy[idx].y + dy))
      };
      if (onPolygonChange) onPolygonChange(copy);
      return copy;
    });
  };

  const handleContainerClick = (e) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pctX = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width));
    const pctY = Math.max(0.01, Math.min(0.99, (e.clientY - rect.top) / rect.height));
    const x = Math.round(pctX * 640);
    const y = Math.round(pctY * 480);

    if (calibrationMode === 'draw') {
      setDrawPoints(prev => [...prev, { x, y }]);
    } else if (calibrationMode === 'none') {
      // If clicked inside the polygon, mark an item immediately
      if (isPointInPolygon({ x, y })) {
        const newItem = {
          id: `manual_${Date.now()}`,
          label: 'Placed Item',
          score: 95,
          x: Math.max(10, x - 35),
          y: Math.max(10, y - 40),
          width: 70,
          height: 60
        };
        setManualObjects(prev => [newItem, ...prev.slice(0, 2)]);
      }
    }
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      boxShadow: 'var(--shadow-card)'
    }}>
      {/* Header Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Video size={18} color="#ef4444" />
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>
            Live CCTV Feed & Manual Red Tag Area
          </h2>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Camera Selector & Refresh */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {videoDevices.length > 0 ? (
              <select
                value={selectedDeviceId}
                onChange={(e) => handleDeviceChange(e.target.value)}
                style={{
                  padding: '5px 8px',
                  fontSize: '0.72rem',
                  borderRadius: '6px',
                  background: 'var(--bg-surface)',
                  color: '#38bdf8',
                  border: '1px solid var(--border-subtle)',
                  maxWidth: '180px'
                }}>
                {videoDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            ) : null}

            <button
              onClick={refreshDevices}
              title="Scan for connected cameras"
              style={{
                padding: '5px 7px',
                borderRadius: '6px',
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center'
              }}>
              <RefreshCw size={12} />
            </button>
          </div>

          {/* Connect / Disconnect Camera Button */}
          {!cameraActive ? (
            <button
              onClick={() => startCamera()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '6px',
                background: '#10b981',
                color: '#ffffff'
              }}>
              <Camera size={14} />
              Connect Camera
            </button>
          ) : (
            <button
              onClick={stopCamera}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '0.75rem',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}>
              Disconnect Camera
            </button>
          )}

          {/* Quick Mark Placement Button */}
          {cameraActive && calibrationMode === 'none' && (
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => {
                  const centerX = Math.round(polygonVertices.reduce((acc, v) => acc + v.x, 0) / polygonVertices.length);
                  const centerY = Math.round(polygonVertices.reduce((acc, v) => acc + v.y, 0) / polygonVertices.length);
                  const newItem = {
                    id: `manual_${Date.now()}`,
                    label: 'Floor Item',
                    score: 95,
                    x: Math.max(10, centerX - 35),
                    y: Math.max(10, centerY - 30),
                    width: 70,
                    height: 60
                  };
                  setManualObjects([newItem]);
                }}
                title="Mark an object placement in Red Tag Area"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.3)'
                }}>
                <span>📦 Mark Placed Item</span>
              </button>
              <button
                onClick={() => {
                  trackersRef.current = [];
                  setManualObjects([]);
                  floorBaselineRef.current = null;
                  baselineFramesCount.current = 0;
                  onUnauthorizedAlertRef.current?.(null);
                  fetch('/api/vision/clear-objects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).catch(() => {});
                }}
                title="Clear all active object frames and re-zero floor baseline"
                style={{
                  padding: '5px 8px',
                  fontSize: '0.7rem',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  cursor: 'pointer'
                }}>
                Clear Frames
              </button>
              <button
                onClick={() => {
                  floorBaselineRef.current = null;
                  baselineFramesCount.current = 0;
                  trackersRef.current = [];
                  onUnauthorizedAlertRef.current?.(null);
                }}
                title="Re-zero and calibrate the empty floor reference"
                style={{
                  padding: '5px 8px',
                  fontSize: '0.7rem',
                  borderRadius: '6px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: '#93c5fd',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  cursor: 'pointer'
                }}>
                🎯 Zero Empty Floor
              </button>
            </div>
          )}

          {/* Manual Red Tag Calibration Controls */}
          {calibrationMode === 'none' ? (
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setCalibrationMode('drag')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 10px',
                  fontSize: '0.72rem',
                  borderRadius: '6px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.3)'
                }}>
                <Crosshair size={12} />
                Adjust Corners
              </button>

              <button
                onClick={() => {
                  setCalibrationMode('draw');
                  setDrawPoints([]);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 10px',
                  fontSize: '0.72rem',
                  borderRadius: '6px',
                  background: 'rgba(168, 85, 247, 0.15)',
                  color: '#c084fc',
                  border: '1px solid rgba(168, 85, 247, 0.3)'
                }}>
                <PenTool size={12} />
                Draw New Area
              </button>
            </div>
          ) : calibrationMode === 'drag' ? (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => savePolygon()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 12px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  background: '#10b981',
                  color: '#ffffff'
                }}>
                <Check size={13} />
                Save Area
              </button>
              <button
                onClick={() => setCalibrationMode('none')}
                style={{
                  padding: '5px 10px',
                  fontSize: '0.72rem',
                  borderRadius: '6px',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)'
                }}>
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                disabled={drawPoints.length < 3}
                onClick={() => savePolygon(drawPoints)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 12px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  background: drawPoints.length >= 3 ? '#10b981' : '#334155',
                  color: '#ffffff'
                }}>
                <Check size={13} />
                Finish ({drawPoints.length} pts)
              </button>
              <button
                onClick={() => setDrawPoints([])}
                style={{
                  padding: '5px 10px',
                  fontSize: '0.72rem',
                  borderRadius: '6px',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)'
                }}>
                Clear
              </button>
              <button
                onClick={() => setCalibrationMode('none')}
                style={{
                  padding: '5px 10px',
                  fontSize: '0.72rem',
                  borderRadius: '6px',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)'
                }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Real-Time Alarm Banner */}
      {(unauthorizedAlert || trackersRef.current.some(t => t.inside && t.debounced && !t.authorized)) && (
        <div className="animate-alarm" style={{
          padding: '12px 18px',
          borderRadius: '8px',
          background: 'rgba(220, 38, 38, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          border: '1.5px solid #ef4444'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={24} color="#ef4444" />
            <div>
              <strong style={{ color: '#f87171', fontSize: '0.92rem' }}>
                🚨 UNAUTHORIZED PLACEMENT VERIFIED!
              </strong>
              <div style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                {unauthorizedAlert?.notes || 'Object detected inside Red Tag Area without valid RFID clearance.'}
              </div>
            </div>
          </div>
          <button
            onClick={() => onUnauthorizedAlertRef.current?.(null)}
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid #ef4444',
              color: '#fee2e2',
              borderRadius: '6px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 600
            }}>
            Dismiss Alert
          </button>
        </div>
      )}

      {/* Camera Error Alert */}
      {cameraError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '0.78rem',
          color: '#f87171',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle size={16} />
          <span>{cameraError}</span>
        </div>
      )}

      {/* Section 76 Polygon Validation Error */}
      {polygonError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '0.75rem',
          color: '#f87171',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px'
        }}>
          <span>⚠ [Section 76] Invalid Red Tag Polygon: {polygonError}</span>
          <button onClick={() => setPolygonError(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}>✕</button>
        </div>
      )}

      {/* Manual Setup Guidance Banner */}
      {calibrationMode === 'drag' && (
        <div style={{
          background: 'rgba(59, 130, 246, 0.15)',
          border: '1px solid rgba(59, 130, 246, 0.4)',
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '0.76rem',
          color: '#93c5fd',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>📐 Drag vertices (P1, P2, P3, P4) on the camera stream to define your Red Tag Area boundary.</span>
          <span style={{ fontWeight: 600 }}>Drag mode active</span>
        </div>
      )}

      {calibrationMode === 'drag' && (
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          background: 'var(--bg-surface)',
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '0.74rem', color: '#93c5fd', fontWeight: 600 }}>Precision Nudge:</span>
          {polygonVertices.map((v, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'var(--bg-card)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.72rem', color: i % 2 === 0 ? '#f87171' : '#60a5fa', fontWeight: 700, marginRight: '4px' }}>P{i+1}</span>
              <button onClick={() => nudgeVertex(i, 0, -10)} title="Move Up" style={{ padding: '2px 5px', fontSize: '0.68rem', borderRadius: '3px', background: '#334155', color: '#fff' }}>▲</button>
              <button onClick={() => nudgeVertex(i, 0, 10)} title="Move Down" style={{ padding: '2px 5px', fontSize: '0.68rem', borderRadius: '3px', background: '#334155', color: '#fff' }}>▼</button>
              <button onClick={() => nudgeVertex(i, -10, 0)} title="Move Left" style={{ padding: '2px 5px', fontSize: '0.68rem', borderRadius: '3px', background: '#334155', color: '#fff' }}>◀</button>
              <button onClick={() => nudgeVertex(i, 10, 0)} title="Move Right" style={{ padding: '2px 5px', fontSize: '0.68rem', borderRadius: '3px', background: '#334155', color: '#fff' }}>▶</button>
            </div>
          ))}
        </div>
      )}

      {calibrationMode === 'draw' && (
        <div style={{
          background: 'rgba(168, 85, 247, 0.15)',
          border: '1px solid rgba(168, 85, 247, 0.4)',
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '0.76rem',
          color: '#d8b4fe',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>✏️ Click anywhere on the video stream to drop boundary points ({drawPoints.length} clicked). Click 'Finish' when done.</span>
          <span style={{ fontWeight: 600 }}>Click to place points</span>
        </div>
      )}

      {/* Live Video & AI Overlay Viewport */}
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 3',
          maxHeight: '480px',
          background: '#090d14',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          border: calibrationMode !== 'none' ? '2px solid #38bdf8' : '1px solid var(--border-subtle)',
          cursor: calibrationMode === 'draw' ? 'crosshair' : (calibrationMode === 'drag' ? 'crosshair' : 'pointer')
        }}>
        {/* Real Live Hardware Video Element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: cameraActive ? 'block' : 'none'
          }}
        />

        {/* AI Bounding Box & Polygon Overlay Canvas */}
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
            pointerEvents: 'none'
          }}
        />

        {/* Draggable Corner Handle Pins */}
        {calibrationMode === 'drag' && polygonVertices.map((v, i) => (
          <div
            key={i}
            onPointerDown={(e) => handleStartDrag(i, e)}
            style={{
              position: 'absolute',
              left: `${(v.x / 640) * 100}%`,
              top: `${(v.y / 480) * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: i % 2 === 0 ? '#ef4444' : '#3b82f6',
              border: '3px solid #ffffff',
              boxShadow: '0 0 14px rgba(0,0,0,0.85), 0 0 8px #38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'grab',
              userSelect: 'none',
              zIndex: 35,
              touchAction: 'none'
            }}
            title={`Drag Corner P${i + 1} [${v.x}, ${v.y}]`}
          >
            P{i + 1}
          </div>
        ))}

        {/* Floating Privacy Notice */}
        <div style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          background: 'rgba(9, 13, 20, 0.85)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '6px',
          padding: '4px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '0.7rem',
          color: '#34d399'
        }}>
          <ShieldCheck size={12} />
          <span>Zero-Human Privacy: Only placed objects inside your Red Tag area are cropped.</span>
        </div>
      </div>

      {/* Footprint & Area Coordinates */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        padding: '0 4px',
        flexWrap: 'wrap',
        gap: '6px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Footprints size={14} color="#38bdf8" />
          <span>Active Red Tag Area: </span>
          <code style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
            {polygonVertices.length} Boundary Points Defined
          </code>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={14} color="#f59e0b" />
          <span>Stationary Filter: </span>
          <span style={{ color: '#10b981', fontWeight: 600 }}>5.0s Debouncing Engine Active</span>
        </div>
      </div>
    </div>
  );
}
