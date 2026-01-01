/**
 * Test frequency fix for ULTY 3/6/25
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
];

for (const envPath of envPaths) {
    try {
        const result = dotenv.config({ path: envPath });
        if (!result.error && result.parsed && Object.keys(result.parsed).length > 0) {
            break;
        }
    } catch (e) {
        // Continue
    }
}

import { createClient } from '@supabase/supabase-js';
import { getFrequencyFromDays } from '../src/services/dividendNormalization.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function test() {
    const { data: dividends } = await supabase
        .from('dividends_detail')
        .select('id, ex_date, adj_amount')
        .eq('ticker', 'ULTY')
        .in('ex_date', ['2025-02-06', '2025-03-06', '2025-03-13'])
        .order('ex_date', { ascending: true });

    console.log('\n=== Testing ULTY Frequency Fix ===\n');
    
    if (!dividends || dividends.length < 3) {
        console.log('Not enough dividends found');
        return;
    }

    const div1 = dividends[0]; // 2/6
    const div2 = dividends[1]; // 3/6
    const div3 = dividends[2]; // 3/13

    console.log(`Div1 (2/6): ${div1.ex_date}`);
    console.log(`Div2 (3/6): ${div2.ex_date}`);
    console.log(`Div3 (3/13): ${div3.ex_date}\n`);

    const date1 = new Date(div1.ex_date);
    const date2 = new Date(div2.ex_date);
    const date3 = new Date(div3.ex_date);

    const daysSincePrev = Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
    const daysToNext = Math.round((date3.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`Days from 2/6 to 3/6: ${daysSincePrev}`);
    console.log(`Days from 3/6 to 3/13: ${daysToNext}\n`);

    const prevFreq = getFrequencyFromDays(daysSincePrev);
    const nextFreq = getFrequencyFromDays(daysToNext);

    console.log(`prevFreq (from ${daysSincePrev} days): ${prevFreq}`);
    console.log(`nextFreq (from ${daysToNext} days): ${nextFreq}\n`);

    console.log(`Are they different? ${prevFreq !== nextFreq}`);
    
    let frequencyNum = 12;
    if (daysSincePrev !== null && daysSincePrev > 5 && daysToNext > 5) {
        if (prevFreq !== nextFreq) {
            frequencyNum = prevFreq;
            console.log(`✓ Frequency transition detected! Using prevFreq = ${prevFreq}`);
        } else {
            frequencyNum = nextFreq;
            console.log(`No transition, using nextFreq = ${nextFreq}`);
        }
    }

    console.log(`\nFinal frequency for 3/6: ${frequencyNum}`);
    const adjAmount = Number(div2.adj_amount);
    const annualized = adjAmount * frequencyNum;
    const normalized = annualized / 52;
    
    console.log(`\nCalculation for 3/6:`);
    console.log(`  ADJ_AMT: ${adjAmount}`);
    console.log(`  FREQ: ${frequencyNum}`);
    console.log(`  ANNLZD: ${annualized.toFixed(2)}`);
    console.log(`  NORMALZD: ${normalized.toFixed(9)}`);
    console.log(`\nExpected: ~1.07`);
}

test().catch(console.error);

