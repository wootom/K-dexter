/**
 * signal-generator.ts
 *
 * 기술적 지표 + 매물대(Volume Profile)를 기반으로 구체적인 매매 가격 수준을 계산합니다.
 * 2주 스윙 트레이딩에 최적화: POC/VAL/VAH 기반 진입/목표/손절 조정
 */

import { calculateVolumeProfile, interpretVolumeProfile, type OhlcvBarWithVolume, type VolumeProfile } from './volume-profile.js';

export interface OhlcvBar {
    high: number;
    low: number;
    close: number;
    volume?: number; // optional — volume 있으면 매물대 계산 활성화
}

export interface TradeLevels {
    /** 공격적 진입 (현재가) */
    aggressiveEntry: number;
    /** 보수적 진입 (매물대 지지 or MA20/BB 하단) */
    conservativeEntry: number;
    /** 1차 목표가: 상단 저항 매물대 or BB 상단 */
    target1: number;
    /** 2차 목표가: 피보나치 1.618 확장 */
    target2: number;
    /** ATR 기반 손절가 */
    stopLossAtr: number;
    /** 지지선/매물대 기반 손절가 */
    stopLossSupport: number;
    /** ATR 값 */
    atr: number;
    /** R/R 비율 */
    riskRewardRatio: number;
    /** 권고 포지션 비중 (계좌 1% 위험 원칙) */
    positionSizePercent: number;
    /** 2주 보유 기준 예상 수익률 (목표가 1차 기준) */
    estimatedReturnPct: number;
}

export interface TradeSignal {
    symbol: string;
    currentPrice: number;
    signal: 'BUY' | 'SELL' | 'NEUTRAL';
    score: number;
    /** 2주 스윙 적합도 */
    swingGrade: 'A' | 'B' | 'C' | 'D';
    levels: TradeLevels;
    /** 매물대 분석 결과 */
    volumeProfile?: {
        poc: number;
        valueAreaHigh: number;
        valueAreaLow: number;
        nearestResistance: number | null;
        nearestSupport: number | null;
        pricePosition: string;
    };
    rationale: string[];
    indicators: {
        ma20: number;
        ma60: number;
        rsi: number;
        bbUpper: number;
        bbMiddle: number;
        bbLower: number;
        macdHistogram: number | null;
    };
}

/**
 * ATR(Average True Range) — Wilder's Smoothed Method
 */
export function calculateATR(bars: OhlcvBar[], period: number = 14): number {
    if (bars.length < period + 1) {
        const recentBars = bars.slice(-period);
        return recentBars.reduce((sum, b) => sum + (b.high - b.low), 0) / recentBars.length;
    }

    const trueRanges: number[] = [];
    for (let i = 1; i < bars.length; i++) {
        const tr = Math.max(
            bars[i].high - bars[i].low,
            Math.abs(bars[i].high - bars[i - 1].close),
            Math.abs(bars[i].low - bars[i - 1].close)
        );
        trueRanges.push(tr);
    }
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trueRanges.length; i++) {
        atr = (atr * (period - 1) + trueRanges[i]) / period;
    }
    return atr;
}

/**
 * 피보나치 1.618 확장
 */
export function calculateFibonacciExtension(swingLow: number, swingHigh: number, level = 1.618): number {
    return swingHigh + (swingHigh - swingLow) * (level - 1.0);
}

/**
 * 최근 N일 고점/저점 탐색
 */
export function findRecentHighLow(
    closes: number[], highs: number[], lows: number[], lookback = 60
): { recentHigh: number; recentLow: number } {
    const start = Math.max(0, closes.length - lookback);
    let recentHigh = highs[start], recentLow = lows[start];
    for (let i = start; i < closes.length; i++) {
        if (highs[i] > recentHigh) recentHigh = highs[i];
        if (lows[i] < recentLow) recentLow = lows[i];
    }
    return { recentHigh, recentLow };
}

/**
 * 2주 스윙 적합도 등급 산출
 * A: 조건 최적 / B: 양호 / C: 보통 / D: 부적합
 */
