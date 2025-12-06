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

  tiingo: {
    apiKey: string;
    baseUrl: string;
    iexBaseUrl: string;
    wsUrl: string;
    rateLimit: {
      requestsPerHour: number;
      minDelayMs: number;
    };
  };

  redis: {
    url: string | null;
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
    // Don't throw during import - log warning and return empty string
    console.error(`[CONFIG ERROR] Missing required environment variable: ${key}`);
    return '';
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

  tiingo: {
    apiKey: requireEnv('TIINGO_API_KEY'),
    baseUrl: 'https://api.tiingo.com',
    iexBaseUrl: 'https://api.tiingo.com/iex',
    wsUrl: 'wss://api.tiingo.com/iex',
    rateLimit: {
      requestsPerHour: optionalEnvNumber('TIINGO_RATE_LIMIT_HOURLY', 500),
      minDelayMs: optionalEnvNumber('TIINGO_MIN_DELAY_MS', 100),
    },
  },

  redis: {
    url: process.env.REDIS_URL || null,
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
      : [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:8081',
        'https://dividendsandtotalreturns.com',
        'https://www.dividendsandtotalreturns.com',
      ],
  },
};

// ============================================================================
// Validation on Import
// ============================================================================

export function validateConfig(): void {
  const errors: string[] = [];

  // Check for required environment variables
  if (!config.supabase.url) {
    errors.push('SUPABASE_URL is missing');
  } else if (!config.supabase.url.startsWith('https://')) {
    errors.push('SUPABASE_URL must start with https://');
  }

  if (!config.supabase.serviceKey) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY is missing');
  }

  if (!config.tiingo.apiKey) {
    errors.push('TIINGO_API_KEY is missing');
  } else if (config.tiingo.apiKey.length < 20) {
    errors.push('TIINGO_API_KEY appears invalid (too short)');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}

export default config;
