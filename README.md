# K-Dexter: 한국 시장 특화 자율형 금융 리서치 에이전트

[Original Dexter README](https://github.com/virattt/dexter) 기반으로 한국 시장 기능을 확장한 프로젝트입니다.

## 🚀 시작하기 (How to Run)

1. **의존성 설치**
   ```bash
   bun install
   ```

2. **환경변수 설정**
   `.env` 파일에 API 키를 설정하세요:
   ```env
   OPENAI_API_KEY=sk-...
   KIS_APP_KEY=...
   KIS_APP_SECRET=...
   DART_API_KEY=...
   ```

3. **에이전트 실행**
   ```bash
   bun start
   ```

---

## 💡 사용 예시 (Example Queries)

K-Dexter는 한국어/영어 질의를 모두 이해하고 적절한 도구를 선택합니다.

### 1. 기술적 분석 (Technical Analysis) - KR & US
이동평균선, RSI, MACD, 볼린저밴드, 수급(KR)을 분석합니다.
> "삼성전자(005930)의 기술적 분석을 해줘"
> "Analyze technicals for AAPL (Apple)"
> "SK하이닉스(000660) 지금 사도 될까?"

### 2. 공시 분석 (Disclosure Analysis) - KR Only
DART에서 최근 공시를 찾아 호재/악재 여부를 판단합니다.
> "카카오(035720) 최근 공시 분석해줘"
> "하이브(352820) 유상증자 공시 있어?"

### 3. 통합 투자 전략 (Integrated Strategy)
기술적 + 기본적 + 수급 분석을 종합하여 투자 의견(매수/매도/보유)을 제시합니다.
> "NAVER(035420)에 대한 종합 투자 전략을 세워줘"
> "현대차(005380) 지금 진입해도 될지 분석해줘"

---

## 🛠️ 주요 기능 (Tools & Skills)

### 🇰🇷 한국 시장 (Korea Market)
- **KIS API**: 실시간 시세, 일봉 데이터, 투자자별 매매동향 (`get_kr_...`)
- **DART API**: 전자공시 검색, 기업 개황, 재무제표 (`search_kr_...`)
- **Skills**: 정배열/역배열, 과열/침체, 공시 영향력 평가

### 🇺🇸 미국 시장 (US Market) [NEW]
- **KIS Overseas API**: 실시간 시세, 일봉 데이터 (`get_us_...`)
- **Skills**: 미국 주식 기술적 분석 (MA, RSI, MACD, BB)

## ⚠️ 주의사항

- **종목코드**:
  - 한국: 6자리 숫자 (예: `005930`)
  - 미국: 티커 심볼 (예: `AAPL`, `TSLA`)
- **모의투자**: 초기 설정은 KIS 모의투자 도메인을 사용합니다. 실전 투자 시 `.env`의 `KIS_IS_PAPER_TRADING`을 확인하세요.
