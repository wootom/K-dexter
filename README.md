# K-Dexter: 한국 시장 특화 AI 금융 분석 API

[Original Dexter](https://github.com/virattt/dexter) 기반으로 한국 주식 시장 기능을 확장한 프로젝트입니다.  
**KIS API + 네이버 금융 크롤링**으로 기술적/펀더멘털 분석과 **구체적 매매 시그널(진입가/손절가/목표가)** 을 제공합니다.

---

## 🌐 API 엔드포인트 (외부 접근용)

> **Base URL**: `https://macmini.*******.ts.net`  
> Tailscale Funnel을 통해 ***** 24시간 서비스 중

### `POST /k-dexter/analyze/kr` — 한국 주식 종합 분석 ⭐

종목코드 하나만 입력하면 **자동으로** KIS + 네이버 데이터를 수집하여 분석합니다.

**Request**
```json
{ "symbol": "005930" }
```

**Response**
```json
{
  "symbol": "005930",
  "fundamentals": { "per": 12.5, "pbr": 1.1, "roe": 8.3, "debt_ratio": 34.2, "op_margin": 9.1 },
  "technicals": { "ma20": 55300, "ma60": 53100, "ma120": 51000, "rsi": 58.3, "atr": 1240 },
  "scorer": {
    "scores": { "trend": 3, "momentum": 1, "flow": 0, "risk": 0, "fundamental": 2, "total": 6 },
    "state": "상승 추세 (저평가/우량)",
    "strategy": { "short_term": "적극 매수 유효", "mid_term": "추세 추종 및 비중 확대" }
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
    "rationale": ["현재가(57,400)가 MA20(55,300) 위 → 단기 상승 추세", "..."]
  }
}
```

**curl 예시**
```bash
curl -X POST https://macmini.tail884f5f.ts.net/k-dexter/analyze/kr \
  -H "Content-Type: application/json" \
  -d '{"symbol": "005930"}'
```

### `GET /health`
```bash
curl https://macmini.tail884f5f.ts.net/health  # → OK
```

### `POST /k-dexter/analyze` — 수동 입력 분석 (기존)
사전에 계산된 지표값을 직접 전달하는 방식. 자세한 내용은 [API_USAGE.md](./API_USAGE.md) 참조.

---

## 📊 Google Sheets Apps Script 연동

```javascript
const K_DEXTER_URL = 'https://macmini.tail884f5f.ts.net';

// 셀 함수: =ANALYZE_KR("005930")
function ANALYZE_KR(symbol) {
  const res = UrlFetchApp.fetch(`${K_DEXTER_URL}/k-dexter/analyze/kr`, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify({ symbol: String(symbol) }),
  });
  const d = JSON.parse(res.getContentText());
  const lv = d.trade_signal?.levels;
  return `[${d.scorer.scores.total}점] ${d.scorer.state} | 진입 ${lv?.aggressiveEntry?.toLocaleString()} | 목표 ${lv?.target1?.toLocaleString()} | 손절 ${lv?.stopLossAtr?.toLocaleString()} | R/R ${lv?.riskRewardRatio}`;
}
```

---

## 🏗️ 아키텍처

```
KIS API (시세/기술지표)  ──┐
                           ├──► analyze_kr_stock ──► Scorer ──► TradeSignal
Naver Finance (ROE 등)  ──┘
```

### 스코어링 모델 (5-factor)
| 요소 | 범위 | 설명 |
|------|------|------|
| Trend | 0~3 | MA20/60/120 대비 가격 위치 |
| Momentum | -1~2 | RSI + 거래량 |
| Flow | -1~1 | 시장 지수 맥락 |
| Risk | -1~1 | 변동성/섹터 |
| Fundamental | -2~3 | PER/PBR/ROE/영업이익률 |

### 매매 시그널 (`trade_signal.levels`)
| 필드 | 설명 |
|------|------|
| `aggressiveEntry` | 공격적 진입가 (현재가) |
| `conservativeEntry` | 보수적 진입가 (MA20 or BB 하단) |
| `target1` | 1차 목표가 (최근 고점/BB 상단) |
| `target2` | 2차 목표가 (피보나치 1.618) |
| `stopLossAtr` | ATR 기반 손절가 (진입가 - ATR×2) |
| `stopLossSupport` | MA60 기반 손절가 |
| `riskRewardRatio` | R/R 비율 (≥2.0 권장) |
| `positionSizePercent` | 권고 포지션 비중 (계좌 1% 위험 원칙) |

---

## 🚀 로컬 실행

```bash
bun install
cp env.example .env  # API 키 입력

# API 서버 (HTTP REST)
bun run start:api     # http://localhost:3000

# AI 에이전트 CLI
bun start
```

### 환경변수 (.env)
```env
KIS_APP_KEY=...
KIS_APP_SECRET=...
KIS_IS_PAPER_TRADING=true   # false = 실전투자
DART_API_KEY=...
OPENAI_API_KEY=...
```

---

## 📁 주요 파일 구조

```
src/
├── analysis/
│   ├── scorer.ts           # 5-factor 스코어링
│   ├── signal-generator.ts # ATR 기반 매매 시그널 생성
│   └── types.ts
├── tools/korea/
│   ├── analysis.ts         # analyze_kr_stock 통합 툴
│   ├── kis-client.ts       # KIS API 클라이언트
│   ├── kr-daily-financials.ts  # 네이버 금융 크롤러
│   └── technical.ts        # 기술적 지표 분석
├── skills/integrated-strategy/SKILL.md  # AI 에이전트용 워크플로우
└── server.ts               # Hono HTTP API 서버
```

---

## ⚠️ 주의사항

- 종목코드: 한국 6자리 숫자 (`005930`), 미국 티커 (`AAPL`)
- KIS API 레이트 리밋: 연속 요청 시 1~2초 간격 필요
- 네이버 금융 크롤링은 HTML 구조 변경 시 영향받을 수 있음
