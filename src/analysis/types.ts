
import { z } from 'zod';

export const AnalysisRequestSchema = z.object({
    symbol: z.string(),
    market: z.string(), // "US", "KR", etc.
    timestamp: z.string().datetime({ offset: true }), // ISO 8601 with offset allowed
    price: z.number(),
    moving_averages: z.object({
        ma20: z.number(),
        ma60: z.number(),
        ma120: z.number(),
    }),
    volume: z.object({
        avg_5d: z.number(),
        avg_20d: z.number(),
    }),
    momentum: z.object({
        rsi_14: z.number(),
    }),
    index_context: z.object({
        main_index: z.string(),
        index_trend: z.enum(['up', 'flat', 'down']),
    }),
    fundamentals: z.object({
        per: z.number().optional(),
        pbr: z.number().optional(),
        roe: z.number().optional(),
        debt_ratio: z.number().optional(),
        op_margin: z.number().optional(), // 영업이익률
    }).optional(),
});

export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;

export enum ConfidenceLevel {
    HIGH = 'HIGH',
    MEDIUM = 'MEDIUM',
    LOW = 'LOW',
}

export const AnalysisResponseSchema = z.object({
    symbol: z.string(),
    scores: z.object({
        trend: z.number(),
        momentum: z.number(),
        flow: z.number(),
        risk: z.number(),
        fundamental: z.number(),
        total: z.number(),
    }),
    state: z.string(),
    strategy: z.object({
        short_term: z.string(),
        mid_term: z.string(),
    }),
    confidence_level: z.nativeEnum(ConfidenceLevel),
});

export interface AnalysisResponse {
    symbol: string;
    scores: {
        trend: number;
        momentum: number;
        flow: number;
        risk: number;
        fundamental: number;
        total: number;
    };
    state: string;
    strategy: {
        short_term: string;
        mid_term: string;
    };
    confidence_level: ConfidenceLevel;
}
