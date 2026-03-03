/**
 * types.ts
 *
 * 백테스트 엔진에서 사용하는 모든 타입 정의
 */

/** KIS fetchDailyOHLCV 응답을 숫자로 정규화한 OHLCV 레코드 (날짜 오름차순) */
export interface OhlcvRecord {
    date: string;    // "YYYYMMDD"
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

/** calcSwingGrade 가중치 오버라이드 */
export interface SwingGradeWeights {
    technicalScoreMax: number;  // default: 3
    rrScoreMax: number;         // default: 2
    volumeProfileMax: number;   // default: 2
    ma60Max: number;            // default: 1
}

/** Grade 임계값 오버라이드 */
export interface SwingGradeThresholds {
    A: number;  // default: 7 (이상이면 A)
    B: number;  // default: 5
    C: number;  // default: 3
}

/** 백테스트 실행 설정 */
export interface BacktestConfig {
    universe: string[];                          // 종목코드 리스트
    gradeFilter: ('A' | 'B' | 'C' | 'D')[];    // 진입 대상 grade (default: ['A'])
    holdingPeriod: number;                       // 보유 거래일 (default: 10)
    weights?: SwingGradeWeights;                 // 미지정 시 기본값 사용
    thresholds?: SwingGradeThresholds;           // 미지정 시 기본값 사용
}

/** 개별 거래 결과 */
export interface BacktestTrade {
    symbol: string;
    entryDate: string;                // 진입일 (YYYYMMDD)
    entryPrice: number;               // 진입가 (익일 시가)
    exitDate: string;                 // 청산일
    exitPrice: number;                // 청산가 (보유기간 마지막 종가)
    swingGrade: 'A' | 'B' | 'C' | 'D';
    gradeScore: number;               // 총점 (0~8)
    technicalScore: number;           // 기술점수 기여 (0~3)
    rrScore: number;                  // R/R 기여 (0~2)
    volumeProfileScore: number;       // 매물대 기여 (0~2)
    ma60Score: number;                // MA60 기여 (0~1)
    returnPct: number;                // (exitPrice - entryPrice) / entryPrice × 100
    peakPrice: number;                // 보유기간 최고가
    maxFavorableExcursion: number;    // (peakPrice - entryPrice) / entryPrice × 100
    maxAdverseExcursion: number;      // (troughPrice - entryPrice) / entryPrice × 100
    targetAchieved: boolean;          // 목표가 도달 여부
    stopLossHit: boolean;             // 손절가 도달 여부
    expectedRR: number;               // 예상 R/R
    targetPrice: number;              // 목표가
    stopLossPrice: number;            // 손절가
}

/** 백테스트 종합 결과 */
export interface BacktestResult {
    id: string;               // UUID
    config: BacktestConfig;
    executedAt: string;       // ISO 8601
    summary: {
        totalTrades: number;
        winRate: number;          // 0~100
        avgReturn: number;        // %
        medianReturn: number;     // %
        stdReturn: number;        // %
        sharpeRatio: number;
        maxDrawdown: number;      // % (음수)
        targetHitRate: number;    // 0~100
        stopLossHitRate: number;  // 0~100
        profitFactor: number;     // 총이익 / |총손실|
    };
    gradeBreakdown: {
        grade: 'A' | 'B' | 'C' | 'D';
        tradeCount: number;
        winRate: number;
        avgReturn: number;
        targetHitRate: number;
    }[];
    factorCorrelation: {
        factor: 'technicalScore' | 'rrScore' | 'volumeProfileScore' | 'ma60Score';
        correlationWithReturn: number;  // 피어슨 상관계수 (-1 ~ 1)
        avgReturnWhenHigh: number;      // 해당 factor 최대 점수일 때 평균 수익률
        avgReturnWhenLow: number;       // 0점일 때 평균 수익률
    }[];
    equityCurve: { date: string; cumulativeReturn: number }[];
    trades: BacktestTrade[];
}

/** Parameter Sweep 결과 */
export interface ParameterSweepResult {
    id: string;
    executedAt: string;
    combinations: {
        gradeThreshold: number;
        weights: { tech: number; rr: number; vp: number; ma60: number };
        totalTrades: number;
        winRate: number;
        avgReturn: number;
        sharpeRatio: number;
        maxDrawdown: number;
    }[];
    bestByWinRate: {
        gradeThreshold: number;
        weights: SwingGradeWeights;
        winRate: number;
    };
    bestBySharpe: {
        gradeThreshold: number;
        weights: SwingGradeWeights;
        sharpeRatio: number;
    };
}
