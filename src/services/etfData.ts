// ...existing code...
import { ETF } from "@/types/etf";
// ...existing code...

const dataCache = new Map<string, { data: ETF; timestamp: number }>();
const CACHE_DURATION = 30000;

const API_BASE_URL = (import.meta as any).env.VITE_API_URL || '';

type DatabaseETF = {
  symbol?: string;
  ticker?: string;  // etf_static uses ticker
  issuer: string | null;
  description: string | null;
  pay_day?: string | null;
  pay_day_text?: string | null;  // etf_static uses pay_day_text
  ipo_price: number | null;
  price: number | null;
  price_change?: number | null;
  price_change_pct?: number | null;
  dividend?: number | null;
  last_dividend?: number | null;  // etf_static uses last_dividend
  payments_per_year: number | null;
  annual_div?: number | null;
  annual_dividend?: number | null;  // etf_static uses annual_dividend
  forward_yield: number | null;
  
  // Volatility metrics
  dividend_volatility_index?: number | string | null;  // Can be number (old) or string (new)
  dividend_cv_percent?: number | null;
  dividend_cv?: number | null;
  dividend_sd?: number | null;
  
  weighted_rank: number | null;
  
  // Total Return WITH DRIP (new fields from etf_static)
  tr_drip_3y?: number | null;
  tr_drip_12m?: number | null;
  tr_drip_6m?: number | null;
  tr_drip_3m?: number | null;
  tr_drip_1m?: number | null;
  tr_drip_1w?: number | null;
  
  // Legacy total return fields (old etfs table)
  three_year_annualized?: number | null;
  total_return_12m?: number | null;
  total_return_6m?: number | null;
  total_return_3m?: number | null;
  total_return_1m?: number | null;
  total_return_1w?: number | null;
  
  // Price Return
  price_return_3y: number | null;
  price_return_12m: number | null;
  price_return_6m: number | null;
  price_return_3m: number | null;
  price_return_1m: number | null;
  price_return_1w: number | null;
  
  // 52-week range
  week_52_high?: number | null;
  week_52_low?: number | null;
  
  // Metadata
  last_updated?: string | null;
  last_updated_timestamp?: string | null;
};

function mapDatabaseETFToETF(dbEtf: DatabaseETF): ETF {
  const symbol = dbEtf.symbol || dbEtf.ticker || '';
  const price = dbEtf.price ?? 0;
  const annualDiv = (dbEtf.annual_dividend ?? dbEtf.annual_div) ?? 0;
  let forwardYield = dbEtf.forward_yield ?? 0;
  
  if (price > 0 && annualDiv > 0 && !forwardYield) {
    forwardYield = (annualDiv / price) * 100;
  }

  // Handle dividend volatility - can be string (new) or number (old)
  let dividendVolatilityIndex: string | null = null;
  let dividendCVPercent: number | null = null;
  
  if (typeof dbEtf.dividend_volatility_index === 'string') {
    dividendVolatilityIndex = dbEtf.dividend_volatility_index;
  } else if (typeof dbEtf.dividend_volatility_index === 'number') {
    dividendCVPercent = dbEtf.dividend_volatility_index;
  }
  
  if (dbEtf.dividend_cv_percent != null) {
    dividendCVPercent = dbEtf.dividend_cv_percent;
  }

  return {
    symbol: symbol,
    name: dbEtf.description || symbol,
    issuer: dbEtf.issuer || '',
    description: dbEtf.description || '',
    payDay: (dbEtf.pay_day_text || dbEtf.pay_day) || undefined,
    ipoPrice: dbEtf.ipo_price ?? 0,
    price: price,
    priceChange: dbEtf.price_change ?? 0,
    priceChangePercent: dbEtf.price_change_pct ?? null,
    dividend: (dbEtf.last_dividend ?? dbEtf.dividend) ?? 0,
    numPayments: dbEtf.payments_per_year ?? 12,
    annualDividend: annualDiv,
    forwardYield: forwardYield,
    
    // Volatility metrics
    dividendSD: dbEtf.dividend_sd ?? null,
    dividendCV: dbEtf.dividend_cv ?? null,
    dividendCVPercent: dividendCVPercent,
    dividendVolatilityIndex: dividendVolatilityIndex,
    
    // Legacy field for backward compatibility
    standardDeviation: dividendCVPercent ?? 0,
    
    weightedRank: dbEtf.weighted_rank ?? null,
    week52Low: dbEtf.week_52_low ?? 0,
    week52High: dbEtf.week_52_high ?? 0,
    
    // Total Return WITH DRIP - prefer new fields, fallback to legacy
    trDrip3Yr: (dbEtf.tr_drip_3y ?? dbEtf.three_year_annualized) ?? null,
    trDrip12Mo: (dbEtf.tr_drip_12m ?? dbEtf.total_return_12m) ?? null,
    trDrip6Mo: (dbEtf.tr_drip_6m ?? dbEtf.total_return_6m) ?? null,
    trDrip3Mo: (dbEtf.tr_drip_3m ?? dbEtf.total_return_3m) ?? null,
    trDrip1Mo: (dbEtf.tr_drip_1m ?? dbEtf.total_return_1m) ?? null,
    trDrip1Wk: (dbEtf.tr_drip_1w ?? dbEtf.total_return_1w) ?? null,
    
    // Legacy fields for backward compatibility
    totalReturn3Yr: (dbEtf.tr_drip_3y ?? dbEtf.three_year_annualized) ?? null,
    totalReturn12Mo: (dbEtf.tr_drip_12m ?? dbEtf.total_return_12m) ?? null,
    totalReturn6Mo: (dbEtf.tr_drip_6m ?? dbEtf.total_return_6m) ?? null,
    totalReturn3Mo: (dbEtf.tr_drip_3m ?? dbEtf.total_return_3m) ?? null,
    totalReturn1Mo: (dbEtf.tr_drip_1m ?? dbEtf.total_return_1m) ?? null,
    totalReturn1Wk: (dbEtf.tr_drip_1w ?? dbEtf.total_return_1w) ?? null,
    
    // Price Return
    priceReturn3Yr: dbEtf.price_return_3y ?? null,
    priceReturn12Mo: dbEtf.price_return_12m ?? null,
    priceReturn6Mo: dbEtf.price_return_6m ?? null,
    priceReturn3Mo: dbEtf.price_return_3m ?? null,
    priceReturn1Mo: dbEtf.price_return_1m ?? null,
    priceReturn1Wk: dbEtf.price_return_1w ?? null,
  };
}

