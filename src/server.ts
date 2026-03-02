import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import { initializeRegistrySchema } from './mcp-gateway/registry/schema.js';
import { registryRoutes } from './mcp-gateway/api/routes.js';
import { mcpRoutes } from './mcp-gateway/api/mcp.js';
import { type AnalysisRequest, AnalysisRequestSchema } from './analysis/types.js';
import { analyze } from './analysis/scorer.js';
import { analyzeKrStock } from './tools/korea/analysis.js';
import { analyzeUsStock } from './tools/us/analysis.js';
import {
    runBacktest,
    saveBacktestResult,
    loadBacktestResult,
    listBacktestResults,
    runParameterSweep,
    type BacktestConfig,
} from './backtest/index.js';

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

// 7. NEW: US Stock Full Analysis Endpoint
app.post('/k-dexter/analyze/us', async (c) => {
    try {
        const body = await c.req.json();
        const { symbol, exchange = 'NAS' } = body;

        if (!symbol || typeof symbol !== 'string') {
            return c.json({ error: 'Invalid Request', details: '"symbol" is required (e.g., "NVDA")' }, 400);
        }
        if (!['NAS', 'NYS', 'AMS'].includes(exchange)) {
            return c.json({ error: 'Invalid exchange', details: 'Must be NAS, NYS, or AMS' }, 400);
        }

        const start = performance.now();
        const rawResult = await analyzeUsStock.invoke({ symbol, exchange });
        const end = performance.now();

        console.log(`[Auto-Analyzed US] ${symbol} (${exchange}) in ${(end - start).toFixed(2)}ms`);

        const result = JSON.parse(rawResult as string);
        return c.json(result);

    } catch (e: any) {
        console.error('Server Error:', e);
        return c.json({ error: 'Internal Server Error', details: e.message }, 500);
    }
});

// 8. Static Dashboard
app.use('/dashboard/*', serveStatic({ root: './public' }));
app.get('/dashboard', (c) => c.redirect('/dashboard/index.html'));

// 9. Backtest Routes

// 9-1. 백테스트 실행
app.post('/k-dexter/backtest/run', async (c) => {
    try {
        const body = await c.req.json() as BacktestConfig;

        if (!body.universe || !Array.isArray(body.universe) || body.universe.length === 0) {
            return c.json({ error: 'Invalid Request', details: '"universe" must be a non-empty array of stock codes' }, 400);
        }

        // 종목코드 형식 검증 (6자리 숫자 또는 숫자+영문 혼합 - 2025년 이후 신규 상장 ETF 포함)
        const invalidSymbols = body.universe.filter(s => !/^[A-Z0-9]{6}$/i.test(s));
        if (invalidSymbols.length > 0) {
            return c.json({ error: 'Invalid symbols', details: `Invalid format: ${invalidSymbols.join(', ')}` }, 400);
        }

        // 가중치 값 범위 검증 (0~10)
        const weights = body.weights;
        if (weights) {
            const weightFields = ['technicalScoreMax', 'rrScoreMax', 'volumeProfileMax', 'ma60Max'] as const;
            for (const field of weightFields) {
                const val = weights[field];
                if (val !== undefined && (typeof val !== 'number' || val < 0 || val > 10)) {
                    return c.json({ error: `Invalid weight: ${field} must be between 0 and 10` }, 400);
                }
            }
        }

        const config: BacktestConfig = {
            universe: body.universe,
            gradeFilter: body.gradeFilter ?? ['A'],
            holdingPeriod: Math.min(20, Math.max(1, body.holdingPeriod ?? 10)),
            weights: body.weights,
            thresholds: body.thresholds,
        };

        const start = performance.now();
        const result = await runBacktest(config);
        const elapsed = ((performance.now() - start) / 1000).toFixed(1);

        await saveBacktestResult(result);
        console.log(`[Backtest] ${result.summary.totalTrades} trades in ${elapsed}s (${body.universe.length} symbols)`);

        return c.json(result);
    } catch (e: any) {
        console.error('[Backtest] Error:', e);
        const code = (e as any).code || 'INTERNAL_ERROR';
        return c.json({ error: e.message, code }, 500);
    }
});

// 9-2. Parameter Sweep 실행
app.post('/k-dexter/backtest/parameter-sweep', async (c) => {
    try {
        const body = await c.req.json() as BacktestConfig;

        if (!body.universe || !Array.isArray(body.universe) || body.universe.length === 0) {
            return c.json({ error: 'Invalid Request', details: '"universe" is required' }, 400);
        }

        const invalidSymbols = body.universe.filter(s => !/^[A-Z0-9]{6}$/i.test(s));
        if (invalidSymbols.length > 0) {
            return c.json({ error: 'Invalid symbols', details: `Invalid format: ${invalidSymbols.join(', ')}` }, 400);
        }

        const config: BacktestConfig = {
            universe: body.universe,
            gradeFilter: body.gradeFilter ?? ['A'],
            holdingPeriod: Math.min(20, Math.max(1, body.holdingPeriod ?? 10)),
        };

        const start = performance.now();
        const result = await runParameterSweep(config);
        const elapsed = ((performance.now() - start) / 1000).toFixed(1);

        console.log(`[Sweep] ${result.combinations.length} combinations in ${elapsed}s`);
        return c.json(result);
    } catch (e: any) {
        console.error('[Sweep] Error:', e);
        const code = (e as any).code || 'INTERNAL_ERROR';
        return c.json({ error: e.message, code }, 500);
    }
});

// 9-3. 결과 목록
app.get('/k-dexter/backtest/results', async (c) => {
    try {
        const results = await listBacktestResults();
        return c.json({ results });
    } catch (e: any) {
        return c.json({ error: 'Internal Server Error', details: e.message }, 500);
    }
});

// 9-4. 특정 결과 조회
app.get('/k-dexter/backtest/results/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const result = await loadBacktestResult(id);
        if (!result) return c.json({ error: 'Not Found' }, 404);
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: 'Internal Server Error', details: e.message }, 500);
    }
});

// 10. Export for Bun
export default {
    port: PORT,
    fetch: app.fetch,
};
