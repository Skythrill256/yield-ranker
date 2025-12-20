/**
 * Diagnostic script to test CEF Signal and NAV Returns calculations
 * Run with: npx tsx server/scripts/test_cef_metrics.ts BTO
 */

import { getSupabase } from '../src/services/database.js';
import { getPriceHistory } from '../src/services/database.js';
import { formatDate } from '../src/utils/index.js';

async function testCEFMetrics(ticker: string) {
  console.log(`\n=== Testing CEF Metrics for ${ticker} ===\n`);

  const supabase = getSupabase();
  
  // Get CEF data
  const { data: cef, error } = await supabase
    .from('etf_static')
    .select('*')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();

  if (!cef || error) {
    console.error(`❌ CEF not found: ${ticker}`);
    return;
  }

  console.log(`✅ Found CEF: ${cef.ticker}`);
  console.log(`   NAV Symbol: ${cef.nav_symbol || 'N/A'}`);
  console.log(`   Description: ${cef.description || 'N/A'}`);

  if (!cef.nav_symbol) {
    console.error(`❌ No NAV symbol found - cannot calculate metrics`);
    return;
  }

  // Test NAV data availability
  console.log(`\n--- Checking NAV Data Availability ---`);
  
  const endDate = new Date();
  const periods = [
    { name: '6M (126 days)', days: 200 },
    { name: '12M (252 days)', days: 400 },
    { name: '2Y (504 days)', days: 600 },
    { name: '3Y', years: 3 },
    { name: '5Y', years: 5 },
    { name: '10Y', years: 10 },
    { name: '15Y', years: 15 },
  ];

  for (const period of periods) {
    const startDate = new Date();
    if (period.days) {
      startDate.setDate(endDate.getDate() - period.days);
    } else if (period.years) {
      startDate.setFullYear(endDate.getFullYear() - period.years);
    }
    
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);
    
    const navData = await getPriceHistory(cef.nav_symbol, startDateStr, endDateStr);
    
    console.log(`   ${period.name}: ${navData.length} records (${startDateStr} to ${endDateStr})`);
    
    if (navData.length > 0) {
      const first = navData[0];
      const last = navData[navData.length - 1];
      console.log(`      First: ${first.date} (adj_close: ${first.adj_close ?? first.close ?? 'N/A'})`);
      console.log(`      Last: ${last.date} (adj_close: ${last.adj_close ?? last.close ?? 'N/A'})`);
    }
  }

  // Test Z-Score calculation
  console.log(`\n--- Testing Z-Score Calculation ---`);
  try {
    const cefsModule = await import('../src/routes/cefs.js');
    const zScore = await cefsModule.calculateCEFZScore(cef.ticker, cef.nav_symbol);
    console.log(`   Z-Score: ${zScore !== null ? zScore.toFixed(2) : 'N/A'}`);
  } catch (error: any) {
    console.error(`   ❌ Z-Score calculation failed: ${error?.message || error}`);
  }

  // Test NAV Trends
  console.log(`\n--- Testing NAV Trends ---`);
  try {
    const cefsModule = await import('../src/routes/cefs.js');
    
    const trend6M = await cefsModule.calculateNAVTrend6M(cef.nav_symbol);
    console.log(`   6M NAV Trend: ${trend6M !== null ? `${trend6M.toFixed(2)}%` : 'N/A'}`);
    
    const trend12M = await cefsModule.calculateNAVReturn12M(cef.nav_symbol);
    console.log(`   12M NAV Trend: ${trend12M !== null ? `${trend12M.toFixed(2)}%` : 'N/A'}`);
  } catch (error: any) {
    console.error(`   ❌ NAV Trends calculation failed: ${error?.message || error}`);
  }

  // Test NAV Returns
  console.log(`\n--- Testing NAV Returns (3Y, 5Y, 10Y, 15Y) ---`);
  try {
    const cefsModule = await import('../src/routes/cefs.js');
    
    const [ret3Y, ret5Y, ret10Y, ret15Y] = await Promise.all([
      cefsModule.calculateNAVReturns(cef.nav_symbol, '3Y'),
      cefsModule.calculateNAVReturns(cef.nav_symbol, '5Y'),
      cefsModule.calculateNAVReturns(cef.nav_symbol, '10Y'),
      cefsModule.calculateNAVReturns(cef.nav_symbol, '15Y'),
    ]);
    
    console.log(`   3Y Return: ${ret3Y !== null ? `${ret3Y.toFixed(2)}%` : 'N/A'}`);
    console.log(`   5Y Return: ${ret5Y !== null ? `${ret5Y.toFixed(2)}%` : 'N/A'}`);
    console.log(`   10Y Return: ${ret10Y !== null ? `${ret10Y.toFixed(2)}%` : 'N/A'}`);
    console.log(`   15Y Return: ${ret15Y !== null ? `${ret15Y.toFixed(2)}%` : 'N/A'}`);
  } catch (error: any) {
    console.error(`   ❌ NAV Returns calculation failed: ${error?.message || error}`);
  }

  // Test Signal
  console.log(`\n--- Testing Signal Calculation ---`);
  try {
    const cefsModule = await import('../src/routes/cefs.js');
    
    const zScore = await cefsModule.calculateCEFZScore(cef.ticker, cef.nav_symbol);
    const trend6M = await cefsModule.calculateNAVTrend6M(cef.nav_symbol);
    const trend12M = await cefsModule.calculateNAVReturn12M(cef.nav_symbol);
    
    console.log(`   Z-Score: ${zScore !== null ? zScore.toFixed(2) : 'N/A'}`);
    console.log(`   6M Trend: ${trend6M !== null ? `${trend6M.toFixed(2)}%` : 'N/A'}`);
    console.log(`   12M Trend: ${trend12M !== null ? `${trend12M.toFixed(2)}%` : 'N/A'}`);
    
    const signal = await cefsModule.calculateSignal(cef.ticker, cef.nav_symbol, zScore, trend6M, trend12M);
    console.log(`   Signal: ${signal !== null ? signal : 'N/A'}`);
    
    if (signal === null) {
      console.log(`   ⚠️  Signal is N/A - checking why...`);
      if (!cef.nav_symbol) console.log(`      - Missing NAV symbol`);
      if (zScore === null) console.log(`      - Missing Z-Score`);
      if (trend6M === null) console.log(`      - Missing 6M Trend`);
      if (trend12M === null) console.log(`      - Missing 12M Trend`);
    }
  } catch (error: any) {
    console.error(`   ❌ Signal calculation failed: ${error?.message || error}`);
  }

  console.log(`\n=== Test Complete ===\n`);
}

// Get ticker from command line or use default
const ticker = process.argv[2] || 'BTO';
testCEFMetrics(ticker).catch(console.error);

