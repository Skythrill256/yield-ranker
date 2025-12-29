/**
 * GOOY Normalization Verification Script
 * 
 * This script fetches GOOY dividend data and displays all normalization calculations
 * in a format that matches the CEO's spreadsheet structure.
 * 
 * Columns shown:
 * - DATE
 * - DIVIDEND (raw amount)
 * - ADJ DIV (adjusted amount)
 * - DAYS (days since previous)
 * - TYPE (Regular/Special/Initial)
 * - FREQ (frequency: 52=weekly, 12=monthly, 4=quarterly)
 * - ANNLZD (annualized: adj_amount × frequency)
 * - NORMALZD (normalized: annualized / 52)
 * 
 * Usage: npx tsx scripts/verify_gooy_normalization.ts
 */

// CRITICAL: Load environment variables FIRST
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
import { calculateNormalizedDividends } from '../src/services/dividendNormalization.js';

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

interface DividendRow {
    DATE: string;
    DIVIDEND: number;
    ADJ_DIV: number;
    DAYS: number | null;
    TYPE: string;
    FREQ: number;
    ANNLZD: number | null;
    NORMALZD: number | null;
}

/**
 * Format number to 4 decimal places
 */
function formatAmount(num: number | null): string {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    return num.toFixed(4);
}

/**
 * Format number to 2 decimal places
 */
function formatAnnualized(num: number | null): string {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    return num.toFixed(2);
}

/**
 * Format frequency number to string
 */
function formatFrequency(freq: number | null): string {
    if (freq === null || freq === undefined) return 'N/A';
    if (freq === 52) return '52 (Weekly)';
    if (freq === 12) return '12 (Monthly)';
    if (freq === 4) return '4 (Quarterly)';
    if (freq === 2) return '2 (Semi-Annual)';
    if (freq === 1) return '1 (Annual)';
    return `${freq}`;
}

