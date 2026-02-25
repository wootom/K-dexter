
import 'dotenv/config';
import { analyzeKrStock } from './src/tools/korea/analysis.js';

async function main() {
    console.log('Testing analyze_kr_stock for Samsung Electronics (005930)...');
    try {
        const result = await analyzeKrStock.invoke({ symbol: '005930' });
        console.log('Result:', result);
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
