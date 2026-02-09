---
name: disclosure_analysis
description: Analyzes DART disclosures to assess fundamental impact on a Korean company. Specifically looks for capital increases, contracts, and ownership changes.
---

# Disclosure Analysis Skill (Korea)

## Workflow Checklist

Copy and track progress:
```
Disclosure Analysis Progress:
- [ ] Step 1: Search Recent Disclosures
- [ ] Step 2: Analyze Company Profile
- [ ] Step 3: Assess Impact (Bullish/Bearish/Neutral)
- [ ] Step 4: Summarize Fundamental View
```

## Step 1: Search Recent Disclosures

Call `search_kr_disclosures` for the past 3-6 months.
- **Input:** `corpCode` (Need to find this first via `get_kr_company_info` or similar lookup if only symbol is known. Wait, `search_kr_disclosures` might need corpCode. Check tool capability.)
- **Note:** If you only have a stock symbol, you might need to find the `corpCode` first. For now, assume you can search by corpCode.
- **Goal:** Identify major events:
  - **Capital Increase (Rights Issue):** Generally Bearish (dilution).
  - **Supply Contract:** Bullish (revenue growth).
  - **Convertible Bond (CB) Issue:** Neutral to Bearish (potential overhang).
  - **Ownership Change:** Variable impact.

## Step 2: Analyze Company Profile

Call `get_kr_company_info` to understand the business model.
- **Input:** `corpCode`
- **Goal:** Check sector, CEO, and basic status.

## Step 3: Assess Impact

For each major disclosure found in Step 1, evaluate:
1.  **Type:** What is it?
2.  **Magnitude:** How big is the deal/issue relative to market cap or revenue?
3.  **Timing:** When does it take effect?
4.  **Sentiment:** Is the market likely to view this favorably?

## Step 4: Summarize Fundamental View

Synthesize findings into a fundamental score or view.
- **Score:** 1-10 (1=Strong Sell impact, 10=Strong Buy impact)
- **Key Driver:** The single most important recent event.
- **Risk:** What could go wrong?
