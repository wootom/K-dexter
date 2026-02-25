
import { Hono } from 'hono';
import { LoggingService } from '../logging/service.js';

export const observabilityRoutes = new Hono();

// Get aggregated stats
observabilityRoutes.get('/stats', (c) => {
    try {
        const stats = LoggingService.getStats();
        return c.json(stats);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Get recent logs
observabilityRoutes.get('/logs', (c) => {
    try {
        const limit = parseInt(c.req.query('limit') || '50');
        const logs = LoggingService.getRecentLogs(limit);
        return c.json({ logs });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});
