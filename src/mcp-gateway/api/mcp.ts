
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { gatewayService } from '../core/gateway.js';
import { HonoSSETransport } from '../core/transport.js';
import { PolicyService } from '../policy/service.js';

export const mcpRoutes = new Hono();

const activeSessions = new Map<string, { transport: HonoSSETransport, role: string }>();

// GET /sse - Start SSE connection
mcpRoutes.get('/sse', async (c) => {
    // 1. Authentication
    const authHeader = c.req.header('Authorization');
    const queryKey = c.req.query('apiKey');
    let apiKey = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.substring(7);
    } else if (queryKey) {
        apiKey = queryKey;
    }

    if (!apiKey) {
        return c.text('Unauthorized: Missing API Key', 401);
    }

    const user = PolicyService.verifyApiKey(apiKey);
    if (!user) {
        return c.text('Unauthorized: Invalid API Key', 401);
    }

    const sessionId = crypto.randomUUID();
    console.log(`[MCP] New connection request: ${sessionId} (User: ${user.name}, Role: ${user.role})`);

    return streamSSE(c, async (stream) => {
        const transport = new HonoSSETransport(stream, sessionId);
        activeSessions.set(sessionId, { transport, role: user.role });

        const server = new Server(
            {
                name: "k-dexter-gateway",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        // Connect shared handlers with Role Context
        server.setRequestHandler(ListToolsRequestSchema, async () => {
            return { tools: await gatewayService.listTools(user.role) };
        });

        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            return await gatewayService.callTool(request.params.name, request.params.arguments, user.role, sessionId);
        });

        await server.connect(transport);
        console.log(`[MCP] Server connected for ${sessionId}`);

        // Handle stream abort (client disconnect)
        stream.onAbort(() => {
            console.log(`[MCP] Connection aborted: ${sessionId}`);
            transport.close();
            activeSessions.delete(sessionId);
        });

        // Keep the connection open
        while (activeSessions.has(sessionId)) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    });
});

// POST /messages - Client sends JSON-RPC to server
mcpRoutes.post('/messages', async (c) => {
    const sessionId = c.req.query('sessionId');
    if (!sessionId) {
        return c.text('Session ID required', 400);
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
        return c.text('Session not found', 404);
    }

    try {
        const message = await c.req.json();
        // The transport handles the message, but the Server instance (connected to this transport)
        // will execute the handlers we defined above in the scope of /sse
        await session.transport.handleMessage(message);
        return c.text('Accepted', 202);
    } catch (e) {
        console.error(e);
        return c.text('Invalid JSON', 400);
    }
});
