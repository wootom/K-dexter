
/**
 * signal-generator.ts
 *
 * 기술적 지표 데이터를 기반으로 구체적인 매매 가격 레벨(진입가, 목표가, 손절가)을 계산합니다.
 * ATR(Average True Range) 기반 손절가와 피보나치 비율 기반 목표가를 지원합니다.
 */

export interface OhlcvBar {
    high: number;
    low: number;
    close: number;
}

export interface TradeLevels {
    /** 공격적 진입 (현재가 즉시 매수) */
    aggressiveEntry: number;
    /** 보수적 진입 (눌림목 기다림: BB 하단 또는 MA20 중 높은 쪽) */
    conservativeEntry: number;
    /** 1차 목표가: 최근 고점 또는 BB 상단 */
    target1: number;
    /** 2차 목표가: 피보나치 1.618 확장 */
    target2: number;
    /** ATR 기반 손절가 (진입가 - ATR * 2) */
    stopLossAtr: number;
    /** 지지선 기반 손절가 (MA60 기준) */
    stopLossSupport: number;
    /** ATR 값 (변동성 지표) */
    atr: number;
    /** 리스크/리워드 비율 (보수적 진입 기준, 1차 목표가 대비) */
    riskRewardRatio: number;
    /** 포지션 사이즈 권고 (계좌 1% 위험 원칙) */
    positionSizePercent: number;
}

