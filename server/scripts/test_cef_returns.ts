/**
 * Quick test script to check CEF return values from API
 * Run with: npx tsx server/scripts/test_cef_returns.ts
 */

import { getSupabase } from '../src/services/database.js';
import { calculateMetrics } from '../src/services/metrics.js';

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

    // Calculate metrics
    console.log(`\nCalculating metrics...`);
    try {
      const metrics = await calculateMetrics(cef.ticker);
      console.log(`\nCalculated Metrics:`);
      console.log(`  1W: ${metrics.totalReturnDrip?.['1W'] ?? 'NULL'}`);
      console.log(`  1M: ${metrics.totalReturnDrip?.['1M'] ?? 'NULL'}`);
      console.log(`  3M: ${metrics.totalReturnDrip?.['3M'] ?? 'NULL'}`);
      console.log(`  6M: ${metrics.totalReturnDrip?.['6M'] ?? 'NULL'}`);
      console.log(`  12M: ${metrics.totalReturnDrip?.['1Y'] ?? 'NULL'}`);
      console.log(`  3Y: ${metrics.totalReturnDrip?.['3Y'] ?? 'NULL'}`);
      console.log(`  5Y: ${metrics.totalReturnDrip?.['5Y'] ?? 'NULL'}`);
      console.log(`  10Y: ${metrics.totalReturnDrip?.['10Y'] ?? 'NULL'}`);
      console.log(`  15Y: ${metrics.totalReturnDrip?.['15Y'] ?? 'NULL'}`);

      // Show what would be returned (API logic)
      console.log(`\nAPI Would Return (DB first, then metrics):`);
      console.log(`  1W: ${cef.tr_drip_1w ?? metrics.totalReturnDrip?.['1W'] ?? 'NULL'}`);
      console.log(`  1M: ${cef.tr_drip_1m ?? metrics.totalReturnDrip?.['1M'] ?? 'NULL'}`);
      console.log(`  3M: ${cef.tr_drip_3m ?? metrics.totalReturnDrip?.['3M'] ?? 'NULL'}`);
      console.log(`  6M: ${cef.tr_drip_6m ?? metrics.totalReturnDrip?.['6M'] ?? 'NULL'}`);
      console.log(`  12M: ${cef.tr_drip_12m ?? metrics.totalReturnDrip?.['1Y'] ?? 'NULL'}`);
      console.log(`  3Y: ${cef.return_3yr ?? metrics.totalReturnDrip?.['3Y'] ?? 'NULL'}`);
      console.log(`  5Y: ${cef.return_5yr ?? metrics.totalReturnDrip?.['5Y'] ?? 'NULL'}`);
      console.log(`  10Y: ${cef.return_10yr ?? metrics.totalReturnDrip?.['10Y'] ?? 'NULL'}`);
      console.log(`  15Y: ${cef.return_15yr ?? metrics.totalReturnDrip?.['15Y'] ?? 'NULL'}`);
    } catch (error) {
      console.error(`  Error calculating metrics: ${(error as Error).message}`);
    }
  }

  console.log('\n=== Test Complete ===\n');
}

testCEFReturns().catch(console.error);

