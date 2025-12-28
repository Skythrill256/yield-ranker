/**
 * Test GAB Z-Score calculation to match CEO's exact 3-year calculation
 * 
 * CEO's expected values:
 * - CUR P/D: 8.112875% (0.08112875 decimal)
 * - AVERAGE: 4.512254594% (0.04512254594 decimal)
 * - STDEV.P: 3.897118818% (0.03897118818 decimal)
 * - 3 YR Z-Score: 0.92391856
 * 
 * Date range: 12/28/2022 to 12/26/2025 (3 years)
 */

import { getPriceHistory } from '../src/services/database.js';
import { formatDate } from '../src/utils/index.js';
import { calculateCEFZScore } from '../src/routes/cefs.js';

async function testGABZScoreExact() {
  console.log('='.repeat(80));
  console.log('Testing GAB Z-Score Calculation (Exact 3-Year Match)');
  console.log('='.repeat(80));
  console.log('');
  
  const ticker = 'GAB';
  const navSymbol = 'XGABX';
  const EXPECTED_ZSCORE = 0.92391856;
  const EXPECTED_CURRENT_PD_PCT = 8.112875;
  const EXPECTED_AVG_PCT = 4.512254594;
  const EXPECTED_STDDEV_PCT = 3.897118818;
  
  // 3-year date range: 12/28/2022 to 12/26/2025
  const startDate = new Date('2022-12-28');
  const endDate = new Date('2025-12-26');
  const startDateStr = formatDate(startDate);
  const endDateStr = formatDate(endDate);
  
  console.log(`Ticker: ${ticker}`);
  console.log(`NAV Symbol: ${navSymbol}`);
  console.log(`Date Range: ${startDateStr} to ${endDateStr}`);
  console.log(`Expected Z-Score: ${EXPECTED_ZSCORE}`);
  console.log('');
  
  try {
    // Fetch price data from database first
    console.log('Fetching price data from database...');
    let [priceData, navData] = await Promise.all([
      getPriceHistory(ticker, startDateStr, endDateStr),
      getPriceHistory(navSymbol, startDateStr, endDateStr),
    ]);
    
    // Check if data is stale and fetch from API if needed
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const minDateStr = formatDate(sevenDaysAgo);
    
    const priceDataIsCurrent = priceData.length > 0 && priceData[priceData.length - 1].date >= minDateStr;
    const navDataIsCurrent = navData.length > 0 && navData[navData.length - 1].date >= minDateStr;
    
    if (!priceDataIsCurrent || priceData.length === 0) {
      console.log('Database data is stale for GAB, fetching from API...');
      try {
        const { getPriceHistoryFromAPI } = await import('../src/services/tiingo.js');
        const apiData = await getPriceHistoryFromAPI(ticker, startDateStr, endDateStr);
        if (apiData.length > 0) {
          priceData = apiData;
          console.log(`✓ Fetched ${priceData.length} fresh records from API for ${ticker}`);
        }
      } catch (apiError) {
        console.warn(`⚠ API fetch failed for ${ticker}: ${(apiError as Error).message}`);
      }
    }
    
    if (!navDataIsCurrent || navData.length === 0) {
      console.log('Database data is stale for XGABX, fetching from API...');
      try {
        const { getPriceHistoryFromAPI } = await import('../src/services/tiingo.js');
        const apiData = await getPriceHistoryFromAPI(navSymbol, startDateStr, endDateStr);
        if (apiData.length > 0) {
          navData = apiData;
          console.log(`✓ Fetched ${navData.length} fresh records from API for ${navSymbol}`);
        }
      } catch (apiError) {
        console.warn(`⚠ API fetch failed for ${navSymbol}: ${(apiError as Error).message}`);
      }
    }
    
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
    
    // Calculate daily premium/discount: (Price / NAV) - 1 (as decimal)
    const discounts: number[] = [];
    const allDates = new Set([...priceMap.keys(), ...navMap.keys()]);
    const sortedDates = Array.from(allDates).sort();
    
    // Filter to exact date range
    const filteredDates = sortedDates.filter(date => {
      return date >= startDateStr && date <= endDateStr;
    });
    
    for (const date of filteredDates) {
      const price = priceMap.get(date);
      const nav = navMap.get(date);
      if (price && nav && nav > 0) {
        const discount = price / nav - 1.0; // Decimal
        discounts.push(discount);
      }
    }
    
    console.log(`Total days with both price and NAV in range: ${discounts.length}`);
    
    if (discounts.length === 0) {
      console.log('ERROR: No data found in date range');
      return;
    }
    
    // Calculate current P/D (most recent date)
    const sortedDatesArray = Array.from(filteredDates).sort().reverse();
    let currentDiscount: number | null = null;
    let currentDate: string | null = null;
    for (const date of sortedDatesArray) {
      const price = priceMap.get(date);
      const nav = navMap.get(date);
      if (price && nav && nav > 0) {
        currentDiscount = price / nav - 1.0;
        currentDate = date;
        break;
      }
    }
    
    if (currentDiscount === null) {
      currentDiscount = discounts[discounts.length - 1];
    }
    
    console.log(`Current Date: ${currentDate}`);
    console.log(`Current P/D (decimal): ${currentDiscount.toFixed(8)}`);
    console.log(`Current P/D (%): ${(currentDiscount * 100).toFixed(8)}%`);
    console.log(`Expected Current P/D (%): ${EXPECTED_CURRENT_PD_PCT.toFixed(8)}%`);
    console.log(`Difference: ${Math.abs((currentDiscount * 100) - EXPECTED_CURRENT_PD_PCT).toFixed(8)}%`);
    console.log('');
    
    // Calculate average (mean) - using ALL discounts in the 3-year range
    const avgDiscount = discounts.reduce((sum, d) => sum + d, 0) / discounts.length;
    console.log(`Average P/D (decimal): ${avgDiscount.toFixed(10)}`);
    console.log(`Average P/D (%): ${(avgDiscount * 100).toFixed(10)}%`);
    console.log(`Expected Average (%): ${EXPECTED_AVG_PCT.toFixed(10)}%`);
    console.log(`Difference: ${Math.abs((avgDiscount * 100) - EXPECTED_AVG_PCT).toFixed(10)}%`);
    console.log('');
    
    // Calculate variance using POPULATION standard deviation (divide by n, not n-1)
    const variance = discounts.reduce((sum, d) => sum + Math.pow(d - avgDiscount, 2), 0) / discounts.length;
    const stdDev = Math.sqrt(variance);
    console.log(`STDEV.P (decimal): ${stdDev.toFixed(10)}`);
    console.log(`STDEV.P (%): ${(stdDev * 100).toFixed(10)}%`);
    console.log(`Expected STDEV.P (%): ${EXPECTED_STDDEV_PCT.toFixed(10)}%`);
    console.log(`Difference: ${Math.abs((stdDev * 100) - EXPECTED_STDDEV_PCT).toFixed(10)}%`);
    console.log('');
    
    // Calculate Z-Score
    if (currentDiscount !== null && stdDev > 0) {
      const zScore = (currentDiscount - avgDiscount) / stdDev;
      console.log('Z-Score Calculation:');
      console.log(`  Z = (Current - Average) / StdDev`);
      console.log(`  Z = (${currentDiscount.toFixed(10)} - ${avgDiscount.toFixed(10)}) / ${stdDev.toFixed(10)}`);
      console.log(`  Z = ${(currentDiscount - avgDiscount).toFixed(10)} / ${stdDev.toFixed(10)}`);
      console.log(`  Z = ${zScore.toFixed(10)}`);
      console.log('');
      
      console.log('Comparison with CEO\'s Expected Values:');
      console.log(`  Z-Score:`);
      console.log(`    Expected: ${EXPECTED_ZSCORE.toFixed(8)}`);
      console.log(`    Actual:   ${zScore.toFixed(8)}`);
      console.log(`    Diff:     ${Math.abs(zScore - EXPECTED_ZSCORE).toFixed(8)}`);
      console.log(`    Match:    ${Math.abs(zScore - EXPECTED_ZSCORE) < 0.001 ? '✅ YES' : '❌ NO'}`);
      console.log('');
      
      // Test the actual calculateCEFZScore function
      console.log('='.repeat(80));
      console.log('Testing calculateCEFZScore Function');
      console.log('='.repeat(80));
      console.log('');
      
      const functionZScore = await calculateCEFZScore(ticker, navSymbol);
      if (functionZScore !== null) {
        console.log(`Function Z-Score: ${functionZScore.toFixed(8)}`);
        console.log(`Manual Z-Score:   ${zScore.toFixed(8)}`);
        console.log(`Expected Z-Score: ${EXPECTED_ZSCORE.toFixed(8)}`);
        console.log(`Difference (Function vs Expected): ${Math.abs(functionZScore - EXPECTED_ZSCORE).toFixed(8)}`);
        console.log(`Match: ${Math.abs(functionZScore - EXPECTED_ZSCORE) < 0.001 ? '✅ YES' : '❌ NO'}`);
      } else {
        console.log('Function returned null');
      }
      
    } else {
      console.log('ERROR: Could not calculate Z-Score');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testGABZScoreExact().catch(console.error);

