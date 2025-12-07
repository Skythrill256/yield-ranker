/**
 * seed_history.ts - One-Time Historical Data Seeding Script
 * 
 * This script populates the prices_daily and dividends_detail tables
 * with historical data from the Tiingo API for all tickers in etf_static.
 * 
 * Usage: npx tsx scripts/seed_history.ts [--ticker SYMBOL] [--start-date YYYY-MM-DD]
 * 
 * Options:
 *   --ticker SYMBOL     Seed only a specific ticker
 *   --start-date DATE   Start date (default: 2000-01-01)
 *   --dry-run           Show what would be done without making changes
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import {
  fetchPriceHistory,
  fetchDividendHistory,
  healthCheck,
  getRateLimitStatus,
} from '../src/services/tiingo.js';
import type { TiingoPriceData } from '../src/types/index.js';

// Type alias for dividend data from Tiingo
type DividendData = { date: string; dividend: number; adjDividend: number; scaledDividend: number; recordDate: string | null; paymentDate: string | null; declarationDate: string | null };

// ============================================================================
// Configuration
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEFAULT_START_DATE = '2000-01-01';
const BATCH_SIZE = 500; // Records per upsert batch

// ============================================================================
// Database Client
// ============================================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================================================
// CLI Arguments Parser
// ============================================================================

interface CliOptions {
  ticker?: string;
  startDate: string;
  dryRun: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    startDate: DEFAULT_START_DATE,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ticker':
        options.ticker = args[++i]?.toUpperCase();
        break;
      case '--start-date':
        options.startDate = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        console.log(`
Usage: npx tsx scripts/seed_history.ts [options]

Options:
  --ticker SYMBOL     Seed only a specific ticker
  --start-date DATE   Start date (default: ${DEFAULT_START_DATE})
  --dry-run           Show what would be done without making changes
  --help              Show this help message
        `);
        process.exit(0);
    }
  }

  return options;
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Get all tickers from etf_static table
 */
async function getAllTickers(): Promise<string[]> {
  const { data, error } = await supabase
    .from('etf_static')
    .select('ticker')
    .order('ticker');

  if (error) {
    // Table might not exist yet, try the old etfs table
    console.log('[Seed] etf_static table not found, trying etfs table...');
    const { data: etfsData, error: etfsError } = await supabase
      .from('etfs')
      .select('symbol')
      .order('symbol');

    if (etfsError) {
      throw new Error(`Failed to fetch tickers: ${etfsError.message}`);
    }

    return (etfsData || []).map((row: { symbol: string }) => row.symbol);
  }

  return (data || []).map((row: { ticker: string }) => row.ticker);
}

/**
 * Ensure ticker exists in etf_static (migrate from etfs if needed)
 */
async function ensureTickerInStatic(ticker: string): Promise<boolean> {
  // Check if already in etf_static
  const { data: existing } = await supabase
    .from('etf_static')
    .select('ticker')
    .eq('ticker', ticker)
    .single();

  if (existing) {
    return true;
  }

  // Try to migrate from etfs table
  const { data: etfData } = await supabase
    .from('etfs')
    .select('*')
    .eq('symbol', ticker)
    .single();

  if (etfData) {
    const { error } = await supabase
      .from('etf_static')
      .upsert({
        ticker: etfData.symbol,
        issuer: etfData.issuer,
        description: etfData.description,
        pay_day_text: etfData.pay_day,
        payments_per_year: etfData.payments_per_year,
        ipo_price: etfData.ipo_price,
      });

    if (error) {
      console.error(`[Seed] Failed to migrate ${ticker} to etf_static:`, error);
      return false;
    }
    console.log(`[Seed] Migrated ${ticker} to etf_static`);
  }

  return true;
}

/**
 * Insert price data in batches
 */