async function verifyGOOYNormalization() {
    console.log('='.repeat(100));
    console.log('GOOY DIVIDEND NORMALIZATION VERIFICATION');
    console.log('='.repeat(100));
    console.log('');

    const ticker = 'GOOY';

    // Fetch all dividends from database
    const { data: dividends, error } = await supabase
        .from('dividends_detail')
        .select('id, ticker, ex_date, div_cash, adj_amount')
        .eq('ticker', ticker.toUpperCase())
        .order('ex_date', { ascending: true });

    if (error) {
        console.error(`Error fetching dividends for ${ticker}:`, error);
        process.exit(1);
    }

    if (!dividends || dividends.length === 0) {
        console.error(`No dividends found for ${ticker}`);
        process.exit(1);
    }

    console.log(`Found ${dividends.length} dividends for ${ticker}\n`);

    // Calculate normalized values using the service
    const normalizedResults = calculateNormalizedDividends(
        dividends.map(d => ({
            id: d.id,
            ticker: d.ticker,
            ex_date: d.ex_date,
            div_cash: Number(d.div_cash),
            adj_amount: d.adj_amount ? Number(d.adj_amount) : null,
        }))
    );

    // Create a map for quick lookup
    const normalizedMap = new Map<number, typeof normalizedResults[0]>();
    normalizedResults.forEach(n => normalizedMap.set(n.id, n));

    // Prepare output table
    const rows: DividendRow[] = dividends.map((div, index) => {
        const normalized = normalizedMap.get(div.id)!;
        const prevDiv = index > 0 ? dividends[index - 1] : null;

        // Calculate days
        let days: number | null = null;
        if (prevDiv) {
            const currentDate = new Date(div.ex_date);
            const prevDate = new Date(prevDiv.ex_date);
            days = Math.round((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        return {
            DATE: div.ex_date.split('T')[0],
            DIVIDEND: Number(div.div_cash),
            ADJ_DIV: div.adj_amount ? Number(div.adj_amount) : Number(div.div_cash),
            DAYS: days,
            TYPE: normalized.pmt_type,
            FREQ: normalized.frequency_num,
            ANNLZD: normalized.annualized,
            NORMALZD: normalized.normalized_div,
        };
    });

    // Print header
    console.log('CALCULATION LOGIC SUMMARY:');
    console.log('-'.repeat(100));
    console.log('1. DAYS: Days between current and previous dividend ex-date');
    console.log('2. TYPE: ≤5 days = Special, >5 days = Regular, null days = Initial');
    console.log('3. FREQ: Determined by looking AHEAD to next dividend gap (backward confirmation)');
    console.log('   - 7-10 days → 52 (Weekly)');
    console.log('   - 25-35 days → 12 (Monthly)');
    console.log('   - 80-100 days → 4 (Quarterly)');
    console.log('   - 6 days → 52 (Weekly, early payment)');
    console.log('   - 11-24 days → 12 (Monthly, bi-weekly treated as monthly)');
    console.log('4. ANNLZD = ADJ_DIV × FREQ (only for Regular dividends)');
    console.log('5. NORMALZD = ANNLZD / 52 (weekly equivalent rate, only for Regular dividends)');
    console.log('');

    // Print table header
    console.log('='.repeat(100));
    console.log('DIVIDEND TABLE (Oldest to Newest)');
    console.log('='.repeat(100));
    console.log(
        'DATE       '.padEnd(12) +
        'DIVIDEND   '.padEnd(12) +
        'ADJ DIV    '.padEnd(12) +
        'DAYS       '.padEnd(12) +
        'TYPE       '.padEnd(12) +
        'FREQ       '.padEnd(15) +
        'ANNLZD     '.padEnd(12) +
        'NORMALZD   '.padEnd(12)
    );
    console.log('-'.repeat(100));

    // Print each row
    rows.forEach(row => {
        const dateStr = row.DATE.padEnd(12);
        const divStr = formatAmount(row.DIVIDEND).padEnd(12);
        const adjDivStr = formatAmount(row.ADJ_DIV).padEnd(12);
        const daysStr = (row.DAYS === null ? 'N/A' : row.DAYS.toString()).padEnd(12);
        const typeStr = row.TYPE.padEnd(12);
        const freqStr = formatFrequency(row.FREQ).padEnd(15);
        const annlzdStr = row.ANNLZD !== null ? formatAnnualized(row.ANNLZD).padEnd(12) : 'N/A'.padEnd(12);
        const normalzdStr = row.NORMALZD !== null ? formatAmount(row.NORMALZD).padEnd(12) : 'N/A'.padEnd(12);

        console.log(
            dateStr +
            divStr +
            adjDivStr +
            daysStr +
            typeStr +
            freqStr +
            annlzdStr +
            normalzdStr
        );
    });

    console.log('='.repeat(100));
    console.log('');

    // Print verification summary
    console.log('VERIFICATION CHECKLIST:');
    console.log('-'.repeat(100));
    
    // Check for frequency changes
    const frequencies = new Set(rows.map(r => r.FREQ));
    const hasFrequencyChange = frequencies.size > 1;
    
    console.log(`✓ Total dividends: ${rows.length}`);
    console.log(`✓ Frequency changes detected: ${hasFrequencyChange ? 'YES' : 'NO'}`);
    if (hasFrequencyChange) {
        console.log(`  Frequencies found: ${Array.from(frequencies).sort((a, b) => b - a).join(', ')}`);
    }
    console.log('');

    // Show sample calculations
    console.log('SAMPLE CALCULATIONS:');
    console.log('-'.repeat(100));
    
    // Find a weekly dividend
    const weeklyDiv = rows.find(r => r.FREQ === 52 && r.TYPE === 'Regular' && r.ANNLZD !== null);
    if (weeklyDiv) {
        console.log(`Weekly Example (${weeklyDiv.DATE}):`);
        console.log(`  ADJ_DIV: ${formatAmount(weeklyDiv.ADJ_DIV)}`);
        console.log(`  FREQ: ${weeklyDiv.FREQ} (Weekly)`);
        console.log(`  ANNLZD: ${formatAmount(weeklyDiv.ADJ_DIV)} × ${weeklyDiv.FREQ} = ${formatAnnualized(weeklyDiv.ANNLZD)}`);
        console.log(`  NORMALZD: ${formatAnnualized(weeklyDiv.ANNLZD)} / 52 = ${formatAmount(weeklyDiv.NORMALZD)}`);
        console.log(`  ✓ Expected: ${formatAmount(weeklyDiv.NORMALZD)} (should equal ADJ_DIV for weekly)`);
        console.log('');
    }

    // Find a monthly dividend
    const monthlyDiv = rows.find(r => r.FREQ === 12 && r.TYPE === 'Regular' && r.ANNLZD !== null);
    if (monthlyDiv) {
        console.log(`Monthly Example (${monthlyDiv.DATE}):`);
        console.log(`  ADJ_DIV: ${formatAmount(monthlyDiv.ADJ_DIV)}`);
        console.log(`  FREQ: ${monthlyDiv.FREQ} (Monthly)`);
        console.log(`  ANNLZD: ${formatAmount(monthlyDiv.ADJ_DIV)} × ${monthlyDiv.FREQ} = ${formatAnnualized(monthlyDiv.ANNLZD)}`);
        console.log(`  NORMALZD: ${formatAnnualized(monthlyDiv.ANNLZD)} / 52 = ${formatAmount(monthlyDiv.NORMALZD)}`);
        const expectedNormalized = monthlyDiv.ANNLZD! / 52;
        console.log(`  ✓ Expected: ${formatAmount(expectedNormalized)}`);
        console.log('');
    }

    // Show frequency transition point
    console.log('FREQUENCY TRANSITION ANALYSIS:');
    console.log('-'.repeat(100));
    for (let i = 0; i < rows.length - 1; i++) {
        const current = rows[i];
        const next = rows[i + 1];
        
        if (current.FREQ !== next.FREQ) {
            console.log(`Frequency change detected:`);
            console.log(`  ${current.DATE}: FREQ = ${formatFrequency(current.FREQ)}`);
            console.log(`  ${next.DATE}: FREQ = ${formatFrequency(next.FREQ)}`);
            console.log(`  Days between: ${next.DAYS} days`);
            console.log(`  This change confirms frequency ${next.FREQ} for dividend on ${current.DATE}`);
            console.log('');
        }
    }

    console.log('='.repeat(100));
    console.log('END OF VERIFICATION REPORT');
    console.log('='.repeat(100));
}

// Run verification
verifyGOOYNormalization().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});

