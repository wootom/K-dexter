
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
    CallToolResultSchema,
    type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { RegistryService, type MCPServer } from "../registry/service.js";
import { PolicyService } from "../policy/service.js";
import { LoggingService } from "../logging/service.js";
import { getToolRegistry } from "../../tools/registry.js";

// Global map to hold active client connections to downstream servers
// Key: server_name, Value: Client instance
const downstreamClients = new Map<string, Client>();

export class GatewayService {

    // List all available tools from all registered servers, filtered by role
    async listTools(role: string = 'user') {
        const dbTools = RegistryService.getAllTools();
        console.log(`[Gateway] Discovery: Found ${dbTools.length} tools in DB.`);

        // Add Native Tools directly from source
        const nativeToolsRaw = getToolRegistry('native');
        console.log(`[Gateway] Discovery: Found ${nativeToolsRaw.length} native tools from registry.`);

        const nativeToolsFormatted = nativeToolsRaw.map(t => ({
            tool_name: t.name,
            description: t.description,
            input_schema: this.zodToJsonSchema((t.tool as any).schema),
            server_name: 'k-dexter-native',
            transport_type: 'native'
        }));

        const allTools = [...dbTools, ...nativeToolsFormatted];
        console.log(`[Gateway] Discovery: Total tools before filtering: ${allTools.length}`);

        // Filter based on policy
        const allowedTools = allTools.filter((t: any) => {
            const allowed = PolicyService.canAccess(role, t.server_name, t.tool_name);
            if (!allowed) {
                console.log(`[Gateway] Policy: Denied role '${role}' access to ${t.server_name}:${t.tool_name}`);
            } else {
                console.log(`[Gateway] Policy: Allowed role '${role}' access to ${t.server_name}:${t.tool_name}`);
            }
            return allowed;
        });

        console.log(`[Gateway] Returning ${allowedTools.length} tools to client for role: ${role}`);
        return allowedTools.map((t: any) => ({
            name: t.tool_name,
            description: t.description,
            inputSchema: t.input_schema,
        }));
    }

    private zodToJsonSchema(zodSchema: any): any {
        if (!zodSchema || !zodSchema._def) return { type: 'object', properties: {} };

        try {
            // LangChain tools created with tool() helper have the Zod schema in .schema
            const shape = zodSchema.shape;
            if (!shape) return { type: 'object', properties: {} };

            const properties: any = {};
            const required: string[] = [];

            for (const [key, value] of Object.entries(shape)) {
                const val = value as any;
                const typeName = val._def?.typeName;

                let type = 'string';
                if (typeName === 'ZodNumber') type = 'number';
                else if (typeName === 'ZodBoolean') type = 'boolean';
                else if (typeName === 'ZodEnum') type = 'string';

                properties[key] = {
                    type,
                    description: val.description || ''
                };

                // Zod uses Optional wrappers, if it's not optional it's required
                if (typeName !== 'ZodOptional' && !val.isOptional) {
                    required.push(key);
                }
            }

            return {
                type: 'object',
                properties,
                required: required.length > 0 ? required : undefined
            };
        } catch (e) {
            console.error(`[Gateway] Error converting Zod schema:`, e);
            return { type: 'object', properties: {} };
        }
    }

    // Handle a tool call request
    async callTool(toolName: string, args: any, role: string = 'user', sessionId: string = 'unknown'): Promise<CallToolResult> {
        console.log(`[Gateway] Received call for tool: ${toolName} from role: ${role}`);
        const startTime = performance.now();
        let serverName = 'unknown';

        try {
            // 1. Find which server owns this tool (Checking both DB and Native)
            const dbTools = RegistryService.getAllTools();
            const nativeToolsRaw = getToolRegistry('native');
            const nativeToolsFormatted = nativeToolsRaw.map(t => ({
                tool_name: t.name,
                server_name: 'k-dexter-native',
                transport_type: 'native'
            }));

            const allTools = [...dbTools, ...nativeToolsFormatted];
            const toolRecord = allTools.find((t: any) => t.tool_name === toolName);

            if (!toolRecord) {
                const latency = Math.round(performance.now() - startTime);
                LoggingService.logCall(sessionId, role, 'unknown', toolName, 'error', latency, `Tool not found: ${toolName}`);
                throw new Error(`Tool not found: ${toolName}`);
            }

            serverName = toolRecord.server_name;

            // 2. Check Permission
            if (!PolicyService.canAccess(role, serverName, toolName)) {
                const latency = Math.round(performance.now() - startTime);
                LoggingService.logCall(sessionId, role, serverName, toolName, 'error', latency, `Access Denied: Role '${role}'`);
                console.warn(`[Gateway] Access Denied for role ${role} to ${serverName}:${toolName}`);
                throw new Error(`Access Denied: Role '${role}' cannot access tool '${toolName}'`);
            }

            console.log(`[Gateway] Routing to server: ${serverName} (Transport: ${toolRecord.transport_type})`);

            // 3. Handle Native Tools directly
            if (toolRecord.transport_type === 'native') {
                const nativeTools = getToolRegistry('native'); // Pass a dummy model name
                const nativeTool = nativeTools.find(t => t.name === toolName);

                if (!nativeTool) {
                    throw new Error(`Native tool logic not found for ${toolName}`);
                }

                console.log(`[Gateway] Executing native tool: ${toolName}`);
                const result = await nativeTool.tool.invoke(args);

                const latency = Math.round(performance.now() - startTime);
                LoggingService.logCall(sessionId, role, serverName, toolName, 'success', latency);

                return {
                    content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }]
                };
            }

