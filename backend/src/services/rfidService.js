import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { getEmployeeByUID, getSetting, logEvent } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

class RFIDService {
  constructor() {
    this.port = null;
    this.parser = null;
    this.currentPortName = null;
    // ONE active token slot — Group L: repeated scans refresh rather than stack
    this.activeToken = null; // { uid, employee, scannedAt, expiresAt, status, consumed }
    this.io = null;
    this.tokenTimer = null;
    this.isConnected = false;
    this.lastScannedToken = null;
  }

  init(io) {
    this.io = io;
    // Group O: clear any lingering in-memory token on (re)start
    this.activeToken = null;
    this.lastScannedToken = null;
    const configuredPort = getSetting('serial_port');
    if (configuredPort) {
      this.connect(configuredPort);
    } else {
      console.log('ℹ️ No hardware serial port configured. RFID Scanner running in Virtual/Ready mode.');
    }
  }

  async listAvailablePorts() {
    try {
      const ports = await SerialPort.list();
      return ports.map(p => ({
        path: p.path,
        manufacturer: p.manufacturer || 'Unknown',
        serialNumber: p.serialNumber || 'N/A'
      }));
    } catch (err) {
      console.error('Error listing serial ports:', err.message);
      return [];
    }
  }

  async connect(portName, baudRate = 9600) {
    try {
      if (this.port && this.port.isOpen) {
        await new Promise(resolve => this.port.close(resolve));
      }

      console.log(`🔌 Attempting to connect to RFID reader on ${portName} @ ${baudRate} baud...`);
      this.port = new SerialPort({
        path: portName,
        baudRate: parseInt(baudRate, 10) || 9600,
        autoOpen: true
      });

      this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

      this.port.on('open', () => {
        this.isConnected = true;
        this.currentPortName = portName;
        console.log(`✅ RFID Reader hardware connected on ${portName}`);
        this.broadcastStatus();
      });

      this.port.on('close', () => {
        this.isConnected = false;
        console.log(`⚠️ RFID Reader disconnected from ${portName}`);
        this.broadcastStatus();
      });

      this.port.on('error', (err) => {
        console.warn(`⚠️ RFID Reader Serial Error: ${err.message}`);
        this.isConnected = false;
        this.broadcastStatus();
      });

      this.parser.on('data', (data) => {
        const raw = data.toString().trim();
        if (raw) {
          this.handleScan(raw, 'HARDWARE');
        }
      });

      return { success: true, port: portName };
    } catch (err) {
      console.warn(`Could not open serial port ${portName}: ${err.message}`);
      this.isConnected = false;
      this.broadcastStatus();
      return { success: false, error: err.message };
    }
  }

