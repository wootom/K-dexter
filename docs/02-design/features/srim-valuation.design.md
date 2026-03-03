# Design: S-RIM 기반 적정주가 산출 기능

**Feature ID**: srim-valuation
**Status**: Design
**Created**: 2026-03-03
**Updated**: 2026-03-03
**References**: `docs/01-plan/features/srim-valuation.plan.md`

---

## 1. 변경 파일 목록 (Files to Modify)

| 파일 | 변경 유형 | 역할 |
|------|-----------|------|
| `src/analysis/valuation.ts` | **신규 생성** | S-RIM 계산 순수 함수 |
| `src/tools/korea/analysis.ts` | **수정** | valuation 결과를 응답 JSON에 추가 |

총 **2개 파일**, 외부 의존성 추가 없음.

---

## 2. 신규 파일: `src/analysis/valuation.ts`

### 2-1. 타입 정의

```typescript
// S-RIM 계산 시나리오 결과
export interface SRIMScenario {
  coe: number;        // 요구수익률 (소수점, 예: 0.10)
  fairValue: number;  // 적정주가 (원, 소수점 없음으로 반올림)
  fairPBR: number;    // 적정 PBR = ROE / COE (소수점 2자리)
  discount: number;   // 괴리율 (%, 소수점 2자리)
                      // = (현재가 - 적정가) / 적정가 × 100
                      // 음수(-) = 저평가, 양수(+) = 고평가
}

// S-RIM 전체 결과
export interface SRIMResult {
  method: 'S-RIM';
  inputs: {
    bps: number;          // 주당순자산 (원)
    eps: number;          // 주당순이익 (원)
    roe: number;          // 자기자본이익률 (%, 예: 15.0)
    currentPrice: number; // 현재가 (원)
    roeSource: 'direct' | 'derived'; // ROE 출처 (직접 vs EPS/BPS 역산)
  };
  scenarios: {
    conservative: SRIMScenario; // COE = 12%
    base: SRIMScenario;         // COE = 10%
    optimistic: SRIMScenario;   // COE = 8%
  };
  summary: {
    fairValueRange: { min: number; max: number }; // [보수적 적정가, 낙관적 적정가]
    assessment: 'UNDERVALUED' | 'FAIR' | 'OVERVALUED'; // 기본(COE=10%) 기준
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    note?: string; // 신뢰도 낮음 시 사유 (예: "ROE is negative (loss-making period)")
  };
}

// 계산 입력 파라미터
export interface SRIMParams {
  bps: number | null | undefined;
  eps: number | null | undefined;
  roe: number | null | undefined; // %, 예: 15.0
  currentPrice: number;
}
```

### 2-2. 핵심 계산 함수

```typescript
export function calculateSRIM(params: SRIMParams): SRIMResult | null
```

**흐름:**

```
입력: { bps, eps, roe, currentPrice }
    │
    ├─ 1. 데이터 유효성 검증
    │      BPS <= 0 또는 유효한 숫자 없음 → return null
    │      (BPS=0 종목은 ETF/리츠 등, S-RIM 적용 불가)
    │
    ├─ 2. ROE 확정
    │      roe != null → 사용 (roeSource: 'direct')
    │      roe == null & eps != null & bps > 0 → ROE = EPS/BPS × 100
    │                                             (roeSource: 'derived')
    │      ROE도 계산 불가 → return null
    │
    ├─ 3. 신뢰도 결정
    │      ROE > 0 & roeSource == 'direct' → 'HIGH'
    │      ROE > 0 & roeSource == 'derived' → 'MEDIUM'
    │      ROE <= 0 → 'LOW' (적자 기업)
    │
    ├─ 4. 3가지 COE 시나리오 계산
    │      COE ∈ [0.12, 0.10, 0.08]
    │      fairValue = round(EPS / COE)      ← 기본 공식
    │        * EPS가 없으면: BPS × (ROE/100) / COE
    │        * ROE <= 0: fairValue = 0 (음수 적정가는 의미 없음)
    │      fairPBR = round(ROE/100 / COE, 2)
    │      discount = round((currentPrice - fairValue) / fairValue × 100, 2)
    │
    ├─ 5. 종합 평가 (기본 시나리오 COE=10% 기준)
    │      discount < -5  → 'UNDERVALUED'  (현재가가 적정가보다 5% 이상 낮음)
    │      -5 ≤ discount ≤ 10 → 'FAIR'
    │      discount > 10  → 'OVERVALUED'   (현재가가 적정가보다 10% 이상 높음)
    │
    └─ 반환: SRIMResult
```

**주의사항:**
- `fairValue = 0` 처리: ROE <= 0 이면 fairValue를 0으로 설정하고, discount는 null 대신 `Number.POSITIVE_INFINITY` 대신 `999` (의미 없음 표시)
- 정수 반올림: fairValue는 `Math.round()` 사용 (원화 단위)

### 2-3. 완성 코드 설계

