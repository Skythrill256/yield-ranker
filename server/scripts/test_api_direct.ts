/**
 * Direct API test - tests the calculation functions directly
 * This bypasses the need for a running server
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testCEFCalculations() {
  console.log('\n=== Testing CEF Calculations Directly ===\n');

  // Import after env is loaded
  const { getSupabase } = await import('../src/services/database.js');
  const supabase = getSupabase();

  // Test with BTO
  const ticker = 'BTO';
  console.log(`Testing with ticker: ${ticker}\n`);

  const { data: cef, error } = await supabase
    .from('etf_static')
    .select('*')
    .eq('ticker', ticker)
    .maybeSingle();

  if (!cef || error) {
    console.error(`❌ CEF not found: ${ticker}`);
    return;
  }

  console.log(`✅ Found CEF: ${cef.ticker}`);
  console.log(`   NAV Symbol: ${cef.nav_symbol || 'N/A'}\n`);

  if (!cef.nav_symbol) {
    console.error('❌ No NAV symbol - cannot test calculations');
    return;
  }

  // Import calculation functions
  const cefsModule = await import('../src/routes/cefs.js');

  console.log('--- Testing Z-Score ---');
  try {
    const zScore = await cefsModule.calculateCEFZScore(cef.ticker, cef.nav_symbol);
    console.log(`   Z-Score: ${zScore !== null ? zScore.toFixed(2) : 'N/A'}\n`);
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}\n`);
  }

  console.log('--- Testing NAV Trends ---');
  try {
    const trend6M = await cefsModule.calculateNAVTrend6M(cef.nav_symbol);
    console.log(`   6M NAV Trend: ${trend6M !== null ? `${trend6M.toFixed(2)}%` : 'N/A'}`);
    
    const trend12M = await cefsModule.calculateNAVReturn12M(cef.nav_symbol);
    console.log(`   12M NAV Trend: ${trend12M !== null ? `${trend12M.toFixed(2)}%` : 'N/A'}\n`);
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}\n`);
  }

  console.log('--- Testing NAV Returns (3Y, 5Y, 10Y, 15Y) ---');
  try {
    const [ret3Y, ret5Y, ret10Y, ret15Y] = await Promise.all([
      cefsModule.calculateNAVReturns(cef.nav_symbol, '3Y'),
      cefsModule.calculateNAVReturns(cef.nav_symbol, '5Y'),
      cefsModule.calculateNAVReturns(cef.nav_symbol, '10Y'),
      cefsModule.calculateNAVReturns(cef.nav_symbol, '15Y'),
    ]);
    
    console.log(`   3Y Return: ${ret3Y !== null ? `${ret3Y.toFixed(2)}%` : 'N/A'}`);
    console.log(`   5Y Return: ${ret5Y !== null ? `${ret5Y.toFixed(2)}%` : 'N/A'}`);
    console.log(`   10Y Return: ${ret10Y !== null ? `${ret10Y.toFixed(2)}%` : 'N/A'}`);
    console.log(`   15Y Return: ${ret15Y !== null ? `${ret15Y.toFixed(2)}%` : 'N/A'}\n`);
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}\n`);
  }

  console.log('--- Testing Signal ---');
  try {
    const zScore = await cefsModule.calculateCEFZScore(cef.ticker, cef.nav_symbol);
    const trend6M = await cefsModule.calculateNAVTrend6M(cef.nav_symbol);
    const trend12M = await cefsModule.calculateNAVReturn12M(cef.nav_symbol);
    
    console.log(`   Z-Score: ${zScore !== null ? zScore.toFixed(2) : 'N/A'}`);
    console.log(`   6M Trend: ${trend6M !== null ? `${trend6M.toFixed(2)}%` : 'N/A'}`);
    console.log(`   12M Trend: ${trend12M !== null ? `${trend12M.toFixed(2)}%` : 'N/A'}`);
    
    const signal = await cefsModule.calculateSignal(cef.ticker, cef.nav_symbol, zScore, trend6M, trend12M);
    console.log(`   Signal: ${signal !== null ? signal : 'N/A'}\n`);
    
    if (signal === null) {
      console.log('   ⚠️  Signal is N/A. Checking why...');
      if (!cef.nav_symbol) console.log('      - Missing NAV symbol');
      if (zScore === null) console.log('      - Missing Z-Score');
      if (trend6M === null) console.log('      - Missing 6M Trend');
      if (trend12M === null) console.log('      - Missing 12M Trend');
    }
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}\n`);
  }

  console.log('=== Test Complete ===\n');
}

testCEFCalculations().catch(console.error);

