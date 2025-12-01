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
process.env.TIINGO_API_KEY = 'test-tiingo-api-key';
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
// Mock Fetch for Tiingo API
// ============================================================================

export const mockTiingoResponses: Record<string, any> = {
  '/tiingo/daily/SPY': {
    ticker: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    description: 'S&P 500 ETF',
    startDate: '1993-01-29',
    endDate: '2024-01-01',
    exchangeCode: 'ARCA',
  },
  '/tiingo/daily/SPY/prices': [
    {
      date: '2024-01-02T00:00:00+00:00',
      open: 470.0,
      high: 475.0,
      low: 468.0,
      close: 472.5,
      volume: 50000000,
      adjOpen: 470.0,
      adjHigh: 475.0,
      adjLow: 468.0,
      adjClose: 472.5,
      adjVolume: 50000000,
      divCash: 0,
      splitFactor: 1,
    },
    {
      date: '2024-01-03T00:00:00+00:00',
      open: 472.5,
      high: 478.0,
      low: 471.0,
      close: 476.0,
      volume: 45000000,
      adjOpen: 472.5,
      adjHigh: 478.0,
      adjLow: 471.0,
      adjClose: 476.0,
      adjVolume: 45000000,
      divCash: 0,
      splitFactor: 1,
    },
  ],
  '/tiingo/daily/SPY/dividends': [
    {
      exDate: '2024-01-15T00:00:00+00:00',
      paymentDate: '2024-01-20T00:00:00+00:00',
      recordDate: '2024-01-16T00:00:00+00:00',
      declareDate: '2024-01-10T00:00:00+00:00',
      divCash: 1.75,
      splitFactor: 1,
    },
  ],
};

const originalFetch = global.fetch;

global.fetch = vi.fn((url: string | URL | Request, options?: RequestInit) => {
  const urlStr = url.toString();
  
  // Check if it's a Tiingo API call
  if (urlStr.includes('api.tiingo.com')) {
    const path = new URL(urlStr).pathname;
    const mockData = mockTiingoResponses[path];
    
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
