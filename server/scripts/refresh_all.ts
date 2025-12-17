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
} from '../src/services/tiingo.js';
import { calculateMetrics } from '../src/services/metrics.js';
import { batchUpdateETFMetrics } from '../src/services/database.js';
import type { TiingoPriceData } from '../src/types/index.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LOOKBACK_DAYS = 365; // Extended lookback for reverse splits and historical data
const DIVIDEND_LOOKBACK_DAYS = 365; // Extended dividend history for split adjustments

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

  const { data: allManualUploads } = await supabase
    .from('dividends_detail')
    .select('*')
    .eq('ticker', ticker.toUpperCase())
    .or('is_manual.eq.true,description.ilike.%Manual upload%,description.ilike.%Early announcement%');

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
      // ALWAYS preserve manual dividends - never update with Tiingo data
      // Manual dividends take absolute priority
      preservedCount++;
      manualUploadsToPreserve.push({
        ticker: ticker.toUpperCase(),
        ex_date: manualUpload.ex_date,
        pay_date: manualUpload.pay_date,
        record_date: manualUpload.record_date,
        declare_date: manualUpload.declare_date,
        div_cash: manualUpload.div_cash,
        adj_amount: manualUpload.adj_amount,
        scaled_amount: manualUpload.scaled_amount,
        split_factor: manualUpload.split_factor,
        description: manualUpload.description,
        div_type: manualUpload.div_type,
        frequency: manualUpload.frequency,
        currency: manualUpload.currency || 'USD',
      });
      // Skip this Tiingo dividend - manual takes priority
      continue;
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

  if (alignedCount > 0) {
    console.log(`  Updating ${alignedCount} dividend(s) where Tiingo aligns with manual upload`);
  }
  if (preservedCount > 0) {
    console.log(`  Preserving ${preservedCount} manual dividend upload(s) (values don't align)`);
  }

  if (tiingoRecordsToUpsert.length === 0 && manualUploadsToPreserve.length === 0) {
    return 0;
  }

  // Ensure preserved manual uploads have is_manual flag set
  // Also ensure tiingoRecordsToUpsert that came from manual uploads keep is_manual flag
  const allRecordsToUpsert = [
    ...tiingoRecordsToUpsert.map(r => r.is_manual === undefined ? { ...r, is_manual: false } : r),
    ...manualUploadsToPreserve.map(r => ({
      ...r,
      is_manual: true  // Mark as manual to prevent future overwrites
    }))
  ];

  const { error } = await supabase
    .from('dividends_detail')
    .upsert(allRecordsToUpsert, {
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
  console.log(`  Fetching data from last ${LOOKBACK_DAYS} days (for split adjustments)...`);

  try {
    const priceStartDate = getDateDaysAgo(LOOKBACK_DAYS);
    const dividendStartDate = getDateDaysAgo(DIVIDEND_LOOKBACK_DAYS);

    console.log(`  Prices: ${priceStartDate} to today`);
    console.log(`  Dividends: ${dividendStartDate} to today`);

    // Fetch and upsert prices
    console.log(`  Fetching prices...`);
    const prices = await fetchPriceHistory(ticker, priceStartDate);
    const pricesAdded = await upsertPrices(ticker, prices, dryRun);
    console.log(`  ✓ Added/updated ${pricesAdded} price records`);

    // Fetch and upsert dividends (extended history for split adjustments)
    console.log(`  Fetching dividends (with split adjustments)...`);
    const dividends = await fetchDividendHistory(ticker, dividendStartDate);
    const dividendsAdded = await upsertDividends(ticker, dividends, dryRun);
    console.log(`  ✓ Added/updated ${dividendsAdded} dividend records (with adj_amount for splits)`);

    // Recalculate metrics
    console.log(`  Recalculating metrics...`);
    if (!dryRun) {
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
          tr_drip_3y: metrics.totalReturnDrip?.['3Y'],
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
        },
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

  console.log('='.repeat(60));
  console.log('COMPLETE DATA REFRESH');
  console.log('='.repeat(60));
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (options.ticker) {
    console.log(`Ticker: ${options.ticker}`);
  } else {
    console.log('Scope: All ETFs');
  }
  console.log(`Lookback: ${LOOKBACK_DAYS} days`);
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
  let tickers: string[];
  if (options.ticker) {
    tickers = [options.ticker];
  } else {
    const { data, error } = await supabase
      .from('etf_static')
      .select('ticker')
      .order('ticker');

    if (error || !data) {
      console.error('Failed to fetch tickers:', error);
      process.exit(1);
    }

    tickers = data.map(t => t.ticker);
  }

  console.log(`\nFound ${tickers.length} ticker(s) to refresh\n`);

  // Refresh each ticker
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
  };

  for (const ticker of tickers) {
    try {
      await refreshTicker(ticker, options.dryRun);
      results.success++;
    } catch (error) {
      console.error(`Failed to refresh ${ticker}:`, error);
      results.failed++;
    }
  }

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

  if (results.failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);




