/**
 * stats.ts
 *
 * 백테스트 통계 집계 순수 함수 모음
 * 외부 의존성 없음
 */

import type { BacktestTrade, BacktestResult } from './types.js';

// ─── 기본 통계 ──────────────────────────────────────────────────────

export function calcWinRate(trades: BacktestTrade[]): number {
    if (trades.length === 0) return 0;
    const wins = trades.filter(t => t.returnPct > 0).length;
    return parseFloat(((wins / trades.length) * 100).toFixed(2));
}

export function calcAvgReturn(trades: BacktestTrade[]): number {
    if (trades.length === 0) return 0;
    const sum = trades.reduce((acc, t) => acc + t.returnPct, 0);
    return parseFloat((sum / trades.length).toFixed(4));
}

export function calcMedianReturn(trades: BacktestTrade[]): number {
    if (trades.length === 0) return 0;
    const sorted = [...trades].sort((a, b) => a.returnPct - b.returnPct);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return parseFloat(((sorted[mid - 1].returnPct + sorted[mid].returnPct) / 2).toFixed(4));
    }
    return parseFloat(sorted[mid].returnPct.toFixed(4));
}

export function calcStdReturn(trades: BacktestTrade[]): number {
    if (trades.length < 2) return 0;
    const avg = calcAvgReturn(trades);
    const variance = trades.reduce((acc, t) => acc + Math.pow(t.returnPct - avg, 2), 0) / (trades.length - 1);
    return parseFloat(Math.sqrt(variance).toFixed(4));
}

export function calcSharpeRatio(avg: number, std: number): number {
    if (std === 0) return 0;
    return parseFloat((avg / std).toFixed(4));
}

export function calcProfitFactor(trades: BacktestTrade[]): number {
    const totalGain = trades.filter(t => t.returnPct > 0).reduce((acc, t) => acc + t.returnPct, 0);
    const totalLoss = Math.abs(trades.filter(t => t.returnPct <= 0).reduce((acc, t) => acc + t.returnPct, 0));
    if (totalLoss === 0) return totalGain > 0 ? 999 : 0;
    return parseFloat((totalGain / totalLoss).toFixed(4));
}

// ─── Equity Curve & MDD ──────────────────────────────────────────────

/**
 * 날짜 오름차순으로 정렬된 누적 수익률 곡선 생성
 * 동일 날짜에 여러 거래가 있으면 평균 수익률 사용
 */
export function buildEquityCurve(
    trades: BacktestTrade[]
): { date: string; cumulativeReturn: number }[] {
    if (trades.length === 0) return [];

    // 날짜별 그룹화
    const byDate = new Map<string, number[]>();
    for (const trade of trades) {
        const d = trade.exitDate;
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d)!.push(trade.returnPct);
    }

    // 날짜 오름차순 정렬
    const sortedDates = [...byDate.keys()].sort();

    // 누적 수익률 (단순 합산)
    let cumulative = 0;
    return sortedDates.map(date => {
        const returns = byDate.get(date)!;
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        cumulative = parseFloat((cumulative + avgReturn).toFixed(4));
        return { date, cumulativeReturn: cumulative };
    });
}

/**
 * Equity Curve 기준 최대 낙폭 (음수 반환)
 */
export function calcMaxDrawdown(
    equityCurve: { date: string; cumulativeReturn: number }[]
): number {
    if (equityCurve.length === 0) return 0;

    let peak = equityCurve[0].cumulativeReturn;
    let maxDD = 0;

    for (const point of equityCurve) {
        if (point.cumulativeReturn > peak) {
            peak = point.cumulativeReturn;
        }
        const dd = point.cumulativeReturn - peak;
        if (dd < maxDD) maxDD = dd;
    }

    return parseFloat(maxDD.toFixed(4));
}

// ─── 피어슨 상관계수 ─────────────────────────────────────────────────

export function calcPearsonCorrelation(xs: number[], ys: number[]): number {
    const n = xs.length;
    if (n < 2) return 0;

    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;

    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - meanX;
        const dy = ys[i] - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
    }

    const den = Math.sqrt(denX * denY);
    if (den === 0) return 0;
    return parseFloat((num / den).toFixed(4));
}

// ─── Grade 집계 ───────────────────────────────────────────────────────

export function calcGradeBreakdown(
    trades: BacktestTrade[]
): BacktestResult['gradeBreakdown'] {
    const grades: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    return grades.map(grade => {
        const gradeTrades = trades.filter(t => t.swingGrade === grade);
        if (gradeTrades.length === 0) {
            return { grade, tradeCount: 0, winRate: 0, avgReturn: 0, targetHitRate: 0 };
        }
        const winRate = calcWinRate(gradeTrades);
        const avgReturn = calcAvgReturn(gradeTrades);
        const targetHitRate = parseFloat(
            ((gradeTrades.filter(t => t.targetAchieved).length / gradeTrades.length) * 100).toFixed(2)
        );
        return { grade, tradeCount: gradeTrades.length, winRate, avgReturn, targetHitRate };
    });
}

// ─── Factor 상관계수 집계 ─────────────────────────────────────────────

type FactorKey = 'technicalScore' | 'rrScore' | 'volumeProfileScore' | 'ma60Score';

export function calcFactorCorrelation(
    trades: BacktestTrade[]
): BacktestResult['factorCorrelation'] {
    if (trades.length < 2) return [];

    const factors: FactorKey[] = ['technicalScore', 'rrScore', 'volumeProfileScore', 'ma60Score'];
    const returns = trades.map(t => t.returnPct);

    return factors.map(factor => {
        const scores = trades.map(t => t[factor]);
        const correlation = calcPearsonCorrelation(scores, returns);

        const maxScore = Math.max(...scores);
        const highTrades = trades.filter(t => t[factor] === maxScore);
        const lowTrades = trades.filter(t => t[factor] === 0);

        const avgReturnWhenHigh = highTrades.length > 0 ? calcAvgReturn(highTrades) : 0;
        const avgReturnWhenLow = lowTrades.length > 0 ? calcAvgReturn(lowTrades) : 0;

        return { factor, correlationWithReturn: correlation, avgReturnWhenHigh, avgReturnWhenLow };
    });
}
