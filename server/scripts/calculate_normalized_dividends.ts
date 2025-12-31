/**
 * Backfill Normalized Dividend Columns
 * 
 * This script calculates and populates the following columns in dividends_detail:
 * - days_since_prev: Days between current and previous dividend payment
 * - pmt_type: "Regular", "Special", or "Initial"
 * - frequency_num: 52 (weekly), 12 (monthly), 4 (quarterly), 1 (annual)
 * - annualized: adj_amount × frequency_num
 * - normalized_div: Normalized dividend for line chart display
 * 
 * Logic Rules (from CEO specification):
 * 1. DAYS: days_since_prev = current_ex_date - previous_ex_date
 * 2. TYPE (pmt_type):
 *    - null days → "Initial" (first dividend for ticker)
 *    - ≤5 days → "Special" (too close to previous, likely special dividend)
 *    - >5 days → "Regular"
 * 3. FREQUENCY (frequency_num): Backward confirmation rule
 *    IMPORTANT: Since we're dealing with end-of-day data, we cannot know the frequency
 *    of a payment until we see when the next one arrives. By looking at the gap between
 *    the newest payment and the one immediately before it, we "confirm" the frequency
 *    for that period.
 *    
 *    - For each dividend (except the last): Look AHEAD to next dividend to determine frequency
 *    - For the last dividend: Use gap from previous dividend (since no next dividend yet)
 *    
 *    Frequency mapping:
 *    - 7-10 days → 52 (Weekly)
 *    - 25-35 days → 12 (Monthly)
 *    - 80-100 days → 4 (Quarterly)
 *    - else → 1 (Annual/Irregular)
 * 4. ANNUALIZED: adj_amount × frequency_num (only for Regular dividends)
 * 5. NORMALIZED: annualized / 52 = (adj_amount × frequency_num) / 52 (weekly equivalent rate)
 *    Only for Regular dividends. This normalizes all payments to weekly equivalent for line chart comparison.
 */

// CRITICAL: Load environment variables FIRST before ANY other imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from multiple possible locations
const envPaths = [
    path.resolve(process.cwd(), '.env'),                    // Current working directory
    path.resolve(process.cwd(), '../.env'),                 // Parent of current directory
    path.resolve(__dirname, '../.env'),                      // server/.env
    path.resolve(__dirname, '../../.env'),                  // root/.env
    path.resolve(__dirname, '../../../yield-ranker/server/.env'), // yield-ranker/server/.env
    path.resolve(__dirname, '../../yield-ranker/server/.env'),    // root/yield-ranker/server/.env
];

// Try all paths - dotenv.config() doesn't throw if file doesn't exist
let envLoaded = false;
let loadedEnvPath = '';
for (const envPath of envPaths) {
    try {
        const result = dotenv.config({ path: envPath });
        if (!result.error && result.parsed && Object.keys(result.parsed).length > 0) {
            console.log(`✓ Loaded .env from: ${envPath}`);
            envLoaded = true;
            loadedEnvPath = envPath;
            break;
        }
    } catch (e) {
        // Continue to next path
    }
}

// Also try default location (current directory)
if (!envLoaded) {
    const defaultResult = dotenv.config();
    if (!defaultResult.error && defaultResult.parsed && Object.keys(defaultResult.parsed).length > 0) {
        console.log(`✓ Loaded .env from default location`);
        envLoaded = true;
    }
}

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    if (envLoaded) {
        console.error(`   .env file was loaded from: ${loadedEnvPath || 'default location'}`);
        console.error(`   But required variables are missing.`);
    } else {
        console.error(`   Could not find .env file in any of these locations:`);
        envPaths.forEach(p => console.error(`     - ${p}`));
        console.error(`   Please ensure .env file exists and contains SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY`);
    }
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface DividendRecord {
    id: number;
    ticker: string;
    ex_date: string;
    adj_amount: number | null;
    div_cash: number;
}

interface CalculatedDividend {
    id: number;
    days_since_prev: number | null;
    pmt_type: string;
    frequency_num: number;
    annualized: number | null;
    normalized_div: number | null;
}

/**
 * Determine frequency based on days between payments
 * Using ranges to account for weekends/holidays
 * Based on CEO specification: 7-10 days = weekly (52), 25-35 days = monthly (12)
 */
