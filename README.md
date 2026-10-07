# Red Tag Area Real-Time Surveillance & RFID Authorization System

[![Node.js](https://img.shields.io/badge/Node.js-v20+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-v19-61DAFB?style=flat&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-v6-646CFF?style=flat&logo=vite)](https://vitejs.dev)
[![SQLite](https://img.shields.io/badge/SQLite-WAL--Mode-003B57?style=flat&logo=sqlite)](https://sqlite.org)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-v4-010101?style=flat&logo=socket.io)](https://socket.io)
[![Tests Passing](https://img.shields.io/badge/Tests-152%2F152%20Passing-success)](backend/tests/)
[![Privacy Compliant](https://img.shields.io/badge/Compliance-Zero--Human%20Photo%20Standard-brightgreen)](#zero-human-privacy-architecture)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An enterprise edge IoT surveillance and inventory verification platform designed for industrial manufacturing and factory floor containment zones. The system enforces strict spatio-temporal correlation between physical RFID employee badges and computer vision CCTV item tracking to eliminate unauthorized scrap/quarantine dumping, enforce 5S safety compliance, and maintain a forensically auditable chain of custody.

---

## Table of Contents
- [Executive Overview](#executive-overview)
- [System Architecture](#system-architecture)
- [Core Functional Capabilities](#core-functional-capabilities)
- [3-Tier Role-Based Access Control (RBAC)](#3-tier-role-based-access-control-rbac)
- [Zero-Human Privacy Architecture](#zero-human-privacy-architecture)
- [Project Directory Structure](#project-directory-structure)
- [Quick Start Guide](#quick-start-guide)
- [Environment Configuration](#environment-configuration)
- [Hardware & Camera Integration](#hardware--camera-integration)
- [Automated Verification Test Suites (152/152 PASS)](#automated-verification-test-suites-152152-pass)
- [Security & Privacy Audit](#security--privacy-audit)

---

## Executive Overview

In modern manufacturing plants, the **Red Tag Area** designates a physical floor area bounded by floor tape where defective, excess, or quarantined parts are placed for evaluation. Standard facilities face significant regulatory risks from unauthorized item dumping, misplaced assets, and unverified personnel access.

This solution deploys an edge AI station with:
1. **Interactive Touch/Scan Kiosk**: Guides employees through rapid item registration and temporary RFID badge verification.
2. **CCTV Computer Vision Engine**: Continuously tracks object entries into the calibrated virtual floor boundary polygon.
3. **Spatio-Temporal Correlation Engine**: Binds visual drop events to valid RFID authorization tokens within a sliding time window (Rule: One RFID Scan = One Placement).
4. **Forensic Alert & Mail Queue Pipeline**: Instantly detects unannounced drops, captures privacy-compliant object crops, triggers audible sirens, and transmits automated email dispatches with forensic reports.

---

## System Architecture

```text
               +──────────────────────────+
               |  EMPLOYEE RFID BADGE     |
               +──────────────────────────+
                            │
                            │ Physical Swipe / Tap
                            ▼
               +──────────────────────────+
               |  USB / SERIAL RFID READER|
               |  (9600 Baud / COM Port)  |
               +──────────────────────────+
                            │
                            │ Raw Card UID
                            ▼
               +──────────────────────────+       +──────────────────────────+
               |     NODE.JS BACKEND      |       |  CCTV CAMERA FEED        |
               |  CORRELATION ENGINE      |       |  (Logitech C920 / RTSP)  |
               +──────────────────────────+       +──────────────────────────+
                 │                      │                       │
                 ▼                      │                       ▼
        +─────────────────+             │             +──────────────────+
        | TEMPORARY RFID  |             │             | EDGE VISION AI   |
        | AUTH TOKEN (60s)|             │             | OBJECT DETECTOR  |
        +─────────────────+             │             +──────────────────+
                 │                      │                       │
                 │                      │                       ▼
                 │                      │             +──────────────────+
                 │                      │             | VIRTUAL ROI      |
                 │                      │             | (Floor Polygon)  |
                 │                      │             +──────────────────+
                 │                      │                       │
                 │                      │                       ▼
                 │                      │             +──────────────────+
                 │                      │             | MULTI-FRAME      |
                 │                      │             | PERSISTENCE (5s) |
                 │                      │             +──────────────────+
                 │                      │                       │
                 ▼                      ▼                       ▼
            ┌────────────────────────────────────────────────────────┐
            │          SPATIO-TEMPORAL AUTHORIZATION CHECK           │
            └────────────────────────────────────────────────────────┘
                           /                           \
                          /                             \
                [AUTHORIZED]                       [UNAUTHORIZED]
                     │                                   │
                     ▼                                   ▼
          +──────────────────────+            +──────────────────────+
          | CONSUME TOKEN        |            | TRIGGER AUDIBLE SIREN|
          | (Rule 10 Enforced)   |            | SELECT BEST FRAME    |
          +──────────────────────+            +──────────────────────+
                     │                                   │
                     ▼                                   ▼
          +──────────────────────+            +──────────────────────+
          | LOG SUCCESSFUL DROP  |            | EXTRACT FORENSIC     |
          | SYNC REACT KIOSK     |            | PRIVACY OBJECT CROP  |
          +──────────────────────+            +──────────────────────+
                     │                                   │
                     │                                   ▼
                     │                        +──────────────────────+
                     │                        | ENQUEUE MAIL JOB     |
                     │                        | SMTP ALERT & ZIP LOG |
                     │                        +──────────────────────+
                     ▼                                   ▼
            ┌────────────────────────────────────────────────────────┐
            │               REACT 19 MONITORING PORTAL               │
            │      (Live CCTV, Placements, Events, Audit Log)        │
            └────────────────────────────────────────────────────────┘
```

---

## Core Functional Capabilities

- **Interactive Standby Kiosk**: Clean standby station that remains locked in a high-contrast state until a worker scans an authorized badge. Once scanned, the kiosk unlocks an item registration form, supports presets or custom duration intervals (minutes, hours, days), and prompts for physical placement.
- **Background Scan Collision Prevention**: Intelligent event suppression prevents modal inputs (such as Employee Login) from leaking keystrokes into background kiosk drop detection.
- **Live CCTV Polygon Calibration**: Drag-and-drop four-point polygon editor allowing operators to calibrate the exact floor-tape boundary directly on the live camera canvas.
- **Universal Date Range Filters**: Flexible date range selector (`Dates: [Start Date] To [End Date] [Show] [Reset]`) integrated consistently across all operational panels (Placements, Events, Audit Reports, Metrics, and User Dashboard).
- **Automated Forensic Mail Pipeline**: Built-in background queue service with automatic retry, deduplication, and attachment handling for unauthorized incidents.
- **Export & Compliance Suite**: Instant one-click generation of Microsoft Excel (`.xlsx`) audit workbooks and compliance ZIP bundles containing full incident logs and object evidence crops.

---

## 3-Tier Role-Based Access Control (RBAC)

The system enforces strict multi-tier role isolation across UI components and REST endpoints:

| Feature / Endpoint | Employee (`user`) | Supervisor (`supervisor`) | Administrator (`admin`) |
| :--- | :---: | :---: | :---: |
| **Kiosk Self-Service Placement** | Yes | Yes | Yes |
| **Personal Placement History** | Yes (Own Only) | Yes (Own Only) | Yes (Own Only) |
| **Live CCTV Surveillance** | No | Yes | Yes |
| **Global Placements Registry** | No | Yes | Yes |
| **Global Events & Incident Log** | No | Yes | Yes |
| **Floor ROI Calibration** | No | Yes | Yes |
| **User & RFID Card Management** | No | No | Yes |
| **Hardware & System Settings** | No | No | Yes |
| **Audit Report Generation** | No | No | Yes |
| **Mail Queue Manual Retries** | No | No | Yes |

---

## Zero-Human Privacy Architecture

Built from the ground up for strict industrial workplace privacy and worker protection:
1. **No Facial Recognition**: The computer vision pipeline classifies inanimate objects exclusively (packages, crates, bins, pallets, equipment). Facial detection models and biometric vector databases are strictly absent.
2. **Pedestrian Pathway Suppression**: Foot traffic and automated guided vehicles (AGVs) traversing adjacent pathways outside the calibrated floor polygon are actively discarded.
3. **Forensic Object-Only Cropping**: When an unauthorized placement occurs, the full CCTV video frame is discarded from permanent storage. An image processing pipeline (`sharp`) extracts only the bounded item coordinates with a calibrated 20px padding.
4. **Transient Cross Suppression**: Items that enter the boundary for less than the multi-frame persistence threshold (default 5000ms) trigger zero alerts.

---

## Project Directory Structure

```text
REDTAG/
├── backend/                         # Express.js REST API & Edge Event Broker
│   ├── data/                       # Local SQLite runtime database (Git-ignored)
│   ├── src/
│   │   ├── db.js                   # SQLite database schema, WAL pragma, and seeding
│   │   ├── middleware/             # JWT auth & RBAC validation middleware
│   │   ├── routes/                 # REST API endpoints (/api/auth, /api/placements, etc.)
│   │   ├── services/
│   │   │   ├── correlationEngine.js# Spatio-temporal event matcher
│   │   │   ├── mailQueueService.js # Resilient background email dispatch queue
│   │   │   ├── reportingService.js # Excel (.xlsx) & ZIP audit report generator
│   │   │   ├── rfidService.js      # Serial COM / USB RFID card reader driver
│   │   │   └── visionService.js    # Multi-frame persistence & ROI polygon evaluator
│   │   └── server.js               # HTTP & Socket.IO server entrypoint
│   └── tests/                      # Automated acceptance test suites
│       ├── acceptance_test.js      # 100 System acceptance test cases
│       ├── mail_pipeline_test.js   # 31 Email queue & delivery tests
│       └── rbac_acceptance_test.js # 21 Role-based access control tests
│
├── frontend/                        # React 19 + Vite Industrial Web Dashboard
│   ├── src/
│   │   ├── components/             # Reusable modular UI components
│   │   │   ├── AdminLoginModal.jsx # Unified 3-tier credentials/RFID login modal
│   │   │   ├── CCTVMonitor.jsx     # Live CCTV stream & ROI polygon editor
│   │   │   ├── DateRangeFilter.jsx # Reusable universal date range filter
│   │   │   ├── EventsManager.jsx   # Filterable events & unauthorized incidents table
│   │   │   ├── KioskView.jsx       # Standby placement station & registration form
│   │   │   ├── PlacementsManager.jsx# Active & historical item placements table
│   │   │   ├── ReportingPanel.jsx  # Audit log generation & manual email dispatch
│   │   │   ├── Sidebar.jsx         # Responsive RBAC-aware navigation bar
│   │   │   ├── UserDashboard.jsx   # Isolated employee self-service portal
│   │   │   └── UserManager.jsx     # Administrative user & RFID badge manager
│   │   ├── utils/                  # Date helpers, audio sirens, API clients
│   │   ├── App.jsx                 # Top-level state coordinator & routing
│   │   └── index.css               # Vanilla CSS design tokens & theme variables
│   └── package.json
│
├── config/
│   └── roi_config.json             # Calibrated 4-point floor polygon coordinates
├── scripts/
│   ├── create-zip.ps1              # Deployment packaging utility
│   └── generate_ppt.py             # System architecture slides generator
├── .env.example                    # Template environment configuration
├── .gitignore                      # Security-hardened exclusion rules
└── package.json                    # Workspace root orchestrator
```

---

## Quick Start Guide

### Prerequisites
- **Node.js** v20.0.0 or higher
- **npm** v10.0.0 or higher
- **Modern Browser** (Google Chrome or Microsoft Edge recommended)

### 1. Installation
Clone the repository and install all dependencies:
```bash
# Clone repository
git clone https://github.com/yochitcheedella/RED_TAG.git
cd RED_TAG

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
cd ..
```

### 2. Environment Setup
Copy the environment template in both the root and backend directories:
```bash
cp .env.example .env
cp .env.example backend/.env
```
*(Review the [Environment Configuration](#environment-configuration) section below to configure your ports and SMTP settings).*

### 3. Launch Development Server
Launch both the backend API server and frontend dashboard concurrently:
```bash
npm run dev
```

* **Frontend Dashboard & Kiosk:** [`http://localhost:5173`](http://localhost:5173)
* **Backend REST API & WebSocket:** [`http://localhost:3001`](http://localhost:3001)

---

## Environment Configuration

All configurable runtime options are managed via `.env`:

```env
# Operational Mode: 'test' (Simulated dev mode) or 'hardware' (Production sensors)
APP_MODE=test

# Server Port
PORT=3001

# RFID Reader Configuration (USB / Serial COM Port)
RFID_PORT=COM3
RFID_BAUD_RATE=9600

# RFID Authorization Window (Milliseconds before single-use token expires)
RFID_AUTHORIZATION_WINDOW_MS=60000

# Camera Source: 'webcam' (USB e.g. Logitech C920), 'rtsp', or 'simulator'
CAMERA_MODE=webcam
RTSP_URL=rtsp://admin:password@192.168.1.108:554/Streaming/Channels/102

# Computer Vision & Persistence Thresholds
MIN_OBJECT_PERSISTENCE_MS=5000
PERSISTENCE_FRAMES=4
CONFIDENCE_THRESHOLD=0.25

# Forensic Evidence Storage & Cropping
EVIDENCE_PADDING_PX=20
EVIDENCE_DIR=./uploads/evidence

# Alert System & Email Notifications
ENABLE_AUDIO_SIREN=true
TEAMS_WEBHOOK_URL=
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
ALERT_EMAIL_RECIPIENT=safety-admin@company.com
```

---

## Hardware & Camera Integration

### Connecting an RFID Card Reader
1. Connect any standard 13.56 MHz (Mifare) or 125 kHz (EM4100) USB RFID reader.
2. In the Admin Dashboard, navigate to **Settings** $\to$ **Hardware / RFID**.
3. Select your serial port (e.g. `COM3` on Windows, `/dev/ttyUSB0` on Linux) and baud rate (`9600`).
4. Once saved, the top header indicator will display **RFID CONNECTED**.

### Calibrating CCTV Floor Tape Boundary
1. Navigate to the **Live Monitor** tab.
2. Click **Adjust Corners** on the camera viewer.
3. Drag the four corner handles ($P_1, P_2, P_3, P_4$) to align precisely with the floor tape markings of the Red Tag zone.
4. Click **Save Coordinates**. Changes are permanently written to `config/roi_config.json` and broadcast to all connected clients in real time.

---

## Automated Verification Test Suites (152/152 PASS)

The repository includes a comprehensive, multi-layered automated verification suite:

### 1. System Acceptance Tests (100 Cases)
Validates all spatio-temporal rules, multi-object drops, duplicate scan handling, transient crossings, and evidence cropping:
```bash
node backend/tests/acceptance_test.js
# Result: 100 / 100 TESTS PASSED (0 FAILED)
```

### 2. Role-Based Access Control Tests (21 Cases)
Validates authentication, token signing, route protection, and data isolation across all 3 user roles:
```bash
node backend/tests/rbac_acceptance_test.js
# Result: 21 / 21 RBAC CHECKS PASSED (0 FAILED)
```

### 3. Mail Pipeline & Incident Reporting Tests (31 Cases)
Validates the asynchronous mail queue, disk evidence verification, timeline construction, deduplication, and manual retry:
```bash
node backend/tests/mail_pipeline_test.js
# Result: 31 / 31 MAIL PIPELINE TESTS PASSED (0 FAILED)
```

---

## Security & Privacy Audit

This repository conforms strictly to modern security standards:
- **Zero Exposed Secrets**: All passwords, API secrets, and email credentials reside strictly in Git-ignored `.env` files. Clean placeholders are provided in `.env.example`.
- **Database Isolation**: SQLite runtime database files (`*.db`, `*.db-shm`, `*.db-wal`, `*.sqlite`) are permanently excluded from Git history to prevent local data leakage.
- **Biometric & Facial Privacy**: The computer vision pipeline is architecturally prevented from processing or persisting human likenesses.
- **JWT Authorization**: All administrative and supervisor actions require cryptographically verified bearer tokens with role verification.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
