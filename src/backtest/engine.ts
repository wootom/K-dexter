/**
 * engine.ts
 *
 * 백테스트 핵심 루프
 * Look-ahead bias 방지: simDate 기준 미래 데이터 사용 금지
 */

import { SMA, RSI } from 'technicalindicators';
import { fetchDailyOHLCV } from '../tools/korea/kis-client.js';
import {
    calculateATR,
    calcSwingGrade,
    type OhlcvBar,
} from '../analysis/signal-generator.js';
import { calculateTrendScore, calculateMomentumScore } from '../analysis/scorer.js';
import { calculateVolumeProfile, type OhlcvBarWithVolume } from '../analysis/volume-profile.js';
import {
    buildEquityCurve,
    calcMaxDrawdown,
    calcWinRate,
    calcAvgReturn,
    calcMedianReturn,
    calcStdReturn,
    calcSharpeRatio,
    calcProfitFactor,
    calcGradeBreakdown,
    calcFactorCorrelation,
} from './stats.js';
import type {
    OhlcvRecord,
    BacktestConfig,
    BacktestTrade,
    BacktestResult,
    SwingGradeWeights,
    SwingGradeThresholds,
} from './types.js';
import { randomUUID } from 'crypto';

// ─── OHLCV 정규화 ─────────────────────────────────────────────────────

/**
 * KIS API 응답(문자열, 최신→과거 순) → 숫자, 오름차순 정렬
 */
function normalizeOhlcv(raw: any[]): OhlcvRecord[] {
    return [...raw]
        .reverse() // KIS는 최신→과거, 오름차순 변환
        .map(r => ({
            date: r.date,
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            close: Number(r.close),
            volume: Number(r.volume),
        }));
}

// ─── 지표 계산 유틸 ──────────────────────────────────────────────────

function average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── 단일 시뮬레이션 날짜의 거래 계산 ───────────────────────────────

interface SimResult {
    trade: BacktestTrade;
}

