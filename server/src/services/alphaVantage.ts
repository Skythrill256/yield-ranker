/**
 * FMP Corporate Actions API Service
 * 
 * Fetches dividend record and payment dates from FMP API
 * Replaces the previous Tiingo Corporate Actions implementation.
 */

import config from '../config/index.js';
import { logger, sleep } from '../utils/index.js';

// ============================================================================
// Types
// ============================================================================

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
  'quarterly': 4,
  'sa': 2,    // Semi-annually
  'semiannual': 2,
  'a': 1,     // Annually
  'annual': 1,
  'm': 12,    // Monthly
  'monthly': 12,
  'w': 52,    // Weekly
  'weekly': 52,
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
  const minDelay = config.fmp.rateLimit.minDelayMs;

  if (timeSinceLastRequest < minDelay) {
    const waitTime = minDelay - timeSinceLastRequest;
    logger.debug('FMPCorporateActions', `Rate limiting: waiting ${waitTime}ms`);
    await sleep(waitTime);
  }

  lastRequestTime = Date.now();
}

// ============================================================================
// API Methods
// ============================================================================

/**
 * Get annualization factor from frequency string
 */
function getAnnualizationFactor(frequency: string | null): number {
  if (!frequency) return 0;
  const normalizedFreq = frequency.toLowerCase().trim();
  return FREQUENCY_MAP[normalizedFreq] ?? 0;
}

/**
 * Estimate frequency from dividend interval in days
 */
function estimateFrequency(daysBetween: number): string {
  if (daysBetween <= 10) return 'weekly';
  if (daysBetween <= 35) return 'monthly';
  if (daysBetween <= 95) return 'quarterly';
  if (daysBetween <= 185) return 'semiannual';
  return 'annual';
}

/**
 * Fetch dividend history with record and payment dates from FMP Dividends API
 */
export async function fetchDividendDates(
  ticker: string,
  startDate?: string,
  endDate?: string
): Promise<DividendDates[]> {
  if (!config.fmp.apiKey) {
    logger.warn('FMPCorporateActions', 'FMP API key not configured');
    return [];
  }

  await waitForRateLimit();

  // Build URL with API key
  const url = `${config.fmp.baseUrl}/stable/dividends?symbol=${ticker.toUpperCase()}&apikey=${config.fmp.apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      logger.debug('FMPCorporateActions', `No dividend data for ${ticker}`);
      return [];
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any[];

    if (!Array.isArray(data) || data.length === 0) {
      logger.debug('FMPCorporateActions', `No dividend data for ${ticker}`);
      return [];
    }

    // Filter by date range if provided
    let filteredData = data;
    if (startDate) {
      const startTime = new Date(startDate).getTime();
      filteredData = filteredData.filter(d => new Date(d.date).getTime() >= startTime);
    }
    if (endDate) {
      const endTime = new Date(endDate).getTime();
      filteredData = filteredData.filter(d => new Date(d.date).getTime() <= endTime);
    }

    // Sort by date descending first to estimate frequency
    filteredData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const dividends: DividendDates[] = filteredData.map((div, index) => {
      // Estimate frequency from adjacent dividend dates
      let frequency: string | null = null;
      if (index < filteredData.length - 1) {
        const currentDate = new Date(div.date);
        const nextDate = new Date(filteredData[index + 1].date);
        const daysBetween = (currentDate.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24);
        frequency = estimateFrequency(daysBetween);
      }

      const annualizationFactor = getAnnualizationFactor(frequency);
      const amount = div.dividend || div.adjDividend || 0;
      const annualizedAmount = annualizationFactor > 0
        ? amount * annualizationFactor
        : null;

      return {
        exDate: div.date,
        recordDate: div.recordDate || null,
        paymentDate: div.paymentDate || null,
        declarationDate: div.declarationDate || null,
        amount,
        frequency,
        annualizedAmount,
      };
    });

    logger.debug('FMPCorporateActions', `Fetched ${dividends.length} dividend records for ${ticker}`);
    return dividends;

  } catch (error) {
    logger.error('FMPCorporateActions', `Error fetching dividends for ${ticker}: ${(error as Error).message}`);
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
 * Health check for FMP Dividend API
 */
export async function fmpCorporateActionsHealthCheck(): Promise<boolean> {
  if (!config.fmp.apiKey) {
    return false;
  }

  try {
    const dividends = await fetchDividendDates('AAPL');
    return dividends.length > 0;
  } catch {
    return false;
  }
}

// Legacy aliases for backward compatibility
export const tiingoCorporateActionsHealthCheck = fmpCorporateActionsHealthCheck;
export const alphaVantageHealthCheck = fmpCorporateActionsHealthCheck;
