/**
 * Verify Ranking vs Database
 * Shows exactly what ranking the website calculates vs what's in database
 * Compares with CEO's expected ranking
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
  yield: number | null;
  zScore: number | null;
  return12Mo: number | null;
  return6Mo: number | null;
  return3Mo: number | null;
}

interface RankedCEF extends CEFData {
  yieldRank: number;
  zScoreRank: number;
  return12Rank: number;
  return6Rank: number;
  return3Rank: number;
  totalScore: number;
  finalRank: number;
}

// CEO's expected ranking from spreadsheet (50% Yield + 50% Z-Score)
const CEO_EXPECTED_RANKING: { [ticker: string]: number } = {
  'GOF': 1,
  'PCN': 2,
  'FFA': 3,
  'UTF': 3,
  'FOF': 5,
  'IGR': 5,
  'CSQ': 7,
  'DNP': 8,
  'BTO': 9,
  'GAB': 9,
  'BME': 11,
  'UTG': 12,
};

async function fetchCEFData(): Promise<CEFData[]> {
  const { data: cefs, error } = await supabase
    .from("etf_static")
    .select("ticker, forward_yield, five_year_z_score, tr_drip_12m, tr_drip_6m, tr_drip_3m")
    .eq("category", "CEF")
    .order("ticker", { ascending: true });

  if (error) {
    console.error("❌ Error fetching CEFs:", error);
    process.exit(1);
  }

  const cefData: CEFData[] = (cefs || []).map((cef: any) => ({
    ticker: cef.ticker,
    yield: cef.forward_yield ?? null,
    zScore: cef.five_year_z_score ?? null,
    return12Mo: cef.tr_drip_12m ?? null,
    return6Mo: cef.tr_drip_6m ?? null,
    return3Mo: cef.tr_drip_3m ?? null,
  }));

  return cefData.filter(
    (c) => c.yield !== null && c.zScore !== null && !isNaN(c.yield) && !isNaN(c.zScore) && c.yield > 0
  );
}

function calculateRanks(cefData: CEFData[], weights: { yield: number; zScore: number }): RankedCEF[] {
  const maxRank = cefData.length;

  // Rank YIELD: Higher is better
  const yieldRanked = [...cefData]
    .filter((c) => c.yield !== null && !isNaN(c.yield) && c.yield > 0)
    .sort((a, b) => (b.yield ?? 0) - (a.yield ?? 0))
    .map((c, index) => ({ ticker: c.ticker, rank: index + 1, value: c.yield ?? 0 }));
  const yieldRankMap = new Map(yieldRanked.map((r) => [r.ticker, r.rank]));

  // Rank Z-SCORE: Lower is better (with tie-breaking)
  const zScoreSorted = [...cefData]
    .filter((c) => c.zScore !== null && !isNaN(c.zScore))
    .sort((a, b) => (a.zScore ?? 0) - (b.zScore ?? 0));
  
  const zScoreRanked: { ticker: string; rank: number; value: number }[] = [];
  let zScoreCurrentRank = 1;
  zScoreSorted.forEach((cef, index) => {
    if (index > 0) {
      const prevZScore = zScoreSorted[index - 1].zScore ?? 0;
      const currentZScore = cef.zScore ?? 0;
      if (Math.abs(prevZScore - currentZScore) > 0.0001) {
        zScoreCurrentRank = index + 1;
      }
    }
    zScoreRanked.push({ 
      ticker: cef.ticker, 
      rank: zScoreCurrentRank,
      value: cef.zScore ?? 0
    });
  });
  const zScoreRankMap = new Map(zScoreRanked.map((r) => [r.ticker, r.rank]));

  // Calculate weighted scores
  const rankedCEFs: RankedCEF[] = cefData.map((cef) => {
    const yieldRank = yieldRankMap.get(cef.ticker) ?? maxRank;
    const zScoreRank = zScoreRankMap.get(cef.ticker) ?? maxRank;

    const totalScore = yieldRank * (weights.yield / 100) + zScoreRank * (weights.zScore / 100);

    return {
      ...cef,
      yieldRank,
      zScoreRank,
      return12Rank: 0,
      return6Rank: 0,
      return3Rank: 0,
      totalScore,
      finalRank: 0,
    };
  });

  // Sort and assign final ranks with ties
  rankedCEFs.sort((a, b) => a.totalScore - b.totalScore);
  let finalRank = 1;
  rankedCEFs.forEach((cef, index) => {
    if (index > 0) {
      if (Math.abs(rankedCEFs[index - 1].totalScore - cef.totalScore) > 0.0001) {
        finalRank = index + 1;
      }
    }
    cef.finalRank = finalRank;
  });

  return rankedCEFs;
}

function printComparison(rankedCEFs: RankedCEF[]) {
  console.log("=".repeat(150));
  console.log("RANKING VERIFICATION: WEBSITE vs CEO vs DATABASE");
  console.log("=".repeat(150));
  console.log("Weights: 50% Yield + 50% Z-Score");
  console.log("=".repeat(150));
  console.log();

  // Sort by website's final rank
  const sortedByWebsite = [...rankedCEFs].sort((a, b) => a.finalRank - b.finalRank);

  console.log("COMPARISON TABLE:");
  console.log("-".repeat(150));
  console.log(
    "WEBSITE".padEnd(10) +
    "CEO".padEnd(10) +
    "TICKER".padEnd(8) +
    "YIELD".padEnd(10) +
    "Y RANK".padEnd(10) +
    "Z-SCORE".padEnd(12) +
    "Z RANK".padEnd(10) +
    "TOTAL".padEnd(12) +
    "MATCH".padEnd(10) +
    "ISSUE"
  );
  console.log("-".repeat(150));

  sortedByWebsite.forEach(cef => {
    const websiteRank = cef.finalRank;
    const ceoRank = CEO_EXPECTED_RANKING[cef.ticker] ?? 999;
    const match = websiteRank === ceoRank ? "✓" : "✗";
    
    const yieldStr = cef.yield !== null ? `${cef.yield.toFixed(2)}%` : "N/A";
    const zScoreStr = cef.zScore !== null 
      ? (cef.zScore >= 0 ? cef.zScore.toFixed(2) : `(${Math.abs(cef.zScore).toFixed(2)})`)
      : "N/A";
    
    let issue = "";
    if (websiteRank !== ceoRank) {
      issue = `CEO expects ${ceoRank}, website shows ${websiteRank}`;
    }

    console.log(
      websiteRank.toString().padEnd(10) +
      (ceoRank === 999 ? "N/A" : ceoRank.toString()).padEnd(10) +
      cef.ticker.padEnd(8) +
      yieldStr.padEnd(10) +
      cef.yieldRank.toString().padEnd(10) +
      zScoreStr.padEnd(12) +
      cef.zScoreRank.toString().padEnd(10) +
      cef.totalScore.toFixed(2).padEnd(12) +
      match.padEnd(10) +
      issue
    );
  });

  console.log();
  console.log("=".repeat(150));
  console.log("DETAILED BREAKDOWN FOR TOP 3:");
  console.log("=".repeat(150));
  console.log();

  const top3 = sortedByWebsite.slice(0, 3);
  top3.forEach(cef => {
    console.log(`${cef.ticker} (Website Rank: ${cef.finalRank}, CEO Expected: ${CEO_EXPECTED_RANKING[cef.ticker] ?? 'N/A'}):`);
    console.log(`  YIELD: ${cef.yield?.toFixed(2)}% → Rank ${cef.yieldRank}`);
    console.log(`  Z-SCORE: ${cef.zScore !== null ? (cef.zScore >= 0 ? cef.zScore.toFixed(2) : `(${Math.abs(cef.zScore).toFixed(2)})`) : 'N/A'} → Rank ${cef.zScoreRank}`);
    console.log(`  TOTAL SCORE = (${cef.yieldRank} × 50%) + (${cef.zScoreRank} × 50%) = ${(cef.yieldRank * 0.5).toFixed(2)} + ${(cef.zScoreRank * 0.5).toFixed(2)} = ${cef.totalScore.toFixed(2)}`);
    console.log();
  });

  console.log("=".repeat(150));
  console.log("ANALYSIS:");
  console.log("=".repeat(150));
  console.log();

  const mismatches = sortedByWebsite.filter(c => 
    CEO_EXPECTED_RANKING[c.ticker] !== undefined && 
    CEO_EXPECTED_RANKING[c.ticker] !== c.finalRank
  );

  if (mismatches.length === 0) {
    console.log("✓ All rankings match CEO's expected ranking!");
  } else {
    console.log(`⚠️  Found ${mismatches.length} mismatches:`);
    console.log();
    
    mismatches.forEach(cef => {
      const ceoRank = CEO_EXPECTED_RANKING[cef.ticker];
      const websiteRank = cef.finalRank;
      
      console.log(`  ${cef.ticker}:`);
      console.log(`    CEO Expected: Rank ${ceoRank}`);
      console.log(`    Website Shows: Rank ${websiteRank}`);
      console.log(`    YIELD: ${cef.yield?.toFixed(2)}% (Rank ${cef.yieldRank})`);
      console.log(`    Z-SCORE: ${cef.zScore !== null ? (cef.zScore >= 0 ? cef.zScore.toFixed(2) : `(${Math.abs(cef.zScore).toFixed(2)})`) : 'N/A'} (Rank ${cef.zScoreRank})`);
      console.log(`    TOTAL SCORE: ${cef.totalScore.toFixed(2)}`);
      console.log();
    });
  }

  console.log("=".repeat(150));
}

async function main() {
  try {
    const weights = { yield: 50, zScore: 50 };
    const cefData = await fetchCEFData();
    const rankedCEFs = calculateRanks(cefData, weights);
    printComparison(rankedCEFs);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();

