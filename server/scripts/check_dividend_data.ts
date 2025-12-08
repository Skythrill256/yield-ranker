/**
 * Check Dividend Data Script
 * 
 * Compares database dividend data with Tiingo API to find discrepancies
 * Especially important for reverse splits (GOOY, TSLY)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchDividendHistory } from '../src/services/tiingo.js';
import { getDividendHistory } from '../src/services/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkDividendData(ticker: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`CHECKING DIVIDEND DATA: ${ticker}`);
  console.log(`${'='.repeat(80)}\n`);

  // Get data from database
  const dbDividends = await getDividendHistory(ticker);
  console.log(`Database: Found ${dbDividends.length} dividends\n`);

  // Get data from Tiingo API (fresh)
  console.log(`Fetching fresh data from Tiingo API...`);
  const tiingoDividends = await fetchDividendHistory(ticker);
  console.log(`Tiingo API: Found ${tiingoDividends.length} dividends\n`);

  // Get last 365 days
  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - 365);

  // Filter to last 365 days
  const dbRecent = dbDividends
    .filter(d => new Date(d.ex_date) >= oneYearAgo)
    .sort((a, b) => new Date(b.ex_date).getTime() - new Date(a.ex_date).getTime());

  const tiingoRecent = tiingoDividends
    .filter(d => new Date(d.date) >= oneYearAgo)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  console.log(`Last 365 days:`);
  console.log(`  Database: ${dbRecent.length} dividends`);
  console.log(`  Tiingo API: ${tiingoRecent.length} dividends\n`);

  // Compare dates
  const dbDates = new Set(dbRecent.map(d => d.ex_date));
  const tiingoDates = new Set(tiingoRecent.map(d => d.date));

  const missingInDb = tiingoRecent.filter(d => !dbDates.has(d.date));
  const missingInTiingo = dbRecent.filter(d => !tiingoDates.has(d.ex_date));

  if (missingInDb.length > 0) {
    console.log(`⚠️  Missing in Database (but in Tiingo): ${missingInDb.length}`);
    missingInDb.forEach(d => {
      console.log(`  ${d.date}: divCash=${d.dividend.toFixed(4)}, adjDiv=${d.adjDividend.toFixed(4)}, scaledDiv=${d.scaledDividend.toFixed(4)}`);
    });
    console.log();
  }

  if (missingInTiingo.length > 0) {
    console.log(`⚠️  Missing in Tiingo (but in Database): ${missingInTiingo.length}`);
    missingInTiingo.forEach(d => {
      console.log(`  ${d.ex_date}: divCash=${Number(d.div_cash).toFixed(4)}, adjAmount=${d.adj_amount ? Number(d.adj_amount).toFixed(4) : 'NULL'}, scaledAmount=${d.scaled_amount ? Number(d.scaled_amount).toFixed(4) : 'NULL'}`);
    });
    console.log();
  }

  // Compare amounts for matching dates
  console.log(`Comparing amounts for matching dates:\n`);
  console.log(`${'Date'.padEnd(12)} ${'DB div_cash'.padEnd(15)} ${'DB adj_amount'.padEnd(15)} ${'DB scaled_amount'.padEnd(15)} ${'Tiingo div'.padEnd(15)} ${'Tiingo adj'.padEnd(15)} ${'Tiingo scaled'.padEnd(15)}`);
  console.log('-'.repeat(100));

  let mismatchCount = 0;
  const matchingDates = Array.from(dbDates).filter(d => tiingoDates.has(d));
  
  for (const date of matchingDates.sort().reverse().slice(0, 20)) {
    const dbDiv = dbRecent.find(d => d.ex_date === date);
    const tiingoDiv = tiingoRecent.find(d => d.date === date);

    if (dbDiv && tiingoDiv) {
      const dbDivCash = Number(dbDiv.div_cash);
      const dbAdj = dbDiv.adj_amount ? Number(dbDiv.adj_amount) : null;
      const dbScaled = dbDiv.scaled_amount ? Number(dbDiv.scaled_amount) : null;
      const tiingoDivCash = tiingoDiv.dividend;
      const tiingoAdj = tiingoDiv.adjDividend;
      const tiingoScaled = tiingoDiv.scaledDividend;

      // Check if amounts match
      const divCashMatch = Math.abs(dbDivCash - tiingoDivCash) < 0.0001;
      const adjMatch = dbAdj !== null && Math.abs(dbAdj - tiingoAdj) < 0.0001;
      const scaledMatch = dbScaled !== null && Math.abs(dbScaled - tiingoScaled) < 0.0001;

      if (!divCashMatch || !adjMatch || !scaledMatch) {
        mismatchCount++;
        console.log(
          `${date.padEnd(12)} ` +
          `$${dbDivCash.toFixed(4).padEnd(14)} ` +
          `${dbAdj !== null ? '$' + dbAdj.toFixed(4).padEnd(14) : 'NULL'.padEnd(15)} ` +
          `${dbScaled !== null ? '$' + dbScaled.toFixed(4).padEnd(14) : 'NULL'.padEnd(15)} ` +
          `$${tiingoDivCash.toFixed(4).padEnd(14)} ` +
          `$${tiingoAdj.toFixed(4).padEnd(14)} ` +
          `$${tiingoScaled.toFixed(4).padEnd(14)} ` +
          `${!divCashMatch || !adjMatch || !scaledMatch ? '⚠️ MISMATCH' : ''}`
        );
      }
    }
  }

  if (mismatchCount === 0 && matchingDates.length > 0) {
    console.log(`✓ All matching dates have consistent amounts`);
  }

  // Show what's being used in calculation
  console.log(`\n${'-'.repeat(80)}`);
  console.log(`What's being used in DVI calculation (adj_amount first, then scaled_amount, then div_cash):\n`);
  
  const recent20 = dbRecent.slice(0, 20);
  recent20.forEach(d => {
    const used = d.adj_amount ?? d.scaled_amount ?? d.div_cash;
    const usedType = d.adj_amount ? 'adj_amount' : d.scaled_amount ? 'scaled_amount' : 'div_cash';
    const divCash = Number(d.div_cash);
    const adj = d.adj_amount ? Number(d.adj_amount) : null;
    const scaled = d.scaled_amount ? Number(d.scaled_amount) : null;
    
    console.log(
      `${d.ex_date.padEnd(12)} ` +
      `div_cash=$${divCash.toFixed(4).padEnd(8)} ` +
      `adj_amount=${adj !== null ? '$' + adj.toFixed(4).padEnd(8) : 'NULL'.padEnd(12)} ` +
      `scaled_amount=${scaled !== null ? '$' + scaled.toFixed(4).padEnd(8) : 'NULL'.padEnd(12)} ` +
      `→ USING: $${Number(used).toFixed(4)} (${usedType})`
    );
  });

  // Summary
  console.log(`\n${'-'.repeat(80)}`);
  console.log(`Summary:`);
  console.log(`  Total dividends in DB (last 365 days): ${dbRecent.length}`);
  console.log(`  Total dividends from Tiingo (last 365 days): ${tiingoRecent.length}`);
  console.log(`  Missing in DB: ${missingInDb.length}`);
  console.log(`  Missing in Tiingo: ${missingInTiingo.length}`);
  console.log(`  Amount mismatches: ${mismatchCount}`);
  
  if (missingInDb.length > 0 || mismatchCount > 0) {
    console.log(`\n⚠️  ISSUE DETECTED: Database may need to be re-synced with Tiingo API`);
    console.log(`   Run: npx tsx scripts/daily_update.ts ${ticker}`);
  } else {
    console.log(`\n✓ Database appears to be in sync with Tiingo API`);
  }
}

async function main() {
  const tickers = process.argv.slice(2).map(t => t.toUpperCase());
  
  if (tickers.length === 0) {
    console.log('Usage: npx tsx scripts/check_dividend_data.ts <TICKER1> <TICKER2> ...');
    console.log('Example: npx tsx scripts/check_dividend_data.ts GOOY TSLY');
    process.exit(0);
  }

  for (const ticker of tickers) {
    await checkDividendData(ticker);
  }
}

main().catch(console.error);

