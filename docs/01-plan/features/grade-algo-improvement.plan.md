# Plan: Grade 알고리즘 성과 기반 개선

**Feature ID**: grade-algo-improvement
**Status**: Plan
**Created**: 2026-02-27
**Updated**: 2026-02-27
**Level**: Dynamic

---

## 1. 배경 (Background)

### 현재 시스템

K-Dexter는 매일 새벽 한국 주식을 분석하여 Swing Grade(A/B/C/D)를 산출한다.

**현재 Swing Grade 산출 로직** (`signal-generator.ts`):

| 평가 항목 | 조건 | 점수 |
|-----------|------|------|
| Technical Score | ≥70 | +3 |
| | 55~69 | +2 |
| | 45~54 | +1 |
| Risk/Reward 비율 | ≥3.0 | +2 |
| | 2.0~2.9 | +1 |
| Volume Profile 위치 | POC 위 | +2 |
| | POC 수준 | +1 |
| | POC 아래 | 0 |
| MA60 대비 주가 | 주가 > MA60 | +1 |

- **A grade (7~8점)**: 최적 — 공격적 진입 권장
- **B grade (5~6점)**: 양호 — 리스크 관리 하에 진입 가능
- **C grade (3~4점)**: 보통 — 관망 또는 소량 포지션
- **D grade (0~2점)**: 불량 — 보류/진입 회피

### 문제: 피드백 루프 부재

현재 시스템은 **단방향 예측**만 한다.
- A grade 판정 → 진입 추천 → **실제 결과 확인 안 함**
- 알고리즘이 실제 수익률을 반영하여 진화하지 않음
- 각 채점 항목의 가중치가 고정됨 (실증 데이터 없음)

### 해결 방안: 이중 검증 전략

KIS API가 **200일 과거 OHLCV 데이터**를 제공하므로 두 가지 병행 전략이 가능하다:

1. **백테스트 (즉시 검증)**: 과거 데이터로 알고리즘을 소급 적용하여 즉시 성과 검증
2. **실시간 추적 (지속 검증)**: 신규 A grade 종목을 실시간으로 추적하여 지속 검증

---

## 2. 목표 (Goals)

### 핵심 목표

> **A grade 종목의 실제 시가/종가 데이터를 수집하여,
> 기대수익률과 실제수익률을 비교분석하고,
> 이를 근거로 grade 산정 알고리즘의 가중치를 데이터 기반으로 개선한다.**

### 세부 목표

1. **성과 추적**: Grade 부여 시점부터 2주(10 거래일) 보유 기간 동안의 시가/종가 수집
2. **기대수익률 검증**: 분석 시점의 예상 R/R 비율과 실제 R/R 비율 비교
3. **알고리즘 인사이트**: 어떤 채점 항목이 실제 수익률을 가장 잘 예측하는지 파악
4. **임계값 재조정**: Grade 구분 점수(7~8점 A, 5~6점 B...)를 실증 데이터로 재검증
5. **백테스트 기반 즉시 검증**: 200일 과거 데이터를 활용하여 실시간 대기 없이 알고리즘 성과 검증
6. **분석 웹 대시보드**: 백테스트 설정/결과/실시간 추적을 시각적으로 확인하는 웹 UI 제공

---

## 3. 성공 지표 (Success Metrics)

### 실시간 추적 지표

| 지표 | 현재 | 목표 |
|------|------|------|
| A grade 종목 2주 수익률 승률 | 측정 안 됨 | > 60% |
| A grade 평균 실제 R/R | 측정 안 됨 | > 2.0 |
| 기대수익률 달성률 (목표가 도달) | 측정 안 됨 | > 40% |
| B grade vs A grade 승률 격차 | 측정 안 됨 | > 10%p 차이 확인 |

### 백테스트 지표

| 지표 | 설명 | 목표 |
|------|------|------|
| 백테스트 구간 승률 (A grade) | 과거 N일간 A grade 종목의 10거래일 보유 승률 | > 55% |
| 백테스트 평균 수익률 | 전 구간 A grade 평균 수익률 | > 3% |
| Sharpe-like Ratio | (평균수익률 / 수익률 표준편차) | > 1.0 |
| 최대 낙폭 (Max Drawdown) | 누적 수익 곡선 기준 최대 하락폭 | < 15% |
| 목표가 도달률 | 보유기간 내 target1 도달 비율 | > 35% |
| Grade 변별력 | A grade 승률 - D grade 승률 | > 25%p |
| 최적 임계값 발견 | Parameter sweep로 최적 A grade 커트라인 식별 | 명확한 피크 존재 |

