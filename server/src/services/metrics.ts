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
  // Detailed breakdown for verification
  calculationDetails?: {
    periodStart: string;
    periodEnd: string;
    rawPayments: Array<{ date: string; amount: number; frequency: number; annualized: number }>;
    mean: number;
    median: number;
    variance: number;
    standardDeviation: number;
  };
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
 * Calculate dividend volatility with frequency normalization:
 *
 * KEY PRINCIPLE: Annualize each payment FIRST, then calculate SD on annualized amounts (NOT raw payments)
 *
 * Process (per CEO specification):
 * 1. Define the dividend period: 365 days from today (fixed period, not rolling).
 * 2. List ALL adjusted dividends (adj_amount) in the period.
 * 3. Determine frequency of each dividend (PRIORITY: use frequency field from database/website, 
 *    fallback to interval-based detection): weekly=52, monthly=12, quarterly=4, etc.
 * 4. Multiply frequency × adjusted dividend = annualized dividend (for each payment).
 * 5. Use ALL annualized payments within the 365-day period (no "12-or-all" rule).
 * 6. Calculate SD for all annualized dividends in the period (SAMPLE SD, not Population).
 *    Formula: variance = Σ(x - mean)² / (n-1) [Sample SD, per CEO/Gemini recommendation]
 * 7. Calculate MEDIAN for all annualized dividends in the period.
 * 8. CV = SD / MEDIAN (NOT SD / Mean!)
 * 9. Round to 1 decimal place.
 *
 * This ensures frequency changes (e.g., monthly to weekly) don't artificially inflate volatility.
 * Example: $0.3 quarterly = $1.2 annual, $0.10 monthly = $1.20 annual
 * SD on raw [0.3, 0.10] = ~0.14 (wrong - inflated by frequency change)
 * SD on annualized [1.2, 1.20] = ~0 (correct - shows true stability)
 * CV = SD / MEDIAN (median is more robust to outliers than mean)
 *
 * Note: periodInMonths can be changed for different asset types (e.g., closed-end funds may use 6 months)
 */
