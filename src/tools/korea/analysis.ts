
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { SMA, RSI } from 'technicalindicators';
import { fetchCurrentPrice, fetchDailyOHLCV } from './kis-client.js';
import { fetchNaverFinancials } from './kr-daily-financials.js';
import { analyze } from '../../analysis/scorer.js';
import { calculateATR, generateTradeSignal, type OhlcvBar } from '../../analysis/signal-generator.js';
import { AnalysisRequest } from '../../analysis/types.js';

export const analyzeKrStock = tool(
    async ({ symbol }) => {
        try {
            // 한국 종목코드 형식 검증 (6자리 숫자)
            if (!/^\d{6}$/.test(symbol)) {
                return JSON.stringify({
                    error: `Invalid Korean stock symbol: "${symbol}". Must be a 6-digit number (e.g., "005930" for Samsung).`,
                    hint: 'US stocks and other non-Korean symbols are not supported by this endpoint.'
                });
            }

            // VTS(모의투자) 환경 경고
            const isVtsMode = process.env.KIS_IS_PAPER_TRADING === 'true';

            // 1. Fetch Data in Parallel
            const [priceData, ohlcvData, fundamentalData] = await Promise.all([
                fetchCurrentPrice(symbol),
                fetchDailyOHLCV(symbol, 200), // Need at least 120 trading days
                fetchNaverFinancials(symbol)
            ]);

            // 2. Process OHLCV Data (Oldest -> Newest)
            const rawRecords = [...ohlcvData.output2].reverse();
            const closes = rawRecords.map((d: any) => parseFloat(d.close));
            const volumes = rawRecords.map((d: any) => parseFloat(d.volume));

            if (closes.length < 120) {
                return `Not enough data for analysis (requires 120+ days). Available: ${closes.length}`;
            }

            // Build OHLCV bars for ATR/signal/volume-profile calculation
            const bars = rawRecords.map((d: any) => ({
                high: parseFloat(d.high || d.close),
                low: parseFloat(d.low || d.close),
                close: parseFloat(d.close),
                volume: parseFloat(d.volume || '0'), // 매물대 계산에 필수
            }));

            // 3. Calculate Technical Indicators
            const ma20 = SMA.calculate({ period: 20, values: closes });
            const ma60 = SMA.calculate({ period: 60, values: closes });
            const ma120 = SMA.calculate({ period: 120, values: closes });
            const rsi = RSI.calculate({ period: 14, values: closes });

            // Volume Averages
            const recentVolumes = volumes.slice(-20);
            const avgVol5 = recentVolumes.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5;
            const avgVol20 = recentVolumes.reduce((a: number, b: number) => a + b, 0) / 20;

            const lastMa20 = ma20[ma20.length - 1];
            const lastMa60 = ma60[ma60.length - 1];
            const lastMa120 = ma120[ma120.length - 1];
            const lastRsi = rsi[rsi.length - 1];
            const currentPrice = parseFloat(priceData.price);

            // 4. Prepare Fundamental Data
            const combinedFundamentals = {
                per: (fundamentalData as any).per || parseFloat(priceData.per),
                pbr: (fundamentalData as any).pbr || parseFloat(priceData.pbr),
                eps: parseFloat(priceData.eps) || undefined,          // EPS (원)
                bps: parseFloat(priceData.bps) || undefined,          // BPS (원)
                marketCap: parseInt(priceData.marketCap) || undefined, // 시가총액 (억원)
                roe: (fundamentalData as any).roe,
                debt_ratio: (fundamentalData as any).debtRatio,
                op_margin: (fundamentalData as any).operatingProfitMargin
            };

            // 5. Run Scorer Analysis
            const request: AnalysisRequest = {
                symbol,
                market: 'KR',
                timestamp: new Date().toISOString(),
                price: currentPrice,
                moving_averages: {
                    ma20: lastMa20,
                    ma60: lastMa60,
                    ma120: lastMa120,
                },
                volume: {
                    avg_5d: avgVol5,
                    avg_20d: avgVol20,
                },
                momentum: {
                    rsi_14: lastRsi,
                },
                index_context: {
                    main_index: 'KOSPI',
                    index_trend: 'flat', // TODO: Automate KOSPI trend fetching
                },
                fundamentals: combinedFundamentals,
            };

            const scorerResult = analyze(request);

            // 6. Generate Trade Signal (Entry/Target/Stop-Loss levels)
            const technicalSignal: 'BUY' | 'SELL' | 'NEUTRAL' =
                scorerResult.scores.total >= 6 ? 'BUY'
                    : scorerResult.scores.total <= -2 ? 'SELL'
                        : 'NEUTRAL';

            // Use BollingerBands-like approximation from MA/ATR for bbUpper/Lower
            const atr = calculateATR(bars, 14);
            const bbUpper = lastMa20 + 2 * atr;
            const bbLower = lastMa20 - 2 * atr;

            const tradeSignal = generateTradeSignal(
                symbol,
                currentPrice,
                bars,
                {
                    ma20: lastMa20,
                    ma60: lastMa60,
                    rsi: lastRsi,
                    bbUpper,
                    bbMiddle: lastMa20,
                    bbLower,
                    macdHistogram: null,
                },
                Math.max(0, Math.min(100, 50 + scorerResult.scores.total * 6)),
                technicalSignal
            );

            // 7. Return Unified Result
            return JSON.stringify({
                symbol,
                // VTS 모드 경고 (KIS_IS_PAPER_TRADING=true 시 가격/시총 부정확)
                data_quality: isVtsMode ? {
                    warning: 'VTS_PAPER_TRADING',
                    message: 'KIS_IS_PAPER_TRADING=true. 현재가·시총은 모의투자 가상 가격 기반이며 실제 시장가와 다를 수 있습니다.',
                    action: '.env에서 KIS_IS_PAPER_TRADING=false 로 변경 시 실시간 데이터 사용 가능'
                } : undefined,
                fundamentals: {
                    per: combinedFundamentals.per,
                    pbr: combinedFundamentals.pbr,
                    eps: combinedFundamentals.eps,
                    bps: combinedFundamentals.bps,
                    marketCap: combinedFundamentals.marketCap,
                    roe: combinedFundamentals.roe,
                    debt_ratio: combinedFundamentals.debt_ratio,
                    op_margin: combinedFundamentals.op_margin,
                },
                technicals: {
                    ma20: lastMa20,
                    ma60: lastMa60,
                    ma120: lastMa120,
                    rsi: lastRsi,
                    atr,
                },
                scorer: scorerResult,
                trade_signal: {
                    signal: tradeSignal.signal,
                    swing_grade: tradeSignal.swingGrade,          // 2주 스윙 적합도
                    levels: tradeSignal.levels,
                    volume_profile: tradeSignal.volumeProfile,    // 매물대 분석
                    rationale: tradeSignal.rationale,
                },
            }, null, 2);

        } catch (error) {
            return `Error analyzing stock ${symbol}: ${error}`;
        }
    },
    {
        name: 'analyze_kr_stock',
        description: '한국 주식의 종합 분석(기술적 + 재무적)을 수행합니다. 매매 전략, 상세 스코어, 진입가/손절가/목표가를 제공합니다.',
        schema: z.object({
            symbol: z.string().describe('Stock symbol (e.g., 005930)'),
        }),
    }
);
