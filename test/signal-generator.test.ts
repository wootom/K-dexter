import { describe, expect, test } from 'bun:test';
import {
    calculateATR,
    calculateFibonacciExtension,
    findRecentHighLow,
    generateTradeSignal,
    type OhlcvBar,
} from '../src/analysis/signal-generator';

// ─── 테스트용 샘플 데이터 생성 ──────────────────────────────────────────────
function makeBars(count: number, basePrice = 50000, volatility = 1000): OhlcvBar[] {
    const bars: OhlcvBar[] = [];
    let price = basePrice;
    for (let i = 0; i < count; i++) {
        const open = price;
        const close = price + (Math.random() - 0.5) * volatility;
        const high = Math.max(open, close) + Math.random() * volatility * 0.5;
        const low = Math.min(open, close) - Math.random() * volatility * 0.5;
        bars.push({ high, low, close });
        price = close;
    }
    return bars;
}

// ─── ATR 계산 테스트 ────────────────────────────────────────────────────────
describe('calculateATR', () => {
    test('정상적인 OHLCV 데이터에서 양수 ATR을 반환해야 함', () => {
        const bars = makeBars(30, 50000, 1000);
        const atr = calculateATR(bars, 14);
        expect(atr).toBeGreaterThan(0);
    });

    test('데이터가 부족하면 단순 High-Low 평균으로 대체해야 함', () => {
        const bars = makeBars(5, 50000, 500);
        const atr = calculateATR(bars, 14);
        expect(atr).toBeGreaterThan(0);
    });

    test('변동성이 없으면 ATR이 0에 가까워야 함', () => {
        const bars: OhlcvBar[] = Array.from({ length: 20 }, () => ({
            high: 50100,
            low: 49900,
            close: 50000,
        }));
        const atr = calculateATR(bars, 14);
        expect(atr).toBeGreaterThan(0);
        expect(atr).toBeLessThan(500); // 변동성 범위 내
    });
});

// ─── 피보나치 확장 테스트 ────────────────────────────────────────────────────
describe('calculateFibonacciExtension', () => {
    test('1.618 레벨은 스윙 고점보다 높아야 함', () => {
        const swingLow = 40000;
        const swingHigh = 50000;
        const target = calculateFibonacciExtension(swingLow, swingHigh, 1.618);
        expect(target).toBeGreaterThan(swingHigh);
    });

    test('피보나치 1.618 계산이 정확해야 함', () => {
        // swingHigh + (swingHigh - swingLow) * (1.618 - 1.0)
        // 50000 + 10000 * 0.618 = 56180
        const target = calculateFibonacciExtension(40000, 50000, 1.618);
        expect(target).toBeCloseTo(56180, 0);
    });
});

// ─── 최근 고점/저점 탐색 테스트 ─────────────────────────────────────────────
describe('findRecentHighLow', () => {
    test('최근 N일 내 최고가와 최저가를 정확히 반환해야 함', () => {
        const closes = [50000, 52000, 48000, 55000, 47000];
        const highs = [51000, 53000, 49000, 56000, 48000];
        const lows = [49000, 51000, 47000, 54000, 46000];
        const { recentHigh, recentLow } = findRecentHighLow(closes, highs, lows, 5);
        expect(recentHigh).toBe(56000);
        expect(recentLow).toBe(46000);
    });

    test('lookback이 데이터 길이보다 크면 전체를 사용해야 함', () => {
        const closes = [50000, 52000];
        const highs = [51000, 53000];
        const lows = [49000, 51000];
        const { recentHigh, recentLow } = findRecentHighLow(closes, highs, lows, 100);
        expect(recentHigh).toBe(53000);
        expect(recentLow).toBe(49000);
    });
});

// ─── generateTradeSignal 통합 테스트 ────────────────────────────────────────
describe('generateTradeSignal', () => {
    const bars = makeBars(60, 50000, 1000);
    const currentPrice = bars[bars.length - 1].close;
    const indicators = {
        ma20: currentPrice * 0.98,
        ma60: currentPrice * 0.95,
        rsi: 55,
        bbUpper: currentPrice * 1.05,
        bbMiddle: currentPrice * 0.98,
        bbLower: currentPrice * 0.93,
        macdHistogram: 50,
    };

    test('TradeSignal 객체의 필수 필드가 모두 존재해야 함', () => {
        const signal = generateTradeSignal('005930', currentPrice, bars, indicators, 65, 'BUY');
        expect(signal.symbol).toBe('005930');
        expect(signal.levels).toBeDefined();
        expect(signal.levels.aggressiveEntry).toBeGreaterThan(0);
        expect(signal.levels.target1).toBeGreaterThan(0);
        expect(signal.levels.stopLossAtr).toBeGreaterThan(0);
        expect(signal.levels.riskRewardRatio).toBeGreaterThan(0);
        expect(signal.rationale.length).toBeGreaterThan(0);
    });

    test('손절가는 진입가보다 낮아야 함', () => {
        const signal = generateTradeSignal('005930', currentPrice, bars, indicators, 65, 'BUY');
        expect(signal.levels.stopLossAtr).toBeLessThan(signal.levels.aggressiveEntry);
        expect(signal.levels.stopLossSupport).toBeLessThan(signal.levels.aggressiveEntry);
    });

    test('목표가는 진입가보다 높아야 함', () => {
        const signal = generateTradeSignal('005930', currentPrice, bars, indicators, 65, 'BUY');
        expect(signal.levels.target1).toBeGreaterThan(signal.levels.aggressiveEntry);
        expect(signal.levels.target2).toBeGreaterThan(signal.levels.aggressiveEntry);
    });

    test('2차 목표가는 1차 목표가보다 높아야 함', () => {
        const signal = generateTradeSignal('005930', currentPrice, bars, indicators, 65, 'BUY');
        expect(signal.levels.target2).toBeGreaterThan(signal.levels.target1);
    });

    test('포지션 사이즈는 0% 초과 100% 이하여야 함', () => {
        const signal = generateTradeSignal('005930', currentPrice, bars, indicators, 65, 'BUY');
        expect(signal.levels.positionSizePercent).toBeGreaterThan(0);
        expect(signal.levels.positionSizePercent).toBeLessThanOrEqual(100);
    });
});
