
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logDebug } from '../../utils/logger.js';

const KIS_BASE_URL = process.env.KIS_IS_PAPER_TRADING === 'true'
  ? 'https://openapivts.koreainvestment.com:29443'
  : 'https://openapi.koreainvestment.com:9443';

async function fetchWithTimeout(url: string, options: RequestInit, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => {
    logDebug(`[Fetch] Timeout triggered for ${url}`);
    controller.abort();
  }, timeout);

  try {
    logDebug(`[Fetch] Starting request to ${url} (timeout: ${timeout}ms)`);
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    logDebug(`[Fetch] Request completed for ${url} (status: ${response.status})`);
    return response;
  } catch (error) {
    clearTimeout(id);
    logDebug(`[Fetch] Request failed for ${url}: ${error}`);
    throw error;
  }
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  logDebug('Fetching new KIS access token...');
  try {
    const response = await fetchWithTimeout(`${KIS_BASE_URL}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: process.env.KIS_APP_KEY,
        appsecret: process.env.KIS_APP_SECRET,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get token: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    logDebug('Token fetched successfully.');
    return cachedToken.accessToken;
  } catch (error) {
    logDebug(`Token Error: ${error}`);
    throw new Error(`Token Error: ${error}`);
  }
}

// --- Helper for KST Date ---
function getKSTDateString(offsetDays: number = 0): string {
  const now = new Date();
  const targetDate = new Date(now.getTime() + (offsetDays * 24 * 60 * 60 * 1000));
  const kstMs = targetDate.getTime() + (targetDate.getTimezoneOffset() * 60000) + (9 * 60 * 60 * 1000);
  const kstDate = new Date(kstMs);
  return kstDate.toISOString().slice(0, 10).replace(/-/g, '');
}

// --- Core API Functions (Exported for internal use) ---

export async function fetchCurrentPrice(symbol: string) {
  logDebug(`[KIS] Fetching current price for ${symbol}...`);
  try {
    const token = await getAccessToken();
    const response = await fetchWithTimeout(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${symbol}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          appkey: process.env.KIS_APP_KEY!,
          appsecret: process.env.KIS_APP_SECRET!,
          tr_id: 'FHKST01010100',
        },
      }
    );

    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();
    if (data.rt_cd !== '0') throw new Error(`KIS API Error: ${data.msg1 || JSON.stringify(data)}`);

    logDebug(`[KIS] Current price fetched.`);
    return data.output;
  } catch (error) {
    logDebug(`[KIS] Error fetchCurrentPrice: ${error}`);
    throw error;
  }
}

export async function fetchDailyOHLCV(symbol: string, period: number = 60) {
  logDebug(`[KIS] Fetching Daily OHLCV for ${symbol} (period: ${period})...`);
  try {
    const token = await getAccessToken();
    const endDate = getKSTDateString(0);
    const startDate = getKSTDateString(-(period + 20));

    const response = await fetchWithTimeout(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${symbol}&FID_INPUT_DATE_1=${startDate}&FID_INPUT_DATE_2=${endDate}&FID_PERIOD_DIV_CODE=D&FID_ORG_ADJ_PRC=0`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          appkey: process.env.KIS_APP_KEY!,
          appsecret: process.env.KIS_APP_SECRET!,
          tr_id: 'FHKST03010100',
        },
      }
    );

    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();
    if (data.rt_cd !== '0') throw new Error(`KIS API Error: ${data.msg1 || JSON.stringify(data)}`);

    let records = data.output2 || [];

    // Trim fields
    records = records.map((r: any) => ({
      date: r.stck_bsop_date,
      close: r.stck_clpr,
      open: r.stck_oprc,
      high: r.stck_hgpr,
      low: r.stck_lwpr,
      volume: r.acml_vol,
    }));

    if (period > 0 && records.length > period) {
      records = records.slice(0, period);
    }

    logDebug(`[KIS] Daily OHLCV fetched. ${records.length} records.`);
    return { output2: records };
  } catch (error) {
    logDebug(`[KIS] Error fetchDailyOHLCV: ${error}`);
    throw error;
  }
}

export async function fetchInvestorTrend(symbol: string) {
  logDebug(`[KIS] Fetching Investor Trend for ${symbol}...`);
  try {
    const token = await getAccessToken();
    const response = await fetchWithTimeout(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-investor?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${symbol}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          appkey: process.env.KIS_APP_KEY!,
          appsecret: process.env.KIS_APP_SECRET!,
          tr_id: 'FHKST01010900',
        },
      }
    );

    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();
    if (data.rt_cd !== '0') throw new Error(`KIS API Error: ${data.msg1 || JSON.stringify(data)}`);

    // logDebug(`[KIS] Investor Trend fetched.`);

    let records = data.output || [];
    if (Array.isArray(records)) {
      records = records.slice(0, 5).map((r: any) => ({
        date: r.stck_bsop_date,
        personal: r.prsn_ntby_qty,
        foreigner: r.frgn_ntby_qty,
        institution: r.orgn_ntby_qty,
        price: r.stck_prpr,
      }));
    }

    return records;
  } catch (error) {
    logDebug(`[KIS] Error fetchInvestorTrend: ${error}`);
    throw error;
  }
}

// --- US Market Helper Functions (Exported) ---

