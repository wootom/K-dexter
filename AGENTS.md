# Repository Guidelines

- Repo: https://github.com/virattt/dexter
- Dexter is a CLI-based AI agent for deep financial research, built with TypeScript, Ink (React for CLI), and LangChain.

## Project Structure

- Source code: `src/`
  - Agent core: `src/agent/` (agent loop, prompts, scratchpad, token counting, types)
  - CLI interface: `src/cli.tsx` (Ink/React), entry point: `src/index.tsx`
  - Components: `src/components/` (Ink UI components)
  - Hooks: `src/hooks/` (React hooks for agent runner, model selection, input history)
  - Model/LLM: `src/model/llm.ts` (multi-provider LLM abstraction)
  - Tools: `src/tools/` (financial search, web search, browser, skill tool)
  - Tool descriptions: `src/tools/descriptions/` (rich descriptions injected into system prompt)
  - Finance tools: `src/tools/finance/` (prices, fundamentals, filings, insider trades, etc.)
  - Search tools: `src/tools/search/` (Exa preferred, Tavily fallback)
  - Browser: `src/tools/browser/` (Playwright-based web scraping)
  - Skills: `src/skills/` (SKILL.md-based extensible workflows, e.g. DCF valuation)
  - Utils: `src/utils/` (env, config, caching, token estimation, markdown tables)
  - Evals: `src/evals/` (LangSmith evaluation runner with Ink UI)
- Config: `.dexter/settings.json` (persisted model/provider selection)
- Environment: `.env` (API keys; see `env.example`)
- Scripts: `scripts/release.sh`

## Build, Test, and Development Commands

- Runtime: Bun (primary). Use `bun` for all commands.
- Install deps: `bun install`
- Run: `bun run start` or `bun run src/index.tsx`
- Dev (watch mode): `bun run dev`
- Type-check: `bun run typecheck`
- Tests: `bun test`
- Evals: `bun run src/evals/run.ts` (full) or `bun run src/evals/run.ts --sample 10` (sampled)
- CI runs `bun run typecheck` and `bun test` on push/PR.

## Coding Style & Conventions

- Language: TypeScript (ESM, strict mode). JSX via React (Ink for CLI rendering).
- Prefer strict typing; avoid `any`.
- Keep files concise; extract helpers rather than duplicating code.
- Add brief comments for tricky or non-obvious logic.
- Do not add logging unless explicitly asked.
- Do not create README or documentation files unless explicitly asked.

## LLM Providers

- Supported: OpenAI (default), Anthropic, Google, xAI (Grok), OpenRouter, Ollama (local).
- Default model: `gpt-5.2`. Provider detection is prefix-based (`claude-` -> Anthropic, `gemini-` -> Google, etc.).
- Fast models for lightweight tasks: see `FAST_MODELS` map in `src/model/llm.ts`.
- Anthropic uses explicit `cache_control` on system prompt for prompt caching cost savings.
- Users switch providers/models via `/model` command in the CLI.

## Tools

- `financial_search`: primary tool for all financial data queries (prices, metrics, filings). Delegates to multiple sub-tools internally.
- `financial_metrics`: direct metric lookups (revenue, market cap, etc.).
- `read_filings`: SEC filing reader for 10-K, 10-Q, 8-K documents.
- `web_search`: general web search (Exa if `EXASEARCH_API_KEY` set, else Tavily if `TAVILY_API_KEY` set).
- `browser`: Playwright-based web scraping for reading pages the agent discovers.
- `skill`: invokes SKILL.md-defined workflows (e.g. DCF valuation). Each skill runs at most once per query.
- Tool registry: `src/tools/registry.ts`. Tools are conditionally included based on env vars.

## Skills

- Skills live as `SKILL.md` files with YAML frontmatter (`name`, `description`) and markdown body (instructions).
- Built-in skills: `src/skills/dcf/SKILL.md`.
- Discovery: `src/skills/registry.ts` scans for SKILL.md files at startup.
- Skills are exposed to the LLM as metadata in the system prompt; the LLM invokes them via the `skill` tool.

## Agent Architecture

- Agent loop: `src/agent/agent.ts`. Iterative tool-calling loop with configurable max iterations (default 10).
- Scratchpad: `src/agent/scratchpad.ts`. Single source of truth for all tool results within a query.
- Context management: Anthropic-style. Full tool results kept in context; oldest results cleared when token threshold exceeded.
- Final answer: generated in a separate LLM call with full scratchpad context (no tools bound).
- Events: agent yields typed events (`tool_start`, `tool_end`, `thinking`, `answer_start`, `done`, etc.) for real-time UI updates.

## Environment Variables

