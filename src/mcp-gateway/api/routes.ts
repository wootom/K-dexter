
import { Hono } from 'hono';
import { RegistryService, type MCPServerConfig, type ServerTransport } from '../registry/service.js';

export const registryRoutes = new Hono();

// List all servers
registryRoutes.get('/servers', (c) => {
    const servers = RegistryService.getAllServers();
    return c.json({ servers });
});

// Register a new server
registryRoutes.post('/servers', async (c) => {
    try {
        const body = await c.req.json();
        const { name, type, config } = body as { name: string, type: ServerTransport, config: MCPServerConfig };

        if (!name || !type || !config) {
            return c.json({ error: 'Missing required fields: name, type, config' }, 400);
        }

        const id = RegistryService.registerServer(name, type, config);
        return c.json({ success: true, id, message: `Server ${name} registered` });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Update tools for a server (This would ideally be done automatically by the gateway logic, but for MVP we allow manual push)
registryRoutes.post('/servers/:name/tools', async (c) => {
    try {
        const name = c.req.param('name');
        const body = await c.req.json();
        const { tools } = body as { tools: any[] };

        const server = RegistryService.getServer(name);
        if (!server) {
            return c.json({ error: 'Server not found' }, 404);
        }

        RegistryService.updateTools(server.id, tools);
        return c.json({ success: true, message: `Tools updated for ${name}` });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});
