
import { describe, expect, test, beforeEach, mock } from "bun:test";
import { getCurrentPrice, getDailyOHLCV, getInvestorTrend } from '../kis-client.ts';

// Mock fetch globally
global.fetch = mock((url) => {
    // Simple router based on URL or logic
    if (typeof url === 'string' && url.includes('tokenP')) {
        return Promise.resolve({
            ok: true,
            json: async () => ({ access_token: 'test_token', expires_in: 3600 }),
        } as Response);
    }

    if (typeof url === 'string' && url.includes('inquire-price')) {
        return Promise.resolve({
            ok: true,
            json: async () => ({ output: { stck_prpr: '70000' } }),
        } as Response);
    }

    if (typeof url === 'string' && url.includes('inquire-daily-itemchartprice')) {
        return Promise.resolve({
            ok: true,
            json: async () => ({ output2: [{ stck_clpr: '70000' }] }),
        } as Response);
    }

    if (typeof url === 'string' && url.includes('inquire-investor')) {
        return Promise.resolve({
            ok: true,
            json: async () => ({ output: { frgn_ntby_qty: '1000' } }),
        } as Response);
    }

    return Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
    } as Response);
});

describe('KIS Client Tools', () => {
    beforeEach(() => {
        (global.fetch as any).mockClear();
        process.env.KIS_APP_KEY = 'test_app_key';
        process.env.KIS_APP_SECRET = 'test_app_secret';
        process.env.KIS_IS_PAPER_TRADING = 'true';
    });

    test('getCurrentPrice fetches data successfully', async () => {
        const result = await getCurrentPrice.invoke({ symbol: '005930' });
        expect(result).toHaveProperty('output');
        // @ts-ignore
        expect(result.output.stck_prpr).toBe('70000');
    });

    test('getDailyOHLCV fetches data successfully', async () => {
        const result = await getDailyOHLCV.invoke({ symbol: '005930' });
        expect(result).toHaveProperty('output2');
    });

    test('getInvestorTrend fetches data successfully', async () => {
        const result = await getInvestorTrend.invoke({ symbol: '005930' });
        expect(result).toHaveProperty('output');
    });
});
