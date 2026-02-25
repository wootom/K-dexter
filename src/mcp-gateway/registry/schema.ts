
import { db } from '../db.js';

export function initializeRegistrySchema() {
    db.run(`
        CREATE TABLE IF NOT EXISTS mcp_servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            transport_type TEXT NOT NULL, -- 'stdio', 'sse'
            config TEXT NOT NULL,         -- JSON string of connection details
            status TEXT DEFAULT 'active', -- 'active', 'inactive', 'error'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS mcp_tools (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            input_schema TEXT, -- JSON string of tool schema
            FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE,
            UNIQUE(server_id, name)
        );
    `);

    console.log('✅ Registry Schema Initialized');
}