### 웹 대시보드 지표

| 지표 | 설명 | 목표 |
|------|------|------|
| 백테스트 실행 → 결과 표시 | 전체 파이프라인 완료 시간 | < 30초 (50종목 기준) |
| 대시보드 페이지 로드 시간 | 정적 페이지 초기 렌더링 | < 2초 |

---

## 4. 핵심 컨셉 (Core Concept)

### 4-1. 데이터 수집 파이프라인

```
[매일 새벽 Grade 업데이트]
        ↓
[A grade 종목 목록 추출]
        ↓
[당일 시가(Open) 기록] ← 분석 시점 진입가로 간주
        ↓
[10 거래일간 종가(Close) 추적]
        ↓
[최고가, 최종 종가, 목표가 도달 여부 기록]
```

### 4-2. 기대수익률 vs 실제수익률 비교 모델

```
기대수익률 = (목표가 - 진입가) / 진입가 × 100
실제수익률 = (보유기간 최고가 - 시가) / 시가 × 100
목표가 달성 여부 = 보유기간 중 최고가 ≥ 목표가

R/R 예상 = 분석 시점 signal_generator의 R/R 비율
R/R 실제 = (최고가 - 시가) / (시가 - 손절가)
```

### 4-3. Grade 채점 항목 기여도 분석

각 채점 항목별로 실제 수익률과의 상관관계를 분석:

```
Technical Score    ↔ 실제수익률 상관계수
R/R 비율 점수     ↔ 목표가 달성률
Volume Profile     ↔ 손절 발생률
MA60 위치         ↔ 2주 수익률
```

---

## 5. 기능 범위 (Feature Scope)

### In-Scope

- [ ] **성과 이력 저장소**: A/B grade 종목의 진입 시점 데이터 스냅샷 저장
  - 분석 시점 grade, technical_score, r_r_ratio, volume_position, ma60_position
  - 분석 시점 예상 진입가, 목표가, 손절가

- [ ] **일별 추적 API**: 이전에 기록된 A grade 종목의 당일 시가/종가 수집

- [ ] **성과 분석 리포트**: 설정 기간(2주 or 커스텀)이 지난 후 성과 요약
  - 승률(Win Rate), 평균 R/R, 목표가 달성률, 최대 낙폭(MDD)

- [ ] **알고리즘 인사이트 리포트**: 각 채점 항목의 예측력 분석

- [ ] **Grade 임계값 재조정 제안**: 성과 데이터 기반으로 A/B/C/D 경계값 재제안

- [ ] **백테스트 엔진**: 200일 과거 데이터를 활용한 소급 성과 검증
  - Look-ahead bias 방지 로직
  - Parameter sweep (가중치/임계값 최적화)
  - 종합 통계 리포트 (승률, 수익률, Sharpe, MDD)

- [ ] **분석 웹 대시보드**: 백테스트 설정/결과/실시간 추적 웹 UI
  - Page 1: 백테스트 설정 페이지
  - Page 2: 백테스트 결과 페이지 (차트, 테이블, 히트맵)
  - Page 3: 실시간 성과 추적 페이지

### Out-of-Scope (이번 기획에서 제외)

- 자동 매매 연동 (알림/시그널 확인만)
- 실시간 가격 모니터링 (새벽 배치만)
- US 종목 성과 추적 (KR 종목만 우선)
- ML 모델 자동 학습 (수동 분석 → 수동 가중치 조정)
- 복잡한 프론트엔드 프레임워크 (Next.js, Remix 등 — 단순 정적 HTML+JS 우선)
- 사용자 인증/멀티테넌시 (싱글유저 로컬 대시보드)
- 모바일 반응형 UI (데스크탑 우선)

---

## 6. 데이터 구조 (Data Model Concept)

### GradeSnapshot (Grade 부여 시점 스냅샷)

