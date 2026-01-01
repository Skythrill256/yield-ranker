/**
 * Show Dividend Table in CEO's Spreadsheet Format
 * Includes normalized calculation using "newest frequency" logic
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../yield-ranker/server/.env'),
    path.resolve(__dirname, '../../yield-ranker/server/.env'),
];

let envLoaded = false;
for (const envPath of envPaths) {
    try {
        const result = dotenv.config({ path: envPath });
        if (!result.error && result.parsed && Object.keys(result.parsed).length > 0) {
            envLoaded = true;
            break;
        }
    } catch (e) {
        // Continue
    }
}

if (!envLoaded) {
    dotenv.config();
}

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function showCEOFormatTable(ticker: string) {
    console.log(`\n${ticker.toUpperCase()}\t\t\t\t\tMUST USE ADJ DIV\t\t\t\n`);
    
    const { data: dividends, error } = await supabase
        .from('dividends_detail')
        .select('*')
        .eq('ticker', ticker.toUpperCase())
        .order('ex_date', { ascending: false }); // Most recent first

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!dividends || dividends.length === 0) {
        console.log(`No dividends found for ${ticker}`);
        return;
    }

    // Reverse to chronological order for cumulative calculation
    const chronological = [...dividends].reverse();
    
    // Calculate cumulative split factor (working forward chronologically)
    let cumulativeSplitFactor = 1.0;
    const dividendsWithCumultv = chronological.map((div: any, index: number) => {
        // Update cumulative split factor based on current split_factor
        // For reverse splits, multiply by split_factor (e.g., 0.1 for 10:1 reverse)
        if (div.split_factor !== null && div.split_factor !== undefined && div.split_factor !== 1) {
            cumulativeSplitFactor = cumulativeSplitFactor * div.split_factor;
        }
        
        return {
            ...div,
            cumultv: cumulativeSplitFactor,
        };
    }).reverse(); // Reverse back to most recent first
    
    // Find newest frequency (most recent REGULAR dividend's frequency)
    let newestFrequency = 52; // Default
    for (const div of dividends) {
        if (div.pmt_type === 'Regular' && div.frequency_num) {
            newestFrequency = div.frequency_num;
            break;
        }
    }
    
    // Add normalized calculation using newest frequency
    const dividendsFinal = dividendsWithCumultv.map((div: any) => {
        // Formula: Using newest frequency (CEO's J6 approach)
        // If newest frequency = dividend's frequency, normalized = adj_amount
        // Otherwise, normalize using newest frequency
        let normalizedNewestFreq = null;
        if (div.adj_amount) {
            if (div.frequency_num === newestFrequency) {
                // Same frequency as newest - just use adj_amount
                normalizedNewestFreq = div.adj_amount;
            } else {
                // Different frequency - normalize using newest frequency
                normalizedNewestFreq = (div.adj_amount * newestFrequency) / 52;
            }
        }
        
        return {
            ...div,
            normalized_newest_freq: normalizedNewestFreq,
        };
    });

    // Header (matching CEO's format)
    console.log('EX-DIV DATE\tRECORD DTE\tPAY DATE\tDIVIDEND\tSPLIT FTR\tCUMULTV\tADJ DIV\tRegular\tDAYS\tFREQ\tANNLZD\tNORMLZD (Current)\tNORMLZD (Newest Freq)');
    console.log(''.padEnd(120, '-'));

    // Data rows (most recent first, matching CEO's format)
    dividendsFinal.forEach((div: any) => {
        const exDate = div.ex_date ? new Date(div.ex_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }).replace(/\//g, '/') : '';
        const recordDate = div.record_date ? new Date(div.record_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }).replace(/\//g, '/') : '';
        const payDate = div.pay_date ? new Date(div.pay_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }).replace(/\//g, '/') : '';
        const dividend = div.div_cash !== null ? `$${Number(div.div_cash).toFixed(4)}` : '';
        const splitFtr = div.split_factor !== null ? div.split_factor.toString() : '1';
        const cumultv = div.cumultv !== null ? div.cumultv.toString() : '1';
        const adjDiv = div.adj_amount !== null ? `$${Number(div.adj_amount).toFixed(4)}` : '';
        const regular = div.pmt_type || 'Regular';
        const days = div.days_since_prev !== null ? div.days_since_prev.toString() : '';
        const freq = div.frequency_num !== null ? div.frequency_num.toString() : '';
        const annlzd = div.annualized !== null ? Number(div.annualized).toFixed(2) : '';
        const normlzdCurrent = div.normalized_div !== null ? Number(div.normalized_div).toFixed(9).replace(/\.?0+$/, '') : '';
        const normlzdNewest = div.normalized_newest_freq !== null ? Number(div.normalized_newest_freq).toFixed(9).replace(/\.?0+$/, '') : '';

        console.log(`${exDate}\t${recordDate}\t${payDate}\t${dividend}\t${splitFtr}\t${cumultv}\t${adjDiv}\t${regular}\t${days}\t${freq}\t${annlzd}\t${normlzdCurrent}\t${normlzdNewest}`);
    });

    // Show newest frequency
    const newestFreq = dividends[0]?.frequency_num || 52;
    console.log(`\n============================================`);
    console.log(`Newest Frequency (J6): ${newestFreq}`);
    console.log(`============================================`);
    console.log(`\nNormalized Formula Options:`);
    console.log(`1. Current (uses dividend's own frequency): NORMLZD = (ADJ_DIV × FREQ) / 52`);
    console.log(`2. Newest Frequency (uses newest frequency for all): NORMLZD = (ADJ_DIV × ${newestFreq}) / 52`);
    console.log(`\nCEO's spreadsheet shows NORMLZD matching ADJ_DIV for monthly payments,`);
    console.log(`which suggests he might be using the dividend's own frequency but not dividing by 52.`);
    console.log(`However, "tracks by newest frequency" suggests using ${newestFreq} for all dividends.\n`);
}

// Get ticker from command line
const args = process.argv.slice(2);
const ticker = args.find(arg => arg.startsWith('--ticker='))?.split('=')[1] || args[0] || 'ULTY';

showCEOFormatTable(ticker).catch(console.error);

