# Plan: S-RIM 기반 적정주가 산출 기능 추가

**Feature ID**: srim-valuation
**Status**: Plan
**Created**: 2026-03-03
**Updated**: 2026-03-03
**Level**: Dynamic

---

## 1. 배경 (Background)

### 현재 시스템

K-Dexter의 `/k-dexter/analyze/kr` 엔드포인트는 종목코드를 입력받아 다음 정보를 반환한다:

- **fundamentals**: PER, PBR, EPS, BPS, 시가총액, ROE, 부채비율, 영업이익률
- **technicals**: MA20/60/120, RSI, MFI, ATR
- **investor_trend_ratios**: 개인/외국인/기관 비중
- **scorer**: 5-factor 기술/펀더멘털 점수
- **trade_signal**: 매매 시그널, 진입가/목표가/손절가, 매물대 분석

### 문제: 내재가치(Intrinsic Value) 부재

현재 시스템은 **기술적 분석 + 상대 지표(PER, PBR)**만 제공한다.

- 현재 주가가 저평가인지 고평가인지 **절대적 기준**이 없음
- PER/PBR은 산업/시장 평균 대비 상대 비교에 적합하지만, 개별 종목 내재가치와는 다름
- 투자자가 "지금 이 주가가 싼가?"를 판단하기 위한 **적정주가** 정보 부재

### 해결 방안: S-RIM 방식 적정주가 산출

**S-RIM (Simplified Residual Income Model)**은 잔여이익모델의 간소화 버전으로,
한국 개인 투자자들이 가장 널리 활용하는 적정주가 계산 방식이다.

핵심 공식:
```
S-RIM 적정주가 = BPS × ROE / COE
              = EPS / COE
```

이미 API 응답에 **BPS, EPS, ROE** 데이터가 포함되어 있으므로,
추가 외부 API 호출 없이 계산이 가능하다.

---

## 2. S-RIM 공식 상세 (Formula Detail)

### 2-1. 이론적 배경

잔여이익모델(RIM)에서 성장률 g=0, 영구 잔여이익 가정 시:

```
내재가치 = BPS + 잔여이익 / COE
         = BPS + (ROE - COE) × BPS / COE
         = BPS + BPS × (ROE/COE - 1)
         = BPS × ROE / COE
         = EPS / COE
```

- **BPS** (Book Value Per Share): 주당순자산가치
- **ROE** (Return on Equity): 자기자본이익률 (%)
- **EPS** (Earnings Per Share): 주당순이익
- **COE** (Cost of Equity): 자기자본비용 = 투자자 요구수익률 (%)

### 2-2. 데이터 가용성

| 데이터 | 현재 소스 | 가용 여부 |
|--------|-----------|-----------|
| BPS    | KIS API (`priceData.bps`) | ✅ 사용 가능 |
| EPS    | KIS API (`priceData.eps`) | ✅ 사용 가능 |
| ROE    | Naver Finance (`fundamentalData.roe`) | ✅ 사용 가능 |
| COE    | 고정 시나리오 (8%, 10%, 12%) | ✅ 계산 가능 |

### 2-3. COE(요구수익률) 시나리오

단일 적정주가 대신 **3가지 COE 시나리오**로 범위를 제시한다:

| 시나리오 | COE | 의미 |
|----------|-----|------|
| 보수적 | 12% | 높은 요구수익률 → 낮은 적정가 (안전마진 확보) |
| 기본    | 10% | 표준 요구수익률 (한국 장기 시장 기대수익률) |
| 낙관적  | 8%  | 낮은 요구수익률 → 높은 적정가 |

### 2-4. 계산 예시 (삼성전자 005930)

```
BPS = 50,000원, ROE = 15%, EPS = 7,500원, 현재가 = 65,000원

보수적 (COE=12%): 7,500 / 0.12 = 62,500원
기본   (COE=10%): 7,500 / 0.10 = 75,000원
낙관적 (COE=8%):  7,500 / 0.08 = 93,750원

→ 현재가 65,000원은 기본 적정가(75,000원) 대비 13.3% 저평가
→ 보수적 기준으로는 4.0% 고평가
```

### 2-5. 보조 지표: 적정 PBR

```
적정PBR = ROE / COE
```

| 시나리오 | 적정PBR | 해석 |
|----------|---------|------|
| 보수적 (COE=12%) | ROE/0.12 | 이 PBR 이하면 저평가 |
| 기본   (COE=10%) | ROE/0.10 | 기준 PBR |
| 낙관적 (COE=8%)  | ROE/0.08 | 이 PBR 이하면 저평가 |

