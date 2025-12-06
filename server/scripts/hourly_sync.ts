/**
 * hourly_sync.ts - Hourly Data Sync Cron Job
 * 
 * Runs every hour during market hours to fetch latest prices from Tiingo API
 * and update the database. This is a lightweight version of daily_update.ts.
 * 
 * Usage: npx tsx scripts/hourly_sync.ts [--ticker SYMBOL] [--force]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import {
    fetchPriceHistory,
    fetchDividendHistory,
    healthCheck,
    getRateLimitStatus,
} from '../src/services/tiingo.js';
import { calculateMetrics } from '../src/services/metrics.js';
import { batchUpdateETFMetrics } from '../src/services/database.js';
import type { TiingoPriceData } from '../src/types/index.js';

// ============================================================================
// Configuration
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LOOKBACK_DAYS = 7; // Look back 7 days for hourly sync (less than daily)
const BATCH_SIZE = 100;

// ============================================================================
// Database Client
// ============================================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================================================
// CLI Arguments
// ============================================================================

interface CliOptions {
    ticker?: string;
    force: boolean;
}

function parseArgs(): CliOptions {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        force: false,
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--ticker':
                options.ticker = args[++i]?.toUpperCase();
                break;
            case '--force':
                options.force = true;
                break;
            case '--help':
                console.log(`
Usage: npx tsx scripts/hourly_sync.ts [options]

Options:
  --ticker SYMBOL   Update only a specific ticker
  --force           Force resync from last ${LOOKBACK_DAYS} days
  --help            Show this help message
        `);
                process.exit(0);
        }
    }

    return options;
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

function getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return formatDate(date);
}

function getTodayDate(): string {
    return formatDate(new Date());
}

// ============================================================================
// Database Operations
// ============================================================================

async function getActiveTickers(): Promise<string[]> {
    const { data, error } = await supabase
        .from('etf_static')
        .select('ticker')
        .order('ticker');

    if (error) {
        const { data: etfsData, error: etfsError } = await supabase
            .from('etfs')
            .select('symbol')
            .order('symbol');

        if (etfsError) {
            throw new Error(`Failed to fetch tickers: ${etfsError.message}`);
        }

        return (etfsData || []).map((row: { symbol: string }) => row.symbol);
    }

    return (data || []).map((row: { ticker: string }) => row.ticker);
}

async function getLastPriceDate(ticker: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('prices_daily')
        .select('date')
        .eq('ticker', ticker)
        .order('date', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) {
        return null;
    }

    return data.date;
}

async function upsertPrices(
    ticker: string,
    prices: TiingoPriceData[]
): Promise<number> {
    if (prices.length === 0) return 0;

    const records = prices.map(p => ({
        ticker,
        date: p.date.split('T')[0],
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        adj_close: p.adjClose,
        volume: p.volume,
        adj_open: p.adjOpen || p.open,
        adj_high: p.adjHigh || p.high,
        adj_low: p.adjLow || p.low,
        adj_volume: p.volume,
        div_cash: p.divCash || 0,
        split_factor: p.splitFactor || 1,
    }));

    let upserted = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);

        const { error } = await supabase
            .from('prices_daily')
            .upsert(batch, {
                onConflict: 'ticker,date',
                ignoreDuplicates: false,
            });

        if (error) {
            console.error(`  Error upserting prices for ${ticker}:`, error.message);
        } else {
            upserted += batch.length;
        }
    }

    return upserted;
}

type DividendData = {
    date: string;
    dividend: number;
    adjDividend: number;
    recordDate: string | null;
    paymentDate: string | null;
    declarationDate: string | null
};

async function upsertDividends(
    ticker: string,
    dividends: DividendData[]
): Promise<number> {
    if (dividends.length === 0) return 0;

    const records = dividends.map(d => ({
        ticker,
        ex_date: d.date.split('T')[0],
        pay_date: d.paymentDate?.split('T')[0] || null,
        record_date: d.recordDate?.split('T')[0] || null,
        declare_date: d.declarationDate?.split('T')[0] || null,
        div_cash: d.dividend,
        split_factor: d.adjDividend > 0 ? d.dividend / d.adjDividend : 1,
    }));

    const { error } = await supabase
        .from('dividends_detail')
        .upsert(records, {
            onConflict: 'ticker,ex_date',
            ignoreDuplicates: false,
        });

    if (error) {
        console.error(`  Error upserting dividends for ${ticker}:`, error.message);
        return 0;
    }

    return records.length;
}

async function updateSyncLog(
    ticker: string,
    dataType: 'prices' | 'dividends',
    lastDataDate: string | null,
    recordsSynced: number,
    status: 'success' | 'error',
    errorMessage?: string
): Promise<void> {
    const { error } = await supabase
        .from('data_sync_log')
        .upsert({
            ticker,
            data_type: dataType,
            last_sync_date: getTodayDate(),
            last_data_date: lastDataDate,
            records_synced: recordsSynced,
            status,
            error_message: errorMessage || null,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'ticker,data_type',
        });

    if (error) {
        console.error(`  Error updating sync log:`, error.message);
    }
}

// ============================================================================
// Update Logic
// ============================================================================

interface UpdateResult {
    ticker: string;
    pricesAdded: number;
    dividendsAdded: number;
    status: 'success' | 'error' | 'skipped';
    message?: string;
}

async function updateTicker(
    ticker: string,
    force: boolean
): Promise<UpdateResult> {
    console.log(`\n[Sync] ${ticker}`);

    try {
        // Determine start date for price fetch
        let priceStartDate: string;

        if (force) {
            priceStartDate = getDateDaysAgo(LOOKBACK_DAYS);
            console.log(`  Force mode: fetching from ${priceStartDate}`);
        } else {
            const lastPriceDate = await getLastPriceDate(ticker);
            if (lastPriceDate) {
                const lastDate = new Date(lastPriceDate);
                lastDate.setDate(lastDate.getDate() + 1);
                priceStartDate = formatDate(lastDate);
                console.log(`  Incremental: fetching from ${priceStartDate}`);
            } else {
                priceStartDate = getDateDaysAgo(LOOKBACK_DAYS);
                console.log(`  Initial: fetching from ${priceStartDate}`);
            }
        }

        // Skip if start date is today or in the future
        if (priceStartDate >= getTodayDate()) {
            console.log(`  Already up to date`);
            return {
                ticker,
                pricesAdded: 0,
                dividendsAdded: 0,
                status: 'skipped',
                message: 'Already up to date',
            };
        }

        // Fetch and upsert prices
        const prices = await fetchPriceHistory(ticker, priceStartDate);
        const pricesAdded = await upsertPrices(ticker, prices);

        const lastPriceRecordDate = prices.length > 0
            ? prices[prices.length - 1].date.split('T')[0]
            : null;

        await updateSyncLog(ticker, 'prices', lastPriceRecordDate, pricesAdded, 'success');

        // Fetch and upsert dividends (check last 7 days)
        const dividendStartDate = getDateDaysAgo(7);
        const dividends = await fetchDividendHistory(ticker, dividendStartDate);
        const dividendsAdded = await upsertDividends(ticker, dividends);

        const lastDividendDate = dividends.length > 0
            ? dividends[dividends.length - 1].date.split('T')[0]
            : null;

        await updateSyncLog(ticker, 'dividends', lastDividendDate, dividendsAdded, 'success');

        // Recompute metrics
        console.log(`  Recomputing metrics...`);
        try {
            const metrics = await calculateMetrics(ticker);
            await batchUpdateETFMetrics([{
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
                    tr_drip_3y: metrics.totalReturnDrip?.['3Y'],
                    tr_drip_12m: metrics.totalReturnDrip?.['1Y'],
                    tr_drip_6m: metrics.totalReturnDrip?.['6M'],
                    tr_drip_3m: metrics.totalReturnDrip?.['3M'],
                    tr_drip_1m: metrics.totalReturnDrip?.['1M'],
                    tr_drip_1w: metrics.totalReturnDrip?.['1W'],
                    price_return_3y: metrics.priceReturn?.['3Y'],
                    price_return_12m: metrics.priceReturn?.['1Y'],
                    price_return_6m: metrics.priceReturn?.['6M'],
                    price_return_3m: metrics.priceReturn?.['3M'],
                    price_return_1m: metrics.priceReturn?.['1M'],
                    price_return_1w: metrics.priceReturn?.['1W'],
                    tr_nodrip_3y: metrics.totalReturnNoDrip?.['3Y'],
                    tr_nodrip_12m: metrics.totalReturnNoDrip?.['1Y'],
                    tr_nodrip_6m: metrics.totalReturnNoDrip?.['6M'],
                    tr_nodrip_3m: metrics.totalReturnNoDrip?.['3M'],
                    tr_nodrip_1m: metrics.totalReturnNoDrip?.['1M'],
                    tr_nodrip_1w: metrics.totalReturnNoDrip?.['1W'],
                    last_updated: new Date().toISOString(),
                }
            }]);
            console.log(`  ✓ Metrics updated`);
        } catch (metricsError) {
            console.error(`  ⚠️ Metrics calculation failed:`, metricsError instanceof Error ? metricsError.message : metricsError);
        }

        console.log(`  ✓ ${pricesAdded} prices, ${dividendsAdded} dividends`);

        return {
            ticker,
            pricesAdded,
            dividendsAdded,
            status: 'success',
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`  ✗ Error: ${message}`);

        return {
            ticker,
            pricesAdded: 0,
            dividendsAdded: 0,
            status: 'error',
            message,
        };
    }
}

// ============================================================================
// Main Function
// ============================================================================

async function main(): Promise<void> {
    const startTime = Date.now();

    console.log('============================================');
    console.log('Tiingo Hourly Sync Script');
    console.log(`Run Time: ${new Date().toISOString()}`);
    console.log('============================================');

    const options = parseArgs();

    console.log('\nConfiguration:');
    console.log(`  Ticker: ${options.ticker || 'ALL'}`);
    console.log(`  Force Resync: ${options.force}`);

    // Verify API connectivity
    console.log('\n[Sync] Checking Tiingo API...');
    const apiHealthy = await healthCheck();
    if (!apiHealthy) {
        console.error('[Sync] ERROR: Cannot connect to Tiingo API');
        process.exit(1);
    }
    console.log('[Sync] API connection OK');

    // Get tickers to update
    let tickers: string[];
    if (options.ticker) {
        tickers = [options.ticker];
    } else {
        tickers = await getActiveTickers();
    }

    console.log(`\n[Sync] Processing ${tickers.length} ticker(s)...`);

    // Process tickers
    const results: UpdateResult[] = [];

    for (const ticker of tickers) {
        const result = await updateTicker(ticker, options.force);
        results.push(result);

        // Progress update every 10 tickers
        if (results.length % 10 === 0) {
            const status = getRateLimitStatus();
            console.log(`\n[Sync] Progress: ${results.length}/${tickers.length} | API: ${status.requestsThisHour}/${status.hourlyLimit}`);
        }
    }

    // Summary
    const elapsedMs = Date.now() - startTime;
    const successful = results.filter(r => r.status === 'success').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const errors = results.filter(r => r.status === 'error').length;
    const totalPrices = results.reduce((sum, r) => sum + r.pricesAdded, 0);
    const totalDividends = results.reduce((sum, r) => sum + r.dividendsAdded, 0);

    console.log('\n============================================');
    console.log('Hourly Sync Complete');
    console.log('============================================');
    console.log(`  Total Tickers: ${tickers.length}`);
    console.log(`  Successful: ${successful}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors: ${errors}`);
    console.log(`  Prices Added: ${totalPrices}`);
    console.log(`  Dividends Added: ${totalDividends}`);
    console.log(`  Duration: ${(elapsedMs / 1000).toFixed(1)}s`);

    // Log errors for debugging
    if (errors > 0) {
        console.log('\nTickers with errors:');
        results
            .filter(r => r.status === 'error')
            .forEach(r => console.log(`  - ${r.ticker}: ${r.message}`));
    }

    // Exit with error code if any failures
    if (errors > 0) {
        process.exit(1);
    }
}

// Run the script
main().catch((error) => {
    console.error('[Sync] Fatal error:', error);
    process.exit(1);
});
