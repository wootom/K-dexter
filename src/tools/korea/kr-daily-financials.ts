
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// 네이버 금융은 EUC-KR 인코딩을 사용하므로 디코딩 필요
function decodeEucKr(buffer: ArrayBuffer): string {
    const decoder = new TextDecoder('euc-kr');
    return decoder.decode(buffer);
}

// HTML 태그 제거 및 공백 정리
function cleanText(text: string): string {
    return text.replace(/<[^>]*>?/gm, '').trim();
}

/**
 * 네이버 금융에서 주요 재무제표 데이터를 크롤링합니다.
 * 정규식을 사용하여 HTML을 파싱하므로 구조 변경 시 취약할 수 있습니다.
 */
export async function fetchNaverFinancials(symbol: string) {
    try {
        const url = `https://finance.naver.com/item/main.naver?code=${symbol}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Naver Finance: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        const html = decodeEucKr(buffer);

        // 1. 기업실적분석 테이블 추출 (class="section cop_analysis")
        // NOTE: lazy regex [\s\S]*?</div> 는 첫 </div>에서 멈춰 전체 섹션을 못 읽음
        // → 섹션 시작 위치를 찾고 충분한 길이(40,000자)를 슬라이스하여 사용
        const sectionStart = html.indexOf('class="section cop_analysis"');
        if (sectionStart < 0) {
            return { error: "Financial analysis section not found" };
        }
        const sectionHtml = html.substring(sectionStart, sectionStart + 40000);

        // 2. 주요 지표 추출 함수
        const extractMetric = (metricName: string): number | null => {
            // 예: <th>ROE</th> ... <td>12.34</td>
            // 정규식으로 <th>지표명</th>을 찾고, 그 뒤에 오는 <td> 값들을 찾음
            // 테이블 구조상 최근 연간 실적 4개 + 분기 실적 6개 총 10개의 <td>가 옴
            // 공백과 태그를 유연하게 처리하기 위한 패턴
            // th 태그 안의 내용이 멀티라인일 수 있으므로 [\s\S]*? 사용
            const pattern = new RegExp(`<th[^>]*>[\\s\\S]*?${metricName}[\\s\\S]*?<\\/th>([\\s\\S]*?)<\\/tr>`, 'i');
            const rowMatch = sectionHtml.match(pattern);

            if (!rowMatch) return null;

            const rowContent = rowMatch[1];
            // <td> 태그 안의 값 추출
            const tdMatches = [...rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];

            // 데이터가 있는 셀 찾기 (뒤에서부터 탐색하여 가장 최근 연간/분기 실적 찾기)
            // 보통 연간/분기 구분 없이 최근 확정치가 중요함
            // 네이버 금융 테이블 순서: [연간1] [연간2] [연간3] [연간4(E)] | [분기1] [분기2] ...
            // 최근 확정 실적을 가져오기 위해 값이 있는 유효한 숫자 중 가장 오른쪽(최신)을 선택하거나,
            // 연간 실적의 마지막(추정치 포함)을 가져올 수도 있음.

            // 여기서는 유효한 숫자 중 최근(분기 포함) 값을 가져오되, 
            // 펀더멘털 스코어링을 위해선 '최근 4분기 합(TTM)' 또는 '전년도 확정'이 좋음.
            // 네이버는 TTM을 명시적으로 주지 않음.
            // 따라서 0~3 인덱스(연간) 중 값이 있는 마지막 것을 선택 (최근 연간)

            const annualValues = tdMatches.slice(0, 4).map(m => cleanText(m[1]));

            // 역순으로 탐색하여 값이 있는(N/A가 아닌) 첫 번째 값 선택
            for (let i = annualValues.length - 1; i >= 0; i--) {
                const val = annualValues[i];
                if (val && val !== '' && !val.includes('N/A')) {
                    const num = parseFloat(val.replace(/,/g, ''));
                    if (!isNaN(num)) return num;
                }
            }

            return null;
        };

        return {
            symbol,
            // cop_analysis 섹션에서 추출 가능한 지표 (정적 HTML 기반)
            roe: extractMetric('ROE'),
            per: extractMetric('PER'),  // KIS와 교차검증용
            pbr: extractMetric('PBR'),
            dividendYield: extractMetric('배당수익률') ?? extractMetric('시가배당률'),
            // 아래 지표는 Naver가 JS로 동적 로딩하여 정적 크롤링 불가
            // debtRatio, operatingProfitMargin, netProfitMargin → null 고정
            source: 'Naver Finance (cop_analysis)',
            data_limitations: '부채비율·영업이익률·순이익률은 JS 동적 로딩으로 제공 불가'
        };

    } catch (error) {
        return { error: `Error scraping Naver Finance: ${error}` };
    }
}

export const getNaverFinancials = tool(
    async ({ symbol }) => {
        return JSON.stringify(await fetchNaverFinancials(symbol), null, 2);
    },
    {
        name: 'get_naver_financials',
        description: '네이버 금융에서 KIS API에 없는 심화 재무지표(ROE, 부채비율, 유보율 등)를 크롤링합니다.',
        schema: z.object({
            symbol: z.string().describe('종목코드 (예: 005930)'),
        }),
    }
);
