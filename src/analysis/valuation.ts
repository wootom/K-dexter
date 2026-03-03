/**
 * valuation.ts
 *
 * S-RIM (Simplified Residual Income Model) 기반 적정주가 계산 모듈
 *
 * 공식: 적정주가 = EPS / COE  (= BPS × ROE / COE)
 * COE 시나리오: 보수적(12%) / 기본(10%) / 낙관적(8%)
 */

export interface SRIMScenario {
    coe: number;        // 요구수익률 (소수점, 예: 0.10)
    fairValue: number;  // 적정주가 (원, 반올림)
    fairPBR: number;    // 적정 PBR = ROE / COE
    discount: number;   // 괴리율 (%) = (현재가 - 적정가) / 적정가 × 100
                        // 음수(-) = 저평가, 양수(+) = 고평가
}

export interface SRIMResult {
    method: 'S-RIM';
    inputs: {
        bps: number;
        eps: number;
        roe: number;          // % (예: 15.0)
        currentPrice: number;
        roeSource: 'direct' | 'derived';
    };
    scenarios: {
        conservative: SRIMScenario; // COE = 12%
        base: SRIMScenario;         // COE = 10%
        optimistic: SRIMScenario;   // COE = 8%
    };
    summary: {
        fairValueRange: { min: number; max: number };
        assessment: 'UNDERVALUED' | 'FAIR' | 'OVERVALUED';
        confidence: 'HIGH' | 'MEDIUM' | 'LOW';
        note?: string;
    };
}

export interface SRIMParams {
    bps: number | null | undefined;
    eps: number | null | undefined;
    roe: number | null | undefined; // %, 예: 15.0
    currentPrice: number;
}

const COE_SCENARIOS = {
    conservative: 0.12,
    base: 0.10,
    optimistic: 0.08,
} as const;

function calcScenario(
    eps: number,
    roe: number,
    bps: number,
    coe: number,
    currentPrice: number
): SRIMScenario {
    if (roe <= 0) {
        return { coe, fairValue: 0, fairPBR: 0, discount: 999 };
    }

    // EPS 기반 우선, fallback: BPS × (ROE/100)
    const effectiveEps = eps > 0 ? eps : bps * (roe / 100);
    const fairValue = Math.round(effectiveEps / coe);
    const fairPBR = parseFloat((roe / 100 / coe).toFixed(2));
    const discount = parseFloat(((currentPrice - fairValue) / fairValue * 100).toFixed(2));

    return { coe, fairValue, fairPBR, discount };
}

export function calculateSRIM(params: SRIMParams): SRIMResult | null {
    const { bps, eps, roe, currentPrice } = params;

    // 1. BPS 필수 검증
    const validBps = typeof bps === 'number' && !isNaN(bps) && bps > 0 ? bps : null;
    if (validBps === null) return null;

    // 2. ROE 확정 (직접값 우선, 없으면 EPS/BPS 역산)
    let effectiveRoe: number;
    let roeSource: 'direct' | 'derived';

    if (typeof roe === 'number' && !isNaN(roe)) {
        effectiveRoe = roe;
        roeSource = 'direct';
    } else if (typeof eps === 'number' && !isNaN(eps)) {
        effectiveRoe = (eps / validBps) * 100;
        roeSource = 'derived';
    } else {
        return null;
    }

    // 3. EPS 확정
    const validEps = typeof eps === 'number' && !isNaN(eps) ? eps : 0;

    // 4. 신뢰도 결정
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    let note: string | undefined;

    if (effectiveRoe <= 0) {
        confidence = 'LOW';
        note = 'ROE is negative or zero (loss-making period — S-RIM unreliable)';
    } else if (roeSource === 'derived') {
        confidence = 'MEDIUM';
        note = 'ROE derived from EPS/BPS (direct ROE unavailable)';
    } else {
        confidence = 'HIGH';
    }

    // 5. 시나리오 계산
    const conservative = calcScenario(validEps, effectiveRoe, validBps, COE_SCENARIOS.conservative, currentPrice);
    const base          = calcScenario(validEps, effectiveRoe, validBps, COE_SCENARIOS.base,         currentPrice);
    const optimistic    = calcScenario(validEps, effectiveRoe, validBps, COE_SCENARIOS.optimistic,   currentPrice);

    // 6. 종합 평가 (base 시나리오 COE=10% 기준)
    let assessment: 'UNDERVALUED' | 'FAIR' | 'OVERVALUED';
    if (base.fairValue === 0) {
        assessment = 'OVERVALUED';
    } else if (base.discount < -5) {
        assessment = 'UNDERVALUED';
    } else if (base.discount > 10) {
        assessment = 'OVERVALUED';
    } else {
        assessment = 'FAIR';
    }

    return {
        method: 'S-RIM',
        inputs: {
            bps: validBps,
            eps: validEps,
            roe: parseFloat(effectiveRoe.toFixed(2)),
            currentPrice,
            roeSource,
        },
        scenarios: { conservative, base, optimistic },
        summary: {
            fairValueRange: {
                min: conservative.fairValue,
                max: optimistic.fairValue,
            },
            assessment,
            confidence,
            ...(note && { note }),
        },
    };
}
