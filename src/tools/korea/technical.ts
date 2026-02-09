
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { SMA, RSI, MACD, BollingerBands } from 'technicalindicators';
import { fetchDailyOHLCV, fetchUsDailyOHLCV } from './kis-client.js';

interface TechnicalScore {
    score: number; // 0-100
    signal: 'BUY' | 'SELL' | 'NEUTRAL';
    details: string[];
}

export const analyzeKrTechnical = tool(
    async ({ symbol, period = 120 }) => {
        try {
            // 1. Fetch Data internally
            const data = await fetchDailyOHLCV(symbol, period);

            if (!data.output2 || !Array.isArray(data.output2) || data.output2.length === 0) {
                return "No OHLCV data found for the given symbol.";
            }

            const rawRecords = [...data.output2].reverse(); // Now: Oldest -> Newest
            const closes = rawRecords.map((r: any) => parseFloat(r.close));

            if (closes.length < 20) {
                return "Not enough data for technical analysis (need at least 20 days).";
            }

            const result = calculateTechnicalSignal(symbol, closes);
            // Add current price from last close if needed, but calculation handles it
            result.currentPrice = closes[closes.length - 1];

            return JSON.stringify(result, null, 2);

        } catch (error) {
            return `Error analyzing technicals: ${error}`;
        }
    },
    {
        name: 'analyze_kr_technical',
        description: '한국 주식의 기술적 지표(MA, RSI, MACD, 볼린저밴드)를 분석합니다. 종목코드만 입력하세요.',
        schema: z.object({
            symbol: z.string().describe('Stock symbol (e.g., 005930)'),
            period: z.number().optional().default(60).describe('Data period in days (default: 60)'),
        }),
    }
);

export const analyzeUsTechnical = tool(
    async ({ symbol, exchange = 'NAS', period = 120 }) => {
        try {
            // 1. Fetch Data
            const data = await fetchUsDailyOHLCV(symbol, exchange, period);

            if (!data.output2 || !Array.isArray(data.output2) || data.output2.length === 0) {
                return "No OHLCV data found for the given symbol.";
            }

            // US Data from fetchUsDailyOHLCV is ALREADY sorted Oldest -> Newest (we did .reverse() there)
            // So NO need to reverse here.
            const rawRecords = data.output2;
            const closes = rawRecords.map((r: any) => parseFloat(r.close));

            if (closes.length < 20) {
                return "Not enough data for technical analysis (need at least 20 days).";
            }

            const result = calculateTechnicalSignal(symbol, closes);
            result.currentPrice = closes[closes.length - 1];

            return JSON.stringify(result, null, 2);

        } catch (error) {
            return `Error analyzing US technicals: ${error}`;
        }
    },
    {
        name: 'analyze_us_technical',
        description: '미국 주식의 기술적 지표(MA, RSI, MACD, BB)를 분석합니다. 티커(예: AAPL)를 입력하세요.',
        schema: z.object({
            symbol: z.string().describe('Ticker symbol (e.g., AAPL)'),
            exchange: z.enum(['NAS', 'NYS', 'AMS']).optional().default('NAS'),
            period: z.number().optional().default(60),
        }),
    }
);

function calculateTechnicalSignal(symbol: string, closes: number[]): any {
    // 2. Calculate Indicators
    const ma5 = SMA.calculate({ period: 5, values: closes });
    const ma20 = SMA.calculate({ period: 20, values: closes });
    const ma60 = SMA.calculate({ period: 60, values: closes });
    const rsi = RSI.calculate({ period: 14, values: closes });

    const macd = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
    });

    const bb = BollingerBands.calculate({
        period: 20,
        stdDev: 2,
        values: closes,
    });

    // Get latest values
    const currentPrice = closes[closes.length - 1];
    const lastMa5 = ma5[ma5.length - 1];
    const lastMa20 = ma20[ma20.length - 1];
    const lastMa60 = ma60[ma60.length - 1];
    const lastRsi = rsi[rsi.length - 1];
    const lastMacd = macd[macd.length - 1];
    const lastBb = bb[bb.length - 1];

    // 3. Scoring Logic
    let score = 50;
    const details: string[] = [];

    // Trend (MA)
    if (currentPrice > lastMa20) {
        score += 10;
        details.push("Price above MA20 (Short-term Uptrend)");
    } else {
        score -= 10;
        details.push("Price below MA20 (Short-term Downtrend)");
    }

    if (lastMa20 > lastMa60) {
        score += 10;
        details.push("MA20 above MA60 (Medium-term Uptrend)");
    } else {
        score -= 5;
    }

    // RSI
    if (lastRsi < 30) {
        score += 20;
        details.push(`RSI Oversold (${lastRsi.toFixed(2)}) - Potential Buy`);
    } else if (lastRsi > 70) {
        score -= 20;
        details.push(`RSI Overbought (${lastRsi.toFixed(2)}) - Potential Sell`);
    } else {
        details.push(`RSI Neutral (${lastRsi.toFixed(2)})`);
    }

    // MACD
    if (lastMacd && lastMacd.MACD && lastMacd.signal) {
        if (lastMacd.MACD > lastMacd.signal) {
            score += 10;
            details.push("MACD > Signal (Bullish)");
        } else {
            score -= 10;
            details.push("MACD < Signal (Bearish)");
        }
    }

    // Bollinger Bands
    if (lastBb) {
        if (currentPrice < lastBb.lower) {
            score += 15;
            details.push("Price below Lower BB (Oversold)");
        } else if (currentPrice > lastBb.upper) {
            score -= 15;
            details.push("Price above Upper BB (Overbought)");
        }
    }

    // Normalize score
    score = Math.max(0, Math.min(100, score));

    let signal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    if (score >= 70) signal = 'BUY';
    else if (score <= 30) signal = 'SELL';

    return {
        symbol,
        currentPrice, // Will be overwritten by caller if needed
        indicators: {
            ma5: lastMa5,
            ma20: lastMa20,
            ma60: lastMa60,
            rsi: lastRsi,
            macd: lastMacd,
            bb: lastBb,
        },
        analysis: {
            score,
            signal,
            summary: details,
        },
    };
}


