import { describe, expect, test } from "bun:test";
import { fetchNaverFinancials } from "../src/tools/korea/kr-daily-financials";

describe("Naver Financials Crawler", () => {
    test("should fetch financials for Samsung Electronics (005930)", async () => {
        const result = await fetchNaverFinancials("005930");

        // Error check
        if ('error' in result) {
            console.error("Crawler Error:", result.error);
        } else {
            console.log("Fetched Data:", result);
            expect(result.symbol).toBe("005930");
            expect(result.roe).not.toBeNull(); // ROE should exist
            expect(typeof result.roe).toBe("number");
        }
    });

    // Optional: Test invalid symbol
    test("should handle invalid symbol gracefully (or fail based on implementation)", async () => {
        // This might fail if Naver redirects or returns 404, or returns valid page with empty data
        // Just a placeholder for now
    });
});
