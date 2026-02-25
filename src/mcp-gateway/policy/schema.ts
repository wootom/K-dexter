
import { db } from '../db.js';

export function initializePolicySchema() {
    db.run(`
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,         -- e.g., "Agent A", "Dev User"
            role TEXT DEFAULT 'user',   -- e.g., 'admin', 'user', 'readonly'
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS policies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,         -- target role (e.g. 'user')
            resource TEXT NOT NULL,     -- 'server:tool' pattern (e.g. 'google:*', 'internal:db_query')
            action TEXT DEFAULT 'allow',-- 'allow', 'deny'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(role, resource)
        );
    `);

    // Seed default admin key if none exists (for testing/bootstrapping)
    const adminKey = db.query("SELECT * FROM api_keys WHERE role = 'admin'").get();
    if (!adminKey) {
        // In a real app, generate a secure random key. 
        // For this MVP/Demo, we use a static one but log it clearly.
        const defaultKey = "sk-admin-secret-key";
        db.run("INSERT INTO api_keys (key, name, role) VALUES (?, ?, ?)", [defaultKey, "Bootstrap Admin", "admin"]);
        console.log(`🔑 Created default admin API Key: ${defaultKey}`);
    }

    // Seed default policies
    // Admin gets access to everything (*)
    db.run("INSERT OR IGNORE INTO policies (role, resource, action) VALUES ('admin', '*', 'allow')");

    console.log('✅ Policy Schema Initialized');
}