export interface TradeSignal {
    symbol: string;
    currentPrice: number;
    signal: 'BUY' | 'SELL' | 'NEUTRAL';
    score: number;
    levels: TradeLevels;
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
 * ATR(Average True Range) 계산
 * 기간 내 가격 변동성의 평균을 반환합니다.
 *
 * @param bars - OHLCV 배열 (Oldest -> Newest)
 * @param period - ATR 계산 기간 (기본 14일)
 */
export function calculateATR(bars: OhlcvBar[], period: number = 14): number {
    if (bars.length < period + 1) {
        // 데이터 부족 시 단순 High-Low 평균으로 대체
        const recentBars = bars.slice(-period);
        const avgRange = recentBars.reduce((sum, b) => sum + (b.high - b.low), 0) / recentBars.length;
        return avgRange;
    }

    // True Range 계산
    const trueRanges: number[] = [];
    for (let i = 1; i < bars.length; i++) {
        const high = bars[i].high;
        const low = bars[i].low;
        const prevClose = bars[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trueRanges.push(tr);
    }

    // Wilder's Smoothed Moving Average (RMA)
    const initialATR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let atr = initialATR;
    for (let i = period; i < trueRanges.length; i++) {
        atr = (atr * (period - 1) + trueRanges[i]) / period;
    }

    return atr;
}

/**
 * 피보나치 확장 레벨 계산
 * 스윙 저점에서 현재 고점까지의 상승폭을 기반으로 목표가를 추정합니다.
 *
 * @param swingLow - 최근 스윙 저점 (지지선)
 * @param swingHigh - 최근 스윙 고점
 * @param level - 피보나치 레벨 (기본 1.618)
 */
export function calculateFibonacciExtension(
    swingLow: number,
    swingHigh: number,
    level: number = 1.618
): number {
    const range = swingHigh - swingLow;
    return swingHigh + range * (level - 1.0);
}

/**
 * 최근 N일 내 최고가/최저가 탐색
 */
export function findRecentHighLow(
    closes: number[],
    highs: number[],
    lows: number[],
    lookback: number = 60
): { recentHigh: number; recentLow: number } {
    const len = closes.length;
    const start = Math.max(0, len - lookback);

    let recentHigh = highs[start];
    let recentLow = lows[start];

    for (let i = start; i < len; i++) {
        if (highs[i] > recentHigh) recentHigh = highs[i];
        if (lows[i] < recentLow) recentLow = lows[i];
    }

    return { recentHigh, recentLow };
}

/**
 * 핵심 함수: 매매 가격 레벨 생성
 *
 * @param symbol - 종목코드
 * @param currentPrice - 현재가
 * @param bars - OHLCV 배열 (Oldest -> Newest)
 * @param indicators - 사전 계산된 기술 지표들
 * @param technicalScore - 기술적 점수 (0-100)
 * @param technicalSignal - 기술적 시그널
 */
export function generateTradeSignal(
    symbol: string,
    currentPrice: number,
    bars: OhlcvBar[],
    indicators: {
        ma20: number;
        ma60: number;
        rsi: number;
        bbUpper: number;
        bbMiddle: number;
        bbLower: number;
        macdHistogram: number | null;
    },
    technicalScore: number,
    technicalSignal: 'BUY' | 'SELL' | 'NEUTRAL'
): TradeSignal {
    const closes = bars.map(b => b.close);
    const highs = bars.map(b => b.high);
    const lows = bars.map(b => b.low);

    // ATR 계산 (14일)
    const atr = calculateATR(bars, 14);

    // 최근 60일 고점/저점
    const { recentHigh, recentLow } = findRecentHighLow(closes, highs, lows, 60);

    // ── 진입가 계산 ──────────────────────────────────────────
    // 공격적: 현재가 (즉시 매수)
    const aggressiveEntry = currentPrice;

    // 보수적: BB 하단과 MA20 중 높은 쪽 (과매도 반등 지점)
    const conservativeEntry = Math.max(indicators.bbLower, indicators.ma20);

    // ── 목표가 계산 ──────────────────────────────────────────
    // 1차: 최근 고점 또는 BB 상단 중 높은 쪽
    const target1 = Math.max(recentHigh, indicators.bbUpper);

    // 2차: 피보나치 1.618 확장 (최근 저점 -> 고점)
    const target2 = calculateFibonacciExtension(recentLow, recentHigh, 1.618);

    // ── 손절가 계산 ──────────────────────────────────────────
    // ATR 기반: 진입가 - (ATR * 2) [변동성 기반 동적 손절]
    const stopLossAtr = aggressiveEntry - atr * 2;

    // 지지선 기반: MA60 (중기 추세선 이탈 시 청산)
    const stopLossSupport = indicators.ma60 * 0.99; // MA60 대비 1% 여유

    // ── 리스크/리워드 계산 ────────────────────────────────────
    // 보수적 진입 기준, 1차 목표가 대비 R/R
    const risk = Math.max(aggressiveEntry - stopLossAtr, aggressiveEntry - stopLossSupport);
    const reward = target1 - aggressiveEntry;
    const riskRewardRatio = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;

    // ── 포지션 사이즈 권고 ────────────────────────────────────
    // 계좌 1% 위험 원칙: 포지션 비율 = 1% / (손절 % / 100)
    const stopLossPercent = ((aggressiveEntry - stopLossAtr) / aggressiveEntry) * 100;
    const positionSizePercent = stopLossPercent > 0
        ? parseFloat(Math.min(100, 1 / stopLossPercent * 100).toFixed(1))
        : 10; // 기본 10%

    // ── 분석 근거 생성 ────────────────────────────────────────
    const rationale: string[] = [];

    if (currentPrice > indicators.ma20) {
        rationale.push(`현재가(${currentPrice.toLocaleString()})가 MA20(${indicators.ma20.toFixed(0)}) 위 → 단기 상승 추세`);
    } else {
        rationale.push(`현재가(${currentPrice.toLocaleString()})가 MA20(${indicators.ma20.toFixed(0)}) 아래 → 단기 약세`);
    }

    if (indicators.rsi < 30) {
        rationale.push(`RSI ${indicators.rsi.toFixed(1)} → 과매도 구간, 반등 가능성`);
    } else if (indicators.rsi > 70) {
        rationale.push(`RSI ${indicators.rsi.toFixed(1)} → 과매수 구간, 조정 유의`);
    } else {
        rationale.push(`RSI ${indicators.rsi.toFixed(1)} → 중립 구간`);
    }

    rationale.push(`ATR ${atr.toFixed(0)} (14일 변동성), 손절가: ${stopLossAtr.toFixed(0)} / 지지 손절: ${stopLossSupport.toFixed(0)}`);
    rationale.push(`리스크/리워드: ${riskRewardRatio.toFixed(2)} (권장 ≥ 2.0)`);

    return {
        symbol,
        currentPrice,
        signal: technicalSignal,
        score: technicalScore,
        levels: {
            aggressiveEntry: parseFloat(aggressiveEntry.toFixed(0)),
            conservativeEntry: parseFloat(conservativeEntry.toFixed(0)),
            target1: parseFloat(target1.toFixed(0)),
            target2: parseFloat(target2.toFixed(0)),
            stopLossAtr: parseFloat(stopLossAtr.toFixed(0)),
            stopLossSupport: parseFloat(stopLossSupport.toFixed(0)),
            atr: parseFloat(atr.toFixed(0)),
            riskRewardRatio,
            positionSizePercent,
        },
        rationale,
        indicators,
    };
}