function getFrequencyFromDays(days: number): number {
    // Clear weekly pattern: 6-10 days (standard weekly pattern)
    if (days >= 6 && days <= 10) return 52;    // Weekly
    
    // Clear monthly pattern: 25-35 days
    if (days >= 25 && days <= 35) return 12;   // Monthly  
    
    // Clear quarterly pattern: 80-100 days
    if (days >= 80 && days <= 100) return 4;   // Quarterly
    
    // Clear semi-annual pattern: 170-200 days
    if (days >= 170 && days <= 200) return 2;  // Semi-annual
    
    // Clear annual pattern: > 200 days
    if (days > 200) return 1;                   // Annual or irregular

    // Edge cases for irregular gaps
    // 11-14 days: can occur during frequency transitions (monthly to weekly)
    // Treat as weekly when it's part of a weekly sequence
    if (days >= 11 && days <= 14) return 52;   // Transition periods (monthly to weekly)
    
    // 15-24 days: bi-weekly/irregular, treat as monthly (between weekly and monthly)
    if (days >= 15 && days < 25) return 12;     // Bi-weekly/irregular, treat as monthly
    
    // 36-79 days: closer to monthly than quarterly, default to monthly
    if (days > 35 && days < 80) return 12;     // Irregular monthly pattern
    
    // 101-169 days: closer to quarterly than semi-annual
    if (days > 100 && days < 170) return 4;    // Irregular quarterly pattern

    // Default to monthly for any other case
    return 12;
}

/**
 * Determine payment type based on days gap
 */
function getPaymentType(daysSincePrev: number | null): string {
    if (daysSincePrev === null) return 'Initial';
    if (daysSincePrev <= 5) return 'Special';
    return 'Regular';
}

