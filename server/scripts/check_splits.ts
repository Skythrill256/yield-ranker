/**
 * Check Split Adjustments Script
 * 
 * Verifies that scaled_amount is populated and being used correctly
 * for tickers with reverse splits (GOOY, TSLY)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDividendHistory } from '../src/services/database.js';
import { calculateDividendVolatility } from '../src/services/metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkSplitAdjustments(ticker: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`CHECKING SPLIT ADJUSTMENTS: ${ticker}`);
  console.log(`${'='.repeat(80)}\n`);

  // Get dividend history from database
  const dividends = await getDividendHistory(ticker);
  
  if (dividends.length === 0) {
    console.log(`❌ No dividends found for ${ticker}`);
    return;
  }

  // Get last 20 dividends (most recent)
  const recentDividends = dividends
    .sort((a, b) => new Date(b.ex_date).getTime() - new Date(a.ex_date).getTime())
    .slice(0, 20);

  console.log(`Found ${dividends.length} total dividends. Showing last 20:\n`);
  
  // Check which values are populated
  let scaledCount = 0;
  let adjCount = 0;
  let rawCount = 0;

  console.log(`${'Date'.padEnd(12)} ${'div_cash'.padEnd(12)} ${'adj_amount'.padEnd(12)} ${'scaled_amount'.padEnd(12)} ${'USED'.padEnd(12)} ${'split_factor'.padEnd(12)}`);
  console.log('-'.repeat(80));

  recentDividends.forEach(d => {
    const divCash = Number(d.div_cash);
    const adjAmount = d.adj_amount ? Number(d.adj_amount) : null;
    const scaledAmount = d.scaled_amount ? Number(d.scaled_amount) : null;
    const splitFactor = d.split_factor ? Number(d.split_factor) : null;

    // Determine which value is being used (same logic as metrics.ts: adj_amount first, then scaled_amount)
    const used = adjAmount ?? scaledAmount ?? divCash;
    const usedLabel = adjAmount ? 'adj' : scaledAmount ? 'scaled' : 'raw';

    if (scaledAmount) scaledCount++;
    if (adjAmount) adjCount++;
    if (divCash) rawCount++;

    const date = new Date(d.ex_date).toISOString().split('T')[0];
    console.log(
      `${date.padEnd(12)} ` +
      `$${divCash.toFixed(4).padEnd(11)} ` +
      `${adjAmount !== null ? '$' + adjAmount.toFixed(4).padEnd(11) : 'NULL'.padEnd(12)} ` +
      `${scaledAmount !== null ? '$' + scaledAmount.toFixed(4).padEnd(11) : 'NULL'.padEnd(12)} ` +
      `$${used.toFixed(4).padEnd(11)} (${usedLabel.padEnd(5)}) ` +
      `${splitFactor !== null ? splitFactor.toFixed(4).padEnd(11) : 'NULL'.padEnd(12)}`
    );
  });

  console.log(`\n${'-'.repeat(80)}`);
  console.log(`Summary:`);
  console.log(`  Total dividends checked: ${recentDividends.length}`);
  console.log(`  scaled_amount populated: ${scaledCount} (${((scaledCount/recentDividends.length)*100).toFixed(1)}%)`);
  console.log(`  adj_amount populated: ${adjCount} (${((adjCount/recentDividends.length)*100).toFixed(1)}%)`);
  console.log(`  div_cash populated: ${rawCount} (${((rawCount/recentDividends.length)*100).toFixed(1)}%)`);

  // Check if scaled_amount is being used
  const usingScaled = scaledCount > 0;
  if (usingScaled) {
    console.log(`\n✅ scaled_amount is populated and will be used (most accurate for reverse splits)`);
  } else {
    console.log(`\n⚠️  scaled_amount is NOT populated - falling back to adj_amount or div_cash`);
    console.log(`   This may cause incorrect calculations for reverse splits.`);
    console.log(`   Run daily_update.ts or re-sync dividend data to populate scaled_amount.`);
  }

  // Calculate DVI to show what's actually being used
  console.log(`\n${'-'.repeat(80)}`);
  console.log(`DVI Calculation (shows what values are actually used):`);
  try {
    const volMetrics = calculateDividendVolatility(dividends, 12, ticker);
    if (volMetrics.calculationDetails) {
      const details = volMetrics.calculationDetails;
      console.log(`  Period: ${details.periodStart} to ${details.periodEnd}`);
      console.log(`  Payments in period: ${details.rawPayments.length}`);
      console.log(`  DVI: ${volMetrics.dividendCVPercent?.toFixed(2) ?? 'N/A'}%`);
      
      // Show which amount type is being used
      const samplePayment = details.rawPayments[0];
      if (samplePayment) {
        const div = dividends.find(d => d.ex_date === samplePayment.date);
        if (div) {
          const used = div.scaled_amount ?? div.adj_amount ?? div.div_cash;
          const usedType = div.scaled_amount ? 'scaled_amount' : div.adj_amount ? 'adj_amount' : 'div_cash';
          console.log(`  Amount type used: ${usedType} (value: $${Number(used).toFixed(4)})`);
        }
      }
    }
  } catch (error) {
    console.error(`  Error calculating DVI: ${(error as Error).message}`);
  }
}

async function main() {
  const tickers = process.argv.slice(2).map(t => t.toUpperCase());
  
  if (tickers.length === 0) {
    console.log('Usage: npx tsx scripts/check_splits.ts <TICKER1> <TICKER2> ...');
    console.log('Example: npx tsx scripts/check_splits.ts GOOY TSLY');
    process.exit(0);
  }

  for (const ticker of tickers) {
    await checkSplitAdjustments(ticker);
  }
}

main().catch(console.error);