```typescript
interface GradeSnapshot {
  id: string;                    // 종목코드_날짜
  symbol: string;                // 종목코드 (ex: "005930")
  recordedAt: string;            // 스냅샷 기록 일시 (새벽 업데이트)

  // Grade 정보
  swingGrade: 'A' | 'B' | 'C' | 'D';
  gradeScore: number;            // 0~8점

  // 채점 세부 항목 (분석 기여도 파악용)
  technicalScore: number;        // 0~3점
  rrScore: number;               // 0~2점
  volumeProfileScore: number;    // 0~2점
  ma60Score: number;             // 0~1점

  // 예상값 (기대수익률 계산 기준)
  aggressiveEntryPrice: number;  // 진입가 (당일 시가로 대체 가능)
  targetPrice: number;           // 목표가
  stopLossPrice: number;         // 손절가
  expectedRR: number;            // 예상 R/R 비율
  expectedReturn: number;        // 기대수익률 (%)
}
```

### DailyPriceRecord (일별 가격 추적)

```typescript
interface DailyPriceRecord {
  snapshotId: string;           // GradeSnapshot 참조
  symbol: string;
  date: string;                 // YYYY-MM-DD
  open: number;                 // 시가
  close: number;                // 종가
  high: number;                 // 고가
  low: number;                  // 저가
  tradingDay: number;           // 스냅샷 기준 N번째 거래일 (1~10)
}
```

### PerformanceResult (보유기간 종료 후 성과)

```typescript
interface PerformanceResult {
  snapshotId: string;
  symbol: string;

  // 실제 성과
  actualEntryPrice: number;     // 실제 진입가 (당일 시가)
  peakPrice: number;            // 보유기간 최고가
  finalClose: number;           // 10거래일 종가

  // 성과 지표
  actualReturn: number;         // 실제 수익률 (%)
  actualRR: number;             // 실제 R/R
  targetAchieved: boolean;      // 목표가 도달 여부
  stopLossHit: boolean;         // 손절 도달 여부
  holdingDays: number;          // 실제 추적 거래일수

  // 기대 vs 실제 비교
  expectedReturn: number;       // 기대수익률
  returnGap: number;            // 실제 - 기대 (양수 = 상회)
}
```

---

## 7. API 설계 컨셉 (API Concept)

### 실시간 추적 API

```
POST /k-dexter/grade-tracking/snapshot
  → 오늘 A/B grade 종목의 스냅샷 저장 (새벽 배치 트리거)

GET  /k-dexter/grade-tracking/daily-update
  → 추적 중인 종목의 당일 시가/종가 수집 및 기록

GET  /k-dexter/grade-tracking/performance?days=14
  → 지정 기간 내 완료된 종목들의 성과 리포트

GET  /k-dexter/grade-tracking/insights
  → 채점 항목별 예측력 분석 (상관계수, 승률 기여도)
```

### 백테스트 API

```
POST /k-dexter/backtest/run
  → 백테스트 실행 (BacktestConfig 전달 → BacktestResult 반환)

GET  /k-dexter/backtest/results/:id
  → 특정 백테스트 결과 조회

GET  /k-dexter/backtest/results
  → 과거 백테스트 실행 이력 목록

POST /k-dexter/backtest/parameter-sweep
  → Parameter sweep 실행 (다수 임계값/가중치 조합 테스트)
```

### 웹 대시보드 라우트

```
GET  /dashboard          → 백테스트 설정 페이지 (index.html)
GET  /dashboard/results  → 백테스트 결과 페이지
GET  /dashboard/live     → 실시간 성과 추적 페이지
```

---

## 8. 단계별 구현 로드맵 (Implementation Roadmap)

### Phase 1: 데이터 수집 기반 (2주)
- 파일 기반 저장소로 GradeSnapshot 저장 시작
- 기존 `/k-dexter/analyze/kr` 응답에서 스냅샷 추출
- 새벽 배치 스크립트 구성

### Phase 2: 일별 추적 (1주)
- DailyPriceRecord 수집 API 구현
- KIS API를 활용한 시가/종가 자동 수집

### Phase 3: 백테스트 엔진 (2주)
- BacktestConfig / BacktestResult 데이터 모델 구현
- 백테스트 코어 엔진 구현 (look-ahead bias 방지 포함)
- Per-trade 결과 + 집계 통계 계산 (승률, Sharpe, MDD, Profit Factor)
- Parameter sweep 로직 구현 (가중치 × 임계값 조합)
- `POST /k-dexter/backtest/run` API 엔드포인트

### Phase 4: 성과 분석 (1주)
- 10거래일 경과 종목 PerformanceResult 자동 계산
- 기본 통계 리포트 생성 (승률, 평균 R/R, 달성률)

