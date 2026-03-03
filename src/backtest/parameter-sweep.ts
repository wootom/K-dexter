/**
 * parameter-sweep.ts
 *
 * 가중치 × 임계값 조합으로 백테스트를 반복 실행하여 최적 파라미터를 탐색
 * OHLCV 캐시를 공유하여 KIS API 호출 최소화
 */

import { fetchDailyOHLCV } from '../tools/korea/kis-client.js';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type {
    OhlcvRecord,
    BacktestConfig,
    ParameterSweepResult,
    SwingGradeWeights,
} from './types.js';
import {
    buildEquityCurve,
    calcMaxDrawdown,
    calcWinRate,
    calcAvgReturn,
    calcStdReturn,
    calcSharpeRatio,
} from './stats.js';

// ─── 전처리 (engine.ts와 동일 로직 로컬 복사) ────────────────────────

function normalizeOhlcv(raw: any[]): OhlcvRecord[] {
    return [...raw]
        .reverse()
        .map(r => ({
            date: r.date,
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            close: Number(r.close),
            volume: Number(r.volume),
        }));
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Sweep 범위 정의 ──────────────────────────────────────────────────

const SWEEP_RANGES = {
    gradeThreshold: [5, 6, 7, 8],       // A grade 커트라인
    technicalScoreMax: [2, 3, 4],
    rrScoreMax: [1, 2, 3],
    volumeProfileMax: [1, 2, 3],
    ma60Max: [0, 1, 2],
};

// ─── 경량 백테스트 (sweep용 — engine.ts 의존 없이 인라인) ────────────

import {
    calcSwingGrade,
    calculateATR,
    type OhlcvBar,
} from '../analysis/signal-generator.js';
import { calculateTrendScore, calculateMomentumScore } from '../analysis/scorer.js';
import { calculateVolumeProfile, type OhlcvBarWithVolume } from '../analysis/volume-profile.js';
import { SMA, RSI } from 'technicalindicators';

function average(arr: number[]): number {
    return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

interface SweepTradeResult {
    entryDate: string;
    exitDate: string;
    returnPct: number;
}

function runSweepForCombination(
    ohlcvCache: Map<string, OhlcvRecord[]>,
    config: BacktestConfig,
    gradeThreshold: number,
    weights: SwingGradeWeights
): SweepTradeResult[] {
    const trades: SweepTradeResult[] = [];
    const WARMUP = 120;
    const { gradeFilter, holdingPeriod } = config;

    const thresholds = { A: gradeThreshold, B: gradeThreshold - 2, C: gradeThreshold - 4 };

    for (const [symbol, bars] of ohlcvCache) {
        if (bars.length < WARMUP + holdingPeriod + 2) continue;
        const maxSimDate = bars.length - holdingPeriod - 2;

        for (let simDate = WARMUP; simDate <= maxSimDate; simDate++) {
            const slice = bars.slice(0, simDate + 1);
            const closes = slice.map(b => b.close);
            const volumes = slice.map(b => b.volume);

            const ma20Arr = SMA.calculate({ period: 20, values: closes });
            const ma60Arr = SMA.calculate({ period: 60, values: closes });
            const ma120Arr = SMA.calculate({ period: 120, values: closes });
            const rsiArr = RSI.calculate({ period: 14, values: closes });

            const lastMa20 = ma20Arr[ma20Arr.length - 1];
            const lastMa60 = ma60Arr[ma60Arr.length - 1];
            const lastMa120 = ma120Arr[ma120Arr.length - 1];
            const lastRsi = rsiArr[rsiArr.length - 1];
            const currentPrice = slice[slice.length - 1].close;

            if (!lastMa20 || !lastMa60 || !lastMa120 || !lastRsi) continue;

            const avgVol5 = average(volumes.slice(-5));
            const avgVol20 = average(volumes.slice(-20));

            const trendScore = calculateTrendScore(currentPrice, {
                ma20: lastMa20, ma60: lastMa60, ma120: lastMa120,
            });
            const momentumScore = calculateMomentumScore(lastRsi, avgVol5, avgVol20);
            const technicalScore = Math.max(0, Math.min(100, 50 + (trendScore + momentumScore) * 6));

            const ohlcvBars: OhlcvBar[] = slice.map(b => ({
                high: b.high, low: b.low, close: b.close, volume: b.volume,
            }));
            const atr = calculateATR(ohlcvBars, 14);

            const vpSlice = slice.slice(-60);
            const barsWithVol: OhlcvBarWithVolume[] = vpSlice
                .filter(b => b.volume > 0)
                .map(b => ({ high: b.high, low: b.low, close: b.close, volume: b.volume }));
            const vp = barsWithVol.length >= 20
                ? calculateVolumeProfile(barsWithVol, currentPrice, 50, 60)
                : null;

            const recentHighArr = slice.slice(-60).map(b => b.high);
            const recentHigh = Math.max(...recentHighArr);

            const entryBarIdx = simDate + 1;
            if (entryBarIdx >= bars.length) continue;
            const entryPrice = bars[entryBarIdx].open;
            if (entryPrice <= 0) continue;

            const twoWeekMaxMove = atr * 10;
            let targetPrice = Math.max(recentHigh, lastMa20 + 2 * atr);
            if (targetPrice > entryPrice + twoWeekMaxMove) targetPrice = entryPrice + atr * 5;

            const stopLossPrice = Math.max(entryPrice - atr * 2, lastMa60 * 0.99);
            const reward = targetPrice - entryPrice;
            const risk = entryPrice - stopLossPrice;
            const rr = risk > 0 ? reward / risk : 0;

            const { grade } = calcSwingGrade(
                technicalScore, rr, vp, currentPrice, lastMa60, weights, thresholds
            );

            if (!gradeFilter.includes(grade)) continue;

            const holdEnd = simDate + 1 + holdingPeriod;
            if (holdEnd > bars.length) continue;
            const holdBars = bars.slice(simDate + 1, holdEnd);
            if (holdBars.length === 0) continue;

            const exitPrice = holdBars[holdBars.length - 1].close;
            trades.push({
                entryDate: bars[simDate + 1].date,
                exitDate: holdBars[holdBars.length - 1].date,
                returnPct: parseFloat(((exitPrice - entryPrice) / entryPrice * 100).toFixed(4)),
            });
        }
    }

    return trades;
}

// ─── 메인 Parameter Sweep 함수 ───────────────────────────────────────

export async function runParameterSweep(
    baseConfig: BacktestConfig
): Promise<ParameterSweepResult> {
    // 1. OHLCV 1회 fetch → 캐시
    const ohlcvCache = new Map<string, OhlcvRecord[]>();
    for (const symbol of baseConfig.universe) {
        try {
            const raw = await fetchDailyOHLCV(symbol, 200);
            ohlcvCache.set(symbol, normalizeOhlcv(raw.output2));
        } catch (err) {
            console.warn(`[Sweep] OHLCV fetch failed for ${symbol}: ${err}`);
        }
        await sleep(100);
    }

    // 2. 조합 순열 실행
    const combinations: ParameterSweepResult['combinations'] = [];

    for (const gradeThreshold of SWEEP_RANGES.gradeThreshold) {
        for (const technicalScoreMax of SWEEP_RANGES.technicalScoreMax) {
            for (const rrScoreMax of SWEEP_RANGES.rrScoreMax) {
                for (const volumeProfileMax of SWEEP_RANGES.volumeProfileMax) {
                    for (const ma60Max of SWEEP_RANGES.ma60Max) {
                        const weights: SwingGradeWeights = {
                            technicalScoreMax,
                            rrScoreMax,
                            volumeProfileMax,
                            ma60Max,
                        };

                        const trades = runSweepForCombination(
                            ohlcvCache, baseConfig, gradeThreshold, weights
                        );

                        const avgReturn = calcAvgReturn(trades as any);
                        const stdReturn = calcStdReturn(trades as any);
                        const equityCurve = buildEquityCurve(trades as any);

                        combinations.push({
                            gradeThreshold,
                            weights: {
                                tech: technicalScoreMax,
                                rr: rrScoreMax,
                                vp: volumeProfileMax,
                                ma60: ma60Max,
                            },
                            totalTrades: trades.length,
                            winRate: calcWinRate(trades as any),
                            avgReturn,
                            sharpeRatio: calcSharpeRatio(avgReturn, stdReturn),
                            maxDrawdown: calcMaxDrawdown(equityCurve),
                        });
                    }
                }
            }
        }
    }

    // 3. 최적 조합 찾기
    const validCombinations = combinations.filter(c => c.totalTrades >= 5);

    const bestByWinRate = validCombinations.reduce(
        (best, c) => c.winRate > best.winRate ? c : best,
        validCombinations[0] ?? combinations[0]
    );

    const bestBySharpe = validCombinations.reduce(
        (best, c) => c.sharpeRatio > best.sharpeRatio ? c : best,
        validCombinations[0] ?? combinations[0]
    );

    const toWeights = (c: typeof combinations[0]): SwingGradeWeights => ({
        technicalScoreMax: c.weights.tech,
        rrScoreMax: c.weights.rr,
        volumeProfileMax: c.weights.vp,
        ma60Max: c.weights.ma60,
    });

    const result: ParameterSweepResult = {
        id: randomUUID(),
        executedAt: new Date().toISOString(),
        combinations,
        bestByWinRate: {
            gradeThreshold: bestByWinRate.gradeThreshold,
            weights: toWeights(bestByWinRate),
            winRate: bestByWinRate.winRate,
        },
        bestBySharpe: {
            gradeThreshold: bestBySharpe.gradeThreshold,
            weights: toWeights(bestBySharpe),
            sharpeRatio: bestBySharpe.sharpeRatio,
        },
    };

    // 4. 결과 저장
    const RESULTS_DIR = './data/backtest-results';
    await mkdir(RESULTS_DIR, { recursive: true });
    await writeFile(
        join(RESULTS_DIR, `sweep-${result.id}.json`),
        JSON.stringify(result, null, 2),
        'utf-8'
    );

    return result;
}
