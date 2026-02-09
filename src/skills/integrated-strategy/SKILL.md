---
name: integrated_strategy
description: Formulates a complete investment strategy for a Korean stock by combining technical, fundamental (disclosure), and supply/demand analysis.
---

# Integrated Strategy Skill (Korea)

## Workflow Checklist

Copy and track progress:
```
Integrated Strategy Progress:
- [ ] Step 1: Identify Target (Symbol & CorpCode)
- [ ] Step 2: Technical Analysis (MA, RSI, MACD)
- [ ] Step 3: Fundamental Analysis (Disclosures)
- [ ] Step 4: Supply/Demand Check (Investor Trend)
- [ ] Step 5: Synthesize Final Report
```

## Step 1: Identify Target

Ensure you have:
1.  **Stock Symbol** (6-digit, e.g., '005930')
2.  **DART CorpCode** (8-digit).
    - If you don't have the CorpCode, use `web_search` to find it: `"DART corporate code for [Company Name]"`.
    - Or ask the user if unable to find.

## Step 2: Technical Analysis

Execute the `technical_analysis` skill (or call `analyze_kr_technical` directly).
- **Goal:** Determine if the timing is right (Buy/Sell/Wait).
- **Key:** Look for Golden Arrangement and healthy RSI.

## Step 3: Fundamental Analysis

Execute the `disclosure_analysis` skill (or manually call `search_kr_disclosures`).
- **Goal:** Verify if there are any deal-breakers or catalysts.
- **Key:** Watch out for Rights Issues (Bad) or Big Contracts (Good).

## Step 4: Supply/Demand Check

Call `get_kr_investor_trend`.
- **Goal:** Confirm if "Smart Money" is with us.

## Step 5: Synthesize Final Report

Combine all scores:
- **Technical (40%):** Based on MA, RSI, MACD.
- **Fundamental (40%):** Based on Disclosures & Financials.
- **Supply/Demand (20%):** Based on Foreigner/Inst flow.

**Generate Investment Thesis:**
1.  **Recommendation:** Strong Buy / Buy / Hold / Sell / Strong Sell.
2.  **Target Price:** (Estimate based on recent highs or consensus if available).
3.  **Stop Loss:** (e.g., 3-5% below support or 20MA).
4.  **Rationale:** Why this trade?
5.  **Risks:** What could go wrong?
