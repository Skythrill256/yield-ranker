/**
 * DVI Verification Script
 * 
 * Outputs detailed DVI calculation breakdown in spreadsheet format
 * for comparison with CEO's spreadsheet
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

function formatSpreadsheetOutput(ticker: string, volMetrics: any) {
  if (!volMetrics || !volMetrics.calculationDetails) {
    console.log(`\n${ticker}: No calculation details available\n`);
    return;
  }

  const { periodStart, periodEnd, rawPayments, mean, median, variance, standardDeviation } = volMetrics.calculationDetails;
  const cv = volMetrics.dividendCVPercent;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`DVI CALCULATION DETAILS: ${ticker}`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`Period: ${periodStart} to ${periodEnd} (365 days)`);
  console.log(`Total Payments: ${rawPayments.length}\n`);

  // Header (matching spreadsheet format)
  console.log(`${ticker}`);
  console.log(`${'Date'.padEnd(15)} ${'RAW'.padEnd(12)} ${'FREQ'.padEnd(6)} ${'ANNUALIZED'.padEnd(12)}`);
  console.log('-'.repeat(50));

  // Data rows (sorted by date descending to match spreadsheet - newest first)
  const sortedPayments = [...rawPayments].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  sortedPayments.forEach(p => {
    console.log(
      `${p.date.padEnd(15)} ${p.amount.toFixed(4).padEnd(12)} ${p.frequency.toString().padEnd(6)} ${p.annualized.toFixed(2).padEnd(12)}`
    );
  });

  console.log('-'.repeat(50));

  // Summary statistics (matching spreadsheet format)
  console.log(`\nSUMMARY STATISTICS (calculated on ANNUALIZED amounts):`);
  console.log(`  SD (Sample):     ${standardDeviation.toFixed(4)}  [Formula: √(Σ(Annualized_i - μ)² / (n-1))]`);
  console.log(`  MEDIAN:          ${median.toFixed(4)}`);
  console.log(`  CV:              ${cv?.toFixed(2) ?? 'N/A'}%  [Formula: (SD / MEDIAN) × 100]`);
  console.log(`\n  Mean (for SD calc): ${mean.toFixed(4)}`);
  console.log(`  Variance:          ${variance.toFixed(4)}`);
  console.log(`  n (sample size):   ${rawPayments.length}`);
  console.log(`\nFINAL DVI: ${cv?.toFixed(2) ?? 'N/A'}%`);

  // Show frequency source breakdown
  const freqSourceCounts = rawPayments.reduce((acc: Record<string, number>, p: { date: string; amount: number; frequency: number; annualized: number }) => {
    const source = (p as any).frequencySource || 'unknown';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (Object.keys(freqSourceCounts).length > 0) {
    console.log(`\nFrequency Source: ${JSON.stringify(freqSourceCounts)}`);
  }
  console.log(`${'='.repeat(80)}\n`);
}

async function verifyDVI(tickers: string[]) {
  console.log('DVI Verification - Detailed Calculation Output\n');
  console.log('Formula: DVI = (SD / MEDIAN) × 100');
  console.log('  - SD = Population Standard Deviation of annualized amounts');
  console.log('  - MEDIAN = Median of annualized amounts');
  console.log('  - Uses ALL payments within 365-day period\n');

  for (const ticker of tickers) {
    try {
      console.log(`\nProcessing ${ticker}...`);

      // Get dividend history (2 years to ensure we have enough data)
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const startDate = twoYearsAgo.toISOString().split('T')[0];

      const dividends = await getDividendHistory(ticker.toUpperCase(), startDate);

      // Calculate DVI with detailed breakdown
      const volMetrics = calculateDividendVolatility(dividends, 12, ticker.toUpperCase());

      if (volMetrics.calculationDetails) {
        formatSpreadsheetOutput(ticker, volMetrics);
      } else {
        console.log(`\n${ticker}: Calculation details not available`);
        console.log(`  DVI: ${volMetrics.dividendCVPercent?.toFixed(2) ?? 'N/A'}%`);
      }
    } catch (error) {
      console.error(`\nError processing ${ticker}:`, error);
    }
  }
}

// Main execution
const tickers = process.argv.slice(2);

if (tickers.length === 0) {
  console.log('Usage: npx tsx scripts/dvi_verification.ts TICKER1 TICKER2 ...');
  console.log('Example: npx tsx scripts/dvi_verification.ts GOOY TSLY QQQI');
  process.exit(1);
}

verifyDVI(tickers).catch(console.error);

