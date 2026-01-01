/**
 * Show ULTY Full Dividend Table with All Fields
 * Shows all fields needed to compute adj div and normalized div
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

async function showULTYFullTable() {
    console.log('\n============================================');
    console.log('ULTY Full Dividend Table - Last 1 Year');
    console.log('============================================\n');

    // Get last 1 year of data
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

    const { data: dividends, error } = await supabase
        .from('dividends_detail')
        .select('*')
        .eq('ticker', 'ULTY')
        .gte('ex_date', oneYearAgoStr)
        .order('ex_date', { ascending: false });

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!dividends || dividends.length === 0) {
        console.log('No dividends found for ULTY in last year');
        return;
    }

    console.log(`Total dividends in last year: ${dividends.length}\n`);

    // Show all fields in table format
    console.log('EX_DATE    | REC_DATE  | PAY_DATE  | UNADJ_DIV | SPLIT_FACTOR | ADJ_DIV   | TYPE      | DAYS | FREQ | ANNLZD  | NORMALZD');
    console.log('-----------|-----------|-----------|-----------|--------------|-----------|-----------|------|------|---------|----------------');

    dividends.forEach((div: any) => {
        const exDate = div.ex_date ? new Date(div.ex_date).toISOString().split('T')[0] : 'N/A';
        const recDate = div.record_date ? new Date(div.record_date).toISOString().split('T')[0] : 'N/A';
        const payDate = div.pay_date ? new Date(div.pay_date).toISOString().split('T')[0] : 'N/A';
        const unadjDiv = div.div_cash !== null ? Number(div.div_cash).toFixed(4).padStart(9) : 'N/A'.padStart(9);
        const splitFactor = div.split_factor !== null ? Number(div.split_factor).toFixed(6).padStart(12) : 'N/A'.padStart(12);
        const adjDiv = div.adj_amount !== null ? Number(div.adj_amount).toFixed(4).padStart(9) : 'N/A'.padStart(9);
        const type = (div.div_type || 'N/A').padStart(9);
        const days = div.days_since_prev !== null ? String(div.days_since_prev).padStart(4) : 'N/A'.padStart(4);
        const freq = div.frequency_num !== null ? String(div.frequency_num).padStart(4) : 'N/A'.padStart(4);
        const annlzd = div.annualized !== null ? Number(div.annualized).toFixed(2).padStart(7) : 'N/A'.padStart(7);
        const normalzd = div.normalized_div !== null ? Number(div.normalized_div).toFixed(9).padStart(15) : 'N/A'.padStart(15);

        console.log(`${exDate} | ${recDate} | ${payDate} | ${unadjDiv} | ${splitFactor} | ${adjDiv} | ${type} | ${days} | ${freq} | ${annlzd} | ${normalzd}`);
    });

    console.log('\n============================================');
    console.log('VERIFICATION - 3/5/25 Issue:');
    console.log('============================================\n');

    const march5 = dividends.find((div: any) => {
        const date = new Date(div.ex_date).toISOString().split('T')[0];
        return date === '2025-03-06' || date === '2025-03-05';
    });

    if (march5) {
        console.log('3/5/25 Dividend:');
        console.log(`  EX_DATE: ${march5.ex_date}`);
        console.log(`  UNADJ_DIV (div_cash): ${march5.div_cash}`);
        console.log(`  ADJ_DIV (adj_amount): ${march5.adj_amount}`);
        console.log(`  FREQ (frequency_num): ${march5.frequency_num}`);
        console.log(`  ANNLZD (annualized): ${march5.annualized}`);
        console.log(`  NORMALZD (normalized_div): ${march5.normalized_div}`);
        console.log(`  DAYS (days_since_prev): ${march5.days_since_prev}`);
        
        // Calculate what it should be
        if (march5.adj_amount && march5.frequency_num) {
            const adjAmt = Number(march5.adj_amount);
            const freq = Number(march5.frequency_num);
            const calculatedAnnlzd = adjAmt * freq;
            const calculatedNormalzd = calculatedAnnlzd / 52;
            
            console.log(`\n  CALCULATION:`);
            console.log(`    Annualized = ${adjAmt} × ${freq} = ${calculatedAnnlzd.toFixed(2)}`);
            console.log(`    Normalized = ${calculatedAnnlzd.toFixed(2)} / 52 = ${calculatedNormalzd.toFixed(9)}`);
            console.log(`\n  EXPECTED: Normalized should be ~1.07 (if FREQ=12)`);
            console.log(`  ACTUAL: ${march5.normalized_div}`);
            
            if (freq === 52) {
                console.log(`\n  ISSUE: FREQ is 52 (weekly), but this should be 12 (monthly) before frequency change!`);
            }
        }
    } else {
        console.log('3/5/25 dividend not found in last year');
    }

    console.log('\n============================================');
    console.log('FREQUENCY CHANGES:');
    console.log('============================================\n');

    // Find frequency changes
    const sorted = [...dividends].sort((a: any, b: any) => 
        new Date(a.ex_date).getTime() - new Date(b.ex_date).getTime()
    );

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (prev.frequency_num !== curr.frequency_num) {
            const prevDate = new Date(prev.ex_date).toISOString().split('T')[0];
            const currDate = new Date(curr.ex_date).toISOString().split('T')[0];
            console.log(`Frequency change: ${prevDate} (FREQ=${prev.frequency_num}) → ${currDate} (FREQ=${curr.frequency_num})`);
            console.log(`  ${prevDate}: ADJ=${prev.adj_amount}, FREQ=${prev.frequency_num}, ANNLZD=${prev.annualized}, NORMALZD=${prev.normalized_div}`);
            console.log(`  ${currDate}: ADJ=${curr.adj_amount}, FREQ=${curr.frequency_num}, ANNLZD=${curr.annualized}, NORMALZD=${curr.normalized_div}\n`);
        }
    }
}

showULTYFullTable().catch(console.error);

