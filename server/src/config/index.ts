/**
 * Application Configuration
 * 
 * Centralized configuration with validation and type safety
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ============================================================================
// Configuration Interface
// ============================================================================

interface Config {
  env: 'development' | 'production' | 'test';
  port: number;

  supabase: {
    url: string;
    serviceKey: string;
  };

  fmp: {
    apiKey: string;
    baseUrl: string;
    rateLimit: {
      requestsPerDay: number;
      minDelayMs: number;
    };
  };

  alphaVantage: {
    apiKey: string;
    baseUrl: string;
    rateLimit: {
      requestsPerMinute: number;
      minDelayMs: number;
    };
  };

  upload: {
    maxFileSize: number;
    allowedMimeTypes: string[];
    tempDir: string;
  };

  cors: {
    origins: string[];
  };
}

// ============================================================================
// Environment Validation
// ============================================================================

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// ============================================================================
// Build Configuration
// ============================================================================

export const config: Config = {
  env: (process.env.NODE_ENV as Config['env']) || 'development',
  port: optionalEnvNumber('PORT', 4000),

  supabase: {
    url: requireEnv('SUPABASE_URL'),
    serviceKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },

  fmp: {
    apiKey: requireEnv('FMP_API_KEY'),
    baseUrl: 'https://financialmodelingprep.com',
    rateLimit: {
      requestsPerDay: optionalEnvNumber('FMP_RATE_LIMIT_DAILY', 250),
      minDelayMs: optionalEnvNumber('FMP_MIN_DELAY_MS', 200),
    },
  },

  alphaVantage: {
    apiKey: process.env.ALPHA_VANTAGE_API_KEY || '',
    baseUrl: 'https://www.alphavantage.co',
    rateLimit: {
      requestsPerMinute: 5, // Free tier limit
      minDelayMs: 12000, // 12 seconds between requests for free tier
    },
  },

  upload: {
    maxFileSize: optionalEnvNumber('UPLOAD_MAX_SIZE', 10 * 1024 * 1024), // 10MB
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    tempDir: path.resolve(__dirname, '../../uploads'),
  },

  cors: {
    origins: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
      : ['http://localhost:5173', 'http://localhost:3000'],
  },
};

// ============================================================================
// Validation on Import
// ============================================================================

export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.supabase.url.startsWith('https://')) {
    errors.push('SUPABASE_URL must start with https://');
  }

  if (config.fmp.apiKey.length < 20) {
    errors.push('FMP_API_KEY appears invalid (too short)');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}

export default config;