function simulateTrade(
    symbol: string,
    bars: OhlcvRecord[],
    simDate: number,
    holdingPeriod: number,
    weights?: SwingGradeWeights,
    thresholds?: SwingGradeThresholds
): SimResult | null {
    // ── 지표 계산 (bars[0..simDate]만 사용) ───────────────────────────
    const slice = bars.slice(0, simDate + 1);
    const closes = slice.map(b => b.close);
    const volumes = slice.map(b => b.volume);

    if (closes.length < 120) return null;

    // MA 계산 (SMA 라이브러리 사용)
    const ma20Arr = SMA.calculate({ period: 20, values: closes });
    const ma60Arr = SMA.calculate({ period: 60, values: closes });
    const ma120Arr = SMA.calculate({ period: 120, values: closes });
    const rsiArr = RSI.calculate({ period: 14, values: closes });

    const lastMa20 = ma20Arr[ma20Arr.length - 1];
    const lastMa60 = ma60Arr[ma60Arr.length - 1];
    const lastMa120 = ma120Arr[ma120Arr.length - 1];
    const lastRsi = rsiArr[rsiArr.length - 1];
    const currentPrice = slice[slice.length - 1].close;

    if (!lastMa20 || !lastMa60 || !lastMa120 || !lastRsi) return null;

    // 거래량 평균 (모멘텀 점수용)
    const recentVols = volumes.slice(-20);
    const avgVol5 = average(recentVols.slice(-5));
    const avgVol20 = average(recentVols);

    // ── 기술 점수 계산 (0~100) ─────────────────────────────────────
    const trendScore = calculateTrendScore(currentPrice, {
        ma20: lastMa20,
        ma60: lastMa60,
        ma120: lastMa120,
    });
    const momentumScore = calculateMomentumScore(lastRsi, avgVol5, avgVol20);
    // 백테스트: 시장흐름/리스크/펀더멘털 중립(0)으로 고정
    const scorerTotal = trendScore + momentumScore;
    const technicalScore = Math.max(0, Math.min(100, 50 + scorerTotal * 6));

    // ── ATR 계산 ─────────────────────────────────────────────────────
    const ohlcvBars: OhlcvBar[] = slice.map(b => ({
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
    }));
    const atr = calculateATR(ohlcvBars, 14);

    // ── Volume Profile 계산 (60일 lookback) ───────────────────────
    const vpSlice60 = slice.slice(-60);
    const barsWithVol: OhlcvBarWithVolume[] = vpSlice60
        .filter(b => b.volume > 0)
        .map(b => ({ high: b.high, low: b.low, close: b.close, volume: b.volume }));
    const vp = barsWithVol.length >= 20
        ? calculateVolumeProfile(barsWithVol, currentPrice, 50, 60)
        : null;

    // ── R/R 계산 ─────────────────────────────────────────────────────
    const recentHighArr = slice.slice(-60).map(b => b.high);
    const recentHigh = Math.max(...recentHighArr);

    const entryBarIdx = simDate + 1;
    if (entryBarIdx >= bars.length) return null;

    const entryPrice = bars[entryBarIdx].open;
    if (entryPrice <= 0) return null;

    // 목표가: 최근 고점 vs BB 상단 중 큰 값, ATR×10 이내로 캡
    const twoWeekMaxMove = atr * 10;
    let targetPrice = Math.max(recentHigh, lastMa20 + 2 * atr);
    if (targetPrice > entryPrice + twoWeekMaxMove) {
        targetPrice = Math.round(entryPrice + atr * 5);
    }

    // 손절가: ATR×2 vs MA60×0.99 중 높은 값
    const stopLossAtr = entryPrice - atr * 2;
    const stopLossMa60 = lastMa60 * 0.99;
    const stopLossPrice = Math.max(stopLossAtr, stopLossMa60);

    const reward = targetPrice - entryPrice;
    const risk = entryPrice - stopLossPrice;
    const rr = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;

    // ── Grade 계산 ───────────────────────────────────────────────────
    const gradeResult = calcSwingGrade(
        technicalScore, rr, vp, currentPrice, lastMa60,
        weights, thresholds
    );

    // ── 보유기간 성과 계산 ───────────────────────────────────────────
    const holdEnd = simDate + 1 + holdingPeriod;
    if (holdEnd > bars.length) return null;

    const holdBars = bars.slice(simDate + 1, holdEnd);
    if (holdBars.length === 0) return null;

    const exitBar = holdBars[holdBars.length - 1];
    const exitPrice = exitBar.close;
    const peakPrice = Math.max(...holdBars.map(b => b.high));
    const troughPrice = Math.min(...holdBars.map(b => b.low));

    const returnPct = parseFloat(((exitPrice - entryPrice) / entryPrice * 100).toFixed(4));
    const mfe = parseFloat(((peakPrice - entryPrice) / entryPrice * 100).toFixed(4));
    const mae = parseFloat(((troughPrice - entryPrice) / entryPrice * 100).toFixed(4));

    const targetAchieved = peakPrice >= targetPrice;
    const stopLossHit = troughPrice <= stopLossPrice;

    const trade: BacktestTrade = {
        symbol,
        entryDate: bars[simDate + 1].date,
        entryPrice,
        exitDate: exitBar.date,
        exitPrice,
        swingGrade: gradeResult.grade,
        gradeScore: gradeResult.score,
        technicalScore: gradeResult.breakdown.technicalScore,
        rrScore: gradeResult.breakdown.rrScore,
        volumeProfileScore: gradeResult.breakdown.volumeProfileScore,
        ma60Score: gradeResult.breakdown.ma60Score,
        returnPct,
        peakPrice,
        maxFavorableExcursion: mfe,
        maxAdverseExcursion: mae,
        targetAchieved,
        stopLossHit,
        expectedRR: rr,
        targetPrice: Math.round(targetPrice),
        stopLossPrice: Math.round(stopLossPrice),
    };

    return { trade };
}

