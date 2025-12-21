import { CEF } from "@/types/cef";

const API_URL = import.meta.env.VITE_API_URL || "";

export interface CEFDataResponse {
  cefs: CEF[];
  lastUpdated?: string;
  lastUpdatedTimestamp?: string;
}

// Cache management
const CEF_CACHE_KEY = "cef-data-cache";
const CEF_CACHE_TIMESTAMP_KEY = "cef-data-cache-timestamp";
// Cache duration: 24 hours - data is updated daily from backend
// Frontend fetches once and keeps cached data until manually refreshed or cache expires
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours (same as ETFs)

export function isCEFDataCached(): boolean {
  try {
    const cached = localStorage.getItem(CEF_CACHE_KEY);
    const timestamp = localStorage.getItem(CEF_CACHE_TIMESTAMP_KEY);
    if (!cached || !timestamp) return false;
    
    const cacheAge = Date.now() - parseInt(timestamp, 10);
    return cacheAge < CACHE_DURATION_MS;
  } catch {
    return false;
  }
}

export function clearCEFCache(): void {
  try {
    localStorage.removeItem(CEF_CACHE_KEY);
    localStorage.removeItem(CEF_CACHE_TIMESTAMP_KEY);
  } catch (error) {
    console.error("Failed to clear CEF cache:", error);
  }
}

export async function fetchCEFData(): Promise<CEF[]> {
  try {
    const response = await fetch(`${API_URL}/api/cefs`);
    if (!response.ok) {
      throw new Error(`Failed to fetch CEF data: ${response.statusText}`);
    }
    const data = await response.json();
    return data.cefs || data || [];
  } catch (error) {
    console.error("Error fetching CEF data:", error);
    throw error;
  }
}

export async function fetchCEFDataWithMetadata(): Promise<CEFDataResponse> {
  // Check cache first - return immediately if valid cache exists (like ETFs do)
  if (isCEFDataCached()) {
    const cached = localStorage.getItem(CEF_CACHE_KEY);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        // Use the lastUpdatedTimestamp from the cached data, not the cache timestamp
        return {
          ...data,
          lastUpdatedTimestamp: data.lastUpdatedTimestamp || data.last_updated_timestamp || undefined,
          lastUpdated: data.lastUpdated || data.last_updated || undefined,
        };
      } catch (parseError) {
        console.warn("Failed to parse cached CEF data:", parseError);
        // Fall through to fetch fresh data
      }
    }
  }

  // Try to fetch fresh data from server
  let fetchError: Error | null = null;
  try {
    // Add timeout to fetch request - increased to 90 seconds to allow for database queries
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout
    
    try {
      const response = await fetch(`${API_URL}/api/cefs`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch CEF data: ${response.statusText}`);
      }
      const json = await response.json();
    
      // Handle both array response and wrapped response (same as ETF data)
      const cefs: CEF[] = Array.isArray(json) ? json : (json.cefs || []);
      const lastUpdated = Array.isArray(json) ? null : (json.last_updated || json.lastUpdated || null);
      const lastUpdatedTimestamp = Array.isArray(json) ? null : (json.last_updated_timestamp || json.lastUpdatedTimestamp || json.last_updated || null);
      
      const data: CEFDataResponse = {
        cefs,
        lastUpdated,
        lastUpdatedTimestamp,
      };
      
      // Cache the response
      try {
        localStorage.setItem(CEF_CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CEF_CACHE_TIMESTAMP_KEY, Date.now().toString());
      } catch (cacheError) {
        console.warn("Failed to cache CEF data:", cacheError);
      }
      
      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        fetchError = new Error("Request timeout: CEF data fetch took too long");
      } else {
        fetchError = err instanceof Error ? err : new Error(String(err));
      }
      throw fetchError;
    }
  } catch (error) {
    // If fetch failed, try to use stale cache as fallback (even if expired)
    // This matches ETF behavior - show cached data when server is down
    console.warn("[CEF Data] Failed to fetch CEF data from backend, attempting to use cached data:", error);
    
    const staleCache = localStorage.getItem(CEF_CACHE_KEY);
    if (staleCache) {
      try {
        const data = JSON.parse(staleCache);
        console.log("[CEF Data] Using stale cached data as fallback");
        return {
          ...data,
          lastUpdatedTimestamp: data.lastUpdatedTimestamp || data.last_updated_timestamp || undefined,
          lastUpdated: data.lastUpdated || data.last_updated || undefined,
        };
      } catch (parseError) {
        console.error("[CEF Data] Failed to parse stale cache:", parseError);
      }
    }
    
    // No cache available, throw the original error
    throw fetchError || (error instanceof Error ? error : new Error(String(error)));
  }
}

export async function fetchSingleCEF(symbol: string): Promise<CEF | null> {
  try {
    const response = await fetch(`${API_URL}/api/cefs/${symbol}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch CEF data: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching single CEF:", error);
    return null;
  }
}

export interface PriceNAVData {
  date: string;
  price: number | null;
  nav: number | null;
}

export interface PriceNAVResponse {
  symbol: string;
  navSymbol: string | null;
  period: string;
  data: PriceNAVData[];
}

export async function fetchCEFPriceNAV(symbol: string, period: string = '1Y'): Promise<PriceNAVResponse> {
  try {
    const response = await fetch(`${API_URL}/api/cefs/${symbol}/price-nav?period=${period}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch price/NAV data: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching CEF price/NAV data:", error);
    throw error;
  }
}
