# grade-algo-improvement Design Document

> **Summary**: KR 주식 Grade 알고리즘 백테스트 엔진 + 웹 대시보드 구현 설계
>
> **Project**: dexter-ts (K-Dexter)
> **Version**: 2026.2.6
> **Author**: K-Dexter Team
> **Date**: 2026-03-02
> **Status**: Draft
> **Planning Doc**: [grade-algo-improvement.plan.md](../../01-plan/features/grade-algo-improvement.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. `calcSwingGrade`를 export + 가중치/임계값 파라미터화 → 백테스트 엔진에서 재사용
2. Look-ahead bias 없는 백테스트 엔진 구현 (Day 120~190 유효 구간)
3. 파일 기반 결과 저장 (추가 DB 불필요)
4. Hono `serveStatic`으로 정적 대시보드 서빙 (기존 서버 확장)
5. 50종목 기준 30초 이내 백테스트 완료

### 1.2 Design Principles

- **최소 변경**: 기존 `signal-generator.ts`의 인터페이스 유지, 최소한의 수정만
- **단방향 의존**: 백테스트 엔진 → 분석 모듈(단방향), 서버는 엔진을 호출
- **파일 기반 저장**: 간단한 JSON 파일 저장소로 운영 (복잡한 DB 불필요)
- **캐싱 우선**: KIS API는 종목당 1회만 호출, 메모리 캐시로 Parameter Sweep 처리

---

## 2. Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (HTML + JS)                                             │
│  ┌──────────────────┐  ┌────────────────────┐  ┌─────────────┐ │
│  │ index.html       │  │ results.html        │  │ live.html   │ │
│  │ (Backtest 설정)  │  │ (Chart.js 결과)     │  │ (추적 현황) │ │
│  └────────┬─────────┘  └─────────┬──────────┘  └──────┬──────┘ │
│           │  POST /backtest/run   │  GET /results/:id  │        │
└───────────┼──────────────────────┼────────────────────┼────────┘
            │                      │                    │
┌───────────▼──────────────────────▼────────────────────▼────────┐
│  Hono Server (src/server.ts)                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Routes:  POST /k-dexter/backtest/run                      │ │
│  │           POST /k-dexter/backtest/parameter-sweep          │ │
│  │           GET  /k-dexter/backtest/results                  │ │
│  │           GET  /k-dexter/backtest/results/:id              │ │
│  │           GET  /dashboard/*  (serveStatic)                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│           │                                                      │
│  ┌────────▼───────────────────────────────────────────────────┐ │
│  │  Backtest Engine (src/backtest/)                            │ │
│  │  ┌─────────────┐  ┌──────────┐  ┌───────────────────────┐ │ │
│  │  │ engine.ts   │  │ stats.ts │  │ parameter-sweep.ts    │ │ │
│  │  │ (시뮬루프)  │  │ (집계)   │  │ (조합 순열)            │ │ │
│  │  └──────┬──────┘  └──────────┘  └───────────────────────┘ │ │
│  └─────────┼──────────────────────────────────────────────────┘ │
│            │  OHLCV 캐시 (Map<symbol, OhlcvRecord[]>)           │
│  ┌─────────▼──────────────────────────────────────────────────┐ │
│  │  KIS Client  (fetchDailyOHLCV, 200일)                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│  ┌───────────────────────────▼────────────────────────────────┐ │
│  │  signal-generator.ts (calcSwingGrade — export 수정)         │ │
│  │  volume-profile.ts   (calculateVolumeProfile)               │ │
│  │  scorer.ts           (calculate*Score)                      │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │ 결과 저장
          ┌───────────────────▼────────────────────┐
          │  data/backtest-results/{id}.json        │
          └─────────────────────────────────────────┘
```

### 2.2 Data Flow

```
POST /backtest/run (BacktestConfig)
  → BacktestEngine.run(config)
    → 종목별 fetchDailyOHLCV(symbol, 200) → 메모리 캐시
    → for simDate in [120..190]:
        for stock in universe:
          bars = ohlcvCache[stock][0..simDate]  ← look-ahead 차단
          indicators = calcIndicators(bars)
          { grade, score, breakdown } = calcSwingGrade(
            techScore, rr, vp, price, ma60, weights, thresholds
          )
          if grade in gradeFilter:
            entryPrice = bars[simDate+1].open
            holdBars   = bars[simDate+1..simDate+holdingPeriod]
            trade = calcTrade(bars, entryPrice, holdBars, signal)
    → stats.aggregate(trades) → BacktestResult
    → Bun.write(`data/backtest-results/${id}.json`, result)
  ← return BacktestResult (JSON)
```

### 2.3 Dependencies

| 모듈 | 의존 대상 | 목적 |
|------|-----------|------|
| `src/backtest/engine.ts` | `signal-generator.ts`, `volume-profile.ts`, `scorer.ts`, `kis-client.ts` | 지표 계산 및 OHLCV 조회 |
| `src/backtest/stats.ts` | 없음 (순수 함수) | 통계 집계 |
| `src/backtest/parameter-sweep.ts` | `engine.ts` | 가중치 조합 순열 |
| `src/server.ts` | `src/backtest/index.ts` | 백테스트 API 라우트 |

---

## 3. Data Model

### 3.1 OhlcvRecord (KIS API 응답 정규화)

```typescript
// src/backtest/types.ts

/** KIS fetchDailyOHLCV 응답을 정규화한 OHLCV 레코드 */
export interface OhlcvRecord {
  date: string;    // "YYYYMMDD"
  open: number;    // 시가 (number로 변환)
  high: number;    // 고가
  low: number;     // 저가
  close: number;   // 종가
  volume: number;  // 거래량
}
```

> **주의**: KIS `fetchDailyOHLCV` 응답의 모든 가격/거래량 필드는 **문자열**로 반환됨.
> 엔진 진입 시 `Number(r.close)` 등으로 반드시 변환 필요.
> 응답 순서: **최신일 → 과거일** (내림차순). 백테스트 루프 전에 `reverse()` 적용.

### 3.2 BacktestConfig

```typescript
export interface SwingGradeWeights {
  technicalScoreMax: number;  // default: 3
  rrScoreMax: number;          // default: 2
  volumeProfileMax: number;   // default: 2
  ma60Max: number;             // default: 1
}

export interface SwingGradeThresholds {
  A: number;  // default: 7 (이상이면 A)
  B: number;  // default: 5
  C: number;  // default: 3
}

export interface BacktestConfig {
  universe: string[];                       // 종목코드 리스트 (e.g., ["005930", "000660"])
  gradeFilter: ('A' | 'B' | 'C' | 'D')[];  // 진입 대상 grade (default: ['A'])
  holdingPeriod: number;                    // 보유 거래일 (default: 10)
  weights?: SwingGradeWeights;              // 미지정 시 기본값 사용
  thresholds?: SwingGradeThresholds;        // 미지정 시 기본값 사용
}
```

### 3.3 BacktestTrade

```typescript
export interface BacktestTrade {
  symbol: string;
  entryDate: string;           // 진입일 (simDate+1의 date)
  entryPrice: number;          // 진입가 (simDate+1의 open)
  exitDate: string;            // 청산일 (simDate+holdingPeriod의 date)
  exitPrice: number;           // 청산가 (simDate+holdingPeriod의 close)
  swingGrade: 'A' | 'B' | 'C' | 'D';
  gradeScore: number;
  technicalScore: number;
  rrScore: number;
  volumeProfileScore: number;
  ma60Score: number;
  returnPct: number;           // (exitPrice - entryPrice) / entryPrice × 100
  peakPrice: number;           // holdBars 최고가
  maxFavorableExcursion: number;  // (peakPrice - entryPrice) / entryPrice × 100
  maxAdverseExcursion: number;    // (troughPrice - entryPrice) / entryPrice × 100
  targetAchieved: boolean;
  stopLossHit: boolean;
  expectedRR: number;
  targetPrice: number;
  stopLossPrice: number;
}
```

### 3.4 BacktestResult

```typescript
export interface BacktestResult {
  id: string;               // crypto.randomUUID()
  config: BacktestConfig;
  executedAt: string;       // ISO 8601
  summary: {
    totalTrades: number;
    winRate: number;        // (수익 거래 / 전체) × 100
    avgReturn: number;
    medianReturn: number;
    stdReturn: number;
    sharpeRatio: number;    // avgReturn / stdReturn (간소화)
    maxDrawdown: number;    // equity curve 기준
    targetHitRate: number;
    stopLossHitRate: number;
    profitFactor: number;   // 총이익 / |총손실|
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
    avgReturnWhenHigh: number;      // 해당 factor 점수 최대치일 때 평균 수익률
    avgReturnWhenLow: number;       // 0점일 때 평균 수익률
  }[];
  equityCurve: { date: string; cumulativeReturn: number }[];
  trades: BacktestTrade[];
}
```

### 3.5 ParameterSweepResult

```typescript
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
  bestByWinRate: { threshold: number; weights: SwingGradeWeights; winRate: number };
  bestBySharpe: { threshold: number; weights: SwingGradeWeights; sharpeRatio: number };
}
```

---

## 4. API Specification

### 4.1 Endpoint List

| Method | Path | Description | Body/Params |
|--------|------|-------------|-------------|
| POST | `/k-dexter/backtest/run` | 백테스트 실행 | `BacktestConfig` |
| POST | `/k-dexter/backtest/parameter-sweep` | Parameter Sweep | `BacktestConfig` (universe 필수) |
| GET | `/k-dexter/backtest/results` | 결과 목록 | - |
| GET | `/k-dexter/backtest/results/:id` | 특정 결과 조회 | - |
| GET | `/dashboard/*` | 정적 HTML 대시보드 | - |

### 4.2 Detailed Specification

#### `POST /k-dexter/backtest/run`

**Request:**
```json
{
  "universe": ["005930", "000660", "035420"],
  "gradeFilter": ["A"],
  "holdingPeriod": 10,
  "weights": {
    "technicalScoreMax": 3,
    "rrScoreMax": 2,
    "volumeProfileMax": 2,
    "ma60Max": 1
  },
  "thresholds": {
    "A": 7,
    "B": 5,
    "C": 3
  }
}
```

**Response (200 OK):** `BacktestResult` JSON

**Error Responses:**
- `400`: universe 누락 또는 빈 배열
- `500`: KIS API 오류 (토큰 만료 등)

#### `POST /k-dexter/backtest/parameter-sweep`

**Request:** `BacktestConfig` (gradeThreshold/weights는 sweep 범위로 무시됨)

**Sweep 범위 (고정):**
```
gradeThreshold A: [5, 6, 7, 8]
technicalScoreMax: [2, 3, 4]
rrScoreMax: [1, 2, 3]
volumeProfileMax: [1, 2, 3]
ma60Max: [0, 1, 2]
→ 최대 4×3×3×3×3 = 324 조합
```

**Response (200 OK):** `ParameterSweepResult` JSON

#### `GET /k-dexter/backtest/results`

**Response:**
```json
{
  "results": [
    { "id": "uuid", "executedAt": "2026-03-02T...", "config": {...}, "summary": {...} }
  ]
}
```

---

## 5. File Structure

### 5.1 신규 파일 구조

```
src/
└── backtest/
    ├── types.ts              ← 모든 타입 정의
    ├── engine.ts             ← 백테스트 핵심 루프
    ├── stats.ts              ← 통계 집계 순수 함수
    ├── parameter-sweep.ts    ← 조합 순열 실행
    └── index.ts              ← 공개 API re-export

public/
└── dashboard/
    ├── index.html            ← 백테스트 설정 페이지
    ├── results.html          ← 결과 페이지
    ├── live.html             ← 실시간 추적 (stub)
    ├── css/
    │   └── style.css
    └── js/
        ├── api.js            ← fetch 래퍼 (BASE_URL 통합)
        ├── backtest-config.js ← 설정 폼 제출
        ├── backtest-results.js ← Chart.js 렌더링
        └── utils.js          ← 숫자 포매팅 등

data/
└── backtest-results/
    └── {uuid}.json          ← 백테스트 결과 파일 (자동 생성)
```

### 5.2 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/analysis/signal-generator.ts` | `calcSwingGrade` export + `weights?`, `thresholds?` 파라미터 추가, 반환 타입 변경 |
| `src/server.ts` | 백테스트 라우트 4개 + `serveStatic` 미들웨어 추가 |

---

## 6. Implementation Details

### 6.1 signal-generator.ts 수정

**현재 시그니처** (line 120):
```typescript
function calcSwingGrade(
  score: number, rr: number, vp: VolumeProfile | null,
  currentPrice: number, ma60: number
): 'A' | 'B' | 'C' | 'D'
```

**변경 후 시그니처**:
```typescript
export interface SwingGradeResult {
  grade: 'A' | 'B' | 'C' | 'D';
  score: number;         // 총점
  breakdown: {
    technicalScore: number;      // 0~3
    rrScore: number;             // 0~2
    volumeProfileScore: number;  // 0~2
    ma60Score: number;           // 0~1
  };
}

export function calcSwingGrade(
  score: number,
  rr: number,
  vp: VolumeProfile | null,
  currentPrice: number,
  ma60: number,
  weights?: SwingGradeWeights,
  thresholds?: SwingGradeThresholds
): SwingGradeResult
```

**하위 호환성**: `generateTradeSignal` 내부 호출 시 `result.grade`로 접근하도록 수정.

### 6.2 백테스트 엔진 핵심 로직 (engine.ts)

```typescript
// 유효 구간 계산
const WARMUP = 120;        // MA120 워밍업
const BUFFER = 10;         // 보유기간 버퍼
// 유효 simDate 범위: [WARMUP, bars.length - holdingPeriod - 1]

// KIS OHLCV 정규화 (문자열 → 숫자, 날짜 오름차순 정렬)
function normalizeOhlcv(raw: any[]): OhlcvRecord[] {
  return raw
    .map(r => ({
      date: r.date,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume),
    }))
    .reverse(); // KIS는 최신→과거 순서, 오름차순으로 변환
}

// 지표 계산 (simDate까지만 사용)
function calcIndicatorsAtDate(bars: OhlcvRecord[], simDate: number) {
  const slice = bars.slice(0, simDate + 1);
  const closes = slice.map(b => b.close);
  // MA20, MA60, MA120: closes[-20:], closes[-60:], closes[-120:]
  // RSI(14), ATR(14), Volume Profile(60일 lookback)
}

// Look-ahead bias 검증:
// - 모든 지표 계산은 bars[0..simDate] 범위만 사용
// - 진입가 = bars[simDate + 1].open
// - 성과 = bars[simDate+1 .. simDate+holdingPeriod]
```

### 6.3 서버 serveStatic 설정

Hono + Bun 환경에서 정적 파일 서빙:

```typescript
import { serveStatic } from 'hono/bun';

// public/dashboard/index.html → GET /dashboard/
app.use('/dashboard/*', serveStatic({ root: './public' }));
app.get('/dashboard', (c) => c.redirect('/dashboard/index.html'));
```

### 6.4 결과 파일 저장 (Bun 네이티브 API)

```typescript
import { mkdir, writeFile, readFile, readdir } from 'fs/promises';

const RESULTS_DIR = './data/backtest-results';

async function saveResult(result: BacktestResult): Promise<void> {
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(
    `${RESULTS_DIR}/${result.id}.json`,
    JSON.stringify(result, null, 2)
  );
}
```

### 6.5 KIS API Rate Limiting

50종목 동시 fetch 시 rate limit 대응:

```typescript
// 종목별 순차 fetch with delay
for (const symbol of universe) {
  cache[symbol] = await fetchDailyOHLCV(symbol, 200);
  await sleep(100); // 100ms delay
}
```

---

## 7. Error Handling

### 7.1 에러 유형별 처리

| 에러 상황 | 처리 방법 |
|----------|----------|
| KIS 토큰 만료 | `fetchDailyOHLCV` 내 자동 재발급 (기존 로직) |
| 종목 OHLCV 부족 (< 130일) | 해당 종목 skip, 로그 기록 |
| 백테스트 구간 내 거래 0건 | summary 모두 0으로 반환 (에러 아님) |
| 결과 파일 읽기 실패 | 404 반환 |
| holdBars 범위 초과 | 마지막 유효 bar까지만 사용 |

### 7.2 에러 응답 포맷

```json
{
  "error": "INSUFFICIENT_DATA",
  "message": "종목 005930: 유효 OHLCV 데이터가 130일 미만입니다",
  "symbol": "005930"
}
```

---

## 8. UI/UX Design

### 8.1 Page 1: 백테스트 설정 (index.html)

기술 스택: 순수 HTML + Vanilla JS + Pico CSS (CDN) + Chart.js (CDN)

핵심 요소:
- 종목코드 textarea (쉼표 구분)
- Grade 필터 체크박스
- 보유기간 슬라이더 (5~20일)
- 가중치 슬라이더 4개
- Grade 임계값 슬라이더 3개
- 백테스트 실행 / Parameter Sweep 버튼
- 실행 중 프로그레스 표시 (polling `/backtest/results/:id`)

### 8.2 Page 2: 결과 (results.html)

Chart.js 차트 3종:
1. **Equity Curve**: 날짜 x축, 누적수익률 y축 (Line chart)
2. **Grade별 성과 비교**: 막대 차트 (4 grade × 승률/평균수익)
3. **Heatmap**: Grade Threshold × Technical Weight 조합별 Win Rate (색상 코딩)

테이블:
- Grade별 집계 통계 (4행)
- Factor 상관계수 바 차트
- 개별 거래 목록 (정렬/필터/CSV 다운로드)

### 8.3 API-UI 통신 패턴

```javascript
// js/api.js
const API_BASE = '';  // 같은 origin
async function runBacktest(config) {
  const res = await fetch(`${API_BASE}/k-dexter/backtest/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  return res.json();
}
```

---

## 9. Security Considerations

- [ ] `universe` 종목코드 화이트리스트 검증 (6자리 숫자 정규식: `/^\d{6}$/`)
- [ ] `holdingPeriod` 범위 검증 (1~20일)
- [ ] 가중치 값 범위 검증 (0~10)
- [ ] 결과 파일 경로 traversal 방지 (`UUID` 형식 검증)
- [ ] CORS는 기존 설정 유지 (로컬 전용 서버)

---

## 10. Test Plan

### 10.1 핵심 테스트 케이스

| 케이스 | 검증 항목 |
|--------|----------|
| Look-ahead bias | simDate 기준 미래 bars 사용 여부 단위 테스트 |
| 수익률 계산 | (exitPrice - entryPrice) / entryPrice × 100 정확도 |
| Sharpe Ratio | avgReturn / stdReturn 계산 |
| MDD | equityCurve 최대 낙폭 정확도 |
| 피어슨 상관계수 | factor ↔ returnPct 상관계수 |
| Parameter Sweep | 324 조합 모두 실행 및 bestByWinRate 식별 |

### 10.2 수동 검증 절차

1. `bun run src/server.ts` 서버 시작
2. 소규모 유니버스(3종목)로 `POST /k-dexter/backtest/run` 호출
3. 응답 JSON에서 `gradeBreakdown[0].winRate` 확인 (범위: 0~100)
4. `GET /k-dexter/backtest/results` → 저장 확인
5. 브라우저 `http://localhost:3000/dashboard/` → UI 정상 동작
6. Parameter Sweep 실행 → 히트맵 렌더링 확인

---

## 11. Implementation Order

### 구현 순서 (의존성 기준)

1. [ ] `src/backtest/types.ts` — 모든 타입 정의
2. [ ] `src/analysis/signal-generator.ts` — `calcSwingGrade` export + 파라미터화
3. [ ] `src/backtest/stats.ts` — 통계 집계 순수 함수 (winRate, Sharpe, MDD, Pearson)
4. [ ] `src/backtest/engine.ts` — 백테스트 루프 (types + stats + signal-generator 의존)
5. [ ] `src/backtest/parameter-sweep.ts` — 조합 순열 (engine 의존)
6. [ ] `src/backtest/index.ts` — re-export
7. [ ] `src/server.ts` — 라우트 4개 + serveStatic 추가
8. [ ] `public/dashboard/` — HTML/JS/CSS 정적 파일 (API 완성 후)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-02 | Initial draft | K-Dexter Team |
