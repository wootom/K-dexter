
import { describe, expect, test } from "bun:test";
import { analyze, calculateTrendScore, calculateMomentumScore, calculateRiskScore } from "../src/analysis/scorer.js";
import { type AnalysisRequest } from "../src/analysis/types.js";

describe("K-Dexter Analysis Logic", () => {

    test("Trend Score should range from 0 to 3", () => {
        // Case 1: All above MAs -> 3
        expect(calculateTrendScore(100, { ma20: 90, ma60: 80, ma120: 70 })).toBe(3);
        // Case 2: Below MA20, above others -> 2
        expect(calculateTrendScore(85, { ma20: 90, ma60: 80, ma120: 70 })).toBe(2);
        // Case 3: All below -> 0
        expect(calculateTrendScore(60, { ma20: 90, ma60: 80, ma120: 70 })).toBe(0);
    });

    test("Momentum Score should range from -1 to 2", () => {
        // Case 1: RSI Neutral (40-65) + Vol Up -> 1 + 1 = 2
        expect(calculateMomentumScore(50, 1000, 500)).toBe(2);
        // Case 2: RSI High (>70) + Vol Down -> 0 + 0 = 0
        expect(calculateMomentumScore(75, 400, 500)).toBe(0);
        // Case 3: RSI Low (<40) + Vol Up -> -1 + 1 = 0
        expect(calculateMomentumScore(30, 1000, 500)).toBe(0);
    });

    test("Risk Score Logic", () => {
        // Case 1: Defensive Sector (PG) -> +1
        expect(calculateRiskScore("PG", 100, 90)).toBe(1);
        // Case 2: Volatile/Tech (TSEM) -> 0 (unless surge)
        expect(calculateRiskScore("TSEM", 100, 90)).toBe(0);
        // Case 3: Surge (Price > 1.3 * MA120) -> -1
        expect(calculateRiskScore("TSEM", 140, 100)).toBe(-1);
    });

    test("Full Analysis Flow (Integration)", () => {
        const request: AnalysisRequest = {
            symbol: "TSEM",
            market: "US",
            timestamp: "2026-02-10T22:58:00+09:00",
            price: 100.00,
            moving_averages: { ma20: 90, ma60: 80, ma120: 70 },
            volume: { avg_5d: 120, avg_20d: 100 },
            momentum: { rsi_14: 60 },
            index_context: { main_index: "NASDAQ", index_trend: "up" },
        };

        const result = analyze(request);

        // Trend: 3 (100 > 90, 80, 70)
        // Momentum: 2 (RSI 60 -> +1, Vol 120 > 100 -> +1)
        // Flow: 1 (Up)
        // Risk: 0 (TSEM not defensive, Price 100 < 70*1.3=91 ?? Wait. Price 100 > 70*1.3 = 91. So Risk -1)
        // Total: 3 + 2 + 1 - 1 = 5?

        // Let's recheck Risk calculation logic in scorer.ts:
        // price > ma120 * 1.3 -> score -= 1. 
        // 100 > 70 * 1.3 (91) -> Yes. So Risk is -1.

        // Total = 3 + 2 + 1 - 1 = 5.

        expect(result.symbol).toBe("TSEM");
        expect(result.scores.total).toBe(5);
        expect(result.state).toBe("상승 추세"); // Trend >= 2
        // 5 >= 4 -> AGRESSIVE_BUY
        expect(result.strategy.short_term).toBe("적극 매수 유효");
    });
});
