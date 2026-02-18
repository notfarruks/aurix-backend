"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceService = void 0;
const axios_1 = __importDefault(require("axios"));
const node_cache_1 = __importDefault(require("node-cache"));
class BinanceService {
    constructor() {
        const baseURL = process.env.BINANCE_BASE_URL || 'https://api.binance.com';
        this.client = axios_1.default.create({
            baseURL,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        // Cache prices for 10 seconds to avoid rate limits
        this.cache = new node_cache_1.default({
            stdTTL: 10,
            checkperiod: 15,
        });
    }
    // -----------------------------------------
    // Get current price for a symbol (e.g. BTCUSDT)
    // -----------------------------------------
    async getPrice(symbol) {
        const cacheKey = `price_${symbol.toUpperCase()}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        try {
            const response = await this.client.get('/api/v3/ticker/price', {
                params: { symbol: symbol.toUpperCase() },
            });
            const priceData = {
                symbol: response.data.symbol,
                price: parseFloat(response.data.price),
                timestamp: new Date().toISOString(),
            };
            this.cache.set(cacheKey, priceData);
            return priceData;
        }
        catch (error) {
            if (error.response?.status === 400) {
                throw new Error(`Invalid symbol: ${symbol}`);
            }
            throw new Error(`Failed to fetch price for ${symbol}: ${error.message}`);
        }
    }
    // -----------------------------------------
    // Get prices for multiple symbols
    // -----------------------------------------
    async getMultiplePrices(symbols) {
        const results = [];
        // Check cache first for each symbol
        const uncachedSymbols = [];
        for (const symbol of symbols) {
            const cacheKey = `price_${symbol.toUpperCase()}`;
            const cached = this.cache.get(cacheKey);
            if (cached) {
                results.push(cached);
            }
            else {
                uncachedSymbols.push(symbol.toUpperCase());
            }
        }
        // Fetch uncached symbols
        if (uncachedSymbols.length > 0) {
            try {
                const response = await this.client.get('/api/v3/ticker/price', {
                    params: { symbols: JSON.stringify(uncachedSymbols) },
                });
                const data = Array.isArray(response.data) ? response.data : [response.data];
                for (const item of data) {
                    const priceData = {
                        symbol: item.symbol,
                        price: parseFloat(item.price),
                        timestamp: new Date().toISOString(),
                    };
                    this.cache.set(`price_${item.symbol}`, priceData);
                    results.push(priceData);
                }
            }
            catch (error) {
                throw new Error(`Failed to fetch prices: ${error.message}`);
            }
        }
        return results;
    }
    // -----------------------------------------
    // Get 24hr ticker stats for a symbol
    // -----------------------------------------
    async get24hrTicker(symbol) {
        const cacheKey = `ticker_${symbol.toUpperCase()}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        try {
            const response = await this.client.get('/api/v3/ticker/24hr', {
                params: { symbol: symbol.toUpperCase() },
            });
            const tickerData = {
                symbol: response.data.symbol,
                priceChange: response.data.priceChange,
                priceChangePercent: response.data.priceChangePercent,
                lastPrice: response.data.lastPrice,
                highPrice: response.data.highPrice,
                lowPrice: response.data.lowPrice,
                volume: response.data.volume,
                quoteVolume: response.data.quoteVolume,
            };
            this.cache.set(cacheKey, tickerData);
            return tickerData;
        }
        catch (error) {
            if (error.response?.status === 400) {
                throw new Error(`Invalid symbol: ${symbol}`);
            }
            throw new Error(`Failed to fetch 24hr ticker for ${symbol}: ${error.message}`);
        }
    }
    // -----------------------------------------
    // Get available trading pairs
    // -----------------------------------------
    async getExchangeInfo() {
        const cacheKey = 'exchange_info';
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        try {
            const response = await this.client.get('/api/v3/exchangeInfo');
            const symbols = response.data.symbols.map((s) => ({
                symbol: s.symbol,
                baseAsset: s.baseAsset,
                quoteAsset: s.quoteAsset,
                status: s.status,
            }));
            // Cache exchange info for 5 minutes
            this.cache.set(cacheKey, symbols, 300);
            return symbols;
        }
        catch (error) {
            throw new Error(`Failed to fetch exchange info: ${error.message}`);
        }
    }
    // -----------------------------------------
    // Convert amount between crypto & fiat
    // -----------------------------------------
    async convertAmount(fromSymbol, toSymbol, amount) {
        const pair = `${fromSymbol.toUpperCase()}${toSymbol.toUpperCase()}`;
        try {
            const priceData = await this.getPrice(pair);
            const convertedAmount = amount * priceData.price;
            return {
                from: fromSymbol.toUpperCase(),
                to: toSymbol.toUpperCase(),
                amount,
                convertedAmount,
                rate: priceData.price,
            };
        }
        catch {
            // Try reverse pair
            const reversePair = `${toSymbol.toUpperCase()}${fromSymbol.toUpperCase()}`;
            const priceData = await this.getPrice(reversePair);
            const convertedAmount = amount / priceData.price;
            return {
                from: fromSymbol.toUpperCase(),
                to: toSymbol.toUpperCase(),
                amount,
                convertedAmount,
                rate: 1 / priceData.price,
            };
        }
    }
}
exports.BinanceService = BinanceService;
//# sourceMappingURL=binance.service.js.map