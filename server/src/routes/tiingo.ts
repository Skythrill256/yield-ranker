/**
 * Tiingo Data API Routes
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
import { fetchPriceHistory as fetchTiingoPrices } from '../services/tiingo.js';
import { calculateMetrics, getChartData, calculateRankings } from '../services/metrics.js';
import { periodToStartDate, getDateYearsAgo, logger, formatDate } from '../utils/index.js';
import type { ChartPeriod, RankingWeights, DividendRecord } from '../types/index.js';

const router = Router();

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
 * - Record Date: T+1 (1 business day after ex-date)
 * - Pay Date: Varies by frequency
 */
function estimateDividendDates(
  exDate: string,
  paymentsPerYear: number
): { recordDate: string; payDate: string } {
  const ex = new Date(exDate);
  
  // Record date is typically 1 business day after ex-date (T+1 settlement)
  const recordDate = addBusinessDays(ex, 1);
  
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
 * Falls back to live Tiingo API if database is empty
 */
router.get('/dividends/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const years = parseInt(req.query.years as string) || 5;
    const startDate = getDateYearsAgo(years);
    
    let dividends = await getDividendHistory(ticker, startDate);
    const staticData = await getETFStatic(ticker);
    const paymentsPerYear = staticData?.payments_per_year ?? 12;
    
    let isLiveData = false;
    
    const hasMissingDates = dividends.some(d => !d.record_date || !d.pay_date);
    
    // Always try to fetch from Tiingo dividend API to get record/pay dates
    logger.info('Routes', `Fetching dividends from Tiingo for ${ticker}...`);
    
    try {
      const { fetchDividendHistory } = await import('../services/tiingo.js');
      const tiingoDividends = await fetchDividendHistory(ticker, startDate);
      
      if (tiingoDividends.length > 0) {
        isLiveData = true;
        
        // Create records from Tiingo data (includes record/pay dates)
        const tiingoRecords = tiingoDividends.map(d => ({
          ticker: ticker.toUpperCase(),
          ex_date: d.exDate.split('T')[0],
          pay_date: d.paymentDate?.split('T')[0] || null,
          record_date: d.recordDate?.split('T')[0] || null,
          declare_date: d.declareDate?.split('T')[0] || null,
          div_cash: d.divCash,
          adj_amount: d.divCash,
          div_type: null,
          frequency: null,
          description: null,
          currency: 'USD',
          split_factor: d.splitFactor || 1,
        })).sort((a, b) => new Date(b.ex_date).getTime() - new Date(a.ex_date).getTime());
        
        // Persist to DB for future requests
        upsertDividends(tiingoRecords).catch(err => 
          logger.warn('Routes', `Failed to persist dividends for ${ticker}: ${err.message}`)
        );
        
        dividends = tiingoRecords;
      }
    } catch (error) {
      logger.warn('Routes', `Failed to fetch Tiingo dividends for ${ticker}: ${(error as Error).message}`);
    }
    
    // Fallback to price data if no dividend API data
    if (dividends.length === 0) {
      logger.info('Routes', `Trying to extract dividends from Tiingo price data for ${ticker}...`);
      const prices = await fetchTiingoPrices(ticker, startDate);
      
      const dividendPrices = prices.filter(p => p.divCash > 0);
      
      if (dividendPrices.length > 0) {
        isLiveData = true;
        dividends = dividendPrices.map(p => ({
          ticker: ticker.toUpperCase(),
          ex_date: p.date.split('T')[0],
          pay_date: null,
          record_date: null,
          declare_date: null,
          div_cash: p.divCash,
          adj_amount: p.divCash,
          div_type: null,
          frequency: null,
          description: null,
          currency: 'USD',
          split_factor: p.splitFactor,
        })).sort((a, b) => new Date(b.ex_date).getTime() - new Date(a.ex_date).getTime());
      }
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
    
    const lastDividend = dividends.length > 0 ? dividends[0].div_cash : null;
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
    
    res.json({
      ticker: ticker.toUpperCase(),
      paymentsPerYear: actualPaymentsPerYear,
      lastDividend,
      annualizedDividend: lastDividend ? lastDividend * actualPaymentsPerYear : null,
      dividendGrowth,
      isLiveData,
      dividends: dividends.map((d, idx) => {
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
          type: d.div_type?.toLowerCase().includes('special') ? 'Special' : 'Regular',
          frequency: d.frequency ?? detectFrequencyFromDates(dividends, idx),
          description: d.description,
          currency: d.currency ?? 'USD',
        };
      }),
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
    
    const chartData = prices.map(p => ({
      date: p.date,
      timestamp: new Date(p.date).getTime() / 1000,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      adjClose: p.adjClose,
      volume: p.volume,
      divCash: p.divCash,
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
          timestamps: prices.map(p => new Date(p.date).getTime() / 1000),
          closes: prices.map(p => p.close),
          adjCloses: prices.map(p => p.adjClose),
          priceReturns: prices.map(p => 
            firstClose > 0 ? ((p.close - firstClose) / firstClose) * 100 : 0
          ),
          totalReturns: prices.map(p => 
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
