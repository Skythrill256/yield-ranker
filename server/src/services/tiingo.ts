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

// Tiingo "daily dividends" endpoint response (field names vary slightly across docs/examples).
// We defensively support both camelCase and PascalCase-ish variants.
interface TiingoDailyDividend {
    exDate?: string;
    payDate?: string;
    paymentDate?: string;
    recordDate?: string;
    declarationDate?: string;
    declaredDate?: string;
    cashAmount?: number;
    amount?: number;
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

// Mutex to prevent race conditions in parallel requests
let rateLimitMutex: Promise<void> = Promise.resolve();

// ============================================================================
// API Request Handler
// ============================================================================

function getMaxWaitMs(): number {
    // Default: fail fast rather than sleeping for nearly an hour (bad for scripts and API routes).
    // Override by setting TIINGO_MAX_WAIT_MS (milliseconds).
    const raw = process.env.TIINGO_MAX_WAIT_MS;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 15_000; // 15s
    }
    return parsed;
}

async function tiingoRequest<T>(
    endpoint: string,
    params: Record<string, string> = {}
): Promise<T> {
    // Serialize entire request through mutex to prevent parallel API calls
    return new Promise<T>((resolve, reject) => {
        rateLimitMutex = rateLimitMutex.then(async () => {
            try {
                const now = Date.now();
                const { rateLimit } = config.tiingo;

                // Reset hourly counter if hour has passed
                if (now - state.hourStartTime > 3600000) {
                    state.hourlyRequestCount = 0;
                    state.hourStartTime = now;
                }

                // Check if we've hit hourly limit BEFORE making request
                if (state.hourlyRequestCount >= rateLimit.requestsPerHour) {
                    const waitTime = 3600000 - (now - state.hourStartTime);
                    const maxWaitMs = getMaxWaitMs();
                    if (waitTime > maxWaitMs) {
                        throw new Error(
                            `Tiingo hourly rate limit reached (would wait ~${Math.ceil(
                                waitTime / 1000 / 60
                            )} min; TIINGO_MAX_WAIT_MS=${maxWaitMs}).`
                        );
                    }
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

                // Increment counters BEFORE making request
                state.lastRequestTime = Date.now();
                state.requestCount++;
                state.hourlyRequestCount++;

                // Now make the actual API request
                const url = new URL(`${config.tiingo.baseUrl}${endpoint}`);
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
                    logger.warn('Tiingo', `Rate limited. Retrying after ${retryAfter}s`);
                    await sleep(retryAfter * 1000);
                    // Decrement counter since this request failed
                    state.hourlyRequestCount--;
                    // Retry through mutex
                    const result = await tiingoRequest<T>(endpoint, params);
                    resolve(result);
                    return;
                }

                if (response.status === 404) {
                    logger.debug('Tiingo', `Ticker not found: ${endpoint}`);
                    resolve([] as T);
                    return;
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    reject(new Error(`Tiingo API error ${response.status}: ${errorText}`));
                    return;
                }

                const data = await response.json() as T;
                resolve(data);
            } catch (error) {
                reject(error);
            }
        });
    });
}

