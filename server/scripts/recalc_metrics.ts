/**
 * Quick script to recalculate metrics for all ETFs using existing price data
 * No Tiingo API calls - just recalculates from database
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { calculateMetrics } from '../src/services/metrics.js';
import { batchUpdateETFMetrics } from '../src/services/database.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const isWeeklyPayer = (ticker: string): boolean => {
  const weeklyTickers = ['TSLY','NVDY','MSTY','CONY','GOOY','AMZY','APLY','QQQY','IWMY','QDTE','XDTE','SDTY','QDTY','RDTY','YMAX','YMAG','ULTY','LFGY','YETH','RDTE','PLTW','TSLW','HOOW','GOOW','METW','AMZW','AMDW','AVGW','MSTW','NFLW','COIW','WPAY','XBTY','YBIT','HOOY','CVNY','PLTY','NVYY','CHPY','GPTY','MAGY','TQQY','TSYY','YSPY','AZYY','PLYY','AMYY','COYY','TSII','NVII','HOII','COII','PLTI','BRKW','MSFW'];
  return weeklyTickers.includes(ticker) || ticker.endsWith('Y');
};

const calculateDividendMetrics = (payouts: number[], frequency: 'weekly' | 'monthly', currentPrice: number | null) => {
  if (payouts.length === 0) return { yield: null, cv: null, annualDiv: null };

  const relevantPayouts = payouts.slice(0, frequency === 'weekly' ? 52 : 12);
  let annualDiv = relevantPayouts.reduce((a, b) => a + b, 0);
  
  if (frequency === 'weekly' && relevantPayouts.length < 52) {
    annualDiv *= 52 / relevantPayouts.length;
  } else if (frequency === 'monthly' && relevantPayouts.length < 12) {
    annualDiv *= 12 / relevantPayouts.length;
  }

  let cv: number | null = null;
  // Reduced from 4 to 2 payments minimum to show volatility for newer ETFs
  if (payouts.length >= 2) {
    const mean = payouts.reduce((a, b) => a + b, 0) / payouts.length;
    const variance = payouts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (payouts.length - 1);
    cv = (Math.sqrt(variance) / mean) * 100;
    
    if (frequency === 'weekly') {
      cv = cv * Math.sqrt(52 / 12);
    }
  }

  const forwardYield = currentPrice && currentPrice > 0 && annualDiv > 0
    ? (annualDiv / currentPrice) * 100
    : null;

  return {
    yield: forwardYield,
    cv: cv ? Number(cv.toFixed(1)) : null,
    annualDiv: Number(annualDiv.toFixed(4)),
  };
};

async function main() {
  console.log('Recalculating metrics for all ETFs...\n');
  
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
  
  const updates: Array<{ ticker: string; metrics: any }> = [];
  
  for (const { ticker } of tickers) {
    try {
      console.log(`Processing ${ticker}...`);
      
      const metrics = await calculateMetrics(ticker);
      
      const frequency: 'weekly' | 'monthly' = isWeeklyPayer(ticker) ? 'weekly' : 'monthly';
      
      // First try prices_daily (primary source from Tiingo)
      let { data: priceDividends } = await supabase
        .from('prices_daily')
        .select('date, div_cash')
        .eq('ticker', ticker)
        .gt('div_cash', 0)
        .order('date', { ascending: false });
      
      // Fallback to dividends_detail if no data in prices_daily
      let dividends: any[] = [];
      if (priceDividends && priceDividends.length > 0) {
        dividends = priceDividends.map(p => ({
          ex_date: p.date,
          div_cash: p.div_cash,
          adj_amount: p.div_cash,
          div_type: null,
        }));
      } else {
        const { data: detailDividends } = await supabase
          .from('dividends_detail')
          .select('div_cash, adj_amount, div_type, ex_date')
          .eq('ticker', ticker)
          .order('ex_date', { ascending: false });
        dividends = detailDividends || [];
      }
      
      const regularDividends = dividends.filter(d => {
        const amount = d.adj_amount ?? d.div_cash;
        if (!amount || amount <= 0) return false;
        if (!d.div_type) return true; // null type = regular
        const dtype = d.div_type.toLowerCase();
        return dtype.includes('regular') || dtype === 'cash' || dtype === '' || !dtype.includes('special');
      });
      
      const payouts = regularDividends
        .map(d => d.adj_amount ?? d.div_cash ?? 0)
        .filter(a => a > 0)
        .reverse();
      
      const divMetrics = calculateDividendMetrics(payouts, frequency, metrics.currentPrice);
      
      const volatilityIndex = divMetrics.cv !== null
        ? divMetrics.cv < 5 ? 'Very Low'
          : divMetrics.cv < 10 ? 'Low'
          : divMetrics.cv < 20 ? 'Moderate'
          : divMetrics.cv < 30 ? 'High'
          : 'Very High'
        : null;
      
      updates.push({
        ticker,
        metrics: {
          price: metrics.currentPrice,
          price_change: metrics.priceChange,
          price_change_pct: metrics.priceChangePercent,
          last_dividend: payouts.length > 0 ? payouts[payouts.length - 1] : metrics.lastDividend,
          annual_dividend: divMetrics.annualDiv,
          forward_yield: divMetrics.yield,
          dividend_sd: metrics.dividendSD,
          dividend_cv: divMetrics.cv ? divMetrics.cv / 100 : null,
          dividend_cv_percent: divMetrics.cv,
          dividend_volatility_index: volatilityIndex,
          week_52_high: metrics.week52High,
          week_52_low: metrics.week52Low,
          tr_drip_3y: metrics.totalReturnDrip['3Y'],
          tr_drip_12m: metrics.totalReturnDrip['1Y'],
          tr_drip_6m: metrics.totalReturnDrip['6M'],
          tr_drip_3m: metrics.totalReturnDrip['3M'],
          tr_drip_1m: metrics.totalReturnDrip['1M'],
          tr_drip_1w: metrics.totalReturnDrip['1W'],
          price_return_3y: metrics.priceReturn['3Y'],
          price_return_12m: metrics.priceReturn['1Y'],
          price_return_6m: metrics.priceReturn['6M'],
          price_return_3m: metrics.priceReturn['3M'],
          price_return_1m: metrics.priceReturn['1M'],
          price_return_1w: metrics.priceReturn['1W'],
          tr_nodrip_3y: metrics.totalReturnNoDrip?.['3Y'] ?? null,
          tr_nodrip_12m: metrics.totalReturnNoDrip?.['1Y'] ?? null,
          tr_nodrip_6m: metrics.totalReturnNoDrip?.['6M'] ?? null,
          tr_nodrip_3m: metrics.totalReturnNoDrip?.['3M'] ?? null,
          tr_nodrip_1m: metrics.totalReturnNoDrip?.['1M'] ?? null,
          tr_nodrip_1w: metrics.totalReturnNoDrip?.['1W'] ?? null,
        },
      });
      
      console.log(`  ✓ yield=${divMetrics.yield?.toFixed(2) ?? 'N/A'}%, CV=${divMetrics.cv?.toFixed(1) ?? 'N/A'}%`);
    } catch (err) {
      console.error(`  ✗ Error: ${(err as Error).message}`);
    }
  }
  
  // Batch update all metrics
  console.log(`\nUpdating ${updates.length} ETFs in database...`);
  const updated = await batchUpdateETFMetrics(updates);
  console.log(`✓ Updated ${updated} ETFs`);
}

main().catch(console.error);
