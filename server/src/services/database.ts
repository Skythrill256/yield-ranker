/**
 * Database Service
 * 
 * Provides typed database access via Supabase client
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import config from '../config/index.js';
import { logger } from '../utils/index.js';
import type {
  PriceRecord,
  DividendRecord,
  ETFStaticRecord,
  SyncLogRecord,
} from '../types/index.js';

// ============================================================================
// Singleton Client
// ============================================================================

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(
      config.supabase.url,
      config.supabase.serviceKey,
      {
        auth: { persistSession: false },
      }
    );
    logger.info('Database', 'Supabase client initialized');
  }
  return supabaseClient;
}

// ============================================================================
// Retry Helper for Network Resilience
// ============================================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 500
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

// ============================================================================
// ETF Static Table Operations
// ============================================================================

export async function getAllTickers(): Promise<string[]> {
  const db = getSupabase();

  // Try etf_static first
  const { data, error } = await db
    .from('etf_static')
    .select('ticker')
    .order('ticker');

  if (!error && data && data.length > 0) {
    return data.map((row: { ticker: string }) => row.ticker);
  }

  // Fallback to legacy etfs table
  const { data: etfsData, error: etfsError } = await db
    .from('etfs')
    .select('symbol')
    .order('symbol');

  if (etfsError) {
    throw new Error(`Failed to fetch tickers: ${etfsError.message}`);
  }

  return (etfsData ?? []).map((row: { symbol: string }) => row.symbol);
}

export async function getETFStatic(ticker: string): Promise<ETFStaticRecord | null> {
  const db = getSupabase();

  const { data, error } = await db
    .from('etf_static')
    .select('*')
    .eq('ticker', ticker.toUpperCase())
    .single();

  if (error || !data) {
    // Try legacy table
    const { data: legacy } = await db
      .from('etfs')
      .select('*')
      .eq('symbol', ticker.toUpperCase())
      .single();

    if (legacy) {
      return {
        ticker: legacy.symbol,
        issuer: legacy.issuer,
        description: legacy.description,
        pay_day_text: legacy.pay_day,
        payments_per_year: legacy.payments_per_year,
        ipo_price: legacy.ipo_price,
        default_rank_weights: null,
        // Return null for all computed fields when using legacy
        price: null,
        price_change: null,
        price_change_pct: null,
        last_dividend: null,
        annual_dividend: null,
        forward_yield: null,
        dividend_sd: null,
        dividend_cv: null,
        dividend_cv_percent: null,
        dividend_volatility_index: null,
        weighted_rank: null,
        tr_drip_3y: null,
        tr_drip_12m: null,
        tr_drip_6m: null,
        tr_drip_3m: null,
        tr_drip_1m: null,
        tr_drip_1w: null,
        price_return_3y: null,
        price_return_12m: null,
        price_return_6m: null,
        price_return_3m: null,
        price_return_1m: null,
        price_return_1w: null,
        tr_nodrip_3y: null,
        tr_nodrip_12m: null,
        tr_nodrip_6m: null,
        tr_nodrip_3m: null,
        tr_nodrip_1m: null,
        tr_nodrip_1w: null,
        week_52_high: null,
        week_52_low: null,
        last_updated: null,
        data_source: null,
      };
    }
    return null;
  }

  return data as ETFStaticRecord;
}

export async function upsertETFStatic(records: ETFStaticRecord[]): Promise<number> {
  const db = getSupabase();

  const { error } = await db
    .from('etf_static')
    .upsert(records, { onConflict: 'ticker' });

  if (error) {
    throw new Error(`Failed to upsert etf_static: ${error.message}`);
  }

  return records.length;
}

/**
 * Update computed metrics for a ticker in the etf_static table
 */
