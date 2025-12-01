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
  getLatestPrice,
  getPriceHistory,
  getDividendHistory,
  getDividendsFromPrices,
  getETFStatic,
  getAllTickers,
} from './database.js';
import {
  getDateDaysAgo,
  getDateYearsAgo,
  calculateReturn,
  calculateMean,
  calculateStdDev,
  normalize,
} from '../utils/index.js';
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
 * Calculate frequency-proof dividend volatility using annualized adjusted dividends.
 * Implements the formula from Rich Hill's email:
 * 1. Filter out special dividends
 * 2. Annualize each payment by frequency (Weekly=52, Monthly=12, Quarterly=4, Semi-Annual=2)
 * 3. Trim high/low outliers (10% from each end)
 * 4. Calculate Mean, SD, and CV from trimmed annualized series
 */
function calculateDividendVolatility(
  dividends: DividendRecord[],
  periodInMonths: 6 | 12 = 12
): DividendVolatilityResult {
  const nullResult: DividendVolatilityResult = {
    annualDividend: null,
    dividendSD: null,
    dividendCV: null,
    dividendCVPercent: null,
    volatilityIndex: null,
    dataPoints: 0,
  };

  if (dividends.length < 4) return nullResult;

  // 1. Filter to regular dividends only (exclude special dividends)
  const regularDivs = dividends.filter(d => {
    if (!d.div_type) return true; // null type = regular
    const dtype = d.div_type.toLowerCase();
    return dtype.includes('regular') || dtype === 'cash' || dtype === '' || !dtype.includes('special');
  });

  if (regularDivs.length < 4) return nullResult;

  // 2. Sort by ex_date ascending and use split-adjusted amount
  const sorted = [...regularDivs].sort(
    (a, b) => new Date(a.ex_date).getTime() - new Date(b.ex_date).getTime()
  );

  // Build date-indexed series with amounts
  const series: { date: Date; amount: number }[] = sorted.map(d => ({
    date: new Date(d.ex_date),
    amount: d.adj_amount ?? d.div_cash,
  }));

  // 3. Filter to period (6 or 12 months)
  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setMonth(now.getMonth() - periodInMonths);
  
  const recentDividends = series.filter(d => d.date >= cutoffDate);
  
  if (recentDividends.length < 4) return nullResult;

  // 4. Detect frequency and annualize each payment
  const annualizedDividends: number[] = [];
  for (let i = 0; i < recentDividends.length; i++) {
    const frequency = detectFrequency(recentDividends, i);
    const factor = getAnnualizationFactor(frequency);
    const aad = recentDividends[i].amount * factor;
    annualizedDividends.push(aad);
  }

  // 5. Trim high/low outliers (10% from each end)
  const sortedAmounts = [...annualizedDividends].sort((a, b) => a - b);
  const trimCount = Math.max(1, Math.floor(sortedAmounts.length * 0.1));
  const trimmedAmounts = sortedAmounts.slice(trimCount, sortedAmounts.length - trimCount);
  
  if (trimmedAmounts.length < 3) return nullResult;

  // 6. Calculate statistics on trimmed annualized dividends
  const n = trimmedAmounts.length;
  const mean = calculateMean(trimmedAmounts);
  const sd = calculateStdDev(trimmedAmounts);
  const cv = mean > 0.0001 ? sd / mean : null;
  const cvPercent = cv !== null ? cv * 100 : null;
  
  // Annual dividend is the mean of trimmed annualized dividends
  const annualDividend = mean;
  
  // Generate volatility index label
  let volatilityIndex: string | null = null;
  if (cvPercent !== null) {
    if (cvPercent < 5) volatilityIndex = 'Very Low';
    else if (cvPercent < 10) volatilityIndex = 'Low';
    else if (cvPercent < 20) volatilityIndex = 'Moderate';
    else if (cvPercent < 30) volatilityIndex = 'High';
    else volatilityIndex = 'Very High';
  }

  return {
    annualDividend,
    dividendSD: sd,
    dividendCV: cv,
    dividendCVPercent: cvPercent,
    volatilityIndex,
    dataPoints: trimmedAmounts.length,
  };
}

// ============================================================================
// Period Return Calculations
// ============================================================================

/**
 * Calculate Total Return WITH DRIP using adjusted close prices.
 * Formula: TR_with_DRIP = (P_adj_end / P_adj_start) - 1
 */
