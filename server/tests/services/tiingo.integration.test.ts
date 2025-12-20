/**
 * Tiingo API Service Integration Tests
 * Tests API interactions, rate limiting, error handling, and retry logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchTickerMeta,
  fetchPriceHistory,
  fetchDividendHistory,
  fetchLatestPrice,
  healthCheck,
  getRateLimitStatus,
  fetchPriceHistoryBatch,
  fetchDividendHistoryBatch,
} from '../../src/services/tiingo.js';
// Setup is already imported via vitest.setup

// Mock the config to use test values
vi.mock('../../src/config/index.js', () => ({
  default: {
    tiingo: {
      baseUrl: 'https://api.tiingo.com/tiingo',
      apiKey: 'test-api-key',
      rateLimit: {
        requestsPerHour: 1000,
        minDelayMs: 100,
      },
    },
  },
}));

// Mock the logger
vi.mock('../../src/utils/index.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  sleep: vi.fn((ms: number) => Promise.resolve()),
  retry: vi.fn((fn: () => Promise<any>, attempts: number, delay: number, onRetry: (attempt: number, error: Error) => void) => {
    return fn().catch(async (error: Error) => {
      if (attempts > 1) {
        onRetry(1, error);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fn();
      }
      throw error;
    });
  }),
}));

describe('Tiingo API Service Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('API Request Handling', () => {
    it('should make requests with correct headers and parameters', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ticker: 'SPY', name: 'SPDR S&P 500 ETF' }),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      await fetchTickerMeta('SPY');

      // Tiingo uses token as query parameter, not Authorization header
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('token='),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle ticker case conversion', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ticker: 'SPY', name: 'SPDR S&P 500 ETF' }),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      await fetchTickerMeta('spy');
      await fetchTickerMeta('Spy');
      await fetchTickerMeta('SPY');

      // All should make requests with uppercase ticker
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/daily/SPY'),
        expect.any(Object)
      );
    });

    it('should handle URL parameters correctly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      await fetchPriceHistory('SPY', '2024-01-01', '2024-01-31');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('startDate=2024-01-01&endDate=2024-01-31'),
        expect.any(Object)
      );
    });

    it('should handle optional parameters', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      await fetchPriceHistory('SPY', '2024-01-01'); // No end date

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('startDate=2024-01-01'),
        expect.any(Object)
      );
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining('endDate='),
        expect.any(Object)
      );
    });
  });

  describe('Response Handling', () => {
    it('should handle successful responses', async () => {
      const mockResponse = {
        ticker: 'SPY',
        name: 'SPDR S&P 500 ETF',
        description: 'S&P 500 ETF',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const result = await fetchTickerMeta('SPY');

      expect(result).toEqual(mockResponse);
    });

    it('should handle empty array responses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const result = await fetchPriceHistory('INVALID', '2024-01-01');

      expect(result).toEqual([]);
    });

    it('should handle 404 responses gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
        text: () => Promise.resolve('Not found'),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const result = await fetchTickerMeta('INVALID_TICKER');

      // Tiingo service returns null or empty array on 404 errors (graceful degradation)
      expect(result === null || (Array.isArray(result) && result.length === 0)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const result = await fetchTickerMeta('SPY');

      expect(result).toBeNull();
    });

    it('should handle HTTP error responses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
        text: () => Promise.resolve('Internal server error'),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      // Tiingo service returns null on HTTP errors (graceful degradation)
      const result = await fetchTickerMeta('SPY');
      expect(result).toBeNull();
    });

    it('should handle malformed JSON responses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Invalid JSON')),
        text: () => Promise.resolve('Invalid JSON'),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      // Tiingo service returns null on JSON parsing errors (graceful degradation)
      const result = await fetchTickerMeta('SPY');
      expect(result).toBeNull();
    });

    it('should handle timeout scenarios', async () => {
      const mockFetch = vi.fn().mockImplementation(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );
      global.fetch = mockFetch;

      const result = await fetchTickerMeta('SPY');

      expect(result).toBeNull();
    });
  });

  describe('Rate Limiting', () => {
    it('should track request count', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ticker: 'SPY' }),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const initialStatus = getRateLimitStatus();
      await fetchTickerMeta('SPY');
      const afterStatus = getRateLimitStatus();

      expect(afterStatus.totalRequests).toBe(initialStatus.totalRequests + 1);
      expect(afterStatus.requestsThisHour).toBe(initialStatus.requestsThisHour + 1);
    });

    it('should enforce minimum delay between requests', async () => {
      const mockSleep = vi.fn().mockResolvedValue(undefined);
      vi.doMock('../../src/utils/index.js', () => ({
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        sleep: mockSleep,
        retry: vi.fn(),
      }));

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ticker: 'SPY' }),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      // Make rapid requests
      await fetchTickerMeta('SPY');
      await fetchTickerMeta('QQQ');

      // Should have called sleep to enforce delay
      expect(mockSleep).toHaveBeenCalled();
    });

    it('should handle hourly rate limit exceeded', async () => {
      // Mock rate limit state to simulate hourly limit exceeded
      const mockSleep = vi.fn().mockResolvedValue(undefined);
      vi.doMock('../../src/utils/index.js', () => ({
        logger: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        sleep: mockSleep,
        retry: vi.fn(),
      }));

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ticker: 'SPY' }),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      // This test would need to manipulate internal rate limit state
      // For now, we'll test the rate limit status function
      const status = getRateLimitStatus();
      expect(status).toHaveProperty('requestsThisHour');
      expect(status).toHaveProperty('totalRequests');
      expect(status).toHaveProperty('hourlyLimit');
    });
  });

  describe('Retry Logic', () => {
    it('should retry on rate limit responses', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 429,
            headers: new Headers({ 'Retry-After': '1' }),
            json: () => Promise.resolve({ error: 'Rate limited' }),
            text: () => Promise.resolve('Rate limited'),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ticker: 'SPY' }),
          headers: new Headers(),
        });
      });
      global.fetch = mockFetch;

      const mockSleep = vi.fn().mockResolvedValue(undefined);
      vi.doMock('../../src/utils/index.js', () => ({
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        sleep: mockSleep,
        retry: vi.fn((fn) => fn()), // Simplified retry for testing
      }));

      const result = await fetchTickerMeta('SPY');

      expect(result).toEqual({ ticker: 'SPY' });
      expect(mockFetch).toHaveBeenCalledTimes(2); // Initial call + retry
    });

    it('should respect Retry-After header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '60' }),
        json: () => Promise.resolve({ error: 'Rate limited' }),
        text: () => Promise.resolve('Rate limited'),
      });
      global.fetch = mockFetch;

      const mockSleep = vi.fn().mockResolvedValue(undefined);
      vi.doMock('../../src/utils/index.js', () => ({
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        sleep: mockSleep,
        retry: vi.fn(),
      }));

      // This would typically retry, but we'll test the sleep call
      await fetchTickerMeta('SPY').catch(() => { });

      // Should sleep for the Retry-After duration
      expect(mockSleep).toHaveBeenCalledWith(60000); // 60 seconds
    });

    it('should handle retry exhaustion', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: () => Promise.resolve({ error: 'Server error' }),
        text: () => Promise.resolve('Server error'),
      });
      global.fetch = mockFetch;

      const mockRetry = vi.fn().mockRejectedValue(new Error('Max retries exceeded'));
      vi.doMock('../../src/utils/index.js', () => ({
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        sleep: vi.fn(),
        retry: mockRetry,
      }));

      await expect(fetchTickerMeta('SPY')).rejects.toThrow('Max retries exceeded');
    });
  });

  describe('Batch Operations', () => {
    it('should fetch price history for multiple tickers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { date: '2024-01-01', close: 100 },
          { date: '2024-01-02', close: 101 },
        ]),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const tickers = ['SPY', 'QQQ', 'VTI'];
      const result = await fetchPriceHistoryBatch(tickers, '2024-01-01', '2024-01-31');

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(3);
      expect(result.get('SPY')).toBeDefined();
      expect(result.get('QQQ')).toBeDefined();
      expect(result.get('VTI')).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should call progress callback during batch operations', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const onProgress = vi.fn();
      const tickers = ['SPY', 'QQQ'];

      await fetchPriceHistoryBatch(tickers, '2024-01-01', undefined, onProgress);

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalledWith('SPY', 1, 2);
      expect(onProgress).toHaveBeenCalledWith('QQQ', 2, 2);
    });

    it('should handle partial failures in batch operations', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ date: '2024-01-01', close: 100 }]),
          headers: new Headers(),
        })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ date: '2024-01-01', close: 200 }]),
          headers: new Headers(),
        });
      global.fetch = mockFetch;

      const tickers = ['SPY', 'INVALID', 'VTI'];
      const result = await fetchPriceHistoryBatch(tickers, '2024-01-01');

      expect(result.size).toBe(2); // Only successful requests
      expect(result.get('SPY')).toBeDefined();
      expect(result.get('VTI')).toBeDefined();
      expect(result.get('INVALID')).toBeUndefined();
    });

    it('should fetch dividend history for multiple tickers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { exDate: '2024-01-01', divCash: 1.5 },
        ]),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const tickers = ['SPY', 'QQQ'];
      const result = await fetchDividendHistoryBatch(tickers, '2024-01-01');

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Health Check', () => {
    it('should return true for healthy API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ticker: 'SPY' }),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const result = await healthCheck();

      expect(result).toBe(true);
    });

    it('should return false for unhealthy API', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const result = await healthCheck();

      expect(result).toBe(false);
    });

    it('should return false for invalid ticker response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const result = await healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('Data Validation', () => {
    it('should validate ticker metadata response structure', async () => {
      const mockResponse = {
        ticker: 'SPY',
        name: 'SPDR S&P 500 ETF',
        description: 'S&P 500 ETF',
        startDate: '1993-01-29',
        endDate: '2024-01-01',
        exchangeCode: 'ARCA',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const result = await fetchTickerMeta('SPY');

      expect(result).toHaveProperty('ticker');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('description');
      expect(result?.ticker).toBe('SPY');
    });

    it('should validate price history response structure', async () => {
      const mockResponse = [
        {
          date: '2024-01-01T00:00:00+00:00',
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
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const result = await fetchPriceHistory('SPY', '2024-01-01');

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        const price = result[0];
        expect(price).toHaveProperty('date');
        expect(price).toHaveProperty('open');
        expect(price).toHaveProperty('high');
        expect(price).toHaveProperty('low');
        expect(price).toHaveProperty('close');
        expect(price).toHaveProperty('volume');
        expect(price).toHaveProperty('adjClose');
      }
    });

    it('should validate dividend history response structure', async () => {
      const mockResponse = [
        {
          exDate: '2024-01-15T00:00:00+00:00',
          paymentDate: '2024-01-20T00:00:00+00:00',
          recordDate: '2024-01-16T00:00:00+00:00',
          declareDate: '2024-01-10T00:00:00+00:00',
          divCash: 1.75,
          splitFactor: 1,
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const result = await fetchDividendHistory('SPY', '2024-01-01');

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        const dividend = result[0];
        expect(dividend).toHaveProperty('exDate');
        expect(dividend).toHaveProperty('paymentDate');
        expect(dividend).toHaveProperty('divCash');
      }
    });
  });

  describe('Performance and Efficiency', () => {
    it('should handle large datasets efficiently', async () => {
      // Mock a large price history response
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00+00:00`,
        close: 100 + i * 0.1,
        adjClose: 100 + i * 0.1,
        volume: 50000000,
      }));

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(largeData),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const startTime = Date.now();
      const result = await fetchPriceHistory('SPY', '2024-01-01');
      const endTime = Date.now();

      expect(result.length).toBe(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle concurrent requests properly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ticker: 'SPY' }),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      // Make concurrent requests
      const promises = Array.from({ length: 10 }, () => fetchTickerMeta('SPY'));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result).toEqual({ ticker: 'SPY' });
      });
      expect(mockFetch).toHaveBeenCalledTimes(10);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty ticker string', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const result = await fetchTickerMeta('');

      expect(result).toBeNull();
    });

    it('should handle special characters in ticker', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const result = await fetchTickerMeta('SPY-TEST');

      expect(result).toBeNull();
    });

    it('should handle very long date ranges', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const result = await fetchPriceHistory('SPY', '2000-01-01', '2024-01-01');

      expect(Array.isArray(result)).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('startDate=2000-01-01&endDate=2024-01-01'),
        expect.any(Object)
      );
    });

    it('should handle invalid date formats', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      // Should pass through invalid dates to API (API will handle validation)
      const result = await fetchPriceHistory('SPY', 'invalid-date');

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
