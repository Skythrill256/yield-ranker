/**
 * daily_update.ts - Daily Data Update Cron Job
 * 
 * This script performs incremental updates to prices_daily and dividends_detail
 * by fetching only new data since the last sync date.
 * 
 * Schedule: Run once daily at 8:00 PM EST (after market close)
 * 
 * Usage: npx tsx scripts/daily_update.ts [--ticker SYMBOL] [--force]
 * 
 * Options:
 *   --ticker SYMBOL   Update only a specific ticker
 *   --force           Force full resync from last 7 days
 *   --dry-run         Show what would be done without making changes
 * 
 * Cron Setup (Linux):
 *   0 20 * * 1-5 cd /path/to/server && npx tsx scripts/daily_update.ts >> logs/daily_update.log 2>&1
 * 
 * Railway/Vercel Cron:
 *   Schedule via platform's cron feature or use a trigger endpoint
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
import { calculateMetrics } from '../src/services/metrics.js';
import { batchUpdateETFMetrics } from '../src/services/database.js';
import type { TiingoPriceData, TiingoDividendData } from '../src/types/index.js';

// ============================================================================
// Configuration
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LOOKBACK_DAYS = 7; // Days to look back when forcing or first run
const BATCH_SIZE = 100;

// ============================================================================
// Database Client
// ============================================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================================================
// CLI Arguments
// ============================================================================

interface CliOptions {
  ticker?: string;
  force: boolean;
  dryRun: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    force: false,
    dryRun: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ticker':
        options.ticker = args[++i]?.toUpperCase();
        break;
      case '--force':
        options.force = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        console.log(`
Usage: npx tsx scripts/daily_update.ts [options]

Options:
  --ticker SYMBOL   Update only a specific ticker
  --force           Force resync from last ${LOOKBACK_DAYS} days
  --dry-run         Show what would be done without making changes
  --help            Show this help message
        `);
        process.exit(0);
    }
  }
  
  return options;
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDate(date);
}

function getTodayDate(): string {
  return formatDate(new Date());
}

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

function isMarketClosed(): boolean {
  // Markets are closed on weekends and some holidays
  // For simplicity, we just check weekends here
  return isWeekend();
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Get all active tickers from etf_static
 */
