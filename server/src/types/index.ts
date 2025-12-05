/**
 * Shared Type Definitions
 */

// ============================================================================
// FMP API Types
// ============================================================================

export interface FMPPriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose: number;
  adjOpen?: number;
  adjHigh?: number;
  adjLow?: number;
  adjVolume?: number;
  unadjustedVolume?: number;
  change: number;
  changePercent: number;
  vwap: number;
  label: string;
  changeOverTime: number;
}

export interface FMPDividendData {
  date: string;           // Ex-dividend date
  label: string;
  adjDividend: number;    // Split-adjusted dividend
  dividend: number;       // Original dividend amount
  recordDate: string | null;
  paymentDate: string | null;
  declarationDate: string | null;
}

export interface FMPQuote {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  yearHigh: number;
  yearLow: number;
  marketCap: number;
  priceAvg50: number;
  priceAvg200: number;
  exchange: string;
  volume: number;
  avgVolume: number;
  open: number;
  previousClose: number;
  eps: number;
  pe: number;
  earningsAnnouncement: string | null;
  sharesOutstanding: number;
  timestamp: number;
}

// Legacy type aliases for backward compatibility in routes
export type TiingoPriceData = FMPPriceData & { adjClose: number; divCash: number; splitFactor: number };
export type TiingoDividendData = FMPDividendData & { exDate: string; divCash: number; splitFactor: number };
export type TiingoIEXQuote = FMPQuote & { ticker: string; tngoLast: number; prevClose: number; lastSaleTimestamp: string };
export type TiingoMetaData = FMPQuote;

// ============================================================================
// Database Record Types
// ============================================================================

export interface PriceRecord {
  id?: number;
  ticker: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adj_close: number | null;
  volume: number | null;
  adj_open: number | null;
  adj_high: number | null;
  adj_low: number | null;
  adj_volume: number | null;
  div_cash: number | null;
  split_factor: number | null;
  created_at?: string;
}

export interface DividendRecord {
  id?: number;
  ticker: string;
  ex_date: string;
  pay_date: string | null;
  record_date: string | null;
  declare_date: string | null;
  div_cash: number;
  adj_amount: number | null;      // Split-adjusted dividend amount
  split_factor: number | null;
  div_type: string | null;
  frequency: string | null;       // Mo, Qtr, Week, etc.
  description: string | null;     // Dividend description
  currency: string | null;
  created_at?: string;
}

export interface ETFStaticRecord {
  ticker: string;
  issuer: string | null;
  description: string | null;
  pay_day_text: string | null;
  payments_per_year: number | null;
  ipo_price: number | null;
  default_rank_weights: Record<string, number> | null;

  // Live price fields
  price: number | null;
  price_change: number | null;
  price_change_pct: number | null;

  // Dividend + frequency fields
  last_dividend: number | null;
  annual_dividend: number | null;   // Rolling 365-day sum
  forward_yield: number | null;

  // Volatility metrics (frequency-proof)
  dividend_sd: number | null;
  dividend_cv: number | null;
  dividend_cv_percent: number | null;
  dividend_volatility_index: string | null;

  // Ranking
  weighted_rank: number | null;

  // Total Return WITH DRIP
  tr_drip_3y: number | null;
  tr_drip_12m: number | null;
  tr_drip_6m: number | null;
  tr_drip_3m: number | null;
  tr_drip_1m: number | null;
  tr_drip_1w: number | null;

  // Price Return (non-DRIP)
  price_return_3y: number | null;
  price_return_12m: number | null;
  price_return_6m: number | null;
  price_return_3m: number | null;
  price_return_1m: number | null;
  price_return_1w: number | null;

  // Total Return WITHOUT DRIP
  tr_nodrip_3y: number | null;
  tr_nodrip_12m: number | null;
  tr_nodrip_6m: number | null;
  tr_nodrip_3m: number | null;
  tr_nodrip_1m: number | null;
  tr_nodrip_1w: number | null;

  // 52-week range
  week_52_high: number | null;
  week_52_low: number | null;

  // Metadata
  last_updated: string | null;
  data_source: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SyncLogRecord {
  id?: number;
  ticker: string;
  data_type: 'prices' | 'dividends';
  last_sync_date: string;
  last_data_date: string | null;
  records_synced: number;
  status: 'success' | 'error' | 'pending';
  error_message: string | null;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ETFMetrics {
  ticker: string;
  name: string | null;
  issuer: string | null;
  ipoPrice: number | null;
  payDay: string | null;
  currentPrice: number | null;
  previousClose: number | null;
  priceChange: number | null;
  priceChangePercent: number | null;
  week52High: number | null;
  week52Low: number | null;

  // Dividend data
  lastDividend: number | null;
  annualizedDividend: number | null;  // Rolling 365-day sum
  paymentsPerYear: number;
  forwardYield: number | null;        // annual_dividend / price

  // Volatility metrics (frequency-proof)
  dividendSD: number | null;          // SD of rolling 365D annualized series
  dividendCV: number | null;          // CV as decimal (e.g., 0.18)
  dividendCVPercent: number | null;   // CV as percentage (e.g., 18.0)
  dividendVolatilityIndex: string | null;

  // Weighted ranking
  weightedRank: number | null;

  // Total Return WITH DRIP (using adjClose ratio)
  totalReturnDrip: {
    '1W': number | null;
    '1M': number | null;
    '3M': number | null;
    '6M': number | null;
    '1Y': number | null;
    '3Y': number | null;
  };

  // Price Return (non-DRIP, using unadjusted close)
  priceReturn: {
    '1W': number | null;
    '1M': number | null;
    '3M': number | null;
    '6M': number | null;
    '1Y': number | null;
    '3Y': number | null;
  };

  // Optional: Total Return WITHOUT DRIP
  totalReturnNoDrip: {
    '1W': number | null;
    '1M': number | null;
    '3M': number | null;
    '6M': number | null;
    '1Y': number | null;
    '3Y': number | null;
  } | null;

  // Legacy combined returns for backward compatibility
  returns: {
    '1W': ReturnData;
    '1M': ReturnData;
    '3M': ReturnData;
    '6M': ReturnData;
    '1Y': ReturnData;
    '3Y': ReturnData;
  };

  calculatedAt: string;
  dataSource: string;
}

export interface ReturnData {
  price: number | null;
  total: number | null;
}

export interface ChartDataPoint {
  date: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  divCash: number;
  priceReturn: number;
  totalReturn: number;
}

export interface RankedETF {
  ticker: string;
  yield: number | null;
  totalReturn: number | null;
  volatility: number | null;
  normalizedScores: {
    yield: number;
    totalReturn: number;
    volatility: number;
  };
  compositeScore: number;
  rank: number;
}

export interface RankingWeights {
  yield: number;
  totalReturn: number;
  volatility: number;
}

// ============================================================================
// Utility Types
// ============================================================================

export type ChartPeriod = '1W' | '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'MAX';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
  page: number;
  limit: number;
  total: number;
}
