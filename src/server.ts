import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { initializeRegistrySchema } from './mcp-gateway/registry/schema.js';
import { registryRoutes } from './mcp-gateway/api/routes.js';
import { mcpRoutes } from './mcp-gateway/api/mcp.js';
import { type AnalysisRequest, AnalysisRequestSchema } from './analysis/types.js';
import { analyze } from './analysis/scorer.js';
import { analyzeKrStock } from './tools/korea/analysis.js';

const PORT = parseInt(process.env.PORT || '3000');

console.log(`🚀 K-Dexter Gateway starting on port ${PORT}...`);

// 1. Initialize DB
initializeRegistrySchema();
import { initializePolicySchema } from './mcp-gateway/policy/schema.js';
initializePolicySchema();
import { initializeLogSchema } from './mcp-gateway/logging/service.js';
initializeLogSchema();

// 2. Setup Hono App
const app = new Hono();

app.use('*', logger());
app.use('*', cors());

// 3. Health Check
app.get('/health', (c) => c.text('OK'));

import { observabilityRoutes } from './mcp-gateway/api/observability.js';
import { toolCallRoutes } from './mcp-gateway/api/tool-call.js';

// 4. Mount MCP Routes
app.route('/api/registry', registryRoutes);
app.route('/api/observability', observabilityRoutes);
app.route('/api/tools', toolCallRoutes);
app.route('/mcp', mcpRoutes);

// 5. Existing K-Dexter Endpoint
app.post('/k-dexter/analyze', async (c) => {
    try {
        const body = await c.req.json();

        // Validate Input
        const parseResult = AnalysisRequestSchema.safeParse(body);
        if (!parseResult.success) {
            return c.json({ error: 'Invalid Request', details: parseResult.error }, 400);
        }

        const requestData: AnalysisRequest = parseResult.data;

        // Execute Logic
        const start = performance.now();
        const result = analyze(requestData);
        const end = performance.now();

        console.log(`[Analyzed] ${requestData.symbol} in ${(end - start).toFixed(2)}ms`);

        return c.json(result);

    } catch (e: any) {
        console.error('Server Error:', e);
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

// 6. NEW: Full Auto-Analysis Endpoint (KIS + Naver + TradeSignal)
// 종목코드만 입력하면 데이터 수집부터 매매 시그널까지 자동 처리
app.post('/k-dexter/analyze/kr', async (c) => {
    try {
        const body = await c.req.json();
        const { symbol } = body;

        if (!symbol || typeof symbol !== 'string') {
            return c.json({ error: 'Invalid Request', details: '"symbol" field is required (e.g., "005930")' }, 400);
        }

        const start = performance.now();
        // analyzeKrStock은 LangChain tool이므로 invoke로 호출
        const rawResult = await analyzeKrStock.invoke({ symbol });
        const end = performance.now();

        console.log(`[Auto-Analyzed KR] ${symbol} in ${(end - start).toFixed(2)}ms`);

        // rawResult는 JSON string이므로 파싱
        const result = JSON.parse(rawResult as string);
        return c.json(result);

    } catch (e: any) {
        console.error('Server Error:', e);
        return c.json({ error: 'Internal Server Error', details: e.message }, 500);
    }
});

// 6. Export for Bun
export default {
    port: PORT,
    fetch: app.fetch,
};