- LLM keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`
- Ollama: `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`)
- Finance: `FINANCIAL_DATASETS_API_KEY`
- Search: `EXASEARCH_API_KEY` (preferred), `TAVILY_API_KEY` (fallback)
- Tracing: `LANGSMITH_API_KEY`, `LANGSMITH_ENDPOINT`, `LANGSMITH_PROJECT`, `LANGSMITH_TRACING`
- Never commit `.env` files or real API keys.

## Version & Release

- Version format: CalVer `YYYY.M.D` (no zero-padding). Tag prefix: `v`.
- Release script: `bash scripts/release.sh [version]` (defaults to today's date).
- Release flow: bump version in `package.json`, create git tag, push tag, create GitHub release via `gh`.
- Do not push or publish without user confirmation.

## Testing

- Framework: Bun's built-in test runner (primary), Jest config exists for legacy compatibility.
- Tests colocated as `*.test.ts`.
- Run `bun test` before pushing when you touch logic.

## Security

- API keys stored in `.env` (gitignored). Users can also enter keys interactively via the CLI.
- Config stored in `.dexter/settings.json` (gitignored).
- Never commit or expose real API keys, tokens, or credentials.

---

## K-Dexter REST API Server

K-Dexter extends the original Dexter CLI with a Hono-based REST API server (`src/server.ts`, port 3000).

### Run

```bash
bun run src/server.ts
```

### K-Dexter Specific Environment Variables

- `KIS_APP_KEY` / `KIS_APP_SECRET`: 한국투자증권 Open API 인증
- `KIS_IS_PAPER_TRADING`: `true`면 모의투자 서버 사용 (기본: 실서버)
- `PORT`: 서버 포트 (기본: 3000)

### API Endpoints

#### Stock Analysis

**`POST /k-dexter/analyze/kr`** — 한국 주식 종합 분석

```json
// Request
{ "symbol": "005930" }

// Response
{
  "symbol": "005930",
  "fundamentals": {
    "per": 12.5, "pbr": 1.1, "eps": 7500, "bps": 50000,
    "marketCap": 4000000, "roe": 15.0, "debt_ratio": 30.5, "op_margin": 18.2
  },
  "technicals": {
    "ma20": 64000, "ma60": 62000, "ma120": 58000,
    "rsi": 52.3, "mfi": 48.1, "atr": 1200
  },
  "investor_trend_ratios": {
    "individual": 45.2, "foreigner": 32.1, "institution": 22.7
  },
  "scorer": {
    "scores": { "trend": 2, "momentum": 1, "flow": 0, "risk": 0, "fundamental": 2, "total": 5 },
    "state": "상승 추세 (저평가/우량)",
    "strategy": { "short_term": "추격 매수 자제", "mid_term": "눌림목 분할 매수" }
  },
  "trade_signal": {
    "signal": "BUY",
    "swing_grade": "B",
    "levels": { "aggressiveEntry": 65000, "target1": 69000, "stopLossAtr": 62000 },
    "volume_profile": { "poc": 63500, "position": "above" },
    "rationale": "..."
  },
  "valuation": {
    "srim": {
      "method": "S-RIM",
      "inputs": { "bps": 50000, "eps": 7500, "roe": 15.0, "currentPrice": 65000, "roeSource": "direct" },
      "scenarios": {
        "conservative": { "coe": 0.12, "fairValue": 62500, "fairPBR": 1.25, "discount": 4.0 },
        "base":         { "coe": 0.10, "fairValue": 75000, "fairPBR": 1.50, "discount": -13.33 },
        "optimistic":   { "coe": 0.08, "fairValue": 93750, "fairPBR": 1.875, "discount": -30.67 }
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

> `valuation.srim` is `null` for ETFs or when BPS data is unavailable.
> `discount` sign: negative = undervalued, positive = overvalued (relative to fair value).

**`POST /k-dexter/analyze/us`** — 미국 주식 분석

```json
// Request
{ "symbol": "NVDA", "exchange": "NAS" }
// exchange: "NAS" | "NYS" | "AMS"
```

#### Backtest

**`POST /k-dexter/backtest/run`** — 백테스트 실행

```json
// Request
{
  "universe": ["005930", "000660"],
  "gradeFilter": ["A"],
  "holdingPeriod": 10,
  "weights": { "technicalScoreMax": 3, "rrScoreMax": 2, "volumeProfileMax": 2, "ma60Max": 1 },
  "thresholds": { "A": 7, "B": 5, "C": 3 }
}
```

**`POST /k-dexter/backtest/parameter-sweep`** — 파라미터 최적화

**`GET  /k-dexter/backtest/results`** — 백테스트 결과 목록

**`GET  /k-dexter/backtest/results/:id`** — 특정 결과 조회

#### Dashboard

**`GET /dashboard`** — 백테스트 대시보드 (정적 HTML)

### S-RIM Valuation Formula

```
적정주가 = EPS / COE  (= BPS × ROE / COE)

discount = (현재가 - 적정가) / 적정가 × 100
  음수(-) = 저평가(UNDERVALUED)
  양수(+) = 고평가(OVERVALUED)

assessment (base COE=10% 기준):
  discount < -5%  → UNDERVALUED
  -5% ~ 10%       → FAIR
  discount > 10%  → OVERVALUED
```

### Key Source Files (K-Dexter)

- `src/server.ts` — Hono REST API 서버
- `src/analysis/scorer.ts` — 5-factor 채점 (Trend/Momentum/Flow/Risk/Fundamental)
- `src/analysis/signal-generator.ts` — Swing Grade + 매매 시그널
- `src/analysis/valuation.ts` — S-RIM 적정주가 계산 (순수 함수)
- `src/analysis/volume-profile.ts` — 매물대(POC/VAL/VAH) 계산
- `src/tools/korea/analysis.ts` — KR 분석 오케스트레이터
- `src/tools/korea/kis-client.ts` — KIS Open API 클라이언트
- `src/tools/korea/kr-daily-financials.ts` — Naver Finance 크롤러
- `src/backtest/` — 백테스트 엔진 (engine, stats, parameter-sweep)