export type ETFDataResponse = {
  etfs: ETF[];
  lastUpdated: string | null;
  lastUpdatedTimestamp: string | null;
};

export const fetchETFData = async (): Promise<ETF[]> => {
  const result = await fetchETFDataWithMetadata();
  return result.etfs;
};

export const fetchETFDataWithMetadata = async (): Promise<ETFDataResponse> => {
  const cached = dataCache.get("__ALL__");
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return {
      etfs: cached.data as unknown as ETF[],
      lastUpdated: (cached as any).lastUpdated || null,
      lastUpdatedTimestamp: (cached as any).lastUpdatedTimestamp || null,
    };
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/etfs`, {
      signal: AbortSignal.timeout(30000)  // 30 seconds timeout
    });
    if (!response.ok) {
      throw new Error("Failed to fetch ETF data");
    }
    const json = await response.json();
    // Handle both array response and wrapped response
    const dbEtfs: DatabaseETF[] = Array.isArray(json) ? json : (json.data || []);
    const etfs: ETF[] = dbEtfs.map(mapDatabaseETFToETF);
    const lastUpdated = Array.isArray(json) ? null : (json.last_updated || json.lastUpdated || null);
    const lastUpdatedTimestamp = Array.isArray(json) ? null : (json.last_updated_timestamp || json.lastUpdatedTimestamp || null);
    
    dataCache.set("__ALL__", { 
      data: etfs as unknown as ETF, 
      timestamp: now,
      lastUpdated,
      lastUpdatedTimestamp,
    } as any);
    
    return {
      etfs,
      lastUpdated,
      lastUpdatedTimestamp,
    };
  } catch (error) {
    console.error('[ETF Data] Failed to fetch ETF data from backend:', error);
    throw new Error('Unable to load ETF data. Please ensure the backend server is running.');
  }
};

export const fetchSingleETF = async (symbol: string): Promise<ETF | null> => {
  const response = await fetch(`${API_BASE_URL}/api/etfs/${symbol.toUpperCase()}`, {
    signal: AbortSignal.timeout(30000)  // 30 seconds timeout
  });
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error("Failed to fetch ETF");
  }
  const json = await response.json();
  // Handle both direct object and wrapped response
  const dbEtf: DatabaseETF = json.data || json;
  return mapDatabaseETFToETF(dbEtf);
};

export const clearETFCache = () => {
  dataCache.clear();
};

export type ComparisonTimeframe =
  | "1D"
  | "1W"
  | "1M"
  | "3M"
  | "6M"
  | "YTD"
  | "1Y"
  | "3Y"
  | "5Y"
  | "10Y"
  | "20Y"
  | "MAX";

export type ChartType = "price" | "totalReturn";

type ComparisonResponse = {
  symbols: string[];
  timeframe: ComparisonTimeframe;
  data: {
    [symbol: string]: {
      timestamps: number[];
      closes: number[];
    };
  };
};

export const fetchComparisonData = async (
  symbols: string[],
  timeframe: ComparisonTimeframe,
): Promise<ComparisonResponse> => {
  // Use Tiingo live comparison API
  const response = await fetch(`${API_BASE_URL}/api/tiingo/live/compare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tickers: symbols, period: timeframe }),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch comparison data from Tiingo");
  }
  const json = await response.json();
  
  // Transform Tiingo response to match expected format
  const transformedData: ComparisonResponse = {
    symbols: json.tickers || [],
    timeframe,
    data: {},
  };
  
  for (const ticker of transformedData.symbols) {
    const tickerData = json.data[ticker];
    if (tickerData) {
      transformedData.data[ticker] = {
        timestamps: tickerData.timestamps,
        closes: tickerData.adjCloses, // Use adjusted close for total return
      };
    }
  }
  
  return transformedData;
};

