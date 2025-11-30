export interface ETF {
  symbol: string;
  name: string;
  issuer: string;
  description: string;
  ipoPrice: number | null;
  payDay: string | null;
  
  // Live price data
  price: number;
  priceChange: number | null;
  priceChangePercent: number | null;
  
  // Dividend data
  dividend: number | null;           // Latest regular dividend amount
  numPayments: number;                // Payments per year
  annualDividend: number | null;     // Rolling 365-day sum (frequency-proof)
  forwardYield: number | null;       // annual_dividend / price
  
  // Volatility metrics (frequency-proof using rolling 365D annualized series)
  dividendSD: number | null;         // SD of rolling 365D series
  dividendCV: number | null;         // CV as decimal (e.g., 0.18)
  dividendCVPercent: number | null;  // CV as percentage (e.g., 18.0)
  dividendVolatilityIndex: string | null;  // Display label: Very Low, Low, Moderate, High, Very High
  
  // Ranking
  weightedRank: number | null;
  
  // 52-week range
  week52Low: number | null;
  week52High: number | null;
  
  // Total Return WITH DRIP (using adjClose ratio) - main "TOTAL RETURNS" section
  trDrip3Yr: number | null;
  trDrip12Mo: number | null;
  trDrip6Mo: number | null;
  trDrip3Mo: number | null;
  trDrip1Mo: number | null;
  trDrip1Wk: number | null;
  
  // Price Return (non-DRIP) - "PRICE RETURN" section
  priceReturn3Yr: number | null;
  priceReturn12Mo: number | null;
  priceReturn6Mo: number | null;
  priceReturn3Mo: number | null;
  priceReturn1Mo: number | null;
  priceReturn1Wk: number | null;
  
  // Total Return WITHOUT DRIP (optional)
  trNoDrip3Yr?: number | null;
  trNoDrip12Mo?: number | null;
  trNoDrip6Mo?: number | null;
  trNoDrip3Mo?: number | null;
  trNoDrip1Mo?: number | null;
  trNoDrip1Wk?: number | null;
  
  // Legacy fields for backward compatibility
  standardDeviation?: number;        // Deprecated: use dividendCVPercent
  totalReturn3Yr?: number | null;    // Deprecated: use trDrip3Yr
  totalReturn12Mo?: number | null;   // Deprecated: use trDrip12Mo
  totalReturn6Mo?: number | null;    // Deprecated: use trDrip6Mo
  totalReturn3Mo?: number | null;    // Deprecated: use trDrip3Mo
  totalReturn1Mo?: number | null;    // Deprecated: use trDrip1Mo
  totalReturn1Wk?: number | null;    // Deprecated: use trDrip1Wk
  
  // Metadata
  isFavorite?: boolean;
  lastUpdated?: string;
  dataSource?: string;
}

export interface RankingWeights {
  yield: number;
  volatility: number;       // Using dividend CV%
  totalReturn: number;
  timeframe?: "3mo" | "6mo";
}

// Type for dividend history records (for the Dividend History page)
export interface DividendHistoryRecord {
  year: number;
  exDate: string;
  recordDate: string | null;
  payDate: string | null;
  amount: number;
  adjAmount: number | null;
  type: 'Regular' | 'Special' | string;
  frequency: string | null;  // Mo, Qtr, Week, etc.
  description: string | null;
}

// Type for chart data points
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
  priceReturn: number;      // Cumulative price return from start
  totalReturn: number;      // Cumulative total return (with DRIP) from start
}
