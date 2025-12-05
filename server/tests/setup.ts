/**
 * Test Setup and Mocks
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// ============================================================================
// Environment Setup
// ============================================================================

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.FMP_API_KEY = 'test-fmp-api-key-12345678901234567890';
process.env.PORT = '4001';

// ============================================================================
// Mock Supabase Client
// ============================================================================

export const mockSupabaseData = {
  etfs: [] as any[],
  etf_static: [] as any[],
  prices_daily: [] as any[],
  dividends_detail: [] as any[],
  data_sync_log: [] as any[],
  profiles: [] as any[],
};

export const createMockSupabaseResponse = (data: any, error: any = null) => ({
  data,
  error,
  count: Array.isArray(data) ? data.length : data ? 1 : 0,
});

const createMockQuery = (tableName: string) => {
  let filters: any = {};
  let selectFields = '*';
  let orderField = '';
  let orderAsc = true;
  let limitCount = 0;
  let isSingle = false;

  const query = {
    select: (fields: string = '*') => {
      selectFields = fields;
      return query;
    },
    insert: (data: any) => {
      if (Array.isArray(data)) {
        mockSupabaseData[tableName as keyof typeof mockSupabaseData].push(...data);
      } else {
        mockSupabaseData[tableName as keyof typeof mockSupabaseData].push(data);
      }
      return Promise.resolve(createMockSupabaseResponse(data));
    },
    upsert: (data: any) => {
      return Promise.resolve(createMockSupabaseResponse(data));
    },
    update: (data: any) => {
      return query;
    },
    delete: () => {
      return query;
    },
    eq: (field: string, value: any) => {
      filters[field] = value;
      return query;
    },
    neq: (field: string, value: any) => {
      return query;
    },
    gte: (field: string, value: any) => {
      filters[`${field}_gte`] = value;
      return query;
    },
    lte: (field: string, value: any) => {
      filters[`${field}_lte`] = value;
      return query;
    },
    order: (field: string, options?: { ascending?: boolean }) => {
      orderField = field;
      orderAsc = options?.ascending ?? true;
      return query;
    },
    limit: (count: number) => {
      limitCount = count;
      return query;
    },
    single: () => {
      isSingle = true;
      return query;
    },
    then: (resolve: any) => {
      let result = mockSupabaseData[tableName as keyof typeof mockSupabaseData] || [];

      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (key.endsWith('_gte')) {
          const field = key.replace('_gte', '');
          result = result.filter((item: any) => item[field] >= value);
        } else if (key.endsWith('_lte')) {
          const field = key.replace('_lte', '');
          result = result.filter((item: any) => item[field] <= value);
        } else {
          result = result.filter((item: any) => item[key] === value);
        }
      });

      // Apply limit
      if (limitCount > 0) {
        result = result.slice(0, limitCount);
      }

      // Return single or array
      if (isSingle) {
        resolve(createMockSupabaseResponse(result[0] || null));
      } else {
        resolve(createMockSupabaseResponse(result));
      }
    },
  };

  return query;
};

export const mockSupabase = {
  from: (table: string) => createMockQuery(table),
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
      error: null,
    }),
  },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

// ============================================================================
// Mock Fetch for FMP API
// ============================================================================

export const mockFMPResponses: Record<string, any> = {
  '/stable/quote': [
    {
      symbol: 'SPY',
      name: 'SPDR S&P 500 ETF Trust',
      price: 472.5,
      changesPercentage: 0.5,
      change: 2.35,
      dayLow: 468.0,
      dayHigh: 475.0,
      yearHigh: 500.0,
      yearLow: 400.0,
      volume: 50000000,
      avgVolume: 45000000,
      open: 470.0,
      previousClose: 470.15,
      exchange: 'ARCA',
      timestamp: Date.now(),
    },
  ],
  '/stable/historical-price-eod/full': [
    {
      date: '2024-01-03',
      open: 472.5,
      high: 478.0,
      low: 471.0,
      close: 476.0,
      volume: 45000000,
      adjClose: 476.0,
      change: 3.5,
      changePercent: 0.74,
      vwap: 474.0,
      label: 'January 03, 24',
      changeOverTime: 0.0074,
    },
    {
      date: '2024-01-02',
      open: 470.0,
      high: 475.0,
      low: 468.0,
      close: 472.5,
      volume: 50000000,
      adjClose: 472.5,
      change: 2.5,
      changePercent: 0.53,
      vwap: 471.0,
      label: 'January 02, 24',
      changeOverTime: 0.0053,
    },
  ],
  '/stable/dividends': [
    {
      date: '2024-01-15',
      label: 'January 15, 24',
      adjDividend: 1.75,
      dividend: 1.75,
      recordDate: '2024-01-16',
      paymentDate: '2024-01-20',
      declarationDate: '2024-01-10',
    },
  ],
};

const originalFetch = global.fetch;

global.fetch = vi.fn((url: string | URL | Request, options?: RequestInit) => {
  const urlStr = url.toString();

  // Check if it's an FMP API call
  if (urlStr.includes('financialmodelingprep.com')) {
    const urlObj = new URL(urlStr);
    const path = urlObj.pathname;
    const symbol = urlObj.searchParams.get('symbol') || urlObj.searchParams.get('symbols');

    // Find mock data by path
    const mockData = mockFMPResponses[path];

    if (mockData) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
        text: () => Promise.resolve(JSON.stringify(mockData)),
        headers: new Headers(),
      } as Response);
    }

    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Not found' }),
      text: () => Promise.resolve('Not found'),
      headers: new Headers(),
    } as Response);
  }

  // Fall back to original fetch for other URLs
  return originalFetch(url, options);
}) as any;

// ============================================================================
// Test Lifecycle Hooks
// ============================================================================

beforeAll(() => {
  console.log('🧪 Starting test suite...');
});

afterEach(() => {
  // Reset mock data between tests
  mockSupabaseData.etfs = [];
  mockSupabaseData.etf_static = [];
  mockSupabaseData.prices_daily = [];
  mockSupabaseData.dividends_detail = [];
  mockSupabaseData.data_sync_log = [];
  mockSupabaseData.profiles = [];
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
  console.log('✅ Test suite complete');
});
