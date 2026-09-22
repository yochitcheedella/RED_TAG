# Real-Time Red Tag Area Surveillance & RFID Authorization System

An industrial-grade, full-stack edge monitoring solution for industrial Red Tag containment areas. Built strictly with **Node.js, Express, Socket.IO, SQLite, SerialPort, Sharp, and React (Vite)**. **Zero Python is used anywhere in this project.**

---

## 1. System Architecture & Information Flow

```text
               +-----------------------+
               |  RFID CARD (EMPLOYEE) |
               +-----------------------+
                           |
                           v
               +-----------------------+
               |  RFID READER HARDWARE |
               |  (Serial COM / TCP)   |
               +-----------------------+
                           |
                           | UID
                           v
          +----------------------------------+
          |         NODE.JS BACKEND          |
          |     EVENT CORRELATION ENGINE     |
          +----------------------------------+
            |                              |
            v                              v
+-----------------------+      +-----------------------+
|  TEMPORARY RFID AUTH  |      |     CCTV / CAMERA     |
|     WINDOW (60000ms)  |      |   (Logitech / RTSP)   |
+-----------------------+      +-----------------------+
            |                              |
            |                              v
            |                  +-----------------------+
            |                  |   OBJECT DETECTION    |
            |                  | (Real-time Lite AI)   |
            |                  +-----------------------+
            |                              |
            |                              v
            |                  +-----------------------+
            |                  |   RED TAG AREA ROI    |
            |                  | (Floor Tape Polygon)  |
            |                  +-----------------------+
            |                              |
            |                              v
            |                  +-----------------------+
            |                  |  PLACEMENT CONFIRMED  |
            |                  | (Multi-frame Debounce)|
            |                  +-----------------------+
            |                              |
            +--------------+---------------+
                           |
                           v
               +-----------------------+
               |  AUTHORIZATION CHECK  |
               +-----------------------+
                /                     \
               /                       \
        [AUTHORIZED]             [UNAUTHORIZED]
             |                          |
             v                          v
    +-----------------+        +-----------------+
    |  CONSUME TOKEN  |        |  SELECT BEST    |
    |    (RULE 10)    |        |     FRAME       |
    +-----------------+        +-----------------+
             |                          |
             v                          v
    +-----------------+        +-----------------+
    |    NO ALERT     |        |   STRICT OBJECT |
    |   LOG AUDIT     |        |     CROP + PAD  |
    +-----------------+        +-----------------+
             |                          |
             |                          v
             |                 +-----------------+
             |                 |  SAVE EVIDENCE  |
             |                 |  & TRIGGER SIREN|
             +-----------------+        |
                     |                  v
                     +--------> +-----------------+
                                | REACT DASHBOARD |
                                | & AUDIT LOG     |
                                +-----------------+
```

---

## 2. Core Business Logic & Acceptance Cases

The system enforces strict correlation between physical RFID card scans and CCTV visual confirmation:

* **CASE 1 — Authorized Employee + RFID Scanned:**
  1. Employee scans valid card (e.g. `A472198C`).
  2. Temporary authorization window opens (60000ms / 60 seconds sliding window).
  3. Object is placed inside the calibrated Red Tag Area ROI.
  4. CCTV confirms placement persistence.
  5. Result: **`AUTHORIZED_PLACEMENT`** (No alarm siren, token consumed, logged).

* **CASE 2 — Authorized Employee but Did NOT Scan RFID:**
  1. Object placed into Red Tag Area with no recent RFID badge scan.
  2. CCTV confirms placement persistence.
  3. Result: **`UNAUTHORIZED_PLACEMENT`** (Critical siren triggered, prominent alert banner displayed, object-only cropped evidence captured).

* **CASE 3 — Unauthorized Person / Card + Object Placed:**
  1. Unauthorized card scanned (e.g. `XYZ12345`).
  2. System marks card state as `UNAUTHORIZED`.
  3. Object placed into Red Tag Area.
  4. Result: **`UNAUTHORIZED_PLACEMENT`** (Siren triggered, alert banner displayed, object-only cropped evidence captured).

* **RULE 10 — One RFID Scan = One Placement:**
  1. Each valid RFID authorization authorizes strictly **one** object placement.
  2. When matched with an object placement, the authorization token is immediately consumed.
  3. If a second object is placed without scanning the card again, it is flagged as **`UNAUTHORIZED_PLACEMENT`** (`TOKEN_ALREADY_CONSUMED`).

