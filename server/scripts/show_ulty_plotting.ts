/**
 * Show ULTY Plotting Values
 * Shows exactly what values are being used for bars vs line
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from multiple possible locations
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

async function showULTYPlotting() {
    console.log('\n============================================');
    console.log('ULTY - WHAT IS BEING PLOTTED');
    console.log('============================================\n');

    const { data: dividends, error } = await supabase
        .from('dividends_detail')
        .select('*')
        .eq('ticker', 'ULTY')
        .order('ex_date', { ascending: false });

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!dividends || dividends.length === 0) {
        console.log('No dividends found');
        return;
    }

    console.log('Date       | BAR (div_cash) | LINE (normalized_div) | ADJ_AMT | Ratio');
    console.log('-----------|----------------|----------------------|---------|------');

    dividends.forEach((div: any) => {
        const dateStr = new Date(div.ex_date).toISOString().split('T')[0];
        const barValue = div.div_cash !== null ? Number(div.div_cash).toFixed(4) : 'N/A';
        const lineValue = div.normalized_div !== null ? Number(div.normalized_div).toFixed(9) : 'N/A';
        const adjAmt = div.adj_amount !== null ? Number(div.adj_amount).toFixed(4) : 'N/A';
        
        let ratio = 'N/A';
        if (div.div_cash !== null && div.adj_amount !== null && div.div_cash > 0) {
            const ratioVal = Number(div.adj_amount) / Number(div.div_cash);
            ratio = ratioVal.toFixed(2) + 'x';
        }

        console.log(`${dateStr} | ${barValue.padStart(14)} | ${lineValue.padStart(20)} | ${adjAmt.padStart(7)} | ${ratio.padStart(5)}`);
    });

    console.log('\n============================================');
    console.log('KEY FINDINGS:');
    console.log('============================================\n');

    // Find split point
    const splitPoint = dividends.find((div: any) => {
        if (div.div_cash === null || div.adj_amount === null) return false;
        const ratio = Number(div.adj_amount) / Number(div.div_cash);
        return ratio > 1.5; // Significant difference
    });

    if (splitPoint) {
        const splitDate = new Date(splitPoint.ex_date).toISOString().split('T')[0];
        console.log(`Split detected around: ${splitDate}`);
        console.log(`  Before split: div_cash is 10x smaller than adj_amount`);
        console.log(`  After split: div_cash = adj_amount (they match)\n`);
    }

    console.log('CURRENT PLOTTING:');
    console.log('  BAR (Blue): Uses div_cash (unadjusted)');
    console.log('  LINE (Red): Uses normalized_div (from adj_amount)\n');

    console.log('BEFORE SPLIT ISSUE:');
    const beforeSplit = dividends.filter((div: any) => {
        if (div.div_cash === null || div.adj_amount === null) return false;
        const ratio = Number(div.adj_amount) / Number(div.div_cash);
        return ratio > 1.5;
    });

    if (beforeSplit.length > 0) {
        console.log(`  Found ${beforeSplit.length} dividends before split where bars are much smaller:`);
        console.log(`  Example: ${new Date(beforeSplit[0].ex_date).toISOString().split('T')[0]}`);
        console.log(`    Bar (div_cash): ${Number(beforeSplit[0].div_cash).toFixed(4)}`);
        console.log(`    Line (normalized): ${Number(beforeSplit[0].normalized_div).toFixed(4)}`);
        console.log(`    Difference: ${((Number(beforeSplit[0].normalized_div) / Number(beforeSplit[0].div_cash)) - 1).toFixed(0)}x larger\n`);
    }

    console.log('OPTIONS TO FIX BARS:');
    console.log('  1. Keep bars as div_cash (unadjusted) - bars stay small before split');
    console.log('  2. Change bars to adj_amount (adjusted) - bars align with line throughout');
    console.log('\n');
}

showULTYPlotting().catch(console.error);

