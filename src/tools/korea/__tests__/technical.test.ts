
import { describe, expect, test, mock } from "bun:test";
import { analyzeKrTechnical } from "../technical.js";

// Generate dummy data (uptrend)
const generateUptrendData = (days: number) => {
    const data = [];
    let price = 50000;
    for (let i = 0; i < days; i++) {
        // Reverse order: output2[0] is today (newest)
        // So we generate from newest to oldest
        // Newest price is highest
        data.push({
            close: String(price),
            high: String(price + 500),
            low: String(price - 500),
            volume: "1000000",
        });
        price -= 100; // Decrement for past days
    }
    return data;
};

// Mock the entire module
mock.module("../kis-client.js", () => {
    return {
        fetchDailyOHLCV: async (symbol: string, period: number) => {
            if (symbol === 'EMPTY') return { output2: [] };
            if (symbol === 'SHORT') return { output2: generateUptrendData(10) };
            return { output2: generateUptrendData(120) };
        },
    };
});

describe("analyzeKrTechnical Tool", () => {
    test("should analyze uptrend data correctly", async () => {
        // Invoke the tool
        const resultJson = await analyzeKrTechnical.invoke({ symbol: "005930" });
        const result = JSON.parse(resultJson);

        expect(result.symbol).toBe("005930");
        expect(result.currentPrice).toBeGreaterThan(0);
        expect(result.analysis.signal).toBeDefined();
        expect(result.analysis.summary.length).toBeGreaterThan(0);

        // Check if score reflects uptrend (might be penalized for overbought)
        expect(result.analysis.score).toBeGreaterThan(35);
    });

    test("should handle insufficient data", async () => {
        const result = await analyzeKrTechnical.invoke({ symbol: "SHORT" });
        expect(result).toContain("Not enough data");
    });

    test("should handle empty data", async () => {
        const result = await analyzeKrTechnical.invoke({ symbol: "EMPTY" });
        expect(result).toContain("No OHLCV data");
    });
});
