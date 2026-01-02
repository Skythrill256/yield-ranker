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
    // Clear weekly pattern: 5-10 days (standard weekly pattern)
    if (days >= 5 && days <= 10) return 52;    // Weekly
    
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
 * Find the last Regular dividend before the given index
 */
function findLastRegularDividend(
    dividends: Array<{ id: number; ticker: string; ex_date: string; adj_amount: number | null; div_cash: number }>,
    currentIndex: number,
    calculatedTypes: string[]
): { dividend: typeof dividends[0]; index: number } | null {
    for (let i = currentIndex - 1; i >= 0; i--) {
        if (calculatedTypes[i] === 'Regular') {
            return { dividend: dividends[i], index: i };
        }
    }
    return null;
}

/**
 * Determine payment type based on days gap from last REGULAR dividend
 * Special dividend: paid 1-4 days after last regular dividend
 * OR: tiny amount (< 1% of next dividend) that comes 1-4 days before next dividend
 */
function getPaymentType(
    daysSincePrev: number | null,
    daysSinceLastRegular: number | null = null,
    currentAmount: number | null = null,
    nextAmount: number | null = null,
    daysToNext: number | null = null
): string {
    if (daysSincePrev === null) return 'Initial';
    
    // Special case: If current dividend is tiny (< 1% of next) and comes 1-4 days before next,
    // it's likely a special dividend (e.g., $0.0003 before $0.4866)
    if (currentAmount !== null && currentAmount > 0 && 
        nextAmount !== null && nextAmount > 0 && 
        daysToNext !== null && daysToNext >= 1 && daysToNext <= 4) {
        const ratio = currentAmount / nextAmount;
        if (ratio < 0.01) { // Current is less than 1% of next
            return 'Special';
        }
    }
    
    // If we have days since last regular, use that (more accurate)
    if (daysSinceLastRegular !== null) {
        if (daysSinceLastRegular >= 1 && daysSinceLastRegular <= 4) return 'Special';
        return 'Regular';
    }
    
    // Fallback: use days since previous (less accurate but works for first pass)
    if (daysSincePrev >= 1 && daysSincePrev <= 4) return 'Special';
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
        const calculatedTypes: string[] = [];

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

            // Find last Regular dividend to calculate days since last regular
            // Special dividend rule: paid 1-4 days after LAST REGULAR dividend (not just previous)
            let daysSinceLastRegular: number | null = null;
            const lastRegular = findLastRegularDividend(dividends, i, calculatedTypes);
            if (lastRegular) {
                const currentDate = new Date(current.ex_date);
                const lastRegularDate = new Date(lastRegular.dividend.ex_date);
                daysSinceLastRegular = Math.round((currentDate.getTime() - lastRegularDate.getTime()) / (1000 * 60 * 60 * 24));
            } else if (daysSincePrev !== null) {
                // No regular dividend found yet, use days since previous as fallback
                daysSinceLastRegular = daysSincePrev;
            }

            // Get next dividend info for amount-based special detection
            const next = i < dividends.length - 1 ? dividends[i + 1] : null;
            let daysToNext: number | null = null;
            if (next) {
                const currentDate = new Date(current.ex_date);
                const nextDate = new Date(next.ex_date);
                daysToNext = Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
            }
            const currentAmount = current.adj_amount ?? current.div_cash;
            const nextAmount = next ? (next.adj_amount ?? next.div_cash) : null;

            // Determine payment type: Special if 1-4 days after last Regular dividend
            // OR if tiny amount (< 1% of next) that comes 1-4 days before next
            const pmtType = getPaymentType(daysSincePrev, daysSinceLastRegular, currentAmount, nextAmount, daysToNext);
            calculatedTypes.push(pmtType);

            // Determine frequency using backward confirmation rule:
            // IMPORTANT: Frequency is assigned to the PREVIOUS dividend based on the gap FROM previous TO current
            // When we process dividend[i], we calculate days from dividend[i-1] to dividend[i],
            // and assign that frequency to dividend[i-1] (the previous one)
            let frequencyNum = 12; // Default to monthly (temporary, will be updated)

            if (i > 0 && daysSincePrev !== null && daysSincePrev > 4) {
                // Calculate frequency from gap between previous and current
                // This frequency will be assigned to the PREVIOUS dividend
                frequencyNum = getFrequencyFromDays(daysSincePrev);
                
                // Update the previous dividend's frequency in the updates array
                const prevUpdate = updates[updates.length - 1];
                prevUpdate.frequency_num = frequencyNum;
                
                // Recalculate annualized and normalized for previous dividend with updated frequency
                if (prevUpdate.pmt_type === 'Regular' && previous) {
                    const prevAmount = previous.adj_amount !== null && previous.adj_amount > 0
                        ? Number(previous.adj_amount)
                        : null;
                    if (prevAmount !== null && prevAmount > 0) {
                        const annualizedRaw = prevAmount * frequencyNum;
                        prevUpdate.annualized = Number(annualizedRaw.toFixed(2));
                        prevUpdate.normalized_div = Number((annualizedRaw / 52).toFixed(9));
                    }
                }
            }
            
            // For the current dividend, determine its frequency:
            // CRITICAL FIX: When there's a frequency change, use the frequency from the PREVIOUS gap
            // (the gap that brought us to this dividend), not the gap to the next dividend.
            // This ensures the last payment of the old frequency keeps the old frequency.
            // Example: Last monthly payment (28 days from previous) before switching to weekly
            // should be monthly (12), not weekly (52) based on the 7-day gap to next.
            if (i < dividends.length - 1) {
                // Not the last dividend: check for frequency transition
                const nextDiv = dividends[i + 1];
                const nextDate = new Date(nextDiv.ex_date);
                const currentDate = new Date(current.ex_date);
                const daysToNext = Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
                
                if (daysSincePrev !== null && daysSincePrev > 4 && daysToNext > 4) {
                    // Both gaps are valid - check if there's a frequency change
                    const prevFreq = getFrequencyFromDays(daysSincePrev);
                    const nextFreq = getFrequencyFromDays(daysToNext);
                    
                    if (prevFreq !== nextFreq) {
                        // Frequency transition detected: use the PREVIOUS frequency
                        // This ensures the last payment of the old frequency keeps the old frequency
                        frequencyNum = prevFreq;
                    } else {
                        // No frequency change: use gap to next (will be finalized when next dividend is processed)
                        frequencyNum = nextFreq;
                    }
                } else if (daysToNext > 4) {
                    // Only next gap is valid
                    frequencyNum = getFrequencyFromDays(daysToNext);
                } else if (daysSincePrev !== null && daysSincePrev > 4) {
                    // Only previous gap is valid
                    frequencyNum = getFrequencyFromDays(daysSincePrev);
                }
            } else if (i > 0) {
                // Last dividend: use gap from previous
                if (daysSincePrev !== null && daysSincePrev > 4) {
                    frequencyNum = getFrequencyFromDays(daysSincePrev);
                }
            } else {
                // First and only dividend: use gap to next if available, otherwise default
                if (dividends.length > 1) {
                    const nextDiv = dividends[i + 1];
                    const nextDate = new Date(nextDiv.ex_date);
                    const currentDate = new Date(current.ex_date);
                    const daysToNext = Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysToNext > 4) {
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
    const calculatedTypes: string[] = [];

    for (let i = 0; i < dividends.length; i++) {
        const current = dividends[i];
        const previous = i > 0 ? dividends[i - 1] : null;

        let daysSincePrev: number | null = null;
        if (previous) {
            const currentDate = new Date(current.ex_date);
            const prevDate = new Date(previous.ex_date);
            daysSincePrev = Math.round((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        // Find last Regular dividend to calculate days since last regular
        let daysSinceLastRegular: number | null = null;
        const lastRegular = findLastRegularDividend(dividends, i, calculatedTypes);
        if (lastRegular) {
            const currentDate = new Date(current.ex_date);
            const lastRegularDate = new Date(lastRegular.dividend.ex_date);
            daysSinceLastRegular = Math.round((currentDate.getTime() - lastRegularDate.getTime()) / (1000 * 60 * 60 * 24));
        } else if (daysSincePrev !== null) {
            daysSinceLastRegular = daysSincePrev;
        }

        // Get next dividend info for amount-based special detection
        const next = i < dividends.length - 1 ? dividends[i + 1] : null;
        let daysToNext: number | null = null;
        if (next) {
            const currentDate = new Date(current.ex_date);
            const nextDate = new Date(next.ex_date);
            daysToNext = Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
        }
        const currentAmount = current.adj_amount ?? current.div_cash;
        const nextAmount = next ? (next.adj_amount ?? next.div_cash) : null;

        // Determine payment type: Special if 1-4 days after last Regular dividend
        // OR if tiny amount (< 1% of next) that comes 1-4 days before next
        const pmtType = getPaymentType(daysSincePrev, daysSinceLastRegular, currentAmount, nextAmount, daysToNext);
        calculatedTypes.push(pmtType);
            let frequencyNum = 12; // Default to monthly (temporary, will be updated)

            // Determine frequency using backward confirmation rule:
            // IMPORTANT: Frequency is determined by looking AHEAD to the NEXT dividend.
            // The gap from current to next determines the current dividend's frequency.
            // This is the "backward confirmation" rule: we confirm a dividend's frequency
            // by seeing when the next one arrives.
            if (i < dividends.length - 1) {
                // Not the last dividend: use gap to next (backward confirmation rule)
                const nextDiv = dividends[i + 1];
                const nextDate = new Date(nextDiv.ex_date);
                const currentDate = new Date(current.ex_date);
                const daysToNext = Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
                
                // Try to find the next Regular dividend (skip Special dividends)
                let nextRegularDiv: typeof current | null = null;
                let daysToNextRegular: number | null = null;
                for (let j = i + 1; j < dividends.length; j++) {
                    const testDiv = dividends[j];
                    const testPrev = j > 0 ? dividends[j - 1] : null;
                    let testDaysSincePrev: number | null = null;
                    if (testPrev) {
                        const testDate = new Date(testDiv.ex_date);
                        const testPrevDate = new Date(testPrev.ex_date);
                        testDaysSincePrev = Math.round((testDate.getTime() - testPrevDate.getTime()) / (1000 * 60 * 60 * 24));
                    }
                    const testPmtType = getPaymentType(testDaysSincePrev);
                    if (testPmtType === 'Regular') {
                        nextRegularDiv = testDiv;
                        const testDate = new Date(testDiv.ex_date);
                        daysToNextRegular = Math.round((testDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
                        break;
                    }
                }
                
                // PRIORITY 1: Use gap to next Regular dividend if available and > 4 days
                if (nextRegularDiv && daysToNextRegular !== null && daysToNextRegular > 4) {
                    frequencyNum = getFrequencyFromDays(daysToNextRegular);
                }
                // PRIORITY 2: If gap to next is small (Special dividend case), use gap from last Regular
                else if (daysToNext <= 4 && lastRegular) {
                    const currentDate2 = new Date(current.ex_date);
                    const lastRegularDate = new Date(lastRegular.dividend.ex_date);
                    const daysFromLastRegular = Math.round((currentDate2.getTime() - lastRegularDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysFromLastRegular > 4) {
                        frequencyNum = getFrequencyFromDays(daysFromLastRegular);
                    }
                }
                // PRIORITY 3: Use gap to immediate next dividend if > 4 days
                else if (daysToNext > 4) {
                    frequencyNum = getFrequencyFromDays(daysToNext);
                }
                // PRIORITY 4: Fallback to gap from last Regular if available
                else if (lastRegular) {
                    const currentDate2 = new Date(current.ex_date);
                    const lastRegularDate = new Date(lastRegular.dividend.ex_date);
                    const daysFromLastRegular = Math.round((currentDate2.getTime() - lastRegularDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysFromLastRegular > 4) {
                        frequencyNum = getFrequencyFromDays(daysFromLastRegular);
                    }
                }
            } else {
                // Last dividend: use gap from last Regular dividend if available, otherwise from previous
                if (lastRegular) {
                    const currentDate2 = new Date(current.ex_date);
                    const lastRegularDate = new Date(lastRegular.dividend.ex_date);
                    const daysFromLastRegular = Math.round((currentDate2.getTime() - lastRegularDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysFromLastRegular > 4) {
                        frequencyNum = getFrequencyFromDays(daysFromLastRegular);
                    } else if (i > 0 && daysSincePrev !== null && daysSincePrev > 4) {
                        frequencyNum = getFrequencyFromDays(daysSincePrev);
                    }
                } else if (i > 0 && daysSincePrev !== null && daysSincePrev > 4) {
                    frequencyNum = getFrequencyFromDays(daysSincePrev);
                }
            }
            
            // Update the PREVIOUS dividend's frequency based on gap FROM previous TO current
            // This happens when we process the current dividend and can confirm the previous one's frequency
            if (i > 0 && previous !== null && daysSincePrev !== null && daysSincePrev > 4) {
                const prevFrequencyNum = getFrequencyFromDays(daysSincePrev);
                
                // Update the previous dividend's frequency in the results array
                const prevResult = results[results.length - 1];
                prevResult.frequency = prevFrequencyNum;
                
                // Calculate previous dividend's payment type to determine if we should recalculate annualized/normalized
                // Previous dividend's payment type is based on gap from [i-2] to [i-1]
                let prevDaysSincePrev: number | null = null;
                if (i > 1) {
                    const prevPrev = dividends[i - 2];
                    const prevDate = new Date(previous.ex_date);
                    const prevPrevDate = new Date(prevPrev.ex_date);
                    prevDaysSincePrev = Math.round((prevDate.getTime() - prevPrevDate.getTime()) / (1000 * 60 * 60 * 24));
                }
                // Find last Regular dividend before previous to calculate days since last regular
                let prevDaysSinceLastRegular: number | null = null;
                const prevLastRegular = findLastRegularDividend(dividends, i - 1, calculatedTypes);
                if (prevLastRegular) {
                    const prevDate = new Date(previous.ex_date);
                    const prevLastRegularDate = new Date(prevLastRegular.dividend.ex_date);
                    prevDaysSinceLastRegular = Math.round((prevDate.getTime() - prevLastRegularDate.getTime()) / (1000 * 60 * 60 * 24));
                } else if (prevDaysSincePrev !== null) {
                    prevDaysSinceLastRegular = prevDaysSincePrev;
                }
                // Get previous dividend's next (which is current) for amount-based detection
                const prevDaysToNext = daysSincePrev; // Days from previous to current
                const prevAmount = previous.adj_amount ?? previous.div_cash;
                const currentAmount = current.adj_amount ?? current.div_cash;
                const prevPmtType = getPaymentType(prevDaysSincePrev, prevDaysSinceLastRegular, prevAmount, currentAmount, prevDaysToNext);
                
                // Recalculate annualized and normalized for previous dividend with updated frequency
                let prevAnnualized: number | null = null;
                let prevNormalizedDiv: number | null = null;
                if (prevPmtType === 'Regular') {
                    const prevAmount = previous.adj_amount !== null && previous.adj_amount > 0
                        ? Number(previous.adj_amount)
                        : null;
                    if (prevAmount !== null && prevAmount > 0) {
                        const annualizedRaw = prevAmount * prevFrequencyNum;
                        prevAnnualized = Number(annualizedRaw.toFixed(2));
                        prevNormalizedDiv = Number((annualizedRaw / 52).toFixed(9));
                        prevResult.annualized = prevAnnualized;
                        prevResult.normalized = prevNormalizedDiv;
                    }
                }
                
                // Update the database for the PREVIOUS dividend with its correct frequency
                const { error: prevUpdateError } = await supabase
                    .from('dividends_detail')
                    .update({
                        frequency_num: prevFrequencyNum,
                        annualized: prevAnnualized,
                        normalized_div: prevNormalizedDiv,
                    })
                    .eq('id', previous.id);
                
                if (prevUpdateError) {
                    console.error(`  Error updating previous dividend ${previous.id}:`, prevUpdateError);
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

    // Show just normalized values column for easy comparison (most recent first)
    console.log('\n============================================');
    console.log('Normalized values (NORMLZD column) - Most Recent First:');
    console.log('============================================');
    // results is already in reverse order (most recent first), so don't reverse again
    results.forEach(r => {
        if (r.normalized !== null) {
            // Match spreadsheet format: remove trailing zeros for whole numbers, keep precision for decimals
            const norm = r.normalized;
            if (norm % 1 === 0) {
                console.log(norm.toFixed(0));
            } else {
                // For decimals, show up to 9 places but remove trailing zeros
                const str = norm.toFixed(9).replace(/\.?0+$/, '');
                console.log(str);
            }
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