export async function fetchUsCurrentPrice(symbol: string, exchange: string = 'NAS') {
  logDebug(`[KIS] Fetching US current price for ${symbol} (${exchange})...`);
  try {
    const token = await getAccessToken();
    const response = await fetchWithTimeout(
      `${KIS_BASE_URL}/uapi/overseas-price/v1/quotations/price?AUTH=&EXCD=${exchange}&SYMB=${symbol}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          appkey: process.env.KIS_APP_KEY!,
          appsecret: process.env.KIS_APP_SECRET!,
          tr_id: 'HHDFS00000300',
        },
      }
    );

    if (!response.ok) {
      // Log more details from 404/500
      const errorText = await response.text();
      throw new Error(`KIS API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    if (data.rt_cd !== '0') {
      throw new Error(`KIS API Error: ${data.msg1}`);
    }

    return {
      symbol,
      exchange,
      price: data.output.last,
      diff: data.output.diff,
      rate: data.output.rate,
    };
  } catch (error) {
    logDebug(`[KIS] Error fetchUsCurrentPrice: ${error}`);
    throw error;
  }
}

export async function fetchUsDailyOHLCV(symbol: string, exchange: string = 'NAS', period: number = 120) {
  logDebug(`[KIS] Fetching US Daily OHLCV for ${symbol} (${exchange})...`);
  try {
    const token = await getAccessToken();
    const endDate = getKSTDateString(0);

    const response = await fetchWithTimeout(
      `${KIS_BASE_URL}/uapi/overseas-price/v1/quotations/dailyprice?AUTH=&EXCD=${exchange}&SYMB=${symbol}&GUBN=0&BYMD=${endDate}&MODP=1`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          appkey: process.env.KIS_APP_KEY!,
          appsecret: process.env.KIS_APP_SECRET!,
          tr_id: 'HHDFS76240000',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`KIS API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    if (data.rt_cd !== '0') {
      throw new Error(`KIS API Error: ${data.msg1}`);
    }

    const dailyData = data.output2.slice(0, period).reverse().map((item: any) => ({
      date: item.xymd,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.clos),
      volume: parseInt(item.tvol, 10),
    }));

    return {
      output2: dailyData,
    };
  } catch (error) {
    logDebug(`[KIS] Error fetchUsDailyOHLCV: ${error}`);
    throw error;
  }
}

// --- Tool Definitions ---

export const getCurrentPrice = tool(
  async ({ symbol }) => {
    try {
      return JSON.stringify(await fetchCurrentPrice(symbol), null, 2);
    } catch (error) {
      return `Error fetching price: ${error}`;
    }
  },
  {
    name: 'get_kr_current_price',
    description: 'Get real-time price info (price, change, volume, etc) for a Korean stock.',
    schema: z.object({
      symbol: z.string().describe('Stock symbol (e.g., 005930)'),
    }),
  }
);

export const getDailyOHLCV = tool(
  async ({ symbol, period = 60 }) => {
    try {
      const data = await fetchDailyOHLCV(symbol, period);
      return JSON.stringify(data, null, 2);
    } catch (error) {
      return `Error fetching OHLCV: ${error}`;
    }
  },
  {
    name: 'get_kr_daily_ohlcv',
    description: 'Get daily OHLCV candles. Use ONLY for raw data inspection.',
    schema: z.object({
      symbol: z.string().describe('Stock symbol'),
      period: z.number().default(60).describe('Days to fetch'),
    }),
  }
);

export const getInvestorTrend = tool(
  async ({ symbol }) => {
    try {
      return JSON.stringify(await fetchInvestorTrend(symbol), null, 2);
    } catch (error) {
      return `Error fetching investor trend: ${error}`;
    }
  },
  {
    name: 'get_kr_investor_trend',
    description: 'Get investor trading trend (Foreigner, Institution, etc).',
    schema: z.object({
      symbol: z.string().describe('Stock symbol'),
    }),
  }
);

// ============================================================================
// US Market Tools
// ============================================================================

export const getUsCurrentPrice = tool(
  async ({ symbol, exchange = 'NAS' }) => {
    try {
      return JSON.stringify(await fetchUsCurrentPrice(symbol, exchange), null, 2);
    } catch (error) {
      return `Error fetching US price: ${error}`;
    }
  },
  {
    name: 'get_us_current_price',
    description: '미국 주식의 현재가 정보를 조회합니다. 티커(예: AAPL)와 거래소(NAS/NYS/AMS)를 입력하세요.',
    schema: z.object({
      symbol: z.string().describe('티커 심볼 (예: AAPL, TSLA, NVDA)'),
      exchange: z.enum(['NAS', 'NYS', 'AMS']).default('NAS').describe('거래소 (NAS:나스닥, NYS:뉴욕, AMS:아멕스)'),
    }),
  }
);

export const getUsDailyOHLCV = tool(
  async ({ symbol, exchange = 'NAS', period = 120 }) => {
    try {
      const data = await fetchUsDailyOHLCV(symbol, exchange, period);
      return JSON.stringify({
        symbol,
        exchange,
        count: data.output2.length,
        output2: data.output2,
        closes: data.output2.map((d: any) => d.close),
        dates: data.output2.map((d: any) => d.date),
      }, null, 2);
    } catch (error) {
      return `Error fetching US OHLCV: ${error}`;
    }
  },
  {
    name: 'get_us_daily_ohlcv',
    description: '미국 주식의 일봉(OHLCV) 데이터를 조회합니다. 기술적 분석에 사용됩니다.',
    schema: z.object({
      symbol: z.string().describe('티커 심볼 (예: AAPL)'),
      exchange: z.enum(['NAS', 'NYS', 'AMS']).default('NAS').describe('거래소'),
      period: z.number().default(120).describe('조회 기간 (일수)'),
    }),
  }
);
