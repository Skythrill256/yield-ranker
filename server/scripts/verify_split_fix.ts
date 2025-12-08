/**
 * Verify Split Fix Script
 * 
 * Checks if adj_amount is now correctly calculated for reverse splits
 */

import { getDividendHistory } from '../src/services/database.js';
import { calculateDividendVolatility } from '../src/services/metrics.js';

async function verifyFix(ticker: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`VERIFYING SPLIT FIX: ${ticker}`);
  console.log(`${'='.repeat(80)}\n`);

  const dividends = await getDividendHistory(ticker);
  
  if (dividends.length === 0) {
    console.log(`❌ No dividends found for ${ticker}`);
    return;
  }

  // Get last 365 days
  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - 365);

  const recent = dividends
    .filter(d => new Date(d.ex_date) >= oneYearAgo)
    .sort((a, b) => new Date(b.ex_date).getTime() - new Date(a.ex_date).getTime());

  console.log(`Found ${recent.length} dividends in last 365 days\n`);

  // Check if adj_amount is different from div_cash (should be for reverse splits)
  console.log(`Checking if adj_amount is correctly adjusted:\n`);
  console.log(`${'Date'.padEnd(12)} ${'div_cash'.padEnd(12)} ${'adj_amount'.padEnd(12)} ${'scaled_amount'.padEnd(12)} ${'Status'.padEnd(15)}`);
  console.log('-'.repeat(70));

  let hasAdjustment = false;
  let usingAdjAmount = 0;
  let usingScaledAmount = 0;
  let usingRaw = 0;

  recent.slice(0, 10).forEach(d => {
    const divCash = Number(d.div_cash);
    const adjAmount = d.adj_amount ? Number(d.adj_amount) : null;
    const scaledAmount = d.scaled_amount ? Number(d.scaled_amount) : null;

    // What's being used (per CEO: adj_amount first, then scaled_amount)
    const used = adjAmount ?? scaledAmount ?? divCash;
    const usedType = adjAmount ? 'adj_amount' : scaledAmount ? 'scaled_amount' : 'div_cash';
    
    if (usedType === 'adj_amount') usingAdjAmount++;
    else if (usedType === 'scaled_amount') usingScaledAmount++;
    else usingRaw++;

    // Check if adj_amount is different from div_cash (indicates adjustment)
    const isAdjusted = adjAmount !== null && Math.abs(adjAmount - divCash) > 0.0001;
    if (isAdjusted) hasAdjustment = true;

    const status = isAdjusted ? '✅ Adjusted' : adjAmount === null ? '⚠️  NULL' : '⚠️  Same as raw';
    
    console.log(
      `${d.ex_date.padEnd(12)} ` +
      `$${divCash.toFixed(4).padEnd(11)} ` +
      `${adjAmount !== null ? '$' + adjAmount.toFixed(4).padEnd(11) : 'NULL'.padEnd(12)} ` +
      `${scaledAmount !== null ? '$' + scaledAmount.toFixed(4).padEnd(11) : 'NULL'.padEnd(12)} ` +
      `${status.padEnd(15)} (using: ${usedType})`
    );
  });

  console.log(`\n${'-'.repeat(70)}`);
  console.log(`Summary:`);
  console.log(`  Using adj_amount: ${usingAdjAmount}/${recent.length}`);
  console.log(`  Using scaled_amount: ${usingScaledAmount}/${recent.length}`);
  console.log(`  Using raw div_cash: ${usingRaw}/${recent.length}`);
  console.log(`  Has adjustment: ${hasAdjustment ? '✅ YES' : '❌ NO'}`);

  // Calculate DVI to show final result
  console.log(`\n${'-'.repeat(70)}`);
  console.log(`DVI Calculation Result:`);
  try {
    const volMetrics = calculateDividendVolatility(dividends, 12, ticker);
    if (volMetrics.calculationDetails) {
      const details = volMetrics.calculationDetails;
      console.log(`  Period: ${details.periodStart} to ${details.periodEnd}`);
      console.log(`  Payments: ${details.rawPayments.length}`);
      console.log(`  SD (Sample): ${details.standardDeviation.toFixed(4)}`);
      console.log(`  Median: ${details.median.toFixed(4)}`);
      console.log(`  DVI: ${volMetrics.dividendCVPercent?.toFixed(2) ?? 'N/A'}%`);
      console.log(`  Volatility Index: ${volMetrics.volatilityIndex ?? 'N/A'}`);

      // Show sample of what's being used
      if (details.rawPayments.length > 0) {
        const sample = details.rawPayments[0];
        const div = dividends.find(d => d.ex_date === sample.date);
        if (div) {
          const used = div.adj_amount ?? div.scaled_amount ?? div.div_cash;
          const usedType = div.adj_amount ? 'adj_amount' : div.scaled_amount ? 'scaled_amount' : 'div_cash';
          console.log(`\n  Sample payment (${sample.date}):`);
          console.log(`    div_cash: $${Number(div.div_cash).toFixed(4)}`);
          console.log(`    adj_amount: ${div.adj_amount ? '$' + Number(div.adj_amount).toFixed(4) : 'NULL'}`);
          console.log(`    scaled_amount: ${div.scaled_amount ? '$' + Number(div.scaled_amount).toFixed(4) : 'NULL'}`);
          console.log(`    → Using: $${Number(used).toFixed(4)} (${usedType})`);
        }
      }
    }
  } catch (error) {
    console.error(`  Error: ${(error as Error).message}`);
  }

  // Final verdict
  console.log(`\n${'='.repeat(70)}`);
  if (hasAdjustment && usingAdjAmount > 0) {
    console.log(`✅ FIX WORKING: adj_amount is being adjusted and used`);
  } else if (usingScaledAmount > 0) {
    console.log(`⚠️  PARTIAL: Using scaled_amount (adj_amount may be NULL)`);
  } else {
    console.log(`❌ NOT WORKING: No adjustment detected, using raw div_cash`);
    console.log(`   You may need to re-sync data: npx tsx scripts/daily_update.ts ${ticker}`);
  }
}

async function main() {
  const tickers = process.argv.slice(2).map(t => t.toUpperCase());
  
  if (tickers.length === 0) {
    console.log('Usage: npx tsx scripts/verify_split_fix.ts <TICKER1> <TICKER2> ...');
    console.log('Example: npx tsx scripts/verify_split_fix.ts GOOY TSLY');
    process.exit(0);
  }

  for (const ticker of tickers) {
    await verifyFix(ticker);
  }
}

main().catch(console.error);

