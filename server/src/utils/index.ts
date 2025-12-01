/**
 * Utility Functions
 */

// ============================================================================
// Date Utilities
// ============================================================================

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDate(date);
}

export function getDateMonthsAgo(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return formatDate(date);
}

export function getDateYearsAgo(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return formatDate(date);
}

export function getTodayDate(): string {
  return formatDate(new Date());
}

export function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

export function periodToStartDate(period: string): string {
  switch (period) {
    case '1W': return getDateDaysAgo(7);
    case '1M': return getDateMonthsAgo(1);
    case '3M': return getDateMonthsAgo(3);
    case '6M': return getDateMonthsAgo(6);
    case '1Y': return getDateYearsAgo(1);
    case '3Y': return getDateYearsAgo(3);
    case '5Y': return getDateYearsAgo(5);
    case 'MAX': return '2000-01-01';
    default: return getDateYearsAgo(1);
  }
}

// ============================================================================
// Number Utilities
// ============================================================================

export function parseNumeric(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  
  const str = String(val).trim();
  if (str.toLowerCase() === 'n/a' || str === '' || str === '-') return null;
  
  const cleaned = str.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

export function calculateReturn(endValue: number, startValue: number): number | null {
  if (!startValue || startValue <= 0 || !endValue) {
    return null;
  }
  return ((endValue - startValue) / startValue) * 100;
}

export function normalize(
  value: number,
  min: number,
  max: number,
  invert = false
): number {
  if (max === min) return 0.5;
  let normalized = (value - min) / (max - min);
  if (invert) normalized = 1 - normalized;
  return Math.max(0, Math.min(1, normalized));
}

// ============================================================================
// Statistics Utilities
// ============================================================================

export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = calculateMean(values);
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  // Use sample standard deviation (ddof=1): divide by (n-1) instead of n
  const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function calculateCV(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = calculateMean(values);
  const stdDev = calculateStdDev(values);
  if (Math.abs(mean) < 0.0001) return stdDev * 100;
  return Math.abs(stdDev / mean) * 100;
}

// ============================================================================
// Async Utilities
// ============================================================================

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number,
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (onRetry) onRetry(attempt, lastError);
      if (attempt < maxRetries) {
        await sleep(delayMs * Math.pow(2, attempt - 1));
      }
    }
  }
  
  throw lastError;
}

// ============================================================================
// Logging Utilities
// ============================================================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL = process.env.LOG_LEVEL 
  ? parseInt(process.env.LOG_LEVEL, 10) 
  : LogLevel.INFO;

function formatLogMessage(level: string, module: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] [${module}] ${message}`;
}

export const logger = {
  debug(module: string, message: string, ...args: unknown[]): void {
    if (LOG_LEVEL <= LogLevel.DEBUG) {
      console.debug(formatLogMessage('DEBUG', module, message), ...args);
    }
  },
  
  info(module: string, message: string, ...args: unknown[]): void {
    if (LOG_LEVEL <= LogLevel.INFO) {
      console.info(formatLogMessage('INFO', module, message), ...args);
    }
  },
  
  warn(module: string, message: string, ...args: unknown[]): void {
    if (LOG_LEVEL <= LogLevel.WARN) {
      console.warn(formatLogMessage('WARN', module, message), ...args);
    }
  },
  
  error(module: string, message: string, ...args: unknown[]): void {
    if (LOG_LEVEL <= LogLevel.ERROR) {
      console.error(formatLogMessage('ERROR', module, message), ...args);
    }
  },
};
