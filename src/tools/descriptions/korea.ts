
export const KIS_PRICE_DESCRIPTION = `
Get real-time price, change, volume, etc. for a Korean stock.
Requires 'symbol' (6-digit code).
`;

export const KIS_OHLCV_DESCRIPTION = `
Get daily OHLCV candles. 
NOTE: Use this tool ONLY when the user explicitly asks to see raw data tables. For technical analysis, use 'analyze_kr_technical' directly.
`;

export const KIS_TREND_DESCRIPTION = `
Get trading trend by investor type (Foreigner, Institutional, Individual).
Requires 'symbol'.
`;

export const TECHNICAL_ANALYSIS_DESCRIPTION = `
Perform comprehensive technical analysis (MA, RSI, MACD, Bollinger Bands) and generate buy/sell signals. 
This tool internally fetches data, so you just need to provide the symbol.
`;

export const DART_SEARCH_DESCRIPTION = `
Search for official filings (DART) by date, type, etc.
Requires 'corp_code' (8-digit) or other filters.
`;

export const DART_COMPANY_DESCRIPTION = `
Get basic company profile and details.
Requires 'corp_code'.
`;

export const DART_FINANCIALS_DESCRIPTION = `
Get detailed financial statements (BS, IS, CF).
Requires 'corp_code', 'year', 'reprt_code'.
`;