async function backfillNormalizedDividends() {
    console.log('============================================');
    console.log('Backfilling Normalized Dividend Columns');
    console.log('============================================\n');

    // Get all unique tickers from dividends_detail
    const { data: tickers, error: tickerError } = await supabase
        .from('dividends_detail')
        .select('ticker')
        .order('ticker');

    if (tickerError) {
        console.error('Error fetching tickers:', tickerError);
        process.exit(1);
    }

    const uniqueTickers = [...new Set(tickers.map(t => t.ticker))];
    console.log(`Found ${uniqueTickers.length} unique tickers to process\n`);

    let totalProcessed = 0;
    let totalUpdated = 0;

    for (const ticker of uniqueTickers) {
        // Get all dividends for this ticker, sorted by date ascending
        const { data: dividends, error: divError } = await supabase
            .from('dividends_detail')
            .select('id, ticker, ex_date, adj_amount, div_cash')
            .eq('ticker', ticker)
            .order('ex_date', { ascending: true });

        if (divError) {
            console.error(`Error fetching dividends for ${ticker}:`, divError);
            continue;
        }

        if (!dividends || dividends.length === 0) {
            continue;
        }

        const updates: CalculatedDividend[] = [];

        for (let i = 0; i < dividends.length; i++) {
            const current = dividends[i];
            const previous = i > 0 ? dividends[i - 1] : null;

            // Calculate days since previous dividend
            let daysSincePrev: number | null = null;
            if (previous) {
                const currentDate = new Date(current.ex_date);
                const prevDate = new Date(previous.ex_date);
                daysSincePrev = Math.round((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
            }

            // Determine payment type
            const pmtType = getPaymentType(daysSincePrev);

            // Determine frequency using backward confirmation rule:
            // Look ahead to NEXT dividend to confirm frequency of CURRENT dividend
            // Only for the last dividend (most recent) do we use the gap from previous
            let frequencyNum = 12; // Default to monthly

            const isLastDividend = i === dividends.length - 1;
            
            if (isLastDividend) {
                // For the last dividend (most recent), use gap from previous since no next dividend exists
                if (daysSincePrev !== null && daysSincePrev > 5) {
                    frequencyNum = getFrequencyFromDays(daysSincePrev);
                }
            } else {
                // For all other dividends: look ahead to next dividend to confirm frequency
                const nextDiv = dividends[i + 1];
                const nextDate = new Date(nextDiv.ex_date);
                const currentDate = new Date(current.ex_date);
                const daysToNext = Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
                
                if (daysToNext > 5) {
                    // Use the gap to next dividend to determine frequency
                    // BUT: If we have a previous gap that's clearly monthly (25-35 days),
                    // and the next gap indicates weekly (6-14 days), the current dividend
                    // likely belongs to the monthly pattern (the transition happens at the NEXT dividend)
                    if (daysSincePrev !== null && daysSincePrev >= 25 && daysSincePrev <= 35) {
                        // Previous gap indicates monthly pattern - current dividend is monthly
                        // unless next gap also clearly indicates monthly
                        const freqFromNext = getFrequencyFromDays(daysToNext);
                        const freqFromPrev = getFrequencyFromDays(daysSincePrev);
                        
                        // If previous clearly indicates monthly and next indicates weekly,
                        // the transition happens at the next dividend, so current is still monthly
                        if (freqFromPrev === 12 && freqFromNext === 52 && daysToNext >= 6 && daysToNext <= 14) {
                            frequencyNum = 12; // Stay with monthly pattern
                        } else {
                            frequencyNum = freqFromNext;
                        }
                    } else {
                        // No clear monthly pattern from previous, use next gap
                        frequencyNum = getFrequencyFromDays(daysToNext);
                    }
                }
            }

            // Calculate annualized and normalized values
            // CRITICAL: For normalization, we MUST use adj_amount (adjusted dividends) for ETFs that split
            // Never fall back to div_cash (unadjusted) as it will give wrong results after splits
            // If adj_amount is null, we cannot calculate normalized values correctly
            const amount = current.adj_amount !== null && current.adj_amount > 0
                ? Number(current.adj_amount)
                : null; // Don't use div_cash - must have adj_amount for proper normalization

            let annualized: number | null = null;
            let normalizedDiv: number | null = null;

            // Only calculate for Regular dividends with valid adjusted amounts
            // Must have adj_amount (not div_cash) for proper normalization after splits
            if (pmtType === 'Regular' && amount !== null && amount > 0) {
                // Calculate annualized: Amount × Frequency
                const annualizedRaw = amount * frequencyNum;
                // Round annualized to 2 decimals for storage/display
                annualized = Number(annualizedRaw.toFixed(2));
                
                // Normalized value: convert to weekly equivalent rate for line chart
                // IMPORTANT: Calculate from the UNROUNDED annualized value
                // Formula: normalizedDiv = (amount × frequency) / 52
                // This ensures consistency: 0.694 × 12 = 8.328 → 8.328 / 52 = 0.160153846... ≈ 0.16015
                // The spreadsheet uses the unrounded annualized value for normalization calculation
                normalizedDiv = annualizedRaw / 52;
            }

            updates.push({
                id: current.id,
                days_since_prev: daysSincePrev,
                pmt_type: pmtType,
                frequency_num: frequencyNum,
                annualized: annualized !== null ? Number(annualized.toFixed(2)) : null,
                normalized_div: normalizedDiv !== null ? Number(normalizedDiv.toFixed(6)) : null,
            });
        }

        // Batch update this ticker's dividends
        for (const update of updates) {
            const { error: updateError } = await supabase
                .from('dividends_detail')
                .update({
                    days_since_prev: update.days_since_prev,
                    pmt_type: update.pmt_type,
                    frequency_num: update.frequency_num,
                    annualized: update.annualized,
                    normalized_div: update.normalized_div,
                })
                .eq('id', update.id);

            if (updateError) {
                console.error(`  Error updating dividend ID ${update.id}:`, updateError);
            } else {
                totalUpdated++;
            }
        }

        totalProcessed++;
        if (totalProcessed % 10 === 0) {
            console.log(`Processed ${totalProcessed}/${uniqueTickers.length} tickers...`);
        }
    }

    console.log('\n============================================');
    console.log('Backfill Complete!');
    console.log('============================================');
    console.log(`Total tickers processed: ${totalProcessed}`);
    console.log(`Total dividend records updated: ${totalUpdated}`);
}

// Run for a specific ticker (useful for testing)
async function backfillSingleTicker(ticker: string) {
    console.log(`\nProcessing single ticker: ${ticker}\n`);

    const { data: dividends, error } = await supabase
        .from('dividends_detail')
        .select('id, ticker, ex_date, adj_amount, div_cash')
        .eq('ticker', ticker)
        .order('ex_date', { ascending: true });

    if (error) {
        console.error(`Error fetching dividends for ${ticker}:`, error);
        return;
    }

    console.log(`Found ${dividends.length} dividends for ${ticker}\n`);

    const results: Array<{
        date: string;
        adjAmount: number | null;
        frequency: number;
        annualized: number | null;
        normalized: number | null;
    }> = [];

    for (let i = 0; i < dividends.length; i++) {
        const current = dividends[i];
        const previous = i > 0 ? dividends[i - 1] : null;

        let daysSincePrev: number | null = null;
        if (previous) {
            const currentDate = new Date(current.ex_date);
            const prevDate = new Date(previous.ex_date);
            daysSincePrev = Math.round((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
        }

            const pmtType = getPaymentType(daysSincePrev);
            let frequencyNum = 12;

            // Determine frequency using backward confirmation rule
            const isLastDividend = i === dividends.length - 1;
            
            if (isLastDividend) {
                // For the last dividend (most recent), use gap from previous
                if (daysSincePrev !== null && daysSincePrev > 5) {
                    frequencyNum = getFrequencyFromDays(daysSincePrev);
                }
            } else {
                // For all other dividends: look ahead to next dividend to confirm frequency
                const nextDiv = dividends[i + 1];
                const nextDate = new Date(nextDiv.ex_date);
                const currentDate = new Date(current.ex_date);
                const daysToNext = Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
                
                if (daysToNext > 5) {
                    // Use the gap to next dividend to determine frequency
                    // BUT: If we have a previous gap that's clearly monthly (25-35 days),
                    // and the next gap indicates weekly (6-14 days), the current dividend
                    // likely belongs to the monthly pattern (the transition happens at the NEXT dividend)
                    if (daysSincePrev !== null && daysSincePrev >= 25 && daysSincePrev <= 35) {
                        // Previous gap indicates monthly pattern - current dividend is monthly
                        // unless next gap also clearly indicates monthly
                        const freqFromNext = getFrequencyFromDays(daysToNext);
                        const freqFromPrev = getFrequencyFromDays(daysSincePrev);
                        
                        // If previous clearly indicates monthly and next indicates weekly,
                        // the transition happens at the next dividend, so current is still monthly
                        if (freqFromPrev === 12 && freqFromNext === 52 && daysToNext >= 6 && daysToNext <= 14) {
                            frequencyNum = 12; // Stay with monthly pattern
                        } else {
                            frequencyNum = freqFromNext;
                        }
                    } else {
                        // No clear monthly pattern from previous, use next gap
                        frequencyNum = getFrequencyFromDays(daysToNext);
                    }
                }
            }

        // CRITICAL: Use adj_amount (adjusted dividend) for normalization
        // Never use div_cash (unadjusted) as it gives wrong results after splits
        const amount = current.adj_amount !== null && current.adj_amount > 0
            ? Number(current.adj_amount)
            : null;
        
        // Calculate annualized: Amount × Frequency
        let annualized: number | null = null;
        let normalizedDiv: number | null = null;
        
        if (pmtType === 'Regular' && amount !== null && amount > 0) {
            const annualizedRaw = amount * frequencyNum;
            // Round annualized to 2 decimals for storage/display
            annualized = Number(annualizedRaw.toFixed(2));
            
            // Normalized value: convert to weekly equivalent rate for line chart
            // IMPORTANT: Calculate from the UNROUNDED annualized value
            // Formula: normalizedDiv = (amount × frequency) / 52
            // This ensures consistency: 0.694 × 12 = 8.328 → 8.328 / 52 = 0.160153846... ≈ 0.16015
            normalizedDiv = annualizedRaw / 52;
        }

        // Store for table display
        results.push({
            date: current.ex_date,
            adjAmount: current.adj_amount,
            frequency: frequencyNum,
            annualized,
            normalized: normalizedDiv,
        });

        // Update the database
        const { error: updateError } = await supabase
            .from('dividends_detail')
            .update({
                days_since_prev: daysSincePrev,
                pmt_type: pmtType,
                frequency_num: frequencyNum,
                annualized: annualized ? Number(annualized.toFixed(2)) : null,
                normalized_div: normalizedDiv ? Number(normalizedDiv.toFixed(9)) : null,
            })
            .eq('id', current.id);

        if (updateError) {
            console.error(`  Error updating:`, updateError);
        }
    }

    // Display results in table format (most recent first)
    console.log('\n============================================');
    console.log('Results (most recent first):');
    console.log('============================================');
    console.log('Date       | ADJ DIV   | FREQ | ANNLZD  | NORMLZD');
    console.log('-----------|-----------|------|---------|----------------');
    
    results.reverse().forEach(r => {
        const dateStr = new Date(r.date).toISOString().split('T')[0];
        const adjDivStr = r.adjAmount !== null ? r.adjAmount.toFixed(4).padStart(9) : 'N/A'.padStart(9);
        const freqStr = r.frequency.toString().padStart(4);
        const annStr = r.annualized !== null ? r.annualized.toFixed(2).padStart(7) : 'N/A'.padStart(7);
        const normStr = r.normalized !== null ? r.normalized.toFixed(9) : 'N/A';
        console.log(`${dateStr} | ${adjDivStr} | ${freqStr} | ${annStr} | ${normStr}`);
    });

    // Show just normalized values column for easy comparison
    console.log('\n============================================');
    console.log('Normalized values (NORMLZD column):');
    console.log('============================================');
    results.reverse().forEach(r => {
        if (r.normalized !== null) {
            console.log(r.normalized.toFixed(9));
        }
    });

    console.log('\nDone!');
}

// Main execution
const args = process.argv.slice(2);
if (args.length > 0 && args[0] === '--ticker' && args[1]) {
    backfillSingleTicker(args[1]);
} else {
    backfillNormalizedDividends();
}
