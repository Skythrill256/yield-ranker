// ...existing code...
import { ETF } from "@/types/etf";
import { fetchRealtimeReturnsBatch } from "@/services/tiingoApi";
// ...existing code...

const dataCache = new Map<string, { data: ETF; timestamp: number }>();
// Cache duration: 10 seconds to ensure fresh data while reducing API calls
// Data is updated daily from Tiingo at 8:00 PM EST via daily_update.ts script
const CACHE_DURATION = 10000;

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
  const symbol = (dbEtf.symbol || dbEtf.ticker || '').toUpperCase().trim();
  const price = dbEtf.price ?? 0;

  // Handle annual dividend - keep null if no data available
  const annualDiv = dbEtf.annual_dividend ?? dbEtf.annual_div ?? null;

  // Handle forward yield:
  // 1. Use database value if present
  // 2. Calculate from annual dividend if available
  // 3. Keep null if no data (shows 'N/A' in UI)
  let forwardYield: number | null = dbEtf.forward_yield ?? null;

  if (forwardYield === null && price > 0 && annualDiv != null && annualDiv > 0) {
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
    annualDividend: annualDiv ?? null,
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
    const lastUpdatedTimestamp = Array.isArray(json) ? null : (json.last_updated_timestamp || json.lastUpdatedTimestamp || json.last_updated || null);

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
      adjCloses?: number[];
    };
  };
};

export const fetchComparisonData = async (
  symbols: string[],
  timeframe: ComparisonTimeframe,
): Promise<ComparisonResponse> => {
  const normalizedSymbols = symbols.map(s => s.toUpperCase().trim()).filter(s => s.length > 0);

  if (normalizedSymbols.length === 0) {
    return {
      symbols: [],
      timeframe,
      data: {},
    };
  }

  const response = await fetch(`${API_BASE_URL}/api/tiingo/live/compare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tickers: normalizedSymbols, period: timeframe }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch comparison data: ${errorText || response.statusText}`);
  }

  const json = await response.json();

  const transformedData: ComparisonResponse = {
    symbols: (json.tickers || normalizedSymbols).map((t: string) => t.toUpperCase()),
    timeframe,
    data: {},
  };

  const responseData = json.data || {};
  for (const ticker of transformedData.symbols) {
    const tickerData = responseData[ticker] || responseData[ticker.toUpperCase()] || responseData[ticker.toLowerCase()];
    if (tickerData && tickerData.timestamps) {
      transformedData.data[ticker.toUpperCase()] = {
        timestamps: tickerData.timestamps,
        closes: tickerData.closes || tickerData.adjCloses || [],
        adjCloses: tickerData.adjCloses || tickerData.closes || [],
      };
    }
  }

  return transformedData;
};

function getPeriodStartDate(timeframe: ComparisonTimeframe): Date {
  const now = new Date();
  const start = new Date(now);

  switch (timeframe) {
    case "1D":
      start.setDate(start.getDate() - 1);
      break;
    case "1W":
      start.setDate(start.getDate() - 7);
      break;
    case "1M":
      start.setMonth(start.getMonth() - 1);
      break;
    case "3M":
      start.setMonth(start.getMonth() - 3);
      break;
    case "6M":
      start.setMonth(start.getMonth() - 6);
      break;
    case "YTD":
      start.setMonth(0);
      start.setDate(1);
      break;
    case "1Y":
      start.setFullYear(start.getFullYear() - 1);
      break;
    case "3Y":
      start.setFullYear(start.getFullYear() - 3);
      break;
    case "5Y":
      start.setFullYear(start.getFullYear() - 5);
      break;
    case "10Y":
      start.setFullYear(start.getFullYear() - 10);
      break;
    case "20Y":
      start.setFullYear(start.getFullYear() - 20);
      break;
    case "MAX":
      start.setFullYear(2000, 0, 1);
      break;
    default:
      start.setFullYear(start.getFullYear() - 1);
  }

  return start;
}

