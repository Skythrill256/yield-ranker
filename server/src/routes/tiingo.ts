/**
 * Data API Routes (FMP-backed)
 * 
 * REST API endpoints for price, dividend, and metrics data
 */

import { Router, Request, Response } from 'express';
import {
  getPriceHistory,
  getLatestPrice,
  getDividendHistory,
  getETFStatic,
  getAllSyncLogs,
  upsertDividends,
} from '../services/database.js';
import { fetchPriceHistory as fetchTiingoPrices, fetchDividendHistory as fetchTiingoDividends } from '../services/tiingo.js';
import { calculateMetrics, getChartData, calculateRankings, calculateRealtimeReturns, calculateRealtimeReturnsBatch } from '../services/metrics.js';
import { calculateNormalizedForResponse } from '../services/dividendNormalization.js';
import { periodToStartDate, getDateYearsAgo, logger, formatDate } from '../utils/index.js';
import type { ChartPeriod, RankingWeights, DividendRecord } from '../types/index.js';

const router: Router = Router();

// ============================================================================
// Date Estimation Utilities
// ============================================================================

/**
 * Add business days to a date (skips weekends)
 */
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }
  return result;
}

/**
 * Estimate record date and pay date from ex-dividend date
 * Based on standard market patterns:
 * - Record Date: Same as ex-date (T+1 settlement since May 2024)
 *   Note: Under T+2 settlement (pre-May 2024), record date was 1 business day after ex-date
 *   With T+1 settlement, ex-date and record date are typically the same
 * - Pay Date: Varies by frequency
 */
function estimateDividendDates(
  exDate: string,
  paymentsPerYear: number
): { recordDate: string; payDate: string } {
  const ex = new Date(exDate);

  // Record date is typically the same as ex-date (T+1 settlement since May 2024)
  // For historical data (pre-May 2024), it would be 1 business day after, but we use same date for simplicity
  const recordDate = new Date(ex); // Same date as ex-date

  // Pay date varies by dividend frequency
  let payDaysAfterEx: number;
  if (paymentsPerYear >= 52) {
    // Weekly: pay within 3-5 days
    payDaysAfterEx = 4;
  } else if (paymentsPerYear >= 12) {
    // Monthly: pay within 7-10 days
    payDaysAfterEx = 7;
  } else if (paymentsPerYear >= 4) {
    // Quarterly: pay within 14-21 days
    payDaysAfterEx = 14;
  } else if (paymentsPerYear >= 2) {
    // Semi-annual: pay within 21-28 days
    payDaysAfterEx = 21;
  } else {
    // Annual: pay within 28-35 days
    payDaysAfterEx = 28;
  }

  const payDate = addBusinessDays(ex, payDaysAfterEx);

  return {
    recordDate: recordDate.toISOString().split('T')[0],
    payDate: payDate.toISOString().split('T')[0],
  };
}

// ============================================================================
// Price Endpoints
// ============================================================================

/**
 * GET /prices/:ticker - Get price history with calculated returns
 */
router.get('/prices/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const period = (req.query.period as ChartPeriod) || '1Y';

    const chartData = await getChartData(ticker, period);

    res.json({
      ticker: ticker.toUpperCase(),
      period,
      count: chartData.length,
      data: chartData,
    });
  } catch (error) {
    logger.error('Routes', `Error in prices endpoint: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to fetch price data' });
  }
});

/**
 * GET /latest/:ticker - Get the most recent price
 */
router.get('/latest/:ticker', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ticker } = req.params;
    const prices = await getLatestPrice(ticker, 2);

    if (prices.length === 0) {
      res.status(404).json({ error: 'No price data found for ticker' });
      return;
    }

    const latest = prices[prices.length - 1];
    const previous = prices.length > 1 ? prices[prices.length - 2] : latest;

    const currentPrice = latest.close ?? 0;
    const previousClose = previous.close ?? currentPrice;
    const priceChange = currentPrice - previousClose;
    const priceChangePercent = previousClose > 0 ? (priceChange / previousClose) * 100 : 0;

    res.json({
      ticker: ticker.toUpperCase(),
      date: latest.date,
      currentPrice,
      previousClose,
      priceChange,
      priceChangePercent,
      adjClose: latest.adj_close,
      volume: latest.volume,
      high: latest.high,
      low: latest.low,
      open: latest.open,
    });
  } catch (error) {
    logger.error('Routes', `Error in latest endpoint: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to fetch latest price' });
  }
});

