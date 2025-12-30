/**
 * CEF Ranking Breakdown Script
 * 
 * Shows detailed ranking calculation breakdown for CEO review
 * Displays each CEF with:
 * - Raw values (YIELD, Z-SCORE, TR 12MO, TR 6MO, TR 3MO)
 * - Rank for each metric (1 = best, higher = worse)
 * - Weighted total score
 * - Final rank
 * 
 * Usage: cd server && npm run show:cef:ranking [yieldWeight] [zScoreWeight] [tr12Weight] [tr6Weight] [tr3Weight]
 * Example: cd server && npm run show:cef:ranking 50 50 0 0 0
 * Default: 50% YIELD, 50% Z-SCORE (if no arguments provided)
 */

// CRITICAL: Load environment variables FIRST
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from multiple possible locations
const envPaths = [
  path.resolve(process.cwd(), '.env'),                    // Current working directory
  path.resolve(process.cwd(), '../.env'),                 // Parent of current directory
  path.resolve(__dirname, '../.env'),                      // server/.env
  path.resolve(__dirname, '../../.env'),                  // root/.env
  path.resolve(__dirname, '../../../yield-ranker/server/.env'), // yield-ranker/server/.env
  path.resolve(__dirname, '../../yield-ranker/server/.env'),    // root/yield-ranker/server/.env
];

let loadedEnvPath: string | null = null;

// Try all paths - dotenv.config() doesn't throw if file doesn't exist
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    loadedEnvPath = envPath;
    break;
  }
}

// If no path worked, try default location
if (!loadedEnvPath) {
  const defaultResult = dotenv.config();
  if (!defaultResult.error) {
    loadedEnvPath = 'default location';
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY) must be set in .env');
  if (loadedEnvPath) {
    console.error(`   .env file was loaded from: ${loadedEnvPath}`);
  } else {
    console.error(`   Could not find .env file in any of these locations:`);
    envPaths.forEach(p => console.error(`     - ${p}`));
    console.error(`   Please ensure .env file exists and contains SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY`);
  }
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
  
  // Default: 50% YIELD, 50% Z-SCORE (as CEO requested)
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

  const weights: Weights = {
    yield: parseFloat(args[0]) || 0,
    zScore: parseFloat(args[1]) || 0,
    return12Mo: parseFloat(args[2]) || 0,
    return6Mo: parseFloat(args[3]) || 0,
    return3Mo: parseFloat(args[4]) || 0,
  };

  // Validate weights sum to 100
  const total = weights.yield + weights.zScore + weights.return12Mo + weights.return6Mo + weights.return3Mo;
  if (Math.abs(total - 100) > 0.01) {
    console.warn(`⚠️  Warning: Weights sum to ${total}%, not 100%. Using provided values anyway.`);
  }

  return weights;
}

