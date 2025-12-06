/**
 * recalc_ranks.ts - Quick script to recalculate and save rankings
 * 
 * Usage: npx tsx scripts/recalc_ranks.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { calculateRankings } from '../src/services/metrics.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
    console.log('============================================');
    console.log('Recalculating ETF Rankings');
    console.log('============================================\n');

    console.log('[Rankings] Calculating weighted ranks...');
    const rankings = await calculateRankings();
    console.log(`[Rankings] Calculated ranks for ${rankings.length} ETFs\n`);

    // Show top 10
    console.log('Top 10 ETFs by composite score:');
    rankings.slice(0, 10).forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.ticker} - Yield: ${r.yield?.toFixed(1) || 'N/A'}%, Return: ${r.totalReturn?.toFixed(1) || 'N/A'}%, Score: ${r.compositeScore.toFixed(3)}`);
    });

    console.log('\n[Rankings] Saving ranks to database...');

    let saved = 0;
    for (const ranked of rankings) {
        const { error } = await supabase
            .from('etf_static')
            .update({ weighted_rank: ranked.rank })
            .eq('ticker', ranked.ticker);

        if (!error) {
            saved++;
        } else {
            console.error(`  Failed to save rank for ${ranked.ticker}: ${error.message}`);
        }
    }

    console.log(`[Rankings] ✅ Saved ${saved}/${rankings.length} ranks to database`);
    console.log('\nDone!');
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
