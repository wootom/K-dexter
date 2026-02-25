
import { describe, expect, test, beforeEach, mock } from "bun:test";
import { getCurrentPrice, getDailyOHLCV, getInvestorTrend } from '../kis-client';

// Mock fetch globally
(global as any).fetch = mock((url) => {
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
            json: async () => ({ rt_cd: '0', output: { stck_prpr: '70000' } }),
        } as Response);
    }

    if (typeof url === 'string' && url.includes('inquire-daily-itemchartprice')) {
        return Promise.resolve({
            ok: true,
            json: async () => ({ rt_cd: '0', output2: [{ stck_clpr: '70000' }] }),
        } as Response);
    }

    if (typeof url === 'string' && url.includes('inquire-investor')) {
        return Promise.resolve({
            ok: true,
            json: async () => ({ rt_cd: '0', output: [{ stck_bsop_date: '20240101', prsn_ntby_qty: '1000', frgn_ntby_qty: '1000', orgn_ntby_qty: '1000', stck_prpr: '70000' }] }),
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
        (global as any).fetch.mockClear();
        process.env.KIS_APP_KEY = 'test_app_key';
        process.env.KIS_APP_SECRET = 'test_app_secret';
        process.env.KIS_IS_PAPER_TRADING = 'true';
    });

    test('getCurrentPrice fetches data successfully', async () => {
        const resultStr = await getCurrentPrice.invoke({ symbol: '005930' });
        const result = JSON.parse(resultStr);
        expect(result).toHaveProperty('stck_prpr');
        expect(result.stck_prpr).toBe('70000');
    });

    test('getDailyOHLCV fetches data successfully', async () => {
        const resultStr = await getDailyOHLCV.invoke({ symbol: '005930' });
        const result = JSON.parse(resultStr);
        expect(result).toHaveProperty('output2');
    });

    test('getInvestorTrend fetches data successfully', async () => {
        const resultStr = await getInvestorTrend.invoke({ symbol: '005930' });
        const result = JSON.parse(resultStr);
        expect(Array.isArray(result)).toBe(true);
    });
});