async function insertPriceData(
  ticker: string,
  prices: TiingoPriceData[],
  dryRun: boolean
): Promise<number> {
  if (prices.length === 0) return 0;

  const records = prices.map(p => ({
    ticker,
    date: p.date.split('T')[0], // Convert to YYYY-MM-DD
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    adj_close: p.adjClose,
    volume: p.volume,
    adj_open: p.adjOpen || p.open,
    adj_high: p.adjHigh || p.high,
    adj_low: p.adjLow || p.low,
    adj_volume: p.volume, // Tiingo uses volume for adj_volume
    div_cash: p.divCash || 0,
    split_factor: p.splitFactor || 1,
  }));

  if (dryRun) {
    console.log(`[Seed] [DRY RUN] Would insert ${records.length} price records for ${ticker}`);
    return records.length;
  }

  let inserted = 0;

  // Insert in batches
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from('prices_daily')
      .upsert(batch, {
        onConflict: 'ticker,date',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`[Seed] Error inserting price batch for ${ticker}:`, error);
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
}

/**
 * Insert dividend data in batches
 */
async function insertDividendData(
  ticker: string,
  dividends: DividendData[],
  dryRun: boolean
): Promise<number> {
  if (dividends.length === 0) return 0;

  const records = dividends.map(d => ({
    ticker,
    ex_date: d.date.split('T')[0],
    pay_date: d.paymentDate?.split('T')[0] || null,
    record_date: d.recordDate?.split('T')[0] || null,
    declare_date: d.declarationDate?.split('T')[0] || null,
    div_cash: d.dividend,
    adj_amount: d.adjDividend > 0 ? d.adjDividend : null,
    scaled_amount: d.scaledDividend > 0 ? d.scaledDividend : null,
    split_factor: d.adjDividend > 0 ? d.dividend / d.adjDividend : 1,
  }));

  if (dryRun) {
    console.log(`[Seed] [DRY RUN] Would insert ${records.length} dividend records for ${ticker}`);
    return records.length;
  }

  let inserted = 0;

  // Insert in batches
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from('dividends_detail')
      .upsert(batch, {
        onConflict: 'ticker,ex_date',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`[Seed] Error inserting dividend batch for ${ticker}:`, error);
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
}

/**
 * Update sync log for a ticker
 */
async function updateSyncLog(
  ticker: string,
  dataType: 'prices' | 'dividends',
  lastDataDate: string | null,
  recordsSynced: number,
  status: 'success' | 'error',
  errorMessage?: string
): Promise<void> {
  const { error } = await supabase
    .from('data_sync_log')
    .upsert({
      ticker,
      data_type: dataType,
      last_sync_date: new Date().toISOString().split('T')[0],
      last_data_date: lastDataDate,
      records_synced: recordsSynced,
      status,
      error_message: errorMessage || null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'ticker,data_type',
    });

  if (error) {
    console.error(`[Seed] Error updating sync log for ${ticker}:`, error);
  }
}

// ============================================================================
// Main Seeding Logic
// ============================================================================

async function seedTicker(
  ticker: string,
  startDate: string,
  dryRun: boolean
): Promise<{ prices: number; dividends: number }> {
  console.log(`\n[Seed] Processing ${ticker}...`);

  // Ensure ticker is in etf_static
  const exists = await ensureTickerInStatic(ticker);
  if (!exists) {
    console.log(`[Seed] Skipping ${ticker} - not in etf_static`);
    return { prices: 0, dividends: 0 };
  }

  // Fetch price history
  console.log(`[Seed] Fetching price history for ${ticker} from ${startDate}...`);
  const prices = await fetchPriceHistory(ticker, startDate);
  const pricesInserted = await insertPriceData(ticker, prices, dryRun);

  const lastPriceDate = prices.length > 0
    ? prices[prices.length - 1].date.split('T')[0]
    : null;

  if (!dryRun) {
    await updateSyncLog(
      ticker,
      'prices',
      lastPriceDate,
      pricesInserted,
      prices.length > 0 ? 'success' : 'error',
      prices.length === 0 ? 'No price data available' : undefined
    );
  }

  // Fetch dividend history
  console.log(`[Seed] Fetching dividend history for ${ticker}...`);
  const dividends = await fetchDividendHistory(ticker, startDate);
  const dividendsInserted = await insertDividendData(ticker, dividends, dryRun);

  const lastDividendDate = dividends.length > 0
    ? dividends[dividends.length - 1].date.split('T')[0]
    : null;

  if (!dryRun) {
    await updateSyncLog(
      ticker,
      'dividends',
      lastDividendDate,
      dividendsInserted,
      'success'
    );
  }

  console.log(`[Seed] ${ticker}: ${pricesInserted} prices, ${dividendsInserted} dividends`);

  return { prices: pricesInserted, dividends: dividendsInserted };
}

async function main(): Promise<void> {
  console.log('============================================');
  console.log('Tiingo Historical Data Seeding Script');
  console.log('============================================\n');

  const options = parseArgs();

  console.log('Configuration:');
  console.log(`  Start Date: ${options.startDate}`);
  console.log(`  Ticker: ${options.ticker || 'ALL'}`);
  console.log(`  Dry Run: ${options.dryRun}`);
  console.log('');

  // Verify Tiingo API connectivity
  console.log('[Seed] Checking Tiingo API connectivity...');
  const apiHealthy = await healthCheck();
  if (!apiHealthy) {
    console.error('[Seed] ERROR: Cannot connect to Tiingo API. Check your API key.');
    process.exit(1);
  }
  console.log('[Seed] Tiingo API connection successful.\n');

  // Get tickers to process
  let tickers: string[];
  if (options.ticker) {
    tickers = [options.ticker];
  } else {
    tickers = await getAllTickers();
    console.log(`[Seed] Found ${tickers.length} tickers to process.`);
  }

  if (tickers.length === 0) {
    console.log('[Seed] No tickers found. Please populate etf_static or etfs table first.');
    process.exit(0);
  }

  // Process each ticker
  const startTime = Date.now();
  let totalPrices = 0;
  let totalDividends = 0;
  let processedCount = 0;
  let errorCount = 0;

  for (const ticker of tickers) {
    try {
      const result = await seedTicker(ticker, options.startDate, options.dryRun);
      totalPrices += result.prices;
      totalDividends += result.dividends;
      processedCount++;

      // Show progress
      const rateLimitStatus = getRateLimitStatus();
      console.log(`[Seed] Progress: ${processedCount}/${tickers.length} | API Requests: ${rateLimitStatus.requestsThisHour}/${rateLimitStatus.hourlyLimit}`);

    } catch (error) {
      console.error(`[Seed] Error processing ${ticker}:`, error);
      errorCount++;
    }
  }

  // Summary
  const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
  console.log('\n============================================');
  console.log('Seeding Complete!');
  console.log('============================================');
  console.log(`  Tickers Processed: ${processedCount}`);
  console.log(`  Tickers with Errors: ${errorCount}`);
  console.log(`  Total Price Records: ${totalPrices}`);
  console.log(`  Total Dividend Records: ${totalDividends}`);
  console.log(`  Elapsed Time: ${elapsedSeconds}s`);

  if (options.dryRun) {
    console.log('\n  [DRY RUN] No data was actually written.');
  }
}

// Run the script
main().catch((error) => {
  console.error('[Seed] Fatal error:', error);
  process.exit(1);
});
