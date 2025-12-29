/**
 * Check PCN price and NAV dates to understand why export ended on 12/22
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
import { getPriceHistory } from '../src/services/database.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkDates() {
    console.log('Checking PCN and XPCNX dates...\n');
    
    // Get recent dates for PCN
    const { data: pcnPrices, error: pcnError } = await supabase
        .from('prices_daily')
        .select('date, close')
        .eq('ticker', 'PCN')
        .gte('date', '2025-12-20')
        .order('date', { ascending: false })
        .limit(20);
    
    // Get recent dates for XPCNX
    const { data: xpcnxPrices, error: xpcnxError } = await supabase
        .from('prices_daily')
        .select('date, close')
        .eq('ticker', 'XPCNX')
        .gte('date', '2025-12-20')
        .order('date', { ascending: false })
        .limit(20);
    
    if (pcnError) {
        console.error('Error fetching PCN:', pcnError);
    } else {
        console.log('PCN Price Data (recent dates):');
        console.log('Date\t\tClose');
        console.log('─'.repeat(30));
        pcnPrices?.forEach(p => {
            console.log(`${p.date}\t${p.close || 'NULL'}`);
        });
        console.log(`\nTotal PCN records: ${pcnPrices?.length || 0}`);
    }
    
    console.log('\n');
    
    if (xpcnxError) {
        console.error('Error fetching XPCNX:', xpcnxError);
    } else {
        console.log('XPCNX NAV Data (recent dates):');
        console.log('Date\t\tClose');
        console.log('─'.repeat(30));
        xpcnxPrices?.forEach(p => {
            console.log(`${p.date}\t${p.close || 'NULL'}`);
        });
        console.log(`\nTotal XPCNX records: ${xpcnxPrices?.length || 0}`);
    }
    
    console.log('\n');
    console.log('Dates with BOTH PCN price AND XPCNX NAV:');
    console.log('─'.repeat(30));
    
    const pcnDates = new Set(pcnPrices?.map(p => p.date).filter(d => pcnPrices?.find(p => p.date === d && p.close && p.close > 0)) || []);
    const xpcnxDates = new Set(xpcnxPrices?.map(p => p.date).filter(d => xpcnxPrices?.find(p => p.date === d && p.close && p.close > 0)) || []);
    
    const bothDates = Array.from(pcnDates).filter(d => xpcnxDates.has(d)).sort().reverse();
    console.log(bothDates.join('\n'));
    console.log(`\nMost recent date with both: ${bothDates[0] || 'NONE FOUND'}`);
    
    // Also check what getPriceHistory returns
    console.log('\n');
    console.log('Using getPriceHistory (same as export script):');
    console.log('─'.repeat(50));
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 4);
    
    const [pcnHistory, xpcnxHistory] = await Promise.all([
        getPriceHistory('PCN', startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]),
        getPriceHistory('XPCNX', startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]),
    ]);
    
    const pcnRecent = pcnHistory.slice(-10);
    const xpcnxRecent = xpcnxHistory.slice(-10);
    
    console.log('\nPCN (last 10 from getPriceHistory):');
    pcnRecent.forEach(p => {
        console.log(`${(p as any).date}: close=${(p as any).close}`);
    });
    
    console.log('\nXPCNX (last 10 from getPriceHistory):');
    xpcnxRecent.forEach(p => {
        console.log(`${(p as any).date}: close=${(p as any).close}`);
    });
    
    // Find overlap
    const pcnMap = new Map(pcnHistory.map((p: any) => [p.date, p.close]));
    const xpcnxMap = new Map(xpcnxHistory.map((p: any) => [p.date, p.close]));
    const allDates = new Set([...pcnMap.keys(), ...xpcnxMap.keys()]);
    const sortedDates = Array.from(allDates).sort().reverse();
    
    console.log('\nMost recent dates with BOTH (from getPriceHistory):');
    let found = 0;
    for (const date of sortedDates) {
        const pcnPrice = pcnMap.get(date);
        const xpcnxNav = xpcnxMap.get(date);
        if (pcnPrice && pcnPrice > 0 && xpcnxNav && xpcnxNav > 0) {
            console.log(`${date}: PCN=${pcnPrice}, XPCNX=${xpcnxNav}`);
            found++;
            if (found >= 5) break;
        }
    }
}

checkDates().catch(console.error);

