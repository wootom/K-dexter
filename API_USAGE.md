
# K-Dexter Market Analysis API - Usage Guide

## 1. Starting the Server

```bash
# 프로젝트 디렉토리에서 실행
cd /Users/woojanghoon/Documents/Code/K-dexter
bun run src/server.ts

# 또는 pm2로 백그라운드 실행 (권장)
pm2 start "bun run src/server.ts" --name k-dexter-api --cwd /path/to/K-dexter
```

- **로컬**: `http://localhost:3000`
- **외부 (Tailscale Funnel)**: `https://macmini.tail884f5f.ts.net`

---

## 2. API Endpoints

### **POST** `/k-dexter/analyze/kr` ⭐ 추천

종목코드 하나만 넘기면 **KIS + 네이버 금융**을 자동 수집하여 분석합니다.

#### Request
```json
{ "symbol": "005930" }
```

#### Response (전체 필드)
```json
{
  "symbol": "005930",

  "fundamentals": {
    "per": 12.5,          // PER (주가수익비율)
    "pbr": 1.1,           // PBR (주가순자산비율)
    "eps": 4230,          // 주당순이익 (원)
    "bps": 52000,         // 주당순자산 (원)
    "marketCap": 3890000, // 시가총액 (억원)
    "roe": 8.3,           // 자기자본이익률 (%)
    "debt_ratio": 34.2,   // 부채비율 (%)
    "op_margin": 9.1      // 영업이익률 (%)
  },

  "technicals": {
    "ma20": 55300,        // 20일 이동평균
    "ma60": 53100,        // 60일 이동평균
    "ma120": 51000,       // 120일 이동평균
    "rsi": 58.3,          // RSI (14일)
    "atr": 1240           // ATR 평균변동폭 (14일)
  },

  "scorer": {
    "scores": {
      "trend": 3,         // 추세 (0~3)
      "momentum": 1,      // 모멘텀 (-1~2)
      "flow": 0,          // 시장흐름 (-1~1)
      "risk": 0,          // 리스크 (-1~1)
      "fundamental": 2,   // 펀더멘털 (-2~3)
      "total": 6          // 총점 (-5~10)
    },
    "state": "상승 추세 (저평가/우량)",
    "strategy": {
      "short_term": "적극 매수 유효",
      "mid_term": "추세 추종 및 비중 확대"
    },
    "confidence_level": "MEDIUM"
  },

  "trade_signal": {
    "signal": "BUY",              // BUY / SELL / NEUTRAL
    "swing_grade": "A",           // 2주 이익실현 적합도 ← 아래 설명 참조

    "levels": {
      "aggressiveEntry": 57400,   // 공격적 진입가 (현재가)
      "conservativeEntry": 55300, // 보수적 진입가 (매물대 지지 or MA20)
      "target1": 58200,           // 1차 목표가 (상단 매물대 직전, 2주 현실적 목표)
      "target2": 60100,           // 2차 목표가 (피보나치 1.618, ATR×10 이내)
      "stopLossAtr": 54920,       // ATR 기반 손절가
      "stopLossSupport": 54000,   // 매물대 지지선 기반 손절가
      "atr": 1240,
      "riskRewardRatio": 2.15,    // R/R 비율 (권장 ≥ 2.0)
      "positionSizePercent": 8.5, // 권고 포지션 비중 (계좌 1% 위험 원칙)
      "estimatedReturnPct": 3.5   // 2주 예상 수익률 (%)
    },

    "volume_profile": {           // 매물대 분석 (일봉 60일 기준)
      "poc": 56000,               // Point of Control: 핵심 매물대
      "valueAreaHigh": 58500,     // 가치구간 상단 (거래량 70%)
      "valueAreaLow": 54000,      // 가치구간 하단
      "nearestResistance": 58500, // 가장 가까운 상단 저항
      "nearestSupport": 54200,    // 가장 가까운 하단 지지
      "pricePosition": "above_poc" // above_poc / at_poc / below_poc
    },

    "rationale": [                // 분석 근거 (한국어)
      "현재가(57,400)가 MA20(55,300) 위 → 단기 상승 추세",
      "RSI 58.3 → 중립",
      "현재가가 POC(56,000) 위 → 매물대 돌파 안착 구간",
      "상단 저항: 58,500원 (+1.9%) → 1차 목표가 기준",
      "하단 지지: 54,200원 (-5.6%) → 손절 기준선",
      "ATR 1,240 | 손절 54,920 | R/R 2.15 | 2주 이익실현 목표 3.5%",
      "스윙 적합도: A등급 (최적)"
    ]
  }
}
```

---

## 3. swing_grade (2주 이익실현 적합도)

현재 종목이 **2주(10 거래일) 이내 이익실현 전략에 얼마나 적합한지**를 8점 만점으로 평가합니다.

### 점수 기준

| 항목 | 조건 | 점수 |
|------|------|------|
| 기술적 점수 | ≥70점 | +3 |
| | 55~69점 | +2 |
| | 45~54점 | +1 |
| R/R 비율 | ≥ 3.0 | +2 |
| | 2.0~2.9 | +1 |
| 매물대 위치 | POC 위 (돌파 안착) | +2 |
| | POC 근처 | +1 |
| | POC 아래 (저항 아래) | +0 |
| MA60 위 | 중기 상승 추세 | +1 |

### 등급 해석

| 등급 | 점수 | 의미 | 행동 |
|------|------|------|------|
| **A** | 7~8점 | 최적 | 적극 진입 고려 |
| **B** | 5~6점 | 양호 | 진입 가능, 리스크 관리 |
| **C** | 3~4점 | 보통 | 관망 또는 소량 진입 |
| **D** | 0~2점 | 부적합 | 진입 보류 |

### Google Sheets 활용 예시
```javascript
// A/B 등급만 필터링
if (data.trade_signal.swing_grade === 'A' || data.trade_signal.swing_grade === 'B') {
  // 진입 검토 대상
}
```

---

## 4. `POST /k-dexter/analyze` — 수동 입력 분석 (기존)

사전에 계산된 지표값을 직접 전달합니다. Scorer 결과만 반환하며 TradeSignal·매물대는 포함되지 않습니다.

```bash
curl -X POST http://localhost:3000/k-dexter/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "TSEM",
    "market": "US",
    "timestamp": "2026-02-10T22:58:00+09:00",
    "price": 100.00,
    "moving_averages": { "ma20": 90, "ma60": 80, "ma120": 70 },
    "volume": { "avg_5d": 120, "avg_20d": 100 },
    "momentum": { "rsi_14": 60 },
    "index_context": { "main_index": "NASDAQ", "index_trend": "up" }
  }'
```

---

## 5. 엔드포인트 비교

| | `/k-dexter/analyze/kr` ⭐ | `/k-dexter/analyze` |
|--|--|--|
| **입력** | symbol 하나 | 지표값 전부 직접 입력 |
| **데이터 수집** | 자동 (KIS + Naver) | 수동 |
| **TradeSignal** | ✅ 진입/손절/목표가 | ❌ |
| **매물대** | ✅ Volume Profile | ❌ |
| **스윙 등급** | ✅ A/B/C/D | ❌ |
| **대상 시장** | 한국 전용 | 한국/미국 |

---

## 6. Health Check

```bash
curl https://macmini.tail884f5f.ts.net/health  # → OK
```