### Phase 5: 분석 웹 대시보드 (2주)
- Hono `serveStatic` 정적 파일 서빙 설정
- Page 1: 백테스트 설정 UI (종목/기간/가중치/임계값 입력)
- Page 2: 백테스트 결과 UI (Chart.js 차트, 히트맵, 거래 테이블)
- Page 3: 실시간 성과 추적 UI (추적 종목 현황, 완료 성과 요약)

### Phase 6: 알고리즘 개선 (지속)
- 채점 항목별 상관관계 분석
- Grade 임계값 재조정 실험
- 개선된 가중치 적용 후 A/B 테스트

---

## 9. 리스크 & 고려사항 (Risks & Considerations)

| 리스크 | 영향도 | 대응 |
|--------|--------|------|
| KIS API 일일 호출 한도 초과 | 높음 | 추적 종목 수 제한 (A grade만 우선) |
| 데이터 부족 (통계 유의성) | 높음 | 최소 30개 완료 종목 이후 분석 |
| 시장 국면 변화 (상승장↔하락장) | 중간 | 날짜별 KOSPI 방향 메타데이터 병행 기록 |
| 새벽 배치 실패 시 누락 | 중간 | 누락 감지 + 재수집 로직 |
| 백테스트 look-ahead bias | 높음 | 엄격한 데이터 슬라이싱 (simDate 기준 cutoff) |
| 200일 데이터 한계 (MA120 필요) | 중간 | 백테스트 유효 구간을 120~190번째 거래일로 제한 |
| 백테스트 과최적화 (overfitting) | 높음 | In-sample / Out-of-sample 분할 검증 |
| KIS API 호출량 (백테스트 시) | 중간 | 로컬 OHLCV 캐시 → 1회 fetch 후 다수 날짜 시뮬레이션 |

---

## 10. 참고 파일 (Reference Files)

- [signal-generator.ts](src/analysis/signal-generator.ts) — Grade 계산 로직 (`calcSwingGrade`, 현재 미export)
- [scorer.ts](src/analysis/scorer.ts) — 5-factor 기술/펀더멘털 채점
- [volume-profile.ts](src/analysis/volume-profile.ts) — 매물대(Volume Profile) 계산
- [analysis.ts](src/tools/korea/analysis.ts) — 분석 오케스트레이터
- [kis-client.ts](src/tools/korea/kis-client.ts) — KIS API 클라이언트 (`fetchDailyOHLCV`, 200일)
- [server.ts](src/server.ts) — Hono REST API 서버

---

## 11. 백테스트 설계 (Backtest Design)

### 11-1. 핵심 아이디어

KIS API의 `fetchDailyOHLCV(symbol, 200)`은 **200 거래일** 분량의 과거 OHLCV를 반환한다.
이 데이터를 활용하면 **과거 특정 날짜를 "오늘"로 가정**하고, 그 시점에서 알고리즘이 산출했을 grade를 역산할 수 있다.

핵심 제약: MA60(60일), ATR(14일), Volume Profile(60일), MA120(120일)이 필요하므로, grade 계산 가능 시작 시점은 **120번째 거래일 이후**부터이다. 이후 10거래일 보유를 확인하려면 실질적으로 **120~190번째 거래일**이 백테스트 가능 구간 → 약 **70 거래일(3.5개월)** 확보.

```
200일 OHLCV 데이터 구조:

Day 1 ──────────── Day 120 ──────────── Day 190 ── Day 200
│                     │                    │           │
│  MA120 워밍업 구간   │  백테스트 가능 구간  │  보유기간 │
│  (grade 계산 불가)  │  (약 70 거래일)      │  버퍼    │
└─────────────────────┴────────────────────┴───────────┘
```

### 11-2. 데이터 모델

