/**
 * FMP (Financial Modeling Prep) API Service
 * 
 * Handles all interactions with the FMP API with rate limiting and retry logic
 */

import config from '../config/index.js';
import { logger, sleep, retry } from '../utils/index.js';
import type { FMPPriceData, FMPDividendData, FMPQuote } from '../types/index.js';

// ============================================================================
// Rate Limiting State
// ============================================================================

interface RateLimitState {
    requestCount: number;
    dailyRequestCount: number;
    lastRequestTime: number;
    dayStartTime: number;
}

const state: RateLimitState = {
    requestCount: 0,
    dailyRequestCount: 0,
    lastRequestTime: 0,
    dayStartTime: Date.now(),
};

// ============================================================================
// Rate Limiting
// ============================================================================

async function waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const { rateLimit } = config.fmp;

    // Reset daily counter if day has passed (24 hours)
    if (now - state.dayStartTime > 86400000) {
        state.dailyRequestCount = 0;
        state.dayStartTime = now;
    }

    // Check if we've hit daily limit
    if (state.dailyRequestCount >= rateLimit.requestsPerDay) {
        const waitTime = 86400000 - (now - state.dayStartTime);
        logger.warn('FMP', `Daily rate limit reached. Waiting ${Math.ceil(waitTime / 1000 / 60)} minutes`);
        await sleep(waitTime);
        state.dailyRequestCount = 0;
        state.dayStartTime = Date.now();
    }

    // Ensure minimum delay between requests
    const timeSinceLastRequest = now - state.lastRequestTime;
    if (timeSinceLastRequest < rateLimit.minDelayMs) {
        await sleep(rateLimit.minDelayMs - timeSinceLastRequest);
    }

    state.lastRequestTime = Date.now();
    state.requestCount++;
    state.dailyRequestCount++;
}

// ============================================================================
// API Request Handler
// ============================================================================

