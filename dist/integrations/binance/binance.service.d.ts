interface PriceData {
    symbol: string;
    price: number;
    timestamp: string;
}
interface TickerData {
    symbol: string;
    priceChange: string;
    priceChangePercent: string;
    lastPrice: string;
    highPrice: string;
    lowPrice: string;
    volume: string;
    quoteVolume: string;
}
interface ExchangeInfo {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    status: string;
}
export declare class BinanceService {
    private client;
    private cache;
    constructor();
    getPrice(symbol: string): Promise<PriceData>;
    getMultiplePrices(symbols: string[]): Promise<PriceData[]>;
    get24hrTicker(symbol: string): Promise<TickerData>;
    getExchangeInfo(): Promise<ExchangeInfo[]>;
    convertAmount(fromSymbol: string, toSymbol: string, amount: number): Promise<{
        from: string;
        to: string;
        amount: number;
        convertedAmount: number;
        rate: number;
    }>;
}
export {};
//# sourceMappingURL=binance.service.d.ts.map