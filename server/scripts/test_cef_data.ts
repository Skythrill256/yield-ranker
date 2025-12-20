/**
 * Test script to verify CEF data is stored correctly
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../yield-ranker/server/.env'),
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

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function testCEFData(ticker: string) {
  console.log(`\nTesting CEF data for: ${ticker}`);
  console.log('='.repeat(60));

  const { data, error } = await supabase
    .from('etf_static')
    .select('ticker, nav_symbol, return_3yr, return_5yr, return_10yr, return_15yr, five_year_z_score, nav_trend_6m, nav_trend_12m, signal')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();

  if (error) {
    console.error(`❌ Error: ${error.message}`);
    return;
  }

  if (!data) {
    console.error(`❌ CEF not found: ${ticker}`);
    return;
  }

  console.log(`Ticker: ${data.ticker}`);
  console.log(`NAV Symbol: ${data.nav_symbol || 'N/A'}`);
  console.log(`\nAnnualized Total Returns (NAV-based):`);
  console.log(`  3Y:  ${data.return_3yr !== null ? `${data.return_3yr.toFixed(2)}%` : 'NULL'}`);
  console.log(`  5Y:  ${data.return_5yr !== null ? `${data.return_5yr.toFixed(2)}%` : 'NULL'}`);
  console.log(`  10Y: ${data.return_10yr !== null ? `${data.return_10yr.toFixed(2)}%` : 'NULL'}`);
  console.log(`  15Y: ${data.return_15yr !== null ? `${data.return_15yr.toFixed(2)}%` : 'NULL'}`);
  console.log(`\nCEF Metrics:`);
  console.log(`  Z-Score: ${data.five_year_z_score !== null ? data.five_year_z_score.toFixed(2) : 'NULL'}`);
  console.log(`  6M NAV Trend: ${data.nav_trend_6m !== null ? `${data.nav_trend_6m.toFixed(2)}%` : 'NULL'}`);
  console.log(`  12M NAV Return: ${data.nav_trend_12m !== null ? `${data.nav_trend_12m.toFixed(2)}%` : 'NULL'}`);
  console.log(`  Signal: ${data.signal !== null ? data.signal : 'NULL'}`);

  // Verify annualized returns are reasonable
  const returns = [data.return_3yr, data.return_5yr, data.return_10yr, data.return_15yr];
  const allPresent = returns.every(r => r !== null && r !== undefined);
  const allReasonable = returns.every(r => r === null || (r >= -100 && r <= 1000));

  console.log(`\n✅ Data Status:`);
  console.log(`  All returns present: ${allPresent ? 'YES' : 'NO'}`);
  console.log(`  All returns reasonable: ${allReasonable ? 'YES' : 'NO'}`);

  if (allPresent && allReasonable) {
    console.log(`\n✅ CEF data is complete and accurate!`);
  } else {
    console.log(`\n⚠️  Some data may be missing or invalid`);
  }
}

async function main() {
  const ticker = process.argv[2] || 'GAB';
  await testCEFData(ticker);
}

main().catch(console.error);