// ============================================================================
// Dividend Endpoints
// ============================================================================

/**
 * GET /dividends/:ticker - Get dividend history
 * Falls back to live FMP API if database is empty
 */
router.get('/dividends/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const years = parseInt(req.query.years as string) || 15;
    
    // For large year requests (50+ years), fetch all dividends without date filter
    // This ensures we get full historical data
    const startDate = years >= 50 ? undefined : getDateYearsAgo(years);

    let dividends = await getDividendHistory(ticker, startDate);
    const staticData = await getETFStatic(ticker);
    const paymentsPerYear = staticData?.payments_per_year ?? 12;

    let isLiveData = false;

    const hasMissingDates = dividends.some(d => !d.record_date || !d.pay_date);

    // Always try to fetch from Tiingo dividend API
    logger.info('Routes', `Fetching dividends from Tiingo for ${ticker}...`);

    // Preserve normalized values from database for merging later
    // Include ALL dividends with frequency_num, even if normalized_div is null
    const dbNormalizedMap = new Map<string, any>();
    dividends.forEach(d => {
      const exDate = d.ex_date.split('T')[0];
      // Include if frequency_num exists (even if normalized_div is null)
      if ((d as any).frequency_num !== null && (d as any).frequency_num !== undefined) {
        dbNormalizedMap.set(exDate, {
          normalized_div: (d as any).normalized_div ?? null,
          frequency_num: (d as any).frequency_num,
          pmt_type: (d as any).pmt_type,
          days_since_prev: (d as any).days_since_prev,
          annualized: (d as any).annualized,
        });
      }
    });

    try {
      // For large year requests, fetch all available data from Tiingo
      const tiingoStartDate = years >= 50 ? undefined : startDate;
      const tiingoDividends = await fetchTiingoDividends(ticker, tiingoStartDate);

      if (tiingoDividends.length > 0) {
        isLiveData = true;

        const existingDividends = await getDividendHistory(ticker, startDate);
        const manualDividends = existingDividends.filter(d =>
          d.description?.includes('Manual upload') || d.description?.includes('Early announcement')
        );

        const tiingoRecords = tiingoDividends.map((d: { date: string; dividend: number; adjDividend: number; scaledDividend: number; recordDate: string | null; paymentDate: string | null; declarationDate: string | null }) => {
          const exDate = d.date.split('T')[0];
          const divAmount = d.adjDividend > 0 ? d.adjDividend : d.dividend;

          const matchedManual = manualDividends.find(manual => {
            const manualExDate = new Date(manual.ex_date);
            const tiingoExDate = new Date(exDate);
            const daysDiff = Math.abs((tiingoExDate.getTime() - manualExDate.getTime()) / (1000 * 60 * 60 * 24));
            const amountMatch = Math.abs((manual.adj_amount ?? manual.div_cash) - divAmount) < 0.01;

            return (manual.ex_date === exDate) || (daysDiff <= 7 && amountMatch);
          });

          // Merge with database normalized values if available
          const dbNormalized = dbNormalizedMap.get(exDate);
          
          return {
            ticker: ticker.toUpperCase(),
            ex_date: exDate,
            pay_date: d.paymentDate?.split('T')[0] || null,
            record_date: d.recordDate?.split('T')[0] || null,
            declare_date: d.declarationDate?.split('T')[0] || null,
            div_cash: d.dividend,
            adj_amount: d.adjDividend,
            scaled_amount: d.scaledDividend > 0 ? d.scaledDividend : null,
            div_type: null,
            frequency: null,
            description: matchedManual ? null : null,
            currency: 'USD',
            split_factor: d.adjDividend > 0 ? d.dividend / d.adjDividend : 1,
            // Preserve normalized values from database
            normalized_div: dbNormalized?.normalized_div ?? null,
            frequency_num: dbNormalized?.frequency_num ?? null,
            pmt_type: dbNormalized?.pmt_type ?? null,
            days_since_prev: dbNormalized?.days_since_prev ?? null,
            annualized: dbNormalized?.annualized ?? null,
          };
        }).sort((a: DividendRecord, b: DividendRecord) => new Date(b.ex_date).getTime() - new Date(a.ex_date).getTime());

        upsertDividends(tiingoRecords).catch(err =>
          logger.warn('Routes', `Failed to persist dividends for ${ticker}: ${err.message}`)
        );

        // After upserting, re-fetch from database to get normalized values
        // This ensures we have the latest calculated normalized_div values
        const updatedDividends = await getDividendHistory(ticker, startDate);
        if (updatedDividends.length > 0) {
          dividends = updatedDividends as any[];
        } else {
          dividends = tiingoRecords as any[];
        }
      }
    } catch (error) {
      logger.warn('Routes', `Failed to fetch Tiingo dividends for ${ticker}: ${(error as Error).message}`);
    }

    // Log if no dividends found
    if (dividends.length === 0) {
      logger.info('Routes', `No dividend data found for ${ticker} from Tiingo API`);
    }

    // Detect frequency from actual dividend dates first to get accurate paymentsPerYear
    let actualPaymentsPerYear = paymentsPerYear;
    if (dividends.length >= 2) {
      const sorted = [...dividends].sort((a, b) =>
        new Date(a.ex_date).getTime() - new Date(b.ex_date).getTime()
      );
      const firstDate = new Date(sorted[0].ex_date);
      const lastDate = new Date(sorted[sorted.length - 1].ex_date);
      const daysDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 0 && sorted.length > 1) {
        const avgDaysBetween = daysDiff / (sorted.length - 1);
        if (avgDaysBetween <= 10) actualPaymentsPerYear = 52;
        else if (avgDaysBetween <= 35) actualPaymentsPerYear = 12;
        else if (avgDaysBetween <= 95) actualPaymentsPerYear = 4;
        else if (avgDaysBetween <= 185) actualPaymentsPerYear = 2;
        else actualPaymentsPerYear = 1;
      }
    }

    // Last dividend (for homepage/summary use):
    // MUST use the most recent REGULAR dividend only (exclude special dividends).
    // This ensures "last dividend" reflects the recurring payment cadence, not one-time special spikes.
    let lastDividend: number | null = null;
    for (const div of dividends) {
      const divAny = div as any;
      const pmtType = divAny?.pmt_type || 'Regular';
      
      // Only use Regular or Initial dividends (skip Special)
      if (pmtType === 'Regular' || pmtType === 'Initial') {
        // For split specials that were converted to Regular in table, regular_component might exist
        if (divAny?.regular_component !== null && divAny?.regular_component !== undefined) {
          const rc = Number(divAny.regular_component);
          if (isFinite(rc) && rc > 0) {
            lastDividend = rc;
            break;
          }
        } else {
          // Regular dividend: use div_cash
          const amount = div.div_cash || 0;
          if (amount > 0) {
            lastDividend = amount;
            break;
          }
        }
      }
    }
    const annualizedDividend = lastDividend ? lastDividend * actualPaymentsPerYear : null;

    // Calculate YoY growth
    let dividendGrowth: number | null = null;
    if (dividends.length >= actualPaymentsPerYear * 2) {
      const recentYearTotal = dividends
        .slice(0, actualPaymentsPerYear)
        .reduce((sum, d) => sum + d.div_cash, 0);
      const priorYearTotal = dividends
        .slice(actualPaymentsPerYear, actualPaymentsPerYear * 2)
        .reduce((sum, d) => sum + d.div_cash, 0);

      if (priorYearTotal > 0) {
        dividendGrowth = ((recentYearTotal - priorYearTotal) / priorYearTotal) * 100;
      }
    }

    // Detect frequency from actual dividend dates for each dividend
    // This detects per-payment frequency based on days between consecutive payments
    const detectFrequencyFromDates = (records: DividendRecord[], index: number): string => {
      if (records.length < 2) {
        // Fallback to paymentsPerYear if not enough data
        if (paymentsPerYear === 12) return 'Monthly';
        if (paymentsPerYear === 4) return 'Quarterly';
        if (paymentsPerYear === 52) return 'Weekly';
        if (paymentsPerYear === 1) return 'Annual';
        return `${paymentsPerYear}x/Yr`;
      }

      // Sort dividends by date (descending - most recent first) for frequency detection
      const sorted = [...records].sort((a, b) =>
        new Date(b.ex_date).getTime() - new Date(a.ex_date).getTime()
      );

      // Find the index in sorted array
      const sortedIndex = sorted.findIndex(r => r.ex_date === records[index].ex_date);
      if (sortedIndex === -1) {
        // Fallback if not found
        if (actualPaymentsPerYear === 12) return 'Monthly';
        if (actualPaymentsPerYear === 52) return 'Weekly';
        if (actualPaymentsPerYear === 4) return 'Quarterly';
        return 'Monthly';
      }

      const currentDate = new Date(sorted[sortedIndex].ex_date);
      let daysBetween: number | null = null;

      // Try to find previous dividend (more recent payment)
      if (sortedIndex > 0) {
        const prevDate = new Date(sorted[sortedIndex - 1].ex_date);
        daysBetween = (prevDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24);
      }

      // If no previous dividend found, try next dividend (older payment)
      if (daysBetween === null && sortedIndex < sorted.length - 1) {
        const nextDate = new Date(sorted[sortedIndex + 1].ex_date);
        daysBetween = (currentDate.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24);
      }

      // Determine frequency based on days between payments
      // Weekly: <= 10 days, Monthly: 11-35 days, Quarterly: 36-95 days, etc.
      if (daysBetween !== null) {
        if (daysBetween <= 10) return 'Weekly';
        if (daysBetween <= 35) return 'Monthly';
        if (daysBetween <= 95) return 'Quarterly';
        if (daysBetween <= 185) return 'Semi-Annual';
        return 'Annual';
      }

      // Fallback to actualPaymentsPerYear
      if (actualPaymentsPerYear === 12) return 'Monthly';
      if (actualPaymentsPerYear === 4) return 'Quarterly';
      if (actualPaymentsPerYear === 52) return 'Weekly';
      if (actualPaymentsPerYear === 1) return 'Annual';
      return `${actualPaymentsPerYear}x/Yr`;
    };

    // Build dividend records for response (date/amount metadata).
    // NOTE: Normalization (pmtType/frequencyNum/daysSincePrev/annualized/normalizedDiv) is computed LIVE
    // from the full series below to avoid stale DB classifications.
    const dividendRecords = dividends.map((d, idx) => {
      // Estimate record/pay dates if missing
      let recordDate = d.record_date;
      let payDate = d.pay_date;

      if (!recordDate || !payDate) {
        const estimated = estimateDividendDates(d.ex_date, actualPaymentsPerYear);
        if (!recordDate) recordDate = estimated.recordDate;
        if (!payDate) payDate = estimated.payDate;
      }

      return {
        exDate: d.ex_date,
        payDate,
        recordDate,
        declareDate: d.declare_date,
        amount: d.div_cash,
        adjAmount: d.adj_amount ?? d.div_cash,
        scaledAmount: d.scaled_amount ?? d.div_cash,
        type: d.div_type?.toLowerCase().includes('special') ? 'Special' : 'Regular',
        frequency: d.frequency ?? detectFrequencyFromDates(dividends, idx),
        description: d.description,
        currency: d.currency ?? 'USD',
      };
    });

    // Check if this is a CEF to use the correct normalization path
    const isCEF = staticData?.category === 'CEF';
    
    // For CEFs, prefer database values (they're calculated with CEF-specific logic)
    // For ETFs, recalculate to ensure freshness
    const dividendsByDateMap = new Map<string, any>();
    dividends.forEach((d) => {
      const exDate = d.ex_date.split('T')[0];
      dividendsByDateMap.set(exDate, d);
    });

    const dividendRecordsDesc = [...dividendRecords].sort(
      (a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime()
    );

    // ETFs: compute normalized fields from the full series so daysSincePrev/frequency confirmation is consistent.
    // CEFs: we will use DB-calculated values (see below).
    const liveNormalizedDesc = !isCEF ? calculateNormalizedForResponse(dividendRecords) : null;

    const dividendsWithNormalized = dividendRecordsDesc.map((d, i) => {
      const normalizedExDate = d.exDate.split('T')[0];
      const dbDiv = dividendsByDateMap.get(normalizedExDate);

      // For CEFs: Use database values directly (they're already calculated correctly)
      if (isCEF && dbDiv) {
        const dbPmtType = (dbDiv as any)?.pmt_type;
        const dbFrequency = (dbDiv as any)?.frequency;
        const dbFrequencyNum = (dbDiv as any)?.frequency_num;
        const dbAnnualized = (dbDiv as any)?.annualized;
        const dbNormalizedDiv = (dbDiv as any)?.normalized_div;
        const dbDaysSincePrev = (dbDiv as any)?.days_since_prev;

        return {
          ...d,
          pmtType: (dbPmtType ?? 'Regular') as 'Regular' | 'Special' | 'Initial',
          frequency: dbFrequency ?? d.frequency,
          frequencyNum: dbFrequencyNum ?? 12,
          daysSincePrev: dbDaysSincePrev ?? null,
          annualized: dbAnnualized ?? null,
          normalizedDiv: dbNormalizedDiv ?? null,
          regularComponent: (dbDiv as any)?.regular_component ?? null,
          specialComponent: (dbDiv as any)?.special_component ?? null,
        };
      }

      // For ETFs: Recalculate using ETF normalization logic from the full series.
      const live = liveNormalizedDesc?.[i];

      // Use database pmt_type if available (more reliable than live recalculation)
      const pmtType = (dbDiv as any)?.pmt_type ?? (live?.pmtType ?? 'Regular') as 'Regular' | 'Special' | 'Initial';
      
      // For Special dividends, use database frequency (should be "Other") instead of live calculation
      let frequency = d.frequency;
      if (pmtType === 'Special' && (dbDiv as any)?.frequency) {
        frequency = (dbDiv as any).frequency;
      }

      return {
        ...d,
        frequency, // Use database frequency for Specials, otherwise keep original
        pmtType,
        frequencyNum: live?.frequencyNum ?? 12,
        daysSincePrev: live?.daysSincePrev ?? null,
        annualized: live?.annualized ?? null,
        normalizedDiv: live?.normalizedDiv ?? null,
        regularComponent: (dbDiv as any)?.regular_component ?? null,
        specialComponent: (dbDiv as any)?.special_component ?? null,
      };
    });

    // Recompute lastDividend using LIVE pmtType so special stubs don’t pollute the run-rate.
    lastDividend = null;
    for (const div of dividendsWithNormalized) {
      if (div.pmtType === 'Regular' || div.pmtType === 'Initial') {
        const rc = (div as any).regularComponent;
        if (rc !== null && rc !== undefined) {
          const v = Number(rc);
          if (isFinite(v) && v > 0) {
            lastDividend = v;
            break;
          }
        }
        const amount = Number(div.amount ?? 0);
        if (isFinite(amount) && amount > 0) {
          lastDividend = amount;
          break;
        }
      }
    }

    // Disable caching to ensure fresh data
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json({
      ticker: ticker.toUpperCase(),
      paymentsPerYear: actualPaymentsPerYear,
      lastDividend,
      annualizedDividend: lastDividend ? lastDividend * actualPaymentsPerYear : null,
      dividendGrowth,
      isLiveData,
      dividends: dividendsWithNormalized,
    });
  } catch (error) {
    logger.error('Routes', `Error in dividends endpoint: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to fetch dividend data' });
  }
});

// ============================================================================
// Metrics Endpoints
// ============================================================================

/**
 * GET /metrics/:ticker - Get all calculated metrics
 */
router.get('/metrics/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const metrics = await calculateMetrics(ticker);
    res.json(metrics);
  } catch (error) {
    logger.error('Routes', `Error in metrics endpoint: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to calculate metrics' });
  }
});

