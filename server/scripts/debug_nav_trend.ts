/**
 * Debug script to show exact NAV trend calculations for a CEF
 * Shows which dates and NAV values are being used
 * 
 * Usage: npx tsx server/scripts/debug_nav_trend.ts UTG
 */

// CRITICAL: Load environment variables FIRST
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
  path.resolve(__dirname, '../../../yield-ranker/server/.env'),
  path.resolve(__dirname, '../../yield-ranker/server/.env'),
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
import { getPriceHistory } from '../src/services/database.js';
import { formatDate } from '../src/utils/index.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function debugNAVTrends(ticker: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`DEBUG: NAV Trend Calculations for ${ticker}`);
  console.log(`${'='.repeat(80)}\n`);

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

    // Check if it's a CEF (has nav_symbol or nav)
    const navSymbol = cef.nav_symbol || null;
    if (!navSymbol && !cef.nav) {
      console.log(`  ⚠ Not a CEF (no nav_symbol or nav): ${ticker}`);
      return;
    }

    const navSymbolForCalc = navSymbol || ticker;
    console.log(`  Using NAV symbol: ${navSymbolForCalc}`);
    console.log(`  Current NAV in DB: ${cef.nav ?? 'NULL'}`);
    console.log(`  Current nav_trend_6m in DB: ${cef.nav_trend_6m ?? 'NULL'}`);
    console.log(`  Current nav_trend_12m in DB: ${cef.nav_trend_12m ?? 'NULL'}\n`);

    // Get enough history: need at least 252 trading days + buffer
    const endDate = new Date();
    const startDate6M = new Date();
    startDate6M.setFullYear(endDate.getFullYear() - 1); // Get 1 year of data for 6M

    const startDate12M = new Date();
    startDate12M.setFullYear(endDate.getFullYear() - 2); // Get 2 years of data for 12M

    const startDateStr6M = formatDate(startDate6M);
    const endDateStr = formatDate(endDate);
    const startDateStr12M = formatDate(startDate12M);

    console.log(`  Fetching price data from ${startDateStr12M} to ${endDateStr}...\n`);

    const navData = await getPriceHistory(
      navSymbolForCalc.toUpperCase(),
      startDateStr12M,
      endDateStr
    );

    console.log(`  ✓ Retrieved ${navData.length} NAV price records\n`);

    if (navData.length < 127) {
      console.error(`  ❌ Insufficient data for 6M calculation (need 127 records, have ${navData.length})`);
      return;
    }

    if (navData.length < 253) {
      console.error(`  ❌ Insufficient data for 12M calculation (need 253 records, have ${navData.length})`);
      return;
    }

    // Sort by date ascending (oldest first)
    navData.sort((a, b) => a.date.localeCompare(b.date));

    // ============================================================================
    // CEO's EXPECTED CALCULATION (Calendar Months)
    // ============================================================================
    console.log(`\n${'='.repeat(80)}`);
    console.log(`CEO's EXPECTED CALCULATION (Calendar Months)`);
    console.log(`${'='.repeat(80)}`);
    
    const today = new Date();
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(today.getMonth() - 6);
    const twelveMonthsAgo = new Date(today);
    twelveMonthsAgo.setMonth(today.getMonth() - 12);
    
    const sixMonthsAgoStr = formatDate(sixMonthsAgo);
    const twelveMonthsAgoStr = formatDate(twelveMonthsAgo);
    
    console.log(`\n  Today: ${formatDate(today)}`);
    console.log(`  6 calendar months ago: ${sixMonthsAgoStr}`);
    console.log(`  12 calendar months ago: ${twelveMonthsAgoStr}\n`);
    
    // Find NAV records closest to 6 and 12 months ago
    const currentRecord = navData[navData.length - 1];
    const sixMonthsRecord = navData.filter(r => r.date <= sixMonthsAgoStr).pop() || navData.find(r => r.date >= sixMonthsAgoStr);
    const twelveMonthsRecord = navData.filter(r => r.date <= twelveMonthsAgoStr).pop() || navData.find(r => r.date >= twelveMonthsAgoStr);
    
    if (sixMonthsRecord) {
      console.log(`  6 Months Ago Record:`);
      console.log(`    Date: ${sixMonthsRecord.date}`);
      console.log(`    Close: ${sixMonthsRecord.close ?? 'NULL'}`);
      console.log(`    Adj Close: ${sixMonthsRecord.adj_close ?? 'NULL'}`);
    }
    
    if (twelveMonthsRecord) {
      console.log(`\n  12 Months Ago Record:`);
      console.log(`    Date: ${twelveMonthsRecord.date}`);
      console.log(`    Close: ${twelveMonthsRecord.close ?? 'NULL'}`);
      console.log(`    Adj Close: ${twelveMonthsRecord.adj_close ?? 'NULL'}`);
    }
    
    if (sixMonthsRecord && currentRecord) {
      const nav6M = sixMonthsRecord.close ?? sixMonthsRecord.adj_close;
      const navCurrent = currentRecord.close ?? currentRecord.adj_close;
      if (nav6M && navCurrent && nav6M > 0) {
        console.log(`\n  CEO's 6M Calculation (using close, not adj_close):`);
        console.log(`    Formula: (${navCurrent} - ${nav6M}) / ${nav6M} × 100`);
        const diff = navCurrent - nav6M;
        const result = (diff / nav6M) * 100;
        console.log(`    = ${diff.toFixed(2)} / ${nav6M} × 100`);
        console.log(`    = ${(diff/nav6M).toFixed(4)} × 100`);
        console.log(`    = ${result.toFixed(2)}%`);
        console.log(`    CEO Expected: 1.9% (using NAV: 35.79)`);
      }
    }
    
    if (twelveMonthsRecord && currentRecord) {
      const nav12M = twelveMonthsRecord.close ?? twelveMonthsRecord.adj_close;
      const navCurrent = currentRecord.close ?? currentRecord.adj_close;
      if (nav12M && navCurrent && nav12M > 0) {
        console.log(`\n  CEO's 12M Calculation (using close, not adj_close):`);
        console.log(`    Formula: (${navCurrent} - ${nav12M}) / ${nav12M} × 100`);
        const diff = navCurrent - nav12M;
        const result = (diff / nav12M) * 100;
        console.log(`    = ${diff.toFixed(2)} / ${nav12M} × 100`);
        console.log(`    = ${(diff/nav12M).toFixed(4)} × 100`);
        console.log(`    = ${result.toFixed(2)}%`);
        console.log(`    CEO Expected: 14.2% (using NAV: 31.96)`);
      }
    }

    // ============================================================================
    // CURRENT CODE CALCULATION (126/252 Trading Days)
    // ============================================================================
    console.log(`\n${'='.repeat(80)}`);
    console.log(`CURRENT CODE CALCULATION (126 trading days)`);
    console.log(`${'='.repeat(80)}`);

    const currentRecord6M = navData[navData.length - 1];
    const past126Record = navData[navData.length - 1 - 126];

    console.log(`\n  Current NAV Record (Last in array):`);
    console.log(`    Date: ${currentRecord6M.date}`);
    console.log(`    Close: ${currentRecord6M.close ?? 'NULL'}`);
    console.log(`    Adj Close: ${currentRecord6M.adj_close ?? 'NULL'}`);

    console.log(`\n  NAV Record from 126 trading days ago (Position ${navData.length - 1 - 126} in array):`);
    console.log(`    Date: ${past126Record.date}`);
    console.log(`    Close: ${past126Record.close ?? 'NULL'}`);
    console.log(`    Adj Close: ${past126Record.adj_close ?? 'NULL'}`);

    // Calculate actual days between
    const date1 = new Date(currentRecord6M.date);
    const date2 = new Date(past126Record.date);
    const daysDiff = Math.round((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));
    console.log(`\n  Actual calendar days between: ${daysDiff} days`);

    const currentNav6M = currentRecord6M.adj_close;
    const past126Nav = past126Record.adj_close;

    if (!currentNav6M || !past126Nav || past126Nav <= 0) {
      console.error(`  ❌ Missing adj_close data (current=${currentNav6M}, past126=${past126Nav})`);
    } else {
      console.log(`\n  Calculation:`);
      console.log(`    Formula: ((Current NAV - NAV 126 days ago) / NAV 126 days ago) × 100`);
      console.log(`    = ((${currentNav6M} - ${past126Nav}) / ${past126Nav}) × 100`);
      const diff6M = currentNav6M - past126Nav;
      const ratio6M = diff6M / past126Nav;
      const trend6M = ratio6M * 100;
      console.log(`    = (${diff6M.toFixed(6)} / ${past126Nav}) × 100`);
      console.log(`    = ${ratio6M.toFixed(6)} × 100`);
      console.log(`    = ${trend6M.toFixed(4)}%`);
      console.log(`\n  ✅ 6-Month NAV Trend: ${trend6M.toFixed(2)}%`);
    }

    // ============================================================================
    // 12-MONTH NAV TREND CALCULATION
    // ============================================================================
    console.log(`\n${'='.repeat(80)}`);
    console.log(`12-MONTH NAV TREND CALCULATION (252 trading days)`);
    console.log(`${'='.repeat(80)}`);

    const currentRecord12M = navData[navData.length - 1];
    const past252Record = navData[navData.length - 1 - 252];

    console.log(`\n  Current NAV Record (Last in array):`);
    console.log(`    Date: ${currentRecord12M.date}`);
    console.log(`    Close: ${currentRecord12M.close ?? 'NULL'}`);
    console.log(`    Adj Close: ${currentRecord12M.adj_close ?? 'NULL'}`);

    console.log(`\n  NAV Record from 252 trading days ago (Position ${navData.length - 1 - 252} in array):`);
    console.log(`    Date: ${past252Record.date}`);
    console.log(`    Close: ${past252Record.close ?? 'NULL'}`);
    console.log(`    Adj Close: ${past252Record.adj_close ?? 'NULL'}`);

    // Calculate actual days between
    const date1_12M = new Date(currentRecord12M.date);
    const date2_12M = new Date(past252Record.date);
    const daysDiff12M = Math.round((date1_12M.getTime() - date2_12M.getTime()) / (1000 * 60 * 60 * 24));
    console.log(`\n  Actual calendar days between: ${daysDiff12M} days`);

    const currentNav12M = currentRecord12M.adj_close;
    const past252Nav = past252Record.adj_close;

    if (!currentNav12M || !past252Nav || past252Nav <= 0) {
      console.error(`  ❌ Missing adj_close data (current=${currentNav12M}, past252=${past252Nav})`);
    } else {
      console.log(`\n  Calculation:`);
      console.log(`    Formula: ((Current NAV - NAV 252 days ago) / NAV 252 days ago) × 100`);
      console.log(`    = ((${currentNav12M} - ${past252Nav}) / ${past252Nav}) × 100`);
      const diff12M = currentNav12M - past252Nav;
      const ratio12M = diff12M / past252Nav;
      const trend12M = ratio12M * 100;
      console.log(`    = (${diff12M.toFixed(6)} / ${past252Nav}) × 100`);
      console.log(`    = ${ratio12M.toFixed(6)} × 100`);
      console.log(`    = ${trend12M.toFixed(4)}%`);
      console.log(`\n  ✅ 12-Month NAV Trend: ${trend12M.toFixed(2)}%`);
    }

    // ============================================================================
    // SHOW DATA POINTS AROUND THE KEY DATES
    // ============================================================================
    console.log(`\n${'='.repeat(80)}`);
    console.log(`DATA POINTS AROUND KEY DATES`);
    console.log(`${'='.repeat(80)}`);

    // Show 5 records before and after the 126-day mark
    const idx126 = navData.length - 1 - 126;
    console.log(`\n  Records around 126 trading days ago (index ${idx126}):`);
    for (let i = Math.max(0, idx126 - 2); i <= Math.min(navData.length - 1, idx126 + 2); i++) {
      const record = navData[i];
      const marker = i === idx126 ? ' ← 126 days ago' : i === navData.length - 1 ? ' ← Current' : '';
      console.log(`    [${i}] ${record.date}: close=${record.close?.toFixed(4) ?? 'NULL'}, adj_close=${record.adj_close?.toFixed(4) ?? 'NULL'}${marker}`);
    }

    // Show 5 records before and after the 252-day mark
    const idx252 = navData.length - 1 - 252;
    console.log(`\n  Records around 252 trading days ago (index ${idx252}):`);
    for (let i = Math.max(0, idx252 - 2); i <= Math.min(navData.length - 1, idx252 + 2); i++) {
      const record = navData[i];
      const marker = i === idx252 ? ' ← 252 days ago' : i === navData.length - 1 ? ' ← Current' : '';
      console.log(`    [${i}] ${record.date}: close=${record.close?.toFixed(4) ?? 'NULL'}, adj_close=${record.adj_close?.toFixed(4) ?? 'NULL'}${marker}`);
    }

    // Show recent records
    console.log(`\n  Most recent 5 records:`);
    for (let i = navData.length - 5; i < navData.length; i++) {
      const record = navData[i];
      const marker = i === navData.length - 1 ? ' ← Current' : '';
      console.log(`    [${i}] ${record.date}: close=${record.close?.toFixed(4) ?? 'NULL'}, adj_close=${record.adj_close?.toFixed(4) ?? 'NULL'}${marker}`);
    }

    console.log(`\n${'='.repeat(80)}\n`);

  } catch (error) {
    console.error(`  ❌ Error:`, error);
    throw error;
  }
}

// Main
const ticker = process.argv[2];
if (!ticker) {
  console.error('Usage: npx tsx server/scripts/debug_nav_trend.ts <TICKER>');
  console.error('Example: npx tsx server/scripts/debug_nav_trend.ts UTG');
  process.exit(1);
}

debugNAVTrends(ticker)
  .then(() => {
    console.log('✓ Debug complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

