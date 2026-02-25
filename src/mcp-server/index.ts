
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { analyzeKrStock } from "../tools/korea/analysis.js";

// Create server instance
const server = new Server(
    {
        name: "k-dexter-core",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);



// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "k_dexter_stock_analyze",
                description: "Analyze Korean stock data using K-Dexter Logic (Real-time KIS & Naver Data).",
                inputSchema: {
                    type: "object",
                    properties: {
                        ticker: {
                            type: "string",
                            description: "Stock Ticker Symbol (e.g. 005930)"
                        },
                    },
                    required: ["ticker"],
                },
            },
        ],
    };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "k_dexter_stock_analyze") {
        const ticker = String(request.params.arguments?.ticker);
        if (!ticker) {
            throw new Error("Ticker is required");
        }

        try {
            console.error(`[K-Dexter] Analyzing ${ticker}...`); // Log to stderr for Stdio

            // Use the real tool
            // analyzeKrStock returns a JSON string, need to parse it or return as text
            const result = await analyzeKrStock.invoke({ symbol: ticker });

            return {
                content: [
                    {
                        type: "text",
                        text: result,
                    },
                ],
            };
        } catch (error: any) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error analyzing ${ticker}: ${error.message}`,
                    },
                ],
                isError: true,
            };
        }
    }

    throw new Error("Tool not found");
});

// Start the server
async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("K-Dexter Core MCP Server running on Stdio");
}

run().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
