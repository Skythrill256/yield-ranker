/**
 * Show ULTY Dividend Table
 * Displays all dividend data exactly as stored in database
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

// Also try default location
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
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function showULTYDividends() {
    console.log('\n============================================');
    console.log('ULTY Dividend Table (Most Recent First)');
    console.log('============================================\n');

    const { data: dividends, error } = await supabase
        .from('dividends_detail')
        .select('*')
        .eq('ticker', 'ULTY')
        .order('ex_date', { ascending: false });

    if (error) {
        console.error('Error fetching dividends:', error);
        return;
    }

    if (!dividends || dividends.length === 0) {
        console.log('No dividends found for ULTY');
        return;
    }

    console.log('Total dividends:', dividends.length);
    console.log('\n============================================');
    console.log('DIVIDEND TABLE - What is being plotted:');
    console.log('============================================\n');

    // Header
    console.log('Date       | DIV_CASH (Bar) | ADJ_AMT (Line Calc) | NORMALZD (Line) | FREQ | DAYS | TYPE');
    console.log('-----------|----------------|---------------------|-----------------|------|------|------');

    dividends.forEach((div: any) => {
        const dateStr = new Date(div.ex_date).toISOString().split('T')[0];
        const divCash = div.div_cash !== null ? Number(div.div_cash).toFixed(4).padStart(14) : 'N/A'.padStart(14);
        const adjAmt = div.adj_amount !== null ? Number(div.adj_amount).toFixed(4).padStart(19) : 'N/A'.padStart(19);
        const normalized = div.normalized_div !== null ? Number(div.normalized_div).toFixed(9).padStart(15) : 'N/A'.padStart(15);
        const freq = div.frequency_num !== null ? String(div.frequency_num).padStart(4) : 'N/A'.padStart(4);
        const days = div.days_since_prev !== null ? String(div.days_since_prev).padStart(4) : 'N/A'.padStart(4);
        const type = (div.pmt_type || 'N/A').padStart(4);

        console.log(`${dateStr} | ${divCash} | ${adjAmt} | ${normalized} | ${freq} | ${days} | ${type}`);
    });

    console.log('\n============================================');
    console.log('WHAT IS PLOTTED:');
    console.log('============================================');
    console.log('BAR (Blue): Uses div_cash (unadjusted) - shown in DIV_CASH column');
    console.log('LINE (Red): Uses normalized_div (from adj_amount) - shown in NORMALZD column');
    console.log('\n============================================');
    console.log('VERIFICATION:');
    console.log('============================================\n');

    // Show first few and last few for verification
    console.log('First 5 dividends (oldest):');
    const oldest = [...dividends].reverse().slice(0, 5);
    oldest.forEach((div: any) => {
        const dateStr = new Date(div.ex_date).toISOString().split('T')[0];
        console.log(`  ${dateStr}: Bar=${div.div_cash}, Line=${div.normalized_div}, Adj=${div.adj_amount}`);
    });

    console.log('\nLast 5 dividends (most recent):');
    dividends.slice(0, 5).forEach((div: any) => {
        const dateStr = new Date(div.ex_date).toISOString().split('T')[0];
        console.log(`  ${dateStr}: Bar=${div.div_cash}, Line=${div.normalized_div}, Adj=${div.adj_amount}`);
    });

    console.log('\n============================================');
    console.log('SPLIT DETECTION:');
    console.log('============================================\n');

    // Check for split (where div_cash and adj_amount differ significantly)
    const splitDividends = dividends.filter((div: any) => {
        if (div.div_cash === null || div.adj_amount === null) return false;
        const divCash = Number(div.div_cash);
        const adjAmt = Number(div.adj_amount);
        if (divCash === 0 || adjAmt === 0) return false;
        const ratio = Math.max(divCash, adjAmt) / Math.min(divCash, adjAmt);
        return ratio > 1.5; // Significant difference indicates split
    });

    if (splitDividends.length > 0) {
        console.log(`Found ${splitDividends.length} dividends with significant div_cash vs adj_amount difference (likely split):\n`);
        splitDividends.slice(0, 10).forEach((div: any) => {
            const dateStr = new Date(div.ex_date).toISOString().split('T')[0];
            const divCash = Number(div.div_cash);
            const adjAmt = Number(div.adj_amount);
            const ratio = (adjAmt / divCash).toFixed(2);
            console.log(`  ${dateStr}: div_cash=${divCash.toFixed(4)}, adj_amount=${adjAmt.toFixed(4)}, ratio=${ratio}x`);
        });
    } else {
        console.log('No significant differences found (no split detected in data)');
    }
}

showULTYDividends().catch(console.error);

