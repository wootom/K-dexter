
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export class HonoSSETransport implements Transport {
    private stream: any;
    public sessionId: string;
    onmessage?: (message: JSONRPCMessage) => void;
    onclose?: () => void;
    onerror?: (error: Error) => void;

    constructor(stream: any, sessionId: string) {
        this.stream = stream;
        this.sessionId = sessionId;
    }

    async start(): Promise<void> {
        console.log(`[Transport] Started session: ${this.sessionId}`);
        // Send the endpoint URL event as required by MCP SSE spec
        // The client expects an event 'endpoint' with data containing the POST URL
        await this.stream.writeSSE({
            event: 'endpoint',
            data: `/mcp/messages?sessionId=${this.sessionId}`,
        });
    }

    async send(message: JSONRPCMessage): Promise<void> {
        await this.stream.writeSSE({
            event: 'message',
            data: JSON.stringify(message),
        });
    }

    async close(): Promise<void> {
        console.log(`[Transport] Closed session: ${this.sessionId}`);
        this.onclose?.();
    }

    handleMessage(message: JSONRPCMessage) {
        if (this.onmessage) {
            this.onmessage(message);
        }
    }
}
