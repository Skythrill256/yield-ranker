/**
 * Explain Ranking Difference Script
 * 
 * Shows EXACTLY why website ranking differs from CEO's manual calculation
 * Compares each CEF's calculation step-by-step
 * 
 * Usage: cd server && npm run explain:ranking [yieldWeight] [zScoreWeight]
 * Example: cd server && npm run explain:ranking 50 50
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

interface Weights {
  yield: number;
  zScore: number;
  return12Mo: number;
  return6Mo: number;
  return3Mo: number;
}

function parseWeights(): Weights {
  const args = process.argv.slice(2);
  return {
    yield: parseFloat(args[0]) || 50,
    zScore: parseFloat(args[1]) || 50,
    return12Mo: 0,
    return6Mo: 0,
    return3Mo: 0,
  };
}

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

function calculateRanks(cefData: CEFData[], weights: Weights): RankedCEF[] {
  const maxRank = cefData.length;

  // Rank YIELD: Higher is better
  const yieldRanked = [...cefData]
    .filter((c) => c.yield !== null && !isNaN(c.yield) && c.yield > 0)
    .sort((a, b) => (b.yield ?? 0) - (a.yield ?? 0))
    .map((c, index) => ({ ticker: c.ticker, rank: index + 1, value: c.yield ?? 0 }));
  const yieldRankMap = new Map(yieldRanked.map((r) => [r.ticker, r.rank]));

  // Rank Z-SCORE: Lower is better
  // Handle ties: CEFs with same Z-score get same rank, next rank skips
  const zScoreSorted = [...cefData]
    .filter((c) => c.zScore !== null && !isNaN(c.zScore))
    .sort((a, b) => (a.zScore ?? 0) - (b.zScore ?? 0));
  
  const zScoreRanked: { ticker: string; rank: number; value: number }[] = [];
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
  let currentRank = 1;
  rankedCEFs.forEach((cef, index) => {
    if (index > 0) {
      // Check if scores are the same (within 0.0001 tolerance for floating point)
      const prevScore = rankedCEFs[index - 1].totalScore;
      const currentScore = cef.totalScore;
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

function printDetailedExplanation(rankedCEFs: RankedCEF[], weights: Weights) {
  console.log("=".repeat(150));
  console.log("EXACT RANKING CALCULATION - WHY WEBSITE DIFFERS FROM CEO");
  console.log("=".repeat(150));
  console.log(`Weights: YIELD=${weights.yield}%, Z-SCORE=${weights.zScore}%`);
  console.log("=".repeat(150));
  console.log();

  // Show CEO's expected top 4
  console.log("CEO'S EXPECTED RANKING:");
  console.log("  GOF = 1");
  console.log("  PCN = 2");
  console.log("  UTF = 3");
  console.log("  FFA = 3");
  console.log();

  // Show website's actual ranking
  console.log("WEBSITE'S ACTUAL RANKING:");
  const top4 = rankedCEFs.slice(0, 4);
  top4.forEach(cef => {
    console.log(`  ${cef.ticker} = ${cef.finalRank} (TOTAL SCORE: ${cef.totalScore.toFixed(2)})`);
  });
  console.log();

  // Find FFA and UTF
  const ffa = rankedCEFs.find(c => c.ticker === 'FFA');
  const utf = rankedCEFs.find(c => c.ticker === 'UTF');
  const fof = rankedCEFs.find(c => c.ticker === 'FOF');
  const gof = rankedCEFs.find(c => c.ticker === 'GOF');
  const pcn = rankedCEFs.find(c => c.ticker === 'PCN');

  console.log("=".repeat(150));
  console.log("DETAILED BREAKDOWN FOR KEY CEFs:");
  console.log("=".repeat(150));
  console.log();

  if (gof) {
    console.log(`GOF:`);
    console.log(`  YIELD: ${formatPercent(gof.yield)} → Rank ${gof.yieldRank}`);
    console.log(`  Z-SCORE: ${formatNumber(gof.zScore)} → Rank ${gof.zScoreRank}`);
    console.log(`  TOTAL SCORE = (${gof.yieldRank} × ${weights.yield}%) + (${gof.zScoreRank} × ${weights.zScore}%)`);
    console.log(`  TOTAL SCORE = ${(gof.yieldRank * weights.yield / 100).toFixed(2)} + ${(gof.zScoreRank * weights.zScore / 100).toFixed(2)} = ${gof.totalScore.toFixed(2)}`);
    console.log(`  FINAL RANK: ${gof.finalRank}`);
    console.log();
  }

  if (pcn) {
    console.log(`PCN:`);
    console.log(`  YIELD: ${formatPercent(pcn.yield)} → Rank ${pcn.yieldRank}`);
    console.log(`  Z-SCORE: ${formatNumber(pcn.zScore)} → Rank ${pcn.zScoreRank}`);
    console.log(`  TOTAL SCORE = (${pcn.yieldRank} × ${weights.yield}%) + (${pcn.zScoreRank} × ${weights.zScore}%)`);
    console.log(`  TOTAL SCORE = ${(pcn.yieldRank * weights.yield / 100).toFixed(2)} + ${(pcn.zScoreRank * weights.zScore / 100).toFixed(2)} = ${pcn.totalScore.toFixed(2)}`);
    console.log(`  FINAL RANK: ${pcn.finalRank}`);
    console.log();
  }

  if (fof) {
    console.log(`FOF:`);
    console.log(`  YIELD: ${formatPercent(fof.yield)} → Rank ${fof.yieldRank}`);
    console.log(`  Z-SCORE: ${formatNumber(fof.zScore)} → Rank ${fof.zScoreRank}`);
    console.log(`  TOTAL SCORE = (${fof.yieldRank} × ${weights.yield}%) + (${fof.zScoreRank} × ${weights.zScore}%)`);
    console.log(`  TOTAL SCORE = ${(fof.yieldRank * weights.yield / 100).toFixed(2)} + ${(fof.zScoreRank * weights.zScore / 100).toFixed(2)} = ${fof.totalScore.toFixed(2)}`);
    console.log(`  FINAL RANK: ${fof.finalRank}`);
    console.log();
  }

  if (utf) {
    console.log(`UTF:`);
    console.log(`  YIELD: ${formatPercent(utf.yield)} → Rank ${utf.yieldRank}`);
    console.log(`  Z-SCORE: ${formatNumber(utf.zScore)} → Rank ${utf.zScoreRank}`);
    console.log(`  TOTAL SCORE = (${utf.yieldRank} × ${weights.yield}%) + (${utf.zScoreRank} × ${weights.zScore}%)`);
    console.log(`  TOTAL SCORE = ${(utf.yieldRank * weights.yield / 100).toFixed(2)} + ${(utf.zScoreRank * weights.zScore / 100).toFixed(2)} = ${utf.totalScore.toFixed(2)}`);
    console.log(`  FINAL RANK: ${utf.finalRank}`);
    console.log();
  }

  if (ffa) {
    console.log(`FFA:`);
    console.log(`  YIELD: ${formatPercent(ffa.yield)} → Rank ${ffa.yieldRank}`);
    console.log(`  Z-SCORE: ${formatNumber(ffa.zScore)} → Rank ${ffa.zScoreRank}`);
    console.log(`  TOTAL SCORE = (${ffa.yieldRank} × ${weights.yield}%) + (${ffa.zScoreRank} × ${weights.zScore}%)`);
    console.log(`  TOTAL SCORE = ${(ffa.yieldRank * weights.yield / 100).toFixed(2)} + ${(ffa.zScoreRank * weights.zScore / 100).toFixed(2)} = ${ffa.totalScore.toFixed(2)}`);
    console.log(`  FINAL RANK: ${ffa.finalRank}`);
    console.log();
  }

  console.log("=".repeat(150));
  console.log("WHY THE DIFFERENCE:");
  console.log("=".repeat(150));
  console.log();

  // Check for ties
  const scoresWithCounts = new Map<number, string[]>();
  rankedCEFs.forEach(cef => {
    const score = Math.round(cef.totalScore * 100) / 100; // Round to 2 decimals
    if (!scoresWithCounts.has(score)) {
      scoresWithCounts.set(score, []);
    }
    scoresWithCounts.get(score)!.push(cef.ticker);
  });

  console.log("CEFs WITH SAME TOTAL SCORE (should get same rank):");
  scoresWithCounts.forEach((tickers, score) => {
    if (tickers.length > 1) {
      const cefs = rankedCEFs.filter(c => tickers.includes(c.ticker));
      const ranks = [...new Set(cefs.map(c => c.finalRank))];
      console.log(`  TOTAL SCORE ${score.toFixed(2)}: ${tickers.join(', ')}`);
      console.log(`    → All should have rank ${ranks[0]}, but website shows: ${cefs.map(c => `${c.ticker}=${c.finalRank}`).join(', ')}`);
      if (ranks.length > 1) {
        console.log(`    ⚠️  PROBLEM: Different ranks for same score!`);
      } else {
        console.log(`    ✓ Correct: All have rank ${ranks[0]}`);
      }
    }
  });
  console.log();

  if (fof && utf && ffa) {
    console.log("SPECIFIC ISSUE:");
    console.log(`  FOF has TOTAL SCORE ${fof.totalScore.toFixed(2)} → Rank ${fof.finalRank}`);
    console.log(`  UTF has TOTAL SCORE ${utf.totalScore.toFixed(2)} → Rank ${utf.finalRank}`);
    console.log(`  FFA has TOTAL SCORE ${ffa.totalScore.toFixed(2)} → Rank ${ffa.finalRank}`);
    console.log();
    
    if (Math.abs(utf.totalScore - ffa.totalScore) < 0.01) {
      console.log(`  ✓ UTF and FFA both have TOTAL SCORE ${utf.totalScore.toFixed(2)}`);
      console.log(`  ✓ They both have rank ${utf.finalRank} (same rank for same score)`);
      if (utf.finalRank !== ffa.finalRank) {
        console.log(`  ⚠️  PROBLEM: UTF and FFA have same score but different ranks!`);
      }
    }
    
    if (fof.totalScore < utf.totalScore) {
      console.log(`  FOF (${fof.totalScore.toFixed(2)}) is better than UTF/FFA (${utf.totalScore.toFixed(2)})`);
      console.log(`  So FOF gets rank ${fof.finalRank}, UTF/FFA get rank ${utf.finalRank}`);
      console.log(`  CEO might not have FOF in their ranking, or FOF has different data`);
    }
  }

  console.log();
  console.log("=".repeat(150));
  console.log("TIE-BREAKING RULE:");
  console.log("=".repeat(150));
  console.log("1. CEFs are sorted by TOTAL SCORE (lower = better)");
  console.log("2. CEFs with SAME TOTAL SCORE (within 0.0001) get the SAME RANK");
  console.log("3. Next rank skips numbers (e.g., if 2 CEFs are rank 3, next is rank 5)");
  console.log("4. Example: If FFA and UTF both have 5.50, they both get rank 3");
  console.log("=".repeat(150));
}

async function main() {
  try {
    const weights = parseWeights();
    const cefData = await fetchCEFData();
    const rankedCEFs = calculateRanks(cefData, weights);
    printDetailedExplanation(rankedCEFs, weights);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();

