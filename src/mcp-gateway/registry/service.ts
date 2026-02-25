
import { db } from '../db.js';

export type ServerTransport = 'stdio' | 'sse' | 'native';

export interface MCPServerConfig {
    // For Stdio
    command?: string;
    args?: string[];
    env?: Record<string, string>;

    // For SSE
    url?: string;
}

export interface MCPServer {
    id: number;
    name: string;
    transport_type: ServerTransport;
    config: MCPServerConfig;
    status: 'active' | 'inactive' | 'error';
    created_at: string;
}

export class RegistryService {
    static registerServer(name: string, type: ServerTransport, config: MCPServerConfig): number {
        const stmt = db.prepare(`
            INSERT INTO mcp_servers (name, transport_type, config)
            VALUES (?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
            transport_type = excluded.transport_type,
            config = excluded.config,
            updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `);

        const result = stmt.get(name, type, JSON.stringify(config)) as { id: number };
        return result.id;
    }

    static getServer(name: string): MCPServer | null {
        const row = db.query('SELECT * FROM mcp_servers WHERE name = ?').get(name) as any;
        if (!row) return null;

        return {
            ...row,
            config: JSON.parse(row.config)
        };
    }

    static getAllServers(): MCPServer[] {
        const rows = db.query('SELECT * FROM mcp_servers').all() as any[];
        return rows.map(row => ({
            ...row,
            config: JSON.parse(row.config)
        }));
    }

    static updateTools(serverId: number, tools: any[]) {
        db.transaction(() => {
            // Clear existing tools for this server to handle updates robustly
            db.run('DELETE FROM mcp_tools WHERE server_id = ?', [serverId]);

            const insert = db.prepare(`
                INSERT INTO mcp_tools (server_id, name, description, input_schema)
                VALUES (?, ?, ?, ?)
            `);

            for (const tool of tools) {
                insert.run(
                    serverId,
                    tool.name,
                    tool.description || '',
                    JSON.stringify(tool.inputSchema)
                );
            }
        })();
    }

    static getAllTools() {
        return db.query(`
            SELECT 
                t.name as tool_name, 
                t.description, 
                t.input_schema, 
                s.name as server_name,
                s.transport_type
            FROM mcp_tools t
            JOIN mcp_servers s ON t.server_id = s.id
            WHERE s.status = 'active'
        `).all().map((row: any) => ({
            ...row,
            input_schema: JSON.parse(row.input_schema)
        }));
    }
}
