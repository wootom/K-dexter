
import { Hono } from 'hono';
import { fetchCurrentPrice, fetchDailyOHLCV, fetchInvestorTrend, fetchUsCurrentPrice, fetchUsDailyOHLCV } from '../../tools/korea/kis-client.js';
import { analyzeKrTechnical, analyzeUsTechnical } from '../../tools/korea/technical.js';

export const toolCallRoutes = new Hono();

/**
 * POST /api/tools/call
 * Body: { "tool": "get_kr_current_price", "args": { "symbol": "005930" } }
 * 
 * Simple REST endpoint for external consumers (e.g. OpenClaw Plugin)
 * to invoke K-Dexter tools without MCP protocol overhead.
 */
toolCallRoutes.post('/call', async (c) => {
    const startTime = performance.now();
    try {
        const body = await c.req.json();
        const { tool, args } = body as { tool: string; args: Record<string, any> };

        if (!tool) {
            return c.json({ error: 'Missing required field: tool' }, 400);
        }

        let result: any;

        switch (tool) {
            // --- Korean Market ---
            case 'get_kr_current_price':
                result = await fetchCurrentPrice(args.symbol);
                break;
            case 'get_kr_daily_ohlcv':
                result = await fetchDailyOHLCV(args.symbol, args.period ?? 60);
                break;
            case 'get_kr_investor_trend':
                result = await fetchInvestorTrend(args.symbol);
                break;
            case 'analyze_kr_technical':
                // This tool returns a JSON string, so we invoke it directly
                result = await analyzeKrTechnical.invoke({ symbol: args.symbol, period: args.period ?? 60 });
                if (typeof result === 'string') {
                    try { result = JSON.parse(result); } catch { }
                }
                break;

            // --- US Market ---
            case 'get_us_current_price':
                result = await fetchUsCurrentPrice(args.symbol, args.exchange ?? 'NAS');
                break;
            case 'get_us_daily_ohlcv':
                result = await fetchUsDailyOHLCV(args.symbol, args.exchange ?? 'NAS', args.period ?? 120);
                break;
            case 'analyze_us_technical':
                result = await analyzeUsTechnical.invoke({
                    symbol: args.symbol,
                    exchange: args.exchange ?? 'NAS',
                    period: args.period ?? 60,
                });
                if (typeof result === 'string') {
                    try { result = JSON.parse(result); } catch { }
                }
                break;

            default:
                return c.json({ error: `Unknown tool: ${tool}` }, 404);
        }

        const latencyMs = Math.round(performance.now() - startTime);
        console.log(`[ToolCall] ${tool} completed in ${latencyMs}ms`);

        return c.json({ ok: true, tool, result, latencyMs });

    } catch (e: any) {
        const latencyMs = Math.round(performance.now() - startTime);
        console.error(`[ToolCall] Error: ${e.message}`);
        return c.json({ ok: false, error: e.message, latencyMs }, 500);
    }
});

/** GET /api/tools/list — list available tools */
toolCallRoutes.get('/list', (c) => {
    return c.json({
        tools: [
            { name: 'get_kr_current_price', description: '한국 주식 현재가 조회', args: { symbol: 'string (required)' } },
            { name: 'get_kr_daily_ohlcv', description: '한국 주식 일봉 데이터', args: { symbol: 'string', period: 'number (default: 60)' } },
            { name: 'get_kr_investor_trend', description: '투자자별 매매동향', args: { symbol: 'string' } },
            { name: 'analyze_kr_technical', description: '한국 주식 기술적 분석 (MA/RSI/MACD/BB)', args: { symbol: 'string', period: 'number (default: 60)' } },
            { name: 'get_us_current_price', description: '미국 주식 현재가 조회', args: { symbol: 'string', exchange: 'NAS|NYS|AMS' } },
            { name: 'get_us_daily_ohlcv', description: '미국 주식 일봉 데이터', args: { symbol: 'string', exchange: 'string', period: 'number' } },
            { name: 'analyze_us_technical', description: '미국 주식 기술적 분석', args: { symbol: 'string', exchange: 'string', period: 'number' } },
        ],
    });
});