async function fmpRequest<T>(
    endpoint: string,
    params: Record<string, string> = {}
): Promise<T> {
    await waitForRateLimit();

    const url = new URL(`${config.fmp.baseUrl}${endpoint}`);
    // Add API key
    url.searchParams.append('apikey', config.fmp.apiKey);
    // Add other params
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60', 10);
        logger.warn('FMP', `Rate limited. Retrying after ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        return fmpRequest<T>(endpoint, params);
    }

    if (response.status === 404) {
        logger.debug('FMP', `Ticker not found: ${endpoint}`);
        return [] as T;
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FMP API error ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<T>;
}

// ============================================================================
// Public API Methods
// ============================================================================

export async function fetchTickerMeta(ticker: string): Promise<FMPQuote | null> {
    try {
        const data = await retry(
            () => fmpRequest<FMPQuote[]>(`/api/v3/quote/${ticker.toUpperCase()}`),
            3,
            1000,
            (attempt, error) => logger.warn('FMP', `Retry ${attempt} for quote ${ticker}: ${error.message}`)
        );
        return data.length > 0 ? data[0] : null;
    } catch (error) {
        logger.error('FMP', `Error fetching quote for ${ticker}: ${(error as Error).message}`);
        return null;
    }
}

export async function fetchPriceHistory(
    ticker: string,
    startDate: string,
    endDate?: string
): Promise<FMPPriceData[]> {
    const params: Record<string, string> = {
        from: startDate
    };
    if (endDate) params.to = endDate;

    try {
        // FMP v3 API format: /api/v3/historical-price-full/{symbol}
        const response = await retry(
            () => fmpRequest<{ symbol: string; historical: FMPPriceData[] }>(`/api/v3/historical-price-full/${ticker.toUpperCase()}`, params),
            3,
            1000,
            (attempt, error) => logger.warn('FMP', `Retry ${attempt} for prices ${ticker}: ${error.message}`)
        );

        // v3 API returns { symbol: string, historical: [...] }
        const data = response?.historical || [];

        // FMP returns data in reverse chronological order, reverse it to match expected format
        const sortedData = [...data].sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        logger.debug('FMP', `Fetched ${sortedData.length} price records for ${ticker}`);
        return sortedData;
    } catch (error) {
        logger.error('FMP', `Error fetching prices for ${ticker}: ${(error as Error).message}`);
        return [];
    }
}

export async function fetchDividendHistory(
    ticker: string,
    startDate?: string,
    endDate?: string
): Promise<FMPDividendData[]> {
    try {
        // FMP v3 API format: /api/v3/historical-price-full/stock_dividend/{symbol}
        let response = await retry(
            () => fmpRequest<{ symbol: string; historical: FMPDividendData[] }>(`/api/v3/historical-price-full/stock_dividend/${ticker.toUpperCase()}`),
            3,
            1000,
            (attempt, error) => logger.warn('FMP', `Retry ${attempt} for dividends ${ticker}: ${error.message}`)
        );

        let data = response?.historical || [];

        // Filter by date range if provided
        if (startDate) {
            const startTime = new Date(startDate).getTime();
            data = data.filter(d => new Date(d.date).getTime() >= startTime);
        }
        if (endDate) {
            const endTime = new Date(endDate).getTime();
            data = data.filter(d => new Date(d.date).getTime() <= endTime);
        }

        // Sort by date ascending
        data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        logger.debug('FMP', `Fetched ${data.length} dividend records for ${ticker}`);
        return data;
    } catch (error) {
        logger.error('FMP', `Error fetching dividends for ${ticker}: ${(error as Error).message}`);
        return [];
    }
}

export async function fetchLatestPrice(ticker: string): Promise<FMPPriceData | null> {
    try {
        const response = await fmpRequest<{ symbol: string; historical: FMPPriceData[] }>(`/api/v3/historical-price-full/${ticker.toUpperCase()}`);
        const data = response?.historical || [];
        return data.length > 0 ? data[0] : null; // FMP returns most recent first
    } catch (error) {
        logger.error('FMP', `Error fetching latest price for ${ticker}: ${(error as Error).message}`);
        return null;
    }
}

/**
 * Fetch realtime quote for a ticker.
 * Uses FMP quote endpoint for current prices.
 */
export async function fetchRealtimePrice(ticker: string): Promise<{
    price: number;
    prevClose: number;
    timestamp: string;
    isRealtime: boolean;
} | null> {
    try {
        const quoteData = await fmpRequest<FMPQuote[]>(`/api/v3/quote/${ticker.toUpperCase()}`);

        if (quoteData.length > 0) {
            const quote = quoteData[0];
            const price = quote.price;

            if (price && price > 0) {
                return {
                    price,
                    prevClose: quote.previousClose || 0,
                    timestamp: new Date().toISOString(),
                    isRealtime: true,
                };
            }
        }

        // Fallback to EOD data if quote is unavailable
        const eodData = await fetchLatestPrice(ticker);
        if (eodData) {
            return {
                price: eodData.close,
                prevClose: eodData.close,
                timestamp: eodData.date,
                isRealtime: false,
            };
        }

        return null;
    } catch (error) {
        logger.warn('FMP', `Quote fetch failed for ${ticker}, trying EOD: ${(error as Error).message}`);

        try {
            const eodData = await fetchLatestPrice(ticker);
            if (eodData) {
                return {
                    price: eodData.close,
                    prevClose: eodData.close,
                    timestamp: eodData.date,
                    isRealtime: false,
                };
            }
        } catch {
            logger.error('FMP', `Both quote and EOD fetch failed for ${ticker}`);
        }

        return null;
    }
}

/**
 * Fetch realtime prices for multiple tickers in batch
 * Uses the batch quote endpoint
 */
export async function fetchRealtimePricesBatch(tickers: string[]): Promise<Map<string, {
    price: number;
    prevClose: number;
    timestamp: string;
    isRealtime: boolean;
}>> {
    const results = new Map<string, {
        price: number;
        prevClose: number;
        timestamp: string;
        isRealtime: boolean;
    }>();

    if (tickers.length === 0) return results;

    try {
        // FMP batch quote supports comma-separated symbols
        const tickerChunks: string[][] = [];
        for (let i = 0; i < tickers.length; i += 50) {
            tickerChunks.push(tickers.slice(i, i + 50));
        }

        for (const chunk of tickerChunks) {
            const tickerList = chunk.map(t => t.toUpperCase()).join(',');
            const quoteData = await fmpRequest<FMPQuote[]>(`/api/v3/quote/${tickerList}`);

            for (const quote of quoteData) {
                const price = quote.price;
                if (price && price > 0) {
                    results.set(quote.symbol.toUpperCase(), {
                        price,
                        prevClose: quote.previousClose || 0,
                        timestamp: new Date().toISOString(),
                        isRealtime: true,
                    });
                }
            }
        }
    } catch (error) {
        logger.warn('FMP', `Batch quote fetch failed: ${(error as Error).message}`);
    }

    // Fetch EOD for any tickers that didn't get quote data
    for (const ticker of tickers) {
        if (!results.has(ticker.toUpperCase())) {
            const realtimePrice = await fetchRealtimePrice(ticker);
            if (realtimePrice) {
                results.set(ticker.toUpperCase(), realtimePrice);
            }
        }
    }

    return results;
}

export async function healthCheck(): Promise<boolean> {
    try {
        const data = await fetchTickerMeta('SPY');
        return data !== null;
    } catch {
        return false;
    }
}

export function getRateLimitStatus(): {
    requestsToday: number;
    totalRequests: number;
    dailyLimit: number;
} {
    return {
        requestsToday: state.dailyRequestCount,
        totalRequests: state.requestCount,
        dailyLimit: config.fmp.rateLimit.requestsPerDay,
    };
}

// ============================================================================
// Batch Processing
// ============================================================================

export async function fetchPriceHistoryBatch(
    tickers: string[],
    startDate: string,
    endDate?: string,
    onProgress?: (ticker: string, index: number, total: number) => void
): Promise<Map<string, FMPPriceData[]>> {
    const results = new Map<string, FMPPriceData[]>();

    for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        onProgress?.(ticker, i + 1, tickers.length);

        const prices = await fetchPriceHistory(ticker, startDate, endDate);
        results.set(ticker, prices);
    }

    return results;
}

export async function fetchDividendHistoryBatch(
    tickers: string[],
    startDate?: string,
    endDate?: string,
    onProgress?: (ticker: string, index: number, total: number) => void
): Promise<Map<string, FMPDividendData[]>> {
    const results = new Map<string, FMPDividendData[]>();

    for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        onProgress?.(ticker, i + 1, tickers.length);

        const dividends = await fetchDividendHistory(ticker, startDate, endDate);
        results.set(ticker, dividends);
    }

    return results;
}

// ============================================================================
// API-to-Record Conversion Functions (for metrics calculation)
// These functions fetch from FMP API and convert to PriceRecord/DividendRecord types
// ============================================================================

import type { PriceRecord, DividendRecord } from '../types/index.js';

/**
 * Fetch price history from FMP API and convert to PriceRecord format.
 * This is used by metrics.ts for calculating returns.
 */
export async function getPriceHistoryFromAPI(
    ticker: string,
    startDate: string,
    endDate?: string
): Promise<PriceRecord[]> {
    const fmpData = await fetchPriceHistory(ticker, startDate, endDate);

    return fmpData.map(d => ({
        ticker: ticker.toUpperCase(),
        date: d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        adj_close: d.adjClose,
        volume: d.volume,
        adj_open: d.adjOpen ?? null,
        adj_high: d.adjHigh ?? null,
        adj_low: d.adjLow ?? null,
        adj_volume: d.adjVolume ?? null,
        div_cash: null, // FMP price data doesn't include dividends
        split_factor: null,
    }));
}

/**
 * Fetch latest N prices from FMP API and convert to PriceRecord format.
 */
export async function getLatestPriceFromAPI(
    ticker: string,
    count: number = 1
): Promise<PriceRecord[]> {
    // Fetch recent history and take last N
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Get last 30 days to ensure we have enough

    const prices = await getPriceHistoryFromAPI(ticker, startDate.toISOString().split('T')[0], endDate);

    // Return last N prices
    return prices.slice(-count);
}

/**
 * Fetch dividend history from FMP API and convert to DividendRecord format.
 */
export async function getDividendsFromAPI(
    ticker: string,
    startDate?: string
): Promise<DividendRecord[]> {
    const fmpData = await fetchDividendHistory(ticker, startDate);

    return fmpData.map(d => ({
        ticker: ticker.toUpperCase(),
        ex_date: d.date,
        pay_date: d.paymentDate,
        record_date: d.recordDate,
        declare_date: d.declarationDate,
        div_cash: d.dividend,
        adj_amount: d.adjDividend,
        split_factor: null,
        div_type: null,
        frequency: null,
        description: d.label || null,
        currency: 'USD',
    }));
}