// ============================================================================
// Comparison Endpoints
// ============================================================================

interface CompareRequestBody {
  tickers: string[];
  period?: ChartPeriod;
  type?: 'totalReturn' | 'priceReturn';
}

/**
 * POST /compare - Get comparison chart data for multiple tickers
 */
router.post('/compare', async (req: Request<object, object, CompareRequestBody>, res: Response): Promise<void> => {
  try {
    const { tickers, period = '1Y' } = req.body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      res.status(400).json({ error: 'tickers array is required' });
      return;
    }

    const startDate = periodToStartDate(period);
    const result: Record<string, {
      timestamps: number[];
      closes: number[];
      adjCloses: number[];
      priceReturns: number[];
      totalReturns: number[];
    }> = {};

    for (const ticker of tickers.slice(0, 5)) {
      const prices = await getPriceHistory(ticker, startDate);

      if (prices.length > 0) {
        const firstClose = prices[0].close ?? 0;
        const firstAdjClose = prices[0].adj_close ?? 0;

        result[ticker.toUpperCase()] = {
          timestamps: prices.map(p => new Date(p.date).getTime() / 1000),
          closes: prices.map(p => p.close ?? 0),
          adjCloses: prices.map(p => p.adj_close ?? 0),
          priceReturns: prices.map(p =>
            firstClose > 0 ? (((p.close ?? 0) - firstClose) / firstClose) * 100 : 0
          ),
          totalReturns: prices.map(p =>
            firstAdjClose > 0 ? (((p.adj_close ?? 0) - firstAdjClose) / firstAdjClose) * 100 : 0
          ),
        };
      }
    }

    res.json({
      tickers: Object.keys(result),
      period,
      startDate,
      data: result,
    });
  } catch (error) {
    logger.error('Routes', `Error in compare endpoint: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to fetch comparison data' });
  }
});

// ============================================================================
// Ranking Endpoints
// ============================================================================

interface RankingsRequestBody {
  weights?: RankingWeights;
}

/**
 * POST /rankings - Get ranked ETFs with custom weights
 */
router.post('/rankings', async (req: Request<object, object, RankingsRequestBody>, res: Response) => {
  try {
    const { weights } = req.body;
    const rankings = await calculateRankings(weights);

    res.json({
      weights: weights ?? { yield: 34, totalReturn: 33, volatility: 33 },
      rankings,
      calculatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Routes', `Error in rankings endpoint: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to calculate rankings' });
  }
});

