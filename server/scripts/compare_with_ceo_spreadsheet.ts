/**
 * Compare Our Calculations with CEO's Spreadsheet
 * Detailed field-by-field analysis
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

async function compareWithCEO() {
    console.log('\n============================================');
    console.log('FIELD-BY-FIELD COMPARISON WITH CEO SPREADSHEET');
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

    // CEO's expected values for key dates
    const ceoExpected: Record<string, any> = {
        '2025-03-05': { adj_div: 4.6530, freq: 12, annlzd: 55.84, normlzd: 4.653 },
        '2025-02-05': { adj_div: 5.3690, freq: 12, annlzd: 64.43, normlzd: 5.369 },
        '2025-01-07': { adj_div: 5.7150, freq: 12, annlzd: 68.58, normlzd: 5.715 },
        '2025-12-02': { adj_div: 0.5881, freq: 52, annlzd: 30.58, normlzd: 0.5881 },
        '2025-03-12': { adj_div: 1.0250, freq: 52, annlzd: 53.30, normlzd: 1.025 },
    };

    console.log('============================================');
    console.log('KEY DATES COMPARISON:');
    console.log('============================================\n');

    const keyDates = ['2025-03-05', '2025-03-12', '2025-02-05', '2025-12-02'];
    
    keyDates.forEach(dateStr => {
        const div = dividends.find(d => {
            const exDate = new Date(d.ex_date).toISOString().split('T')[0];
            return exDate === dateStr || exDate === dateStr.replace(/-0/g, '-');
        });

        if (!div) {
            console.log(`${dateStr}: NOT FOUND in database\n`);
            return;
        }

        const exDate = new Date(div.ex_date).toISOString().split('T')[0];
        const ourAdjDiv = div.adj_amount;
        const ourFreq = div.frequency_num;
        const ourAnnlzd = div.annualized;
        const ourNormlzd = div.normalized_div;

        const expected = ceoExpected[dateStr];
        if (expected) {
            console.log(`${exDate}:`);
            console.log(`  ADJ DIV:  Ours=${ourAdjDiv}, CEO=${expected.adj_div}, Match=${ourAdjDiv === expected.adj_div ? '✓' : '✗'}`);
            console.log(`  FREQ:     Ours=${ourFreq}, CEO=${expected.freq}, Match=${ourFreq === expected.freq ? '✓' : '✗'}`);
            console.log(`  ANNLZD:   Ours=${ourAnnlzd}, CEO=${expected.annlzd}, Match=${Math.abs((ourAnnlzd || 0) - expected.annlzd) < 0.01 ? '✓' : '✗'}`);
            console.log(`  NORMLZD:  Ours=${ourNormlzd}, CEO=${expected.normlzd}, Match=${ourNormlzd !== null && Math.abs(ourNormlzd - expected.normlzd) < 0.01 ? '✓' : '✗'}`);
            
            // Calculate what normalized SHOULD be
            if (ourAnnlzd && ourFreq) {
                const calculatedNorm = ourAnnlzd / 52;
                console.log(`  CALCULATION: ANNLZD / 52 = ${ourAnnlzd} / 52 = ${calculatedNorm}`);
                if (Math.abs(calculatedNorm - (expected.normlzd || 0)) > 0.01) {
                    console.log(`  ⚠️  ISSUE: CEO shows NORMLZD=${expected.normlzd}, but calculation gives ${calculatedNorm}`);
                    console.log(`     CEO's formula might be different or incorrect for monthly payments`);
                }
            }
            console.log('');
        }
    });

    console.log('\n============================================');
    console.log('FIELD FORMULA ANALYSIS:');
    console.log('============================================\n');

    console.log('1. DIVIDEND (div_cash):');
    console.log('   - Unadjusted dividend amount');
    console.log('   - ✓ We have this field');
    console.log('   - Source: Tiingo API\n');

    console.log('2. SPLIT FTR (split_factor):');
    console.log('   - Split factor (0.1 for 10:1 reverse split)');
    console.log('   - ✓ We have this field');
    console.log('   - Source: Tiingo API or calculated from price splits\n');

    console.log('3. CUMULTV (Cumulative Split Factor):');
    console.log('   - Cumulative split factor');
    console.log('   - ✗ We do NOT have this field in database');
    console.log('   - This appears to be: 1.0 before split, 0.1 after split');
    console.log('   - Can be calculated but not stored\n');

    console.log('4. ADJ DIV (adj_amount):');
    console.log('   - Adjusted dividend = DIVIDEND / CUMULTV (or DIVIDEND × SPLIT_FACTOR for reverse)');
    console.log('   - ✓ We have this field');
    console.log('   - Formula: adj_amount = div_cash / cumulative_split_factor');
    console.log('   - For ULTY: Before split (CUMULTV=1): ADJ DIV = DIVIDEND');
    console.log('               After split (CUMULTV=0.1): ADJ DIV = DIVIDEND / 0.1 = DIVIDEND × 10\n');

    console.log('5. DAYS (days_since_prev):');
    console.log('   - Days since previous dividend');
    console.log('   - ✓ We have this field');
    console.log('   - Calculated: current_ex_date - previous_ex_date\n');

    console.log('6. FREQ (frequency_num):');
    console.log('   - Frequency: 52=weekly, 12=monthly, 4=quarterly');
    console.log('   - ✓ We have this field');
    console.log('   - Calculated using backward confirmation rule\n');

    console.log('7. ANNLZD (annualized):');
    console.log('   - Annualized dividend');
    console.log('   - ✓ We have this field');
    console.log('   - Formula: ANNLZD = ADJ_DIV × FREQ');
    console.log('   - Example: ADJ_DIV=4.653, FREQ=12 → ANNLZD = 4.653 × 12 = 55.836 ≈ 55.84\n');

    console.log('8. NORMLZD (normalized_div):');
    console.log('   - Normalized dividend (weekly equivalent rate)');
    console.log('   - ✓ We have this field');
    console.log('   - OUR Formula: NORMLZD = ANNLZD / 52 = (ADJ_DIV × FREQ) / 52');
    console.log('   - Example: ADJ_DIV=4.653, FREQ=12 → ANNLZD=55.84 → NORMLZD = 55.84 / 52 = 1.0738');
    console.log('   - CEO shows: 4.653 for monthly payments');
    console.log('   - ⚠️  DISCREPANCY: CEO\'s formula appears different\n');

    console.log('\n============================================');
    console.log('CRITICAL ISSUE - NORMLZD CALCULATION:');
    console.log('============================================\n');

    console.log('CEO Spreadsheet shows for 3/5/2025:');
    console.log('  ADJ DIV = $4.6530');
    console.log('  FREQ = 12 (monthly)');
    console.log('  ANNLZD = 55.84');
    console.log('  NORMLZD = 4.653');

    console.log('\nOUR Calculation:');
    console.log('  ANNLZD = 4.653 × 12 = 55.836 ≈ 55.84 ✓');
    console.log('  NORMLZD = 55.84 / 52 = 1.0738 ✗ (CEO shows 4.653)');

    console.log('\nANALYSIS:');
    console.log('CEO appears to be using ADJ_DIV directly as NORMLZD for monthly payments.');
    console.log('This would mean:');
    console.log('  - For weekly (FREQ=52): NORMLZD = ADJ_DIV (correct - already weekly)');
    console.log('  - For monthly (FREQ=12): NORMLZD = ADJ_DIV (NOT normalized to weekly)');
    
    console.log('\nOUR Approach (standard normalization):');
    console.log('  - For weekly (FREQ=52): NORMLZD = ADJ_DIV (already weekly rate)');
    console.log('  - For monthly (FREQ=12): NORMLZD = (ADJ_DIV × 12) / 52 (convert to weekly equivalent)');
    
    console.log('\nQUESTION FOR CEO:');
    console.log('What is the intended meaning of NORMLZD?');
    console.log('  Option A: Weekly equivalent rate (our approach) - monthly $4.65 → weekly $1.07');
    console.log('  Option B: Adjusted dividend amount (CEO spreadsheet) - monthly $4.65 → monthly $4.65');
    console.log('\nFor comparison charts, Option A makes more sense as it allows direct comparison.');
    console.log('But we need to confirm CEO\'s intent.\n');

    console.log('\n============================================');
    console.log('MISSING FIELDS:');
    console.log('============================================\n');
    console.log('✗ CUMULTV (Cumulative Split Factor) - Not stored, can be calculated');
    console.log('  - Would need to track or calculate cumulative split factor\n');
    console.log('✓ All other fields are present and calculated\n');
}

compareWithCEO().catch(console.error);

