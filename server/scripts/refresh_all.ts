/**
 * refresh_all.ts - Complete Data Refresh Script
 * 
 * This script performs a full refresh of all data:
 * 1. Forces re-download of prices and dividends (with extended lookback for splits)
 * 2. Recalculates all metrics
 * 3. Verifies data integrity
 * 
 * Usage: npx tsx scripts/refresh_all.ts [--ticker SYMBOL] [--dry-run]
 * 
 * Options:
 *   --ticker SYMBOL   Refresh only a specific ticker (useful for reverse splits like AMDY, PYPY)
 *   --dry-run         Show what would be done without making changes
 */

// CRITICAL: Load environment variables FIRST before ANY other imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from multiple possible locations (including nested yield-ranker directory)
const envPaths = [
  path.resolve(process.cwd(), '.env'),                    // Current working directory
  path.resolve(process.cwd(), '../.env'),                 // Parent of current directory
  path.resolve(__dirname, '../.env'),                      // server/.env
  path.resolve(__dirname, '../../.env'),                  // root/.env
  path.resolve(__dirname, '../../../yield-ranker/server/.env'), // yield-ranker/server/.env
  path.resolve(__dirname, '../../yield-ranker/server/.env'),    // root/yield-ranker/server/.env
];

// Try all paths - dotenv.config() doesn't throw if file doesn't exist
let envLoaded = false;
let loadedEnvPath = '';
for (const envPath of envPaths) {
  try {
    const result = dotenv.config({ path: envPath });
    if (!result.error && result.parsed && Object.keys(result.parsed).length > 0) {
      console.log(`✓ Loaded .env from: ${envPath}`);
      envLoaded = true;
      loadedEnvPath = envPath;
      break;
    }
  } catch (e) {
    // Continue to next path
  }
}

// Also try default location (current directory)
if (!envLoaded) {
  const defaultResult = dotenv.config();
  if (!defaultResult.error && defaultResult.parsed && Object.keys(defaultResult.parsed).length > 0) {
    console.log(`✓ Loaded .env from default location`);
    envLoaded = true;
  }
}

if (!envLoaded) {
  console.log(`⚠ No .env file found. Will use system environment variables if available.`);
} else {
  // Verify critical variables are loaded
  const requiredVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TIINGO_API_KEY'];
  const missingVars = requiredVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error(`⚠ WARNING: Missing environment variables: ${missingVars.join(', ')}`);
    console.error(`  .env file loaded from: ${loadedEnvPath || 'default location'}`);
    console.error(`  Please check that these variables are set in the .env file.`);
  } else {
    console.log(`✓ All required environment variables are loaded`);
  }
}

// Now import modules that need environment variables
import { createClient } from '@supabase/supabase-js';

import {
  fetchPriceHistory,
  fetchDividendHistory,
  healthCheck,
} from '../src/services/tiingo.js';
import { calculateMetrics } from '../src/services/metrics.js';
import { batchUpdateETFMetrics, batchUpdateETFMetricsPreservingCEFFields } from '../src/services/database.js';
import { calculateNormalizedDividends } from '../src/services/dividendNormalization.js';
import type { TiingoPriceData } from '../src/types/index.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// CRITICAL: Must be 15 years (5475 days) for CEF metrics (15Y returns, Signal)
// DO NOT CHANGE THIS - CEF metrics require 15 years of historical data
// Note: Z-Score uses 3-year max lookback (fetched within this 15-year window)
const LOOKBACK_DAYS = 5475; // 15 years = 15 * 365 = 5475 days - needed for 15Y return calculations
const DIVIDEND_LOOKBACK_DAYS = 5475; // 15 years = 15 * 365 = 5475 days

