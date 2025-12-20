/**
 * refresh_cefs.ts - CEF-Only Data Refresh Script
 * 
 * This script calculates and stores ALL CEF metrics in the database:
 * - 3Y, 5Y, 10Y, 15Y annualized total returns (NAV-based)
 * - 5-Year Z-Score
 * - 6M NAV Trend
 * - 12M NAV Return
 * - Signal rating
 * 
 * NO real-time calculations - everything is pre-calculated and stored.
 * 
 * Usage: npx tsx scripts/refresh_cefs.ts [--ticker SYMBOL] [--dry-run]
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
import { batchUpdateETFMetricsPreservingCEFFields, getPriceHistory } from '../src/services/database.js';
import { formatDate } from '../src/utils/index.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function parseArgs() {
  const args = process.argv.slice(2);
  const options: { ticker?: string; dryRun: boolean } = { dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ticker' && i + 1 < args.length) {
      options.ticker = args[i + 1].toUpperCase();
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

async function refreshCEF(ticker: string, dryRun: boolean): Promise<void> {
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

    // Check if it's a CEF (has nav_symbol or nav)
    const navSymbol = cef.nav_symbol || null;
    if (!navSymbol && !cef.nav) {
      console.log(`  ⚠ Not a CEF (no nav_symbol or nav): ${ticker}`);
      return;
    }

    const navSymbolForCalc = navSymbol || ticker;
    console.log(`  Using NAV symbol: ${navSymbolForCalc}`);

    if (dryRun) {
      console.log(`  [DRY RUN] Would calculate all CEF metrics`);
      return;
    }

    // Import CEF calculation functions
    const {
      calculateCEFZScore,
      calculateNAVTrend6M,
      calculateNAVReturn12M,
      calculateSignal,
      calculateNAVReturns,
    } = await import('../src/routes/cefs.js');

    const updateData: any = {};

    // Calculate all CEF metrics
    console.log(`  📊 Calculating CEF metrics...`);

    // 1. Calculate 5-Year Z-Score
    // ALWAYS set this field (even if null) to clear stale values
    let fiveYearZScore: number | null = null;
    try {
      fiveYearZScore = await calculateCEFZScore(ticker, navSymbolForCalc);
      updateData.five_year_z_score = fiveYearZScore; // Always set, even if null
      if (fiveYearZScore !== null) {
        console.log(`    ✓ 5Y Z-Score: ${fiveYearZScore.toFixed(2)}`);
      } else {
        console.log(`    ⚠ 5Y Z-Score: N/A (insufficient data) - clearing old value`);
      }
    } catch (error) {
      updateData.five_year_z_score = null; // Clear on error
      console.warn(`    ⚠ Failed to calculate Z-Score: ${(error as Error).message} - clearing old value`);
    }

    // 2. Calculate NAV Trend 6M
    // ALWAYS set this field (even if null) to clear stale values
    let navTrend6M: number | null = null;
    try {
      navTrend6M = await calculateNAVTrend6M(navSymbolForCalc);
      updateData.nav_trend_6m = navTrend6M; // Always set, even if null
      if (navTrend6M !== null) {
        console.log(`    ✓ 6M NAV Trend: ${navTrend6M.toFixed(2)}%`);
      } else {
        console.log(`    ⚠ 6M NAV Trend: N/A - clearing old value`);
      }
    } catch (error) {
      updateData.nav_trend_6m = null; // Clear on error
      console.warn(`    ⚠ Failed to calculate 6M NAV Trend: ${(error as Error).message} - clearing old value`);
    }

    // 3. Calculate NAV Return 12M
    // ALWAYS set this field (even if null) to clear stale values
    let navTrend12M: number | null = null;
    try {
      navTrend12M = await calculateNAVReturn12M(navSymbolForCalc);
      updateData.nav_trend_12m = navTrend12M; // Always set, even if null
      if (navTrend12M !== null) {
        console.log(`    ✓ 12M NAV Return: ${navTrend12M.toFixed(2)}%`);
      } else {
        console.log(`    ⚠ 12M NAV Return: N/A - clearing old value`);
      }
    } catch (error) {
      updateData.nav_trend_12m = null; // Clear on error
      console.warn(`    ⚠ Failed to calculate 12M NAV Return: ${(error as Error).message} - clearing old value`);
    }

    // 4. Calculate Signal
    // ALWAYS set this field (even if null) to clear stale values
    let signal: number | null = null;
    try {
      signal = await calculateSignal(ticker, navSymbolForCalc, fiveYearZScore, navTrend6M, navTrend12M);
      updateData.signal = signal; // Always set, even if null
      if (signal !== null) {
        const signalLabels: Record<number, string> = {
          3: 'Optimal',
          2: 'Good Value',
          1: 'Healthy',
          0: 'Neutral',
          '-1': 'Value Trap',
          '-2': 'Overvalued',
        };
        console.log(`    ✓ Signal: ${signal} (${signalLabels[signal as keyof typeof signalLabels] || 'Unknown'})`);
      } else {
        console.log(`    ⚠ Signal: N/A - clearing old value`);
      }
    } catch (error) {
      updateData.signal = null; // Clear on error
      console.warn(`    ⚠ Failed to calculate Signal: ${(error as Error).message} - clearing old value`);
    }

    // 5. Calculate DVI (Dividend Volatility Index) - same as ETFs
    console.log(`  📊 Calculating DVI (Dividend Volatility Index)...`);
    let dviResult: any = null;
    try {
      const { getDividendHistory } = await import('../src/services/database.js');
      const { calculateDividendVolatility } = await import('../src/services/metrics.js');
      
      const dividends = await getDividendHistory(ticker.toUpperCase());
      if (dividends && dividends.length > 0) {
        dviResult = calculateDividendVolatility(dividends, 12, ticker);
        if (dviResult) {
          updateData.dividend_sd = dviResult.dividendSD;
          updateData.dividend_cv = dviResult.dividendCV;
          updateData.dividend_cv_percent = dviResult.dividendCVPercent;
          updateData.dividend_volatility_index = dviResult.volatilityIndex;
          updateData.annual_dividend = dviResult.annualDividend;
          console.log(`    ✓ DVI: ${dviResult.volatilityIndex || 'N/A'} (CV: ${dviResult.dividendCVPercent?.toFixed(2) || 'N/A'}%)`);
        }
      } else {
        console.log(`    ⚠ DVI: N/A (no dividend data) - clearing old values`);
        updateData.dividend_sd = null;
        updateData.dividend_cv = null;
        updateData.dividend_cv_percent = null;
        updateData.dividend_volatility_index = null;
      }
    } catch (error) {
      console.warn(`    ⚠ Failed to calculate DVI: ${(error as Error).message} - clearing old values`);
      updateData.dividend_sd = null;
      updateData.dividend_cv = null;
      updateData.dividend_cv_percent = null;
      updateData.dividend_volatility_index = null;
    }

    // 6. Calculate TOTAL RETURNS (3Y, 5Y, 10Y, 15Y) - NAV-based annualized returns
    console.log(`  📊 Calculating NAV-based total returns (3Y, 5Y, 10Y, 15Y)...`);
    const return3Yr = await calculateNAVReturns(navSymbolForCalc, '3Y');
    const return5Yr = await calculateNAVReturns(navSymbolForCalc, '5Y');
    const return10Yr = await calculateNAVReturns(navSymbolForCalc, '10Y');
    const return15Yr = await calculateNAVReturns(navSymbolForCalc, '15Y');

    // Store returns (even if null - null means insufficient data)
    updateData.return_3yr = return3Yr;
    updateData.return_5yr = return5Yr;
    updateData.return_10yr = return10Yr;
    updateData.return_15yr = return15Yr;

    console.log(`    ✓ Total Returns (annualized):`);
    console.log(`      - 3Y: ${return3Yr !== null ? `${return3Yr.toFixed(2)}%` : 'N/A'}`);
    console.log(`      - 5Y: ${return5Yr !== null ? `${return5Yr.toFixed(2)}%` : 'N/A'}`);
    console.log(`      - 10Y: ${return10Yr !== null ? `${return10Yr.toFixed(2)}%` : 'N/A'}`);
    console.log(`      - 15Y: ${return15Yr !== null ? `${return15Yr.toFixed(2)}%` : 'N/A'}`);

    // 6. Update NAV, Market Price, and Premium/Discount from latest prices
    console.log(`  📊 Updating NAV, Market Price, and Premium/Discount...`);
    let currentNav: number | null = cef.nav ?? null;
    let marketPrice: number | null = cef.price ?? null;
    let premiumDiscount: number | null = cef.premium_discount ?? null;

    // Get latest NAV from nav_symbol
    if (navSymbolForCalc) {
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);
        const navHistory = await getPriceHistory(
          navSymbolForCalc.toUpperCase(),
          formatDate(startDate),
          formatDate(endDate)
        );
        if (navHistory.length > 0) {
          navHistory.sort((a, b) => a.date.localeCompare(b.date));
          const latestNav = navHistory[navHistory.length - 1];
          currentNav = latestNav.close ?? latestNav.adj_close ?? null;
          if (currentNav !== null) {
            updateData.nav = currentNav;
            console.log(`    ✓ NAV: $${currentNav.toFixed(2)}`);
          }
        }
      } catch (error) {
        console.warn(`    ⚠ Failed to fetch NAV: ${(error as Error).message}`);
      }
    }

    // ALWAYS fetch latest market price (don't rely on stale database value)
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 30);
      const priceHistory = await getPriceHistory(
        ticker.toUpperCase(),
        formatDate(startDate),
        formatDate(endDate)
      );
      if (priceHistory.length > 0) {
        priceHistory.sort((a, b) => a.date.localeCompare(b.date));
        const latestPrice = priceHistory[priceHistory.length - 1];
        const fetchedPrice = latestPrice.close ?? latestPrice.adj_close ?? null;
        if (fetchedPrice !== null) {
          marketPrice = fetchedPrice;
          updateData.price = marketPrice;
          console.log(`    ✓ Market Price: $${marketPrice.toFixed(2)}`);
        }
      }
    } catch (error) {
      console.warn(`    ⚠ Failed to fetch market price: ${(error as Error).message}`);
    }

    // Calculate premium/discount: ((MP / NAV - 1) * 100)
    // ALWAYS calculate and save premium/discount when we have both NAV and market price
    if (currentNav && currentNav !== 0 && marketPrice && marketPrice > 0) {
      premiumDiscount = (marketPrice / currentNav - 1) * 100;
      // Always update premium_discount (don't preserve old values)
      updateData.premium_discount = premiumDiscount;
      console.log(`    ✓ Premium/Discount: ${premiumDiscount >= 0 ? '+' : ''}${premiumDiscount.toFixed(2)}% (MP=$${marketPrice.toFixed(2)}, NAV=$${currentNav.toFixed(2)})`);
    } else {
      // If we can't calculate, set to null to clear stale values
      updateData.premium_discount = null;
      if (cef.premium_discount !== null && cef.premium_discount !== undefined) {
        console.log(`    ⚠ Premium/Discount: Cannot calculate (missing NAV or market price), clearing old value`);
      } else {
        console.log(`    ⚠ Premium/Discount: N/A (missing NAV or market price)`);
      }
    }

    // Save to database
    console.log(`  💾 Saving to database...`);
    await batchUpdateETFMetricsPreservingCEFFields([{
      ticker,
      metrics: updateData,
    }]);

    // Verify save
    const { data: verify } = await supabase
      .from('etf_static')
      .select('return_3yr, return_5yr, return_10yr, return_15yr, five_year_z_score, nav_trend_6m, nav_trend_12m, signal, premium_discount, nav, price')
      .eq('ticker', ticker.toUpperCase())
      .maybeSingle();

    if (verify) {
      console.log(`    ✓ Verified saved values:`);
      console.log(`      - Returns: 3Y=${verify.return_3yr ?? 'NULL'}, 5Y=${verify.return_5yr ?? 'NULL'}, 10Y=${verify.return_10yr ?? 'NULL'}, 15Y=${verify.return_15yr ?? 'NULL'}`);
      console.log(`      - Z-Score: ${verify.five_year_z_score ?? 'NULL'}`);
      console.log(`      - NAV Trends: 6M=${verify.nav_trend_6m ?? 'NULL'}, 12M=${verify.nav_trend_12m ?? 'NULL'}`);
      console.log(`      - Signal: ${verify.signal ?? 'NULL'}`);
      console.log(`      - Premium/Discount: ${verify.premium_discount !== null && verify.premium_discount !== undefined ? (verify.premium_discount >= 0 ? '+' : '') + verify.premium_discount.toFixed(2) + '%' : 'NULL'} (MP=$${verify.price ?? 'NULL'}, NAV=$${verify.nav ?? 'NULL'})`);
    }

    console.log(`  ✅ ${ticker} complete`);
  } catch (error) {
    console.error(`  ❌ Error processing ${ticker}:`, error);
    throw error;
  }
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('CEF METRICS REFRESH');
  console.log('='.repeat(60));
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);

  if (options.ticker) {
    // Process single ticker
    await refreshCEF(options.ticker, options.dryRun);
  } else {
    // Get only uploaded CEFs from database (those with nav_symbol set)
    // Only process CEFs that were actually uploaded (have nav_symbol)
    console.log('Fetching uploaded CEFs from database...');
    const { data: cefs, error } = await supabase
      .from('etf_static')
      .select('ticker, nav_symbol, nav')
      .not('nav_symbol', 'is', null)
      .neq('nav_symbol', '')
      .order('ticker', { ascending: true });

    if (error) {
      console.error(`❌ Error fetching CEFs: ${error.message}`);
      process.exit(1);
    }

    if (!cefs || cefs.length === 0) {
      console.error(`❌ No CEFs found in database`);
      process.exit(1);
    }

    console.log(`Found ${cefs.length} CEFs to process\n`);

    // Process each CEF
    for (let i = 0; i < cefs.length; i++) {
      const cef = cefs[i];
      console.log(`\n[${i + 1}/${cefs.length}]`);
      await refreshCEF(cef.ticker, options.dryRun);

      // Small delay to avoid overwhelming the API (reduced from 1000ms to 500ms for faster execution)
      if (i < cefs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Completed processing ${cefs.length} CEFs`);
    console.log(`${'='.repeat(60)}`);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