// ============================================================================
// Live Chart Endpoints (Direct from Tiingo API)
// ============================================================================

/**
 * Convert period to start date
 */
function getLiveStartDate(period: string): string {
  const now = new Date();
  switch (period) {
    case '1D':
      now.setDate(now.getDate() - 1);
      break;
    case '1W':
      now.setDate(now.getDate() - 7);
      break;
    case '1M':
      now.setMonth(now.getMonth() - 1);
      break;
    case '3M':
      now.setMonth(now.getMonth() - 3);
      break;
    case '6M':
      now.setMonth(now.getMonth() - 6);
      break;
    case 'YTD':
      now.setMonth(0);
      now.setDate(1);
      break;
    case '1Y':
      now.setFullYear(now.getFullYear() - 1);
      break;
    case '3Y':
      now.setFullYear(now.getFullYear() - 3);
      break;
    case '5Y':
      now.setFullYear(now.getFullYear() - 5);
      break;
    case '10Y':
      now.setFullYear(now.getFullYear() - 10);
      break;
    case '20Y':
      now.setFullYear(now.getFullYear() - 20);
      break;
    case 'MAX':
      now.setFullYear(2000);
      break;
    default:
      now.setFullYear(now.getFullYear() - 1);
  }
  return formatDate(now);
}