```typescript
/** 백테스트 설정 */
interface BacktestConfig {
  universe: string[];                    // 테스트 종목 리스트
  startDate?: string;                    // 시작일 (YYYY-MM-DD, 없으면 자동)
  endDate?: string;                      // 종료일 (없으면 자동)
  gradeFilter: ('A' | 'B' | 'C' | 'D')[];  // 가상 매수 grade 필터 (default: ['A'])
  holdingPeriod: number;                 // 보유 거래일 (default: 10)

  /** 가중치 오버라이드 */
  weights?: {
    technicalScoreMax: number;           // default: 3
    rrScoreMax: number;                  // default: 2
    volumeProfileMax: number;            // default: 2
    ma60Max: number;                     // default: 1
  };

  /** Grade 임계값 오버라이드 */
  gradeThresholds?: {
    A: number;                           // default: 7
    B: number;                           // default: 5
    C: number;                           // default: 3
  };
}

/** 개별 거래 결과 */
interface BacktestTrade {
  symbol: string;
  entryDate: string;                     // 진입일 (YYYYMMDD)
  entryPrice: number;                    // 진입가 (익일 시가)
  exitDate: string;                      // 청산일
  exitPrice: number;                     // 청산가 (보유기간 종가)
  swingGrade: 'A' | 'B' | 'C' | 'D';
  gradeScore: number;
  technicalScore: number;
  rrScore: number;
  volumeProfileScore: number;
  ma60Score: number;
  returnPct: number;                     // 수익률 (%)
  peakPrice: number;                     // 보유기간 최고가
  maxFavorableExcursion: number;         // 최대 유리 변동 (%)
  maxAdverseExcursion: number;           // 최대 불리 변동 (%)
  targetAchieved: boolean;
  stopLossHit: boolean;
  expectedRR: number;
  targetPrice: number;
  stopLossPrice: number;
}

/** 백테스트 종합 결과 */
interface BacktestResult {
  id: string;
  config: BacktestConfig;
  executedAt: string;
  summary: {
    totalTrades: number;
    winRate: number;
    avgReturn: number;
    medianReturn: number;
    stdReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    targetHitRate: number;
    stopLossHitRate: number;
    profitFactor: number;
  };
  gradeBreakdown: {
    grade: 'A' | 'B' | 'C' | 'D';
    tradeCount: number;
    winRate: number;
    avgReturn: number;
    targetHitRate: number;
  }[];
  factorCorrelation: {
    factor: string;
    correlationWithReturn: number;
    avgReturnWhenHigh: number;
    avgReturnWhenLow: number;
  }[];
  equityCurve: { date: string; cumulativeReturn: number }[];
  trades: BacktestTrade[];
}

/** Parameter Sweep 결과 */
interface ParameterSweepResult {
  id: string;
  combinations: {
    gradeThreshold: number;
    weights: { tech: number; rr: number; vp: number; ma60: number };
    totalTrades: number;
    winRate: number;
    avgReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
  }[];
  bestByWinRate: { threshold: number; winRate: number };
  bestBySharpe: { threshold: number; sharpeRatio: number };
}
```

### 11-3. 백테스트 엔진 핵심 로직

```
백테스트 실행 흐름:

1. 종목별 200일 OHLCV 1회 조회 → 메모리 캐시 (KIS API 호출 최소화)

2. 시뮬레이션 루프 (날짜별):
   for each simDate in [Day 120 ... Day 190]:
     for each stock in universe:

       ┌─ Look-ahead bias 방지: bars[0..simDate]만 사용
       │
       ├─ 기술지표 계산: MA20/60/120, RSI(14), ATR(14), Volume Profile
       │
       ├─ calcSwingGrade(with optional weights) → grade, score
       │
       ├─ Grade 필터 확인 → 미해당 시 skip
       │
       └─ 성과 계산:
          entryPrice = bars[simDate+1].open    (익일 시가 매수)
          holdBars   = bars[simDate+1 .. +holdingPeriod]
          exitPrice  = holdBars[last].close
          peakPrice  = max(holdBars.map(b => b.high))
          returnPct  = (exitPrice - entryPrice) / entryPrice × 100

3. 집계: trades → summary 통계
4. 팩터 분석: 각 scoring factor ↔ returnPct 피어슨 상관계수
5. Equity Curve: 날짜 순 누적 수익률
```

### 11-4. Look-Ahead Bias 방지 설계

| 계산 항목 | 사용 데이터 범위 | 검증 포인트 |
|-----------|----------------|-------------|
| MA20 | `closes[simDate-19 .. simDate]` | simDate 이후 close 사용 금지 |
| MA60 | `closes[simDate-59 .. simDate]` | simDate 이후 close 사용 금지 |
| MA120 | `closes[simDate-119 .. simDate]` | startIndex ≥ 120 강제 |
| Volume Profile | `bars[simDate-59 .. simDate]` | 60일 lookback |
| **진입가** | `bars[simDate+1].open` | 당일 판단 → **익일 시가** 매수 |
| 성과 계산 | `bars[simDate+1 .. +holdPeriod]` | 성과 측정 전용 (bias 아님) |

