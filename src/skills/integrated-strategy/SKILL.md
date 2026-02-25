---
name: integrated_strategy
description: Formulates a complete investment strategy for a Korean stock by combining technical, fundamental, supply/demand analysis, and generating concrete trade levels (entry/target/stop-loss).
---

# Integrated Strategy Skill (Korea)

## Workflow Checklist

Copy and track progress:
```
Integrated Strategy Progress:
- [ ] Step 1: Identify Target (Symbol)
- [ ] Step 2: Run Comprehensive Analysis (analyze_kr_stock)
- [ ] Step 3: Supplement with Disclosure Check (search_kr_disclosures)
- [ ] Step 4: Supply/Demand Check (get_kr_investor_trend)
- [ ] Step 5: Synthesize Final Report with Trade Levels
```

## Step 1: Identify Target

Ensure you have:
1. **Stock Symbol** (6-digit, e.g., '005930')
2. **Company Name** for context

## Step 2: Run Comprehensive Analysis

Call `analyze_kr_stock` with the stock symbol.
- This single tool fetches **Price + Technicals + Fundamentals (KIS + Naver)** in parallel.
- It returns a unified report including:
  - **Scorer Result**: Total score (Trend / Momentum / Flow / Risk / Fundamental)
  - **Judgment**: AGRESSIVE_BUY / BUY_DIPS / HOLD / AVOID
  - **Trade Signal** with concrete levels:
    - `aggressiveEntry`: 즉시 진입가
    - `conservativeEntry`: 눌림목 대기 진입가 (BB 하단 또는 MA20)
    - `target1`: 1차 목표가 (최근 고점 / BB 상단)
    - `target2`: 2차 목표가 (피보나치 1.618 확장)
    - `stopLossAtr`: ATR 기반 손절가 (진입가 - ATR × 2)
    - `stopLossSupport`: MA60 지지선 기반 손절가
    - `riskRewardRatio`: 리스크/리워드 비율 (≥ 2.0 권장)
    - `positionSizePercent`: 포지션 사이즈 권고 (계좌 1% 위험 원칙)

## Step 3: Supplement with Disclosure Check

Call `search_kr_disclosures` for the company name.
- **Goal:** Identify any deal-breakers or catalysts in recent filings.
- **Watch for:** Rights Issue (Bad), Large Contracts (Good), Audit Opinions (Bad).
- If no CorpCode is available, use `web_search` to find it.

## Step 4: Supply/Demand Check

Call `get_kr_investor_trend` with the stock symbol.
- **Goal:** Confirm if "Smart Money" (Foreigners/Institutions) is aligned with the signal.
- Foreigner + Institution buying → Reinforces BUY signal.
- Both selling → Caution even if technicals look good.

## Step 5: Synthesize Final Report

Combine all data sources into a structured final report:

### Scoring Weights
| Factor | Weight | Source |
|--------|--------|--------|
| Technical (MA, RSI, MACD, BB) | 30% | `analyze_kr_stock` → scorer |
| Fundamental (PER, PBR, ROE, OP Margin) | 30% | `analyze_kr_stock` → scorer |
| Disclosure / News | 20% | `search_kr_disclosures` |
| Supply/Demand (Investor Flow) | 20% | `get_kr_investor_trend` |

### Final Report Format

```
## [종목명] ([종목코드]) 종합 투자 전략

### 📊 스코어 요약
- 총점: X / 10 → [AGRESSIVE_BUY / BUY_DIPS / HOLD / AVOID]
- 추세: X | 모멘텀: X | 펀더멘털: X | 리스크: X

### 💹 매매 가격 레벨
| 구분 | 가격 |
|------|------|
| 공격적 진입가 | {aggressiveEntry}원 |
| 보수적 진입가 | {conservativeEntry}원 |
| 1차 목표가 | {target1}원 |
| 2차 목표가 | {target2}원 |
| ATR 손절가 | {stopLossAtr}원 |
| 지지 손절가 | {stopLossSupport}원 |
| R/R 비율 | {riskRewardRatio} |
| 권고 비중 | {positionSizePercent}% |

### 🏦 펀더멘털
- PER: X배 / PBR: X배 / ROE: X% / 영업이익률: X%

### 📰 공시 리스크
- [주요 공시 내용 요약]

### 🌊 수급 동향
- 외국인: 매수/매도 | 기관: 매수/매도

### 📝 투자 근거
- [매수/관망/회피 이유 3줄 요약]

### ⚠️ 주요 리스크
- [예상 리스크 2-3가지]
```

> [!IMPORTANT]
> R/R 비율이 2.0 미만이면 진입 재검토를 권고합니다.
> 손절가는 반드시 포지션 진입 전 설정하고, 어떠한 경우에도 지킵니다.