// VERIFY CONSTANT IS CORRECT - This will error if somehow changed
if (LOOKBACK_DAYS !== 5475) {
  console.error('❌ CRITICAL ERROR: LOOKBACK_DAYS is NOT 5475! It is:', LOOKBACK_DAYS);
  console.error('❌ This will cause incorrect data fetching. Fix immediately!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface CliOptions {
  ticker?: string;
  dryRun: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ticker':
        options.ticker = args[++i]?.toUpperCase();
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        console.log(`
Usage: npx tsx scripts/refresh_all.ts [options]

Options:
  --ticker SYMBOL   Refresh only a specific ticker (e.g., AMDY, PYPY for reverse splits)
  --dry-run         Show what would be done without making changes
  --help            Show this help message

This script will:
1. Force re-download prices and dividends from last ${LOOKBACK_DAYS} days
2. Recalculate all metrics (DVI, returns, etc.)
3. Verify data integrity
        `);
        process.exit(0);
    }
  }

  return options;
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function upsertPrices(ticker: string, prices: TiingoPriceData[], dryRun: boolean): Promise<number> {
  if (prices.length === 0) return 0;
  if (dryRun) {
    console.log(`  Would upsert ${prices.length} price records`);
    return prices.length;
  }

  // Ensure ticker exists in etf_static (required for foreign key constraint)
  // This is especially important for NAV symbols like XBTOX
  const { data: existingTicker, error: checkError } = await supabase
    .from('etf_static')
    .select('ticker')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();

  if (!existingTicker && !checkError) {
    // Try to insert a minimal record for NAV symbols
    console.log(`  Creating ticker record for ${ticker} (required for foreign key)...`);
    const { error: insertError } = await supabase
      .from('etf_static')
      .insert({
        ticker: ticker.toUpperCase(),
        name: `NAV Symbol: ${ticker}`,
        description: `Auto-created for NAV price data`,
      });

    if (insertError) {
      console.warn(`  ⚠ Could not create ticker record for ${ticker}: ${insertError.message}`);
      console.warn(`  ⚠ Will skip inserting prices for ${ticker} to avoid foreign key error`);
      return 0; // Skip this ticker
    } else {
      console.log(`  ✓ Created ticker record for ${ticker} (NAV symbol)`);
    }
  } else if (checkError) {
    console.warn(`  ⚠ Error checking ticker ${ticker}: ${checkError.message}`);
  }

  const records = prices.map(p => ({
    ticker: ticker.toUpperCase(),
    date: p.date.split('T')[0],
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    adj_close: p.adjClose,
    volume: p.volume,
    div_cash: p.divCash || 0,
    split_factor: p.splitFactor || 1,
  }));

  const { error } = await supabase
    .from('prices_daily')
    .upsert(records, {
      onConflict: 'ticker,date',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error(`  Error upserting prices: ${error.message}`);
    return 0;
  }

  return records.length;
}

async function upsertDividends(ticker: string, dividends: any[], dryRun: boolean): Promise<number> {
  if (dividends.length === 0) return 0;
  if (dryRun) {
    console.log(`  Would upsert ${dividends.length} dividend records`);
    return dividends.length;
  }

  const exDatesToUpdate = dividends.map(d => d.date.split('T')[0]);

  // Check if is_manual column exists by trying to query it
  let allManualUploads: any[] = [];
  try {
    const { data, error } = await supabase
      .from('dividends_detail')
      .select('*')
      .eq('ticker', ticker.toUpperCase())
      .or('is_manual.eq.true,description.ilike.%Manual upload%,description.ilike.%Early announcement%');
    if (!error) {
      allManualUploads = data || [];
    }
  } catch (e) {
    // Column doesn't exist, fallback to description-based check
    const { data } = await supabase
      .from('dividends_detail')
      .select('*')
      .eq('ticker', ticker.toUpperCase())
      .or('description.ilike.%Manual upload%,description.ilike.%Early announcement%');
    allManualUploads = data || [];
  }

  const manualUploadsMap = new Map<string, any>();
  (allManualUploads || []).forEach(d => {
    const exDate = d.ex_date.split('T')[0];
    manualUploadsMap.set(exDate, d);
  });

  let preservedCount = 0;

  const manualUploadsToPreserve: Array<{ ticker: string; ex_date: string; pay_date: string | null; record_date: string | null; declare_date: string | null; div_cash: number; adj_amount: number | null; scaled_amount: number | null; split_factor: number; description: string; div_type: string | null; frequency: string | null; currency: string }> = [];

  const { data: allExistingDividends } = await supabase
    .from('dividends_detail')
    .select('*')
    .eq('ticker', ticker.toUpperCase())
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

  const tiingoRecordsToUpsert: Array<any> = [];

  for (const d of dividends) {
    const exDate = d.date.split('T')[0];
    const existing = existingDividendsMap.get(exDate);
    const manualUpload = manualUploadsMap.get(exDate) || (existing && isManualUpload(existing) ? existing : null);

    if (manualUpload) {
      // Merge: take manual amount, but Tiingo dates and split factors
      const tiingoDivCash = d.dividend;
      const tiingoAdjAmount = d.adjDividend > 0 ? d.adjDividend : null;
      const manualDivCash = parseFloat(manualUpload.div_cash);
      const manualAdjAmount = manualUpload.adj_amount ? parseFloat(manualUpload.adj_amount) : null;
      const tolerance = 0.001;

      let isAligned = false;
      if (tiingoAdjAmount && manualAdjAmount !== null) {
        isAligned = Math.abs(manualAdjAmount - tiingoAdjAmount) < tolerance;
      } else {
        isAligned = Math.abs(manualDivCash - tiingoDivCash) < tolerance;
      }

      preservedCount++;
      tiingoRecordsToUpsert.push({
        ticker: ticker.toUpperCase(),
        ex_date: exDate,
        pay_date: d.paymentDate?.split('T')[0] || manualUpload.pay_date,
        record_date: d.recordDate?.split('T')[0] || manualUpload.record_date,
        declare_date: d.declarationDate?.split('T')[0] || manualUpload.declare_date,
        // If it aligns, use Tiingo's official amount. If not, preserve manual override.
        div_cash: isAligned ? d.dividend : manualUpload.div_cash,
        adj_amount: isAligned ? (d.adjDividend > 0 ? d.adjDividend : null) : manualUpload.adj_amount,
        scaled_amount: d.scaledDividend > 0 ? d.scaledDividend : manualUpload.scaled_amount,
        split_factor: d.adjDividend > 0 ? d.dividend / d.adjDividend : (manualUpload.split_factor || 1),
        description: manualUpload.description,
        div_type: manualUpload.div_type,
        frequency: manualUpload.frequency,
        currency: manualUpload.currency || 'USD',
        is_manual: true, // Keep marked as manual
      });
    } else {
      tiingoRecordsToUpsert.push({
        ticker: ticker.toUpperCase(),
        ex_date: exDate,
        pay_date: d.paymentDate?.split('T')[0] || null,
        record_date: d.recordDate?.split('T')[0] || null,
        declare_date: d.declarationDate?.split('T')[0] || null,
        div_cash: d.dividend,
        adj_amount: d.adjDividend > 0 ? d.adjDividend : null,
        scaled_amount: d.scaledDividend > 0 ? d.scaledDividend : null,
        div_type: null,
        frequency: null,
        description: null,
        currency: 'USD',
        split_factor: d.adjDividend > 0 ? d.dividend / d.adjDividend : 1,
        is_manual: false,  // Explicitly mark as Tiingo data (not manual)
      });
    }
  }

  (allManualUploads || []).forEach(existing => {
    const exDate = existing.ex_date.split('T')[0];
    if (!exDatesToUpdate.includes(exDate)) {
      manualUploadsToPreserve.push({
        ticker: ticker.toUpperCase(),
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

  if (preservedCount > 0) {
    console.log(`  Preserving ${preservedCount} manual dividend upload(s) (manual always takes priority over Tiingo)`);
  }

  if (tiingoRecordsToUpsert.length === 0 && manualUploadsToPreserve.length === 0) {
    return 0;
  }

  // Ensure preserved manual uploads have is_manual flag set
  // Also ensure tiingoRecordsToUpsert that came from manual uploads keep is_manual flag
  // Build records - include is_manual if it exists in the data, but don't require it
  const allRecordsToUpsert = [
    ...tiingoRecordsToUpsert,
    ...manualUploadsToPreserve
  ];

  // Try to upsert with is_manual, but handle gracefully if column doesn't exist
  // Remove is_manual from records to avoid schema cache issues
  const recordsWithoutIsManual = allRecordsToUpsert.map(({ is_manual, ...rest }) => rest);
  
  const { error } = await supabase
    .from('dividends_detail')
    .upsert(recordsWithoutIsManual, {
      onConflict: 'ticker,ex_date',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error(`  Error upserting dividends: ${error.message}`);
    return 0;
  }

  if (manualUploadsToPreserve.length > 0) {
    console.log(`  Preserved ${manualUploadsToPreserve.length} manual upload(s) not yet in Tiingo data`);
  }

  return tiingoRecordsToUpsert.length;
}

async function refreshTicker(ticker: string, dryRun: boolean): Promise<void> {
  console.log(`\n[Refresh] ${ticker}`);
  // CRITICAL VERIFICATION: Ensure we're using 15 years
  const expectedDays = 5475;
  const expectedYears = 15;
  if (LOOKBACK_DAYS !== expectedDays) {
    console.error(`  ❌ CRITICAL ERROR: LOOKBACK_DAYS is ${LOOKBACK_DAYS}, expected ${expectedDays} (15 years)!`);
    console.error(`  ❌ This ticker will NOT get 15 years of data!`);
    throw new Error(`LOOKBACK_DAYS is incorrect: ${LOOKBACK_DAYS} (expected ${expectedDays})`);
  }
  const years = Math.round(LOOKBACK_DAYS / 365);
  if (years !== expectedYears) {
    console.error(`  ❌ CRITICAL ERROR: Calculated years is ${years}, expected ${expectedYears}!`);
    throw new Error(`Calculated years is incorrect: ${years} (expected ${expectedYears})`);
  }
  console.log(`  ✅ VERIFIED: Fetching data from last ${LOOKBACK_DAYS} days (${years} years for CEF metrics - 15Y returns, 3Y Z-Score, Signal)...`);

  try {
    const priceStartDate = getDateDaysAgo(LOOKBACK_DAYS);
    const dividendStartDate = getDateDaysAgo(DIVIDEND_LOOKBACK_DAYS);

    console.log(`  Prices: ${priceStartDate} to today`);
    console.log(`  Dividends: ${dividendStartDate} to today`);

    // This script only processes ETFs (CEFs are excluded at query level)
    // PARALLELIZE price and dividend fetching for speed
    console.log(`  Fetching prices and dividends in parallel...`);
    const [prices, dividends] = await Promise.all([
      fetchPriceHistory(ticker, priceStartDate),
      fetchDividendHistory(ticker, dividendStartDate)
    ]);
    
    // Upsert in parallel
    const [pricesAdded, dividendsAdded] = await Promise.all([
      upsertPrices(ticker, prices, dryRun),
      upsertDividends(ticker, dividends, dryRun)
    ]);
    
    console.log(`  ✓ Prices: ${pricesAdded} records | Dividends: ${dividendsAdded} records (with adj_amount for splits)`);

    // ALWAYS recalculate normalized dividend columns (days_since_prev, pmt_type, frequency_num, annualized, normalized_div)
    // This ensures all dividends (new and existing) use the latest calculation logic
    if (!dryRun) {
      console.log(`  Recalculating normalized dividend columns with latest logic...`);
      try {
        // Fetch ALL dividends for this ticker (not just new ones)
        const { data: allDividends, error: divError } = await supabase
          .from('dividends_detail')
          .select('id, ticker, ex_date, adj_amount, div_cash')
          .eq('ticker', ticker.toUpperCase())
          .order('ex_date', { ascending: true });

        if (!divError && allDividends && allDividends.length > 0) {
          // Calculate normalized values using the latest backward confirmation logic
          const normalized = calculateNormalizedDividends(
            allDividends.map(d => ({
              id: d.id,
              ticker: d.ticker,
              ex_date: d.ex_date,
              div_cash: Number(d.div_cash),
              adj_amount: d.adj_amount ? Number(d.adj_amount) : null,
            }))
          );

          // Batch update database with normalized values
          for (const norm of normalized) {
            const { error: updateError } = await supabase
              .from('dividends_detail')
              .update({
                days_since_prev: norm.days_since_prev,
                pmt_type: norm.pmt_type,
                frequency_num: norm.frequency_num,
                annualized: norm.annualized,
                normalized_div: norm.normalized_div,
              })
              .eq('id', norm.id);

            if (updateError) {
              console.error(`  ⚠ Error updating dividend ID ${norm.id}:`, updateError);
            }
          }
          console.log(`  ✓ Normalized dividend columns updated for ${normalized.length} dividends`);
        } else if (divError) {
          console.error(`  ⚠ Error fetching dividends for normalization:`, divError);
        }
      } catch (error) {
        console.error(`  ⚠ Error recalculating normalized dividends:`, error);
        // Don't fail the whole refresh if normalization fails
      }
    } else {
      console.log(`  Would recalculate normalized dividend columns for all dividends`);
    }

    // Recalculate metrics
    console.log(`  Recalculating metrics...`);
    if (!dryRun) {
      const metrics = await calculateMetrics(ticker);

      const updateData: any = {
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
        // Note: 5Y, 10Y, 15Y columns don't exist in database - these are calculated in real-time
        // Only save 3Y and shorter periods to database
        // Returns over 1 year (3Y, 5Y, 10Y, 15Y) are automatically annualized by calculateTotalReturnDrip
        tr_drip_3y: metrics.totalReturnDrip?.['3Y'], // Annualized 3-year return
        tr_drip_12m: metrics.totalReturnDrip?.['1Y'],
        tr_drip_6m: metrics.totalReturnDrip?.['6M'],
        tr_drip_3m: metrics.totalReturnDrip?.['3M'],
        tr_drip_1m: metrics.totalReturnDrip?.['1M'],
        tr_drip_1w: metrics.totalReturnDrip?.['1W'],
        price_return_3y: metrics.priceReturn?.['3Y'],
        price_return_12m: metrics.priceReturn?.['1Y'],
        price_return_6m: metrics.priceReturn?.['6M'],
        price_return_3m: metrics.priceReturn?.['3M'],
        price_return_1m: metrics.priceReturn?.['1M'],
        price_return_1w: metrics.priceReturn?.['1W'],
      };

      // This script only processes ETFs (CEFs excluded at query level)
      await batchUpdateETFMetrics([{
        ticker,
        metrics: updateData,
      }]);

      console.log(`  ✓ Metrics recalculated`);
      console.log(`    - Annual Dividend: ${metrics.annualizedDividend?.toFixed(2) || 'N/A'}`);
      console.log(`    - DVI: ${metrics.dividendCVPercent?.toFixed(1) || 'N/A'}%`);
      console.log(`    - Current Price: $${metrics.currentPrice?.toFixed(2) || 'N/A'}`);
    } else {
      console.log(`  Would recalculate metrics`);
    }

    console.log(`  ✓ ${ticker} refresh complete`);
  } catch (error) {
    console.error(`  ✗ Error refreshing ${ticker}:`, error);
    throw error;
  }
}

async function main() {
  const options = parseArgs();

  // CRITICAL: Verify LOOKBACK_DAYS is correct BEFORE doing anything
  // This must be 5475 (15 years) for CEF metrics to work correctly
  if (typeof LOOKBACK_DAYS === 'undefined') {
    console.error('❌ CRITICAL ERROR: LOOKBACK_DAYS is undefined!');
    process.exit(1);
  }

  if (LOOKBACK_DAYS !== 5475) {
    console.error('❌ CRITICAL ERROR: LOOKBACK_DAYS is NOT 5475!');
    console.error(`❌ Current value: ${LOOKBACK_DAYS}`);
    console.error(`❌ Expected: 5475 (15 years)`);
    console.error(`❌ This script will NOT fetch 15 years of data. Fix immediately!`);
    process.exit(1);
  }

  // VERIFY LOOKBACK_DAYS BEFORE STARTING
  console.log('='.repeat(60));
  console.log('COMPLETE DATA REFRESH');
  console.log('='.repeat(60));
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (options.ticker) {
    console.log(`Ticker: ${options.ticker}`);
  } else {
    console.log('Scope: All ETFs');
  }
  const calculatedYears = Math.round(LOOKBACK_DAYS / 365);
  console.log(`Lookback: ${LOOKBACK_DAYS} days (${calculatedYears} years)`);

  // Double-check the calculation
  if (LOOKBACK_DAYS !== 5475 || calculatedYears !== 15) {
    console.error(`❌ ERROR: LOOKBACK_DAYS verification failed!`);
    console.error(`❌ LOOKBACK_DAYS = ${LOOKBACK_DAYS}, calculated years = ${calculatedYears}`);
    console.error(`❌ Expected: 5475 days = 15 years`);
    console.error(`❌ This script will NOT fetch 15 years of data. Fix the constant!`);
    process.exit(1);
  }
  console.log(`✅ Verified: Fetching ${LOOKBACK_DAYS} days = ${calculatedYears} years of data`);
  console.log(`✅ This will fetch prices, dividends, and calculate all metrics for ALL tickers`);
  console.log(`✅ For CEFs: Will fetch NAV data (15 years) and calculate:`);
  console.log(`   - 3Y Z-Score (3Y max, 1Y min lookback)`);
  console.log(`   - 6M NAV Trend (126 trading days)`);
  console.log(`   - 12M NAV Trend (252 trading days)`);
  console.log(`   - Signal rating (-2 to +3, requires 2 years of history)`);
  console.log(`   - Total Returns: 3Y, 5Y, 10Y, 15Y (NAV-based, requires full period history)`);
  console.log(`✅ For ETFs: Will calculate standard metrics and Total Returns (price-based)`);
  console.log('='.repeat(60));

  // Health check
  console.log('\n[Health Check]');
  try {
    const health = await healthCheck();
    console.log(`  ✓ Tiingo API: ${health ? 'OK' : 'FAILED'}`);
  } catch (error) {
    console.error(`  ✗ Tiingo API check failed:`, error);
    process.exit(1);
  }

  // Get tickers to refresh
  // IMPORTANT: Only process Covered Call ETFs - EXCLUDE CEFs (those with nav_symbol or nav)
  let tickers: string[];
  if (options.ticker) {
    tickers = [options.ticker];
  } else {
    // Fetch only ETFs (exclude CEFs with nav_symbol at query level)
    // CEFs have a nav_symbol set - we want records where nav_symbol is NULL or empty
    const { data, error } = await supabase
      .from('etf_static')
      .select('ticker, nav_symbol')
      .or('nav_symbol.is.null,nav_symbol.eq.""')
      .order('ticker');

    if (error || !data) {
      console.error('Failed to fetch tickers:', error);
      process.exit(1);
    }

    tickers = data.map(t => t.ticker);

    console.log(`\n📊 Filtered tickers:`);
    console.log(`   - Covered Call ETFs to process: ${tickers.length}`);
    console.log(`   - CEFs excluded (have nav_symbol - will be processed by refresh:cef script)`);
  }

  console.log(`\nFound ${tickers.length} ticker(s) to refresh\n`);

  // Refresh each ticker
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
  };

  // Process tickers in parallel batches for maximum speed
  const BATCH_SIZE = 10; // Process 10 tickers simultaneously
  const startTime = Date.now();
  
  console.log(`\n🚀 Processing ${tickers.length} ticker(s) in parallel batches of ${BATCH_SIZE}...\n`);

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tickers.length / BATCH_SIZE);
    
    console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} tickers)`);
    
    // Process batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map((ticker) => refreshTicker(ticker, options.dryRun))
    );
    
    // Count results
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.success++;
      } else {
        results.failed++;
        console.error(`Failed: ${result.reason}`);
      }
    }
    
    // Small delay between batches to avoid overwhelming API
    if (i + BATCH_SIZE < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⚡ Completed in ${elapsed}s (avg: ${(parseFloat(elapsed) / tickers.length).toFixed(1)}s per ticker)`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('REFRESH SUMMARY');
  console.log('='.repeat(60));
  console.log(`Success: ${results.success}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Total: ${tickers.length}`);
  console.log('='.repeat(60));

  // Clear API cache after refresh completes so frontend sees new timestamp
  if (!options.dryRun && results.success > 0) {
    try {
      const { deleteCached, CACHE_KEYS } = await import('../src/services/redis.js');
      await deleteCached(CACHE_KEYS.ETF_LIST);
      console.log('\n[Cache] ✅ Cleared ETF list cache');
    } catch (error) {
      console.warn('\n[Cache] ⚠️  Failed to clear cache:', (error as Error).message);
    }
  }

  // Calculate and update ETF rankings after refresh
  if (!options.dryRun && results.success > 0) {
    try {
      console.log('\n[ETF Rankings] Calculating weighted ranks for CC ETFs...');
      const { calculateETFRankings } = await import('../src/routes/etfs.js');
      const rankings = await calculateETFRankings();
      
      if (rankings.size > 0) {
        console.log(`[ETF Rankings] Calculated ranks for ${rankings.size} CC ETFs`);
        
        // Update ranks in database
        let updated = 0;
        for (const [ticker, rank] of rankings.entries()) {
          const { error } = await supabase
            .from('etf_static')
            .update({ weighted_rank: rank })
            .eq('ticker', ticker);
          
          if (!error) {
            updated++;
          }
        }
        console.log(`[ETF Rankings] ✅ Updated ${updated}/${rankings.size} ETF rankings in database`);
      }
    } catch (error) {
      console.error('[ETF Rankings] ❌ Failed to calculate ETF rankings:', (error as Error).message);
      // Don't exit with error - ETFs were updated successfully
    }
  }

  // After updating ETFs, automatically run CEF refresh
  if (!options.dryRun && !options.ticker) {
    console.log('\n' + '='.repeat(60));
    console.log('CEF REFRESH');
    console.log('='.repeat(60));
    console.log('Now refreshing all CEFs (Closed End Funds)...\n');
    
    try {
      // Run the CEF refresh script using npm script
      const { execSync } = await import('child_process');
      console.log('Running npm run refresh:cef...');
      execSync('npm run refresh:cef', {
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..'),
        env: process.env,
      });
      console.log('\n✅ CEF refresh completed successfully');
    } catch (error) {
      console.error('\n❌ CEF refresh failed:', (error as Error).message);
      console.warn('⚠️  ETFs were updated successfully, but CEFs need to be refreshed separately');
      // Don't exit with error - ETFs were updated successfully
    }
  }

  if (results.failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);




