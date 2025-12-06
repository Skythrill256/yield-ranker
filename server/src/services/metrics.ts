/**
 * Metrics Calculation Service
 * 
 * Implements financial calculations for ETF metrics including:
 * - Frequency-proof dividend SD/CV using rolling 365D annualized series
 * - Total Return WITH DRIP (using adjClose ratio)
 * - Price Return (using unadjusted close)
 * - Total Return WITHOUT DRIP (sum of dividends method)
 */

import {
  getETFStatic,
  getAllTickers,
  getPriceHistory,
  getLatestPrice,
  getDividendHistory,
} from './database.js';
import {
  fetchRealtimePrice,
  fetchRealtimePricesBatch,
} from './tiingo.js';
import {
  getDateDaysAgo,
  getDateYearsAgo,
  formatDate,
  calculateReturn,
  calculateMean,
  calculateStdDev,
  normalize,
} from '../utils/index.js';
import { logger } from '../utils/index.js';
import type {
  ETFMetrics,
  ReturnData,
  ChartDataPoint,
  RankedETF,
  RankingWeights,
  ChartPeriod,
  PriceRecord,
  DividendRecord,
} from '../types/index.js';

// ============================================================================
// Frequency-Proof Dividend SD/CV Calculation
// Industry-standard approach used by Morningstar, Yahoo Finance, Seeking Alpha
// ============================================================================

interface DividendVolatilityResult {
  annualDividend: number | null;      // Current annualized dividend (rolling 365D sum)
  dividendSD: number | null;          // SD of the rolling 365D series
  dividendCV: number | null;          // CV as decimal (e.g., 0.18)
  dividendCVPercent: number | null;   // CV as percentage (e.g., 18.0%)
  volatilityIndex: string | null;     // Display label
  dataPoints: number;
}

/**
 * Detect payment frequency based on days between consecutive payments
 */
function detectFrequency(
  dividends: { date: Date; amount: number }[],
  index: number
): 'weekly' | 'monthly' | 'quarterly' | 'semi-annual' | 'annual' {
  if (index === 0 && dividends.length === 1) return 'quarterly';

  if (index < dividends.length - 1) {
    const daysBetween = (dividends[index + 1].date.getTime() - dividends[index].date.getTime()) / (1000 * 60 * 60 * 24);
    if (daysBetween <= 10) return 'weekly';
    if (daysBetween <= 35) return 'monthly';
    if (daysBetween <= 95) return 'quarterly';
    if (daysBetween <= 185) return 'semi-annual';
    return 'annual';
  }

  if (index > 0) {
    const daysBetween = (dividends[index].date.getTime() - dividends[index - 1].date.getTime()) / (1000 * 60 * 60 * 24);
    if (daysBetween <= 10) return 'weekly';
    if (daysBetween <= 35) return 'monthly';
    if (daysBetween <= 95) return 'quarterly';
    if (daysBetween <= 185) return 'semi-annual';
    return 'annual';
  }

  return 'quarterly';
}

/**
 * Get annualization factor based on payment frequency
 */
function getAnnualizationFactor(frequency: 'weekly' | 'monthly' | 'quarterly' | 'semi-annual' | 'annual'): number {
  switch (frequency) {
    case 'weekly': return 52;
    case 'monthly': return 12;
    case 'quarterly': return 4;
    case 'semi-annual': return 2;
    case 'annual': return 1;
    default: return 4;
  }
}

/**
 * Helper function to detect if a ticker is a weekly payer
 */
function isWeeklyPayerTicker(ticker: string): boolean {
  const weeklyTickers = ['TSLY', 'NVDY', 'MSTY', 'CONY', 'GOOY', 'AMZY', 'APLY', 'QQQY', 'IWMY', 'QDTE', 'XDTE', 'SDTY', 'QDTY', 'RDTY', 'YMAX', 'YMAG', 'ULTY', 'LFGY', 'YETH', 'RDTE', 'PLTW', 'TSLW', 'HOOW', 'GOOW', 'METW', 'AMZW', 'AMDW', 'AVGW', 'MSTW', 'NFLW', 'COIW', 'WPAY', 'XBTY', 'YBIT', 'HOOY', 'CVNY', 'PLTY', 'NVYY', 'CHPY', 'GPTY', 'MAGY', 'TQQY', 'TSYY', 'YSPY', 'AZYY', 'PLYY', 'AMYY', 'COYY', 'TSII', 'NVII', 'HOII', 'COII', 'PLTI', 'BRKW', 'MSFW'];
  return weeklyTickers.includes(ticker.toUpperCase()) || ticker.toUpperCase().endsWith('Y');
}

/**
 * Calculate dividend volatility using the exact professional rule:
 *
 * 1. Look back a maximum of 365 days from today.
 * 2. Collect all ACTUAL ex-date dividend payments within that 365-day window.
 * 3. If there are 12 or more payments in the last year → use exactly the most recent 12.
 * 4. If there are fewer than 12 payments in the last year → use ALL available payments in that year.
 * 5. Dividend Volatility (%) = (population standard deviation ÷ average) × 100
 * 6. Round to 1 decimal place.
 *
 * This matches the behaviour of professional sites (e.g., DividendsandTotalReturns.com).
 */
