/**
 * Quick test script to check CEF return values from API
 * Run with: npx tsx server/scripts/test_cef_returns.ts
 */

import { getSupabase } from '../src/services/database.js';
import { calculateMetrics } from '../src/services/metrics.js';
import { calculateNAVReturns } from '../src/routes/cefs.js';

async function testCEFReturns() {
  console.log('\n=== Testing CEF Return Values ===\n');

  const supabase = getSupabase();

  // Get first 5 CEFs
  const { data: cefs, error } = await supabase
    .from('etf_static')
    .select('ticker, nav_symbol, return_3yr, return_5yr, return_10yr, return_15yr, tr_drip_1w, tr_drip_1m, tr_drip_3m, tr_drip_6m, tr_drip_12m')
    .or('nav_symbol.not.is.null,nav.not.is.null,premium_discount.not.is.null')
    .limit(5);

  if (error || !cefs) {
    console.error('Error fetching CEFs:', error);
    return;
  }

  console.log(`Found ${cefs.length} CEFs to test\n`);

  for (const cef of cefs) {
    console.log(`\n--- ${cef.ticker} ---`);
    console.log(`NAV Symbol: ${cef.nav_symbol || 'N/A'}`);
    console.log(`\nDatabase Values:`);
    console.log(`  1W: ${cef.tr_drip_1w ?? 'NULL'}`);
    console.log(`  1M: ${cef.tr_drip_1m ?? 'NULL'}`);
    console.log(`  3M: ${cef.tr_drip_3m ?? 'NULL'}`);
    console.log(`  6M: ${cef.tr_drip_6m ?? 'NULL'}`);
    console.log(`  12M: ${cef.tr_drip_12m ?? 'NULL'}`);
    console.log(`  3Y: ${cef.return_3yr ?? 'NULL'}`);
    console.log(`  5Y: ${cef.return_5yr ?? 'NULL'}`);
    console.log(`  10Y: ${cef.return_10yr ?? 'NULL'}`);
    console.log(`  15Y: ${cef.return_15yr ?? 'NULL'}`);

    // Calculate NAV-based returns (for CEFs)
    const navSymbol = cef.nav_symbol || cef.ticker;
    console.log(`\nCalculating NAV-based returns for ${navSymbol}...`);
    let navReturns: { [key: string]: number | null } = {};
    try {
      const [nav3Y, nav5Y, nav10Y, nav15Y] = await Promise.all([
        calculateNAVReturns(navSymbol, '3Y'),
        calculateNAVReturns(navSymbol, '5Y'),
        calculateNAVReturns(navSymbol, '10Y'),
        calculateNAVReturns(navSymbol, '15Y'),
      ]);
      navReturns = { '3Y': nav3Y, '5Y': nav5Y, '10Y': nav10Y, '15Y': nav15Y };
      console.log(`\nNAV-Based Returns (✅ THIS IS WHAT WE NEED):`);
      console.log(`  3Y: ${navReturns['3Y'] ?? 'NULL'}`);
      console.log(`  5Y: ${navReturns['5Y'] ?? 'NULL'}`);
      console.log(`  10Y: ${navReturns['10Y'] ?? 'NULL'}`);
      console.log(`  15Y: ${navReturns['15Y'] ?? 'NULL'}`);
    } catch (error) {
      console.error(`  Error calculating NAV returns: ${(error as Error).message}`);
    }

    // Calculate metrics (price-based) for comparison
    console.log(`\nCalculating price-based metrics...`);
    try {
      const metrics = await calculateMetrics(cef.ticker);
      console.log(`\nPrice-Based Metrics (for comparison):`);
      console.log(`  1W: ${metrics.totalReturnDrip?.['1W'] ?? 'NULL'}`);
      console.log(`  1M: ${metrics.totalReturnDrip?.['1M'] ?? 'NULL'}`);
      console.log(`  3M: ${metrics.totalReturnDrip?.['3M'] ?? 'NULL'}`);
      console.log(`  6M: ${metrics.totalReturnDrip?.['6M'] ?? 'NULL'}`);
      console.log(`  12M: ${metrics.totalReturnDrip?.['1Y'] ?? 'NULL'}`);
      console.log(`  3Y: ${metrics.totalReturnDrip?.['3Y'] ?? 'NULL'}`);
      console.log(`  5Y: ${metrics.totalReturnDrip?.['5Y'] ?? 'NULL'}`);
      console.log(`  10Y: ${metrics.totalReturnDrip?.['10Y'] ?? 'NULL'}`);
      console.log(`  15Y: ${metrics.totalReturnDrip?.['15Y'] ?? 'NULL'}`);
    } catch (error) {
      console.error(`  Error calculating metrics: ${(error as Error).message}`);
    }

    // Show what API would return (NEW LOGIC: DB -> NAV -> Metrics)
    console.log(`\n✅ API Would Return (DB -> NAV -> Metrics):`);
    console.log(`  1W: ${cef.tr_drip_1w ?? 'NULL'}`);
    console.log(`  1M: ${cef.tr_drip_1m ?? 'NULL'}`);
    console.log(`  3M: ${cef.tr_drip_3m ?? 'NULL'}`);
    console.log(`  6M: ${cef.tr_drip_6m ?? 'NULL'}`);
    console.log(`  12M: ${cef.tr_drip_12m ?? 'NULL'}`);
    console.log(`  3Y: ${cef.return_3yr ?? navReturns['3Y'] ?? 'NULL'}`);
    console.log(`  5Y: ${cef.return_5yr ?? navReturns['5Y'] ?? 'NULL'} ${navReturns['5Y'] ? '✅' : '❌'}`);
    console.log(`  10Y: ${cef.return_10yr ?? navReturns['10Y'] ?? 'NULL'} ${navReturns['10Y'] ? '✅' : '❌'}`);
    console.log(`  15Y: ${cef.return_15yr ?? navReturns['15Y'] ?? 'NULL'} ${navReturns['15Y'] ? '✅' : '❌'}`);
  }

  console.log('\n=== Test Complete ===\n');
}

testCEFReturns().catch(console.error);