export async function updateETFMetrics(
  ticker: string,
  metrics: Partial<ETFStaticRecord>
): Promise<void> {
  const db = getSupabase();

  const updateData: any = {
    ...metrics,
    last_updated: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from('etf_static')
    .update(updateData)
    .eq('ticker', ticker.toUpperCase());

  if (error) {
    logger.error('Database', `Failed to update metrics for ${ticker}: ${error.message}`);
  }
}

export async function updateETFMetricsPreservingCEFFields(
  ticker: string,
  metrics: Partial<ETFStaticRecord>
): Promise<void> {
  const db = getSupabase();

  const cefFieldsToPreserve = [
    'nav_symbol',
    'five_year_z_score',
    'nav_trend_6m',
    'nav_trend_12m',
    'signal',
    'return_3yr',
    'return_5yr',
    'return_10yr',
    'return_15yr',
    'value_health_score',
    'open_date',
    'ipo_price',
    'description',
    'dividend_history',
    'average_premium_discount',
  ];

  const { data: existing } = await db
    .from('etf_static')
    .select('*')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();

  const updateData: any = {
    ...metrics,
    last_updated: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    cefFieldsToPreserve.forEach(field => {
      if (existing[field] !== null && existing[field] !== undefined && existing[field] !== '') {
        if (!(field in updateData)) {
          updateData[field] = existing[field];
        }
      }
    });

    if (existing.premium_discount !== null && existing.premium_discount !== undefined && existing.premium_discount !== '') {
      if (!('premium_discount' in updateData)) {
        updateData.premium_discount = existing.premium_discount;
      }
    }

    if (existing.nav !== null && existing.nav !== undefined && existing.nav !== '') {
      if (!('nav' in updateData)) {
        updateData.nav = existing.nav;
      }
    }
  }

  // Try to update - return columns should exist, but handle gracefully if they don't
  const safeUpdateData: any = { ...updateData };
  
  // List of columns that might not exist yet (only signal, return columns should exist)
  const optionalColumns = ['signal'];
  
  // Try to update, and if it fails due to missing column, retry without optional columns
  let { error } = await db
    .from('etf_static')
    .update(safeUpdateData)
    .eq('ticker', ticker.toUpperCase());

  if (error && error.message.includes('column') && error.message.includes('does not exist')) {
    // Check if error is about return columns - these MUST exist, so log error
    const isReturnColumnError = error.message.includes('return_3yr') || 
                                 error.message.includes('return_5yr') || 
                                 error.message.includes('return_10yr') || 
                                 error.message.includes('return_15yr');
    
    if (isReturnColumnError) {
      logger.error('Database', `❌ CRITICAL: Return columns do not exist in database for ${ticker}!`);
      logger.error('Database', `❌ Missing columns: return_3yr, return_5yr, return_10yr, return_15yr`);
      logger.error('Database', `❌ Please add these columns to etf_static table: ALTER TABLE etf_static ADD COLUMN return_3yr NUMERIC, ADD COLUMN return_5yr NUMERIC, ADD COLUMN return_10yr NUMERIC, ADD COLUMN return_15yr NUMERIC;`);
      // Don't retry - we need these columns to exist
      throw new Error(`Return columns do not exist in database. Please add return_3yr, return_5yr, return_10yr, return_15yr columns.`);
    }
    
    // Remove optional columns (only signal) and try again
    optionalColumns.forEach(col => {
      delete safeUpdateData[col];
    });
    
    const { error: retryError } = await db
      .from('etf_static')
      .update(safeUpdateData)
      .eq('ticker', ticker.toUpperCase());
    
    if (retryError) {
      logger.error('Database', `Failed to update metrics for ${ticker}: ${retryError.message}`);
    } else {
      logger.debug('Database', `Updated ${ticker} (some optional columns skipped)`);
    }
  } else if (error) {
    logger.error('Database', `Failed to update metrics for ${ticker}: ${error.message}`);
    throw error;
  }
}

/**
 * Batch update metrics for multiple tickers
 */
export async function batchUpdateETFMetrics(
  updates: Array<{ ticker: string; metrics: Partial<ETFStaticRecord> }>
): Promise<number> {
  let updated = 0;

  for (const { ticker, metrics } of updates) {
    try {
      await updateETFMetrics(ticker, metrics);
      updated++;
    } catch (error) {
      logger.error('Database', `Failed to update ${ticker}: ${error}`);
    }
  }

  return updated;
}

/**
 * Batch update metrics for multiple tickers, preserving CEF-specific fields
 */
export async function batchUpdateETFMetricsPreservingCEFFields(
  updates: Array<{ ticker: string; metrics: Partial<ETFStaticRecord> }>
): Promise<number> {
  let updated = 0;

  for (const { ticker, metrics } of updates) {
    try {
      await updateETFMetricsPreservingCEFFields(ticker, metrics);
      updated++;
    } catch (error) {
      logger.error('Database', `Failed to update ${ticker}: ${error}`);
    }
  }

  return updated;
}

// ============================================================================
// Price Daily Table Operations
// ============================================================================

export async function getPriceHistory(
  ticker: string,
  startDate: string,
  endDate?: string
): Promise<PriceRecord[]> {
  try {
    return await withRetry(async () => {
      const db = getSupabase();

      let query = db
        .from('prices_daily')
        .select('*')
        .eq('ticker', ticker.toUpperCase())
        .gte('date', startDate)
        .order('date', { ascending: true });

      if (endDate) {
        query = query.lte('date', endDate);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      const records = (data ?? []) as PriceRecord[];

      if (records.length === 0) {
        logger.debug('Database', `No price data in database for ${ticker}, attempting Tiingo API fallback`);
        try {
          const { getPriceHistoryFromAPI } = await import('./tiingo.js');
          const apiRecords = await getPriceHistoryFromAPI(ticker, startDate, endDate);
          if (apiRecords.length > 0) {
            logger.info('Database', `Fetched ${apiRecords.length} price records from Tiingo API for ${ticker}`);
            return apiRecords;
          }
        } catch (apiError) {
          logger.warn('Database', `Tiingo API fallback failed for ${ticker}: ${(apiError as Error).message}`);
        }
      }

      return records;
    });
  } catch (error) {
    logger.error('Database', `Error fetching prices for ${ticker}: ${(error as Error).message}`);
    return [];
  }
}

export async function getLatestPrice(ticker: string, limit = 2): Promise<PriceRecord[]> {
  try {
    return await withRetry(async () => {
      const db = getSupabase();

      const { data, error } = await db
        .from('prices_daily')
        .select('*')
        .eq('ticker', ticker.toUpperCase())
        .order('date', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(error.message);
      }

      return ((data ?? []) as PriceRecord[]).reverse();
    });
  } catch (error) {
    logger.error('Database', `Error fetching latest price for ${ticker}: ${(error as Error).message}`);
    return [];
  }
}

export async function upsertPrices(records: PriceRecord[], batchSize = 500): Promise<number> {
  if (records.length === 0) return 0;

  const db = getSupabase();
  let inserted = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    const { error } = await db
      .from('prices_daily')
      .upsert(batch, { onConflict: 'ticker,date' });

    if (error) {
      logger.error('Database', `Error upserting prices batch: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
}

// ============================================================================
// Dividends Detail Table Operations
// ============================================================================

export async function getDividendHistory(
  ticker: string,
  startDate?: string
): Promise<DividendRecord[]> {
  try {
    return await withRetry(async () => {
      const db = getSupabase();

      let query = db
        .from('dividends_detail')
        .select('*')
        .eq('ticker', ticker.toUpperCase());

      if (startDate) {
        query = query.gte('ex_date', startDate);
      }

      // Order by ex_date DESC (newest first) - manual priority handled in client-side sort
      query = query.order('ex_date', { ascending: false });

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      const dividends = (data ?? []) as DividendRecord[];

      // Additional client-side sort to ensure manual always comes first
      return dividends.sort((a, b) => {
        const aManual = a.is_manual === true ? 1 : 0;
        const bManual = b.is_manual === true ? 1 : 0;
        if (aManual !== bManual) {
          return bManual - aManual; // Manual (1) comes before non-manual (0)
        }
        return new Date(b.ex_date).getTime() - new Date(a.ex_date).getTime();
      });
    });
  } catch (error) {
    logger.error('Database', `Error fetching dividends for ${ticker}: ${(error as Error).message}`);
    return [];
  }
}

/**
 * Get dividends from prices_daily.div_cash column (where div_cash > 0)
 * This is the primary source for dividend data from Tiingo
 */
export async function getDividendsFromPrices(
  ticker: string,
  startDate?: string
): Promise<DividendRecord[]> {
  const db = getSupabase();

  let query = db
    .from('prices_daily')
    .select('ticker, date, div_cash')
    .eq('ticker', ticker.toUpperCase())
    .gt('div_cash', 0)
    .order('date', { ascending: false });

  if (startDate) {
    query = query.gte('date', startDate);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Database', `Error fetching dividends from prices for ${ticker}: ${error.message}`);
    return [];
  }

  // Map price records to dividend records
  return (data ?? []).map((row: { ticker: string; date: string; div_cash: number }) => ({
    ticker: row.ticker,
    ex_date: row.date,
    div_cash: row.div_cash,
    pay_date: null,
    record_date: null,
    declare_date: null,
    split_factor: 1,
    div_type: null,
    adj_amount: row.div_cash,
  })) as DividendRecord[];
}

export async function upsertDividends(records: DividendRecord[], batchSize = 100): Promise<number> {
  if (records.length === 0) return 0;

  const db = getSupabase();
  let inserted = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    const { error } = await db
      .from('dividends_detail')
      .upsert(batch, { onConflict: 'ticker,ex_date' });

    if (error) {
      logger.error('Database', `Error upserting dividends batch: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
}

// ============================================================================
// Sync Log Table Operations
// ============================================================================

export async function getSyncLog(
  ticker: string,
  dataType: 'prices' | 'dividends'
): Promise<SyncLogRecord | null> {
  const db = getSupabase();

  const { data, error } = await db
    .from('data_sync_log')
    .select('*')
    .eq('ticker', ticker)
    .eq('data_type', dataType)
    .single();

  if (error || !data) return null;
  return data as SyncLogRecord;
}

export async function updateSyncLog(record: Omit<SyncLogRecord, 'id' | 'created_at'>): Promise<void> {
  const db = getSupabase();

  const { error } = await db
    .from('data_sync_log')
    .upsert({
      ...record,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'ticker,data_type' });

  if (error) {
    logger.error('Database', `Error updating sync log: ${error.message}`);
  }
}

export async function getAllSyncLogs(): Promise<SyncLogRecord[]> {
  const db = getSupabase();

  const { data, error } = await db
    .from('data_sync_log')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    logger.error('Database', `Error fetching sync logs: ${error.message}`);
    return [];
  }

  return (data ?? []) as SyncLogRecord[];
}