async function tiingoIEXRequest<T>(
    endpoint: string,
    params: Record<string, string> = {}
): Promise<T> {
    // Serialize entire request through mutex to prevent parallel API calls
    return new Promise<T>((resolve, reject) => {
        rateLimitMutex = rateLimitMutex.then(async () => {
            try {
                const now = Date.now();
                const { rateLimit } = config.tiingo;

                // Reset hourly counter if hour has passed
                if (now - state.hourStartTime > 3600000) {
                    state.hourlyRequestCount = 0;
                    state.hourStartTime = now;
                }

                // Check if we've hit hourly limit BEFORE making request
                if (state.hourlyRequestCount >= rateLimit.requestsPerHour) {
                    const waitTime = 3600000 - (now - state.hourStartTime);
                    const maxWaitMs = getMaxWaitMs();
                    if (waitTime > maxWaitMs) {
                        throw new Error(
                            `Tiingo hourly rate limit reached (would wait ~${Math.ceil(
                                waitTime / 1000 / 60
                            )} min; TIINGO_MAX_WAIT_MS=${maxWaitMs}).`
                        );
                    }
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

                // Increment counters BEFORE making request
                state.lastRequestTime = Date.now();
                state.requestCount++;
                state.hourlyRequestCount++;

                // Now make the actual API request
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
                    // Decrement counter since this request failed
                    state.hourlyRequestCount--;
                    // Retry through mutex
                    const result = await tiingoIEXRequest<T>(endpoint, params);
                    resolve(result);
                    return;
                }

                if (response.status === 404) {
                    logger.debug('Tiingo', `IEX ticker not found: ${endpoint}`);
                    resolve([] as T);
                    return;
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    reject(new Error(`Tiingo IEX API error ${response.status}: ${errorText}`));
                    return;
                }

                const data = await response.json() as T;
                resolve(data);
            } catch (error) {
                reject(error);
            }
        });
    });
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

        // NEW: Pull authoritative dividend dates (record/pay/declare) from Tiingo's dividends endpoint.
        // We still compute dividend amounts/adjustments from the EOD price endpoint (divCash + split factors),
        // but we enrich each ex-date with its proper metadata when available.
        let dividendDatesByExDate: Map<string, { recordDate: string | null; paymentDate: string | null; declarationDate: string | null }> | null = null;
        try {
            const normalizeDate = (value: string | null | undefined): string | null => {
                if (!value) return null;
                return String(value).split('T')[0];
            };

            const divMeta = await retry(
                () => tiingoRequest<TiingoDailyDividend[]>(`/tiingo/daily/${ticker.toUpperCase()}/dividends`, params),
                3,
                1000,
                (attempt, error) => logger.warn('Tiingo', `Retry ${attempt} for dividend dates ${ticker}: ${error.message}`)
            );

            dividendDatesByExDate = new Map();
            (divMeta || []).forEach((d) => {
                const ex = normalizeDate(d.exDate);
                if (!ex) return;
                const recordDate = normalizeDate(d.recordDate);
                const paymentDate = normalizeDate(d.payDate || d.paymentDate);
                const declarationDate = normalizeDate(d.declarationDate || d.declaredDate);
                dividendDatesByExDate!.set(ex, { recordDate, paymentDate, declarationDate });
            });

            if (dividendDatesByExDate.size > 0) {
                logger.debug('Tiingo', `Fetched ${dividendDatesByExDate.size} dividend date records for ${ticker}`);
            }
        } catch (e) {
            // Non-fatal: we will fall back to date estimation downstream.
            logger.warn('Tiingo', `Failed to fetch dividend dates for ${ticker} from /dividends endpoint: ${(e as Error).message}`);
            dividendDatesByExDate = null;
        }

        const priceData = await retry(
            () => tiingoRequest<TiingoPriceData[]>(`/tiingo/daily/${ticker.toUpperCase()}/prices`, params),
            3,
            1000,
            (attempt, error) => logger.warn('Tiingo', `Retry ${attempt} for dividends ${ticker}: ${error.message}`)
        );

        // Extract all split events (dates where splitFactor is not 1.0)
        // Sort chronologically (oldest first) to process in order
        const splitEvents = (priceData || [])
            .filter(p => p.splitFactor && p.splitFactor !== 1.0)
            .map(p => ({
                date: new Date(p.date),
                splitFactor: p.splitFactor,
            }))
            .sort((a, b) => a.date.getTime() - b.date.getTime());

        // Filter to dates where divCash > 0 (ex-dividend dates)
        const dividends = (priceData || [])
            .filter(p => p.divCash && p.divCash > 0)
            .map(p => {
                const divCash = p.divCash || 0;
                
                // Extract date string - handle both ISO format (2025-10-16T00:00:00Z) and simple date (2025-10-16)
                // IMPORTANT: Use the date string directly, don't convert to Date object to avoid timezone issues
                // Tiingo returns dates in YYYY-MM-DD format or ISO format, we want just YYYY-MM-DD
                let exDateStr = p.date;
                if (exDateStr.includes('T')) {
                    exDateStr = exDateStr.split('T')[0];
                }
                // Ensure we have a valid date string (YYYY-MM-DD format)
                if (!/^\d{4}-\d{2}-\d{2}$/.test(exDateStr)) {
                    logger.warn('Tiingo', `Invalid date format from Tiingo for ${ticker}: ${p.date}, using as-is`);
                }
                
                const exDate = new Date(exDateStr + 'T00:00:00Z'); // Parse as UTC to avoid timezone shifts
                
                // Calculate adjusted dividend: ALWAYS divide raw dividend by cumulative split factor
                // Formula: adj_amount = div_cash / cumulative_split_factor
                // 
                // Logic: Find all splits that occurred AFTER this dividend date
                // Multiply their split factors together to get cumulative adjustment factor
                // Then divide: adj = raw / cumulative_factor
                //
                // Example: 
                //   - Raw div on 11/26/25: 0.0594
                //   - Reverse split (1:10) on 12/1/25: splitFactor = 0.1
                //   - Since split is AFTER dividend, cumulative_factor = 0.1
                //   - adj = 0.0594 / 0.1 = 0.594 ✓
                //
                // Example with multiple splits:
                //   - Dividend on 1/1/20: 0.10
                //   - Split 1 on 1/15/20: 2-for-1 (splitFactor = 2)
                //   - Split 2 on 2/1/20: 3-for-1 (splitFactor = 3)
                //   - Cumulative factor = 2 * 3 = 6
                //   - adj = 0.10 / 6 = 0.0167
                
                // Find all splits that occurred AFTER this dividend date
                const applicableSplits = splitEvents.filter(split => split.date > exDate);
                
                // Calculate cumulative split factor (product of all applicable splits)
                let cumulativeSplitFactor = 1.0;
                if (applicableSplits.length > 0) {
                    cumulativeSplitFactor = applicableSplits.reduce(
                        (factor, split) => factor * split.splitFactor,
                        1.0
                    );
                }
                
                // ALWAYS divide raw dividend by cumulative split factor
                const adjDividend = cumulativeSplitFactor > 0 ? divCash / cumulativeSplitFactor : divCash;

                // Calculate scaled dividend: divCash × (adjClose / close)
                // This scales dividends to match the adjusted price series scale
                const adjClose = p.adjClose || 0;
                const close = p.close || 0;
                const scaledDividend = close > 0 && adjClose > 0
                    ? divCash * (adjClose / close)
                    : adjDividend; // Fallback to split-adjusted if prices unavailable

                // Ensure date is in YYYY-MM-DD format (no timezone conversion)
                // Tiingo returns dates as strings, extract just the date part
                let dateStr = exDateStr; // Use the already extracted date string
                
                // Validate date format
                if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    logger.warn('Tiingo', `Invalid date format for ${ticker}: ${p.date}, extracted as: ${dateStr}`);
                    // Fallback: try to extract date from original string
                    const fallbackDate = p.date.split('T')[0].split(' ')[0];
                    if (/^\d{4}-\d{2}-\d{2}$/.test(fallbackDate)) {
                        dateStr = fallbackDate;
                    } else {
                        logger.error('Tiingo', `Cannot parse date for ${ticker}: ${p.date}`);
                        dateStr = p.date; // Use original as fallback
                    }
                }

                return {
                    date: dateStr, // Store as YYYY-MM-DD string (no timezone conversion)
                    dividend: divCash,
                    adjDividend: adjDividend, // Uses split factor method (matches Seeking Alpha)
                    scaledDividend: scaledDividend, // Scaled by adjClose/close ratio
                    recordDate: dividendDatesByExDate?.get(dateStr)?.recordDate ?? null,
                    paymentDate: dividendDatesByExDate?.get(dateStr)?.paymentDate ?? null,
                    declarationDate: dividendDatesByExDate?.get(dateStr)?.declarationDate ?? null,
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
        scaled_amount: d.scaledDividend,
        split_factor: null,
        div_type: null,
        frequency: null,
        description: null,
        currency: 'USD',
    }));
}
