import { ETF } from "@/types/etf";

const dataCache = new Map<string, { data: ETF; timestamp: number }>();
const CACHE_DURATION = 30000;

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type DatabaseETF = {
  symbol: string;
  issuer: string | null;
  description: string | null;
  pay_day: string | null;
  ipo_price: number | null;
  price: number | null;
  price_change: number | null;
  dividend: number | null;
  payments_per_year: number | null;
  annual_div: number | null;
  forward_yield: number | null;
  dividend_volatility_index: number | null;
  weighted_rank: number | null;
  three_year_annualized: number | null;
  total_return_12m: number | null;
  total_return_6m: number | null;
  total_return_3m: number | null;
  total_return_1m: number | null;
  total_return_1w: number | null;
  price_return_3y: number | null;
  price_return_12m: number | null;
  price_return_6m: number | null;
  price_return_3m: number | null;
  price_return_1m: number | null;
  price_return_1w: number | null;
};

function mapDatabaseETFToETF(dbEtf: DatabaseETF): ETF {
  const price = dbEtf.price ?? 0;
  const annualDiv = dbEtf.annual_div ?? 0;
  let forwardYield = dbEtf.forward_yield ?? 0;
  
  if (price > 0 && annualDiv > 0) {
    forwardYield = (annualDiv / price) * 100;
  }

  return {
    symbol: dbEtf.symbol,
    name: dbEtf.description || dbEtf.symbol,
    issuer: dbEtf.issuer || '',
    description: dbEtf.description || '',
    payDay: dbEtf.pay_day || undefined,
    ipoPrice: dbEtf.ipo_price ?? 0,
    price: price,
    priceChange: dbEtf.price_change ?? 0,
    dividend: dbEtf.dividend ?? 0,
    numPayments: dbEtf.payments_per_year ?? 12,
    annualDividend: annualDiv,
    forwardYield: forwardYield,
    standardDeviation: dbEtf.dividend_volatility_index ?? 0,
    weightedRank: dbEtf.weighted_rank ?? null,
    week52Low: 0,
    week52High: 0,
    totalReturn3Yr: dbEtf.three_year_annualized ?? undefined,
    totalReturn12Mo: dbEtf.total_return_12m ?? undefined,
    totalReturn6Mo: dbEtf.total_return_6m ?? undefined,
    totalReturn3Mo: dbEtf.total_return_3m ?? undefined,
    totalReturn1Mo: dbEtf.total_return_1m ?? undefined,
    totalReturn1Wk: dbEtf.total_return_1w ?? undefined,
    priceReturn3Yr: dbEtf.price_return_3y ?? undefined,
    priceReturn12Mo: dbEtf.price_return_12m ?? undefined,
    priceReturn6Mo: dbEtf.price_return_6m ?? undefined,
    priceReturn3Mo: dbEtf.price_return_3m ?? undefined,
    priceReturn1Mo: dbEtf.price_return_1m ?? undefined,
    priceReturn1Wk: dbEtf.price_return_1w ?? undefined,
  };
}

export const fetchETFData = async (): Promise<ETF[]> => {
  const cached = dataCache.get("__ALL__");
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return cached.data as unknown as ETF[];
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/etfs`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) {
      throw new Error("Failed to fetch ETF data");
    }
    const json = await response.json();
    const dbEtfs: DatabaseETF[] = json.data;
    const etfs: ETF[] = dbEtfs.map(mapDatabaseETFToETF);
    dataCache.set("__ALL__", { data: etfs as unknown as ETF, timestamp: now });
    return etfs;
  } catch (error) {
    console.warn('[ETF Data] Backend not available, using mock data. Error:', error);
    const { mockETFs } = await import('@/data/mockETFs');
    return mockETFs;
  }
};

export const fetchSingleETF = async (symbol: string): Promise<ETF | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/etfs/${symbol.toUpperCase()}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error("Failed to fetch ETF");
    }
    const json = await response.json();
    const dbEtf: DatabaseETF = json.data;
    return mapDatabaseETFToETF(dbEtf);
  } catch (error) {
    console.warn('[ETF Data] Backend not available for single ETF, falling back to all data');
    const all = await fetchETFData();
    return all.find(e => e.symbol === symbol.toUpperCase()) || null;
  }
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
  const response = await fetch(`${API_BASE_URL}/api/yahoo-finance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "fetchComparisonData", symbols, timeframe }),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch comparison data");
  }
  const json = await response.json();
  return json.data as ComparisonResponse;
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
    const point: Record<string, number | string> = {
      time:
        comparison.timeframe === "1D"
          ? new Date(ts * 1000).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })
          : new Date(ts * 1000).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }),
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
  
  return result;
};

export const fetchQuickUpdates = async (
  symbols: string[],
): Promise<Record<string, { price: number | null; priceChange: number | null }>> => {
  const response = await fetch(`${API_BASE_URL}/api/yahoo-finance/quick-update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ symbols }),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch quick updates");
  }
  const json = await response.json();
  const data = json.data as Record<
    string,
    { symbol: string; price: number | null; priceChange: number | null }
  >;
  const result: Record<string, { price: number | null; priceChange: number | null }> = {};
  Object.keys(data).forEach((key) => {
    const q = data[key];
    result[key] = { price: q.price ?? null, priceChange: q.priceChange ?? null };
  });
  return result;
};

export type DividendHistoryPoint = {
  date: string;
  dividend: number;
};

export const fetchDividendHistory = async (
  symbol: string,
): Promise<DividendHistoryPoint[]> => {
  const response = await fetch(
    `${API_BASE_URL}/api/yahoo-finance/dividends?symbol=${encodeURIComponent(symbol)}`,
  );
  if (!response.ok) {
    throw new Error("Failed to fetch dividend history");
  }
  const json = await response.json();
  const data = json.data as { symbol: string; dividends: DividendHistoryPoint[] };
  const dividends = data.dividends || [];
  dividends.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return dividends;
};
