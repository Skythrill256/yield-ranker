/**
 * Test DVI Calculation for TSLY
 * 
 * This script tests the DVI calculation to match the spreadsheet values:
 * - SD for ANNUALIZED: 14.37
 * - Average for ANNUALIZED: 36.20
 * - CV (DVI): 39.70%
 */

import { calculateDividendVolatility } from '../src/services/metrics.js';
import { getDividendHistory } from '../src/services/database.js';
import { logger } from '../src/utils/index.js';

async function testTSLYDVI() {
  const ticker = 'TSLY';
  
  logger.info('Test', `Testing DVI calculation for ${ticker}`);
  
  // Get last 12 months of dividends
  const dividends = await getDividendHistory(ticker, undefined);
  
  if (dividends.length === 0) {
    logger.error('Test', `No dividends found for ${ticker}`);
    return;
  }
  
  logger.info('Test', `Found ${dividends.length} total dividend records`);
  
  // Calculate DVI
  const result = calculateDividendVolatility(dividends, 12, ticker);
  
  if (!result) {
    logger.error('Test', 'DVI calculation returned null');
    return;
  }
  
  logger.info('Test', '=== DVI Calculation Results ===');
  logger.info('Test', `Data Points: ${result.dataPoints}`);
  logger.info('Test', `Annual Dividend (Average): ${result.annualDividend?.toFixed(2)}`);
  logger.info('Test', `Standard Deviation: ${result.dividendSD?.toFixed(2)}`);
  logger.info('Test', `CV (DVI): ${result.dividendCVPercent?.toFixed(2)}%`);
  logger.info('Test', `Volatility Index: ${result.volatilityIndex}`);
  
  if (result.calculationDetails) {
    logger.info('Test', '\n=== Calculation Details ===');
    logger.info('Test', `Period: ${result.calculationDetails.periodStart} to ${result.calculationDetails.periodEnd}`);
    logger.info('Test', `Mean: ${result.calculationDetails.mean.toFixed(2)}`);
    logger.info('Test', `SD: ${result.calculationDetails.standardDeviation.toFixed(2)}`);
    logger.info('Test', `Variance: ${result.calculationDetails.variance.toFixed(2)}`);
    
    logger.info('Test', '\n=== First 10 Payments ===');
    result.calculationDetails.rawPayments.slice(0, 10).forEach((p, i) => {
      logger.info('Test', `${i + 1}. ${p.date}: $${p.amount.toFixed(4)} × ${p.frequency} = $${p.annualized.toFixed(2)}`);
    });
    
    logger.info('Test', '\n=== Last 10 Payments ===');
    result.calculationDetails.rawPayments.slice(-10).forEach((p, i) => {
      const idx = result.calculationDetails!.rawPayments.length - 10 + i + 1;
      logger.info('Test', `${idx}. ${p.date}: $${p.amount.toFixed(4)} × ${p.frequency} = $${p.annualized.toFixed(2)}`);
    });
  }
  
  // Expected values from spreadsheet
  const expectedSD = 14.37;
  const expectedAvg = 36.20;
  const expectedCV = 39.70;
  
  logger.info('Test', '\n=== Comparison with Spreadsheet ===');
  logger.info('Test', `Expected SD: ${expectedSD}, Got: ${result.dividendSD?.toFixed(2)}, Diff: ${Math.abs((result.dividendSD || 0) - expectedSD).toFixed(2)}`);
  logger.info('Test', `Expected Avg: ${expectedAvg}, Got: ${result.annualDividend?.toFixed(2)}, Diff: ${Math.abs((result.annualDividend || 0) - expectedAvg).toFixed(2)}`);
  logger.info('Test', `Expected CV: ${expectedCV}%, Got: ${result.dividendCVPercent?.toFixed(2)}%, Diff: ${Math.abs((result.dividendCVPercent || 0) - expectedCV).toFixed(2)}%`);
  
  const sdMatch = Math.abs((result.dividendSD || 0) - expectedSD) < 0.5;
  const avgMatch = Math.abs((result.annualDividend || 0) - expectedAvg) < 0.5;
  const cvMatch = Math.abs((result.dividendCVPercent || 0) - expectedCV) < 1.0;
  
  if (sdMatch && avgMatch && cvMatch) {
    logger.info('Test', '✅ Calculation matches spreadsheet!');
  } else {
    logger.warn('Test', '⚠️  Calculation does not match spreadsheet. Review frequency detection and data.');
  }
}

testTSLYDVI().catch(console.error);

