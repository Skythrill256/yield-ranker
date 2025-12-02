/**
 * backfill_dividend_dates.ts - Backfill Record/Pay Dates for Dividends
 * 
 * This script fetches record_date and pay_date from Tiingo API
 * for existing dividend records that are missing these fields.
 * 
 * Usage: npx tsx scripts/backfill_dividend_dates.ts [--ticker SYMBOL] [--dry-run]
 * 
 * Options:
 *   --ticker SYMBOL   Update only a specific ticker
 *   --dry-run         Show what would be done without making changes
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { fetchDividendHistory } from '../src/services/tiingo.js';
import type { TiingoDividendData } from '../src/types/index.js';

// ============================================================================
// Configuration
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
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
Usage: npx tsx scripts/backfill_dividend_dates.ts [options]

Options:
  --ticker SYMBOL   Update only a specific ticker
  --dry-run         Show what would be done without making changes
  --help            Show this help message
        `);
        process.exit(0);
    }
  }
  
  return options;
}

// ============================================================================
// Logging
// ============================================================================

function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

// ============================================================================
// Helper Functions
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Get all tickers that have dividends with missing record/pay dates
 */
async function getTickersWithMissingDates(specificTicker?: string): Promise<string[]> {
  let query = supabase
    .from('dividends_detail')
    .select('ticker')
    .or('record_date.is.null,pay_date.is.null');
  
  if (specificTicker) {
    query = query.eq('ticker', specificTicker);
  }
  
  const { data, error } = await query;
  
  if (error) {
    log('ERROR', `Failed to fetch tickers: ${error.message}`);
    return [];
  }
  
  // Get unique tickers
  const tickers = [...new Set((data || []).map(d => d.ticker))];
  return tickers;
}

/**
 * Get dividends with missing dates for a ticker
 */
async function getDividendsWithMissingDates(ticker: string): Promise<Array<{
  id: number;
  ex_date: string;
  record_date: string | null;
  pay_date: string | null;
}>> {
  const { data, error } = await supabase
    .from('dividends_detail')
    .select('id, ex_date, record_date, pay_date')
    .eq('ticker', ticker)
    .or('record_date.is.null,pay_date.is.null')
    .order('ex_date', { ascending: false });
  
  if (error) {
    log('ERROR', `Failed to fetch dividends for ${ticker}: ${error.message}`);
    return [];
  }
  
  return data || [];
}

/**
 * Update dividend records with dates from Tiingo
 */
async function updateDividendDates(
  ticker: string,
  tiingoDividends: TiingoDividendData[],
  dryRun: boolean
): Promise<number> {
  const dbDividends = await getDividendsWithMissingDates(ticker);
  
  if (dbDividends.length === 0) {
    log('DEBUG', `No dividends with missing dates for ${ticker}`);
    return 0;
  }
  
  // Create a map of Tiingo dividends by ex_date
  const tiingoMap = new Map<string, TiingoDividendData>();
  tiingoDividends.forEach(d => {
    const exDate = d.exDate.split('T')[0];
    tiingoMap.set(exDate, d);
  });
  
  let updated = 0;
  
  for (const dbDiv of dbDividends) {
    const exDate = dbDiv.ex_date.split('T')[0];
    const tiingoDiv = tiingoMap.get(exDate);
    
    if (!tiingoDiv) {
      log('DEBUG', `No Tiingo data for ${ticker} ex_date ${exDate}`);
      continue;
    }
    
    const updates: Record<string, string | null> = {};
    
    if (!dbDiv.record_date && tiingoDiv.recordDate) {
      updates.record_date = tiingoDiv.recordDate;
    }
    
    if (!dbDiv.pay_date && tiingoDiv.paymentDate) {
      updates.pay_date = tiingoDiv.paymentDate;
    }
    
    if (Object.keys(updates).length === 0) {
      continue;
    }
    
    if (dryRun) {
      log('INFO', `[DRY-RUN] Would update ${ticker} ex_date ${exDate}: ${JSON.stringify(updates)}`);
      updated++;
      continue;
    }
    
    const { error } = await supabase
      .from('dividends_detail')
      .update(updates)
      .eq('id', dbDiv.id);
    
    if (error) {
      log('ERROR', `Failed to update ${ticker} ex_date ${exDate}: ${error.message}`);
    } else {
      log('DEBUG', `Updated ${ticker} ex_date ${exDate}: ${JSON.stringify(updates)}`);
      updated++;
    }
  }
  
  return updated;
}

/**
 * Process a single ticker
 */
async function processTicker(ticker: string, dryRun: boolean): Promise<{
  ticker: string;
  updated: number;
  error?: string;
}> {
  try {
    log('INFO', `Processing ${ticker}...`);
    
    // Fetch dividend history from Tiingo (last 5 years)
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 5);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    const tiingoDividends = await fetchDividendHistory(ticker, startDateStr);
    
    if (tiingoDividends.length === 0) {
      log('WARN', `No Tiingo dividend data for ${ticker}`);
      return { ticker, updated: 0 };
    }
    
    log('DEBUG', `Fetched ${tiingoDividends.length} dividends from Tiingo for ${ticker}`);
    
    const updated = await updateDividendDates(ticker, tiingoDividends, dryRun);
    
    log('INFO', `${ticker}: Updated ${updated} dividend records`);
    
    return { ticker, updated };
  } catch (error) {
    const message = (error as Error).message;
    log('ERROR', `Failed to process ${ticker}: ${message}`);
    return { ticker, updated: 0, error: message };
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const options = parseArgs();
  
  log('INFO', '='.repeat(60));
  log('INFO', 'Dividend Dates Backfill Script');
  log('INFO', `Mode: ${options.dryRun ? 'DRY-RUN' : 'LIVE'}`);
  if (options.ticker) {
    log('INFO', `Ticker: ${options.ticker}`);
  }
  log('INFO', '='.repeat(60));
  
  // Validate environment
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    log('ERROR', 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  
  // Get tickers to process
  const tickers = await getTickersWithMissingDates(options.ticker);
  
  if (tickers.length === 0) {
    log('INFO', 'No tickers with missing dividend dates found');
    process.exit(0);
  }
  
  log('INFO', `Found ${tickers.length} tickers with missing dates: ${tickers.join(', ')}`);
  
  // Process each ticker
  const results: Array<{ ticker: string; updated: number; error?: string }> = [];
  
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    log('INFO', `[${i + 1}/${tickers.length}] Processing ${ticker}...`);
    
    const result = await processTicker(ticker, options.dryRun);
    results.push(result);
    
    // Rate limiting: wait 500ms between tickers
    if (i < tickers.length - 1) {
      await sleep(500);
    }
  }
  
  // Summary
  log('INFO', '='.repeat(60));
  log('INFO', 'SUMMARY');
  log('INFO', '='.repeat(60));
  
  const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
  const errors = results.filter(r => r.error);
  
  log('INFO', `Total tickers processed: ${results.length}`);
  log('INFO', `Total dividend records updated: ${totalUpdated}`);
  log('INFO', `Errors: ${errors.length}`);
  
  if (errors.length > 0) {
    log('WARN', 'Tickers with errors:');
    errors.forEach(e => log('WARN', `  ${e.ticker}: ${e.error}`));
  }
  
  log('INFO', 'Backfill complete!');
}

main().catch(error => {
  log('ERROR', `Fatal error: ${error.message}`);
  process.exit(1);
});