async function getActiveTickers(): Promise<string[]> {
  const { data, error } = await supabase
    .from('etf_static')
    .select('ticker')
    .order('ticker');
  
  if (error) {
    // Fallback to etfs table
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
 * Get last sync info for a ticker
 */
async function getLastSyncDate(
  ticker: string,
  dataType: 'prices' | 'dividends'
): Promise<string | null> {
  const { data, error } = await supabase
    .from('data_sync_log')
    .select('last_data_date')
    .eq('ticker', ticker)
    .eq('data_type', dataType)
    .single();
  
  if (error || !data?.last_data_date) {
    return null;
  }
  
  return data.last_data_date;
}

/**
 * Get the last price date directly from prices_daily table
 */
async function getLastPriceDate(ticker: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('prices_daily')
    .select('date')
    .eq('ticker', ticker)
    .order('date', { ascending: false })
    .limit(1)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data.date;
}

/**
 * Upsert price records
 */
async function upsertPrices(
  ticker: string,
  prices: TiingoPriceData[],
  dryRun: boolean
): Promise<number> {
  if (prices.length === 0) return 0;
  
  const records = prices.map(p => ({
    ticker,
    date: p.date.split('T')[0],
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    adj_close: p.adjClose,
    volume: p.volume,
    adj_open: p.adjOpen,
    adj_high: p.adjHigh,
    adj_low: p.adjLow,
    adj_volume: p.adjVolume,
    div_cash: p.divCash,
    split_factor: p.splitFactor,
  }));
  
  if (dryRun) {
    console.log(`  [DRY RUN] Would upsert ${records.length} price records`);
    return records.length;
  }
  
  let upserted = 0;
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabase
      .from('prices_daily')
      .upsert(batch, {
        onConflict: 'ticker,date',
        ignoreDuplicates: false,
      });
    
    if (error) {
      console.error(`  Error upserting prices for ${ticker}:`, error.message);
    } else {
      upserted += batch.length;
    }
  }
  
  return upserted;
}

/**
 * Upsert dividend records
 */
async function upsertDividends(
  ticker: string,
  dividends: TiingoDividendData[],
  dryRun: boolean
): Promise<number> {
  if (dividends.length === 0) return 0;
  
  const records = dividends.map(d => ({
    ticker,
    ex_date: d.exDate.split('T')[0],
    pay_date: d.paymentDate?.split('T')[0] || null,
    record_date: d.recordDate?.split('T')[0] || null,
    declare_date: d.declareDate?.split('T')[0] || null,
    div_cash: d.divCash,
    split_factor: d.splitFactor,
  }));
  
  if (dryRun) {
    console.log(`  [DRY RUN] Would upsert ${records.length} dividend records`);
    return records.length;
  }
  
  const { error } = await supabase
    .from('dividends_detail')
    .upsert(records, {
      onConflict: 'ticker,ex_date',
      ignoreDuplicates: false,
    });
  
  if (error) {
    console.error(`  Error upserting dividends for ${ticker}:`, error.message);
    return 0;
  }
  
  return records.length;
}

/**
 * Update sync log after successful update
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
      last_sync_date: getTodayDate(),
      last_data_date: lastDataDate,
      records_synced: recordsSynced,
      status,
      error_message: errorMessage || null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'ticker,data_type',
    });
  
  if (error) {
    console.error(`  Error updating sync log:`, error.message);
  }
}

// ============================================================================
// Update Logic
// ============================================================================

interface UpdateResult {
  ticker: string;
  pricesAdded: number;
  dividendsAdded: number;
  status: 'success' | 'error' | 'skipped';
  message?: string;
}

async function updateTicker(
  ticker: string,
  force: boolean,
  dryRun: boolean
): Promise<UpdateResult> {
  console.log(`\n[Update] ${ticker}`);
  
  try {
    // Determine start date for price fetch
    let priceStartDate: string;
    
    if (force) {
      priceStartDate = getDateDaysAgo(LOOKBACK_DAYS);
      console.log(`  Force mode: fetching from ${priceStartDate}`);
    } else {
      const lastPriceDate = await getLastPriceDate(ticker);
      if (lastPriceDate) {
        // Start from the day after last recorded date
        const lastDate = new Date(lastPriceDate);
        lastDate.setDate(lastDate.getDate() + 1);
        priceStartDate = formatDate(lastDate);
        console.log(`  Incremental: fetching from ${priceStartDate} (last: ${lastPriceDate})`);
      } else {
        // No existing data, fetch last LOOKBACK_DAYS
        priceStartDate = getDateDaysAgo(LOOKBACK_DAYS);
        console.log(`  Initial: fetching from ${priceStartDate}`);
      }
    }
    
    // Skip if start date is today or in the future
    if (priceStartDate >= getTodayDate()) {
      console.log(`  Already up to date`);
      return {
        ticker,
        pricesAdded: 0,
        dividendsAdded: 0,
        status: 'skipped',
        message: 'Already up to date',
      };
    }
    
    // Fetch and upsert prices
    const prices = await fetchPriceHistory(ticker, priceStartDate);
    const pricesAdded = await upsertPrices(ticker, prices, dryRun);
    
    const lastPriceRecordDate = prices.length > 0
      ? prices[prices.length - 1].date.split('T')[0]
      : null;
    
    if (!dryRun) {
      await updateSyncLog(ticker, 'prices', lastPriceRecordDate, pricesAdded, 'success');
    }
    
    // Fetch and upsert dividends (always check recent dividends)
    const dividendStartDate = getDateDaysAgo(30); // Check last 30 days for dividends
    const dividends = await fetchDividendHistory(ticker, dividendStartDate);
    const dividendsAdded = await upsertDividends(ticker, dividends, dryRun);
    
    const lastDividendDate = dividends.length > 0
      ? dividends[dividends.length - 1].exDate.split('T')[0]
      : null;
    
    if (!dryRun) {
      await updateSyncLog(ticker, 'dividends', lastDividendDate, dividendsAdded, 'success');
    }
    
    // Step 3: Recompute metrics (annualized dividend, SD/CV, returns)
    // This is the key step per Section 2.4 of the PDF:
    // - Recompute annualized dividend series → annual_dividend, SD, CV
    // - Recompute all total-return and price-return horizons
    // - Persist to DB
    console.log(`  Recomputing metrics...`);
    if (!dryRun) {
      try {
        const metrics = await calculateMetrics(ticker);
        await batchUpdateETFMetrics([{
          ticker,
          metrics: {
            price: metrics.currentPrice,
            price_change: metrics.priceChange,
            price_change_pct: metrics.priceChangePercent,
            last_dividend: metrics.lastDividend,
            annual_dividend: metrics.annualizedDividend,
            forward_yield: metrics.forwardYield,
            dividend_sd: metrics.dividendSD,
            dividend_cv: metrics.dividendCV,
            dividend_cv_percent: metrics.dividendCVPercent,
            dividend_volatility_index: metrics.dividendVolatilityIndex,
            week_52_high: metrics.week52High,
            week_52_low: metrics.week52Low,
            // Total Return WITH DRIP
            tr_drip_3y: metrics.totalReturnDrip?.['3Y'],
            tr_drip_12m: metrics.totalReturnDrip?.['1Y'],
            tr_drip_6m: metrics.totalReturnDrip?.['6M'],
            tr_drip_3m: metrics.totalReturnDrip?.['3M'],
            tr_drip_1m: metrics.totalReturnDrip?.['1M'],
            tr_drip_1w: metrics.totalReturnDrip?.['1W'],
            // Price Return
            price_return_3y: metrics.priceReturn?.['3Y'],
            price_return_12m: metrics.priceReturn?.['1Y'],
            price_return_6m: metrics.priceReturn?.['6M'],
            price_return_3m: metrics.priceReturn?.['3M'],
            price_return_1m: metrics.priceReturn?.['1M'],
            price_return_1w: metrics.priceReturn?.['1W'],
            // Total Return WITHOUT DRIP (optional)
            tr_nodrip_3y: metrics.totalReturnNoDrip?.['3Y'],
            tr_nodrip_12m: metrics.totalReturnNoDrip?.['1Y'],
            tr_nodrip_6m: metrics.totalReturnNoDrip?.['6M'],
            tr_nodrip_3m: metrics.totalReturnNoDrip?.['3M'],
            tr_nodrip_1m: metrics.totalReturnNoDrip?.['1M'],
            tr_nodrip_1w: metrics.totalReturnNoDrip?.['1W'],
            last_updated: new Date().toISOString(),
          }
        }]);
        console.log(`  ✓ Metrics updated: yield=${metrics.forwardYield?.toFixed(2)}%, CV=${metrics.dividendCVPercent?.toFixed(1)}%`);
      } catch (metricsError) {
        console.error(`  ⚠️ Metrics calculation failed:`, metricsError instanceof Error ? metricsError.message : metricsError);
      }
    }
    
    console.log(`  ✓ ${pricesAdded} prices, ${dividendsAdded} dividends`);
    
    return {
      ticker,
      pricesAdded,
      dividendsAdded,
      status: 'success',
    };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`  ✗ Error: ${message}`);
    
    return {
      ticker,
      pricesAdded: 0,
      dividendsAdded: 0,
      status: 'error',
      message,
    };
  }
}

// ============================================================================
// Main Function
// ============================================================================

async function main(): Promise<void> {
  const startTime = Date.now();
  
  console.log('============================================');
  console.log('Tiingo Daily Update Script');
  console.log(`Run Time: ${new Date().toISOString()}`);
  console.log('============================================');
  
  const options = parseArgs();
  
  console.log('\nConfiguration:');
  console.log(`  Ticker: ${options.ticker || 'ALL'}`);
  console.log(`  Force Resync: ${options.force}`);
  console.log(`  Dry Run: ${options.dryRun}`);
  
  // Check if market was open today
  if (isMarketClosed()) {
    console.log('\n⚠️  Note: Market is closed today (weekend). Data may not have changed.');
  }
  
  // Verify API connectivity
  console.log('\n[Update] Checking Tiingo API...');
  const apiHealthy = await healthCheck();
  if (!apiHealthy) {
    console.error('[Update] ERROR: Cannot connect to Tiingo API');
    process.exit(1);
  }
  console.log('[Update] API connection OK');
  
  // Get tickers to update
  let tickers: string[];
  if (options.ticker) {
    tickers = [options.ticker];
  } else {
    tickers = await getActiveTickers();
  }
  
  console.log(`\n[Update] Processing ${tickers.length} ticker(s)...`);
  
  // Process tickers
  const results: UpdateResult[] = [];
  
  for (const ticker of tickers) {
    const result = await updateTicker(ticker, options.force, options.dryRun);
    results.push(result);
    
    // Progress update every 10 tickers
    if (results.length % 10 === 0) {
      const status = getRateLimitStatus();
      console.log(`\n[Update] Progress: ${results.length}/${tickers.length} | API: ${status.requestsThisHour}/${status.hourlyLimit}`);
    }
  }
  
  // Summary
  const elapsedMs = Date.now() - startTime;
  const successful = results.filter(r => r.status === 'success').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;
  const totalPrices = results.reduce((sum, r) => sum + r.pricesAdded, 0);
  const totalDividends = results.reduce((sum, r) => sum + r.dividendsAdded, 0);
  
  console.log('\n============================================');
  console.log('Update Complete');
  console.log('============================================');
  console.log(`  Total Tickers: ${tickers.length}`);
  console.log(`  Successful: ${successful}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Prices Added: ${totalPrices}`);
  console.log(`  Dividends Added: ${totalDividends}`);
  console.log(`  Duration: ${(elapsedMs / 1000).toFixed(1)}s`);
  
  if (options.dryRun) {
    console.log('\n  [DRY RUN] No data was actually written.');
  }
  
  // Log errors for debugging
  if (errors > 0) {
    console.log('\nTickers with errors:');
    results
      .filter(r => r.status === 'error')
      .forEach(r => console.log(`  - ${r.ticker}: ${r.message}`));
  }
  
  // Exit with error code if any failures
  if (errors > 0) {
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('[Update] Fatal error:', error);
  process.exit(1);
});
