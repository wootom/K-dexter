
import { SMA, RSI, MACD, BollingerBands } from 'technicalindicators';

console.log("Starting technical indicators test...");

const closes = Array.from({ length: 60 }, (_, i) => i % 10 === 0 ? NaN : 100 + Math.sin(i) * 10);
console.log(`Generated ${closes.length} data points with NaNs.`);

try {
    console.log("Calculating SMA...");
    SMA.calculate({ period: 20, values: closes });
    console.log("SMA done.");

    console.log("Calculating RSI...");
    RSI.calculate({ period: 14, values: closes });
    console.log("RSI done.");

    console.log("Calculating MACD...");
    MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
    });
    console.log("MACD done.");

    console.log("Calculating BB...");
    BollingerBands.calculate({
        period: 20,
        stdDev: 2,
        values: closes,
    });
    console.log("BB done.");

    console.log("All calculations finished successfully.");
} catch (e) {
    console.error("Error during calculation:", e);
}
