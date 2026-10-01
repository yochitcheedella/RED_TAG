import crypto from 'crypto';
import { getSetting } from '../db.js';

// Persistent secret key for signing/validating sessions
const SESSION_SECRET = process.env.JWT_SECRET || process.env.ADMIN_SECRET || 'redtag-super-secure-admin-secret-2026';

// In-memory active admin sessions map: token -> { username, role, expiresAt }
const activeSessions = new Map();

// Helper to generate a secure signed admin token
export function generateAdminToken(username = 'admin', role = 'admin') {
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
  const normalizedRole = (role || 'admin').toLowerCase();
  const payload = `${username}.${normalizedRole}.${expiresAt}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  const token = `rtg_${payload}.${sig}`;

  activeSessions.set(token, {
    username,
    role: normalizedRole,
    expiresAt
  });
  return { token, role: normalizedRole, expiresAt };
}

// Helper to validate token
export function validateAdminToken(token) {
  if (!token) return null;

  // 1. Validate signed HMAC token
  if (token.startsWith('rtg_')) {
    const raw = token.substring(4);
    const parts = raw.split('.');
    if (parts.length === 4) {
      const [username, role, expiresAtStr, sig] = parts;
      const expiresAt = parseInt(expiresAtStr, 10);
      if (Date.now() > expiresAt) return null;

      const payload = `${username}.${role}.${expiresAtStr}`;
      const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
      if (sig === expectedSig) {
        return { username, role: role.toLowerCase(), expiresAt };
      }
    } else if (parts.length === 3) {
      const [username, expiresAtStr, sig] = parts;
      const expiresAt = parseInt(expiresAtStr, 10);
      if (Date.now() > expiresAt) return null;

      const payload = `${username}.${expiresAtStr}`;
      const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
      if (sig === expectedSig) {
        return { username, role: 'admin', expiresAt };
      }
    }
  }

  // 2. Fallback to in-memory activeSessions map
  const session = activeSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

// Invalidate token on logout
export function revokeAdminToken(token) {
  if (token) activeSessions.delete(token);
}

// Verify credentials (against env or settings or default)
export function verifyCredentials(username, password) {
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || getSetting('admin_password') || 'admin123';

  if (!username || !password) return false;
  return username.trim() === expectedUser.trim() && password === expectedPass;
}

export function verifyOperatorCredentials(username, password) {
  const expectedUser = process.env.OPERATOR_USERNAME || 'operator';
  const expectedPass = process.env.OPERATOR_PASSWORD || getSetting('operator_password') || 'operator123';

  if (!username || !password) return false;
  return username.trim().toLowerCase() === expectedUser.trim().toLowerCase() && password === expectedPass;
}

// Express Middleware: Require Admin
export function requireAdmin(req, res, next) {
  let token = null;

  // 1. Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // 2. Check query parameter (needed for image requests like <img src="/evidence/x.jpg?token=...">)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  // 3. Check X-Admin-Token custom header
  if (!token && req.headers['x-admin-token']) {
    token = req.headers['x-admin-token'];
  }

  const session = validateAdminToken(token);
  if (!session) {
    // For local dashboard requests on localhost / 127.0.0.1
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1' || req.hostname === 'localhost';
    if (isLocal) {
      req.user = { username: 'local_admin', role: 'admin' };
      return next();
    }

    return res.status(401).json({
      error: 'Unauthorized: Administrator access required.',
      code: 'ADMIN_AUTH_REQUIRED'
    });
  }

  req.user = session;
  next();
}

// Express Middleware: Require Strict Admin (Operators are forbidden from destructive operations)
export function requireStrictAdmin(req, res, next) {
  requireAdmin(req, res, () => {
    const role = (req.user?.role || '').toLowerCase();
    if (role === 'operator') {
      return res.status(403).json({
        error: 'Forbidden: Operators do not have permission to delete records or modify system configurations.',
        code: 'ADMIN_ROLE_REQUIRED'
      });
    }
    next();
  });
}

