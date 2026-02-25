
import { db } from '../db.js';

export interface CallLog {
    id: number;
    timestamp: string;
    session_id: string;
    role: string;
    server_name: string;
    tool_name: string;
    status: 'success' | 'error';
    latency_ms: number;
    error_message?: string;
}

export function initializeLogSchema() {
    db.run(`
        CREATE TABLE IF NOT EXISTS call_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            session_id TEXT,
            role TEXT,
            server_name TEXT,
            tool_name TEXT,
            status TEXT,
            latency_ms INTEGER,
            error_message TEXT
        );
    `);

    // Index for faster queries
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON call_logs(timestamp);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_server ON call_logs(server_name);`);

    console.log('✅ Logging Schema Initialized');
}

export class LoggingService {
    static logCall(
        sessionId: string,
        role: string,
        serverName: string,
        toolName: string,
        status: 'success' | 'error',
        latencyMs: number,
        errorMessage?: string
    ) {
        db.run(`
            INSERT INTO call_logs (session_id, role, server_name, tool_name, status, latency_ms, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [sessionId, role, serverName, toolName, status, latencyMs, errorMessage || null]);
    }

    static getStats() {
        // Total calls, Success Rate, Avg Latency
        const total = db.query('SELECT COUNT(*) as count FROM call_logs').get() as { count: number };
        const errors = db.query("SELECT COUNT(*) as count FROM call_logs WHERE status = 'error'").get() as { count: number };
        const latency = db.query('SELECT AVG(latency_ms) as avg_ms FROM call_logs').get() as { avg_ms: number };

        return {
            total_calls: total.count,
            error_count: errors.count,
            success_rate: total.count > 0 ? ((total.count - errors.count) / total.count * 100).toFixed(2) : 100,
            avg_latency_ms: latency.avg_ms || 0
        };
    }

    static getRecentLogs(limit = 50) {
        return db.query('SELECT * FROM call_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
    }
}
