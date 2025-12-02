/**
 * Tiingo Corporate Actions API Service
 * 
 * Fetches dividend record and payment dates from Tiingo Corporate Actions API
 * Replaces the previous Alpha Vantage implementation for better data quality
 * and unified API usage.
 */

import config from '../config/index.js';
import { logger, sleep } from '../utils/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Tiingo Corporate Actions API dividend response
 * Endpoint: /tiingo/corporate-actions/{ticker}/dividends
 */
export interface TiingoCorporateActionDividend {
  exDate: string;
  recordDate: string | null;
  payDate: string | null;
  declareDate: string | null;
  distribution: number;           // Split-adjusted dividend amount
  distributionType: string | null; // e.g., "cash", "stock"
  distributionFrequency: string | null; // q=quarterly, sa=semi-annual, a=annual, m=monthly, w=weekly
  splitFactor: number | null;
}

export interface DividendDates {
  exDate: string;
  recordDate: string | null;
  paymentDate: string | null;
  declarationDate: string | null;
  amount: number;
  frequency: string | null;
  annualizedAmount: number | null;
}

// Frequency to annualization factor mapping
const FREQUENCY_MAP: Record<string, number> = {
  'q': 4,      // Quarterly
  'sa': 2,    // Semi-annually
  'a': 1,     // Annually
  'm': 12,    // Monthly
  'w': 52,    // Weekly
  'bm': 24,   // Bi-monthly
  'tm': 3,    // Tri-monthly (every 4 months)
  'ir': 0,    // Irregular
  'u': 0,     // Unknown
  'c': 0,     // Continuous
};

// ============================================================================
// Rate Limiting State
// ============================================================================

let lastRequestTime = 0;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  const minDelay = config.tiingo.rateLimit.minDelayMs;
  
  if (timeSinceLastRequest < minDelay) {
    const waitTime = minDelay - timeSinceLastRequest;
    logger.debug('TiingoCorporateActions', `Rate limiting: waiting ${waitTime}ms`);
    await sleep(waitTime);
  }
  
  lastRequestTime = Date.now();
}

// ============================================================================
// API Methods
// ============================================================================

/**
 * Get annualization factor from frequency code
 */
function getAnnualizationFactor(frequency: string | null): number {
  if (!frequency) return 0;
  const normalizedFreq = frequency.toLowerCase().trim();
  return FREQUENCY_MAP[normalizedFreq] ?? 0;
}

/**
 * Fetch dividend history with record and payment dates from Tiingo Corporate Actions API
 * This provides better data quality than the basic /tiingo/daily/{ticker}/dividends endpoint
 */
export async function fetchDividendDates(
  ticker: string,
  startDate?: string,
  endDate?: string
): Promise<DividendDates[]> {
  if (!config.tiingo.apiKey) {
    logger.warn('TiingoCorporateActions', 'Tiingo API key not configured');
    return [];
  }

  await waitForRateLimit();

  // Build URL with optional date parameters
  const baseUrl = `${config.tiingo.baseUrl}/tiingo/corporate-actions/${ticker.toUpperCase()}/dividends`;
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  
  const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${config.tiingo.apiKey}`,
      },
    });
    
    if (response.status === 404) {
      logger.debug('TiingoCorporateActions', `No corporate actions data for ${ticker}`);
      return [];
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json() as TiingoCorporateActionDividend[];

    if (!Array.isArray(data) || data.length === 0) {
      logger.debug('TiingoCorporateActions', `No dividend data for ${ticker}`);
      return [];
    }

    const dividends: DividendDates[] = data.map((div) => {
      const annualizationFactor = getAnnualizationFactor(div.distributionFrequency);
      const annualizedAmount = annualizationFactor > 0 
        ? div.distribution * annualizationFactor 
        : null;

      return {
        exDate: div.exDate,
        recordDate: div.recordDate || null,
        paymentDate: div.payDate || null,
        declarationDate: div.declareDate || null,
        amount: div.distribution || 0,
        frequency: div.distributionFrequency || null,
        annualizedAmount,
      };
    });

    // Sort by ex-date descending (most recent first)
    dividends.sort((a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime());

    logger.debug('TiingoCorporateActions', `Fetched ${dividends.length} dividend records for ${ticker}`);
    return dividends;

  } catch (error) {
    logger.error('TiingoCorporateActions', `Error fetching dividends for ${ticker}: ${(error as Error).message}`);
    return [];
  }
}

/**
 * Get the most recent dividend with dates
 */
export async function getLatestDividendDates(ticker: string): Promise<DividendDates | null> {
  const dividends = await fetchDividendDates(ticker);
  return dividends.length > 0 ? dividends[0] : null;
}

/**
 * Get upcoming dividend (if payment date is in the future)
 */
export async function getUpcomingDividend(ticker: string): Promise<DividendDates | null> {
  const dividends = await fetchDividendDates(ticker);
  const today = new Date().toISOString().split('T')[0];
  
  // Find the first dividend where payment date is in the future
  const upcoming = dividends.find(div => 
    div.paymentDate && div.paymentDate >= today
  );
  
  return upcoming || null;
}

/**
 * Get annualized adjusted dividends for CV calculation
 * Based on the methodology: CV = (SD / Mean) * 100
 */
export async function getAnnualizedAdjustedDividends(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<{ series: number[]; cv: number | null; mean: number | null; stdDev: number | null }> {
  const dividends = await fetchDividendDates(ticker, startDate, endDate);
  
  // Filter to only include regular dividends with valid frequency
  const annualizedSeries = dividends
    .filter(div => div.annualizedAmount !== null && div.annualizedAmount > 0)
    .map(div => div.annualizedAmount as number);

  if (annualizedSeries.length < 2) {
    return { series: annualizedSeries, cv: null, mean: null, stdDev: null };
  }

  // Calculate mean
  const mean = annualizedSeries.reduce((sum, val) => sum + val, 0) / annualizedSeries.length;
  
  if (mean === 0) {
    return { series: annualizedSeries, cv: null, mean: 0, stdDev: null };
  }

  // Calculate sample standard deviation (ddof=1)
  const squaredDiffs = annualizedSeries.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / (annualizedSeries.length - 1);
  const stdDev = Math.sqrt(variance);

  // Calculate CV as percentage
  const cv = (stdDev / mean) * 100;

  return { series: annualizedSeries, cv, mean, stdDev };
}

/**
 * Health check for Tiingo Corporate Actions API
 */
export async function tiingoCorporateActionsHealthCheck(): Promise<boolean> {
  if (!config.tiingo.apiKey) {
    return false;
  }

  try {
    const dividends = await fetchDividendDates('AAPL');
    return dividends.length > 0;
  } catch {
    return false;
  }
}

// Legacy alias for backward compatibility
export const alphaVantageHealthCheck = tiingoCorporateActionsHealthCheck;