```typescript
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
  // EPS 우선, fallback: BPS × (ROE/100)
  const effectiveEps = eps > 0 ? eps : bps * (roe / 100);
  const fairValue = roe <= 0 ? 0 : Math.round(effectiveEps / coe);
  const fairPBR = roe <= 0 ? 0 : parseFloat((roe / 100 / coe).toFixed(2));
  const discount = fairValue === 0
    ? 999  // 적자 기업 — 의미 없음
    : parseFloat(((currentPrice - fairValue) / fairValue * 100).toFixed(2));

  return { coe, fairValue, fairPBR, discount };
}

export function calculateSRIM(params: SRIMParams): SRIMResult | null {
  const { bps, eps, roe, currentPrice } = params;

  // 1. BPS 필수 (S-RIM의 기반)
  const validBps = typeof bps === 'number' && bps > 0 ? bps : null;
  if (validBps === null) return null;

  // 2. ROE 확정
  let effectiveRoe: number;
  let roeSource: 'direct' | 'derived';

  if (typeof roe === 'number' && !isNaN(roe)) {
    effectiveRoe = roe;
    roeSource = 'direct';
  } else if (typeof eps === 'number' && !isNaN(eps) && validBps > 0) {
    effectiveRoe = (eps / validBps) * 100;
    roeSource = 'derived';
  } else {
    return null;
  }

  // 3. EPS 확정 (선택적)
  const validEps = typeof eps === 'number' && !isNaN(eps) ? eps : 0;

  // 4. 신뢰도
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
  const base          = calcScenario(validEps, effectiveRoe, validBps, COE_SCENARIOS.base, currentPrice);
  const optimistic    = calcScenario(validEps, effectiveRoe, validBps, COE_SCENARIOS.optimistic, currentPrice);

  // 6. 종합 평가 (base 기준)
  let assessment: 'UNDERVALUED' | 'FAIR' | 'OVERVALUED';
  if (base.fairValue === 0 || base.discount === 999) {
    assessment = 'OVERVALUED'; // 적자 기업은 보수적으로 고평가 처리
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
```

---

## 3. 수정 파일: `src/tools/korea/analysis.ts`

### 3-1. import 추가 (파일 상단)

```typescript
// 기존 imports 아래에 추가
import { calculateSRIM } from '../../analysis/valuation.js';
```

### 3-2. valuation 계산 (combinedFundamentals 구성 직후)

**위치**: `src/tools/korea/analysis.ts:107` (scorerResult 계산 이전)

```typescript
// 5. Run Scorer Analysis
const request: AnalysisRequest = { ... };
const scorerResult = analyze(request);

// 5-a. S-RIM 적정주가 계산 (추가)
const srimResult = calculateSRIM({
  bps: combinedFundamentals.bps,
  eps: combinedFundamentals.eps,
  roe: combinedFundamentals.roe,
  currentPrice,
});
```

### 3-3. 응답 JSON 확장 (기존 return JSON.stringify 수정)

**위치**: `src/tools/korea/analysis.ts:139` (return JSON.stringify 블록)

```typescript
return JSON.stringify({
  symbol,
  fundamentals: {
    per: combinedFundamentals.per,
    pbr: combinedFundamentals.pbr,
    eps: combinedFundamentals.eps,
    bps: combinedFundamentals.bps,
    marketCap: combinedFundamentals.marketCap,
    roe: combinedFundamentals.roe,
    debt_ratio: combinedFundamentals.debt_ratio,
    op_margin: combinedFundamentals.op_margin,
  },
  technicals: { ... },            // 기존 그대로
  investor_trend_ratios,          // 기존 그대로
  scorer: scorerResult,           // 기존 그대로
  trade_signal: { ... },          // 기존 그대로
  valuation: {                    // ← 신규 추가
    srim: srimResult,             // null이면 null로 직렬화됨
  },
}, null, 2);
```

---

## 4. 데이터 흐름 다이어그램

```
POST /k-dexter/analyze/kr  { symbol }
          │
          ▼
   analyzeKrStock.invoke()
          │
          ├─ fetchCurrentPrice(symbol)     → priceData.bps, priceData.eps
          ├─ fetchDailyOHLCV(symbol, 200)  → OHLCV 데이터
          ├─ fetchNaverFinancials(symbol)  → fundamentalData.roe
          └─ fetchInvestorTrend(symbol)    → 투자자 동향
          │
          ▼
   combinedFundamentals 구성
     { per, pbr, eps(float), bps(float), roe, ... }
          │
          ├──────────────────────────────────┐
          ▼                                  ▼
   analyze(request)              calculateSRIM({bps, eps, roe, price})
   → scorerResult                → srimResult (or null)
          │                                  │
          └──────────────┬───────────────────┘
                         ▼
              JSON.stringify({
                symbol, fundamentals, technicals,
                investor_trend_ratios, scorer,
                trade_signal,
                valuation: { srim: srimResult }
              })
```

---

## 5. 엣지 케이스 처리 설계

