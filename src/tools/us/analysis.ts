/**
 * src/tools/us/analysis.ts
 *
 * 미국 주식 종합 분석 도구
 * KIS 해외주식 API (가격 + OHLCV) 기반 기술적 분석 + 매물대 + 매매 시그널
 * - 펀더멘털 미제공 (KIS 해외 API 미지원)
 * - Volume Profile: OHLCV에 포함된 volume으로 POC/VAH/VAL 계산
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { SMA, RSI } from 'technicalindicators';
import { fetchUsCurrentPrice, fetchUsDailyOHLCV } from '../korea/kis-client.js';
import { calculateATR, generateTradeSignal } from '../../analysis/signal-generator.js';

// 미국 주식 기술 스코어 (펀더멘털 없이 trend/momentum/risk 3가지)
function scoreUsStock(
    price: number,
    ma20: number, ma60: number, ma120: number,
    rsi: number,
    avgVol5: number, avgVol20: number,
    atr: number
): { scores: Record<string, number>; state: string; confidence_level: string } {
    let trend = 0;
    if (price > ma20) trend++;
    if (price > ma60) trend++;
    if (price > ma120) trend++;

    let momentum = 0;
    if (rsi > 50 && rsi < 70) momentum++;
    else if (rsi <= 30) momentum++;        // 과매도 반등 기대
    else if (rsi >= 70) momentum--;        // 과매수 조정 주의
    if (avgVol5 > avgVol20 * 1.2) momentum++;  // 거래량 급증

    let risk = 0;
    const atrPct = (atr / price) * 100;
    if (atrPct > 5) risk--;                // 고변동성 페널티
    else if (atrPct < 2) risk++;           // 저변동성 안정적

    const total = trend + momentum + risk;

    const state =
        total >= 5 ? '강한 상승 추세' :
            total >= 3 ? '상승 추세' :
                total >= 1 ? '중립 (약상승)' :
                    total === 0 ? '중립' :
                        total >= -1 ? '중립 (약하락)' :
                            '하락 추세';

    const confidence_level =
        Math.abs(total) >= 4 ? 'HIGH' :
            Math.abs(total) >= 2 ? 'MEDIUM' : 'LOW';

    return {
        scores: { trend, momentum, risk, total },
        state,
        confidence_level,
    };
}

type Exchange = 'NAS' | 'NYS' | 'AMS';

export const analyzeUsStock = tool(
    async ({ symbol, exchange = 'NAS' }) => {
        try {
            // 1. KIS 해외 가격 + OHLCV 병렬 조회
            const [priceData, ohlcvData] = await Promise.all([
                fetchUsCurrentPrice(symbol, exchange),
                fetchUsDailyOHLCV(symbol, exchange, 200),
            ]);

            // 2. OHLCV 가공 (Oldest → Newest)
            const rawRecords = [...ohlcvData.output2];  // 이미 시간순
            const closes = rawRecords.map((d: any) => parseFloat(d.close));
            const volumes = rawRecords.map((d: any) => parseInt(d.volume, 10));

            if (closes.length < 70) {
                return JSON.stringify({
                    error: `Not enough data (requires 70+ days). Got ${closes.length}`
                });
            }

            // bars (ATR + Volume Profile용)
            const bars = rawRecords.map((d: any) => ({
                high: parseFloat(d.high),
                low: parseFloat(d.low),
                close: parseFloat(d.close),
                volume: parseInt(d.volume, 10),
            }));

            // 3. 기술 지표 계산 (KIS US는 최대 100건 → MA120은 데이터 있을 때만)
            const ma20arr = SMA.calculate({ period: 20, values: closes });
            const ma60arr = SMA.calculate({ period: 60, values: closes });
            const ma120arr = closes.length >= 120 ? SMA.calculate({ period: 120, values: closes }) : [];
            const rsiArr = RSI.calculate({ period: 14, values: closes });

            const recentVols = volumes.slice(-20);
            const avgVol5 = recentVols.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5;
            const avgVol20 = recentVols.reduce((a: number, b: number) => a + b, 0) / 20;

            const lastMa20 = ma20arr[ma20arr.length - 1];
            const lastMa60 = ma60arr[ma60arr.length - 1];
            const lastMa120 = ma120arr[ma120arr.length - 1];
            const lastRsi = rsiArr[rsiArr.length - 1];
            const currentPrice = parseFloat(priceData.price);
            const atr = calculateATR(bars, 14);

            // BB 근사값
            const bbUpper = lastMa20 + 2 * atr;
            const bbLower = lastMa20 - 2 * atr;

            // 4. 기술 스코어링 (MA120 없으면 현재가로 대체하여 trend 점수에 영향 주지 않음)
            const scorerResult = scoreUsStock(
                currentPrice, lastMa20, lastMa60, lastMa120 ?? currentPrice,
                lastRsi, avgVol5, avgVol20, atr
            );

            // 5. 매매 시그널 (매물대 포함)
            const technicalSignal: 'BUY' | 'SELL' | 'NEUTRAL' =
                scorerResult.scores.total >= 4 ? 'BUY' :
                    scorerResult.scores.total <= -1 ? 'SELL' : 'NEUTRAL';

            const tradeSignal = generateTradeSignal(
                symbol,
                currentPrice,
                bars,
                {
                    ma20: lastMa20,
                    ma60: lastMa60,
                    rsi: lastRsi,
                    bbUpper,
                    bbMiddle: lastMa20,
                    bbLower,
                    macdHistogram: null,
                },
                Math.max(0, Math.min(100, 50 + scorerResult.scores.total * 8)),
                technicalSignal
            );

            // 6. 응답 조립
            return JSON.stringify({
                symbol,
                exchange,
                price: currentPrice,
                change: priceData.diff,
                changeRate: priceData.rate,
                technicals: {
                    ma20: parseFloat(lastMa20.toFixed(2)),
                    ma60: parseFloat(lastMa60.toFixed(2)),
                    ma120: lastMa120 != null ? parseFloat(lastMa120.toFixed(2)) : null,
                    rsi: parseFloat(lastRsi.toFixed(2)),
                    atr: parseFloat(atr.toFixed(2)),
                    bbUpper: parseFloat(bbUpper.toFixed(2)),
                    bbLower: parseFloat(bbLower.toFixed(2)),
                    avgVol5d: Math.round(avgVol5),
                    avgVol20d: Math.round(avgVol20),
                },
                scorer: scorerResult,
                trade_signal: {
                    signal: tradeSignal.signal,
                    swing_grade: tradeSignal.swingGrade,
                    levels: tradeSignal.levels,
                    volume_profile: tradeSignal.volumeProfile,
                    rationale: tradeSignal.rationale,
                },
            }, null, 2);

        } catch (error) {
            return JSON.stringify({ error: `Error analyzing US stock ${symbol}: ${error}` });
        }
    },
    {
        name: 'analyze_us_stock',
        description: '미국 주식 기술적 분석 (MA/RSI/ATR/매물대/매매시그널). KIS 해외주식 API 사용.',
        schema: z.object({
            symbol: z.string().describe('US 티커 (예: NVDA, AAPL, TSLA)'),
            exchange: z.enum(['NAS', 'NYS', 'AMS']).default('NAS')
                .describe('거래소 (NAS: 나스닥, NYS: 뉴욕, AMS: 아멕스)'),
        }),
    }
);
