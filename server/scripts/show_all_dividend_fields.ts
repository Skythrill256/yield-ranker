/**
 * Show All Dividend Fields - Clean Format for Google Sheets
 * Displays all dividend fields in tab-separated format for easy copy/paste
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

// Also try default location
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

async function showAllDividendFields(ticker: string) {
    console.log(`\n============================================`);
    console.log(`All Dividend Fields for ${ticker}`);
    console.log(`============================================\n`);

    const { data: dividends, error } = await supabase
        .from('dividends_detail')
        .select('*')
        .eq('ticker', ticker.toUpperCase())
        .order('ex_date', { ascending: false });

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!dividends || dividends.length === 0) {
        console.log(`No dividends found for ${ticker}`);
        return;
    }

    // Get all possible fields from first dividend
    const allFields = Object.keys(dividends[0] || {});
    
    console.log(`Total dividends: ${dividends.length}`);
    console.log(`Total fields: ${allFields.length}\n`);

    // Header row (tab-separated for Google Sheets)
    const headers = [
        'ID',
        'TICKER',
        'EX_DATE',
        'DIV_CASH',
        'ADJ_AMOUNT',
        'SPLIT_FACTOR',
        'DAYS_SINCE_PREV',
        'PMT_TYPE',
        'FREQUENCY_NUM',
        'ANNUALIZED',
        'NORMALIZED_DIV',
        'PAY_DATE',
        'RECORD_DATE',
        'DECLARE_DATE',
        'DIV_TYPE',
        'IS_MANUAL',
        'CREATED_AT',
        'UPDATED_AT'
    ];

    // Output header (tab-separated)
    console.log(headers.join('\t'));

    // Output data rows (tab-separated)
    dividends.forEach((div: any) => {
        const row = [
            div.id ?? '',
            div.ticker ?? '',
            div.ex_date ? new Date(div.ex_date).toISOString().split('T')[0] : '',
            div.div_cash !== null && div.div_cash !== undefined ? div.div_cash.toString() : '',
            div.adj_amount !== null && div.adj_amount !== undefined ? div.adj_amount.toString() : '',
            div.split_factor !== null && div.split_factor !== undefined ? div.split_factor.toString() : '',
            div.days_since_prev !== null && div.days_since_prev !== undefined ? div.days_since_prev.toString() : '',
            div.pmt_type ?? '',
            div.frequency_num !== null && div.frequency_num !== undefined ? div.frequency_num.toString() : '',
            div.annualized !== null && div.annualized !== undefined ? div.annualized.toString() : '',
            div.normalized_div !== null && div.normalized_div !== undefined ? div.normalized_div.toString() : '',
            div.pay_date ? new Date(div.pay_date).toISOString().split('T')[0] : '',
            div.record_date ? new Date(div.record_date).toISOString().split('T')[0] : '',
            div.declare_date ? new Date(div.declare_date).toISOString().split('T')[0] : '',
            div.div_type ?? '',
            div.is_manual !== null && div.is_manual !== undefined ? div.is_manual.toString() : '',
            div.created_at ? new Date(div.created_at).toISOString().split('T')[0] : '',
            div.updated_at ? new Date(div.updated_at).toISOString().split('T')[0] : ''
        ];
        
        console.log(row.join('\t'));
    });

    console.log(`\n============================================`);
    console.log('Field Descriptions:');
    console.log('============================================');
    console.log('ID: Database record ID');
    console.log('TICKER: Stock ticker symbol');
    console.log('EX_DATE: Ex-dividend date');
    console.log('DIV_CASH: Unadjusted dividend amount');
    console.log('ADJ_AMOUNT: Adjusted dividend amount (for splits)');
    console.log('SPLIT_FACTOR: Split factor (e.g., 0.1 for 10:1 reverse split)');
    console.log('DAYS_SINCE_PREV: Days since previous dividend');
    console.log('PMT_TYPE: Payment type (Regular, Special, Initial)');
    console.log('FREQUENCY_NUM: Frequency number (52=weekly, 12=monthly, 4=quarterly)');
    console.log('ANNUALIZED: Annualized dividend (adj_amount × frequency_num)');
    console.log('NORMALIZED_DIV: Normalized dividend (weekly equivalent rate)');
    console.log('PAY_DATE: Payment date');
    console.log('RECORD_DATE: Record date');
    console.log('DECLARE_DATE: Declaration date');
    console.log('DIV_TYPE: Dividend type');
    console.log('IS_MANUAL: Whether dividend was manually entered');
    console.log('CREATED_AT: Record creation timestamp');
    console.log('UPDATED_AT: Record update timestamp');
    console.log('\n');
}

// Get ticker from command line args
const args = process.argv.slice(2);
const ticker = args.find(arg => arg.startsWith('--ticker='))?.split('=')[1] || args[0] || 'ULTY';

showAllDividendFields(ticker).catch(console.error);

