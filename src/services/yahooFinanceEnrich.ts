import { ETF } from "@/types/etf";

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface YahooReturns {
  priceReturn1Wk: number | null;
  priceReturn1Mo: number | null;
  priceReturn3Mo: number | null;
  priceReturn6Mo: number | null;
  priceReturn12Mo: number | null;
  priceReturn3Yr: number | null;
  totalReturn1Wk: number | null;
  totalReturn1Mo: number | null;
  totalReturn3Mo: number | null;
  totalReturn6Mo: number | null;
  totalReturn12Mo: number | null;
  totalReturn3Yr: number | null;
  currentPrice: number | null;
  priceChange: number | null;
}

const returnsCache = new Map<string, { data: YahooReturns; timestamp: number }>();
const CACHE_DURATION = 300000;

async function fetchYahooReturns(symbol: string): Promise<YahooReturns | null> {
  const cached = returnsCache.get(symbol);
  const now = Date.now();
  
  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/yahoo-finance/returns?symbol=${encodeURIComponent(symbol)}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const returns: YahooReturns = {
      priceReturn1Wk: data.priceReturn1Wk ?? null,
      priceReturn1Mo: data.priceReturn1Mo ?? null,
      priceReturn3Mo: data.priceReturn3Mo ?? null,
      priceReturn6Mo: data.priceReturn6Mo ?? null,
      priceReturn12Mo: data.priceReturn12Mo ?? null,
      priceReturn3Yr: data.priceReturn3Yr ?? null,
      totalReturn1Wk: data.totalReturn1Wk ?? null,
      totalReturn1Mo: data.totalReturn1Mo ?? null,
      totalReturn3Mo: data.totalReturn3Mo ?? null,
      totalReturn6Mo: data.totalReturn6Mo ?? null,
      totalReturn12Mo: data.totalReturn12Mo ?? null,
      totalReturn3Yr: data.totalReturn3Yr ?? null,
      currentPrice: data.currentPrice ?? null,
      priceChange: data.priceChange ?? null,
    };

    returnsCache.set(symbol, { data: returns, timestamp: now });
    return returns;
  } catch (error) {
    console.warn(`[Yahoo Finance] Failed to fetch returns for ${symbol}:`, error);
    return null;
  }
}

export async function enrichETFWithYahooData(etf: ETF): Promise<ETF> {
  const yahooData = await fetchYahooReturns(etf.symbol);
  
  if (!yahooData) {
    return {
      ...etf,
      priceReturn1Wk: undefined,
      priceReturn1Mo: undefined,
      priceReturn3Mo: undefined,
      priceReturn6Mo: undefined,
      priceReturn12Mo: undefined,
      priceReturn3Yr: undefined,
    };
  }

  return {
    ...etf,
    price: etf.price && etf.price > 0 ? etf.price : (yahooData.currentPrice ?? etf.price),
    priceChange: etf.priceChange !== 0 ? etf.priceChange : (yahooData.priceChange ?? etf.priceChange),
    totalReturn1Wk: etf.totalReturn1Wk ?? yahooData.totalReturn1Wk ?? undefined,
    totalReturn1Mo: etf.totalReturn1Mo ?? yahooData.totalReturn1Mo ?? undefined,
    totalReturn3Mo: etf.totalReturn3Mo ?? yahooData.totalReturn3Mo ?? undefined,
    totalReturn6Mo: etf.totalReturn6Mo ?? yahooData.totalReturn6Mo ?? undefined,
    totalReturn12Mo: etf.totalReturn12Mo ?? yahooData.totalReturn12Mo ?? undefined,
    totalReturn3Yr: etf.totalReturn3Yr ?? yahooData.totalReturn3Yr ?? undefined,
    priceReturn1Wk: yahooData.priceReturn1Wk ?? undefined,
    priceReturn1Mo: yahooData.priceReturn1Mo ?? undefined,
    priceReturn3Mo: yahooData.priceReturn3Mo ?? undefined,
    priceReturn6Mo: yahooData.priceReturn6Mo ?? undefined,
    priceReturn12Mo: yahooData.priceReturn12Mo ?? undefined,
    priceReturn3Yr: yahooData.priceReturn3Yr ?? undefined,
  };
}

export async function enrichETFList(etfs: ETF[]): Promise<ETF[]> {
  const enrichPromises = etfs.map(etf => enrichETFWithYahooData(etf));
  return Promise.all(enrichPromises);
}

export function clearReturnsCache() {
  returnsCache.clear();
}