---

## 3. Strict Zero-Human Privacy Architecture

* **Never identify people from camera:** Employee identification is derived **exclusively** from the RFID reader.
* **No Facial Recognition:** The computer vision pipeline does not detect, recognize, or store face data or biometric vectors.
* **Pedestrian Pathway Suppression:** People or AGV robots moving through the pathway outside the Red Tag Area boundary are completely ignored.
* **Strict Object-Only Bounding Box Crop:** When an unauthorized placement occurs, the full CCTV frame is discarded. Sharp extracts strictly the coordinates of the detected object with a 20px padding.

---

## 4. Technology Stack

* **Backend:** Node.js (v20+), Express.js
* **Event Broker:** Socket.IO for real-time WebSocket dashboard sync
* **Database:** SQLite (WAL mode) via `better-sqlite3`
* **RFID Reader:** `serialport` for RS-232 / USB COM-port readers + TCP socket on port 9090
* **Image Processing:** `sharp` for fast native object-only evidence extraction
* **Frontend:** React 19, Vite, Lucide Icons, Web Audio API (Siren synthesizer)
* **On-Edge Computer Vision:** TensorFlow.js + Lite MobileNet COCO-SSD

---

## 5. Quick Start & Installation

### Prerequisites
* Node.js v20 or higher
* Modern Web Browser (Chrome / Edge recommended)
* Optional Hardware: USB Webcam (e.g. Logitech C920) and/or USB RFID Reader

### Installation Steps

1. **Clone or navigate to the project directory:**
   ```bash
   cd c:/Users/yochi/OneDrive/Desktop/REDTAG
   ```

2. **Install Backend Dependencies:**
   ```bash
   cd backend
   npm install
   ```

3. **Install Frontend Dependencies:**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Configure Environment:**
   Copy `.env.example` to `.env` in both root and backend directories. Adjust settings as needed:
   ```env
   APP_MODE=test
   PORT=3001
   RFID_PORT=COM3
   RFID_BAUD_RATE=9600
   RFID_AUTHORIZATION_WINDOW_MS=60000
   MIN_OBJECT_PERSISTENCE_MS=800
   ```

