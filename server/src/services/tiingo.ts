/**
 * Tiingo API Service
 * 
 * Handles all interactions with the Tiingo API for:
 * - End-of-Day (EOD) price data with adjClose
 * - Dividend data from EOD endpoint
 * - IEX realtime quotes
 * 
 * Rate limiting and retry logic included.
 */

import config from '../config/index.js';
import { logger, sleep, retry } from '../utils/index.js';
import type { PriceRecord, DividendRecord } from '../types/index.js';

// ============================================================================
// Tiingo API Types
// ============================================================================

export interface TiingoPriceData {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    adjOpen: number;
    adjHigh: number;
    adjLow: number;
    adjClose: number;
    divCash: number;
    splitFactor: number;
}

export interface TiingoIEXQuote {
    ticker: string;
    tngoLast: number;
    last: number;
    prevClose: number;
    open: number;
    high: number;
    low: number;
    mid: number;
    volume: number;
    bidPrice: number;
    bidSize: number;
    askPrice: number;
    askSize: number;
    timestamp: string;
    quoteTimestamp: string;
    lastSaleTimestamp: string;
}

export interface TiingoMetaData {
    ticker: string;
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    exchangeCode: string;
}

// ============================================================================
// Rate Limiting State
// ============================================================================

interface RateLimitState {
    requestCount: number;
    hourlyRequestCount: number;
    lastRequestTime: number;
    hourStartTime: number;
}

const state: RateLimitState = {
    requestCount: 0,
    hourlyRequestCount: 0,
    lastRequestTime: 0,
    hourStartTime: Date.now(),
};

// ============================================================================
// Rate Limiting
// ============================================================================

async function waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const { rateLimit } = config.tiingo;

    // Reset hourly counter if hour has passed
    if (now - state.hourStartTime > 3600000) {
        state.hourlyRequestCount = 0;
        state.hourStartTime = now;
    }

    // Check if we've hit hourly limit
    if (state.hourlyRequestCount >= rateLimit.requestsPerHour) {
        const waitTime = 3600000 - (now - state.hourStartTime);
        logger.warn('Tiingo', `Hourly rate limit reached. Waiting ${Math.ceil(waitTime / 1000 / 60)} minutes`);
        await sleep(waitTime);
        state.hourlyRequestCount = 0;
        state.hourStartTime = Date.now();
    }

    // Ensure minimum delay between requests
    const timeSinceLastRequest = now - state.lastRequestTime;
    if (timeSinceLastRequest < rateLimit.minDelayMs) {
        await sleep(rateLimit.minDelayMs - timeSinceLastRequest);
    }

    state.lastRequestTime = Date.now();
    state.requestCount++;
    state.hourlyRequestCount++;
}

// ============================================================================
// API Request Handler
// ============================================================================

