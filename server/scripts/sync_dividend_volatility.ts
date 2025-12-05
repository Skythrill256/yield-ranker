/**
 * Sync Dividend Volatility from FMP API
 * 
 * Fetches full dividend history from FMP's dedicated dividend endpoint
 * and calculates volatility (CV%) for all ETFs
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FMP_API_KEY = process.env.FMP_API_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Rate limiting
let lastRequestTime = 0;
const MIN_DELAY_MS = 200;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchFMPDividends(ticker: string): Promise<any[]> {
  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed);
  }
  lastRequestTime = Date.now();

  const url = `https://financialmodelingprep.com/stable/dividends?symbol=${ticker}&apikey=${FMP_API_KEY}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`  ${ticker}: Not found on FMP`);
        return [];
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as any[];
    // Filter to only records with dividends since 2020
    const since2020 = data.filter((d: any) => {
      const date = new Date(d.date);
      return date >= new Date('2020-01-01') && d.dividend && d.dividend > 0;
    });
    return since2020;
  } catch (error) {
    console.error(`  ${ticker}: Error - ${(error as Error).message}`);
    return [];
  }
}

function calculateVolatility(dividends: number[], isWeekly: boolean): { cv: number | null; sd: number | null } {
  if (dividends.length < 2) {
    return { cv: null, sd: null };
  }

  const n = dividends.length;
  const mean = dividends.reduce((a, b) => a + b, 0) / n;

  if (mean <= 0) {
    return { cv: null, sd: null };
  }

  // Sample standard deviation (n-1)
  const variance = dividends.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
  const sd = Math.sqrt(variance);

  // Coefficient of Variation (CV) = SD / Mean * 100
  let cv = (sd / mean) * 100;

  // Annualize for weekly payers to make comparable to monthly
  if (isWeekly) {
    cv = cv * Math.sqrt(52 / 12);
  }

  return {
    cv: Math.round(cv * 10) / 10,  // Round to 1 decimal
    sd: Math.round(sd * 10000) / 10000
  };
}

function getVolatilityIndex(cv: number | null): string | null {
  if (cv === null) return null;
  if (cv < 5) return 'Very Low';
  if (cv < 10) return 'Low';
  if (cv < 20) return 'Moderate';
  if (cv < 30) return 'High';
  return 'Very High';
}

function isWeeklyPayer(ticker: string): boolean {
  const weeklyTickers = ['TSLY', 'NVDY', 'MSTY', 'CONY', 'GOOY', 'AMZY', 'APLY', 'QQQY', 'IWMY', 'QDTE', 'XDTE', 'SDTY', 'QDTY', 'RDTY', 'YMAX', 'YMAG', 'ULTY', 'LFGY', 'YETH', 'RDTE', 'PLTW', 'TSLW', 'HOOW', 'GOOW', 'METW', 'AMZW', 'AMDW', 'AVGW', 'MSTW', 'NFLW', 'COIW', 'WPAY', 'XBTY', 'YBIT', 'HOOY', 'CVNY', 'PLTY', 'NVYY', 'CHPY', 'GPTY', 'MAGY', 'TQQY', 'TSYY', 'YSPY', 'AZYY', 'PLYY', 'AMYY', 'COYY', 'TSII', 'NVII', 'HOII', 'COII', 'PLTI', 'BRKW', 'MSFW'];
  return weeklyTickers.includes(ticker.toUpperCase()) || ticker.toUpperCase().endsWith('Y');
}

async function main() {
  console.log('Syncing dividend volatility from FMP API...\n');

  // Get all tickers
  const { data: tickers, error } = await supabase
    .from('etf_static')
    .select('ticker')
    .order('ticker');

  if (error || !tickers) {
    console.error('Failed to fetch tickers:', error);
    process.exit(1);
  }

  console.log(`Found ${tickers.length} tickers\n`);

  let successCount = 0;
  let failCount = 0;
  let noDataCount = 0;

  for (const { ticker } of tickers) {
    process.stdout.write(`Processing ${ticker}...`);

    // Fetch dividends from FMP
    const dividendRecords = await fetchFMPDividends(ticker);

    if (dividendRecords.length === 0) {
      // Try to use existing data from prices_daily
      const { data: existingDivs } = await supabase
        .from('prices_daily')
        .select('div_cash')
        .eq('ticker', ticker)
        .gt('div_cash', 0)
        .order('date', { ascending: false });

      if (!existingDivs || existingDivs.length < 2) {
        console.log(` No dividend data (need at least 2)`);
        noDataCount++;
        continue;
      }

      // Use existing data
      const amounts = existingDivs.map(d => d.div_cash);
      const isWeekly = isWeeklyPayer(ticker);
      const { cv, sd } = calculateVolatility(amounts, isWeekly);

      if (cv !== null) {
        const volatilityIndex = getVolatilityIndex(cv);

        await supabase
          .from('etf_static')
          .update({
            dividend_cv_percent: cv,
            dividend_cv: cv / 100,
            dividend_sd: sd,
            dividend_volatility_index: volatilityIndex,
            last_updated: new Date().toISOString(),
          })
          .eq('ticker', ticker);

        console.log(` CV=${cv}% (${volatilityIndex}) [${amounts.length} existing records]`);
        successCount++;
      } else {
        console.log(` Could not calculate CV`);
        failCount++;
      }
      continue;
    }

    // Extract dividend amounts (FMP uses 'dividend' field)
    const amounts = dividendRecords.map((d: any) => d.dividend);
    const isWeekly = isWeeklyPayer(ticker);

    // Calculate volatility
    const { cv, sd } = calculateVolatility(amounts, isWeekly);

    if (cv !== null) {
      const volatilityIndex = getVolatilityIndex(cv);

      // Update database
      await supabase
        .from('etf_static')
        .update({
          dividend_cv_percent: cv,
          dividend_cv: cv / 100,
          dividend_sd: sd,
          dividend_volatility_index: volatilityIndex,
          last_updated: new Date().toISOString(),
        })
        .eq('ticker', ticker);

      console.log(` CV=${cv}% (${volatilityIndex}) [${amounts.length} records]`);
      successCount++;
    } else {
      console.log(` Not enough data (${amounts.length} records)`);
      noDataCount++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Success: ${successCount}`);
  console.log(`No data: ${noDataCount}`);
  console.log(`Failed: ${failCount}`);
}

main().catch(console.error);
