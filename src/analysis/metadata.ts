
interface SymbolMetadata {
    sector: string;
    isDefensive: boolean;
}

// Simple in-memory metadata for demonstration.
// In a real app, this might come from a DB or external API.
export const SYMBOL_METADATA: Record<string, SymbolMetadata> = {
    'TSEM': { sector: 'Semiconductors', isDefensive: false },
    'AAPL': { sector: 'Consumer Electronics', isDefensive: false },
    'MSFT': { sector: 'Software', isDefensive: true }, // Treated as defensive for example
    'KO': { sector: 'Beverages', isDefensive: true },
    'JNJ': { sector: 'Healthcare', isDefensive: true },
    'PG': { sector: 'Consumer Goods', isDefensive: true },
    'NVDA': { sector: 'Semiconductors', isDefensive: false },
    'TSLA': { sector: 'Auto Manufacturers', isDefensive: false },
};

export function getMetadata(symbol: string): SymbolMetadata | undefined {
    return SYMBOL_METADATA[symbol];
}
