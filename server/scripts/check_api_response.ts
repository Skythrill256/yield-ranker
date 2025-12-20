/**
 * Simple script to check API response for a CEF
 * This calls the actual API endpoint to see what data is returned
 * Run with: npx tsx scripts/check_api_response.ts BTO
 */

interface CEFResponse {
  symbol?: string;
  navSymbol?: string | null;
  fiveYearZScore?: number | null;
  navTrend6M?: number | null;
  navTrend12M?: number | null;
  signal?: number | null;
  return15Yr?: number | null;
  return10Yr?: number | null;
  return5Yr?: number | null;
  return3Yr?: number | null;
  return12Mo?: number | null;
  [key: string]: any;
}

const ticker = process.argv[2] || 'BTO';
const API_URL = process.env.API_URL || 'http://localhost:8080';

async function checkAPIResponse() {
  console.log(`\n=== Checking API Response for ${ticker} ===\n`);
  console.log(`API URL: ${API_URL}\n`);

  try {
    const response = await fetch(`${API_URL}/api/cefs/${ticker}`);
    
    if (!response.ok) {
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(`Response: ${text}`);
      return;
    }

    const data = await response.json() as CEFResponse;
    
    console.log('✅ API Response received\n');
    console.log('--- Key Metrics ---');
    console.log(`Symbol: ${data.symbol}`);
    console.log(`NAV Symbol: ${data.navSymbol || 'N/A'}`);
    console.log(`Z-Score: ${data.fiveYearZScore !== null ? data.fiveYearZScore.toFixed(2) : 'N/A'}`);
    console.log(`6M NAV Trend: ${data.navTrend6M !== null ? `${data.navTrend6M.toFixed(2)}%` : 'N/A'}`);
    console.log(`12M NAV Trend: ${data.navTrend12M !== null ? `${data.navTrend12M.toFixed(2)}%` : 'N/A'}`);
    console.log(`Signal: ${data.signal !== null ? data.signal : 'N/A'}`);
    
    console.log('\n--- Total Returns ---');
    console.log(`15Y Return: ${data.return15Yr !== null ? `${data.return15Yr.toFixed(2)}%` : 'N/A'}`);
    console.log(`10Y Return: ${data.return10Yr !== null ? `${data.return10Yr.toFixed(2)}%` : 'N/A'}`);
    console.log(`5Y Return: ${data.return5Yr !== null ? `${data.return5Yr.toFixed(2)}%` : 'N/A'}`);
    console.log(`3Y Return: ${data.return3Yr !== null ? `${data.return3Yr.toFixed(2)}%` : 'N/A'}`);
    console.log(`12Mo Return: ${data.return12Mo !== null ? `${data.return12Mo.toFixed(2)}%` : 'N/A'}`);
    
    console.log('\n--- Diagnosis ---');
    if (data.signal === null) {
      console.log('⚠️  Signal is N/A. Reasons:');
      if (!data.navSymbol) console.log('   - Missing NAV symbol');
      if (data.fiveYearZScore === null) console.log('   - Missing Z-Score');
      if (data.navTrend6M === null) console.log('   - Missing 6M NAV Trend');
      if (data.navTrend12M === null) console.log('   - Missing 12M NAV Trend');
    }
    
    if (data.return15Yr === null && data.return10Yr === null && data.return5Yr === null && data.return3Yr === null) {
      console.log('⚠️  All long-term returns are N/A. Possible reasons:');
      console.log('   - NAV symbol missing or incorrect');
      console.log('   - Insufficient historical data in Tiingo');
      console.log('   - Fund is too new (< 3 years old)');
    }
    
    console.log('\n=== Complete ===\n');
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    console.error('\nMake sure the server is running on', API_URL);
  }
}

checkAPIResponse();

