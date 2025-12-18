export interface CEF {
  symbol: string;
  name: string;
  issuer: string;
  description: string;
  navSymbol?: string; // NAV symbol like XDNPX
  openDate: string | null; // Opening/inception date
  ipoPrice: number | null;
  
  // Price data
  marketPrice: number | null; // MP - Market Price
  nav: number | null; // NAV - Net Asset Value
  premiumDiscount: number | null; // Prem/Disc %
  fiveYearZScore: number | null; // 5 Yr Z-Score
  navTrend6M: number | null; // 6 Mo NAV Trend %
  navTrend12M: number | null; // 12M NAV Return %
  valueHealthScore: number | null; // Value/Health Score
  
  // Dividend data
  lastDividend: number | null; // Last Div
  numPayments: number; // # (payments per year)
  yearlyDividend: number | null; // Yrly Div
  forwardYield: number | null; // F Yield
  dividendHistory: string | null; // DIV HISTO format: "5+ 3-"
  
  // Volatility metrics
  dividendSD: number | null;
  dividendCV: number | null;
  dividendCVPercent: number | null;
  dividendVolatilityIndex: string | null; // DVI
  
  // Returns
  return15Yr: number | null; // 15 YR Annlzd
  return10Yr: number | null; // 10 YR Annlzd
  return5Yr: number | null; // 5 YR Annlzd
  return3Yr: number | null; // 3 YR Annlzd
  return12Mo: number | null; // 12 Month
  return6Mo: number | null; // 6 Month
  return3Mo: number | null; // 3 Month
  return1Mo: number | null; // 1 Month
  return1Wk: number | null; // 1 Week
  
  // Ranking
  weightedRank: number | null;
  
  // 52-week range
  week52Low: number | null;
  week52High: number | null;
  
  // Metadata
  isFavorite?: boolean;
  lastUpdated?: string;
  dataSource?: string;
}

export interface RankingWeights {
  yield: number;
  volatility: number;
  totalReturn: number;
  timeframe?: "3mo" | "6mo" | "12mo";
}

