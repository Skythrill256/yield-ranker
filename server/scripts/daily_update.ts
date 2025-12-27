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
import { calculateMetrics, calculateRankings } from '../src/services/metrics.js';
import { batchUpdateETFMetrics } from '../src/services/database.js';
import type { TiingoPriceData } from '../src/types/index.js';

// Type alias for dividend data from Tiingo
type DividendData = { date: string; dividend: number; adjDividend: number; scaledDividend: number; recordDate: string | null; paymentDate: string | null; declarationDate: string | null };

// ============================================================================
// Configuration
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// CRITICAL: Must be at least 5 years (1825 days) for CEF Z-score calculations
// Using 15 years (5475 days) to match refresh scripts and ensure we have enough data for all metrics
const LOOKBACK_DAYS = 5475; // 15 years = 15 * 365 = 5475 days
// Minimum days needed for 5-year Z-score: 1260 trading days ≈ 1825 calendar days
const MIN_DAYS_FOR_ZSCORE = 1825; // ~5 years (ensures ~1260 trading days)
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
  --force           Force resync from last ${LOOKBACK_DAYS} days (15 years)
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
 * Check if ticker is a CEF and get NAV symbol
 */
async function getCEFInfo(ticker: string): Promise<{ isCEF: boolean; navSymbol: string | null }> {
  const { data, error } = await supabase
    .from('etf_static')
    .select('nav_symbol')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();

  if (error || !data || !data.nav_symbol) {
    return { isCEF: false, navSymbol: null };
  }

  return { isCEF: true, navSymbol: data.nav_symbol };
}

/**
 * Check if we have at least MIN_DAYS_FOR_ZSCORE days of data for a ticker
 */
