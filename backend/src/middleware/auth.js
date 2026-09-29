import crypto from 'crypto';
import { getSetting } from '../db.js';

// Secret key for signing/validating sessions
const SESSION_SECRET = process.env.JWT_SECRET || process.env.ADMIN_SECRET || crypto.randomBytes(32).toString('hex');

// In-memory active admin sessions map: token -> { username, role, expiresAt }
const activeSessions = new Map();

// Helper to generate a secure random token
export function generateAdminToken(username = 'admin') {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
  activeSessions.set(token, {
    username,
    role: 'ADMIN',
    expiresAt
  });
  return { token, expiresAt };
}

// Helper to validate token
export function validateAdminToken(token) {
  if (!token) return null;
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
    return res.status(401).json({
      error: 'Unauthorized: Administrator access required.',
      code: 'ADMIN_AUTH_REQUIRED'
    });
  }

  req.user = session;
  next();
}
