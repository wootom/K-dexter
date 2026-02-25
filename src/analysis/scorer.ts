
import { type AnalysisRequest, type AnalysisResponse, ConfidenceLevel, type AnalysisRequestSchema } from './types.js';
import { getMetadata } from './metadata.js';

/**
 * ① Trend Score (0~3)
 * price > ma20  -> +1
 * price > ma60  -> +1
 * price > ma120 -> +1
 */
export function calculateTrendScore(price: number, mas: AnalysisRequest['moving_averages']): number {
    let score = 0;
    if (price > mas.ma20) score += 1;
    if (price > mas.ma60) score += 1;
    if (price > mas.ma120) score += 1;
    return score;
}

/**
 * ② Momentum Score (-1~2)
 * RSI 40~65              -> +1
 * RSI > 70               -> 0
 * RSI < 40               -> -1
 * volume_5d >= volume_20d -> +1
 */
export function calculateMomentumScore(rsi: number, vol5: number, vol20: number): number {
    let score = 0;

    // RSI Logic
    if (rsi >= 40 && rsi <= 65) {
        score += 1;
    } else if (rsi > 70) {
        score += 0;
    } else if (rsi < 40) {
        score -= 1;
    }
    // If 65 < RSI <= 70, score remains 0 (gap in PRD, safe assumption)

    // Volume Logic
    if (vol5 >= vol20) {
        score += 1;
    }

    return score;
}

/**
 * ③ Flow Score (-1~1)
 * index_trend = up   -> +1
 * index_trend = flat -> 0
 * index_trend = down -> -1
 */
export function calculateFlowScore(indexTrend: AnalysisRequest['index_context']['index_trend']): number {
    switch (indexTrend) {
        case 'up': return 1;
        case 'flat': return 0;
        case 'down': return -1;
        default: return 0;
    }
}

/**
 * ④ Risk Score (-1~1)
 * Recent Surge Flag -> -1 (Infer using Price > 1.3 * MA120 as a proxy if no explicit flag)
 * Defensive Sector  -> +1
 */
export function calculateRiskScore(symbol: string, price: number, ma120: number): number {
    let score = 0;
    const metadata = getMetadata(symbol);

    // Defensive Sector
    if (metadata?.isDefensive) {
        score += 1;
    }

    // Recent Surge Logic (Proxy: Price is 30% above MA120)
    // PRD says "Recent Surge Flag", but input doesn't have it.
    if (price > ma120 * 1.3) {
        score -= 1;
    }

    return score;
}

/**
 * ⑤ Fundamental Score (-2~3)
 * PER < 10        -> +1
 * PBR < 1.0       -> +1
 * ROE > 10        -> +1
 * Debt Ratio > 200 -> -1
 * OP Margin > 5   -> +1 (simple benchmark)
 * 
 * Note: Data might be missing. If missing, score is 0.
 */
export function calculateFundamentalScore(fundamentals?: AnalysisRequest['fundamentals']): number {
    if (!fundamentals) return 0;

    let score = 0;

    // Valuation (Value)
    if (fundamentals.per !== undefined && fundamentals.per > 0 && fundamentals.per < 10) score += 1;
    if (fundamentals.pbr !== undefined && fundamentals.pbr > 0 && fundamentals.pbr < 1.0) score += 1;

    // Profitability (Quality)
    if (fundamentals.roe !== undefined && fundamentals.roe > 10) score += 1;
    if (fundamentals.op_margin !== undefined && fundamentals.op_margin > 5) score += 1; // Simple benchmark, sector dependent in reality

    // Stability (Risk)
    if (fundamentals.debt_ratio !== undefined && fundamentals.debt_ratio > 200) score -= 1;

    return Math.max(-2, Math.min(3, score)); // Clamp range
}

export function analyze(request: AnalysisRequest): AnalysisResponse {
    const { price, moving_averages, volume, momentum, index_context, symbol, fundamentals } = request;

    const trend = calculateTrendScore(price, moving_averages);
    const momentumScore = calculateMomentumScore(momentum.rsi_14, volume.avg_5d, volume.avg_20d);
    const flow = calculateFlowScore(index_context.index_trend);
    const risk = calculateRiskScore(symbol, price, moving_averages.ma120);
    const fundamental = calculateFundamentalScore(fundamentals);

    // Total Score: Trend(0~3) + Momentum(-1~2) + Flow(-1~1) + Risk(-1~1) + Fundamental(-2~3)
    // Max: 3 + 2 + 1 + 1 + 3 = 10
    // Min: 0 - 1 - 1 - 1 - 2 = -5
    const total = trend + momentumScore + flow + risk + fundamental;

    let judgment = '';
    // Adjusted thresholds for new total range
    if (total >= 6) judgment = 'AGRESSIVE_BUY';
    else if (total >= 3) judgment = 'BUY_DIPS';
    else if (total >= 0) judgment = 'HOLD';
    else judgment = 'AVOID';

    // Strings mapping based on Logic
    let state = '';
    if (trend >= 2) state = '상승 추세';
    else if (trend === 1) state = '중립 구간';
    else state = '하락 추세';

    // Refine state based on Total
    if (judgment === 'BUY_DIPS' && trend >= 2) state = '상승 추세 속 조정';
    // Add fundamental context to state
    if (fundamental >= 2) state += ' (저평가/우량)';

    // Strategy Strings
    let strategy = {
        short_term: '',
        mid_term: ''
    };

    switch (judgment) {
        case 'AGRESSIVE_BUY':
            strategy.short_term = '적극 매수 유효';
            strategy.mid_term = '추세 추종 및 비중 확대';
            break;
        case 'BUY_DIPS':
            strategy.short_term = '추격 매수 자제';
            strategy.mid_term = '눌림목 분할 매수';
            break;
        case 'HOLD':
            strategy.short_term = '관망';
            strategy.mid_term = '기존 보유분 유지';
            break;
        case 'AVOID':
            strategy.short_term = '매수 보류';
            strategy.mid_term = '리스크 관리 (현금화)';
            break;
    }

    return {
        symbol,
        scores: {
            trend,
            momentum: momentumScore,
            flow,
            risk,
            fundamental, // Add to response
            total
        },
        state,
        strategy,
        confidence_level: ConfidenceLevel.MEDIUM
    };
}