### 11-5. Parameter Sweep 설계

**목적**: "A grade = 7점 이상"이 최적 커트라인인지 실증적으로 검증

```
Grade Threshold: [5, 6, 7, 8]
Technical Weight: [2, 3, 4]
R/R Weight: [1, 2, 3]
Volume Profile Weight: [1, 2, 3]
MA60 Weight: [0, 1, 2]

→ 최대 4 × 3 × 3 × 3 × 3 = 324 조합
→ OHLCV/지표는 1회 계산 후 캐시 → 가중치만 교체해 grade 재산출
→ 결과: Win Rate / Sharpe vs Threshold 히트맵
```

---

## 12. 분석 웹 대시보드 설계 (Web Dashboard Design)

### 12-1. 기술 스택

| 항목 | 선택 | 이유 |
|------|------|------|
| 서빙 방식 | Hono `serveStatic` | 기존 서버에 통합, 추가 빌드 불필요 |
| 프론트엔드 | 순수 HTML + Vanilla JS | 단순성, 빌드 도구 불필요 |
| CSS | Pico CSS (CDN) | 최소 CSS로 깔끔한 UI |
| 차트 | Chart.js (CDN) | 가볍고 다양한 차트 지원 |
| HTTP 통신 | fetch API | 브라우저 네이티브 |

**파일 구조**:
```
public/
  dashboard/
    index.html             ← 백테스트 설정 페이지
    results.html           ← 백테스트 결과 페이지
    live.html              ← 실시간 성과 추적 페이지
    css/style.css
    js/
      backtest-config.js
      backtest-results.js
      live-tracking.js
      api.js
      utils.js
```

### 12-2. Page 1: 백테스트 설정 (Backtest Configuration)

