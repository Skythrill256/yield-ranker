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
      TIINGO_API_KEY: 'test-tiingo-api-key-12345678901234567890',
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
      expect(process.env.TIINGO_API_KEY).toBeDefined();
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

    it('should have tiingo configuration', async () => {
      const { config } = await import('../src/config/index.js');
      expect(config.tiingo).toBeDefined();
      expect(config.tiingo.apiKey).toBeDefined();
      expect(config.tiingo.baseUrl).toBe('https://api.tiingo.com');
    });

    it('should have rate limit configuration', async () => {
      const { config } = await import('../src/config/index.js');
      expect(config.tiingo.rateLimit).toBeDefined();
      expect(config.tiingo.rateLimit.requestsPerHour).toBeGreaterThan(0);
      expect(config.tiingo.rateLimit.minDelayMs).toBeGreaterThan(0);
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
