---
name: technical_analysis
description: Performs technical analysis on Korean (KR) and US stocks using KIS API data. Checks Moving Average alignment, RSI, MACD, and Bollinger Bands to determine trend and potential entry/exit points.
---

# Technical Analysis Skill (Korea & US)

## Workflow Checklist

Copy and track progress:
```
Technical Analysis Progress:
- [ ] Step 1: Identify Market (KR vs US)
- [ ] Step 2: Analyze Technical Indicators & Price Action
- [ ] Step 3: Check Investor Trends (KR Only)
- [ ] Step 4: Synthesize Technical View
```

## Step 1: Identify Market

- **Korean Stock:** Symbol is 6-digit number (e.g., '005930'). Use KR tools.
- **US Stock:** Symbol is 1-5 letters (e.g., 'AAPL'). Use US tools.

## Step 2: Analyze Technical Indicators & Price Action

**For Korean Stocks:**
Call `analyze_kr_technical`.
- **Input:** `symbol` (e.g., '005930')
- **Period:** Default to 120 days.

**For US Stocks:**
Call `analyze_us_technical`.
- **Input:** `symbol` (e.g., 'AAPL'), `exchange` (default 'NAS').
- **Period:** Default to 120 days.

**Key Indicators Checked (Both Markets):**
- **Moving Averages:** Golden Arrangement (5 > 20 > 60 > 120).
- **RSI:** Overbought (>70) or Oversold (<30).
- **MACD:** Bullish/Bearish crossover and histogram trend.
- **Bollinger Bands:** Price position relative to upper/lower bands.

## Step 3: Check Investor Trends (KR Only)

**Skip this step for US Stocks.**

Call `get_kr_investor_trend` to see who is buying (Foreigners vs Institutions).
- **Input:** `symbol`

**Interpretation:**
- **Foreigner Buying:** Generally positive signal ("Smart Money").
- **Institution Buying:** Positive signal.
- **Both Selling:** Negative signal.

## Step 4: Synthesize Technical View

Combine findings into a recommendation.

**Scoring Reference:**
- **Strong Buy:** Golden Arrangement + RSI Neutral/Oversold + Foreigner Buying (KR)
- **Buy:** Trend Up + Good Support
- **Hold:** Mixed signals or high volatility
- **Sell:** Reverse Arrangement (Dead Cross) + RSI Overbought

**Output Format:**
- **Technical Score:** X/40
- **Trend:** Bullish / Bearish / Neutral
- **Key Levels:** Support/Resistance
- **Investor Sentiment:** Foreigner/Inst flow summary (KR Only)
