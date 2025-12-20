/**
 * Quick test to verify LOOKBACK_DAYS is set correctly
 */

const LOOKBACK_DAYS = 5475; // 15 years
const DIVIDEND_LOOKBACK_DAYS = 5475;

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

console.log('='.repeat(60));
console.log('LOOKBACK DAYS VERIFICATION');
console.log('='.repeat(60));
console.log(`LOOKBACK_DAYS constant: ${LOOKBACK_DAYS}`);
console.log(`Expected: 5475 (15 years)`);
console.log(`Match: ${LOOKBACK_DAYS === 5475 ? '✅ YES' : '❌ NO'}`);
console.log(`Years: ${Math.round(LOOKBACK_DAYS / 365)}`);
console.log('');

const priceStartDate = getDateDaysAgo(LOOKBACK_DAYS);
const today = new Date().toISOString().split('T')[0];

console.log(`Date Range Calculation:`);
console.log(`  Start Date: ${priceStartDate}`);
console.log(`  End Date: ${today}`);

// Calculate actual years
const startDateObj = new Date(priceStartDate);
const endDateObj = new Date(today);
const actualDays = Math.round((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
const actualYears = actualDays / 365;

console.log(`  Actual Days: ${actualDays}`);
console.log(`  Actual Years: ${actualYears.toFixed(1)}`);
console.log(`  Expected Years: 15.0`);
console.log(`  Match: ${Math.abs(actualYears - 15) < 0.5 ? '✅ YES' : '❌ NO'}`);
console.log('='.repeat(60));

