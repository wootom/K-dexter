
# K-Dexter Market Analysis API - Usage Guide

## 1. Starting the Server

```bash
bun run start:api
```

- **Port**: 3000 (default)
- **Base URL**: `http://localhost:3000`

---

## 2. API Endpoints

### **POST** `/k-dexter/analyze/kr` ⭐ NEW (추천)

종목코드 하나만 넘기면 **KIS 가격/기술적 지표 + 네이버 금융 펀더멘털**을 자동 수집하고,  
**Scoring + 매매 시그널 (진입가 / 목표가 / 손절가 / R/R)** 을 모두 반환합니다.

#### Request

```json
{
  "symbol": "005930"
}
```

#### Response

```json
{
  "symbol": "005930",
  "fundamentals": {
    "per": 12.5,  "pbr": 1.1,
    "roe": 8.3,   "debt_ratio": 34.2,  "op_margin": 9.1
  },
  "technicals": {
    "ma20": 55300,  "ma60": 53100,  "ma120": 51000,
    "rsi": 58.3,    "atr": 1240
  },
  "scorer": {
    "symbol": "005930",
    "scores": {
      "trend": 3,  "momentum": 1,  "flow": 0,
      "risk": 0,   "fundamental": 2,  "total": 6
    },
    "state": "상승 추세 (저평가/우량)",
    "strategy": {
      "short_term": "적극 매수 유효",
      "mid_term": "추세 추종 및 비중 확대"
    },
    "confidence_level": "MEDIUM"
  },
  "trade_signal": {
    "signal": "BUY",
    "levels": {
      "aggressiveEntry": 57400,
      "conservativeEntry": 55300,
      "target1": 61000,
      "target2": 63340,
      "stopLossAtr": 54920,
      "stopLossSupport": 52569,
      "atr": 1240,
      "riskRewardRatio": 2.15,
      "positionSizePercent": 8.5
    },
    "rationale": [
      "현재가(57,400)가 MA20(55,300) 위 → 단기 상승 추세",
      "RSI 58.3 → 중립 구간",
      "ATR 1240 (14일 변동성), 손절가: 54920 / 지지 손절: 52569",
      "리스크/리워드: 2.15 (권장 ≥ 2.0)"
    ]
  }
}
```

#### Testing with curl

```bash
curl -X POST http://localhost:3000/k-dexter/analyze/kr \
  -H "Content-Type: application/json" \
  -d '{"symbol": "005930"}'
```

---

### **POST** `/k-dexter/analyze` (기존 — 수동 입력)

사전에 계산된 지표값을 직접 전달할 때 사용합니다.  
Scorer만 실행하므로 TradeSignal은 포함되지 않습니다.

#### Request

```json
{
  "symbol": "TSEM",
  "market": "US",
  "timestamp": "2026-02-10T22:58:00+09:00",
  "price": 100.00,
  "moving_averages": { "ma20": 90, "ma60": 80, "ma120": 70 },
  "volume": { "avg_5d": 120000, "avg_20d": 100000 },
  "momentum": { "rsi_14": 60 },
  "index_context": { "main_index": "NASDAQ", "index_trend": "up" },
  "fundamentals": { "per": 15.0, "pbr": 1.5, "roe": 12.0 }
}
```

#### Response

```json
{
  "symbol": "TSEM",
  "scores": { "trend": 3, "momentum": 2, "flow": 1, "risk": 0, "fundamental": 1, "total": 7 },
  "state": "상승 추세",
  "strategy": { "short_term": "적극 매수 유효", "mid_term": "추세 추종 및 비중 확대" },
  "confidence_level": "MEDIUM"
}
```

---

## 3. 엔드포인트 비교

| | `/k-dexter/analyze/kr` | `/k-dexter/analyze` |
|--|--|--|
| **입력** | `symbol` 하나만 | 지표값 전부 직접 입력 |
| **데이터 수집** | 자동 (KIS + Naver) | 수동 |
| **TradeSignal** | ✅ 진입/손절/목표가 포함 | ❌ Scorer 결과만 |
| **대상 시장** | 한국 주식 전용 | 한국/미국 모두 가능 |

---

## 4. Health Check

```bash
curl http://localhost:3000/health
# → OK
```
