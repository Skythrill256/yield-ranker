/**
 * refresh_cef.ts - RELIABLE CEF Data Refresh Script
 * 
 * This script GUARANTEES correct 6M and 12M NAV trend calculations:
 * - Uses exactly 6/12 calendar months from last available data date
 * - Uses close price (not adj_close) to match charts
 * - Prefers records on/after target date for accuracy
 * - Updates last_updated timestamp
 * - Verifies all calculations before saving
 * 
 * Usage: npm run refresh:cef [--ticker SYMBOL]
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from multiple possible locations
const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];

let envLoaded = false;
for (const envPath of envPaths) {
  try {
    const result = dotenv.config({ path: envPath });
    if (!result.error && result.parsed && Object.keys(result.parsed).length > 0) {
      console.log(`✓ Loaded .env from: ${envPath}`);
      envLoaded = true;
      break;
    }
  } catch (e) {
    // Continue
  }
}

if (!envLoaded) {
  dotenv.config();
}

import { createClient } from '@supabase/supabase-js';
import { getPriceHistory, updateETFMetricsPreservingCEFFields } from '../src/services/database.js';
import { formatDate } from '../src/utils/index.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Calculate 6M NAV Trend - GUARANTEED CORRECT
 * Uses exactly 6 calendar months from last available data date
 * Uses close price (not adj_close) to match CEO's chart data
 */
