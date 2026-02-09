
import { StructuredToolInterface } from '@langchain/core/tools';
import { createFinancialSearch, createFinancialMetrics, createReadFilings } from './finance/index.js';
import { exaSearch, tavilySearch } from './search/index.js';
import { skillTool, SKILL_TOOL_DESCRIPTION } from './skill.js';
import { browserTool } from './browser/index.js';
import { FINANCIAL_SEARCH_DESCRIPTION, FINANCIAL_METRICS_DESCRIPTION, WEB_SEARCH_DESCRIPTION, READ_FILINGS_DESCRIPTION, BROWSER_DESCRIPTION } from './descriptions/index.js';
import {
  KIS_PRICE_DESCRIPTION,
  KIS_OHLCV_DESCRIPTION,
  KIS_TREND_DESCRIPTION,
  DART_SEARCH_DESCRIPTION,
  DART_COMPANY_DESCRIPTION,
  DART_FINANCIALS_DESCRIPTION,
  TECHNICAL_ANALYSIS_DESCRIPTION
} from './descriptions/korea.js';
import { getCurrentPrice, getDailyOHLCV, getInvestorTrend } from './korea/kis-client.js';
import { searchDisclosures, getCompanyInfo, getFinancialStatements } from './korea/dart-client.js';
import { analyzeKrTechnical, analyzeUsTechnical } from './korea/technical.js';
import { getUsCurrentPrice, getUsDailyOHLCV } from './korea/kis-client.js';
import { discoverSkills } from '../skills/index.js';

/**
 * A registered tool with its rich description for system prompt injection.
 */
export interface RegisteredTool {
  /** Tool name (must match the tool's name property) */
  name: string;
  /** The actual tool instance */
  tool: StructuredToolInterface;
  /** Rich description for system prompt (includes when to use, when not to use, etc.) */
  description: string;
}

/**
 * Get all registered tools with their descriptions.
 * Conditionally includes tools based on environment configuration.
 *
 * @param model - The model name (needed for tools that require model-specific configuration)
 * @returns Array of registered tools
 */
export function getToolRegistry(model: string): RegisteredTool[] {
  const tools: RegisteredTool[] = [
    {
      name: 'financial_search',
      tool: createFinancialSearch(model),
      description: FINANCIAL_SEARCH_DESCRIPTION,
    },
    {
      name: 'financial_metrics',
      tool: createFinancialMetrics(model),
      description: FINANCIAL_METRICS_DESCRIPTION,
    },
    {
      name: 'read_filings',
      tool: createReadFilings(model),
      description: READ_FILINGS_DESCRIPTION,
    },
    {
      name: 'browser',
      tool: browserTool,
      description: BROWSER_DESCRIPTION,
    },
    // Korea Market Tools
    {
      name: 'get_kr_current_price',
      tool: getCurrentPrice,
      description: KIS_PRICE_DESCRIPTION,
    },
    {
      name: 'get_kr_daily_ohlcv',
      tool: getDailyOHLCV,
      description: KIS_OHLCV_DESCRIPTION,
    },
    {
      name: 'get_kr_investor_trend',
      tool: getInvestorTrend,
      description: KIS_TREND_DESCRIPTION,
    },
    {
      name: 'search_kr_disclosures',
      tool: searchDisclosures,
      description: DART_SEARCH_DESCRIPTION,
    },
    {
      name: 'get_kr_company_info',
      tool: getCompanyInfo,
      description: DART_COMPANY_DESCRIPTION,
    },
    {
      name: 'get_kr_financial_statements',
      tool: getFinancialStatements,
      description: DART_FINANCIALS_DESCRIPTION,
    },
    {
      name: 'analyze_kr_technical',
      tool: analyzeKrTechnical,
      description: TECHNICAL_ANALYSIS_DESCRIPTION,
    },
    // US Market Tools
    {
      name: 'get_us_current_price',
      tool: getUsCurrentPrice,
      description: '미국 주식의 현재가 정보를 조회합니다. 티커(예: AAPL)와 거래소(NAS/NYS/AMS)를 입력하세요.',
    },
    {
      name: 'get_us_daily_ohlcv',
      tool: getUsDailyOHLCV,
      description: '미국 주식의 일봉(OHLCV) 데이터를 조회합니다. 기술적 분석에 사용됩니다.',
    },
    {
      name: 'analyze_us_technical',
      tool: analyzeUsTechnical,
      description: '미국 주식의 기술적 지표(MA, RSI, MACD, BB)를 분석합니다. 티커(예: AAPL)를 입력하세요.',
    },
  ];

  // Include web_search if Exa or Tavily API key is configured (Exa preferred)
  if (process.env.EXASEARCH_API_KEY) {
    tools.push({
      name: 'web_search',
      tool: exaSearch,
      description: WEB_SEARCH_DESCRIPTION,
    });
  } else if (process.env.TAVILY_API_KEY) {
    tools.push({
      name: 'web_search',
      tool: tavilySearch,
      description: WEB_SEARCH_DESCRIPTION,
    });
  }

  // Include skill tool if any skills are available
  const availableSkills = discoverSkills();
  if (availableSkills.length > 0) {
    tools.push({
      name: 'skill',
      tool: skillTool,
      description: SKILL_TOOL_DESCRIPTION,
    });
  }

  return tools;
}

/**
 * Get just the tool instances for binding to the LLM.
 *
 * @param model - The model name
 * @returns Array of tool instances
 */
export function getTools(model: string): StructuredToolInterface[] {
  return getToolRegistry(model).map((t) => t.tool);
}

/**
 * Build the tool descriptions section for the system prompt.
 * Formats each tool's rich description with a header.
 *
 * @param model - The model name
 * @returns Formatted string with all tool descriptions
 */
export function buildToolDescriptions(model: string): string {
  return getToolRegistry(model)
    .map((t) => `### ${t.name}\n\n${t.description}`)
    .join('\n\n');
}
