import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../data/redtag.db');

const db = new Database(dbPath);

console.log('--- PURGING DEMO & TEST DATA ---');

// 1. Delete dummy demo employees
const delEmp = db.prepare(`DELETE FROM employees WHERE id IN ('EMP-001', 'EMP-002', 'EMP-003') OR rfid_uid IN ('A472198C', 'B7214492', 'XYZ12345')`).run();
console.log(`Deleted dummy employees: ${delEmp.changes}`);

// 2. Clear test transaction tables
const delEvents = db.prepare('DELETE FROM events').run();
console.log(`Cleared events: ${delEvents.changes}`);

const delAlerts = db.prepare('DELETE FROM alerts').run();
console.log(`Cleared alerts: ${delAlerts.changes}`);

const delObjects = db.prepare('DELETE FROM objects').run();
console.log(`Cleared objects: ${delObjects.changes}`);

const delObjectEvents = db.prepare('DELETE FROM object_events').run();
console.log(`Cleared object_events: ${delObjectEvents.changes}`);

const delRfidEvents = db.prepare('DELETE FROM rfid_events').run();
console.log(`Cleared rfid_events: ${delRfidEvents.changes}`);

const delMailJobs = db.prepare('DELETE FROM mail_jobs').run();
console.log(`Cleared mail_jobs: ${delMailJobs.changes}`);

const delKiosk = db.prepare('DELETE FROM kiosk_registrations').run();
console.log(`Cleared kiosk_registrations: ${delKiosk.changes}`);

// Reset autoincrement sequence if any
try {
  db.prepare(`DELETE FROM sqlite_sequence WHERE name IN ('events', 'alerts', 'objects', 'mail_jobs')`).run();
} catch {}

// 3. Clear evidence image files
const evidenceDir = path.resolve(__dirname, '../uploads/evidence');
function clearDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const fullPath = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      clearDir(fullPath);
    } else if (ent.name !== '.gitkeep') {
      fs.unlinkSync(fullPath);
    }
  }
}
clearDir(evidenceDir);
console.log('Cleaned evidence uploads directory.');

// Ensure subdirectories exist
['authorized', 'unauthorized'].forEach(sub => {
  const p = path.join(evidenceDir, sub);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Display remaining valid data
const emps = db.prepare('SELECT id, rfid_uid, name, department, is_authorized FROM employees').all();
console.log('Remaining registered personnel:', emps);
console.log('--- PURGE COMPLETE ---');
