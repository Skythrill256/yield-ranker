/**
 * Test GAB Z-Score calculation to match CEO's manual calculation
 * 
 * CEO's calculation (from Excel):
 * - Current P/D on 12/26/2025: 8.11287478%
 * - Average P/D over 5 years: 7.066050684%
 * - STDEV.P: 6.154238319%
 * - Z-Score: (8.11287478 - 7.066050684) / 6.154238319 = 0.170098076
 * 
 * Data source: Tiingo
 * - GAB market price
 * - XGABX NAV
 * - Start date: 2020-01-01
 * - Use UNADJUSTED prices (close, not adj_close)
 */

import { getPriceHistory } from '../src/services/database.js';
import { formatDate } from '../src/utils/index.js';

async function testGABZScore() {
  console.log('='.repeat(80));
  console.log('Testing GAB Z-Score Calculation');
  console.log('='.repeat(80));
  console.log('');
  
  const ticker = 'GAB';
  const navSymbol = 'XGABX';
  const startDate = '2020-01-01';
  const endDate = formatDate(new Date());
  const DAYS_5Y = 5 * 252; // 1260 trading days
  
  console.log(`Ticker: ${ticker}`);
  console.log(`NAV Symbol: ${navSymbol}`);
  console.log(`Date Range: ${startDate} to ${endDate}`);
  console.log(`Max Lookback: ${DAYS_5Y} trading days (5 years)`);
  console.log('');
  
  try {
    // Fetch price data
    console.log('Fetching price data...');
    const [priceData, navData] = await Promise.all([
      getPriceHistory(ticker, startDate, endDate),
      getPriceHistory(navSymbol, startDate, endDate),
    ]);
    
    console.log(`GAB price records: ${priceData.length}`);
    console.log(`XGABX NAV records: ${navData.length}`);
    console.log('');
    
    // Create maps using UNADJUSTED prices (p.close)
    const priceMap = new Map<string, number>();
    priceData.forEach((p: any) => {
      const price = p.close ?? null;
      if (price !== null && price > 0) {
        priceMap.set(p.date, price);
      }
    });
    
    const navMap = new Map<string, number>();
    navData.forEach((p: any) => {
      const nav = p.close ?? null;
      if (nav !== null && nav > 0) {
        navMap.set(p.date, nav);
      }
    });
    
    // Calculate daily premium/discount: (Price / NAV) - 1
    const discounts: number[] = [];
    const allDates = new Set([...priceMap.keys(), ...navMap.keys()]);
    const sortedDates = Array.from(allDates).sort();
    
    for (const date of sortedDates) {
      const price = priceMap.get(date);
      const nav = navMap.get(date);
      if (price && nav && nav > 0) {
        const discount = (price / nav - 1.0) * 100; // Convert to percentage
        discounts.push(discount);
      }
    }
    
    console.log(`Total days with both price and NAV: ${discounts.length}`);
    
    // Use up to 5 years (most recent)
    const lookbackPeriod = Math.min(discounts.length, DAYS_5Y);
    const history = discounts.slice(-lookbackPeriod);
    
    console.log(`Using last ${lookbackPeriod} days (most recent 5 years)`);
    console.log('');
    
    // Calculate current P/D (most recent date)
    const sortedDatesArray = Array.from(sortedDates).sort().reverse();
    let currentPD: number | null = null;
    let currentDate: string | null = null;
    for (const date of sortedDatesArray) {
      const price = priceMap.get(date);
      const nav = navMap.get(date);
      if (price && nav && nav > 0) {
        currentPD = (price / nav - 1.0) * 100; // Convert to percentage
        currentDate = date;
        break;
      }
    }
    
    console.log(`Current Date: ${currentDate}`);
    console.log(`Current P/D: ${currentPD?.toFixed(8)}%`);
    console.log('');
    
    // Calculate average (mean)
    const avgPD = history.reduce((sum, d) => sum + d, 0) / history.length;
    console.log(`Average P/D (5 years): ${avgPD.toFixed(8)}%`);
    
    // Calculate variance using POPULATION standard deviation (divide by n, not n-1)
    const variance = history.reduce((sum, d) => sum + Math.pow(d - avgPD, 2), 0) / history.length;
    const stdDev = Math.sqrt(variance);
    console.log(`STDEV.P: ${stdDev.toFixed(8)}%`);
    console.log('');
    
    // Calculate Z-Score
    if (currentPD !== null && stdDev > 0) {
      const zScore = (currentPD - avgPD) / stdDev;
      console.log('Z-Score Calculation:');
      console.log(`  Z = (Current - Average) / StdDev`);
      console.log(`  Z = (${currentPD.toFixed(8)} - ${avgPD.toFixed(8)}) / ${stdDev.toFixed(8)}`);
      console.log(`  Z = ${(currentPD - avgPD).toFixed(8)} / ${stdDev.toFixed(8)}`);
      console.log(`  Z = ${zScore.toFixed(8)}`);
      console.log('');
      
      // Compare with CEO's expected values
      const expectedCurrentPD = 8.11287478;
      const expectedAvgPD = 7.066050684;
      const expectedStdDev = 6.154238319;
      const expectedZScore = 0.170098076;
      
      console.log('Comparison with CEO\'s Calculation:');
      console.log(`  Current P/D:`);
      console.log(`    Expected: ${expectedCurrentPD.toFixed(8)}%`);
      console.log(`    Actual:   ${currentPD.toFixed(8)}%`);
      console.log(`    Diff:     ${Math.abs(currentPD - expectedCurrentPD).toFixed(8)}%`);
      console.log('');
      console.log(`  Average P/D:`);
      console.log(`    Expected: ${expectedAvgPD.toFixed(8)}%`);
      console.log(`    Actual:   ${avgPD.toFixed(8)}%`);
      console.log(`    Diff:     ${Math.abs(avgPD - expectedAvgPD).toFixed(8)}%`);
      console.log('');
      console.log(`  STDEV.P:`);
      console.log(`    Expected: ${expectedStdDev.toFixed(8)}%`);
      console.log(`    Actual:   ${stdDev.toFixed(8)}%`);
      console.log(`    Diff:     ${Math.abs(stdDev - expectedStdDev).toFixed(8)}%`);
      console.log('');
      console.log(`  Z-Score:`);
      console.log(`    Expected: ${expectedZScore.toFixed(8)}`);
      console.log(`    Actual:   ${zScore.toFixed(8)}`);
      console.log(`    Diff:     ${Math.abs(zScore - expectedZScore).toFixed(8)}`);
      console.log('');
      
      // Show first and last few dates in history
      console.log('Sample dates in 5-year history:');
      const dateDiscountPairs: Array<{ date: string; pd: number }> = [];
      for (const date of sortedDates) {
        const price = priceMap.get(date);
        const nav = navMap.get(date);
        if (price && nav && nav > 0) {
          const pd = (price / nav - 1.0) * 100;
          dateDiscountPairs.push({ date, pd });
        }
      }
      dateDiscountPairs.sort((a, b) => a.date.localeCompare(b.date));
      const last5Years = dateDiscountPairs.slice(-lookbackPeriod);
      
      console.log(`  First date: ${last5Years[0].date}, P/D: ${last5Years[0].pd.toFixed(8)}%`);
      console.log(`  Last date:  ${last5Years[last5Years.length - 1].date}, P/D: ${last5Years[last5Years.length - 1].pd.toFixed(8)}%`);
      console.log(`  Total days: ${last5Years.length}`);
      
    } else {
      console.log('ERROR: Could not calculate Z-Score');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testGABZScore().catch(console.error);