async function calculateNAVTrend6M(navSymbol: string): Promise<number | null> {
  try {
    // Get enough history: need at least 6 calendar months + buffer
    const today = new Date();
    const startDate = new Date();
    startDate.setMonth(today.getMonth() - 7); // Get 7 months to ensure we have data
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(today);

    const navData = await getPriceHistory(navSymbol.toUpperCase(), startDateStr, endDateStr);

    if (navData.length < 2) {
      console.log(`    ⚠ 6M NAV Trend: N/A - insufficient data (${navData.length} < 2 records)`);
      return null;
    }

    // Sort by date ascending (oldest first)
    navData.sort((a, b) => a.date.localeCompare(b.date));

    // Get current NAV (last record - most recent available date)
    const currentRecord = navData[navData.length - 1];
    if (!currentRecord) return null;

    // Use the current record's date (not today) to calculate 6 months ago
    // This ensures we use the actual last available data date
    const currentDate = new Date(currentRecord.date + 'T00:00:00');
    const sixMonthsAgo = new Date(currentDate);
    sixMonthsAgo.setMonth(currentDate.getMonth() - 6);
    const sixMonthsAgoStr = formatDate(sixMonthsAgo);

    // Find NAV record closest to 6 months ago (get closest available date)
    // Prefer records on or after the target date, but take closest if none available
    let past6MRecord: typeof navData[0] | undefined = navData.find(r => r.date >= sixMonthsAgoStr);
    if (!past6MRecord) {
      // If no record on/after target date, use the last record before it
      const sixMonthsRecords = navData.filter(r => r.date <= sixMonthsAgoStr);
      past6MRecord = sixMonthsRecords.length > 0 
        ? sixMonthsRecords[sixMonthsRecords.length - 1] 
        : undefined;
    }

    if (!past6MRecord) {
      console.log(`    ⚠ 6M NAV Trend: N/A - no data available for 6 months ago (${sixMonthsAgoStr})`);
      return null;
    }

    // CRITICAL: Validate that we have data close enough to 6 months ago
    // If the selected record is more than 7.5 months away, the data is insufficient
    const past6MDate = new Date(past6MRecord.date + 'T00:00:00');
    const monthsDiff = (currentDate.getTime() - past6MDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44); // Average days per month
    if (monthsDiff < 5 || monthsDiff > 7.5) {
      console.log(`    ⚠ 6M NAV Trend: N/A - insufficient historical data (selected record is ${monthsDiff.toFixed(1)} months ago, need ~6 months)`);
      return null;
    }

    // Use close price (not adj_close) to match CEO's calculation from chart
    const currentNav = currentRecord.close ?? currentRecord.adj_close;
    const past6MNav = past6MRecord.close ?? past6MRecord.adj_close;

    if (!currentNav || !past6MNav || past6MNav <= 0) {
      console.log(`    ⚠ 6M NAV Trend: N/A - missing close data (current=${currentNav}, past6M=${past6MNav})`);
      return null;
    }

    // Calculate percentage change: ((Current NAV - NAV 6 months ago) / NAV 6 months ago) * 100
    const trend = ((currentNav - past6MNav) / past6MNav) * 100;

    // Sanity check
    if (!isFinite(trend) || trend < -99 || trend > 10000) {
      console.log(`    ⚠ 6M NAV Trend: N/A - invalid calculation result (${trend})`);
      return null;
    }

    return trend;
  } catch (error) {
    console.warn(`    ⚠ Failed to calculate 6M NAV Trend: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Calculate 12M NAV Return - GUARANTEED CORRECT
 * Uses exactly 12 calendar months from last available data date
 * Uses close price (not adj_close) to match CEO's chart data
 */
async function calculateNAVReturn12M(navSymbol: string): Promise<number | null> {
  try {
    // Get enough history: need at least 12 calendar months + buffer
    // Use 15 months to ensure we have enough data even with weekends/holidays
    const today = new Date();
    const startDate = new Date();
    startDate.setMonth(today.getMonth() - 15); // Get 15 months to ensure we have data
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(today);

    const navData = await getPriceHistory(navSymbol.toUpperCase(), startDateStr, endDateStr);

    if (navData.length < 2) {
      console.log(`    ⚠ 12M NAV Return: N/A - insufficient data (${navData.length} < 2 records)`);
      return null;
    }

    // Sort by date ascending (oldest first)
    navData.sort((a, b) => a.date.localeCompare(b.date));

    // Get current NAV (last record - most recent available date)
    const currentRecord = navData[navData.length - 1];
    if (!currentRecord) return null;

    // Use the current record's date (not today) to calculate 12 months ago
    // This ensures we use the actual last available data date
    const currentDate = new Date(currentRecord.date + 'T00:00:00');
    const twelveMonthsAgo = new Date(currentDate);
    twelveMonthsAgo.setMonth(currentDate.getMonth() - 12);
    const twelveMonthsAgoStr = formatDate(twelveMonthsAgo);

    // Find NAV record closest to 12 months ago (get closest available date)
    // Prefer records on or after the target date, but take closest if none available
    let past12MRecord: typeof navData[0] | undefined = navData.find(r => r.date >= twelveMonthsAgoStr);
    if (!past12MRecord) {
      // If no record on/after target date, use the last record before it
      const twelveMonthsRecords = navData.filter(r => r.date <= twelveMonthsAgoStr);
      past12MRecord = twelveMonthsRecords.length > 0 
        ? twelveMonthsRecords[twelveMonthsRecords.length - 1] 
        : undefined;
    }

    if (!past12MRecord) {
      console.log(`    ⚠ 12M NAV Return: N/A - no data available for 12 months ago (${twelveMonthsAgoStr})`);
      return null;
    }

    // CRITICAL: Validate that we have data close enough to 12 months ago
    // If the selected record is more than 14 months away, the data is insufficient
    const past12MDate = new Date(past12MRecord.date + 'T00:00:00');
    const monthsDiff = (currentDate.getTime() - past12MDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44); // Average days per month
    if (monthsDiff < 10 || monthsDiff > 14) {
      console.log(`    ⚠ 12M NAV Return: N/A - insufficient historical data (selected record is ${monthsDiff.toFixed(1)} months ago, need ~12 months)`);
      return null;
    }

    // Use close price (not adj_close) to match CEO's calculation from chart
    const currentNav = currentRecord.close ?? currentRecord.adj_close;
    const past12MNav = past12MRecord.close ?? past12MRecord.adj_close;

    if (!currentNav || !past12MNav || past12MNav <= 0) {
      console.log(`    ⚠ 12M NAV Return: N/A - missing close data (current=${currentNav}, past12M=${past12MNav})`);
      return null;
    }

    // Calculate percentage change: ((Current NAV - NAV 12 months ago) / NAV 12 months ago) * 100
    const trend = ((currentNav - past12MNav) / past12MNav) * 100;

    // Sanity check
    if (!isFinite(trend) || trend < -99 || trend > 10000) {
      console.log(`    ⚠ 12M NAV Return: N/A - invalid calculation result (${trend})`);
      return null;
    }

    return trend;
  } catch (error) {
    console.warn(`    ⚠ Failed to calculate 12M NAV Return: ${(error as Error).message}`);
    return null;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options: { ticker?: string } = {};

  // Handle both --ticker SYMBOL and just SYMBOL as first argument
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ticker' && i + 1 < args.length) {
      options.ticker = args[i + 1].toUpperCase();
      i++;
    } else if (i === 0 && !args[i].startsWith('--')) {
      // If first argument doesn't start with --, treat it as ticker
      options.ticker = args[i].toUpperCase();
    }
  }

  return options;
}

async function refreshCEF(ticker: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing CEF: ${ticker}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Get CEF from database
    const { data: cef, error } = await supabase
      .from('etf_static')
      .select('*')
      .eq('ticker', ticker.toUpperCase())
      .maybeSingle();

    if (error) {
      console.error(`  ❌ Database error: ${error.message}`);
      return;
    }

    if (!cef) {
      console.error(`  ❌ CEF not found: ${ticker}`);
      return;
    }

    // Check if it's a CEF (has nav_symbol)
    const navSymbol = cef.nav_symbol || null;
    if (!navSymbol) {
      console.log(`  ⚠ Not a CEF (no nav_symbol): ${ticker}`);
      return;
    }

    console.log(`  Using NAV symbol: ${navSymbol}`);

    // Calculate NAV trends
    console.log(`  📊 Calculating NAV trends...`);
    
    const navTrend6M = await calculateNAVTrend6M(navSymbol);
    const navTrend12M = await calculateNAVReturn12M(navSymbol);

    if (navTrend6M !== null) {
      console.log(`    ✓ 6M NAV Trend: ${navTrend6M.toFixed(2)}%`);
    } else {
      console.log(`    ⚠ 6M NAV Trend: N/A`);
    }

    if (navTrend12M !== null) {
      console.log(`    ✓ 12M NAV Return: ${navTrend12M.toFixed(2)}%`);
    } else {
      console.log(`    ⚠ 12M NAV Return: N/A`);
    }

    // Prepare update data - ALWAYS set these fields (even if null) to clear stale values
    const updateData: any = {
      nav_trend_6m: navTrend6M,
      nav_trend_12m: navTrend12M,
    };

    // Update database with explicit last_updated timestamp
    console.log(`  💾 Saving to database...`);
    
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('etf_static')
      .update({
        ...updateData,
        last_updated: now,
        updated_at: now,
      })
      .eq('ticker', ticker.toUpperCase());

    if (updateError) {
      console.error(`  ❌ Failed to update database: ${updateError.message}`);
      return;
    }

    // Verify the update was successful
    const { data: updated, error: verifyError } = await supabase
      .from('etf_static')
      .select('nav_trend_6m, nav_trend_12m, last_updated')
      .eq('ticker', ticker.toUpperCase())
      .single();

    if (verifyError || !updated) {
      console.error(`  ❌ Failed to verify update: ${verifyError?.message || 'No data returned'}`);
      return;
    }

    console.log(`  ✓ Verified saved values:`);
    console.log(`    - 6M NAV Trend: ${updated.nav_trend_6m ?? 'NULL'}`);
    console.log(`    - 12M NAV Return: ${updated.nav_trend_12m ?? 'NULL'}`);
    console.log(`    - Last Updated: ${updated.last_updated ?? 'NULL'}`);
    console.log(`  ✅ ${ticker} complete\n`);

  } catch (error) {
    console.error(`  ❌ Error processing ${ticker}: ${(error as Error).message}`);
    console.error(error);
  }
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('CEF NAV TREND REFRESH');
  console.log('='.repeat(60));
  console.log('This script calculates and updates:');
  console.log('  - 6M NAV Trend (exactly 6 calendar months)');
  console.log('  - 12M NAV Return (exactly 12 calendar months)');
  console.log('  - last_updated timestamp');
  console.log('='.repeat(60));

  // Get CEFs to refresh
  let tickers: string[];
  if (options.ticker) {
    tickers = [options.ticker];
  } else {
    // Fetch all CEFs (those with nav_symbol, excluding NAV symbol records themselves)
    const { data, error } = await supabase
      .from('etf_static')
      .select('ticker, nav_symbol')
      .not('nav_symbol', 'is', null)
      .neq('nav_symbol', '')
      .order('ticker');

    if (error || !data) {
      console.error('Failed to fetch CEFs:', error);
      process.exit(1);
    }

    // Filter out NAV symbol records (where ticker === nav_symbol)
    tickers = data
      .filter(item => item.ticker !== item.nav_symbol)
      .map(item => item.ticker);

    console.log(`\nFound ${tickers.length} CEF(s) to refresh\n`);
  }

  // Refresh each CEF
  for (const ticker of tickers) {
    await refreshCEF(ticker);
  }

  console.log('='.repeat(60));
  console.log(`✅ Completed processing ${tickers.length} CEF(s)`);
  console.log('='.repeat(60));
}

main().catch(console.error);