function calculateDividendVolatility(
  dividends: DividendRecord[],
  periodInMonths: 6 | 12 = 12,
  ticker?: string
): DividendVolatilityResult {
  const nullResult: DividendVolatilityResult = {
    annualDividend: null,
    dividendSD: null,
    dividendCV: null,
    dividendCVPercent: null,
    volatilityIndex: null,
    dataPoints: 0,
  };

  // 1. Filter to regular dividends only (exclude special dividends) and filter out zero/null amounts.
  //    Use ex-date dividends (ex_date field), not just announced ones.
  const regularDivs = dividends.filter(d => {
    // Must have ex_date (actual ex-date dividend)
    if (!d.ex_date) return false;

    const amount = d.adj_amount ?? d.div_cash;
    if (!amount || amount <= 0) return false; // Exclude zero/null amounts

    if (!d.div_type) return true; // null type = regular
    const dtype = d.div_type.toLowerCase();
    return (
      dtype.includes('regular') ||
      dtype === 'cash' ||
      dtype === '' ||
      !dtype.includes('special')
    );
  });

  // Need at least 2 payments to calculate any volatility
  if (regularDivs.length < 2) return nullResult;

  // 2. Sort by ex_date ascending (oldest first)
  const sortedAsc = [...regularDivs].sort(
    (a, b) => new Date(a.ex_date).getTime() - new Date(b.ex_date).getTime()
  );

  // 3. Restrict to dividends within the last 365 days
  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - 365);

  const recentSeries = sortedAsc
    .map(d => ({
      date: new Date(d.ex_date),
      amount: d.adj_amount ?? d.div_cash ?? 0,
    }))
    .filter(d => d.amount > 0 && d.date >= oneYearAgo);

  // If no dividends in the last year, we can't calculate volatility
  if (recentSeries.length < 2) return nullResult;

  // Extract amounts from the last 365 days
  const recentAmounts = recentSeries.map(d => d.amount);
  const n = recentAmounts.length;

  // 4. Apply the 12-or-all rule within the last 365 days
  const finalAmounts =
    n >= 12 ? recentAmounts.slice(-12) : recentAmounts;

  // Need at least 2 data points to compute standard deviation
  if (finalAmounts.length < 2) return nullResult;

  // 5. Calculate the average of the selected dividends
  const average = calculateMean(finalAmounts);

  // 6. Calculate the POPULATION standard deviation of the same dividends
  //    (matches np.std with ddof=0)
  let varianceSum = 0;
  for (const val of finalAmounts) {
    const diff = val - average;
    varianceSum += diff * diff;
  }
  const variance = varianceSum / finalAmounts.length;
  const standardDeviation = Math.sqrt(variance);

  // Guard against invalid values
  if (
    average <= 0.0001 ||
    standardDeviation < 0 ||
    !isFinite(average) ||
    !isFinite(standardDeviation) ||
    isNaN(average) ||
    isNaN(standardDeviation)
  ) {
    return nullResult;
  }

  // 7. Dividend Volatility (%) = (standard deviation ÷ average) × 100
  const cvPercentRaw = (standardDeviation / average) * 100;

  // 8. Round to 1 decimal place
  const roundedCVPercent = Math.round(cvPercentRaw * 10) / 10;
  const roundedCV = roundedCVPercent / 100;

  // 9. Estimate annual dividend from the average of the selected payments
  //    Determine frequency from payment spacing within the same 365-day window
  let estimatedAnnualDividend: number | null = null;
  if (recentSeries.length >= 2) {
    let totalDays = 0;
    let dayCount = 0;

    for (let i = 0; i < recentSeries.length - 1; i++) {
      const days =
        (recentSeries[i + 1].date.getTime() - recentSeries[i].date.getTime()) /
        (1000 * 60 * 60 * 24);
      if (days > 0 && days < 400) {
        totalDays += days;
        dayCount++;
      }
    }

    if (dayCount > 0) {
      const avgDaysBetween = totalDays / dayCount;
      let paymentsPerYear: number;
      if (avgDaysBetween <= 10) paymentsPerYear = 52; // Weekly
      else if (avgDaysBetween <= 35) paymentsPerYear = 12; // Monthly
      else if (avgDaysBetween <= 95) paymentsPerYear = 4; // Quarterly
      else if (avgDaysBetween <= 185) paymentsPerYear = 2; // Semi-annual
      else paymentsPerYear = 1; // Annual

      estimatedAnnualDividend = average * paymentsPerYear;
    }
  }

  // 10. Generate volatility index label from the rounded CV%
  let volatilityIndex: string | null = null;
  if (roundedCVPercent !== null) {
    if (roundedCVPercent < 5) volatilityIndex = 'Very Low';
    else if (roundedCVPercent < 10) volatilityIndex = 'Low';
    else if (roundedCVPercent < 20) volatilityIndex = 'Moderate';
    else if (roundedCVPercent < 30) volatilityIndex = 'High';
    else volatilityIndex = 'Very High';
  }

  return {
    annualDividend: estimatedAnnualDividend,
    dividendSD: standardDeviation,
    dividendCV: roundedCV,
    dividendCVPercent: roundedCVPercent,
    volatilityIndex,
    dataPoints: finalAmounts.length,
  };
}

// ============================================================================
// Period Return Calculations
// ============================================================================

/**
 * Find the first available price on or after the start date
 * Returns null if no price exists within a reasonable window (30 days) after start date
 * Also validates that we have sufficient historical data for the requested period
 */
