import { Database } from 'bun:sqlite';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../../gateway.sqlite');

export const db = new Database(dbPath, { create: true });

// Enable WAL mode for better concurrency
db.exec('PRAGMA journal_mode = WAL;');