            // 4. Get or Create Client for that server
            let client = downstreamClients.get(serverName);
            if (!client) {
                console.log(`[Gateway] Connecting to downstream server: ${serverName}...`);
                try {
                    const serverConfig = RegistryService.getServer(serverName);
                    if (!serverConfig) throw new Error(`Server config not found for ${serverName}`);

                    client = await this.connectToDownstream(serverConfig);
                    downstreamClients.set(serverName, client);
                } catch (error) {
                    const latency = Math.round(performance.now() - startTime);
                    LoggingService.logCall(sessionId, role, serverName, toolName, 'error', latency, `Connection failed: ${(error as Error).message}`);
                    console.error(`[Gateway] Failed to connect to ${serverName}:`, error);
                    throw new Error(`Failed to connect to downstream server ${serverName}: ${error}`);
                }
            }

            // 5. Forward the call with Retry and Timeout
            const MAX_RETRIES = 2;
            const TIMEOUT_MS = 30000;
            let lastError;

            for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
                try {
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`Tool execution timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
                    );

                    console.log(`[Gateway] Calling tool ${toolName} on ${serverName} (Attempt ${attempt}/${MAX_RETRIES + 1})`);

                    // Race between tool execution and timeout
                    // We must type cast result because Promise.race returns unknown if types differ
                    const result = await Promise.race([
                        client.request(
                            {
                                method: "tools/call",
                                params: {
                                    name: toolName,
                                    arguments: args || {},
                                },
                            },
                            CallToolResultSchema
                        ),
                        timeoutPromise
                    ]);

                    const latency = Math.round(performance.now() - startTime);
                    LoggingService.logCall(sessionId, role, serverName, toolName, 'success', latency);
                    return result as CallToolResult;

                } catch (error) {
                    lastError = error;
                    console.warn(`[Gateway] Attempt ${attempt} failed for ${toolName}:`, error);

                    if (attempt <= MAX_RETRIES) {
                        await new Promise(r => setTimeout(r, 1000 * attempt)); // Backoff
                    }
                }
            }

            throw lastError;

        } catch (error) {
            const latency = Math.round(performance.now() - startTime);
            LoggingService.logCall(sessionId, role, serverName, toolName, 'error', latency, `Execution failed: ${(error as Error).message}`);
            console.error(`[Gateway] Error calling tool ${toolName} on ${serverName}:`, error);
            throw error;
        }
    }

    private async connectToDownstream(server: MCPServer): Promise<Client> {
        let transport;

        if (server.transport_type === 'stdio') {
            const command = (server.config as any).command;
            const args = (server.config as any).args || [];
            const env = (server.config as any).env || {};

            console.log(`[Gateway] Spawning Stdio transport: ${command} ${args.join(' ')}`);
            transport = new StdioClientTransport({
                command: command,
                args: args,
                env: { ...process.env, ...env },
            });
        } else if (server.transport_type === 'sse') {
            const url = (server.config as any).url;
            console.log(`[Gateway] Connecting to SSE transport: ${url}`);
            transport = new SSEClientTransport(new URL(url));
        } else if (server.transport_type === 'native') {
            throw new Error(`Native transport should be handled directly in callTool`);
        } else {
            throw new Error(`Unsupported transport type: ${server.transport_type}`);
        }

        const client = new Client(
            {
                name: "gateway-client",
                version: "1.0.0",
            },
            {
                capabilities: {},
            }
        );

        await client.connect(transport);
        console.log(`[Gateway] Connected to ${server.name}`);
        return client;
    }
}

export const gatewayService = new GatewayService();