function findStartPrice(
  prices: PriceRecord[],
  startDate: string,
  requestedDays?: number
): PriceRecord | null {
  if (prices.length === 0) return null;

  // Prices are already sorted by date ascending
  // Find first price on or after start date
  const startPrice = prices.find(p => p.date >= startDate);

  if (startPrice) {
    // Validate that we have sufficient data for the requested period
    if (requestedDays !== undefined) {
      const startDateObj = new Date(startDate);
      const actualStartDateObj = new Date(startPrice.date);
      const daysDifference = Math.abs((actualStartDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));

      // If the first available price is more than 60 days after the requested start date,
      // or if we don't have at least 80% of the requested period's data, return null
      const maxAllowedGap = Math.min(60, Math.floor(requestedDays * 0.1)); // 10% of period or 60 days, whichever is less
      const minRequiredDays = Math.floor(requestedDays * 0.8); // Need at least 80% of requested period

      if (daysDifference > maxAllowedGap) {
        logger.debug('Metrics', `Insufficient data: first price is ${daysDifference} days after requested start date (max allowed: ${maxAllowedGap} days)`);
        return null;
      }

      // Check if we have enough data points for the requested period
      // This ensures we don't use short period data for longer period calculations
      const endDate = prices[prices.length - 1]?.date;
      if (endDate) {
        const actualPeriodDays = Math.abs((new Date(endDate).getTime() - actualStartDateObj.getTime()) / (1000 * 60 * 60 * 24));
        if (actualPeriodDays < minRequiredDays) {
          logger.debug('Metrics', `Insufficient data: only ${actualPeriodDays} days of data available (minimum required: ${minRequiredDays} days for ${requestedDays}-day period)`);
          return null;
        }

        // Additional check: ensure the actual period is at least 70% of requested period
        // This prevents using 3-month data for 6-month, 12-month, or 3-year calculations
        const periodRatio = actualPeriodDays / requestedDays;
        if (periodRatio < 0.7) {
          logger.debug('Metrics', `Insufficient period coverage: ${actualPeriodDays} days is only ${(periodRatio * 100).toFixed(1)}% of requested ${requestedDays} days`);
          return null;
        }
      }
    }

    return startPrice;
  }

  // If no price on/after start date, check if we have a price within 30 days
  // This handles cases where start date falls on a weekend/holiday
  const startDateObj = new Date(startDate);
  const maxDate = new Date(startDateObj);
  maxDate.setDate(maxDate.getDate() + 30);
  const maxDateStr = formatDate(maxDate);

  const nearStartPrice = prices.find(p => p.date >= startDate && p.date <= maxDateStr);

  if (nearStartPrice && requestedDays !== undefined) {
    // Validate data sufficiency for near price too
    const actualStartDateObj = new Date(nearStartPrice.date);
    const daysDifference = Math.abs((actualStartDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
    const maxAllowedGap = Math.min(60, Math.floor(requestedDays * 0.1));

    if (daysDifference > maxAllowedGap) {
      return null;
    }
  }

  return nearStartPrice || null;
}

/**
 * Find the last available price on or before the end date
 * Returns null if no price exists within a reasonable window (30 days) before end date
 */
function findEndPrice(prices: PriceRecord[], endDate: string): PriceRecord | null {
  if (prices.length === 0) return null;

  // Prices are already sorted by date ascending
  // Filter to prices on or before end date, then get the last one
  const validPrices = prices.filter(p => p.date <= endDate);

  if (validPrices.length > 0) {
    return validPrices[validPrices.length - 1];
  }

  // If no price on/before end date, check if we have a price within 30 days before
  // This handles cases where end date falls on a weekend/holiday
  const endDateObj = new Date(endDate);
  const minDate = new Date(endDateObj);
  minDate.setDate(minDate.getDate() - 30);
  const minDateStr = formatDate(minDate);

  const nearEndPrice = prices.filter(p => p.date >= minDateStr && p.date <= endDate).pop();
  return nearEndPrice || null;
}

/**
 * Calculate Total Return WITH DRIP using adjusted close prices.
 * Formula: TR_with_DRIP = (P_adj_end / P_adj_start) - 1
 * Uses the first available price on/after startDate and last available price on/before endDate
 */
function calculateTotalReturnDrip(
  prices: PriceRecord[],
  startDate: string,
  endDate: string,
  requestedDays?: number
): number | null {
  if (prices.length < 2) return null;

  const startRecord = findStartPrice(prices, startDate, requestedDays);
  const endRecord = findEndPrice(prices, endDate);

  if (!startRecord || !endRecord) return null;

  const startPrice = startRecord.adj_close;
  const endPrice = endRecord.adj_close;

  if (!startPrice || !endPrice || startPrice <= 0 || endPrice <= 0) return null;

  // Ensure we're not dividing by zero and dates are valid
  if (startRecord.date > endRecord.date) return null;

  // Calculate return
  const returnValue = ((endPrice / startPrice) - 1) * 100;

  // Sanity check: returns should be reasonable (between -99% and 10000%)
  // This catches calculation errors or data issues
  if (returnValue < -99 || returnValue > 10000 || !isFinite(returnValue)) {
    logger.warn('Metrics', `Unreasonable total return calculated: ${returnValue}% (start: ${startPrice}, end: ${endPrice}, dates: ${startRecord.date} to ${endRecord.date})`);
    return null;
  }

  return returnValue;
}

/**
 * Calculate Price Return using unadjusted close prices.
 * Formula: PriceReturn = (P_close_end / P_close_start) - 1
 * Uses the first available price on/after startDate and last available price on/before endDate
 */
function calculatePriceReturn(
  prices: PriceRecord[],
  startDate: string,
  endDate: string,
  requestedDays?: number
): number | null {
  if (prices.length < 2) return null;

  const startRecord = findStartPrice(prices, startDate, requestedDays);
  const endRecord = findEndPrice(prices, endDate);

  if (!startRecord || !endRecord) return null;

  const startPrice = startRecord.close;
  const endPrice = endRecord.close;

  if (!startPrice || !endPrice || startPrice <= 0 || endPrice <= 0) return null;

  // Ensure we're not dividing by zero and dates are valid
  if (startRecord.date > endRecord.date) return null;

  // Calculate return
  const returnValue = ((endPrice / startPrice) - 1) * 100;

  // Sanity check: returns should be reasonable (between -99% and 10000%)
  if (returnValue < -99 || returnValue > 10000 || !isFinite(returnValue)) {
    logger.warn('Metrics', `Unreasonable price return calculated: ${returnValue}% (start: ${startPrice}, end: ${endPrice}, dates: ${startRecord.date} to ${endRecord.date})`);
    return null;
  }

  return returnValue;
}

/**
 * Calculate Total Return WITHOUT DRIP (dividends not reinvested).
 * Formula: TR_without_DRIP = ((P_close_end - P_close_start) + TotalDividends) / P_close_start
 * Uses the first available price on/after startDate and last available price on/before endDate
 */
function calculateTotalReturnNoDrip(
  prices: PriceRecord[],
  dividends: DividendRecord[],
  startDate: string,
  endDate: string,
  requestedDays?: number
): number | null {
  if (prices.length < 2) return null;

  const startRecord = findStartPrice(prices, startDate, requestedDays);
  const endRecord = findEndPrice(prices, endDate);

  if (!startRecord || !endRecord) return null;

  const startPrice = startRecord.close;
  const endPrice = endRecord.close;

  if (!startPrice || !endPrice || startPrice <= 0 || endPrice <= 0) return null;

  // Ensure dates are valid
  if (startRecord.date > endRecord.date) return null;

  // Sum dividends paid between start and end dates (inclusive)
  const totalDividends = dividends
    .filter(d => d.ex_date >= startDate && d.ex_date <= endDate)
    .reduce((sum, d) => sum + (d.div_cash || 0), 0);

  // Calculate return
  const returnValue = (((endPrice - startPrice) + totalDividends) / startPrice) * 100;

  // Sanity check: returns should be reasonable (between -99% and 10000%)
  if (returnValue < -99 || returnValue > 10000 || !isFinite(returnValue)) {
    logger.warn('Metrics', `Unreasonable total return (no DRIP) calculated: ${returnValue}% (start: ${startPrice}, end: ${endPrice}, dividends: ${totalDividends}, dates: ${startRecord.date} to ${endRecord.date})`);
    return null;
  }

  return returnValue;
}

interface FullReturnData {
  priceDrip: number | null;    // Total return with DRIP
  priceReturn: number | null;  // Price return (non-DRIP)
  priceNoDrip: number | null;  // Total return without DRIP
}

/**
 * Get the proper start date for a period using calendar-based calculation.
 * This matches how financial sites calculate returns (e.g., 1Y = exactly 1 year ago).
 */
function getPeriodStartDate(period: '1W' | '1M' | '3M' | '6M' | '1Y' | '3Y'): string {
  const now = new Date();

  switch (period) {
    case '1W':
      // 1 week = 7 calendar days ago
      now.setDate(now.getDate() - 7);
      break;
    case '1M':
      // 1 month ago (same date)
      now.setMonth(now.getMonth() - 1);
      break;
    case '3M':
      // 3 months ago
      now.setMonth(now.getMonth() - 3);
      break;
    case '6M':
      // 6 months ago
      now.setMonth(now.getMonth() - 6);
      break;
    case '1Y':
      // 1 year ago (exactly)
      now.setFullYear(now.getFullYear() - 1);
      break;
    case '3Y':
      // 3 years ago
      now.setFullYear(now.getFullYear() - 3);
      break;
  }

  return formatDate(now);
}

/**
 * Calculate returns for a specific period using calendar-based dates.
 * 
 * Key improvements:
 * 1. Uses calendar-based periods (1Y = 1 year ago, not 365 days)
 * 2. End date is the most recent available trading day in the database
 * 3. Start date finds the nearest trading day to the target period start
 */
async function calculateReturnsForPeriod(
  ticker: string,
  period: '1W' | '1M' | '3M' | '6M' | '1Y' | '3Y',
  dividends: DividendRecord[]
): Promise<FullReturnData> {
  // Get the most recent price to determine actual end date
  const latestPrices = await getLatestPrice(ticker, 1);
  if (latestPrices.length === 0) {
    return { priceDrip: null, priceReturn: null, priceNoDrip: null };
  }

  // Use the actual latest trading day as end date (not today if it's a weekend)
  const endDate = latestPrices[latestPrices.length - 1].date;

  // Calculate start date based on the end date (not today)
  // This ensures we're measuring exactly 1 year, 6 months, etc. from the last trading day
  const endDateObj = new Date(endDate);
  let startDateObj = new Date(endDate);

  switch (period) {
    case '1W':
      startDateObj.setDate(endDateObj.getDate() - 7);
      break;
    case '1M':
      startDateObj.setMonth(endDateObj.getMonth() - 1);
      break;
    case '3M':
      startDateObj.setMonth(endDateObj.getMonth() - 3);
      break;
    case '6M':
      startDateObj.setMonth(endDateObj.getMonth() - 6);
      break;
    case '1Y':
      startDateObj.setFullYear(endDateObj.getFullYear() - 1);
      break;
    case '3Y':
      startDateObj.setFullYear(endDateObj.getFullYear() - 3);
      break;
  }

  const startDate = formatDate(startDateObj);

  // Fetch prices with a buffer to ensure we find the nearest trading day
  // Buffer: 10 trading days (~2 weeks) before the target start date
  const bufferDate = new Date(startDateObj);
  bufferDate.setDate(bufferDate.getDate() - 14);
  const fetchStartDate = formatDate(bufferDate);

  const prices = await getPriceHistory(ticker, fetchStartDate, endDate);

  if (prices.length < 2) {
    return { priceDrip: null, priceReturn: null, priceNoDrip: null };
  }

  // Convert period to approximate days for validation
  const periodDaysMap: Record<string, number> = {
    '1W': 7,
    '1M': 30,
    '3M': 90,
    '6M': 180,
    '1Y': 365,
    '3Y': 1095,
  };
  const requestedDays = periodDaysMap[period];

  return {
    priceDrip: calculateTotalReturnDrip(prices, startDate, endDate, requestedDays),
    priceReturn: calculatePriceReturn(prices, startDate, endDate, requestedDays),
    priceNoDrip: calculateTotalReturnNoDrip(prices, dividends, startDate, endDate, requestedDays),
  };
}

// ============================================================================
// Main Metrics Calculation
// ============================================================================

export async function calculateMetrics(ticker: string): Promise<ETFMetrics> {
  const upperTicker = ticker.toUpperCase();

  // Get static data
  const staticData = await getETFStatic(upperTicker);
  const paymentsPerYear = staticData?.payments_per_year ?? 12;

  // Get recent prices
  const recentPrices = await getLatestPrice(upperTicker, 2);

  let currentPrice: number | null = null;
  let previousClose: number | null = null;
  let priceChange: number | null = null;
  let priceChangePercent: number | null = null;

  if (recentPrices.length >= 1) {
    currentPrice = recentPrices[recentPrices.length - 1].close;

    if (recentPrices.length >= 2 && currentPrice) {
      previousClose = recentPrices[recentPrices.length - 2].close;
      if (previousClose) {
        priceChange = currentPrice - previousClose;
        priceChangePercent = calculateReturn(currentPrice, previousClose);
      }
    }
  }

  // Get 52-week range
  const yearPrices = await getPriceHistory(upperTicker, getDateYearsAgo(1));
  const closes = yearPrices
    .map(p => p.close)
    .filter((c): c is number => c !== null && c > 0);

  const week52High = closes.length > 0 ? Math.max(...closes) : null;
  const week52Low = closes.length > 0 ? Math.min(...closes) : null;

  // Get dividend data directly from FMP API
  // Get more history (up to 2 years) to ensure we have enough data for DVI calculation
  const twoYearsAgo = getDateYearsAgo(2);
  let dividends = await getDividendHistory(upperTicker, twoYearsAgo);

  // Calculate frequency-proof dividend volatility using 12-month period
  // Pass ticker for accurate weekly payer detection
  const volMetrics = calculateDividendVolatility(dividends, 12, upperTicker);

  // Get regular dividends for last dividend and payment count
  const regularDivs = dividends.filter(d => {
    if (!d.div_type) return true;
    const dtype = d.div_type.toLowerCase();
    return dtype.includes('regular') || dtype === 'cash' || dtype === '' || !dtype.includes('special');
  });

  // Sort by date descending to get most recent
  const sortedRegular = [...regularDivs].sort(
    (a, b) => new Date(b.ex_date).getTime() - new Date(a.ex_date).getTime()
  );

  let lastDividend: number | null = null;
  if (sortedRegular.length > 0) {
    lastDividend = sortedRegular[0].adj_amount ?? sortedRegular[0].div_cash;
  }

  // Determine actual payments per year based on CURRENT payment frequency
  // For ETFs that change frequency (e.g., MSTY from monthly to weekly), we need to detect
  // the current frequency from the most recent payments, not count all payments in the year
  let actualPaymentsPerYear: number;

  if (sortedRegular.length >= 2) {
    // Detect current frequency from most recent payments
    const mostRecent = sortedRegular[0];
    const secondMostRecent = sortedRegular[1];
    const daysBetween = (new Date(mostRecent.ex_date).getTime() - new Date(secondMostRecent.ex_date).getTime()) / (1000 * 60 * 60 * 24);

    // Determine frequency based on days between most recent payments
    if (daysBetween <= 10) {
      actualPaymentsPerYear = 52; // Weekly
    } else if (daysBetween <= 35) {
      actualPaymentsPerYear = 12; // Monthly
    } else if (daysBetween <= 95) {
      actualPaymentsPerYear = 4; // Quarterly
    } else if (daysBetween <= 185) {
      actualPaymentsPerYear = 2; // Semi-Annual
    } else {
      actualPaymentsPerYear = 1; // Annual
    }
  } else if (paymentsPerYear > 0) {
    // Use database value if we don't have enough recent data
    actualPaymentsPerYear = paymentsPerYear;
  } else {
    // Fallback to monthly if no data available
    actualPaymentsPerYear = 12;
  }

  // Calculate annual dividend: Div × #Pmt
  // Use the database payments_per_year value, not the detected frequency
  // Formula: Annual Div = Dividend per payment × Number of payments per year
  let annualizedDividend: number | null = null;
  if (lastDividend && lastDividend > 0 && paymentsPerYear > 0) {
    annualizedDividend = lastDividend * paymentsPerYear;
  }

  // Calculate forward yield
  let forwardYield: number | null = null;
  if (currentPrice && currentPrice > 0 && annualizedDividend) {
    forwardYield = (annualizedDividend / currentPrice) * 100;
  }

  // Calculate returns for all periods using calendar-based dates
  const [ret1W, ret1M, ret3M, ret6M, ret1Y, ret3Y] = await Promise.all([
    calculateReturnsForPeriod(upperTicker, '1W', dividends),
    calculateReturnsForPeriod(upperTicker, '1M', dividends),
    calculateReturnsForPeriod(upperTicker, '3M', dividends),
    calculateReturnsForPeriod(upperTicker, '6M', dividends),
    calculateReturnsForPeriod(upperTicker, '1Y', dividends),
    calculateReturnsForPeriod(upperTicker, '3Y', dividends),
  ]);

  return {
    ticker: upperTicker,
    name: staticData?.description ?? null,
    issuer: staticData?.issuer ?? null,
    ipoPrice: staticData?.ipo_price ?? null,
    payDay: staticData?.pay_day_text ?? null,
    currentPrice,
    previousClose,
    priceChange,
    priceChangePercent,
    week52High,
    week52Low,

    // Dividend data
    lastDividend,
    annualizedDividend,
    paymentsPerYear: actualPaymentsPerYear,
    forwardYield,

    // Volatility metrics (frequency-proof)
    dividendSD: volMetrics.dividendSD,
    dividendCV: volMetrics.dividendCV,
    dividendCVPercent: volMetrics.dividendCVPercent,
    dividendVolatilityIndex: volMetrics.volatilityIndex,

    // Weighted ranking (calculated separately)
    weightedRank: null,

    // Total Return WITH DRIP
    totalReturnDrip: {
      '1W': ret1W.priceDrip,
      '1M': ret1M.priceDrip,
      '3M': ret3M.priceDrip,
      '6M': ret6M.priceDrip,
      '1Y': ret1Y.priceDrip,
      '3Y': ret3Y.priceDrip,
    },

    // Price Return
    priceReturn: {
      '1W': ret1W.priceReturn,
      '1M': ret1M.priceReturn,
      '3M': ret3M.priceReturn,
      '6M': ret6M.priceReturn,
      '1Y': ret1Y.priceReturn,
      '3Y': ret3Y.priceReturn,
    },

    // Total Return WITHOUT DRIP
    totalReturnNoDrip: {
      '1W': ret1W.priceNoDrip,
      '1M': ret1M.priceNoDrip,
      '3M': ret3M.priceNoDrip,
      '6M': ret6M.priceNoDrip,
      '1Y': ret1Y.priceNoDrip,
      '3Y': ret3Y.priceNoDrip,
    },

    // Legacy combined returns for backward compatibility
    returns: {
      '1W': { price: ret1W.priceReturn, total: ret1W.priceDrip },
      '1M': { price: ret1M.priceReturn, total: ret1M.priceDrip },
      '3M': { price: ret3M.priceReturn, total: ret3M.priceDrip },
      '6M': { price: ret6M.priceReturn, total: ret6M.priceDrip },
      '1Y': { price: ret1Y.priceReturn, total: ret1Y.priceDrip },
      '3Y': { price: ret3Y.priceReturn, total: ret3Y.priceDrip },
    },

    calculatedAt: new Date().toISOString(),
    dataSource: 'Tiingo',
  };
}

// ============================================================================
// Chart Data Generation
// ============================================================================

export async function getChartData(
  ticker: string,
  period: ChartPeriod
): Promise<ChartDataPoint[]> {
  const startDate = periodToStartDate(period);
  const prices = await getPriceHistory(ticker, startDate);

  if (prices.length === 0) return [];

  const firstClose = prices[0].close ?? 0;
  const firstAdjClose = prices[0].adj_close ?? 0;

  return prices.map(p => ({
    date: p.date,
    timestamp: new Date(p.date).getTime() / 1000,
    open: p.open ?? 0,
    high: p.high ?? 0,
    low: p.low ?? 0,
    close: p.close ?? 0,
    adjClose: p.adj_close ?? 0,
    volume: p.volume ?? 0,
    divCash: p.div_cash ?? 0,
    priceReturn: firstClose > 0 ? (((p.close ?? 0) - firstClose) / firstClose) * 100 : 0,
    totalReturn: firstAdjClose > 0 ? (((p.adj_close ?? 0) - firstAdjClose) / firstAdjClose) * 100 : 0,
  }));
}

function periodToStartDate(period: ChartPeriod): string {
  switch (period) {
    case '1W': return getDateDaysAgo(7);
    case '1M': return getDateDaysAgo(30);
    case '3M': return getDateDaysAgo(90);
    case '6M': return getDateDaysAgo(180);
    case '1Y': return getDateYearsAgo(1);
    case '3Y': return getDateYearsAgo(3);
    case '5Y': return getDateYearsAgo(5);
    case 'MAX': return '2000-01-01';
    default: return getDateYearsAgo(1);
  }
}

// ============================================================================
// Ranking Algorithm
// ============================================================================

export async function calculateRankings(
  weights: RankingWeights = { yield: 34, totalReturn: 33, volatility: 33 }
): Promise<RankedETF[]> {
  const tickers = await getAllTickers();

  // Calculate metrics for all tickers
  const metricsPromises = tickers.map(async (ticker) => {
    try {
      const metrics = await calculateMetrics(ticker);
      return {
        ticker,
        yield: metrics.forwardYield,
        totalReturn: metrics.totalReturnDrip['1Y'],
        volatility: metrics.dividendCVPercent,  // Using CV% for volatility ranking
      };
    } catch {
      return { ticker, yield: null, totalReturn: null, volatility: null };
    }
  });

  const allMetrics = await Promise.all(metricsPromises);

  // Filter out tickers with no data
  const validMetrics = allMetrics.filter(
    m => m.yield !== null || m.totalReturn !== null
  );

  // Calculate min/max for normalization
  const yields = validMetrics.map(m => m.yield).filter((v): v is number => v !== null);
  const returns = validMetrics.map(m => m.totalReturn).filter((v): v is number => v !== null);
  const vols = validMetrics.map(m => m.volatility).filter((v): v is number => v !== null);

  const minYield = yields.length ? Math.min(...yields) : 0;
  const maxYield = yields.length ? Math.max(...yields) : 1;
  const minReturn = returns.length ? Math.min(...returns) : 0;
  const maxReturn = returns.length ? Math.max(...returns) : 1;
  const minVol = vols.length ? Math.min(...vols) : 0;
  const maxVol = vols.length ? Math.max(...vols) : 1;

  // Calculate composite scores
  const totalWeight = weights.yield + weights.totalReturn + weights.volatility;

  const ranked = validMetrics.map(m => {
    const normYield = m.yield !== null
      ? normalize(m.yield, minYield, maxYield)
      : 0.5;

    const normReturn = m.totalReturn !== null
      ? normalize(m.totalReturn, minReturn, maxReturn)
      : 0.5;

    // Invert volatility (lower is better)
    const normVol = m.volatility !== null
      ? normalize(m.volatility, minVol, maxVol, true)
      : 0.5;

    const score = (
      normYield * weights.yield +
      normReturn * weights.totalReturn +
      normVol * weights.volatility
    ) / totalWeight;

    return {
      ticker: m.ticker,
      yield: m.yield,
      totalReturn: m.totalReturn,
      volatility: m.volatility,
      normalizedScores: {
        yield: normYield,
        totalReturn: normReturn,
        volatility: normVol,
      },
      compositeScore: score,
      rank: 0,
    };
  });

  // Sort by score and assign ranks
  ranked.sort((a, b) => b.compositeScore - a.compositeScore);
  ranked.forEach((r, i) => { r.rank = i + 1; });

  return ranked;
}

// ============================================================================
// Realtime Returns Calculation
// ============================================================================

interface RealtimeReturnData {
  priceReturn: number | null;
  totalReturnDrip: number | null;
  currentPrice: number;
  prevClose: number;
  priceChange: number;
  priceChangePercent: number;
  isRealtime: boolean;
  timestamp: string;
}

interface RealtimeReturns {
  ticker: string;
  currentPrice: number;
  prevClose: number;
  priceChange: number;
  priceChangePercent: number;
  isRealtime: boolean;
  timestamp: string;
  priceReturn: {
    '1W': number | null;
    '1M': number | null;
    '3M': number | null;
    '6M': number | null;
    '1Y': number | null;
    '3Y': number | null;
  };
  totalReturnDrip: {
    '1W': number | null;
    '1M': number | null;
    '3M': number | null;
    '6M': number | null;
    '1Y': number | null;
    '3Y': number | null;
  };
}

/**
 * Calculate realtime returns using current IEX price as the end price.
 * This gives more accurate returns during market hours.
 */
async function calculateRealtimeReturnForPeriod(
  ticker: string,
  period: '1W' | '1M' | '3M' | '6M' | '1Y' | '3Y',
  currentPrice: number,
  currentAdjPrice: number | null
): Promise<{ priceReturn: number | null; totalReturnDrip: number | null }> {
  // Calculate start date based on today (not the last trading day)
  const today = new Date();
  let startDateObj = new Date(today);

  switch (period) {
    case '1W':
      startDateObj.setDate(today.getDate() - 7);
      break;
    case '1M':
      startDateObj.setMonth(today.getMonth() - 1);
      break;
    case '3M':
      startDateObj.setMonth(today.getMonth() - 3);
      break;
    case '6M':
      startDateObj.setMonth(today.getMonth() - 6);
      break;
    case '1Y':
      startDateObj.setFullYear(today.getFullYear() - 1);
      break;
    case '3Y':
      startDateObj.setFullYear(today.getFullYear() - 3);
      break;
  }

  const startDate = formatDate(startDateObj);

  // Fetch historical price with buffer
  const bufferDate = new Date(startDateObj);
  bufferDate.setDate(bufferDate.getDate() - 14);
  const fetchStartDate = formatDate(bufferDate);

  const prices = await getPriceHistory(ticker, fetchStartDate, formatDate(today));

  if (prices.length === 0) {
    return { priceReturn: null, totalReturnDrip: null };
  }

  // Find the start price (first price on or after startDate)
  const startRecord = findStartPrice(prices, startDate);

  if (!startRecord) {
    return { priceReturn: null, totalReturnDrip: null };
  }

  // Calculate Price Return: (current - start) / start * 100
  let priceReturn: number | null = null;
  if (startRecord.close && startRecord.close > 0) {
    priceReturn = ((currentPrice / startRecord.close) - 1) * 100;
    if (priceReturn < -99 || priceReturn > 10000 || !isFinite(priceReturn)) {
      priceReturn = null;
    }
  }

  // Calculate Total Return DRIP: (current_adj / start_adj) - 1 * 100
  // For realtime, we approximate adj_close by using the ratio from the last known day
  let totalReturnDrip: number | null = null;
  if (startRecord.adj_close && startRecord.adj_close > 0 && currentAdjPrice && currentAdjPrice > 0) {
    totalReturnDrip = ((currentAdjPrice / startRecord.adj_close) - 1) * 100;
    if (totalReturnDrip < -99 || totalReturnDrip > 10000 || !isFinite(totalReturnDrip)) {
      totalReturnDrip = null;
    }
  }

  return { priceReturn, totalReturnDrip };
}

/**
 * Calculate realtime returns for a single ticker.
 * Uses current IEX price for accurate intraday returns.
 */
export async function calculateRealtimeReturns(ticker: string): Promise<RealtimeReturns | null> {
  const upperTicker = ticker.toUpperCase();

  // Get realtime price from IEX
  const realtimeData = await fetchRealtimePrice(upperTicker);

  if (!realtimeData) {
    logger.warn('Metrics', `No realtime price available for ${upperTicker}`);
    return null;
  }

  const { price: currentPrice, prevClose, timestamp, isRealtime } = realtimeData;

  // Calculate price change
  const priceChange = prevClose > 0 ? currentPrice - prevClose : 0;
  const priceChangePercent = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

  // Get the latest stored prices to calculate adj_close ratio
  const latestPrices = await getLatestPrice(upperTicker, 1);
  let adjCloseRatio = 1;

  if (latestPrices.length > 0) {
    const lastPrice = latestPrices[0];
    if (lastPrice.close && lastPrice.adj_close && lastPrice.close > 0) {
      adjCloseRatio = lastPrice.adj_close / lastPrice.close;
    }
  }

  // Approximate current adjusted price
  const currentAdjPrice = currentPrice * adjCloseRatio;

  // Calculate returns for all periods
  const [ret1W, ret1M, ret3M, ret6M, ret1Y, ret3Y] = await Promise.all([
    calculateRealtimeReturnForPeriod(upperTicker, '1W', currentPrice, currentAdjPrice),
    calculateRealtimeReturnForPeriod(upperTicker, '1M', currentPrice, currentAdjPrice),
    calculateRealtimeReturnForPeriod(upperTicker, '3M', currentPrice, currentAdjPrice),
    calculateRealtimeReturnForPeriod(upperTicker, '6M', currentPrice, currentAdjPrice),
    calculateRealtimeReturnForPeriod(upperTicker, '1Y', currentPrice, currentAdjPrice),
    calculateRealtimeReturnForPeriod(upperTicker, '3Y', currentPrice, currentAdjPrice),
  ]);

  return {
    ticker: upperTicker,
    currentPrice,
    prevClose,
    priceChange,
    priceChangePercent,
    isRealtime,
    timestamp,
    priceReturn: {
      '1W': ret1W.priceReturn,
      '1M': ret1M.priceReturn,
      '3M': ret3M.priceReturn,
      '6M': ret6M.priceReturn,
      '1Y': ret1Y.priceReturn,
      '3Y': ret3Y.priceReturn,
    },
    totalReturnDrip: {
      '1W': ret1W.totalReturnDrip,
      '1M': ret1M.totalReturnDrip,
      '3M': ret3M.totalReturnDrip,
      '6M': ret6M.totalReturnDrip,
      '1Y': ret1Y.totalReturnDrip,
      '3Y': ret3Y.totalReturnDrip,
    },
  };
}

/**
 * Calculate realtime returns for multiple tickers in batch.
 * Uses batch IEX fetch for efficiency.
 */
export async function calculateRealtimeReturnsBatch(tickers: string[]): Promise<Map<string, RealtimeReturns>> {
  const results = new Map<string, RealtimeReturns>();

  if (tickers.length === 0) return results;

  // Batch fetch realtime prices
  const realtimePrices = await fetchRealtimePricesBatch(tickers);

  // Calculate returns for each ticker that has realtime data
  const promises = tickers.map(async (ticker) => {
    const upperTicker = ticker.toUpperCase();
    const realtimeData = realtimePrices.get(upperTicker);

    if (!realtimeData) return;

    const { price: currentPrice, prevClose, timestamp, isRealtime } = realtimeData;

    const priceChange = prevClose > 0 ? currentPrice - prevClose : 0;
    const priceChangePercent = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

    // Get the latest stored prices to calculate adj_close ratio
    const latestPrices = await getLatestPrice(upperTicker, 1);
    let adjCloseRatio = 1;

    if (latestPrices.length > 0) {
      const lastPrice = latestPrices[0];
      if (lastPrice.close && lastPrice.adj_close && lastPrice.close > 0) {
        adjCloseRatio = lastPrice.adj_close / lastPrice.close;
      }
    }

    const currentAdjPrice = currentPrice * adjCloseRatio;

    const [ret1W, ret1M, ret3M, ret6M, ret1Y, ret3Y] = await Promise.all([
      calculateRealtimeReturnForPeriod(upperTicker, '1W', currentPrice, currentAdjPrice),
      calculateRealtimeReturnForPeriod(upperTicker, '1M', currentPrice, currentAdjPrice),
      calculateRealtimeReturnForPeriod(upperTicker, '3M', currentPrice, currentAdjPrice),
      calculateRealtimeReturnForPeriod(upperTicker, '6M', currentPrice, currentAdjPrice),
      calculateRealtimeReturnForPeriod(upperTicker, '1Y', currentPrice, currentAdjPrice),
      calculateRealtimeReturnForPeriod(upperTicker, '3Y', currentPrice, currentAdjPrice),
    ]);

    results.set(upperTicker, {
      ticker: upperTicker,
      currentPrice,
      prevClose,
      priceChange,
      priceChangePercent,
      isRealtime,
      timestamp,
      priceReturn: {
        '1W': ret1W.priceReturn,
        '1M': ret1M.priceReturn,
        '3M': ret3M.priceReturn,
        '6M': ret6M.priceReturn,
        '1Y': ret1Y.priceReturn,
        '3Y': ret3Y.priceReturn,
      },
      totalReturnDrip: {
        '1W': ret1W.totalReturnDrip,
        '1M': ret1M.totalReturnDrip,
        '3M': ret3M.totalReturnDrip,
        '6M': ret6M.totalReturnDrip,
        '1Y': ret1Y.totalReturnDrip,
        '3Y': ret3Y.totalReturnDrip,
      },
    });
  });

  await Promise.all(promises);

  return results;
}
