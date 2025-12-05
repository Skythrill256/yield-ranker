/**
 * Configuration Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key-12345678901234567890',
      FMP_API_KEY: 'test-fmp-api-key-12345678901234567890',
      PORT: '4001',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Environment Variables', () => {
    it('should use test environment', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });

    it('should have required environment variables', () => {
      expect(process.env.SUPABASE_URL).toBeDefined();
      expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeDefined();
      expect(process.env.FMP_API_KEY).toBeDefined();
    });
  });

  describe('Config Values', () => {
    it('should have port configured', async () => {
      const { config } = await import('../src/config/index.js');
      expect(config.port).toBeDefined();
      expect(typeof config.port).toBe('number');
    });

    it('should have supabase configuration', async () => {
      const { config } = await import('../src/config/index.js');
      expect(config.supabase).toBeDefined();
      expect(config.supabase.url).toBeDefined();
      expect(config.supabase.serviceKey).toBeDefined();
    });

    it('should have fmp configuration', async () => {
      const { config } = await import('../src/config/index.js');
      expect(config.fmp).toBeDefined();
      expect(config.fmp.apiKey).toBeDefined();
      expect(config.fmp.baseUrl).toBe('https://financialmodelingprep.com');
    });

    it('should have rate limit configuration', async () => {
      const { config } = await import('../src/config/index.js');
      expect(config.fmp.rateLimit).toBeDefined();
      expect(config.fmp.rateLimit.requestsPerDay).toBeGreaterThan(0);
      expect(config.fmp.rateLimit.minDelayMs).toBeGreaterThan(0);
    });

    it('should have upload configuration', async () => {
      const { config } = await import('../src/config/index.js');
      expect(config.upload).toBeDefined();
      expect(config.upload.maxFileSize).toBeGreaterThan(0);
      expect(config.upload.allowedMimeTypes).toBeInstanceOf(Array);
    });

    it('should have cors configuration', async () => {
      const { config } = await import('../src/config/index.js');
      expect(config.cors).toBeDefined();
      expect(config.cors.origins).toBeInstanceOf(Array);
    });
  });

  describe('Config Validation', () => {
    it('should validate config without throwing', async () => {
      const { validateConfig } = await import('../src/config/index.js');
      expect(() => validateConfig()).not.toThrow();
    });
  });
});
