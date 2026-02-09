
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const DART_BASE_URL = 'https://opendart.fss.or.kr/api';

// 최근 공시 검색
export const searchDisclosures = tool(
    async ({ corpCode, startDate, endDate, disclosureType }) => {
        try {
            const params = new URLSearchParams();
            params.append('crtfc_key', process.env.DART_API_KEY!);
            if (corpCode) params.append('corp_code', corpCode);
            if (startDate) params.append('bgn_de', startDate);
            if (endDate) params.append('end_de', endDate);
            if (disclosureType) params.append('pblntf_ty', disclosureType);

            const response = await fetch(`${DART_BASE_URL}/list.json?${params.toString()}`);

            if (!response.ok) {
                throw new Error(`DART API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (data.status !== '000') {
                return `DART API returned status ${data.status}: ${data.message}`;
            }

            return data;
        } catch (error) {
            return `Error searching disclosures: ${error}`;
        }
    },
    {
        name: 'search_kr_disclosures',
        description: 'DART에서 공시정보를 검색합니다. 기업코드, 기간, 공시유형으로 필터링 가능합니다.',
        schema: z.object({
            corpCode: z.string().optional().describe('DART 기업고유번호 (8자리)'),
            startDate: z.string().optional().describe('검색 시작일 (YYYYMMDD)'),
            endDate: z.string().optional().describe('검색 종료일 (YYYYMMDD)'),
            disclosureType: z.string().optional().describe('공시유형 (A: 정기, B: 주요사항, C: 발행, D: 지분, E: 기타)'),
        }),
    }
);

// 기업 개황 조회
export const getCompanyInfo = tool(
    async ({ corpCode }) => {
        try {
            const params = new URLSearchParams();
            params.append('crtfc_key', process.env.DART_API_KEY!);
            params.append('corp_code', corpCode);

            const response = await fetch(`${DART_BASE_URL}/company.json?${params.toString()}`);

            if (!response.ok) {
                throw new Error(`DART API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            if (data.status !== '000') {
                return `DART API returned status ${data.status}: ${data.message}`;
            }
            return data;
        } catch (error) {
            return `Error fetching company info: ${error}`;
        }
    },
    {
        name: 'get_kr_company_info',
        description: 'DART에 등록된 기업의 개황정보를 조회합니다.',
        schema: z.object({
            corpCode: z.string().describe('DART 기업고유번호 (8자리)'),
        }),
    }
);

// 재무제표 조회
export const getFinancialStatements = tool(
    async ({ corpCode, year, reportCode }) => {
        try {
            const params = new URLSearchParams();
            params.append('crtfc_key', process.env.DART_API_KEY!);
            params.append('corp_code', corpCode);
            params.append('bsns_year', year);
            params.append('reprt_code', reportCode);

            const response = await fetch(`${DART_BASE_URL}/fnlttSinglAcntAll.json?${params.toString()}`);

            if (!response.ok) {
                throw new Error(`DART API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            if (data.status !== '000') {
                return `DART API returned status ${data.status}: ${data.message}`;
            }
            return data;
        } catch (error) {
            return `Error fetching financial statements: ${error}`;
        }
    },
    {
        name: 'get_kr_financial_statements',
        description: 'DART에서 기업의 재무제표를 조회합니다.',
        schema: z.object({
            corpCode: z.string().describe('DART 기업고유번호'),
            year: z.string().describe('사업연도 (YYYY)'),
            reportCode: z.enum(['11013', '11012', '11014', '11011'])
                .describe('보고서 코드 (11013: 1분기, 11012: 반기, 11014: 3분기, 11011: 사업)'),
        }),
    }
);