/**
 * GET /live/:ticker - Get live price data directly from Tiingo API
 */
router.get('/live/:ticker', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ticker } = req.params;
    const period = (req.query.period as string) || '1Y';
    const startDate = getLiveStartDate(period);
    const endDate = formatDate(new Date());

    logger.info('Routes', `Fetching live data for ${ticker} from ${startDate} to ${endDate}`);

    const prices = await fetchTiingoPrices(ticker, startDate, endDate);

    if (!prices || prices.length === 0) {
      res.status(404).json({ error: `No data found for ${ticker}` });
      return;
    }

    // Calculate returns
    const firstClose = prices[0].close;
    const firstAdjClose = prices[0].adjClose;

    const chartData = prices.map((p) => ({
      date: p.date.split('T')[0],
      timestamp: new Date(p.date).getTime() / 1000,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      adjClose: p.adjClose,
      volume: p.volume,
      divCash: p.divCash || 0, // Tiingo includes divCash on ex-dividend dates
      priceReturn: firstClose > 0 ? ((p.close - firstClose) / firstClose) * 100 : 0,
      totalReturn: firstAdjClose > 0 ? ((p.adjClose - firstAdjClose) / firstAdjClose) * 100 : 0,
    }));

    res.json({
      ticker: ticker.toUpperCase(),
      period,
      count: chartData.length,
      startDate,
      endDate,
      data: chartData,
    });
  } catch (error) {
    logger.error('Routes', `Error in live endpoint: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to fetch live data from Tiingo' });
  }
});

/**
 * POST /live/compare - Get live comparison data for multiple tickers
 */
router.post('/live/compare', async (req: Request, res: Response): Promise<void> => {
  try {
    const { tickers, period = '1Y' } = req.body as { tickers: string[]; period?: string };

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      res.status(400).json({ error: 'tickers array is required' });
      return;
    }

    const startDate = getLiveStartDate(period);
    const endDate = formatDate(new Date());

    logger.info('Routes', `Fetching live comparison for ${tickers.join(', ')} from ${startDate}`);

    const result: Record<string, {
      timestamps: number[];
      closes: number[];
      adjCloses: number[];
      priceReturns: number[];
      totalReturns: number[];
    }> = {};

    for (const ticker of tickers) {
      const prices = await fetchTiingoPrices(ticker.toUpperCase(), startDate, endDate);

      if (prices && prices.length > 0) {
        const firstClose = prices[0].close;
        const firstAdjClose = prices[0].adjClose;

        result[ticker.toUpperCase()] = {
          timestamps: prices.map((p) => new Date(p.date).getTime() / 1000),
          closes: prices.map((p) => p.close),
          adjCloses: prices.map((p) => p.adjClose),
          priceReturns: prices.map((p) =>
            firstClose > 0 ? ((p.close - firstClose) / firstClose) * 100 : 0
          ),
          totalReturns: prices.map((p) =>
            firstAdjClose > 0 ? ((p.adjClose - firstAdjClose) / firstAdjClose) * 100 : 0
          ),
        };
      }
    }

    res.json({
      tickers: Object.keys(result),
      period,
      startDate,
      data: result,
    });
  } catch (error) {
    logger.error('Routes', `Error in live compare endpoint: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to fetch live comparison data' });
  }
});