export const generateChartData = (
  comparison: ComparisonResponse,
  chartType: ChartType,
): any[] => {
  if (!comparison.symbols.length || !comparison.data) {
    return [];
  }

  const firstValidPrice: Record<string, number> = {};
  const timestampToData: Map<number, Map<string, number>> = new Map();

  for (const symbol of comparison.symbols) {
    const series = comparison.data[symbol];
    if (!series || !series.timestamps) continue;

    // Use closes for price return, adjCloses for total return
    const prices = chartType === "price"
      ? (series.closes || [])
      : (series.adjCloses || series.closes || []);

    if (!prices || prices.length === 0) continue;

    for (let i = 0; i < series.timestamps.length && i < prices.length; i++) {
      const ts = series.timestamps[i];
      const price = prices[i];

      if (price == null || isNaN(price) || price <= 0) continue;

      if (!firstValidPrice[symbol]) {
        firstValidPrice[symbol] = price;
      }

      if (!timestampToData.has(ts)) {
        timestampToData.set(ts, new Map());
      }
      timestampToData.get(ts)!.set(symbol, price);
    }
  }

  if (timestampToData.size === 0) {
    return [];
  }

  const allTimestamps = Array.from(timestampToData.keys()).sort((a, b) => a - b);
  const primarySymbol = comparison.symbols[0];

  const periodStart = getPeriodStartDate(comparison.timeframe);
  const periodStartTs = Math.floor(periodStart.getTime() / 1000);
  const firstDataTs = allTimestamps[0];

  const result: any[] = [];

  if (firstDataTs > periodStartTs) {
    const daysDiff = Math.ceil((firstDataTs - periodStartTs) / 86400);
    const sampleInterval = Math.max(1, Math.floor(daysDiff / 20));

    for (let ts = periodStartTs; ts < firstDataTs; ts += sampleInterval * 86400) {
      const date = new Date(ts * 1000);
      let timeLabel: string;

      if (comparison.timeframe === "1D") {
        timeLabel = date.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        });
      } else if (comparison.timeframe === "1W" || comparison.timeframe === "1M") {
        timeLabel = date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
      } else if (["3M", "6M", "YTD", "1Y"].includes(comparison.timeframe)) {
        timeLabel = date.toLocaleDateString(undefined, {
          month: "short",
          year: "2-digit",
        });
      } else {
        timeLabel = date.toLocaleDateString(undefined, {
          month: "short",
          year: "numeric",
        });
      }

      const point: Record<string, number | string | null> = {
        time: timeLabel,
        fullDate: date.toISOString(),
        timestamp: ts,
      };

      for (const symbol of comparison.symbols) {
        if (symbol === primarySymbol && comparison.symbols.length === 1) {
          point.price = null;
        } else {
          if (chartType === "price") {
            point[`price_${symbol}`] = null;
          } else {
            point[`return_${symbol}`] = null;
          }
        }
      }

      result.push(point);
    }
  }

  for (const ts of allTimestamps) {
    const date = new Date(ts * 1000);
    let timeLabel: string;

    if (comparison.timeframe === "1D") {
      timeLabel = date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (comparison.timeframe === "1W" || comparison.timeframe === "1M") {
      timeLabel = date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } else if (["3M", "6M", "YTD", "1Y"].includes(comparison.timeframe)) {
      timeLabel = date.toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      });
    } else {
      timeLabel = date.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });
    }

    const point: Record<string, number | string | null> = {
      time: timeLabel,
      fullDate: date.toISOString(),
      timestamp: ts,
    };

    let hasValidData = false;
    const dataAtTimestamp = timestampToData.get(ts)!;

    for (const symbol of comparison.symbols) {
      const price = dataAtTimestamp.get(symbol);
      if (price == null || isNaN(price) || price <= 0) continue;

      const base = firstValidPrice[symbol];
      if (!base || base <= 0) continue;

      if (chartType === "price") {
        const priceReturn = ((price - base) / base) * 100;
        if (typeof priceReturn === 'number' && !isNaN(priceReturn) && isFinite(priceReturn)) {
          if (symbol === primarySymbol && comparison.symbols.length === 1) {
            point.price = Number(priceReturn.toFixed(2));
          } else {
            point[`price_${symbol}`] = Number(priceReturn.toFixed(2));
          }
          hasValidData = true;
        }
      } else {
        const totalReturn = ((price - base) / base) * 100;
        if (typeof totalReturn === 'number' && !isNaN(totalReturn) && isFinite(totalReturn)) {
          if (symbol === primarySymbol && comparison.symbols.length === 1) {
            point.price = Number(totalReturn.toFixed(2));
          } else {
            point[`return_${symbol}`] = Number(totalReturn.toFixed(2));
          }
          hasValidData = true;
        }
      }
    }

    if (hasValidData) {
      result.push(point);
    }
  }

  return result;
};

// Note: Quick updates and dividend history are now fetched via Tiingo API
// Use tiingoApi.ts for these functions

/**
 * Update ETF data with realtime returns from IEX
 * This provides accurate current prices and returns during market hours
 */
export async function updateETFsWithRealtimeData(
  etfs: ETF[]
): Promise<{ updatedETFs: ETF[]; isRealtime: boolean }> {

  const tickers = etfs.map(etf => etf.symbol);
  const realtimeData = await fetchRealtimeReturnsBatch(tickers);

  if (Object.keys(realtimeData).length === 0) {
    return { updatedETFs: etfs, isRealtime: false };
  }

  const updatedETFs = etfs.map(etf => {
    const realtime = realtimeData[etf.symbol.toUpperCase()];
    if (!realtime) return etf;

    // Update price and returns with realtime data
    return {
      ...etf,
      price: realtime.currentPrice,
      priceChange: realtime.priceChange,
      priceChangePercent: realtime.priceChangePercent,
      // Update price returns
      priceReturn1Wk: realtime.priceReturn['1W'],
      priceReturn1Mo: realtime.priceReturn['1M'],
      priceReturn3Mo: realtime.priceReturn['3M'],
      priceReturn6Mo: realtime.priceReturn['6M'],
      priceReturn12Mo: realtime.priceReturn['1Y'],
      priceReturn3Yr: realtime.priceReturn['3Y'],
      // Update total returns with DRIP
      trDrip1Wk: realtime.totalReturnDrip['1W'],
      trDrip1Mo: realtime.totalReturnDrip['1M'],
      trDrip3Mo: realtime.totalReturnDrip['3M'],
      trDrip6Mo: realtime.totalReturnDrip['6M'],
      trDrip12Mo: realtime.totalReturnDrip['1Y'],
      trDrip3Yr: realtime.totalReturnDrip['3Y'],
      // Legacy fields
      totalReturn1Wk: realtime.totalReturnDrip['1W'],
      totalReturn1Mo: realtime.totalReturnDrip['1M'],
      totalReturn3Mo: realtime.totalReturnDrip['3M'],
      totalReturn6Mo: realtime.totalReturnDrip['6M'],
      totalReturn12Mo: realtime.totalReturnDrip['1Y'],
      totalReturn3Yr: realtime.totalReturnDrip['3Y'],
      // Recalculate forward yield with new price
      forwardYield: etf.annualDividend && realtime.currentPrice > 0
        ? (etf.annualDividend / realtime.currentPrice) * 100
        : etf.forwardYield,
      // Mark as realtime updated
      lastUpdated: realtime.timestamp,
    };
  });

  return {
    updatedETFs,
    isRealtime: Object.values(realtimeData).some(r => r.isRealtime)
  };
}
