import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../data/redtag.db');

const db = new Database(dbPath);
const r1 = db.prepare("UPDATE events SET evidence_image = 'evidence_1789957149777_28ef3f1a.jpg', confidence = 0.85 WHERE id = 'EVT-1789957149779-7009'").run();
const r2 = db.prepare("UPDATE events SET confidence = ROUND(confidence * 100, 2) WHERE confidence > 0 AND confidence <= 0.05").run();

console.log('Updated rows:', r1.changes, r2.changes);
console.log('Target row:', db.prepare("SELECT * FROM events WHERE id = 'EVT-1789957149779-7009'").get());
