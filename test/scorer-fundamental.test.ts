import { describe, expect, test } from "bun:test";
import { calculateFundamentalScore } from "../src/analysis/scorer";

describe("Fundamental Scorer", () => {
    test("should return 0 when no fundamentals provided", () => {
        expect(calculateFundamentalScore(undefined)).toBe(0);
    });

    test("should score max (3) for perfect stock", () => {
        const score = calculateFundamentalScore({
            per: 5,   // +1
            pbr: 0.5, // +1
            roe: 20,  // +1
            debt_ratio: 50, // 0
            op_margin: 10 // +1
        });
        // 1+1+1+0+1 = 4 -> min(3, 4) = 3
        expect(score).toBe(3);
    });

    test("should score min (-2) for bad stock", () => {
        const score = calculateFundamentalScore({
            per: 50,
            pbr: 5,
            roe: 0,
            debt_ratio: 300, // -1
            op_margin: 0
        });
        // 0+0+0-1+0 = -1
        expect(score).toBe(-1);
    });

    test("should handle missing optional fields", () => {
        const score = calculateFundamentalScore({
            per: 8, // +1
            // pbr missing
            roe: 15 // +1
        });
        // 1+0+1 = 2
        expect(score).toBe(2);
    });
});
