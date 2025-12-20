/**
 * Test script to check what NAV data we're actually getting from Tiingo
 * This will show the date range and number of records for each NAV symbol
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testNAVDataRanges() {
  console.log('\n=== Testing NAV Data Ranges from Tiingo ===\n');

  // Import after env is loaded
  const { getSupabase } = await import('../src/services/database.js');
  const { getPriceHistory } = await import('../src/services/database.js');
  const { formatDate } = await import('../src/utils/index.js');
  const supabase = getSupabase();

  // Get a few CEFs to test
  const { data: cefs, error } = await supabase
    .from('etf_static')
    .select('ticker, nav_symbol, description')
    .not('nav_symbol', 'is', null)
    .limit(10);

  if (!cefs || error || cefs.length === 0) {
    console.error('❌ No CEFs found with NAV symbols');
    return;
  }

  console.log(`Testing ${cefs.length} CEFs...\n`);

  for (const cef of cefs) {
    if (!cef.nav_symbol) continue;

    console.log(`\n--- ${cef.ticker} (${cef.description || 'N/A'}) ---`);
    console.log(`NAV Symbol: ${cef.nav_symbol}`);

    // Test different date ranges
    const endDate = new Date();
    const ranges = [
      { name: '1 Year', years: 1 },
      { name: '2 Years', years: 2 },
      { name: '3 Years', years: 3 },
      { name: '5 Years', years: 5 },
      { name: '10 Years', years: 10 },
      { name: '15 Years', years: 15 },
      { name: '20 Years', years: 20 },
    ];

    for (const range of ranges) {
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - range.years);
      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);

      try {
        const navData = await getPriceHistory(
          cef.nav_symbol,
          startDateStr,
          endDateStr
        );

        if (navData.length > 0) {
          navData.sort((a, b) => a.date.localeCompare(b.date));
          const first = navData[0];
          const last = navData[navData.length - 1];
          const firstDate = new Date(first.date);
          const lastDate = new Date(last.date);
          const actualYears = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365);

          console.log(`  ${range.name}: ${navData.length} records`);
          console.log(`    First: ${first.date} (${firstDate.toLocaleDateString()})`);
          console.log(`    Last: ${last.date} (${lastDate.toLocaleDateString()})`);
          console.log(`    Actual span: ${actualYears.toFixed(1)} years`);
          
          // Check if we have adj_close
          const hasAdjClose = navData.some(d => d.adj_close !== null && d.adj_close !== undefined);
          console.log(`    Has adj_close: ${hasAdjClose ? '✅' : '❌'}`);
        } else {
          console.log(`  ${range.name}: ❌ No data`);
        }
      } catch (error: any) {
        console.log(`  ${range.name}: ❌ Error - ${error.message}`);
      }
    }

    // Test specific calculations
    console.log(`\n  Testing Calculations:`);
    try {
      const cefsModule = await import('../src/routes/cefs.js');
      
      // Test 15Y return
      const ret15Y = await cefsModule.calculateNAVReturns(cef.nav_symbol, '15Y');
      console.log(`    15Y Return: ${ret15Y !== null ? `${ret15Y.toFixed(2)}%` : 'N/A'}`);
      
      // Test 10Y return
      const ret10Y = await cefsModule.calculateNAVReturns(cef.nav_symbol, '10Y');
      console.log(`    10Y Return: ${ret10Y !== null ? `${ret10Y.toFixed(2)}%` : 'N/A'}`);
      
      // Test 5Y return
      const ret5Y = await cefsModule.calculateNAVReturns(cef.nav_symbol, '5Y');
      console.log(`    5Y Return: ${ret5Y !== null ? `${ret5Y.toFixed(2)}%` : 'N/A'}`);
      
      // Test 3Y return
      const ret3Y = await cefsModule.calculateNAVReturns(cef.nav_symbol, '3Y');
      console.log(`    3Y Return: ${ret3Y !== null ? `${ret3Y.toFixed(2)}%` : 'N/A'}`);
    } catch (error: any) {
      console.log(`    ❌ Calculation error: ${error.message}`);
    }
  }

  console.log('\n=== Test Complete ===\n');
}

testNAVDataRanges().catch(console.error);