// ─── 메인 백테스트 함수 ───────────────────────────────────────────────

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    const {
        universe,
        gradeFilter,
        holdingPeriod,
        weights,
        thresholds,
    } = config;

    // ── 1. OHLCV 캐시 구성 (종목별 1회 fetch) ────────────────────────
    const ohlcvCache = new Map<string, OhlcvRecord[]>();

    for (const symbol of universe) {
        try {
            const raw = await fetchDailyOHLCV(symbol, 200);
            const normalized = normalizeOhlcv(raw.output2);
            ohlcvCache.set(symbol, normalized);
        } catch (err) {
            console.warn(`[Backtest] OHLCV fetch failed for ${symbol}: ${err}`);
        }
        await sleep(100); // KIS API rate limit
    }

    // ── 2. 시뮬레이션 루프 ──────────────────────────────────────────────
    const trades: BacktestTrade[] = [];
    const WARMUP = 120; // MA120 워밍업

    for (const [symbol, bars] of ohlcvCache) {
        if (bars.length < 130) {
            const err = new Error(`Insufficient data for ${symbol}: need 130+ bars, got ${bars.length}`);
            (err as any).code = 'INSUFFICIENT_DATA';
            throw err;
        }
        if (bars.length < WARMUP + holdingPeriod + 2) {
            console.warn(`[Backtest] ${symbol}: insufficient data (${bars.length} bars)`);
            continue;
        }

        const maxSimDate = bars.length - holdingPeriod - 2;

        for (let simDate = WARMUP; simDate <= maxSimDate; simDate++) {
            const result = simulateTrade(symbol, bars, simDate, holdingPeriod, weights, thresholds);
            if (!result) continue;

            const { trade } = result;
            if (gradeFilter.includes(trade.swingGrade)) {
                trades.push(trade);
            }
        }
    }

    // ── 3. 통계 집계 ──────────────────────────────────────────────────
    const equityCurve = buildEquityCurve(trades);
    const avgReturn = calcAvgReturn(trades);
    const stdReturn = calcStdReturn(trades);

    const result: BacktestResult = {
        id: randomUUID(),
        config,
        executedAt: new Date().toISOString(),
        summary: {
            totalTrades: trades.length,
            winRate: calcWinRate(trades),
            avgReturn,
            medianReturn: calcMedianReturn(trades),
            stdReturn,
            sharpeRatio: calcSharpeRatio(avgReturn, stdReturn),
            maxDrawdown: calcMaxDrawdown(equityCurve),
            targetHitRate: trades.length > 0
                ? parseFloat((trades.filter(t => t.targetAchieved).length / trades.length * 100).toFixed(2))
                : 0,
            stopLossHitRate: trades.length > 0
                ? parseFloat((trades.filter(t => t.stopLossHit).length / trades.length * 100).toFixed(2))
                : 0,
            profitFactor: calcProfitFactor(trades),
        },
        gradeBreakdown: calcGradeBreakdown(trades),
        factorCorrelation: calcFactorCorrelation(trades),
        equityCurve,
        trades,
    };

    return result;
}

// ─── 결과 파일 저장/조회 ──────────────────────────────────────────────

import { mkdir, writeFile, readFile, readdir } from 'fs/promises';
import { join } from 'path';

const RESULTS_DIR = './data/backtest-results';

export async function saveBacktestResult(result: BacktestResult): Promise<void> {
    await mkdir(RESULTS_DIR, { recursive: true });
    await writeFile(
        join(RESULTS_DIR, `${result.id}.json`),
        JSON.stringify(result, null, 2),
        'utf-8'
    );
}

export async function loadBacktestResult(id: string): Promise<BacktestResult | null> {
    // UUID 형식 검증 (path traversal 방지)
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    try {
        const raw = await readFile(join(RESULTS_DIR, `${id}.json`), 'utf-8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export async function listBacktestResults(): Promise<{
    id: string; executedAt: string; config: BacktestConfig;
    summary: BacktestResult['summary'];
}[]> {
    try {
        const files = await readdir(RESULTS_DIR);
        const results = await Promise.all(
            files
                .filter(f => f.endsWith('.json'))
                .map(async f => {
                    try {
                        const raw = await readFile(join(RESULTS_DIR, f), 'utf-8');
                        const r: BacktestResult = JSON.parse(raw);
                        return {
                            id: r.id,
                            executedAt: r.executedAt,
                            config: r.config,
                            summary: r.summary,
                        };
                    } catch {
                        return null;
                    }
                })
        );
        return results.filter(Boolean) as any[];
    } catch {
        return [];
    }
}