| 상황 | 조건 | 처리 |
|------|------|------|
| ETF/리츠 | BPS = 0 또는 NaN | `calculateSRIM` → `null`, 응답: `"srim": null` |
| BPS 미제공 | `priceData.bps = ""` | `parseFloat("") = NaN` → null 체크 → null |
| 적자 기업 | ROE < 0 | 계산 수행, `confidence: 'LOW'`, `fairValue: 0`, `assessment: 'OVERVALUED'` |
| ROE 누락 (Naver 크롤 실패) | `roe = null` | EPS/BPS로 역산 시도, 실패 시 null |
| EPS 음수 | EPS < 0, ROE < 0 | `fairValue: 0`, `confidence: 'LOW'` |
| EPS = 0 (배당주 등) | EPS = 0, BPS > 0, ROE > 0 | BPS × (ROE/100) / COE로 계산 |
| currentPrice = 0 | 실시간 가격 오류 | KIS API fetchCurrentPrice가 이미 예외 처리 → 도달 불가 |

---

## 6. API 응답 스키마

### 성공 케이스 (ROE 데이터 완전)

```json
{
  "valuation": {
    "srim": {
      "method": "S-RIM",
      "inputs": {
        "bps": 50000,
        "eps": 7500,
        "roe": 15.0,
        "currentPrice": 65000,
        "roeSource": "direct"
      },
      "scenarios": {
        "conservative": {
          "coe": 0.12,
          "fairValue": 62500,
          "fairPBR": 1.25,
          "discount": 4.0
        },
        "base": {
          "coe": 0.10,
          "fairValue": 75000,
          "fairPBR": 1.50,
          "discount": -13.33
        },
        "optimistic": {
          "coe": 0.08,
          "fairValue": 93750,
          "fairPBR": 1.875,
          "discount": -30.67
        }
      },
      "summary": {
        "fairValueRange": { "min": 62500, "max": 93750 },
        "assessment": "UNDERVALUED",
        "confidence": "HIGH"
      }
    }
  }
}
```

> **discount 부호 해석**:
> `discount = (현재가 - 적정가) / 적정가 × 100`
> 음수(-) = 현재가가 적정가보다 낮음 = **저평가(UNDERVALUED)**
> 양수(+) = 현재가가 적정가보다 높음 = **고평가(OVERVALUED)**

### ETF / 데이터 없는 경우

```json
{
  "valuation": {
    "srim": null
  }
}
```

### 신뢰도 LOW 케이스 (적자 기업)

```json
{
  "valuation": {
    "srim": {
      "method": "S-RIM",
      "inputs": { "roe": -5.2, "roeSource": "direct", ... },
      "scenarios": {
        "conservative": { "fairValue": 0, "fairPBR": 0, "discount": 999 },
        "base":         { "fairValue": 0, "fairPBR": 0, "discount": 999 },
        "optimistic":   { "fairValue": 0, "fairPBR": 0, "discount": 999 }
      },
      "summary": {
        "fairValueRange": { "min": 0, "max": 0 },
        "assessment": "OVERVALUED",
        "confidence": "LOW",
        "note": "ROE is negative or zero (loss-making period — S-RIM unreliable)"
      }
    }
  }
}
```

---

## 7. 테스트 시나리오 (수동 검증)

### 7-1. 정상 케이스

| 종목 | 기대 결과 |
|------|-----------|
| 삼성전자 (005930) | ROE ~15%, BPS ~50,000원 → 기본 적정가 ~75,000원 수준 |
| 현대차 (005380) | ROE ~10% → COE=10% 기준 적정가 ≈ EPS |
| NAVER (035420) | ROE ~7% → 기본 시나리오 COE=10% → fairValue < BPS 가능 |

### 7-2. 엣지 케이스

| 종목 유형 | 검증 항목 |
|-----------|-----------|
| ETF (069500) | `srim: null` 반환, API 오류 없음 |
| 적자 기업 | `confidence: 'LOW'`, `fairValue: 0` |
| Naver 크롤 실패 | ROE=null, EPS/BPS 역산 → `roeSource: 'derived'` |

---

## 8. 구현 순서 (Implementation Order)

1. **`src/analysis/valuation.ts` 생성** (독립적, 순수 함수)
   - 타입 정의
   - `calcScenario()` 헬퍼
   - `calculateSRIM()` 메인 함수

2. **`src/tools/korea/analysis.ts` 수정**
   - import 추가
   - `srimResult` 계산 라인 추가
   - 응답 JSON에 `valuation` 섹션 추가

3. **수동 테스트**
   - `curl -X POST localhost:3000/k-dexter/analyze/kr -d '{"symbol":"005930"}'`
   - valuation.srim 섹션 확인

---

## 9. 코드 품질 기준

- `valuation.ts`는 외부 I/O 없는 **순수 함수** (테스트 용이)
- 모든 숫자 연산에 `NaN` 방어 처리 (`isNaN()` 체크)
- `null | undefined` 허용 파라미터 → 명시적 null 반환 (throws 없음)
- 기존 `analysis.ts` 응답 구조 **backwards compatible** (valuation 필드 추가만)