async function fetchCEFData(): Promise<CEFData[]> {
  console.log("📊 Fetching CEF data from database...\n");

  const { data: cefs, error } = await supabase
    .from("etf_static")
    .select("ticker, forward_yield, five_year_z_score, tr_drip_12m, tr_drip_6m, tr_drip_3m")
    .eq("category", "CEF")  // Use category filter to ensure we only get CEFs
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
    .map((c, index) => ({ ticker: c.ticker, rank: index + 1 }));
  const yieldRankMap = new Map(yieldRanked.map((r) => [r.ticker, r.rank]));

  // Rank Z-SCORE: Lower is better (rank 1 = lowest/most negative Z-score)
  // Handle ties: CEFs with same Z-score get same rank, next rank skips
  const zScoreSorted = [...cefData]
    .filter((c) => c.zScore !== null && !isNaN(c.zScore))
    .sort((a, b) => (a.zScore ?? 0) - (b.zScore ?? 0));
  
  const zScoreRanked: { ticker: string; rank: number }[] = [];
  let zScoreCurrentRank = 1;
  zScoreSorted.forEach((cef, index) => {
    // If this Z-score is different from previous, update rank
    if (index > 0) {
      const prevZScore = zScoreSorted[index - 1].zScore ?? 0;
      const currentZScore = cef.zScore ?? 0;
      // Only increment rank if Z-scores are different (accounting for floating point precision)
      if (Math.abs(prevZScore - currentZScore) > 0.0001) {
        zScoreCurrentRank = index + 1;
      }
    }
    zScoreRanked.push({ 
      ticker: cef.ticker, 
      rank: zScoreCurrentRank
    });
  });
  const zScoreRankMap = new Map(zScoreRanked.map((r) => [r.ticker, r.rank]));

  // Rank TR 12MO: Higher is better (rank 1 = highest return)
  const return12Ranked = [...cefData]
    .filter((c) => c.return12Mo !== null && !isNaN(c.return12Mo))
    .sort((a, b) => (b.return12Mo ?? 0) - (a.return12Mo ?? 0))
    .map((c, index) => ({ ticker: c.ticker, rank: index + 1 }));
  const return12RankMap = new Map(return12Ranked.map((r) => [r.ticker, r.rank]));

  // Rank TR 6MO: Higher is better (rank 1 = highest return)
  const return6Ranked = [...cefData]
    .filter((c) => c.return6Mo !== null && !isNaN(c.return6Mo))
    .sort((a, b) => (b.return6Mo ?? 0) - (a.return6Mo ?? 0))
    .map((c, index) => ({ ticker: c.ticker, rank: index + 1 }));
  const return6RankMap = new Map(return6Ranked.map((r) => [r.ticker, r.rank]));

  // Rank TR 3MO: Higher is better (rank 1 = highest return)
  const return3Ranked = [...cefData]
    .filter((c) => c.return3Mo !== null && !isNaN(c.return3Mo))
    .sort((a, b) => (b.return3Mo ?? 0) - (a.return3Mo ?? 0))
    .map((c, index) => ({ ticker: c.ticker, rank: index + 1 }));
  const return3RankMap = new Map(return3Ranked.map((r) => [r.ticker, r.rank]));

  // Calculate weighted scores for each CEF
  const rankedCEFs: RankedCEF[] = cefData.map((cef) => {
    const yieldRank = yieldRankMap.get(cef.ticker) ?? maxRank;
    const zScoreRank = zScoreRankMap.get(cef.ticker) ?? maxRank;
    const return12Rank = return12RankMap.get(cef.ticker) ?? maxRank;
    const return6Rank = return6RankMap.get(cef.ticker) ?? maxRank;
    const return3Rank = return3RankMap.get(cef.ticker) ?? maxRank;

    // Calculate weighted total score (lower is better)
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
      finalRank: 0, // Will be set after sorting
    };
  });

  // Sort by total score (lower is better) and assign final ranks with ties
  rankedCEFs.sort((a, b) => a.totalScore - b.totalScore);
  let currentRank = 1;
  rankedCEFs.forEach((cef, index) => {
    // If this CEF has a different score than the previous one, update the rank
    if (index > 0) {
      const prevScore = rankedCEFs[index - 1].totalScore;
      const currentScore = cef.totalScore;
      // Only increment rank if scores are different (accounting for floating point precision)
      if (Math.abs(prevScore - currentScore) > 0.0001) {
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

    // Build weight column (show which metrics have weight)
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
  console.log("NOTES:");
  console.log("- 1 = BEST, 6 = WORST (or N = worst if more than 6 CEFs)");
  console.log("- YIELD: Higher is better (rank 1 = highest yield)");
  console.log("- Z-SCORE: Lower is better (rank 1 = lowest/most negative Z-score)");
  console.log("- TR 12MO/6MO/3MO: Higher is better (rank 1 = highest return)");
  console.log("- TOTAL SCORE = (YIELD Rank × Yield Weight%) + (Z-SCORE Rank × Z-Score Weight%) + ...");
  console.log("- Lower TOTAL SCORE = Better Final Rank");
  console.log("- CEFs with same TOTAL SCORE get the same FINAL RANK");
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

