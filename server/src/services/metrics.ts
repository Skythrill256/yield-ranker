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
 * Helper function to detect if a ticker is a weekly payer
 */
function isWeeklyPayerTicker(ticker: string): boolean {
  const weeklyTickers = ['TSLY','NVDY','MSTY','CONY','GOOY','AMZY','APLY','QQQY','IWMY','QDTE','XDTE','SDTY','QDTY','RDTY','YMAX','YMAG','ULTY','LFGY','YETH','RDTE','PLTW','TSLW','HOOW','GOOW','METW','AMZW','AMDW','AVGW','MSTW','NFLW','COIW','WPAY','XBTY','YBIT','HOOY','CVNY','PLTY','NVYY','CHPY','GPTY','MAGY','TQQY','TSYY','YSPY','AZYY','PLYY','AMYY','COYY','TSII','NVII','HOII','COII','PLTI','BRKW','MSFW'];
  return weeklyTickers.includes(ticker.toUpperCase()) || ticker.toUpperCase().endsWith('Y');
}

/**
 * Calculate dividend volatility using actual dividend payment amounts.
 * Industry-standard approach (YCharts, Portfolio Visualizer, etc.):
 * 1. Filter out special dividends
 * 2. Use ACTUAL dividend payment amounts (not annualized)
 * 3. Trim high/low outliers (10% from each end) if enough data
 * 4. Calculate Mean, SD, and CV from actual payment amounts
 * 
 * This gives true volatility of dividend payments, which is what investors care about.
 * Annualizing payments before calculating CV artificially reduces volatility.
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

  // 1. Filter to regular dividends only (exclude special dividends) and filter out zero/null amounts
  const regularDivs = dividends.filter(d => {
    const amount = d.adj_amount ?? d.div_cash;
    if (!amount || amount <= 0) return false; // Exclude zero/null amounts
    
    if (!d.div_type) return true; // null type = regular
    const dtype = d.div_type.toLowerCase();
    return dtype.includes('regular') || dtype === 'cash' || dtype === '' || !dtype.includes('special');
  });

  // Minimum requirement: at least 4 payments (as per specification)
  if (regularDivs.length < 4) return nullResult;

  // 2. Sort by ex_date ascending and use split-adjusted amount
  const sorted = [...regularDivs].sort(
    (a, b) => new Date(a.ex_date).getTime() - new Date(b.ex_date).getTime()
  );

  // Build date-indexed series with amounts (ensure amounts are valid)
  const series: { date: Date; amount: number }[] = sorted
    .map(d => ({
      date: new Date(d.ex_date),
      amount: d.adj_amount ?? d.div_cash ?? 0,
    }))
    .filter(d => d.amount > 0); // Ensure all amounts are positive

  if (series.length < 4) return nullResult;

  // 3. Use ALL available dividend payment amounts (not just last 12, not filtered by period)
  // This allows new ETFs with 8-14 payments to show volatility
  const actualDividendAmounts = series.map(d => d.amount);

  // 4. Calculate statistics on ACTUAL dividend amounts (not annualized)
  const n = actualDividendAmounts.length;
  const mean = calculateMean(actualDividendAmounts);
  const sd = calculateStdDev(actualDividendAmounts); // Already uses sample std dev (ddof=1)
  
  // Check for valid mean (avoid division by zero)
  if (mean <= 0.0001 || sd < 0 || isNaN(mean) || isNaN(sd) || !isFinite(mean) || !isFinite(sd)) {
    return nullResult;
  }
  
  // 5. Calculate CV (Coefficient of Variation) = SD / Mean
  // CV% = CV * 100
  // This measures relative volatility of ACTUAL dividend payments
  let cv = sd / mean;
  let cvPercent = cv * 100;
  
  // 6. Detect if this is a weekly payer and annualize volatility for comparability
  // Weekly payers need to be annualized: multiply by sqrt(52/12) ≈ 2.08
  // Detection: use ticker-based detection first (most reliable), then fall back to date-based
  let isWeeklyPayer = false;
  
  // Primary detection: use ticker-based list (most reliable)
  if (ticker && isWeeklyPayerTicker(ticker)) {
    isWeeklyPayer = true;
  } else if (series.length >= 2) {
    // Secondary detection: calculate average days between payments
    let totalDays = 0;
    let dayCount = 0;
    for (let i = 0; i < series.length - 1; i++) {
      const days = (series[i + 1].date.getTime() - series[i].date.getTime()) / (1000 * 60 * 60 * 24);
      if (days > 0 && days < 400) { // Reasonable range
        totalDays += days;
        dayCount++;
      }
    }
    if (dayCount > 0) {
      const avgDaysBetween = totalDays / dayCount;
      // Weekly: <= 10 days between payments OR if we have 40+ payments (likely weekly)
      isWeeklyPayer = avgDaysBetween <= 10 || actualDividendAmounts.length >= 40;
    } else if (actualDividendAmounts.length >= 40) {
      // Fallback: if we have 40+ payments, assume weekly
      isWeeklyPayer = true;
    }
  } else if (actualDividendAmounts.length >= 40) {
    // Fallback: if we have 40+ payments, assume weekly
    isWeeklyPayer = true;
  }
  
  // Annualize weekly payers: multiply by sqrt(52/12) ≈ 2.08
  // This makes weekly volatility comparable to monthly volatility
  // THIS IS THE CRITICAL LINE THAT WAS MISSING FOR SOME FUNDS
  if (isWeeklyPayer) {
    const annualizationFactor = Math.sqrt(52 / 12); // ≈ 2.08
    cvPercent = cvPercent * annualizationFactor;
    cv = cvPercent / 100;
  }
  
  // Round to 1 decimal place (professional standard)
  cvPercent = Math.round(cvPercent * 10) / 10;
  cv = cvPercent / 100;
  
  // Annual dividend: calculate from mean of actual payments and average frequency
  // Detect overall frequency pattern to estimate annual dividend
  let estimatedAnnualDividend: number | null = null;
  if (series.length >= 2) {
    // Calculate average days between payments
    let totalDays = 0;
    let dayCount = 0;
    for (let i = 0; i < series.length - 1; i++) {
      const days = (series[i + 1].date.getTime() - series[i].date.getTime()) / (1000 * 60 * 60 * 24);
      if (days > 0 && days < 400) { // Reasonable range
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
      
      estimatedAnnualDividend = mean * paymentsPerYear;
    }
  }
  
  const annualDividend = estimatedAnnualDividend;
  
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
    dataPoints: actualDividendAmounts.length,
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
  // Get more history (up to 2 years) to ensure we have enough data for DVI calculation
  let dividends = await getDividendsFromPrices(upperTicker);
  if (dividends.length === 0) {
    dividends = await getDividendHistory(upperTicker);
  }
  
  // If still no dividends, try getting from a longer period (2 years)
  if (dividends.length === 0) {
    const twoYearsAgo = getDateYearsAgo(2);
    dividends = await getDividendsFromPrices(upperTicker, twoYearsAgo);
    if (dividends.length === 0) {
      dividends = await getDividendHistory(upperTicker, twoYearsAgo);
    }
  }
  
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
  
  // Calculate annual dividend: simple calculation using last dividend * payments per year
  // This uses the CURRENT payment frequency, not a mixed count
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
  weights: RankingWeights = { yield: 25, totalReturn: 50, volatility: 25, timeframe: "6mo" }
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