async function hasMinimumData(ticker: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('prices_daily')
    .select('date')
    .eq('ticker', ticker)
    .order('date', { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) {
    return false;
  }

  const firstDate = new Date(data[0].date);
  const today = new Date();
  const daysDiff = Math.round((today.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));

  return daysDiff >= MIN_DAYS_FOR_ZSCORE;
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
    adj_open: p.adjOpen || p.open,
    adj_high: p.adjHigh || p.high,
    adj_low: p.adjLow || p.low,
    adj_volume: p.volume, // Tiingo uses volume for adj_volume
    div_cash: p.divCash || 0,
    split_factor: p.splitFactor || 1,
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
  dividends: DividendData[],
  dryRun: boolean
): Promise<number> {
  if (dividends.length === 0) return 0;

  const exDatesToUpdate = dividends.map(d => d.date.split('T')[0]);

  const { data: allExistingDividends } = await supabase
    .from('dividends_detail')
    .select('*')
    .eq('ticker', ticker)
    .in('ex_date', exDatesToUpdate);

  const existingDividendsMap = new Map<string, any>();
  (allExistingDividends || []).forEach(d => {
    const exDate = d.ex_date.split('T')[0];
    existingDividendsMap.set(exDate, d);
  });

  const isManualUpload = (record: any): boolean => {
    // Primary check: dedicated is_manual column (more reliable)
    if (record?.is_manual === true) return true;
    // Fallback: check description for legacy manual uploads
    const desc = record?.description || '';
    return desc.includes('Manual upload') || desc.includes('Early announcement');
  };

  let alignedCount = 0;
  let preservedCount = 0;

  const manualUploadsToPreserve: Array<any> = [];
  const tiingoRecordsToUpsert: Array<any> = [];

  for (const d of dividends) {
    const exDate = d.date.split('T')[0];
    const existing = existingDividendsMap.get(exDate);

    if (existing && isManualUpload(existing)) {
      const tiingoDivCash = d.dividend;
      const tiingoAdjAmount = d.adjDividend > 0 ? d.adjDividend : null;
      const manualDivCash = parseFloat(existing.div_cash);
      const manualAdjAmount = existing.adj_amount ? parseFloat(existing.adj_amount) : null;
      const tolerance = 0.001;

      let isAligned = false;
      if (tiingoAdjAmount && manualAdjAmount !== null) {
        isAligned = Math.abs(manualAdjAmount - tiingoAdjAmount) < tolerance;
      } else {
        isAligned = Math.abs(manualDivCash - tiingoDivCash) < tolerance;
      }

      // Even if not aligned, we merge Tiingo's official dates and split factors
      // while preserving the user's manual dividend amount if it was an override.
      alignedCount++;
      tiingoRecordsToUpsert.push({
        ticker,
        ex_date: exDate,
        pay_date: d.paymentDate?.split('T')[0] || existing.pay_date,
        record_date: d.recordDate?.split('T')[0] || existing.record_date,
        declare_date: d.declarationDate?.split('T')[0] || existing.declare_date,
        // If it aligns, use Tiingo's official amount. If not, preserve manual override.
        div_cash: isAligned ? d.dividend : existing.div_cash,
        adj_amount: isAligned ? (d.adjDividend > 0 ? d.adjDividend : null) : existing.adj_amount,
        scaled_amount: d.scaledDividend > 0 ? d.scaledDividend : existing.scaled_amount,
        split_factor: d.adjDividend > 0 ? d.dividend / d.adjDividend : (existing.split_factor || 1),
        description: existing.description, // Preserve manual upload marker
        div_type: existing.div_type,
        frequency: existing.frequency,
        currency: existing.currency || 'USD',
        is_manual: true, // Keep marked as manual
      });
    } else {
      tiingoRecordsToUpsert.push({
        ticker,
        ex_date: exDate,
        pay_date: d.paymentDate?.split('T')[0] || null,
        record_date: d.recordDate?.split('T')[0] || null,
        declare_date: d.declarationDate?.split('T')[0] || null,
        div_cash: d.dividend,
        adj_amount: d.adjDividend > 0 ? d.adjDividend : null,
        scaled_amount: d.scaledDividend > 0 ? d.scaledDividend : null,
        split_factor: d.adjDividend > 0 ? d.dividend / d.adjDividend : 1,
      });
    }
  }

  const recordsToUpsert = [...tiingoRecordsToUpsert];

  const { data: allManualUploadsNotInTiingo } = await supabase
    .from('dividends_detail')
    .select('*')
    .eq('ticker', ticker)
    .or('description.ilike.%Manual upload%,description.ilike.%Early announcement%');

  (allManualUploadsNotInTiingo || []).forEach(existing => {
    const exDate = existing.ex_date.split('T')[0];
    if (!exDatesToUpdate.includes(exDate)) {
      manualUploadsToPreserve.push({
        ticker,
        ex_date: existing.ex_date,
        pay_date: existing.pay_date,
        record_date: existing.record_date,
        declare_date: existing.declare_date,
        div_cash: existing.div_cash,
        adj_amount: existing.adj_amount,
        scaled_amount: existing.scaled_amount,
        split_factor: existing.split_factor,
        description: existing.description,
        div_type: existing.div_type,
        frequency: existing.frequency,
        currency: existing.currency || 'USD',
      });
    }
  });

  if (alignedCount > 0 && !dryRun) {
    console.log(`  Updating ${alignedCount} dividend(s) where Tiingo aligns with manual upload`);
  }
  if (preservedCount > 0 && !dryRun) {
    console.log(`  Preserving ${preservedCount} manual dividend upload(s) (values don't align)`);
  }

  if (recordsToUpsert.length === 0 && manualUploadsToPreserve.length === 0) {
    return 0;
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would upsert ${recordsToUpsert.length} dividend records`);
    console.log(`  [DRY RUN] Would preserve ${manualUploadsToPreserve.length} manual upload(s) not in Tiingo data`);
    return recordsToUpsert.length;
  }

  // Ensure preserved manual uploads have is_manual flag set
  const allRecordsToUpsert = [...recordsToUpsert, ...manualUploadsToPreserve.map(r => ({
    ...r,
    is_manual: true  // Mark as manual to prevent future overwrites
  }))];

  let { error } = await supabase
    .from('dividends_detail')
    .upsert(allRecordsToUpsert, {
      onConflict: 'ticker,ex_date',
      ignoreDuplicates: false,
    });

  if (error && error.message.includes('scaled_amount')) {
    console.warn(`  ⚠️  scaled_amount column missing. Saving without scaled_amount. Run migration SQL to fix.`);
    const recordsWithoutScaled = allRecordsToUpsert.map(({ scaled_amount, ...rest }) => rest);
    const result = await supabase
      .from('dividends_detail')
      .upsert(recordsWithoutScaled, {
        onConflict: 'ticker,ex_date',
        ignoreDuplicates: false,
      });
    error = result.error;
    if (!error) {
      console.warn(`  ✓ Saved dividends (scaled_amount will be added after migration)`);
    }
  }

  if (error) {
    console.error(`  Error upserting dividends for ${ticker}:`, error.message);
    return 0;
  }

  if (manualUploadsToPreserve.length > 0) {
    console.log(`  Preserved ${manualUploadsToPreserve.length} manual upload(s) not yet in Tiingo data`);
  }

  return recordsToUpsert.length;
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
    // Check if this is a CEF
    const { isCEF, navSymbol } = await getCEFInfo(ticker);
    if (isCEF && navSymbol) {
      console.log(`  CEF detected - NAV symbol: ${navSymbol}`);
    }

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
        
        // For CEFs, ensure we have at least 5 years of data for Z-score calculations
        if (isCEF && !(await hasMinimumData(ticker))) {
          const minStartDate = getDateDaysAgo(MIN_DAYS_FOR_ZSCORE);
          if (priceStartDate > minStartDate) {
            console.log(`  ⚠ CEF requires at least ${MIN_DAYS_FOR_ZSCORE} days of data for Z-score`);
            console.log(`  Extending fetch period to ${minStartDate}`);
            priceStartDate = minStartDate;
          }
        }
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

    // Fetch and upsert prices for main ticker
    const prices = await fetchPriceHistory(ticker, priceStartDate);
    const pricesAdded = await upsertPrices(ticker, prices, dryRun);
    
    // For CEFs, also fetch and store NAV symbol data
    let navPricesAdded = 0;
    if (isCEF && navSymbol && navSymbol !== ticker) {
      console.log(`  Fetching NAV prices for ${navSymbol}...`);
      const navPrices = await fetchPriceHistory(navSymbol, priceStartDate);
      navPricesAdded = await upsertPrices(navSymbol, navPrices, dryRun);
      console.log(`  ✓ Added/updated ${navPricesAdded} NAV price records for ${navSymbol}`);
    }

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
      ? dividends[dividends.length - 1].date.split('T')[0]
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

    if (dividendsAdded === 0 && dividends.length > 0) {
      console.log(`  ✓ ${pricesAdded} prices, 0 dividends saved (${dividends.length} found but failed to save - check errors above)`);
    } else if (dividendsAdded === 0) {
      console.log(`  ✓ ${pricesAdded} prices, 0 dividends (no new dividends in last 30 days)`);
    } else {
      console.log(`  ✓ ${pricesAdded} prices, ${dividendsAdded} dividends`);
    }

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

  // Calculate and save rankings
  if (!options.dryRun && successful > 0) {
    console.log('\n[Rankings] Calculating weighted ranks...');
    try {
      const rankings = await calculateRankings();
      console.log(`[Rankings] Calculated ranks for ${rankings.length} ETFs`);

      // Update ranks in database
      for (const ranked of rankings) {
        await supabase
          .from('etf_static')
          .update({ weighted_rank: ranked.rank })
          .eq('ticker', ranked.ticker);
      }
      console.log('[Rankings] ✅ Saved ranks to database');
    } catch (error) {
      console.error('[Rankings] ❌ Failed to calculate rankings:', (error as Error).message);
    }
  }

  // Log errors for debugging
  if (errors > 0) {
    console.log('\nTickers with errors:');
    results
      .filter(r => r.status === 'error')
      .forEach(r => console.log(`  - ${r.ticker}: ${r.message}`));
  }

  // Clear API cache after update completes so frontend sees new timestamp
  if (!options.dryRun && (successful > 0 || skipped > 0)) {
    try {
      const { deleteCached, CACHE_KEYS } = await import('../src/services/redis.js');
      await deleteCached(CACHE_KEYS.ETF_LIST);
      console.log('[Cache] ✅ Cleared ETF list cache');
    } catch (error) {
      console.warn('[Cache] ⚠️  Failed to clear cache:', (error as Error).message);
    }
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