export const generateChartData = (
  comparison: ComparisonResponse,
  chartType: ChartType,
): any[] => {
  const primarySymbol = comparison.symbols[0];
  const primary = comparison.data[primarySymbol];
  if (!primary || !primary.timestamps.length || !primary.closes.length) {
    return [];
  }
  
  const firstValidPrice: Record<string, number> = {};
  for (const symbol of comparison.symbols) {
    const series = comparison.data[symbol];
    if (series && series.closes.length > 0) {
      for (let i = 0; i < series.closes.length; i++) {
        const close = series.closes[i];
        if (close != null && !isNaN(close) && close > 0) {
          firstValidPrice[symbol] = close;
          break;
        }
      }
    }
  }

  const length = Math.min(primary.timestamps.length, primary.closes.length);
  const result: any[] = [];
  
  for (let i = 0; i < length; i++) {
    const ts = primary.timestamps[i];
    const date = new Date(ts * 1000);
    let timeLabel: string;
    
    if (comparison.timeframe === "1D") {
      timeLabel = date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      // For monthly/quarterly format: "Jan 2025", "Mar 2025", etc.
      timeLabel = date.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });
    }
    
    const point: Record<string, number | string | number> = {
      time: timeLabel,
      fullDate: date.toISOString(), // Store full date for tooltip
      timestamp: ts, // Store timestamp for sorting/alignment
    };
    
    let hasValidData = false;
    
    for (const symbol of comparison.symbols) {
      const series = comparison.data[symbol];
      if (!series || series.closes[i] == null) continue;
      
      const price = series.closes[i];
      if (isNaN(price) || price <= 0) continue;
      
      if (chartType === "price") {
        if (symbol === primarySymbol && comparison.symbols.length === 1) {
          point.price = Number(price.toFixed(2));
        } else {
          point[`price_${symbol}`] = Number(price.toFixed(2));
        }
        hasValidData = true;
      } else {
        const base = firstValidPrice[symbol];
        if (!base || base <= 0) continue;
        const totalReturn = ((price - base) / base) * 100;
        if (symbol === primarySymbol && comparison.symbols.length === 1) {
          point.price = Number(totalReturn.toFixed(2));
        } else {
          point[`return_${symbol}`] = Number(totalReturn.toFixed(2));
        }
        hasValidData = true;
      }
    }
    
    if (hasValidData) {
      result.push(point);
    }
  }
  
  // Sort by timestamp to ensure proper date order
  result.sort((a, b) => (a.timestamp as number) - (b.timestamp as number));
  
  // For timeframes longer than 1 day, deduplicate months and show monthly intervals
  if (comparison.timeframe !== "1D" && result.length > 0) {
    const deduplicated: any[] = [];
    const seenMonths = new Set<string>();
    
    // Always include first point
    if (result.length > 0) {
      deduplicated.push(result[0]);
      const firstDate = new Date((result[0].timestamp as number) * 1000);
      seenMonths.add(`${firstDate.getFullYear()}-${firstDate.getMonth()}`);
    }
    
    // Process middle points - only include one per month
    for (let i = 1; i < result.length - 1; i++) {
      const date = new Date((result[i].timestamp as number) * 1000);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      
      // Only add if we haven't seen this month yet
      if (!seenMonths.has(monthKey)) {
        // Find the last data point of this month to use
        let lastInMonth = result[i];
        for (let j = i + 1; j < result.length - 1; j++) {
          const nextDate = new Date((result[j].timestamp as number) * 1000);
          const nextMonthKey = `${nextDate.getFullYear()}-${nextDate.getMonth()}`;
          if (nextMonthKey === monthKey) {
            lastInMonth = result[j];
          } else {
            break;
          }
        }
        deduplicated.push(lastInMonth);
        seenMonths.add(monthKey);
      }
    }
    
    // Always include last point if different from first
    if (result.length > 1) {
      const lastDate = new Date((result[result.length - 1].timestamp as number) * 1000);
      const lastMonthKey = `${lastDate.getFullYear()}-${lastDate.getMonth()}`;
      const firstDate = new Date((result[0].timestamp as number) * 1000);
      const firstMonthKey = `${firstDate.getFullYear()}-${firstDate.getMonth()}`;
      
      if (lastMonthKey !== firstMonthKey) {
        // Update time label to match the last data point
        const lastPoint = { ...result[result.length - 1] };
        lastPoint.time = lastDate.toLocaleDateString(undefined, {
          month: "short",
          year: "numeric",
        });
        deduplicated.push(lastPoint);
      }
    }
    
    return deduplicated.length > 0 ? deduplicated : result;
  }
  
  return result;
};

// Note: Quick updates and dividend history are now fetched via Tiingo API
// Use tiingoApi.ts for these functions
