# etf-mixed-code Analysis Report

> **Analysis Type**: Gap Analysis
>
> **Project**: K-Dexter
> **Analyst**: gap-detector
> **Date**: 2026-03-02
> **Change Requirement**: KRX 2025+ ETF mixed alphanumeric 6-digit code support

---

## 1. Analysis Overview

### 1.1 Analysis Purpose

KRX(한국거래소)에서 2025년 이후 신규 상장 ETF에 적용되는 숫자+영문 혼합 6자리 코드(e.g., `K0000A`, `A12345`)를 지원하기 위해, 기존 순수 6자리 숫자 코드 검증 로직(`/^\d{6}$/`)이 혼합 코드를 허용하는 패턴(`/^[A-Z0-9]{6}$/i`)으로 올바르게 변경되었는지 전 코드베이스를 검증한다.

### 1.2 Analysis Scope

| Item | Path |
|------|------|
| Backtest/Sweep endpoint | `src/server.ts` |
| KR analysis tool | `src/tools/korea/analysis.ts` |
| KIS API client | `src/tools/korea/kis-client.ts` |
| Naver financials scraper | `src/tools/korea/kr-daily-financials.ts` |
| Technical analysis tool | `src/tools/korea/technical.ts` |
| MCP Server | `src/mcp-server/index.ts` |
| Backtest types | `src/backtest/types.ts` |

---

## 2. Gap Analysis (Checkpoint Results)

### Checkpoint 1: `/k-dexter/backtest/run` endpoint

**File**: `src/server.ts` (line 150)

| Item | Expected | Actual | Status |
|------|----------|--------|--------|
| Regex pattern | `/^[A-Z0-9]{6}$/i` | `/^[A-Z0-9]{6}$/i` | PASS |
| Comment updated | Yes | Yes (line 149: "6자리 숫자 또는 숫자+영문 혼합") | PASS |

**Result**: PASS -- The regex has been correctly updated from `\d{6}` to `[A-Z0-9]{6}` with case-insensitive flag.

---

### Checkpoint 2: `/k-dexter/backtest/parameter-sweep` endpoint

**File**: `src/server.ts` (line 199)

| Item | Expected | Actual | Status |
|------|----------|--------|--------|
| Regex pattern | `/^[A-Z0-9]{6}$/i` | `/^[A-Z0-9]{6}$/i` | PASS |

**Result**: PASS -- Same updated regex is applied here as well.

---

### Checkpoint 3: `/k-dexter/analyze/kr` endpoint

**File**: `src/server.ts` (lines 80-104)

| Item | Expected | Actual | Status |
|------|----------|--------|--------|
| Format validation | No hardcoded numeric-only check | No format regex exists | PASS |

**Analysis**: This endpoint validates only that `symbol` exists and is a `string` (line 85). It does not apply any format regex like `\d{6}`, so mixed codes pass through freely to downstream tools. No gap.

---

### Checkpoint 4: `src/tools/korea/` sub-files

#### 4a. `src/tools/korea/analysis.ts`

| Item | Finding | Status |
|------|---------|--------|
| Zod schema | `z.string()` only, no format constraint (line 160) | PASS |
| Internal logic | No format validation or regex on symbol | PASS |

#### 4b. `src/tools/korea/kis-client.ts`

| Item | Finding | Status |
|------|---------|--------|
| `fetchCurrentPrice(symbol)` | Passes symbol directly to KIS API query param `FID_INPUT_ISCD` (line 112). No format validation. | PASS |
| `fetchDailyOHLCV(symbol, period)` | Passes symbol directly to KIS API (line 172). No format validation. | PASS |
| `fetchInvestorTrend(symbol)` | Passes symbol directly (line 236). No format validation. | PASS |
| Tool Zod schemas | All use `z.string()` without regex constraint (lines 373, 393, 409) | PASS |

#### 4c. `src/tools/korea/kr-daily-financials.ts`

| Item | Finding | Status |
|------|---------|--------|
| `fetchNaverFinancials(symbol)` | Passes symbol directly to Naver URL query param (line 22). No format validation. | PASS |
| Tool Zod schema | `z.string()` only (line 113). Description says "종목코드 (예: 005930)" but this is documentation only, not a constraint. | PASS |

#### 4d. `src/tools/korea/technical.ts`