```
┌─────────────────────────────────────────────────────────────────┐
│  K-Dexter 백테스트 대시보드                   [설정] [결과] [추적]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ 기간 설정 ────────────────────────────────────────────────┐ │
│  │  시작일: [  2025-09-01  ]   종료일: [  2026-01-31  ]       │ │
│  │  ※ 최대 약 70 거래일 (200일 OHLCV 기준)                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ 종목 유니버스 ────────────────────────────────────────────┐ │
│  │  방식: (●) 직접 입력  ( ) 워치리스트 프리셋                  │ │
│  │  종목코드 (쉼표 구분):                                       │ │
│  │  [ 005930, 000660, 035420, 051910, 006400            ]     │ │
│  │  프리셋: [KOSPI 대형주 ▼]                                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ Grade 필터 ───────────────────────────────────────────────┐ │
│  │  [✓] A grade    [✓] B grade    [ ] C grade    [ ] D grade  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ 보유 기간 ────────────────────────────────────────────────┐ │
│  │  5일  ──────●────────── 10일 ─────────────── 15일 ─ 20일  │ │
│  │                       [10 거래일]                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ 가중치 및 Grade 임계값 조정 ──────────────────────────────┐ │
│  │  Technical Score 가중치  ──────●───  [3] (max)              │ │
│  │  R/R Score 가중치        ──────●───  [2] (max)              │ │
│  │  Volume Profile 가중치   ──────●───  [2] (max)              │ │
│  │  MA60 가중치             ──────●───  [1] (max)   합계: 8점  │ │
│  │  ──────────────────────────────────────────────────────── │ │
│  │  A grade 커트라인        ──────●───  [7] 점 이상            │ │
│  │  B grade 커트라인        ──────●───  [5] 점 이상            │ │
│  │  C grade 커트라인        ──────●───  [3] 점 이상            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [ ▶ 백테스트 실행 ]         [ ▶ Parameter Sweep 실행 ]        │
│                                                                 │
│  상태: ⏳ 실행 중... 35/50 종목 완료 (70%)                      │
│  ████████████████████░░░░░░░░░░                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 12-3. Page 2: 백테스트 결과 (Backtest Results)

```
┌─────────────────────────────────────────────────────────────────┐
│  K-Dexter 백테스트 결과                       [설정] [결과] [추적]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ Summary Cards ────────────────────────────────────────────┐ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │ │
│  │  │ 총 거래  │ │  승률    │ │ 평균수익 │ │   MDD    │      │ │
│  │  │   156    │ │  62.3%   │ │  +4.2%   │ │  -8.7%   │      │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │ │
│  │  │  Sharpe  │ │ 목표도달  │ │ 손절도달  │ │  Profit  │      │ │
│  │  │   1.42   │ │  38.5%   │ │  15.2%   │ │ Factor   │      │ │
│  │  │          │ │          │ │          │ │   2.1    │      │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ Equity Curve (누적 수익률) ───────────────────────────────┐ │
│  │        ╭──╮                                                 │ │
│  │       ╱    ╲    ╭────╮        ╭─────────────╮              │ │
│  │      ╱      ╲──╱      ╲──╮  ╱                ╲╭──────      │ │
│  │  ───╱                     ╲╱                               │ │
│  │   Sep    Oct     Nov     Dec     Jan     Feb               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ Grade별 성과 비교 ────────────────────────────────────────┐ │
│  │  Grade │ 거래수 │  승률  │ 평균수익 │ 목표도달 │ Sharpe   │ │
│  │ ───────┼────────┼────────┼──────────┼──────────┼──────── │ │
│  │   A    │   42   │ 71.4%  │  +6.8%   │  52.4%   │  1.92  │ │
│  │   B    │   68   │ 58.8%  │  +3.1%   │  32.4%   │  1.15  │ │
│  │   C    │   32   │ 43.8%  │  -0.5%   │  18.8%   │  0.32  │ │
│  │   D    │   14   │ 28.6%  │  -4.2%   │   7.1%   │ -0.68  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ Factor 기여도 (상관계수) ─────────────────────────────────┐ │
│  │  Technical Score  ████████████████  0.42                   │ │
│  │  R/R Score        ██████████████    0.38                   │ │
│  │  Volume Profile   ████████████      0.31                   │ │
│  │  MA60 Position    ████████          0.22                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ Parameter Sensitivity Heatmap ────────────────────────────┐ │
│  │  Win Rate by Grade Threshold × Technical Weight             │ │
│  │                                                             │ │
│  │  Threshold │ TechW=2 │ TechW=3 │ TechW=4                  │ │
│  │  ──────────┼─────────┼─────────┼──────────                 │ │
│  │    5점     │  52.1%  │  54.3%  │  55.8%                   │ │
│  │    6점     │  58.4%  │  61.2%  │  63.1%   ← 진한 녹색     │ │
│  │    7점     │  62.3%  │  65.8%  │  68.2%   ← 가장 진함     │ │
│  │    8점     │  70.1%  │  72.4%  │  74.8%   (거래수 적음⚠)  │ │
│  │                                                             │ │
│  │  범례: ██ >70%  ██ 60-70%  ██ 50-60%  ░░ <50%             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ 개별 거래 상세 ───────────────────────────────────────────┐ │
│  │  [정렬: 수익률 ▼]  [필터: A grade ▼]  [CSV 다운로드]       │ │
│  │                                                            │ │
│  │  종목   │ 진입일    │ 진입가  │ 청산가  │ 수익률 │ Grade │ │
│  │ ────────┼───────────┼─────────┼─────────┼────────┼────── │ │
│  │ 005930  │ 2025-10-02│ 65,200  │ 69,800  │ +7.1%  │  A   │ │
│  │ 000660  │ 2025-10-02│ 182,500 │ 191,000 │ +4.7%  │  A   │ │
│  │ 035420  │ 2025-10-15│ 312,000 │ 305,500 │ -2.1%  │  B   │ │
│  │                                          < 1 2 3 4 5 >   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 12-4. Page 3: 실시간 성과 추적 (Live Performance Tracking)

