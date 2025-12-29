/**
 * Test GOOY API endpoint to verify normalized_div values
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];

for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testGOOYAPI() {
  try {
    const response = await fetch(`${API_URL}/api/tiingo/dividends/GOOY?years=50`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    console.log('GOOY API Response - Recent dividends with normalized values:');
    console.log('='.repeat(80));
    
    const recentDividends = (data.dividends || []).slice(0, 10);
    for (const div of recentDividends) {
      console.log(`${div.exDate}: amount=${div.amount}, adjAmount=${div.adjAmount}, frequencyNum=${div.frequencyNum}, normalizedDiv=${div.normalizedDiv}`);
    }
    
    // Check specifically for December 25-26
    const decDiv = (data.dividends || []).find((d: any) => 
      d.exDate.includes('2025-12-25') || d.exDate.includes('2025-12-26')
    );
    
    if (decDiv) {
      console.log('\nDecember 25-26 dividend:');
      console.log(JSON.stringify(decDiv, null, 2));
    } else {
      console.log('\nNo December 25-26 dividend found in response');
    }
    
  } catch (error) {
    console.error('Error testing API:', error);
  }
}

testGOOYAPI();

