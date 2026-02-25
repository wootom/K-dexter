/**
 * volume-profile.ts
 *
 * 일봉 OHLCV 데이터를 기반으로 매물대(Volume Profile)를 계산합니다.
 * 2주 스윙 트레이딩에 최적화된 설정: 일봉 60일 기준
 *
 * 알고리즘: 각 일봉의 (High-Low) 구간에 해당 거래량을 균등 분배 (TPO 근사)
 */

export interface OhlcvBarWithVolume {
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface VolumeBin {
    priceMin: number;
    priceMax: number;
    priceMid: number;   // 구간 중간가
    volume: number;
    volumePercent: number; // 전체 거래량 대비 비중 (%)
}

export interface VolumeProfile {
    /** Point of Control: 거래량이 가장 많은 핵심 가격 */
    poc: number;
    /** Value Area High: 전체 거래량의 70%가 몰린 구간 상단 */
    valueAreaHigh: number;
    /** Value Area Low: 전체 거래량의 70%가 몰린 구간 하단 */
    valueAreaLow: number;
    /** 현재가 위 저항 매물대 Top 3 */
    resistanceZones: VolumeBin[];
    /** 현재가 아래 지지 매물대 Top 3 */
    supportZones: VolumeBin[];
    /** 가장 가까운 저항 (상단 1번째) */
    nearestResistance: number | null;
    /** 가장 가까운 지지 (하단 1번째) */
    nearestSupport: number | null;
    /** 현재가의 매물대 위치 */
    pricePosition: 'above_poc' | 'at_poc' | 'below_poc';
    /** 전체 bins (시각화용) */
    bins: VolumeBin[];
}

/**
 * 매물대 계산 메인 함수
 *
 * @param bars     - OHLCV 배열 (Oldest → Newest), volume 포함
 * @param currentPrice - 현재가
 * @param numBins  - 가격대 분할 수 (기본 50구간)
 * @param lookback - 분석에 사용할 최근 봉 수 (2주 스윙: 60일)
 */
export function calculateVolumeProfile(
    bars: OhlcvBarWithVolume[],
    currentPrice: number,
    numBins: number = 50,
    lookback: number = 60
): VolumeProfile {
    // 최근 N일만 사용 (2주 스윙 기준 60일)
    const usedBars = bars.slice(-lookback);

    const highestHigh = Math.max(...usedBars.map(b => b.high));
    const lowestLow = Math.min(...usedBars.map(b => b.low));
    const binSize = (highestHigh - lowestLow) / numBins;

    // 가격 구간(bin) 초기화
    const bins: VolumeBin[] = Array.from({ length: numBins }, (_, i) => ({
        priceMin: lowestLow + i * binSize,
        priceMax: lowestLow + (i + 1) * binSize,
        priceMid: lowestLow + (i + 0.5) * binSize,
        volume: 0,
        volumePercent: 0,
    }));

    // 각 봉의 거래량을 해당 가격 구간에 균등 분배
    for (const bar of usedBars) {
        const barRange = bar.high - bar.low;
        if (barRange <= 0) {
            // 단일 가격 봉 → 해당 bin에 전량
            const idx = Math.min(
                Math.floor((bar.close - lowestLow) / binSize),
                numBins - 1
            );
            if (idx >= 0) bins[idx].volume += bar.volume;
            continue;
        }

        for (const bin of bins) {
            const overlap = Math.min(bar.high, bin.priceMax) - Math.max(bar.low, bin.priceMin);
            if (overlap > 0) {
                bin.volume += bar.volume * (overlap / barRange);
            }
        }
    }

    // 비중 계산
    const totalVolume = bins.reduce((s, b) => s + b.volume, 0);
    bins.forEach(b => {
        b.volume = Math.round(b.volume);
        b.volumePercent = totalVolume > 0 ? parseFloat(((b.volume / totalVolume) * 100).toFixed(2)) : 0;
    });

    // POC: 거래량 최대 구간
    const pocBin = bins.reduce((max, b) => b.volume > max.volume ? b : max, bins[0]);
    const poc = Math.round(pocBin.priceMid);

    // Value Area (상위 70%) — POC에서 양방향 확장
    const targetVolume = totalVolume * 0.7;
    const sortedByVolume = [...bins].sort((a, b) => b.volume - a.volume);
    let accumulated = 0;
    const valueAreaBins: VolumeBin[] = [];
    for (const bin of sortedByVolume) {
        accumulated += bin.volume;
        valueAreaBins.push(bin);
        if (accumulated >= targetVolume) break;
    }
    const valueAreaHigh = Math.round(Math.max(...valueAreaBins.map(b => b.priceMax)));
    const valueAreaLow = Math.round(Math.min(...valueAreaBins.map(b => b.priceMin)));

    // 현재가 기준 저항/지지 분리
    const aboveBins = bins.filter(b => b.priceMid > currentPrice);
    const belowBins = bins.filter(b => b.priceMid <= currentPrice);

    // 저항: 현재가 위, 거래량 상위 3 구간 (가격순 정렬)
    const resistanceZones = [...aboveBins]
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 3)
        .sort((a, b) => a.priceMid - b.priceMid);

    // 지지: 현재가 아래, 거래량 상위 3 구간 (가격 내림차순)
    const supportZones = [...belowBins]
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 3)
        .sort((a, b) => b.priceMid - a.priceMid);

    const nearestResistance = resistanceZones.length > 0
        ? Math.round(resistanceZones[0].priceMid) : null;
    const nearestSupport = supportZones.length > 0
        ? Math.round(supportZones[0].priceMid) : null;

    const pricePosition: VolumeProfile['pricePosition'] =
        currentPrice > poc * 1.005 ? 'above_poc'
            : currentPrice < poc * 0.995 ? 'below_poc'
                : 'at_poc';

    return {
        poc,
        valueAreaHigh,
        valueAreaLow,
        resistanceZones,
        supportZones,
        nearestResistance,
        nearestSupport,
        pricePosition,
        bins,
    };
}

/**
 * 2주 스윙 트레이딩 기준 매물대 해석 텍스트 생성
 */
export function interpretVolumeProfile(
    vp: VolumeProfile,
    currentPrice: number
): string[] {
    const msgs: string[] = [];

    if (vp.pricePosition === 'above_poc') {
        msgs.push(`현재가(${currentPrice.toLocaleString()})가 POC(${vp.poc.toLocaleString()}) 위 → 매물대 돌파 안착 구간`);
    } else if (vp.pricePosition === 'below_poc') {
        msgs.push(`현재가(${currentPrice.toLocaleString()})가 POC(${vp.poc.toLocaleString()}) 아래 → 핵심 매물대가 저항으로 작용 중`);
    } else {
        msgs.push(`현재가(${currentPrice.toLocaleString()})가 POC(${vp.poc.toLocaleString()}) 근처 → 매물 밀집 구간, 방향성 주시`);
    }

    if (vp.nearestResistance) {
        const distR = (((vp.nearestResistance - currentPrice) / currentPrice) * 100).toFixed(1);
        msgs.push(`상단 저항 매물대: ${vp.nearestResistance.toLocaleString()}원 (+${distR}%) → 1차 목표가 기준`);
    }
    if (vp.nearestSupport) {
        const distS = (((currentPrice - vp.nearestSupport) / currentPrice) * 100).toFixed(1);
        msgs.push(`하단 지지 매물대: ${vp.nearestSupport.toLocaleString()}원 (-${distS}%) → 손절 기준선`);
    }

    msgs.push(`가치구간(VA): ${vp.valueAreaLow.toLocaleString()} ~ ${vp.valueAreaHigh.toLocaleString()}원`);

    return msgs;
}