export function calculateDividendVolatility(
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

  // 1. Filter to REGULAR dividends only (exclude specials) and filter out zero/null amounts.
  // CEO requirement: DVI and dividend stability should be based on the regular distribution stream.
  const regularDivs = dividends.filter(d => {
    if (!d.ex_date) return false;
    const exDateObj = new Date(d.ex_date);
    if (isNaN(exDateObj.getTime())) return false;
    const anyD = d as any;

    const pmtType = String(anyD?.pmt_type ?? '').trim();
    if (pmtType && pmtType.toLowerCase() === 'special') return false;

    const amount = d.adj_amount ?? (d as any).scaled_amount ?? d.div_cash;

    return isFinite(amount) && Number(amount) > 0;
  });

  // Need at least 2 payments to calculate any volatility
  if (regularDivs.length < 2) return nullResult;

  // 2. Sort by ex_date ascending (oldest first)
  const sortedAsc = [...regularDivs].sort(
    (a, b) => new Date(a.ex_date).getTime() - new Date(b.ex_date).getTime()
  );

  // 3. Restrict to dividends within the specified period (default: 12 months = 365 days)
  // IMPORTANT: Use fixed 365 days from today (not rolling, but consistent calculation)
  const periodDays = periodInMonths === 6 ? 180 : 365; // 6 months = 180 days, 12 months = 365 days
  const periodEndDate = new Date(); // Today (or most recent date)
  const periodStartDate = new Date(periodEndDate);
  periodStartDate.setDate(periodStartDate.getDate() - periodDays);

  const recentSeries = sortedAsc
    .map(d => {
      const exDateObj = new Date(d.ex_date);
      if (isNaN(exDateObj.getTime())) return null;
      const anyD = d as any;
      const pmtType = String(anyD?.pmt_type ?? '').trim().toLowerCase();
      const regularComponent = Number(anyD?.regular_component);

      // Use REGULAR run-rate amount. If this record is a combined “special” row, use regular_component.
      // Otherwise prefer adj_amount, then scaled_amount, then div_cash.
      const amountPerPayment =
        (pmtType === 'special' && isFinite(regularComponent) && regularComponent > 0)
          ? regularComponent
          : (d.adj_amount ?? anyD.scaled_amount ?? d.div_cash ?? 0);

      return {
        date: exDateObj,
        amount: Number(amountPerPayment), // per-payment amount (NOT annualized)
        frequency: d.frequency, // human label if present
        originalDiv: d, // keep full record for frequency_num, etc.
      };
    })
    .filter((d): d is { date: Date; amount: number; frequency: any; originalDiv: DividendRecord } => {
      if (!d) return false;
      return isFinite(d.amount) && d.amount > 0 && d.date >= periodStartDate && d.date <= periodEndDate;
    });

  // If no dividends in the period, we can't calculate volatility
  if (recentSeries.length < 2) return nullResult;

  // 4. Normalize each payment to annual equivalent based on frequency from database/website
  // IMPORTANT: Use frequency field from dividend history (as CEO bases on website)
  // If frequency field not available, fall back to interval-based detection
  // Annualize each payment FIRST, then calculate SD on annualized amounts
  const normalizedAnnualAmounts: number[] = [];
  
  // Helper function to get annualization factor (payments/year).
  // Priority:
  // 1) frequency_num from normalization (most reliable for both ETFs and CEFs)
  // 2) frequency string field
  // 3) interval-based detection (fallback)
  function getAnnualizationFactor(current: typeof recentSeries[0], index: number): number {
    const freqNum = Number((current.originalDiv as any)?.frequency_num);
    if (isFinite(freqNum) && freqNum > 0 && freqNum <= 52) {
      return freqNum;
    }

    // PRIORITY 2: Use frequency string from database/website
    if (current.frequency) {
      const freq = String(current.frequency).trim();
      const freqLower = freq.toLowerCase();
      
      // Handle numeric frequency values (52, 12, 4, etc.)
      const numericFreq = parseFloat(freq);
      if (!isNaN(numericFreq) && numericFreq > 0 && numericFreq <= 52) {
        return numericFreq;
      }
      
      // Handle string frequency values
      if (freqLower.includes('week') || freqLower === 'weekly' || freq === 'Week' || freq === 'Wk' || freq === 'W') {
        return 52;
      } else if (freqLower.includes('month') || freqLower === 'monthly' || freq === 'Mo' || freq === 'M' || freq === 'Monthly') {
        return 12;
      } else if (freqLower.includes('quarter') || freqLower === 'quarterly' || freq.includes('qtr') || freq === 'Qtr' || freq === 'Q' || freq === 'Quarterly') {
        return 4;
      } else if (freqLower.includes('semi') || freqLower.includes('semi-annual')) {
        return 2;
      } else if (freqLower.includes('annual') || freqLower === 'annual' || freqLower === 'yearly') {
        return 1;
      }
    }
    
    // PRIORITY 3: Fallback to interval-based detection if no frequency info
    // Check BOTH next and previous intervals, prefer the one indicating higher frequency (more frequent payments)
    let daysToNext: number | null = null;
    let daysFromPrev: number | null = null;
    
    if (index < recentSeries.length - 1) {
      // Check interval to next payment (more indicative of current payment's frequency)
      const next = recentSeries[index + 1];
      daysToNext = (next.date.getTime() - current.date.getTime()) / (1000 * 60 * 60 * 24);
    }
    
    if (index > 0) {
      // Check interval from previous payment
      const prev = recentSeries[index - 1];
      daysFromPrev = (current.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60 * 24);
    }
    
    // Prefer the interval that indicates higher frequency (shorter days = higher frequency)
    // Use the shorter interval (more frequent) to determine frequency
    let daysBetween: number | null = null;
    if (daysToNext !== null && daysFromPrev !== null) {
      // Use the shorter interval (indicates higher frequency)
      daysBetween = Math.min(daysToNext, daysFromPrev);
    } else if (daysToNext !== null) {
      daysBetween = daysToNext;
    } else if (daysFromPrev !== null) {
      daysBetween = daysFromPrev;
    }
    
    if (daysBetween !== null && daysBetween > 0 && daysBetween < 400) {
      if (daysBetween <= 10) return 52; // Weekly
      else if (daysBetween <= 35) return 12; // Monthly
      else if (daysBetween <= 95) return 4; // Quarterly
      else if (daysBetween <= 185) return 2; // Semi-annual
      else return 1; // Annual
    }
    
    // Final fallback: assume monthly
    return 12;
  }
  
  for (let i = 0; i < recentSeries.length; i++) {
    const current = recentSeries[i];
    const annualizationFactor = getAnnualizationFactor(current, i);
    normalizedAnnualAmounts.push(current.amount * annualizationFactor);
  }

  // 5. Use all normalized annual amounts for DVI calculation
  //    CRITICAL: Using normalized (annualized) amounts ensures frequency changes don't skew volatility
  //    All dividends are normalized to annual equivalents before calculating SD and CV
  //    This handles cases like monthly (4 payments) where excluding high/low would leave too few data points
  const finalNormalizedAmounts = normalizedAnnualAmounts;
  
  // Store raw payment details for detailed output
  const rawPaymentDetails = recentSeries.map((d, i) => {
    // Use frequency from database/website first, fallback to interval detection
    const frequency = getAnnualizationFactor(d, i);
    
    return {
      date: d.date.toISOString().split('T')[0],
      amount: d.amount,
      frequency,
      annualized: d.amount * frequency,
      frequencySource: d.frequency ? 'database' : 'interval-detected',
    };
  });

  // Need at least 2 data points to compute standard deviation
  if (finalNormalizedAmounts.length < 2) return nullResult;

  // 6. Calculate the SAMPLE standard deviation on the ANNUALIZED amounts
  //    This is the key: SD is calculated on annualized values, not raw payments
  //    Example: [1.2, 1.20] annualized → SD ≈ 0 (correct, shows stability)
  //    vs [0.3, 0.10] raw → SD ≈ 0.14 (wrong, inflated by frequency change)
  //    Formula: variance = Σ(x - mean)² / (n-1) (SAMPLE SD)
  const average = calculateMean(finalNormalizedAmounts);
  let varianceSum = 0;
  for (const val of finalNormalizedAmounts) {
    const diff = val - average;
    varianceSum += diff * diff;
  }
  // Use SAMPLE standard deviation (divide by n-1, not n)
  const n = finalNormalizedAmounts.length;
  const variance = n > 1 ? varianceSum / (n - 1) : 0;
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

  // 7. Dividend Volatility (%) = (standard deviation ÷ AVERAGE) × 100
  //    KEY: Use AVERAGE (mean), not median, for CV calculation
  const cvPercentRaw = (standardDeviation / average) * 100;

  // 9. Round to 1 decimal place
  const roundedCVPercent = Math.round(cvPercentRaw * 10) / 10;
  const roundedCV = roundedCVPercent / 100;

  // 8. Estimate annual dividend from the average of the normalized annual amounts
  //     Since amounts are already normalized to annual, we use average as the annual dividend estimate
  const estimatedAnnualDividend = average;

  // 11. Generate volatility index rating from the rounded CV%
  // Rating System: A+ (0-5%), A (5-10%), B+ (10-15%), B (15-20%), C (20-30%), D (30-50%), F (50%+)
  let volatilityIndex: string | null = null;
  if (roundedCVPercent !== null) {
    if (roundedCVPercent <= 5.0) volatilityIndex = 'A+';
    else if (roundedCVPercent <= 10.0) volatilityIndex = 'A';
    else if (roundedCVPercent <= 15.0) volatilityIndex = 'B+';
    else if (roundedCVPercent <= 20.0) volatilityIndex = 'B';
    else if (roundedCVPercent <= 30.0) volatilityIndex = 'C';
    else if (roundedCVPercent <= 50.0) volatilityIndex = 'D';
    else volatilityIndex = 'F';
  }

  return {
    annualDividend: estimatedAnnualDividend,
    dividendSD: standardDeviation,
    dividendCV: roundedCV,
    dividendCVPercent: roundedCVPercent,
    volatilityIndex,
    dataPoints: finalNormalizedAmounts.length,
    calculationDetails: {
      periodStart: periodStartDate.toISOString().split('T')[0],
      periodEnd: periodEndDate.toISOString().split('T')[0],
      rawPayments: rawPaymentDetails,
      mean: average,
      median: average,
      variance,
      standardDeviation,
    },
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
  requestedDays?: number,
  period?: '1W' | '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | '15Y'
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

  // Calculate total return: ((End / Start) - 1) * 100
  const totalReturn = ((endPrice / startPrice) - 1) * 100;

  // Sanity check: returns should be reasonable (between -99% and 10000%)
  // This catches calculation errors or data issues
  if (totalReturn < -99 || totalReturn > 10000 || !isFinite(totalReturn)) {
    logger.warn('Metrics', `Unreasonable total return calculated: ${totalReturn}% (start: ${startPrice}, end: ${endPrice}, dates: ${startRecord.date} to ${endRecord.date})`);
    return null;
  }

  // Annualize returns for periods over 1 year (3Y, 5Y, 10Y, 15Y)
  // Formula: Annualized Return = ((1 + Total Return/100)^(1/years) - 1) * 100
  if (period && (period === '3Y' || period === '5Y' || period === '10Y' || period === '15Y')) {
    const years = period === '3Y' ? 3 : period === '5Y' ? 5 : period === '10Y' ? 10 : 15;
    let annualizedReturn: number;

    if (totalReturn <= -100) {
      // Can't annualize a -100% or worse return
      annualizedReturn = -100;
    } else {
      annualizedReturn = ((Math.pow(1 + totalReturn / 100, 1 / years)) - 1) * 100;
    }

    // Sanity check: annualized returns should be reasonable
    if (!isFinite(annualizedReturn) || annualizedReturn < -100 || annualizedReturn > 1000) {
      logger.warn('Metrics', `Unreasonable annualized return calculated: ${annualizedReturn}% for ${period} (total: ${totalReturn}%)`);
      return null;
    }

    return annualizedReturn;
  }

  // For periods <= 1 year (1W, 1M, 3M, 6M, 1Y), return the raw total return (not annualized)
  return totalReturn;
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
  period: '1W' | '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | '15Y',
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
    case '5Y':
      startDateObj.setFullYear(endDateObj.getFullYear() - 5);
      break;
    case '10Y':
      startDateObj.setFullYear(endDateObj.getFullYear() - 10);
      break;
    case '15Y':
      startDateObj.setFullYear(endDateObj.getFullYear() - 15);
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
    '5Y': 1825,
    '10Y': 3650,
    '15Y': 5475,
  };
  const requestedDays = periodDaysMap[period];

  return {
    priceDrip: calculateTotalReturnDrip(prices, startDate, endDate, requestedDays, period),
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

  // Helper: get a usable cash amount for comparisons
  const getDivAmount = (d: any): number => {
    const a = Number(d?.adj_amount);
    if (isFinite(a) && a > 0) return a;
    const c = Number(d?.div_cash);
    if (isFinite(c) && c > 0) return c;
    return 0;
  };

  // Helper: median for basic special-vs-regular heuristic fallback
  const median = (values: number[]): number | null => {
    const nums = values.filter(v => isFinite(v) && v > 0).sort((x, y) => x - y);
    if (nums.length === 0) return null;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 === 1 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  };

  // Get regular dividends for last dividend and payment count
  // IMPORTANT: Prefer database-calculated `pmt_type` when present (CEFs/normalized dividends),
  // because `div_type` is often null for Tiingo-derived dividends_detail rows.
  // Heuristic fallback: if we don't have pmt_type/div_type, treat big spikes as special (avoid polluting lastDividend)
  const baselineAmounts = dividends
    .filter(d => {
      const anyD = d as any;
      const pmtType = anyD?.pmt_type as string | undefined;
      if (pmtType) {
        // CEO requirement: baseline/last dividend should be REGULAR only (specials excluded)
        return pmtType === 'Regular' || pmtType === 'Initial';
      }
      if (d.div_type) return !d.div_type.toLowerCase().includes('special');
      return false;
    })
    .map(d => getDivAmount(d))
    .filter(v => v > 0)
    .slice(0, 12);
  const baselineMedian = median(baselineAmounts.slice(0, 6));

  const regularDivs = dividends.filter(d => {
    const anyD = d as any;
    const pmtType = anyD?.pmt_type as string | undefined;
    if (pmtType) {
      // CEO requirement: REGULAR only for last div / cadence detection
      return pmtType === 'Regular' || pmtType === 'Initial';
    }

    // Fallback to legacy div_type logic if present
    if (d.div_type) return !d.div_type.toLowerCase().includes('special');

    // Last-resort: div_type null and pmt_type null -> use amount spike heuristic
    const amt = getDivAmount(d);
    if (baselineMedian !== null && baselineMedian > 0 && amt > 1.75 * baselineMedian) {
      return false; // likely special
    }
    return true; // assume regular if we can't disprove
  });

  // Sort by manual flag first (manual dividends take priority), then by date descending
  const sortedRegular = [...regularDivs].sort((a, b) => {
    const aManual = a.is_manual === true ? 1 : 0;
    const bManual = b.is_manual === true ? 1 : 0;
    if (aManual !== bManual) {
      return bManual - aManual;
    }
    return new Date(b.ex_date).getTime() - new Date(a.ex_date).getTime();
  });

  let lastDividend: number | null = null;
  if (sortedRegular.length > 0) {
    lastDividend = getDivAmount(sortedRegular[0]);
  }

  // Determine actual payments per year based on CURRENT payment frequency
  // For ETFs that change frequency (e.g., MSTY from monthly to weekly), we need to detect
  // the current frequency from the most recent payments, not count all payments in the year
  let actualPaymentsPerYear: number;

  if (sortedRegular.length >= 1) {
    // Prefer frequency_num from normalization if available (most accurate, handles holiday shifts)
    const freqNum = Number((sortedRegular[0] as any)?.frequency_num);
    if (isFinite(freqNum) && freqNum > 0) {
      actualPaymentsPerYear = freqNum;
    } else if (sortedRegular.length >= 2) {
      // Otherwise detect current frequency from most recent payments
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
      actualPaymentsPerYear = paymentsPerYear;
    } else {
      actualPaymentsPerYear = 12;
    }
  } else if (paymentsPerYear > 0) {
    // Use database value if we don't have enough recent data
    actualPaymentsPerYear = paymentsPerYear;
  } else {
    // Fallback to monthly if no data available
    actualPaymentsPerYear = 12;
  }

  // Calculate annual dividend: Div × #Pmt
  // Use the detected actualPaymentsPerYear value (from recent dividend dates), not the database value
  // This ensures we use the CURRENT frequency even if the database has outdated frequency data
  // Formula: Annual Div = Dividend per payment × Number of payments per year
  let annualizedDividend: number | null = null;
  if (lastDividend && lastDividend > 0 && actualPaymentsPerYear > 0) {
    annualizedDividend = lastDividend * actualPaymentsPerYear;
  }

  // Calculate forward yield
  let forwardYield: number | null = null;
  if (currentPrice && currentPrice > 0 && annualizedDividend) {
    forwardYield = (annualizedDividend / currentPrice) * 100;
  }

  // Calculate returns for all periods using calendar-based dates
  const [ret1W, ret1M, ret3M, ret6M, ret1Y, ret3Y, ret5Y, ret10Y, ret15Y] = await Promise.all([
    calculateReturnsForPeriod(upperTicker, '1W', dividends),
    calculateReturnsForPeriod(upperTicker, '1M', dividends),
    calculateReturnsForPeriod(upperTicker, '3M', dividends),
    calculateReturnsForPeriod(upperTicker, '6M', dividends),
    calculateReturnsForPeriod(upperTicker, '1Y', dividends),
    calculateReturnsForPeriod(upperTicker, '3Y', dividends),
    calculateReturnsForPeriod(upperTicker, '5Y', dividends),
    calculateReturnsForPeriod(upperTicker, '10Y', dividends),
    calculateReturnsForPeriod(upperTicker, '15Y', dividends),
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
      '5Y': ret5Y.priceDrip,
      '10Y': ret10Y.priceDrip,
      '15Y': ret15Y.priceDrip,
    },

    // Price Return
    priceReturn: {
      '1W': ret1W.priceReturn,
      '1M': ret1M.priceReturn,
      '3M': ret3M.priceReturn,
      '6M': ret6M.priceReturn,
      '1Y': ret1Y.priceReturn,
      '3Y': ret3Y.priceReturn,
      '5Y': ret5Y.priceReturn,
      '10Y': ret10Y.priceReturn,
      '15Y': ret15Y.priceReturn,
    },

    // Total Return WITHOUT DRIP
    totalReturnNoDrip: {
      '1W': ret1W.priceNoDrip,
      '1M': ret1M.priceNoDrip,
      '3M': ret3M.priceNoDrip,
      '6M': ret6M.priceNoDrip,
      '1Y': ret1Y.priceNoDrip,
      '3Y': ret3Y.priceNoDrip,
      '5Y': ret5Y.priceNoDrip,
      '10Y': ret10Y.priceNoDrip,
      '15Y': ret15Y.priceNoDrip,
    },

    // Legacy combined returns for backward compatibility
    returns: {
      '1W': { price: ret1W.priceReturn, total: ret1W.priceDrip },
      '1M': { price: ret1M.priceReturn, total: ret1M.priceDrip },
      '3M': { price: ret3M.priceReturn, total: ret3M.priceDrip },
      '6M': { price: ret6M.priceReturn, total: ret6M.priceDrip },
      '1Y': { price: ret1Y.priceReturn, total: ret1Y.priceDrip },
      '3Y': { price: ret3Y.priceReturn, total: ret3Y.priceDrip },
      '5Y': { price: ret5Y.priceReturn, total: ret5Y.priceDrip },
      '10Y': { price: ret10Y.priceReturn, total: ret10Y.priceDrip },
      '15Y': { price: ret15Y.priceReturn, total: ret15Y.priceDrip },
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