---

## 3. 목표 (Goals)

### 핵심 목표

> **기존 `/k-dexter/analyze/kr` 응답에 S-RIM 기반 적정주가 섹션을 추가하여,
> 투자자가 현재 주가의 내재가치 대비 저/고평가 여부를 즉시 파악할 수 있도록 한다.**

### 세부 목표

1. **S-RIM 계산 모듈**: COE 3가지 시나리오에 대한 적정주가 계산
2. **API 응답 통합**: 기존 `analyze/kr` 응답의 `valuation` 섹션에 S-RIM 결과 추가
3. **괴리율 산출**: 현재가 대비 적정가 할인/프리미엄 % 표시
4. **데이터 품질 처리**: BPS/EPS/ROE 미제공 종목(ETF 등) graceful 처리
5. **US 분석 API 확장 고려**: 향후 `/analyze/us` 동일 기능 추가 (Out-of-scope for MVP)

---

## 4. 성공 지표 (Success Metrics)

| 지표 | 목표 |
|------|------|
| S-RIM 적정주가 산출 성공률 | > 90% (BPS/ROE 데이터가 있는 종목 기준) |
| API 응답 시간 증가 | < 50ms (순수 계산 로직이므로 추가 I/O 없음) |
| 데이터 누락 종목 처리 | null/undefined 안전 처리, 오류 없이 응답 |
| 코드 범위 | 단일 함수로 캡슐화 (재사용 가능) |

---

## 5. 기능 범위 (Feature Scope)

### In-Scope (MVP)

- [x] **S-RIM 계산 함수** `calculateSRIM(bps, roe, eps, currentPrice)`
  - COE 3가지 시나리오 (8%, 10%, 12%) 적정주가
  - 현재가 대비 괴리율 (%)
  - 적정 PBR 계산
  - 종합 평가 레이블 (저평가/적정/고평가)

- [x] **`/k-dexter/analyze/kr` 응답 확장**
  - `valuation.srim` 섹션 추가
  - 기존 응답 구조 유지 (backwards compatible)

- [x] **데이터 가용성 방어 처리**
  - BPS = 0 또는 null → S-RIM 불가 (`null` 반환)
  - ROE 음수 → 계산 가능하나 신뢰도 낮음 경고 플래그
  - EPS 음수 → BPS 방식으로 폴백

### Out-of-Scope (이번 기획 제외)

- US 주식 S-RIM 계산 (`/analyze/us`)
- 성장률(g) 반영한 고급 DCF/Gordon Growth 모델
- 업종별 COE 자동 조정 (CAPM 기반 Beta 계산)
- 과거 S-RIM 추이 차트
- 대시보드 UI 연동

---

## 6. 데이터 구조 (Data Model)

### SRIMValuation 인터페이스

```typescript
interface SRIMScenario {
  coe: number;              // 요구수익률 (예: 0.10 = 10%)
  fairValue: number;        // 적정주가 (원)
  fairPBR: number;          // 적정 PBR = ROE / COE
  discount: number;         // 괴리율 (%) = (현재가 - 적정가) / 적정가 × 100
                            // 음수 = 저평가, 양수 = 고평가
}

interface SRIMValuation {
  method: 'S-RIM';
  inputs: {
    bps: number;            // 주당순자산 (원)
    eps: number;            // 주당순이익 (원)
    roe: number;            // 자기자본이익률 (%)
    currentPrice: number;   // 현재가 (원)
  };
  scenarios: {
    conservative: SRIMScenario;  // COE=12%
    base: SRIMScenario;          // COE=10%
    optimistic: SRIMScenario;    // COE=8%
  };
  summary: {
    fairValueRange: { min: number; max: number };  // 최소(보수적)~최대(낙관적)
    assessment: 'UNDERVALUED' | 'FAIR' | 'OVERVALUED';  // 기본 시나리오 기준
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';             // ROE 양수이고 데이터 완전 시 HIGH
  };
}
```

### API 응답 변경

기존 `/k-dexter/analyze/kr` 응답에 `valuation` 섹션 추가:

