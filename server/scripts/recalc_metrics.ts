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

// Removed old calculateDividendMetrics function - now using improved calculateDividendVolatility from calculateMetrics

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
      
      // Use the improved DVI calculation from calculateMetrics (which uses calculateDividendVolatility)
      // This ensures accurate frequency detection and annualization matching the spreadsheet method
      
      updates.push({
        ticker,
        metrics: {
          price: metrics.currentPrice,
          price_change: metrics.priceChange,
          price_change_pct: metrics.priceChangePercent,
          last_dividend: metrics.lastDividend,
          annual_dividend: metrics.annualizedDividend,
          forward_yield: metrics.forwardYield,
          dividend_sd: metrics.dividendSD,
          dividend_cv: metrics.dividendCV,
          dividend_cv_percent: metrics.dividendCVPercent,
          dividend_volatility_index: metrics.dividendVolatilityIndex,
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
      
      console.log(`  ✓ yield=${metrics.forwardYield?.toFixed(2) ?? 'N/A'}%, DVI=${metrics.dividendCVPercent?.toFixed(1) ?? 'N/A'}%`);
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