```
┌─────────────────────────────────────────────────────────────────┐
│  K-Dexter 실시간 성과 추적                    [설정] [결과] [추적]│
├─────────────────────────────────────────────────────────────────┤
│  마지막 업데이트: 2026-02-27 06:30 KST                           │
│                                                                 │
│  ┌─ 현재 추적 중인 A Grade 종목 ─────────────────────────────┐  │
│  │  종목   │ 진입일    │ 진입가  │ 현재가  │ 수익률 │  D-Day │  │
│  │ ────────┼───────────┼─────────┼─────────┼────────┼──────  │  │
│  │ 005930  │ 2026-02-20│ 65,200  │ 67,400  │ +3.4%  │  D+5  │  │
│  │ 000660  │ 2026-02-20│ 182,500 │ 179,800 │ -1.5%  │  D+5  │  │
│  │ 051910  │ 2026-02-24│ 148,000 │ 152,500 │ +3.0%  │  D+3  │  │
│  │ 035420  │ 2026-02-25│ 310,000 │ 313,500 │ +1.1%  │  D+2  │  │
│  │                                                            │  │
│  │  진행 바:                                                   │  │
│  │  005930 [█████░░░░░] 5/10일 │ Target: 69,800 │ SL: 62,100│  │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ 일별 가격 추적 (005930 선택됨) ──────────────────────────┐  │
│  │  날짜      │ 시가   │ 종가   │ 고가   │ 저가   │  변동  │  │
│  │ ───────────┼────────┼────────┼────────┼────────┼─────── │  │
│  │ 2026-02-20 │ 65,200 │ 65,800 │ 66,100 │ 64,900 │ +0.9% │  │
│  │ 2026-02-21 │ 65,900 │ 66,500 │ 66,800 │ 65,500 │ +1.1% │  │
│  │ 2026-02-24 │ 66,200 │ 66,800 │ 67,200 │ 66,000 │ +0.5% │  │
│  │ 2026-02-25 │ 67,000 │ 67,200 │ 67,500 │ 66,800 │ +0.6% │  │
│  │ 2026-02-26 │ 67,100 │ 67,400 │ 67,900 │ 67,000 │ +0.3% │  │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ 완료된 거래 성과 요약 ───────────────────────────────────┐  │
│  │  기간: 최근 30일 │ 완료: 12건 │ 승률: 66.7% │ 평균: +3.8%│  │
│  │                                                            │  │
│  │  종목   │ 기간         │ 수익률 │ 결과 │  목표도달        │  │
│  │ ────────┼──────────────┼────────┼──────┼───────────────── │  │
│  │ 005930  │ 02/03~02/14  │ +5.2%  │ WIN  │  ✓ (D+7)        │  │
│  │ 035420  │ 02/03~02/14  │ -1.8%  │ LOSS │  ✗              │  │
│  │ 000660  │ 02/10~02/21  │ +8.1%  │ WIN  │  ✓ (D+4)        │  │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 12-5. API-UI 데이터 흐름

```
┌──────────────────┐   fetch()    ┌─────────────────────────────┐
│  브라우저         │ ──────────→  │  Hono Server (server.ts)   │
│  (HTML + JS)     │              │                             │
│                  │  ←────────── │  ┌──────────────────────┐  │
│  Chart.js 렌더링 │  JSON Result │  │  Backtest Engine     │  │
│  히트맵 생성     │              │  │  (src/backtest/)     │  │
│  테이블 정렬     │              │  │                      │  │
│                  │  POST        │  │  ┌────────────────┐  │  │
│  설정 입력       │ ──────────→  │  │  │  KIS OHLCV    │  │  │
│                  │              │  │  │  캐시 (메모리) │  │  │
└──────────────────┘              │  │  └────────────────┘  │  │
                                  │  └──────────────────────┘  │
                                  └─────────────────────────────┘
```

---

## 13. 구현 시 주요 결정사항 (Implementation Notes)

### calcSwingGrade 재사용 전략

현재 `signal-generator.ts`의 `calcSwingGrade`는 미export 상태. 백테스트 엔진에서 가중치를 교체하며 재사용하려면:

- **권장**: `calcSwingGrade`에 optional `weights` 파라미터 추가 후 export
  ```typescript
  export function calcSwingGrade(
    technicalScore: number,
    rrRatio: number,
    volumePosition: 'above' | 'at' | 'below',
    price: number,
    ma60: number,
    weights?: SwingGradeWeights  // optional override
  ): SwingGrade
  ```

### Fundamental 데이터 처리

백테스트 시 과거 PER/PBR/ROE를 KIS에서 얻을 수 없음. 선택지:
- **채택**: 현재 fundamentals를 상수로 전달 + Technical grade만 백테스트 핵심 지표로 사용
- **향후**: 분기별 공시 데이터 연동으로 개선 (Out-of-scope)

### KIS API 호출 최적화

50종목 × 1회 fetchDailyOHLCV = 50 API 호출. Rate limit 대응:
- 호출 간 100ms delay 삽입 → 총 5~10초 소요
- 결과를 메모리에 캐시 → Parameter Sweep 시 재호출 방지 (가중치만 교체)
