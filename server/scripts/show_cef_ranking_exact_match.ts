/**
 * CEF Ranking Exact Match Script
 * 
 * Shows ranking breakdown matching CEO's exact format
 * Compares website calculation with CEO's manual calculation
 * 
 * Usage: cd server && npm run show:cef:exact [yieldWeight] [zScoreWeight] [tr12Weight] [tr6Weight] [tr3Weight]
 * Example: cd server && npm run show:cef:exact 50 50 0 0 0
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

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

let loadedEnvPath: string | null = null;
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    loadedEnvPath = envPath;
    break;
  }
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

interface Weights {
  yield: number;
  zScore: number;
  return12Mo: number;
  return6Mo: number;
  return3Mo: number;
}

function parseWeights(): Weights {
  const args = process.argv.slice(2);
  const defaultWeights: Weights = {
    yield: 50,
    zScore: 50,
    return12Mo: 0,
    return6Mo: 0,
    return3Mo: 0,
  };

  if (args.length === 0) {
    return defaultWeights;
  }

  return {
    yield: parseFloat(args[0]) || 0,
    zScore: parseFloat(args[1]) || 0,
    return12Mo: parseFloat(args[2]) || 0,
    return6Mo: parseFloat(args[3]) || 0,
    return3Mo: parseFloat(args[4]) || 0,
  };
}

async function fetchCEFData(): Promise<CEFData[]> {
  console.log("📊 Fetching CEF data from database...\n");

  const { data: cefs, error } = await supabase
    .from("etf_static")
    .select("ticker, forward_yield, five_year_z_score, tr_drip_12m, tr_drip_6m, tr_drip_3m")
    .eq("category", "CEF")
    .order("ticker", { ascending: true });

  if (error) {
    console.error("❌ Error fetching CEFs:", error);
    process.exit(1);
  }

  if (!cefs || cefs.length === 0) {
    console.error("❌ No CEFs found in database");
    process.exit(1);
  }

  const cefData: CEFData[] = cefs.map((cef: any) => ({
    ticker: cef.ticker,
    yield: cef.forward_yield ?? null,
    zScore: cef.five_year_z_score ?? null,
    return12Mo: cef.tr_drip_12m ?? null,
    return6Mo: cef.tr_drip_6m ?? null,
    return3Mo: cef.tr_drip_3m ?? null,
  }));

  // Filter to only CEFs with at least yield and zScore data
  const validCEFs = cefData.filter(
    (c) => c.yield !== null && c.zScore !== null && !isNaN(c.yield) && !isNaN(c.zScore) && c.yield > 0
  );

  console.log(`✅ Found ${validCEFs.length} CEFs with valid data\n`);
  return validCEFs;
}

function calculateRanks(cefData: CEFData[], weights: Weights): RankedCEF[] {
  const maxRank = cefData.length;

  // Rank YIELD: Higher is better (rank 1 = highest yield)
  const yieldRanked = [...cefData]
    .filter((c) => c.yield !== null && !isNaN(c.yield) && c.yield > 0)
    .sort((a, b) => (b.yield ?? 0) - (a.yield ?? 0))
    .map((c, index) => ({ ticker: c.ticker, rank: index + 1, value: c.yield ?? 0 }));
  const yieldRankMap = new Map(yieldRanked.map((r) => [r.ticker, r.rank]));

  // Rank Z-SCORE: Lower is better (rank 1 = lowest/most negative Z-score)
  const zScoreRanked = [...cefData]
    .filter((c) => c.zScore !== null && !isNaN(c.zScore))
    .sort((a, b) => (a.zScore ?? 0) - (b.zScore ?? 0))
    .map((c, index) => ({ ticker: c.ticker, rank: index + 1, value: c.zScore ?? 0 }));
  const zScoreRankMap = new Map(zScoreRanked.map((r) => [r.ticker, r.rank]));

  // Rank TR 12MO: Higher is better
  const return12Ranked = [...cefData]
    .filter((c) => c.return12Mo !== null && !isNaN(c.return12Mo))
    .sort((a, b) => (b.return12Mo ?? 0) - (a.return12Mo ?? 0))
    .map((c, index) => ({ ticker: c.ticker, rank: index + 1 }));
  const return12RankMap = new Map(return12Ranked.map((r) => [r.ticker, r.rank]));

  // Rank TR 6MO: Higher is better
  const return6Ranked = [...cefData]
    .filter((c) => c.return6Mo !== null && !isNaN(c.return6Mo))
    .sort((a, b) => (b.return6Mo ?? 0) - (a.return6Mo ?? 0))
    .map((c, index) => ({ ticker: c.ticker, rank: index + 1 }));
  const return6RankMap = new Map(return6Ranked.map((r) => [r.ticker, r.rank]));

  // Rank TR 3MO: Higher is better
  const return3Ranked = [...cefData]
    .filter((c) => c.return3Mo !== null && !isNaN(c.return3Mo))
    .sort((a, b) => (b.return3Mo ?? 0) - (a.return3Mo ?? 0))
    .map((c, index) => ({ ticker: c.ticker, rank: index + 1 }));
  const return3RankMap = new Map(return3Ranked.map((r) => [r.ticker, r.rank]));

  // Calculate weighted scores
  const rankedCEFs: RankedCEF[] = cefData.map((cef) => {
    const yieldRank = yieldRankMap.get(cef.ticker) ?? maxRank;
    const zScoreRank = zScoreRankMap.get(cef.ticker) ?? maxRank;
    const return12Rank = return12RankMap.get(cef.ticker) ?? maxRank;
    const return6Rank = return6RankMap.get(cef.ticker) ?? maxRank;
    const return3Rank = return3RankMap.get(cef.ticker) ?? maxRank;

    const totalScore =
      yieldRank * (weights.yield / 100) +
      zScoreRank * (weights.zScore / 100) +
      return12Rank * (weights.return12Mo / 100) +
      return6Rank * (weights.return6Mo / 100) +
      return3Rank * (weights.return3Mo / 100);

    return {
      ...cef,
      yieldRank,
      zScoreRank,
      return12Rank,
      return6Rank,
      return3Rank,
      totalScore,
      finalRank: 0,
    };
  });

  // Sort and assign final ranks with ties
  rankedCEFs.sort((a, b) => a.totalScore - b.totalScore);
  let currentRank = 1;
  rankedCEFs.forEach((cef, index) => {
    if (index > 0) {
      if (Math.abs(rankedCEFs[index - 1].totalScore - cef.totalScore) > 0.0001) {
        currentRank = index + 1;
      }
    }
    cef.finalRank = currentRank;
  });

  return rankedCEFs;
}

function formatNumber(value: number | null): string {
  if (value === null || isNaN(value)) return "N/A";
  if (value >= 0) return value.toFixed(2);
  return `(${Math.abs(value).toFixed(2)})`;
}

function formatPercent(value: number | null): string {
  if (value === null || isNaN(value)) return "N/A";
  return `${value.toFixed(2)}%`;
}

function printTable(rankedCEFs: RankedCEF[], weights: Weights) {
  console.log("=".repeat(150));
  console.log("CEF RANKING BREAKDOWN - TESTING RANKING PROGRAM");
  console.log("=".repeat(150));
  console.log(`ENTER WEIGHT - MUST = 100%`);
  console.log(`YIELD=${weights.yield}%, Z-SCORE=${weights.zScore}%, TR 12MO=${weights.return12Mo}%, TR 6MO=${weights.return6Mo}%, TR 3MO=${weights.return3Mo}%`);
  console.log("=".repeat(150));
  console.log();

  // Header - Match CEO's exact format
  console.log(
    "CEF".padEnd(8) +
    "YIELD".padEnd(10) +
    "Y SCORE".padEnd(10) +
    "Z-SCORE".padEnd(12) +
    "Z SCORE".padEnd(10) +
    "TR 12MO".padEnd(12) +
    "12 SCORE".padEnd(10) +
    "TR 6MO".padEnd(12) +
    "6 SCORE".padEnd(10) +
    "TR 3MO".padEnd(12) +
    "3 SCORE".padEnd(10) +
    "TOTAL SCORE".padEnd(15) +
    "WEIGHT %".padEnd(12) +
    "FINAL RANK"
  );
  console.log("-".repeat(150));

  // Data rows
  rankedCEFs.forEach((cef) => {
    const yieldStr = formatPercent(cef.yield);
    const zScoreStr = formatNumber(cef.zScore);
    const tr12Str = formatNumber(cef.return12Mo);
    const tr6Str = formatNumber(cef.return6Mo);
    const tr3Str = formatNumber(cef.return3Mo);

    // Build weight column
    let weightCol = "";
    if (weights.yield > 0) weightCol += `YIELD ${weights.yield}% `;
    if (weights.zScore > 0) weightCol += `Z SCORE ${weights.zScore}% `;
    if (weights.return3Mo > 0) weightCol += `TR 3MO ${weights.return3Mo}% `;
    if (weights.return6Mo > 0) weightCol += `TR 6MO ${weights.return6Mo}% `;
    if (weights.return12Mo > 0) weightCol += `TR 12MO ${weights.return12Mo}% `;
    if (weightCol === "") weightCol = "TOTAL 100.00%";

    console.log(
      cef.ticker.padEnd(8) +
      yieldStr.padEnd(10) +
      cef.yieldRank.toString().padEnd(10) +
      zScoreStr.padEnd(12) +
      cef.zScoreRank.toString().padEnd(10) +
      tr12Str.padEnd(12) +
      cef.return12Rank.toString().padEnd(10) +
      tr6Str.padEnd(12) +
      cef.return6Rank.toString().padEnd(10) +
      tr3Str.padEnd(12) +
      cef.return3Rank.toString().padEnd(10) +
      cef.totalScore.toFixed(2).padEnd(15) +
      weightCol.padEnd(12) +
      cef.finalRank.toString()
    );
  });

  console.log();
  console.log("=".repeat(150));
  console.log("EXPLANATION FOR CEO:");
  console.log("=".repeat(150));
  console.log("1. Each metric is ranked 1 to N (1 = BEST, N = WORST)");
  console.log("2. YIELD: Higher yield = better rank (rank 1 = highest yield)");
  console.log("3. Z-SCORE: Lower Z-score = better rank (rank 1 = most negative Z-score)");
  console.log("4. TR 12MO/6MO/3MO: Higher return = better rank (rank 1 = highest return)");
  console.log("5. TOTAL SCORE = (YIELD Rank × Yield Weight%) + (Z-SCORE Rank × Z-Score Weight%) + ...");
  console.log("6. Lower TOTAL SCORE = Better Final Rank");
  console.log("7. CEFs with identical TOTAL SCORE get the same FINAL RANK");
  console.log("8. If website ranking differs from your manual calculation:");
  console.log("   - Check if the same CEFs are being ranked (some may be filtered out)");
  console.log("   - Check if the data values match (yield, z-score, returns)");
  console.log("   - Check if weights are exactly the same");
  console.log("=".repeat(150));
}

async function main() {
  try {
    const weights = parseWeights();
    const cefData = await fetchCEFData();
    const rankedCEFs = calculateRanks(cefData, weights);
    printTable(rankedCEFs, weights);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();

