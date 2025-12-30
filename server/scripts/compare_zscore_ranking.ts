/**
 * Compare Z-Score Ranking - CEO vs Website
 * Shows exactly what the difference is between CEO's ranking and website's ranking
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

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

for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ ERROR: Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface CEFData {
  ticker: string;
  zScore: number | null;
}

// CEO's expected Z-score ranking from spreadsheet
const CEO_ZSCORE_RANKING: { [ticker: string]: number } = {
  'FFA': 1,
  'CSQ': 2,
  'GOF': 3,
  'UTF': 4,
  'PCN': 5,
  'UTG': 6,
  'BTO': 7,
  'FOF': 8,
  'DNP': 9,
  'BME': 10,
  'IGR': 11,
  'GAB': 12,
};

async function fetchCEFData(): Promise<CEFData[]> {
  const { data: cefs, error } = await supabase
    .from("etf_static")
    .select("ticker, five_year_z_score")
    .eq("category", "CEF")
    .order("ticker", { ascending: true });

  if (error) {
    console.error("❌ Error fetching CEFs:", error);
    process.exit(1);
  }

  const cefData: CEFData[] = (cefs || []).map((cef: any) => ({
    ticker: cef.ticker,
    zScore: cef.five_year_z_score ?? null,
  }));

  return cefData.filter(
    (c) => c.zScore !== null && !isNaN(c.zScore)
  );
}

function compareRankings(cefData: CEFData[]) {
  console.log("=".repeat(120));
  console.log("Z-SCORE RANKING COMPARISON: CEO vs WEBSITE");
  console.log("=".repeat(120));
  console.log();

  // Sort Z-scores from lowest (most negative) to highest
  const zScoreSorted = [...cefData]
    .filter((c) => c.zScore !== null && !isNaN(c.zScore))
    .sort((a, b) => (a.zScore ?? 0) - (b.zScore ?? 0));

  // Calculate website's ranking (with tie-breaking)
  const websiteRanking: { [ticker: string]: number } = {};
  let websiteCurrentRank = 1;
  zScoreSorted.forEach((cef, index) => {
    if (index > 0) {
      const prevZScore = zScoreSorted[index - 1].zScore ?? 0;
      const currentZScore = cef.zScore ?? 0;
      if (Math.abs(prevZScore - currentZScore) > 0.0001) {
        websiteCurrentRank = index + 1;
      }
    }
    websiteRanking[cef.ticker] = websiteCurrentRank;
  });

  console.log("COMPARISON TABLE:");
  console.log("-".repeat(120));
  console.log(
    "TICKER".padEnd(8) +
    "Z-SCORE".padEnd(12) +
    "CEO RANK".padEnd(12) +
    "WEBSITE RANK".padEnd(15) +
    "MATCH".padEnd(10) +
    "NOTES"
  );
  console.log("-".repeat(120));

  // Sort by CEO's ranking for display
  const sortedByCEORank = [...cefData]
    .filter(c => CEO_ZSCORE_RANKING[c.ticker] !== undefined)
    .sort((a, b) => (CEO_ZSCORE_RANKING[a.ticker] ?? 999) - (CEO_ZSCORE_RANKING[b.ticker] ?? 999));

  sortedByCEORank.forEach(cef => {
    const ceoRank = CEO_ZSCORE_RANKING[cef.ticker];
    const websiteRank = websiteRanking[cef.ticker] ?? 999;
    const match = ceoRank === websiteRank ? "✓" : "✗";
    
    const zScoreStr = cef.zScore! >= 0 
      ? cef.zScore!.toFixed(2) 
      : `(${Math.abs(cef.zScore!).toFixed(2)})`;
    
    let notes = "";
    if (ceoRank !== websiteRank) {
      // Find what should be the correct rank based on Z-score value
      const correctRank = websiteRank;
      notes = `Should be rank ${correctRank} (Z-score ${zScoreStr})`;
    }

    console.log(
      cef.ticker.padEnd(8) +
      zScoreStr.padEnd(12) +
      ceoRank.toString().padEnd(12) +
      websiteRank.toString().padEnd(15) +
      match.padEnd(10) +
      notes
    );
  });

  console.log();
  console.log("=".repeat(120));
  console.log("ANALYSIS:");
  console.log("=".repeat(120));
  console.log();

  // Check for discrepancies
  const mismatches = sortedByCEORank.filter(c => 
    CEO_ZSCORE_RANKING[c.ticker] !== websiteRanking[c.ticker]
  );

  if (mismatches.length === 0) {
    console.log("✓ All rankings match!");
  } else {
    console.log(`⚠️  Found ${mismatches.length} mismatches:`);
    console.log();
    
    mismatches.forEach(cef => {
      const ceoRank = CEO_ZSCORE_RANKING[cef.ticker];
      const websiteRank = websiteRanking[cef.ticker];
      const zScore = cef.zScore!;
      
      console.log(`  ${cef.ticker}:`);
      console.log(`    CEO Rank: ${ceoRank}`);
      console.log(`    Website Rank: ${websiteRank} (based on Z-score ${zScore.toFixed(2)})`);
      
      // Find what Z-score should have CEO's rank
      const ceoRankPosition = zScoreSorted.findIndex(c => websiteRanking[c.ticker] === ceoRank);
      if (ceoRankPosition >= 0) {
        const expectedZScore = zScoreSorted[ceoRankPosition].zScore!;
        console.log(`    Expected Z-score for rank ${ceoRank}: ${expectedZScore.toFixed(2)}`);
        console.log(`    Difference: ${Math.abs(zScore - expectedZScore).toFixed(2)}`);
      }
      console.log();
    });
  }

  console.log("=".repeat(120));
  console.log("EXPLANATION:");
  console.log("=".repeat(120));
  console.log("1. Website sorts Z-scores from LOWEST (most negative) to HIGHEST");
  console.log("2. Lower Z-score = Better rank (rank 1 = best)");
  console.log("3. CEFs with SAME Z-score get SAME rank");
  console.log("4. If CEO's ranking differs, possible reasons:");
  console.log("   a) CEO is using different Z-score values");
  console.log("   b) CEO is using a different tie-breaking method");
  console.log("   c) CEO is ranking a different set of CEFs");
  console.log("=".repeat(120));
}

async function main() {
  try {
    const cefData = await fetchCEFData();
    compareRankings(cefData);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();