// ============================================================================
// Realtime Returns Endpoints
// ============================================================================

/**
 * GET /realtime-returns/:ticker - Get realtime returns for a single ticker
 * Uses IEX intraday prices for accurate realtime calculations
 */
router.get('/realtime-returns/:ticker', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ticker } = req.params;

    if (!ticker) {
      res.status(400).json({ error: 'Ticker is required' });
      return;
    }

    const returns = await calculateRealtimeReturns(ticker);

    if (!returns) {
      res.status(404).json({ error: `No realtime data available for ${ticker}` });
      return;
    }

    res.json({
      success: true,
      data: returns,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Routes', `Error fetching realtime returns: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to fetch realtime returns' });
  }
});

interface RealtimeReturnsBatchBody {
  tickers: string[];
}

/**
 * POST /realtime-returns/batch - Get realtime returns for multiple tickers
 * More efficient for fetching multiple tickers at once
 */
router.post('/realtime-returns/batch', async (req: Request<object, object, RealtimeReturnsBatchBody>, res: Response): Promise<void> => {
  try {
    const { tickers } = req.body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      res.status(400).json({ error: 'tickers array is required' });
      return;
    }

    // Limit to 50 tickers per request
    const limitedTickers = tickers.slice(0, 50);

    const returnsMap = await calculateRealtimeReturnsBatch(limitedTickers);

    // Convert Map to object for JSON response
    const returns: Record<string, unknown> = {};
    returnsMap.forEach((value, key) => {
      returns[key] = value;
    });

    res.json({
      success: true,
      count: returnsMap.size,
      data: returns,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Routes', `Error fetching batch realtime returns: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to fetch realtime returns' });
  }
});

// ============================================================================
// Sync Status Endpoint
// ============================================================================

/**
 * GET /sync-status - Get data synchronization status
 */
router.get('/sync-status', async (_req: Request, res: Response) => {
  try {
    const logs = await getAllSyncLogs();

    const pricesLogs = logs.filter(d => d.data_type === 'prices');
    const dividendsLogs = logs.filter(d => d.data_type === 'dividends');
    const successCount = logs.filter(d => d.status === 'success').length;
    const errorCount = logs.filter(d => d.status === 'error').length;
    const uniqueTickers = new Set(logs.map(d => d.ticker)).size;
    const lastSync = logs.length > 0 ? logs[0].last_sync_date : null;

    res.json({
      lastSync,
      tickersTracked: uniqueTickers,
      pricesSynced: pricesLogs.length,
      dividendsSynced: dividendsLogs.length,
      successCount,
      errorCount,
      details: logs,
    });
  } catch (error) {
    logger.error('Routes', `Error in sync-status endpoint: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

export default router;
