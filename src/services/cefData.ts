import { CEF } from "@/types/cef";

const API_URL = import.meta.env.VITE_API_URL || "";

export interface CEFDataResponse {
  cefs: CEF[];
  lastUpdated?: string;
  lastUpdatedTimestamp?: string;
}

// NO CACHING - Always fetch fresh data from database for consistency
// This ensures data is always up-to-date after running refresh:cef or refresh:all

export function isCEFDataCached(): boolean {
  // Always return false - no caching, always fetch fresh data
  return false;
}

export function clearCEFCache(): void {
  // No-op - no caching to clear
  // Kept for backwards compatibility with components that call it
  try {
    // Clear any old cache that might exist from previous versions
    localStorage.removeItem("cef-data-cache");
    localStorage.removeItem("cef-data-cache-timestamp");
    localStorage.removeItem("cef-data-cache-version");
  } catch (error) {
    // Ignore errors
  }
}

export async function fetchCEFData(): Promise<CEF[]> {
  try {
    // NO CACHING - Always fetch fresh data from database
    // Use timestamp query param for cache-busting (doesn't require CORS header)
    const response = await fetch(`${API_URL}/api/cefs?t=${Date.now()}`);
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
  // NO CACHING - Always fetch fresh data from database for consistency
  // This ensures data is always up-to-date after running refresh:cef or refresh:all
  
  try {
    // Add timeout to fetch request - increased to 90 seconds to allow for database queries
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout

    try {
      // Use timestamp query param for cache-busting (doesn't require CORS header)
      const response = await fetch(`${API_URL}/api/cefs?t=${Date.now()}`, {
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

      // NO CACHING - Return fresh data directly from database
      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error("Request timeout: CEF data fetch took too long");
      } else {
        throw err instanceof Error ? err : new Error(String(err));
      }
    }
  } catch (error) {
    console.error("[CEF Data] Failed to fetch CEF data from backend:", error);
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function fetchSingleCEF(symbol: string): Promise<CEF | null> {
  try {
    // NO CACHING - Always fetch fresh data from database
    // Use timestamp query param for cache-busting (doesn't require CORS header)
    const response = await fetch(`${API_URL}/api/cefs/${symbol}?t=${Date.now()}`);
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
    // NO CACHING - Always fetch fresh chart data from database
    // Use timestamp query param for cache-busting (doesn't require CORS header)
    const response = await fetch(`${API_URL}/api/cefs/${symbol}/price-nav?period=${period}&t=${Date.now()}`);
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
