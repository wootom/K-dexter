
import { db } from '../db.js';

export interface ApiKey {
    id: number;
    key: string;
    role: string;
    name: string;
    is_active: boolean;
}

export class PolicyService {

    // Verify an API Key and return the associated user data
    static verifyApiKey(key: string): ApiKey | null {
        const stmt = db.prepare("SELECT * FROM api_keys WHERE key = ? AND is_active = 1");
        const row = stmt.get(key) as ApiKey | undefined;
        return row || null;
    }

    // Create a new API Key (Admin only typically, or via API)
    static createApiKey(name: string, role: string): string {
        const key = `sk-${crypto.randomUUID()}`;
        db.run("INSERT INTO api_keys (key, name, role) VALUES (?, ?, ?)", [key, name, role]);
        return key;
    }

    // Check if a role can access a specific tool
    // Resource Format: "server_name:tool_name"
    static canAccess(role: string, serverName: string, toolName: string): boolean {
        // 1. Check direct match
        const resource = `${serverName}:${toolName}`;

        // Query policies for this role
        // Ordered by specificity (exact match > wildcard > catch-all) could be complex in SQL
        // Simplify: Fetch all 'allow' policies for role and check match in JS
        const policies = db.query("SELECT resource FROM policies WHERE role = ? AND action = 'allow'").all(role) as { resource: string }[];

        for (const policy of policies) {
            if (PolicyService.matches(policy.resource, resource)) {
                return true;
            }
        }

        return false;
    }

    // Simple wildcard matching
    // pattern: "*" -> matches anything
    // pattern: "google:*" -> matches "google:search", "google:maps"
    // pattern: "google:search" -> matches exactly "google:search"
    private static matches(pattern: string, target: string): boolean {
        if (pattern === '*') return true;

        const [pServer, pTool] = pattern.split(':');
        const [tServer, tTool] = target.split(':');

        if (!pServer || !tServer) return false;

        const serverMatch = (pServer === '*' || pServer === tServer);
        const toolMatch = (pTool === '*' || pTool === tTool);

        return serverMatch && toolMatch;
    }
}