async function tiingoRequest<T>(
    endpoint: string,
    params: Record<string, string> = {}
): Promise<T> {
    await waitForRateLimit();

    const url = new URL(`${config.tiingo.baseUrl}${endpoint}`);
    // Add API token
    url.searchParams.append('token', config.tiingo.apiKey);
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
        logger.warn('Tiingo', `Rate limited. Retrying after ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        return tiingoRequest<T>(endpoint, params);
    }

    if (response.status === 404) {
        logger.debug('Tiingo', `Ticker not found: ${endpoint}`);
        return [] as T;
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tiingo API error ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<T>;
}

async function tiingoIEXRequest<T>(
    endpoint: string,
    params: Record<string, string> = {}
): Promise<T> {
    await waitForRateLimit();

    const url = new URL(`${config.tiingo.iexBaseUrl}${endpoint}`);
    url.searchParams.append('token', config.tiingo.apiKey);
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
        logger.warn('Tiingo', `IEX rate limited. Retrying after ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        return tiingoIEXRequest<T>(endpoint, params);
    }

    if (response.status === 404) {
        logger.debug('Tiingo', `IEX ticker not found: ${endpoint}`);
        return [] as T;
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tiingo IEX API error ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<T>;
}

// ============================================================================
// Public API Methods - Ticker Metadata
// ============================================================================

export async function fetchTickerMeta(ticker: string): Promise<TiingoMetaData | null> {
    try {
        const data = await retry(
            () => tiingoRequest<TiingoMetaData>(`/tiingo/daily/${ticker.toUpperCase()}`),
            3,
            1000,
            (attempt, error) => logger.warn('Tiingo', `Retry ${attempt} for meta ${ticker}: ${error.message}`)
        );
        return data || null;
    } catch (error) {
        logger.error('Tiingo', `Error fetching meta for ${ticker}: ${(error as Error).message}`);
        return null;
    }
}

// ============================================================================
// Public API Methods - Price History
// ============================================================================

export async function fetchPriceHistory(
    ticker: string,
    startDate: string,
    endDate?: string
): Promise<TiingoPriceData[]> {
    const params: Record<string, string> = {
        startDate,
    };
    if (endDate) params.endDate = endDate;

    try {
        const data = await retry(
            () => tiingoRequest<TiingoPriceData[]>(`/tiingo/daily/${ticker.toUpperCase()}/prices`, params),
            3,
            1000,
            (attempt, error) => logger.warn('Tiingo', `Retry ${attempt} for prices ${ticker}: ${error.message}`)
        );

        // Tiingo returns data in chronological order (oldest first)
        const sortedData = [...(data || [])].sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        logger.debug('Tiingo', `Fetched ${sortedData.length} price records for ${ticker}`);
        return sortedData;
    } catch (error) {
        logger.error('Tiingo', `Error fetching prices for ${ticker}: ${(error as Error).message}`);
        return [];
    }
}

export async function fetchLatestPrice(ticker: string): Promise<TiingoPriceData | null> {
    try {
        // Fetch last 5 days to ensure we get the most recent trading day
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);

        const data = await tiingoRequest<TiingoPriceData[]>(
            `/tiingo/daily/${ticker.toUpperCase()}/prices`,
            { startDate: startDate.toISOString().split('T')[0], endDate }
        );

        if (data && data.length > 0) {
            // Return most recent (last element after sorting)
            return data[data.length - 1];
        }
        return null;
    } catch (error) {
        logger.error('Tiingo', `Error fetching latest price for ${ticker}: ${(error as Error).message}`);
        return null;
    }
}

// ============================================================================
// Public API Methods - Dividends
// ============================================================================

/**
 * Fetch dividend history from Tiingo EOD endpoint.
 * Tiingo includes divCash in the price data on ex-dividend dates.
 */