| Item | Finding | Status |
|------|---------|--------|
| `analyzeKrTechnical` | Passes symbol to `fetchDailyOHLCV` (line 13). No format validation. | PASS |
| Zod schema | `z.string()` only (line 47). Description example "005930" is documentation only. | PASS |

---

### Checkpoint 5: `src/mcp-server/index.ts`

| Item | Finding | Status |
|------|---------|--------|
| Input schema | JSON Schema `{ type: "string" }` for `ticker` (line 36). No `pattern` constraint. | PASS |
| Validation logic | Only checks `!ticker` (line 51). No format regex. | PASS |

---

### Full Codebase Regex Scan

A project-wide search for the legacy pattern `\d{6}` in `src/` returned **zero matches**. The old numeric-only pattern has been fully removed.

---

## 3. Match Rate Summary

```
+---------------------------------------------+
|  Overall Match Rate: 100% (5/5 checkpoints) |
+---------------------------------------------+
|  PASS  Checkpoint 1: backtest/run regex      |
|  PASS  Checkpoint 2: parameter-sweep regex   |
|  PASS  Checkpoint 3: analyze/kr passthrough  |
|  PASS  Checkpoint 4: korea/ tools (4 files)  |
|  PASS  Checkpoint 5: mcp-server/index.ts     |
+---------------------------------------------+
```

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match (regex update) | 100% | PASS |
| Consistency (no legacy pattern remaining) | 100% | PASS |
| Downstream compatibility | 100% | PASS |
| **Overall** | **100%** | **PASS** |

---

## 4. Detailed Findings

### 4.1 Missing Features (Design O, Implementation X)

None. All required changes have been implemented.

### 4.2 Added Features (Design X, Implementation O)

None. No undocumented additions were found.

### 4.3 Changed Features (Design != Implementation)

None. The implementation matches the requirement specification exactly.

---

## 5. Observations and Recommendations

### 5.1 Documentation-Only Items (Informational, No Action Required)

The following locations contain example strings like `005930` in description text. These are not validation logic and do not block mixed codes. However, updating them would improve developer clarity.

| File | Line | Current Text | Suggested Update |
|------|------|-------------|-----------------|
| `src/server.ts` | 86 | `"symbol" field is required (e.g., "005930")` | `(e.g., "005930", "K0000A")` |
| `src/tools/korea/analysis.ts` | 160 | `'Stock symbol (e.g., 005930)'` | `'Stock symbol (e.g., 005930, K0000A)'` |
| `src/tools/korea/kis-client.ts` | 373 | `'Stock symbol (e.g., 005930)'` | `'Stock symbol (e.g., 005930, K0000A)'` |
| `src/tools/korea/kr-daily-financials.ts` | 113 | `'종목코드 (예: 005930)'` | `'종목코드 (예: 005930, K0000A)'` |
| `src/tools/korea/technical.ts` | 47 | `'Stock symbol (e.g., 005930)'` | `'Stock symbol (e.g., 005930, K0000A)'` |
| `src/mcp-server/index.ts` | 37 | `"Stock Ticker Symbol (e.g. 005930)"` | `"Stock Ticker Symbol (e.g. 005930, K0000A)"` |

**Priority**: Low -- These are Zod `.describe()` strings and JSON Schema descriptions. They have no runtime effect. Update at your discretion.

### 5.2 External API Compatibility Note

The KIS API `FID_INPUT_ISCD` parameter and Naver Finance `code=` query parameter both accept the symbol string as-is. The KIS API documentation confirms that the mixed code format is supported for ETF instruments. No adapter logic is needed.

### 5.3 Backtest Type Definition

`src/backtest/types.ts` line 34 defines `universe: string[]` with a comment "종목코드 리스트". The type itself (`string[]`) is fully compatible with mixed codes. No change needed.

---

## 6. Conclusion

The `etf-mixed-code` change has been **fully and correctly implemented**. The two regex validation points in `src/server.ts` (backtest/run at line 150 and parameter-sweep at line 199) have been updated from `/^\d{6}$/` to `/^[A-Z0-9]{6}$/i`. All other code paths either have no format validation (passing the symbol string through to external APIs) or use Zod `z.string()` schemas without restrictive patterns.

No legacy `\d{6}` patterns remain anywhere in the `src/` directory. Match rate is **100%**.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-02 | Initial gap analysis | gap-detector |