function calcSwingGrade(
    score: number,
    rr: number,
    vp: VolumeProfile | null,
    currentPrice: number,
    ma60: number
): 'A' | 'B' | 'C' | 'D' {
    let points = 0;

    // 스코어 (최대 3점)
    if (score >= 70) points += 3;
    else if (score >= 55) points += 2;
    else if (score >= 45) points += 1;

    // R/R 비율 (최대 2점)
    if (rr >= 3.0) points += 2;
    else if (rr >= 2.0) points += 1;

    // 매물대 위치 (최대 2점)
    if (vp) {
        if (vp.pricePosition === 'above_poc') points += 2;       // POC 위 = 강세
        else if (vp.pricePosition === 'at_poc') points += 1;     // POC 근처 = 중립
        // below_poc = 0점
    }

    // MA60 위 여부 (최대 1점)
    if (currentPrice > ma60) points += 1;

    // 8점 만점
    if (points >= 7) return 'A';
    if (points >= 5) return 'B';
    if (points >= 3) return 'C';
    return 'D';
}

/**
 * 핵심 함수: 매물대를 고려한 2주 스윙 트레이딩 매매 시그널 생성
 */
export function generateTradeSignal(
    symbol: string,
    currentPrice: number,
    bars: OhlcvBar[],
    indicators: {
        ma20: number; ma60: number; rsi: number;
        bbUpper: number; bbMiddle: number; bbLower: number;
        macdHistogram: number | null;
    },
    technicalScore: number,
    technicalSignal: 'BUY' | 'SELL' | 'NEUTRAL'
): TradeSignal {
    const closes = bars.map(b => b.close);
    const highs = bars.map(b => b.high);
    const lows = bars.map(b => b.low);

    // ATR 계산
    const atr = calculateATR(bars, 14);

    // 최근 60일 고점/저점
    const { recentHigh, recentLow } = findRecentHighLow(closes, highs, lows, 60);

    // ── Volume Profile 계산 (volume 있을 때만) ───────────────────────
    const barsWithVolume = bars.filter(b => b.volume !== undefined) as OhlcvBarWithVolume[];
    let vp: VolumeProfile | null = null;
    if (barsWithVolume.length >= 20) {
        vp = calculateVolumeProfile(barsWithVolume, currentPrice, 50, 60);
    }

    // ── 진입가 계산 ───────────────────────────────────────────────────
    const aggressiveEntry = currentPrice;

    // 보수적 진입: 매물대 지지 우선, 없으면 BB 하단/MA20
    let conservativeEntry: number;
    if (vp?.nearestSupport && vp.nearestSupport > indicators.bbLower) {
        // 매물대 지지선 직상단 (+0.3%)이 BB 하단보다 높을 때 → 매물대 기준
        conservativeEntry = Math.round(vp.nearestSupport * 1.003);
    } else {
        conservativeEntry = Math.round(Math.max(indicators.bbLower, indicators.ma20));
    }

    // ── 목표가 계산 ───────────────────────────────────────────────────
    // 2주(10 거래일) 내 최대 이동 범위: ATR × 10 (변동성 기반 상한)
    const twoWeekMaxMove = atr * 10;
    const twoWeekPriceCap = aggressiveEntry + twoWeekMaxMove;

    // 1차: 상단 저항 매물대 직전(-0.5%) 우선, 없으면 최근 고점/BB 상단
    let target1 = Math.round(Math.max(recentHigh, indicators.bbUpper));
    if (vp?.nearestResistance && vp.nearestResistance > currentPrice) {
        const vpTarget = Math.round(vp.nearestResistance * 0.995);
        if (vpTarget > currentPrice * 1.01) {
            target1 = vpTarget;
        }
    }
    // 2주 이익실현 주기에 현실적이지 않으면 ATR×5 (1주 기대치)로 캡
    if (target1 > twoWeekPriceCap) {
        target1 = Math.round(aggressiveEntry + atr * 5);
    }

    // 2차: 피보나치 1.618 (단, 2주 캡 적용)
    const fib2 = Math.round(calculateFibonacciExtension(recentLow, recentHigh, 1.618));
    const target2 = Math.min(fib2, Math.round(twoWeekPriceCap));

    // ── 손절가 계산 ───────────────────────────────────────────────────
    // ATR 기반
    const stopLossAtr = Math.round(aggressiveEntry - atr * 2);

    // 지지 기반: 매물대 지지선 하단(-1%) vs MA60 하단(-1%) 중 높은 쪽
    const ma60Support = Math.round(indicators.ma60 * 0.99);
    const vpSupport = vp?.nearestSupport
        ? Math.round(vp.nearestSupport * 0.99) : 0;
    const stopLossSupport = Math.round(Math.max(ma60Support, vpSupport));

    // 최종 손절: 두 손절 중 높은 쪽 (더 타이트한 손절)
    const effectiveStop = Math.max(stopLossAtr, stopLossSupport);

    // ── R/R 및 포지션 사이즈 ─────────────────────────────────────────
    const reward = target1 - aggressiveEntry;
    const risk = aggressiveEntry - effectiveStop;
    const riskRewardRatio = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;

    const stopLossPct = (risk / aggressiveEntry) * 100;
    const positionSizePercent = stopLossPct > 0
        ? parseFloat(Math.min(100, 1 / stopLossPct * 100).toFixed(1)) : 10;

    // 2주 예상 수익률
    const estimatedReturnPct = parseFloat(((target1 - aggressiveEntry) / aggressiveEntry * 100).toFixed(2));

    // ── 2주 스윙 적합도 등급 ──────────────────────────────────────────
    const swingGrade = calcSwingGrade(technicalScore, riskRewardRatio, vp, currentPrice, indicators.ma60);

    // ── 분석 근거 ─────────────────────────────────────────────────────
    const rationale: string[] = [];

    if (currentPrice > indicators.ma20) {
        rationale.push(`현재가(${currentPrice.toLocaleString()})가 MA20(${Math.round(indicators.ma20).toLocaleString()}) 위 → 단기 상승 추세`);
    } else {
        rationale.push(`현재가(${currentPrice.toLocaleString()})가 MA20(${Math.round(indicators.ma20).toLocaleString()}) 아래 → 단기 약세`);
    }

    if (indicators.rsi < 30) rationale.push(`RSI ${indicators.rsi.toFixed(1)} → 과매도, 반등 가능`);
    else if (indicators.rsi > 70) rationale.push(`RSI ${indicators.rsi.toFixed(1)} → 과매수, 조정 유의`);
    else rationale.push(`RSI ${indicators.rsi.toFixed(1)} → 중립`);

    // 매물대 해석 추가
    if (vp) {
        rationale.push(...interpretVolumeProfile(vp, currentPrice));
    }

    rationale.push(`ATR ${Math.round(atr).toLocaleString()} | 손절 ${effectiveStop.toLocaleString()} | R/R ${riskRewardRatio} | 2주 이익실현 목표 ${estimatedReturnPct}% (2주 최대이동 ${Math.round(twoWeekMaxMove).toLocaleString()}원)`);
    rationale.push(`스윙 적합도: ${swingGrade}등급 (${swingGrade === 'A' ? '최적' : swingGrade === 'B' ? '양호' : swingGrade === 'C' ? '보통' : '부적합'})`);

    return {
        symbol,
        currentPrice,
        signal: technicalSignal,
        score: technicalScore,
        swingGrade,
        levels: {
            aggressiveEntry,
            conservativeEntry,
            target1,
            target2,
            stopLossAtr,
            stopLossSupport,
            atr: Math.round(atr),
            riskRewardRatio,
            positionSizePercent,
            estimatedReturnPct,
        },
        volumeProfile: vp ? {
            poc: vp.poc,
            valueAreaHigh: vp.valueAreaHigh,
            valueAreaLow: vp.valueAreaLow,
            nearestResistance: vp.nearestResistance,
            nearestSupport: vp.nearestSupport,
            pricePosition: vp.pricePosition,
        } : undefined,
        rationale,
        indicators,
    };
}
