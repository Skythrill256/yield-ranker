/**
 * DVI Calculation Breakdown Script
 * 
 * This script provides a detailed breakdown of the DVI calculation process
 * for both TSLY and GOOY to show exactly how we arrive at the percentages.
 */

import { calculateDividendVolatility } from '../src/services/metrics.js';
import { getDividendHistory } from '../src/services/database.js';
import { logger } from '../src/utils/index.js';

interface CalculationBreakdown {
  ticker: string;
  period: string;
  dividends: Array<{
    date: string;
    adjDiv: number;
    frequency: number;
    annualized: number;
  }>;
  stats: {
    mean: number;
    sd: number;
    cv: number;
    cvPercent: number;
  };
  expectedCV?: number;
}

async function calculateBreakdown(ticker: string, expectedCV?: number): Promise<CalculationBreakdown> {
  logger.info('Breakdown', `\n${'='.repeat(80)}`);
  logger.info('Breakdown', `DVI CALCULATION BREAKDOWN FOR ${ticker}`);
  logger.info('Breakdown', `${'='.repeat(80)}\n`);
  
  const dividends = await getDividendHistory(ticker, undefined);
  
  if (dividends.length === 0) {
    logger.error('Breakdown', `No dividends found for ${ticker}`);
    throw new Error(`No dividends found for ${ticker}`);
  }
  
  logger.info('Breakdown', `Found ${dividends.length} total dividend records`);
  
  const result = calculateDividendVolatility(dividends, 12, ticker);
  
  if (!result || !result.calculationDetails) {
    logger.error('Breakdown', 'Calculation returned no details');
    throw new Error('Calculation failed');
  }
  
  const details = result.calculationDetails;
  
  logger.info('Breakdown', `\nSTEP 1: DATA COLLECTION`);
  logger.info('Breakdown', `Period: ${details.periodStart} to ${details.periodEnd} (12 months)`);
  logger.info('Breakdown', `Total dividends in period: ${details.rawPayments.length}`);
  
  logger.info('Breakdown', `\nSTEP 2: FREQUENCY DETECTION & ANNUALIZATION`);
  logger.info('Breakdown', `For each dividend, we detect frequency and annualize:`);
  logger.info('Breakdown', `  - Weekly payments: multiply by 52`);
  logger.info('Breakdown', `  - Monthly payments: multiply by 12`);
  logger.info('Breakdown', `  - Quarterly payments: multiply by 4`);
  logger.info('Breakdown', `\nDividend Details:`);
  
  const breakdownDividends = details.rawPayments.map(p => ({
    date: p.date,
    adjDiv: p.amount,
    frequency: p.frequency,
    annualized: p.annualized,
  }));
  
  breakdownDividends.forEach((div, i) => {
    logger.info('Breakdown', `  ${i + 1}. ${div.date}: $${div.adjDiv.toFixed(4)} × ${div.frequency} = $${div.annualized.toFixed(2)}`);
  });
  
  logger.info('Breakdown', `\nSTEP 3: CALCULATE STATISTICS ON ANNUALIZED AMOUNTS`);
  logger.info('Breakdown', `We calculate Mean (Average) and Standard Deviation on the annualized amounts:`);
  logger.info('Breakdown', `  Mean (Average): $${details.mean.toFixed(2)}`);
  logger.info('Breakdown', `  Standard Deviation: $${details.standardDeviation.toFixed(2)}`);
  logger.info('Breakdown', `  Variance: ${details.variance.toFixed(2)}`);
  
  logger.info('Breakdown', `\nSTEP 4: CALCULATE COEFFICIENT OF VARIATION (CV)`);
  logger.info('Breakdown', `CV = (Standard Deviation / Mean) × 100`);
  logger.info('Breakdown', `CV = ($${details.standardDeviation.toFixed(2)} / $${details.mean.toFixed(2)}) × 100`);
  logger.info('Breakdown', `CV = ${result.dividendCVPercent?.toFixed(2)}%`);
  
  logger.info('Breakdown', `\n${'='.repeat(80)}`);
  logger.info('Breakdown', `FINAL RESULT FOR ${ticker}:`);
  logger.info('Breakdown', `  DVI (CV%): ${result.dividendCVPercent?.toFixed(2)}%`);
  if (expectedCV !== undefined) {
    const diff = Math.abs((result.dividendCVPercent || 0) - expectedCV);
    logger.info('Breakdown', `  Expected: ${expectedCV.toFixed(2)}%`);
    logger.info('Breakdown', `  Difference: ${diff.toFixed(2)}%`);
    if (diff < 0.5) {
      logger.info('Breakdown', `  ✅ MATCHES EXPECTED VALUE`);
    } else {
      logger.info('Breakdown', `  ⚠️  Does not match expected value`);
    }
  }
  logger.info('Breakdown', `${'='.repeat(80)}\n`);
  
  return {
    ticker,
    period: `${details.periodStart} to ${details.periodEnd}`,
    dividends: breakdownDividends,
    stats: {
      mean: details.mean,
      sd: details.standardDeviation,
      cv: result.dividendCV || 0,
      cvPercent: result.dividendCVPercent || 0,
    },
    expectedCV,
  };
}

async function main() {
  try {
    logger.info('Breakdown', 'Starting DVI calculation breakdown...\n');
    
    const tslyBreakdown = await calculateBreakdown('TSLY', 39.70);
    const gooyBreakdown = await calculateBreakdown('GOOY', 47.1);
    
    logger.info('Breakdown', '\n' + '='.repeat(80));
    logger.info('Breakdown', 'SUMMARY COMPARISON');
    logger.info('Breakdown', '='.repeat(80));
    logger.info('Breakdown', `TSLY: ${tslyBreakdown.stats.cvPercent.toFixed(2)}% (Expected: 39.70%)`);
    logger.info('Breakdown', `GOOY: ${gooyBreakdown.stats.cvPercent.toFixed(2)}% (Expected: 47.1%)`);
    logger.info('Breakdown', '='.repeat(80));
    
    logger.info('Breakdown', '\n✅ Both calculations use the same automated process:');
    logger.info('Breakdown', '  1. Collect adjusted dividends from last 12 months');
    logger.info('Breakdown', '  2. Automatically detect frequency (52 for weekly, 12 for monthly, 4 for quarterly)');
    logger.info('Breakdown', '  3. Annualize each payment (Adj Div × Frequency)');
    logger.info('Breakdown', '  4. Calculate Mean and SD on annualized amounts');
    logger.info('Breakdown', '  5. Calculate CV = (SD / Mean) × 100');
    logger.info('Breakdown', '\nThe same calculation method works automatically for all ETFs!');
    
  } catch (error) {
    logger.error('Breakdown', `Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

main().catch(console.error);