  handleScan(rawUID, source = 'HARDWARE') {
    const cleanUID = rawUID.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    console.log(`📡 RFID Scanned [${source}]: ${cleanUID}`);

    const employee = getEmployeeByUID(cleanUID);
    const now = Date.now();
    const authWindowMs = parseInt(getSetting('auth_window_ms') || process.env.RFID_AUTHORIZATION_WINDOW_MS || '60000', 10);

    let authStatus = 'UNKNOWN';
    let isAuthorized = false;

    if (!employee) {
      authStatus = 'UNKNOWN_CARD';
      isAuthorized = false;
    } else if (employee.is_authorized === 1) {
      authStatus = 'AUTHORIZED';
      isAuthorized = true;
    } else {
      authStatus = 'UNAUTHORIZED';
      isAuthorized = false;
    }

    // Group L: if the SAME UID is scanned again while an unconsumed token is still active,
    // refresh the expiry rather than creating a second token (one token per employee, not stacking).
    if (this.activeToken && this.activeToken.uid === cleanUID && !this.activeToken.consumed) {
      console.log(`🔄 [Group L] RFID token refreshed for ${cleanUID} — same card re-scanned.`);
      const refreshedExpiry = now + authWindowMs;
      this.activeToken.expires_at = refreshedExpiry;
      this.activeToken.scanned_at = now; // refresh scan timestamp for correlation window

      if (this.tokenTimer) clearTimeout(this.tokenTimer);
      this.tokenTimer = setTimeout(() => {
        if (this.activeToken && this.activeToken.uid === cleanUID) {
          console.log(`⏳ RFID Authorization token expired for ${cleanUID}`);
          this.activeToken = null;
          if (this.io) this.io.emit('rfid_token_expired', { uid: cleanUID, expired: true });
        }
      }, authWindowMs);

      if (this.io) {
        this.io.emit('rfid_scanned', {
          uid: cleanUID,
          employee: employee || null,
          auth_status: authStatus,
          is_authorized: isAuthorized,
          valid_until: this.activeToken.expires_at,
          duration_ms: authWindowMs,
          source,
          refreshed: true
        });
      }

      return {
        uid: cleanUID,
        employee,
        auth_status: authStatus,
        is_authorized: isAuthorized,
        activeToken: this.activeToken,
        refreshed: true
      };
    }

    // New scan (different card or first scan or previously consumed)
    if (this.tokenTimer) {
      clearTimeout(this.tokenTimer);
      this.tokenTimer = null;
    }

    // Group M: replace previous token so only the latest scan is used
    this.activeToken = {
      token_id: uuidv4(),
      uid: cleanUID,
      employee_id: employee ? employee.id : null,
      employee_name: employee ? employee.name : 'Unregistered Cardholder',
      department: employee ? employee.department : 'None',
      scanned_at: now,
      expires_at: now + authWindowMs,
      auth_status: authStatus,
      is_authorized: isAuthorized,
      consumed: false
    };
    this.lastScannedToken = { ...this.activeToken };

    this.tokenTimer = setTimeout(() => {
      if (this.activeToken && this.activeToken.uid === cleanUID) {
        console.log(`⏳ RFID Authorization token expired for ${cleanUID}`);
        this.activeToken = null;
        if (this.io) {
          this.io.emit('rfid_token_expired', { uid: cleanUID, expired: true });
        }
      }
    }, authWindowMs);

    // Log RFID scan event to DB
    const eventLog = logEvent({
      id: uuidv4(),
      event_type: 'RFID_SCAN',
      rfid_uid: cleanUID,
      employee_id: employee ? employee.id : null,
      employee_name: employee ? employee.name : 'Unknown',
      authorization_status: authStatus,
      alert_status: isAuthorized ? 'NO_ALERT' : 'UNAUTHORIZED_SCAN',
      time_difference: 0,
      notes: `Scanned via ${source}: ${employee ? employee.name : 'Unregistered card'} (${authStatus})`
    });

    // Parallel stream to Java Spatio-Temporal Correlation Engine (non-blocking)
    fetch('http://localhost:8080/api/rfid-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: cleanUID, source, is_authorized: isAuthorized })
    }).catch(() => {});

    if (this.io) {
      this.io.emit('rfid_scanned', {
        uid: cleanUID,
        employee: employee || null,
        auth_status: authStatus,
        is_authorized: isAuthorized,
        valid_until: isAuthorized ? this.activeToken.expires_at : null,
        duration_ms: authWindowMs,
        source,
        event: eventLog
      });
    }

    return {
      uid: cleanUID,
      employee,
      auth_status: authStatus,
      is_authorized: isAuthorized,
      activeToken: this.activeToken
    };
  }

  getActiveToken() {
    if (!this.activeToken) return null;
    const now = Date.now();
    if (now > this.activeToken.expires_at) {
      this.activeToken = null;
      return null;
    }
    return this.activeToken;
  }

  getLastScannedToken() {
    return this.lastScannedToken;
  }

  /**
   * Rule 10: ONE RFID SCAN = ONE PLACEMENT
   * Consume the active RFID authorization immediately upon authorized placement.
   */
  consumeToken() {
    const token = this.getActiveToken();
    if (token) {
      if (this.tokenTimer) {
        clearTimeout(this.tokenTimer);
        this.tokenTimer = null;
      }
      this.activeToken = null;
      if (this.lastScannedToken && this.lastScannedToken.token_id === token.token_id) {
        this.lastScannedToken.consumed = true;
      }
      console.log(`🎫 [RULE 10] RFID Token for ${token.uid} (${token.employee_name}) CONSUMED. Token is now void.`);
      if (this.io) {
        this.io.emit('rfid_token_expired', { uid: token.uid, consumed: true });
      }
    }
    return token;
  }

  broadcastStatus() {
    if (this.io) {
      this.io.emit('rfid_status', {
        connected: this.isConnected,
        port: this.currentPortName,
        activeToken: this.getActiveToken()
      });
    }
  }
}

export const rfidService = new RFIDService();
