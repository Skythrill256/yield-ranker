/**
 * Test API call to check Signal and NAV returns
 */

const API_URL = process.env.API_URL || 'http://localhost:8080';
const TICKER = process.argv[2] || 'BTO';

async function testAPI() {
  console.log(`\n=== Testing API for ${TICKER} ===\n`);
  console.log(`API URL: ${API_URL}\n`);

  try {
    console.log('Making API call...\n');
    const response = await fetch(`${API_URL}/api/cefs/${TICKER}`);
    
    if (!response.ok) {
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(`Response: ${text}`);
      return;
    }

    const data = await response.json();
    
    console.log('✅ API Response received\n');
    console.log('=== KEY METRICS ===');
    console.log(`Symbol: ${data.symbol}`);
    console.log(`NAV Symbol: ${data.navSymbol || 'N/A'}`);
    console.log(`Z-Score: ${data.fiveYearZScore !== null ? data.fiveYearZScore.toFixed(2) : 'N/A'}`);
    console.log(`6M NAV Trend: ${data.navTrend6M !== null ? `${data.navTrend6M.toFixed(2)}%` : 'N/A'}`);
    console.log(`12M NAV Trend: ${data.navTrend12M !== null ? `${data.navTrend12M.toFixed(2)}%` : 'N/A'}`);
    console.log(`Signal: ${data.signal !== null ? data.signal : 'N/A'}`);
    
    console.log('\n=== TOTAL RETURNS ===');
    console.log(`15Y Return: ${data.return15Yr !== null ? `${data.return15Yr.toFixed(2)}%` : 'N/A'}`);
    console.log(`10Y Return: ${data.return10Yr !== null ? `${data.return10Yr.toFixed(2)}%` : 'N/A'}`);
    console.log(`5Y Return: ${data.return5Yr !== null ? `${data.return5Yr.toFixed(2)}%` : 'N/A'}`);
    console.log(`3Y Return: ${data.return3Yr !== null ? `${data.return3Yr.toFixed(2)}%` : 'N/A'}`);
    console.log(`12Mo Return: ${data.return12Mo !== null ? `${data.return12Mo.toFixed(2)}%` : 'N/A'}`);
    
    console.log('\n=== DIAGNOSIS ===');
    if (data.signal === null) {
      console.log('⚠️  Signal is N/A. Possible reasons:');
      if (!data.navSymbol) console.log('   - Missing NAV symbol');
      if (data.fiveYearZScore === null) console.log('   - Missing Z-Score');
      if (data.navTrend6M === null) console.log('   - Missing 6M NAV Trend');
      if (data.navTrend12M === null) console.log('   - Missing 12M NAV Trend');
      console.log('   - Check server logs for detailed reason');
    } else {
      console.log(`✅ Signal calculated: ${data.signal}`);
    }
    
    const longTermReturns = [data.return15Yr, data.return10Yr, data.return5Yr, data.return3Yr];
    const hasAnyLongTerm = longTermReturns.some(r => r !== null);
    
    if (!hasAnyLongTerm) {
      console.log('\n⚠️  All long-term returns (3Y, 5Y, 10Y, 15Y) are N/A. Possible reasons:');
      console.log('   - NAV symbol missing or incorrect');
      console.log('   - Insufficient historical data in Tiingo');
      console.log('   - Fund is too new (< 3 years old)');
      console.log('   - Check server logs for detailed reason');
    } else {
      console.log('\n✅ Some long-term returns calculated');
      if (data.return15Yr !== null) console.log(`   - 15Y: ${data.return15Yr.toFixed(2)}%`);
      if (data.return10Yr !== null) console.log(`   - 10Y: ${data.return10Yr.toFixed(2)}%`);
      if (data.return5Yr !== null) console.log(`   - 5Y: ${data.return5Yr.toFixed(2)}%`);
      if (data.return3Yr !== null) console.log(`   - 3Y: ${data.return3Yr.toFixed(2)}%`);
    }
    
    console.log('\n=== Test Complete ===\n');
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      console.error('\n⚠️  Server is not running or not accessible.');
      console.error('   Make sure the server is running on', API_URL);
      console.error('   Start it with: cd server && npm run dev');
    }
  }
}

testAPI();

