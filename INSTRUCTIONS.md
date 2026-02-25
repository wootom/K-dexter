# K-Dexter System Instructions & PRD

## 1. Project Overview
**K-Dexter** is an AI-powered financial analysis agent designed to perform deep fundamental and technical analysis on Korean (KR) and US stocks. It operates as an MCP (Model Context Protocol) server, making its capabilities available to other agentic systems like OpenClaw.

## 2. Core Capabilities
### 2.1 Market Analysis
- **Scope**: Korean Stock Market (primary), US Stock Market (secondary).
- **Data Sources**:
  - **KIS (Korea Investment Securities) API**: Real-time price, order book, and daily OHLCV history.
  - **Naver Finance Crawling**: Supplemental fundamental data (ROE, Debt Ratio, Operating Margin, etc.) not easily available via KIS.
  - **Technical Indicators**: SMA (20, 60, 120), RSI (14), MACD, Bollinger Bands via `technicalindicators` library.

### 2.2 Scoring Logic (`scorer.ts`)
The system evaluates stocks based on a 5-factor scoring model:
1.  **Trend Score (0~3)**: Based on Price position relative to MA20, MA60, MA120.
2.  **Momentum Score (-1~2)**: RSA and Volume analysis.
3.  **Flow Score (-1~1)**: Market index trend context (currently mocked/manual input).
4.  **Risk Score (-1~1)**: Volatility and Sector risk.
5.  **Fundamental Score (-2~3)**: Valuation (PER, PBR) and Profitability (ROE, OP Margin).

**Output**:
- **Total Score**: Sum of all factors.
- **Judgment**: AGRESSIVE_BUY, BUY_DIPS, HOLD, AVOID.
- **Strategy**: Specific short-term and mid-term actionable advice.

## 3. Architecture
### 3.1 Components
- **`src/agent`**: Core agent logic using LangChain.
- **`src/tools`**: Collection of tools exposed to the agent.
- **`src/mcp-server`**: MCP Server implementation using Stdio transport for local integration.
- **`src/server.ts`**: HTTP Gateway (Hono) for REST API access.

### 3.2 Key Tools
1.  **`analyze_kr_stock`** (New!):
    -   Orchestrates the entire analysis workflow.
    -   Fetches Price + Technicals (KIS) and Fundamentals (Naver) in parallel.
    -   Persists KIS Access Token to `.dexter/token-cache.json` to handle rate limits.
    -   Handles fetch pagination to ensure sufficient history (200+ days) for accurate MA120 calculation.
2.  **`get_kr_current_price`**: Simple price fetcher.
3.  **`search_kr_disclosures`**: DART integration (Planned/Partially Implemented).

## 4. Operational Guide
### 4.1 Running the Server
- **MCP Mode (Stdio)**: used by OpenClaw or Claude Desktop.
    ```bash
    bun run src/mcp-server/index.ts
    ```
- **HTTP Gateway (REST)**:
    ```bash
    bun run start:api
    # Endpoint: POST /k-dexter/analyze
    ```

### 4.2 Configuration
- Environment variables in `.env`:
    - `KIS_APP_KEY`, `KIS_APP_SECRET`: API Credentials.
    - `KIS_IS_PAPER_TRADING`: `true` for simulation, `false` for real trading.

## 5. Roadmap & Missing Features
- [ ] **DART Integration**: Fully implement disclosure analysis to detect risks/opportunities in filings.
- [ ] **News Analysis**: Integrate search tools to factor in recent news sentiment.
- [ ] **Portfolio Management**: Ability to track and rebalance a portfolio based on scores.
- [ ] **Index Context**: Automate the fetching of KOSPI/KOSDAQ trends for the "Flow Score".

## 6. Developer Notes
- **Rate Limiting**: KIS API has strict rate limits (e.g., 1 token request/minute, specific transaction limits). usage of `fetchWithTimeout` and caching is critical.
- **Testing**: Use `test-analysis.ts` to verify the core analysis logic without spinning up the full agent.