5. **Start All Services in Parallel (Recommended):**
   Run a single unified command from the project root to launch the Java Engine, Node.js Backend, and React Frontend concurrently:
   ```bash
   npm run dev
   # Or on Windows PowerShell:
   .\start-all.ps1
   # Or on Linux / macOS:
   ./start-all.sh
   ```

   * **Java Engine & TCP RFID:** [`http://localhost:8080`](http://localhost:8080) & `tcp://localhost:9090`
   * **Node.js Backend & API:** [`http://localhost:3001`](http://localhost:3001)
   * **React Dashboard:** [`http://localhost:5173`](http://localhost:5173)

   *Alternatively, run services individually in separate terminals:*
   * Backend: `cd backend && npm run dev`
   * Frontend: `cd frontend && npm run dev`
   * Java Service: `java -cp java-service/bin com.redtag.Main`

---

## 6. Dual Operational Modes

The system provides a top-level mode switch:

### 1. Development / Test Mode (`APP_MODE=test`)
Used for testing and demonstration without waiting for hardware installation. It simulates real events through the **exact same internal backend event pipeline**:
* `[TEST RFID AUTHORIZED]`: Simulates employee badge `A472198C`.
* `[TEST RFID UNAUTHORIZED]`: Simulates unauthorized card `XYZ12345`.
* `[TEST OBJECT PLACEMENT]`: Simulates placement detection inside the Red Tag Area.
* `[TEST AUTHORIZED PLACEMENT]`: Automated composite test (Scan $\to$ Place $\to$ Authorized).
* `[TEST UNAUTHORIZED PLACEMENT]`: Automated composite test (Place without scan $\to$ Alert + Evidence).
* Edge cases: 1-Scan 2-Placements, Pathway Movement, and Transient Crossing.

### 2. Production / Hardware Mode (`APP_MODE=hardware`)
Used in live factory deployment:
* Connects directly to hardware serial COM ports (e.g. `COM3` @ 9600 baud).
* Ingests live video feed from Logitech C920 USB webcam or RTSP camera stream.
* Disables simulation shortcuts and runs pure hardware event processing.

---

## 7. Running the Automated Acceptance Test Suite (10/10)

The project includes an automated test runner validating all 10 acceptance criteria defined in Section 41:

```bash
cd backend
node tests/acceptance_test.js
```

### Test Suite Execution Output
```text
===============================================================
🏁 RED TAG AREA MONITORING SYSTEM — ACCEPTANCE TEST SUITE (10/10)
===============================================================

▶ [TEST 1] Authorized RFID + Object Placement...
  ✅ PASS: Placement was AUTHORIZED with NO ALERT. (Time diff: 0s)

▶ [TEST 2] Authorized Employee but NO RFID Scanned + Object Placed...
  ✅ PASS: UNAUTHORIZED alert generated + Object evidence captured.

▶ [TEST 3] Unauthorized RFID (XYZ12345) + Object Placed...
  ✅ PASS: UNAUTHORIZED alert generated for unauthorized cardholder + Object evidence.

▶ [TEST 4] Authorized RFID scanned + No object placed (Wait for expiry)...
  ✅ PASS: Token expired peacefully after 60s window. Zero placement alerts generated.

▶ [TEST 5] Authorized RFID scanned + Expired + Object Placed...
  ✅ PASS: Placement after expiration triggered UNAUTHORIZED alert + Object evidence.

▶ [TEST 6] One RFID Scan = One Placement (Rule 10 & Case F)...
  ✅ PASS: Object 1 = AUTHORIZED, Object 2 = UNAUTHORIZED (Token Already Consumed).

▶ [TEST 7] Person walks through pedestrian pathway (outside ROI)...
  ✅ PASS: Pedestrian pathway movement completely ignored. Zero alerts generated.

▶ [TEST 8] Robot / AGV passes through pathway...
  ✅ PASS: Robot pathway traversal ignored. Zero alerts generated.

▶ [TEST 9] Object briefly crosses Red Tag ROI (< persistence threshold)...
  ✅ PASS: Transient object ignored by multi-frame persistence engine. Zero alerts.

▶ [TEST 10] Unauthorized placement evidence inspection (Strict Object Crop)...
  ✅ PASS: Evidence file exists. Cropped strictly to object coordinates.

===============================================================
SUMMARY: 10 / 10 TESTS PASSED (0 FAILED)
===============================================================
```

---

## 8. Hardware Connection Guide

### Connecting USB / Serial RFID Reader
1. Plug your 13.56 MHz / 125 kHz RFID reader into the computer's USB port.
2. Check Device Manager (Windows) or `ls /dev/ttyUSB*` (Linux) to identify the port (e.g. `COM3`).
3. In the Dashboard header, click the **Settings** gear icon.
4. Select the COM port and baud rate (default: `9600`) and click **Save Settings**.
5. The RFID indicator in the top header will update to `CONNECTED`.

### Connecting CCTV Camera
1. **USB Webcam (Logitech C920):** Plug into USB 3.0 port. Click **Connect Camera** on the live monitor. Select the Logitech device from the dropdown.
2. **RTSP IP Camera:** In Settings, set `Camera Mode` to `RTSP` and input your camera stream URL (e.g. `rtsp://admin:pass@192.168.1.108:554/Streaming/Channels/102`).

### Calibrating the Red Tag Floor Tape Area
1. On the live CCTV monitor, click **Adjust Corners**.
2. Drag vertices $P_1, P_2, P_3, P_4$ to match your physical red/blue floor boundary line.
3. Click **Save Coordinates**. The configuration is saved to `config/roi_config.json` and synchronized across all services.

---

## 9. Troubleshooting

| Issue | Root Cause | Solution |
|---|---|---|
| **No alerts when object is placed** | Object moved too fast or didn't meet persistence threshold (800ms). | Ensure object stays stationary inside the boundary for $\ge 800$ms. Check that the bottom contact point is inside the polygon. |
| **Camera video black / paused** | Browser permission blocked or video suspended. | Click "Connect Camera" and allow browser camera access. Select the correct camera device in the dropdown. |
| **RFID Reader shows Disconnected** | Hardware port busy or wrong COM port configured. | Go to Settings, click Refresh Ports, choose the correct COM port, and verify the baud rate matches your reader (9600 or 115200). In Test Mode, the reader functions in Virtual Ready mode. |
| **Audio siren muted** | Browser blocked autoplay or user muted siren. | Click the sound speaker icon in the top header to unmute audio. |