function calculateTotalReturnDrip(prices: PriceRecord[]): number | null {
  if (prices.length < 2) return null;
  
  const startPrice = prices[0].adj_close;
  const endPrice = prices[prices.length - 1].adj_close;
  
  if (!startPrice || !endPrice || startPrice <= 0) return null;
  return ((endPrice / startPrice) - 1) * 100;
}

/**
 * Calculate Price Return using unadjusted close prices.
 * Formula: PriceReturn = (P_close_end / P_close_start) - 1
 */
function calculatePriceReturn(prices: PriceRecord[]): number | null {
  if (prices.length < 2) return null;
  
  const startPrice = prices[0].close;
  const endPrice = prices[prices.length - 1].close;
  
  if (!startPrice || !endPrice || startPrice <= 0) return null;
  return ((endPrice / startPrice) - 1) * 100;
}

/**
 * Calculate Total Return WITHOUT DRIP (dividends not reinvested).
 * Formula: TR_without_DRIP = ((P_close_end - P_close_start) + TotalDividends) / P_close_start
 */
function calculateTotalReturnNoDrip(
  prices: PriceRecord[],
  dividends: DividendRecord[],
  startDate: string,
  endDate: string
): number | null {
  if (prices.length < 2) return null;
  
  const startPrice = prices[0].close;
  const endPrice = prices[prices.length - 1].close;
  
  if (!startPrice || !endPrice || startPrice <= 0) return null;
  
  // Sum dividends paid between start and end dates
  const totalDividends = dividends
    .filter(d => d.ex_date >= startDate && d.ex_date <= endDate)
    .reduce((sum, d) => sum + d.div_cash, 0);
  
  return (((endPrice - startPrice) + totalDividends) / startPrice) * 100;
}

interface FullReturnData {
  priceDrip: number | null;    // Total return with DRIP
  priceReturn: number | null;  // Price return (non-DRIP)
  priceNoDrip: number | null;  // Total return without DRIP
}

async function calculateReturnsForPeriod(
  ticker: string,
  days: number,
  dividends: DividendRecord[]
): Promise<FullReturnData> {
  const startDate = getDateDaysAgo(days);
  const endDate = getDateDaysAgo(0);
  const prices = await getPriceHistory(ticker, startDate);
  
  return {
    priceDrip: calculateTotalReturnDrip(prices),
    priceReturn: calculatePriceReturn(prices),
    priceNoDrip: calculateTotalReturnNoDrip(prices, dividends, startDate, endDate),
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
  
  // Get dividend data - prefer prices_daily.div_cash, fallback to dividends_detail
  let dividends = await getDividendsFromPrices(upperTicker);
  if (dividends.length === 0) {
    dividends = await getDividendHistory(upperTicker);
  }
  
  // Calculate frequency-proof dividend volatility using 12-month period
  const volMetrics = calculateDividendVolatility(dividends, 12);
  
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
  
  // Count regular payments in last 12 months
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setMonth(now.getMonth() - 12);
  const recentRegularCount = sortedRegular.filter(d => new Date(d.ex_date) >= oneYearAgo).length;
  
  // Update paymentsPerYear to reflect actual count of regular payments
  const actualPaymentsPerYear = recentRegularCount > 0 ? recentRegularCount : paymentsPerYear;
  
  // Calculate annual dividend: simple calculation using last dividend * payments per year
  // This is more accurate than the volatility-based calculation which can be skewed by outliers
  let annualizedDividend: number | null = null;
  if (lastDividend && lastDividend > 0 && actualPaymentsPerYear > 0) {
    annualizedDividend = lastDividend * actualPaymentsPerYear;
  }
  
  // Calculate forward yield
  let forwardYield: number | null = null;
  if (currentPrice && currentPrice > 0 && annualizedDividend) {
    forwardYield = (annualizedDividend / currentPrice) * 100;
  }
  
  // Calculate returns for all periods
  const [ret1W, ret1M, ret3M, ret6M, ret1Y, ret3Y] = await Promise.all([
    calculateReturnsForPeriod(upperTicker, 7, dividends),
    calculateReturnsForPeriod(upperTicker, 30, dividends),
    calculateReturnsForPeriod(upperTicker, 90, dividends),
    calculateReturnsForPeriod(upperTicker, 180, dividends),
    calculateReturnsForPeriod(upperTicker, 365, dividends),
    calculateReturnsForPeriod(upperTicker, 1095, dividends),
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
