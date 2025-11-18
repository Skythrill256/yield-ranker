export interface ETF {
  symbol: string;
  name: string;
  issuer: string;
  description: string;
  ipoPrice: number;
  price: number;
  priceChange: number;
  dividend: number;
  numPayments: number;
  annualDividend: number;
  rocTax?: string;
  payDay?: string;
  forwardYield: number;
  standardDeviation: number;
  weightedRank: number | null;
  week52Low: number;
  week52High: number;
  totalReturn3Yr?: number | null;
  totalReturn12Mo?: number | null;
  totalReturn6Mo?: number | null;
  totalReturn3Mo?: number | null;
  totalReturn1Mo?: number | null;
  totalReturn1Wk?: number | null;
  priceReturn3Yr?: number;
  priceReturn12Mo?: number;
  priceReturn6Mo?: number;
  priceReturn3Mo?: number;
  priceReturn1Mo?: number;
  priceReturn1Wk?: number;
  isFavorite?: boolean;
}

export interface RankingWeights {
  yield: number;
  stdDev: number;
  totalReturn: number;
  timeframe?: "3mo" | "6mo" | "12mo";
}