export async function fetchDividendHistory(
    ticker: string,
    startDate?: string,
    endDate?: string
): Promise<Array<{ date: string; dividend: number; adjDividend: number; scaledDividend: number; recordDate: string | null; paymentDate: string | null; declarationDate: string | null }>> {
    try {
        const params: Record<string, string> = {};
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;

        const priceData = await retry(
            () => tiingoRequest<TiingoPriceData[]>(`/tiingo/daily/${ticker.toUpperCase()}/prices`, params),
            3,
            1000,
            (attempt, error) => logger.warn('Tiingo', `Retry ${attempt} for dividends ${ticker}: ${error.message}`)
        );

        // Filter to dates where divCash > 0 (ex-dividend dates)
        const dividends = (priceData || [])
            .filter(p => p.divCash && p.divCash > 0)
            .map(p => {
                const adjClose = p.adjClose || 0;
                const close = p.close || 0;
                const divCash = p.divCash || 0;
                
                // Calculate scaled dividend: divCash × (adjClose / close)
                // This scales dividends to match the adjusted price series scale
                const scaledDividend = close > 0 && adjClose > 0 
                    ? divCash * (adjClose / close)
                    : divCash / (p.splitFactor || 1); // Fallback to split-adjusted if prices unavailable
                
                return {
                    date: p.date.split('T')[0],
                    dividend: divCash,
                    adjDividend: p.divCash / (p.splitFactor || 1), // Split-adjusted (legacy)
                    scaledDividend: scaledDividend, // Scaled by adjClose/close ratio
                    recordDate: null, // Tiingo EOD doesn't include record date
                    paymentDate: null, // Tiingo EOD doesn't include payment date
                    declarationDate: null,
                };
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        logger.debug('Tiingo', `Fetched ${dividends.length} dividend records for ${ticker}`);
        return dividends;
    } catch (error) {
        logger.error('Tiingo', `Error fetching dividends for ${ticker}: ${(error as Error).message}`);
        return [];
    }
}

// ============================================================================
// Public API Methods - IEX Realtime Quotes
// ============================================================================

/**
 * Fetch realtime quote for a ticker using Tiingo IEX endpoint.
 * Returns null if no IEX data available (no fallback).
 */
export async function fetchRealtimePrice(ticker: string): Promise<{
    price: number;
    prevClose: number;
    timestamp: string;
    isRealtime: boolean;
} | null> {
    try {
        const quoteData = await tiingoIEXRequest<TiingoIEXQuote[]>(`/${ticker.toUpperCase()}`);

        if (quoteData && quoteData.length > 0) {
            const quote = quoteData[0];
            const price = quote.tngoLast || quote.last || 0;

            if (price && price > 0) {
                return {
                    price,
                    prevClose: quote.prevClose || 0,
                    timestamp: quote.lastSaleTimestamp || new Date().toISOString(),
                    isRealtime: true,
                };
            }
        }

        return null;
    } catch (error) {
        logger.error('Tiingo', `IEX quote fetch failed for ${ticker}: ${(error as Error).message}`);
        return null;
    }
}

/**
 * Fetch realtime prices for multiple tickers in batch using Tiingo IEX.
 * Only returns IEX data (no fallback).
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
        // Tiingo IEX supports comma-separated tickers
        const tickerList = tickers.map(t => t.toUpperCase()).join(',');
        const quoteData = await tiingoIEXRequest<TiingoIEXQuote[]>(`/?tickers=${tickerList}`);

        if (quoteData && Array.isArray(quoteData)) {
            for (const quote of quoteData) {
                const price = quote.tngoLast || quote.last || 0;
                if (price && price > 0) {
                    results.set(quote.ticker.toUpperCase(), {
                        price,
                        prevClose: quote.prevClose || 0,
                        timestamp: quote.lastSaleTimestamp || new Date().toISOString(),
                        isRealtime: true,
                    });
                }
            }
        }
    } catch (error) {
        logger.error('Tiingo', `Batch IEX quote fetch failed: ${(error as Error).message}`);
    }

    return results;
}

// ============================================================================
// Health Check
// ============================================================================

export async function healthCheck(): Promise<boolean> {
    try {
        const data = await fetchTickerMeta('SPY');
        return data !== null;
    } catch {
        return false;
    }
}

export function getRateLimitStatus(): {
    requestsThisHour: number;
    totalRequests: number;
    hourlyLimit: number;
} {
    return {
        requestsThisHour: state.hourlyRequestCount,
        totalRequests: state.requestCount,
        hourlyLimit: config.tiingo.rateLimit.requestsPerHour,
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
): Promise<Map<string, TiingoPriceData[]>> {
    const results = new Map<string, TiingoPriceData[]>();

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
): Promise<Map<string, Array<{ date: string; dividend: number; adjDividend: number; scaledDividend: number; recordDate: string | null; paymentDate: string | null; declarationDate: string | null }>>> {
    const results = new Map<string, Array<{ date: string; dividend: number; adjDividend: number; scaledDividend: number; recordDate: string | null; paymentDate: string | null; declarationDate: string | null }>>();

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
// ============================================================================

/**
 * Fetch price history from Tiingo API and convert to PriceRecord format.
 * Uses adjClose for adjusted close prices.
 */
export async function getPriceHistoryFromAPI(
    ticker: string,
    startDate: string,
    endDate?: string
): Promise<PriceRecord[]> {
    const tiingoData = await fetchPriceHistory(ticker, startDate, endDate);

    return tiingoData.map(d => ({
        ticker: ticker.toUpperCase(),
        date: d.date.split('T')[0],
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        adj_close: d.adjClose, // Tiingo adjClose used for total return calculations
        volume: d.volume,
        adj_open: d.adjOpen ?? null,
        adj_high: d.adjHigh ?? null,
        adj_low: d.adjLow ?? null,
        adj_volume: null,
        div_cash: d.divCash > 0 ? d.divCash : null,
        split_factor: d.splitFactor !== 1 ? d.splitFactor : null,
    }));
}

/**
 * Fetch latest N prices from Tiingo API and convert to PriceRecord format.
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
 * Fetch dividend history from Tiingo API and convert to DividendRecord format.
 */
export async function getDividendsFromAPI(
    ticker: string,
    startDate?: string
): Promise<DividendRecord[]> {
    const tiingoData = await fetchDividendHistory(ticker, startDate);

    return tiingoData.map(d => ({
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
        description: null,
        currency: 'USD',
    }));
}