```json
{
  "symbol": "005930",
  "fundamentals": { ... },
  "technicals": { ... },
  "investor_trend_ratios": { ... },
  "scorer": { ... },
  "trade_signal": { ... },
  "valuation": {
    "srim": {
      "method": "S-RIM",
      "inputs": {
        "bps": 50000,
        "eps": 7500,
        "roe": 15.0,
        "currentPrice": 65000
      },
      "scenarios": {
        "conservative": {
          "coe": 0.12,
          "fairValue": 62500,
          "fairPBR": 1.25,
          "discount": -3.85
        },
        "base": {
          "coe": 0.10,
          "fairValue": 75000,
          "fairPBR": 1.50,
          "discount": 15.38
        },
        "optimistic": {
          "coe": 0.08,
          "fairValue": 93750,
          "fairPBR": 1.875,
          "discount": 44.23
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

---

## 7. API 설계 (API Design)

### 기존 엔드포인트 확장 (변경 없음)

```
POST /k-dexter/analyze/kr
  Body: { "symbol": "005930" }

  Response 변경:
  + valuation.srim  ← 신규 추가
  (기존 필드 유지)
```

별도 엔드포인트를 추가하지 않고 기존 분석 결과에 통합한다.

---

## 8. 구현 로드맵 (Implementation Roadmap)

### Phase 1: S-RIM 계산 모듈 (0.5일)

- `src/analysis/valuation.ts` 신규 파일 생성
  - `calculateSRIM(params)` 함수
  - 입력 유효성 검증 (BPS=0, ROE 음수 등)
  - 3가지 시나리오 계산
  - 종합 평가 산출

### Phase 2: 분석 파이프라인 통합 (0.5일)

- `src/tools/korea/analysis.ts` 수정
  - 기존 데이터(`bps`, `eps`, `roe`, `currentPrice`) → `calculateSRIM()` 호출
  - 응답 JSON에 `valuation.srim` 추가

### Phase 3: 검증 (0.5일)

- 삼성전자(005930), 카카오(035720) 등 주요 종목 실제 테스트
- BPS=0 종목(ETF 등) 오류 없음 확인
- ROE 음수 종목 처리 확인

---

## 9. 리스크 & 고려사항 (Risks & Considerations)

| 리스크 | 영향도 | 대응 |
|--------|--------|------|
| ROE 데이터 누락 (Naver 크롤링 실패 시) | 중간 | ROE=null이면 EPS/BPS로 역산 (ROE = EPS/BPS × 100) |
| ETF 종목: BPS/EPS 의미 없음 | 낮음 | BPS=0 또는 EPS=0 시 `null` 반환, 응답에서 `valuation: null` |
| ROE 음수 (적자 기업) | 중간 | 계산은 수행하되 `confidence: 'LOW'` 플래그 + 음수 적정가 → 0 처리 |
| KIS BPS가 분기 기준 vs 연간 기준 불일치 | 낮음 | 현재 KIS BPS는 연간 최근 확정치 사용 (허용 범위) |
| S-RIM 공식 단순성으로 인한 오차 | 낮음 | "참고용 지표"임을 명시, 다중 시나리오로 범위 제공 |

---

## 10. 참고 파일 (Reference Files)

- `src/tools/korea/analysis.ts:70-80` — combinedFundamentals 구성 (bps, eps, roe 수집)
- `src/tools/korea/kr-daily-financials.ts:86-98` — Naver Finance ROE 크롤링
- `src/tools/korea/kis-client.ts` — KIS API fetchCurrentPrice (bps, eps 포함)
- `src/tools/korea/analysis.ts:138-168` — 응답 JSON 구조 (valuation 섹션 추가 위치)

---

## 11. S-RIM 한계 및 해석 가이드

### 공식의 전제 조건

1. **ROE 영속성 가정**: 현재 ROE가 영구 지속된다는 가정 (낙관적일 수 있음)
2. **성장률 g=0 가정**: 성장 없는 성숙 기업에 적합 (성장주는 과소평가 가능)
3. **배당 정책 무관**: 배당 여부와 무관하게 BPS 기준으로 계산

### 올바른 활용법

```
S-RIM 적정가 > 현재가  → 저평가 신호 (매수 검토)
S-RIM 적정가 < 현재가  → 고평가 신호 (신규 매수 주의)
신뢰도 LOW (ROE 음수)  → 해당 연도 일시적 적자 가능성 확인 필요
```

### 다른 지표와 병행 활용

- PER 낮고 + S-RIM 저평가 → 이중 확인으로 신뢰도 상승
- PBR 1 미만 + S-RIM 저평가 → 강한 저평가 시그널
- trade_signal BUY + S-RIM 저평가 → 기술적+내재가치 동시 긍정
