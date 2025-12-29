import { CEF, RankingWeights } from "@/types/cef";

/**
 * Calculate weighted rank using RANK-BASED method (1-N ranking, then weighted)
 * This matches the CEO's manual calculation method and server-side ranking.
 * 
 * Method:
 * 1. Rank each metric from 1 (best) to N (worst)
 * 2. Multiply each rank by its weight percentage
 * 3. Sum weighted ranks (lower total = better, rank 1 = best)
 * 
 * This ensures that when you set 100% for one metric, you get the same ranking
 * as ranking that metric individually, and when combining metrics, the ranking
 * matches manual calculation.
 */
export const calculateWeightedRank = (
  cef: CEF,
  allCEFs: CEF[],
  weights: RankingWeights
): number => {
  const timeframe = weights.timeframe || "12mo";
  const returnField = timeframe === "3mo" 
    ? "return3Mo" 
    : timeframe === "6mo" 
    ? "return6Mo" 
    : "return12Mo";
  
  // Filter to only include CEFs that have data for ALL metrics with non-zero weights
  const hasYield = weights.yield > 0;
  const hasZScore = weights.volatility > 0;
  const hasReturn = weights.totalReturn > 0;

  const validCEFs = allCEFs.filter(c => {
    if (hasYield && (c.forwardYield === null || isNaN(c.forwardYield) || c.forwardYield <= 0)) return false;
    if (hasZScore && (c.fiveYearZScore === null || isNaN(c.fiveYearZScore))) return false;
    if (hasReturn) {
      if (returnField === "return3Mo" && (c.return3Mo === null || isNaN(c.return3Mo))) return false;
      if (returnField === "return6Mo" && (c.return6Mo === null || isNaN(c.return6Mo))) return false;
      if (returnField === "return12Mo" && (c.return12Mo === null || isNaN(c.return12Mo))) return false;
    }
    return true;
  });

  if (validCEFs.length === 0) {
    return 0;
  }

  const maxRank = validCEFs.length;

  // Rank YIELD: Higher is better (rank 1 = highest yield)
  const yieldRanked = [...validCEFs]
    .filter(c => c.forwardYield !== null && !isNaN(c.forwardYield) && c.forwardYield > 0)
    .sort((a, b) => (b.forwardYield ?? 0) - (a.forwardYield ?? 0))
    .map((c, index) => ({ ticker: c.symbol, rank: index + 1 }));
  const yieldRankMap = new Map(yieldRanked.map(r => [r.ticker, r.rank]));

  // Rank Z-SCORE: Lower is better (rank 1 = lowest/most negative Z-score)
  const zScoreRanked = [...validCEFs]
    .filter(c => c.fiveYearZScore !== null && !isNaN(c.fiveYearZScore))
    .sort((a, b) => (a.fiveYearZScore ?? 0) - (b.fiveYearZScore ?? 0))
    .map((c, index) => ({ ticker: c.symbol, rank: index + 1 }));
  const zScoreRankMap = new Map(zScoreRanked.map(r => [r.ticker, r.rank]));

  // Rank RETURN: Higher is better (rank 1 = highest return)
  const returnRanked = [...validCEFs]
    .filter(c => {
      if (returnField === "return3Mo") return c.return3Mo !== null && !isNaN(c.return3Mo);
      if (returnField === "return6Mo") return c.return6Mo !== null && !isNaN(c.return6Mo);
      if (returnField === "return12Mo") return c.return12Mo !== null && !isNaN(c.return12Mo);
      return false;
    })
    .sort((a, b) => {
      const aVal = returnField === "return3Mo" ? (a.return3Mo ?? 0) : 
                   returnField === "return6Mo" ? (a.return6Mo ?? 0) : 
                   (a.return12Mo ?? 0);
      const bVal = returnField === "return3Mo" ? (b.return3Mo ?? 0) : 
                   returnField === "return6Mo" ? (b.return6Mo ?? 0) : 
                   (b.return12Mo ?? 0);
      return bVal - aVal;
    })
    .map((c, index) => ({ ticker: c.symbol, rank: index + 1 }));
  const returnRankMap = new Map(returnRanked.map(r => [r.ticker, r.rank]));

  // Get ranks for this CEF (use maxRank if not found = worst rank)
  const yieldRank = yieldRankMap.get(cef.symbol) ?? maxRank;
  const zScoreRank = zScoreRankMap.get(cef.symbol) ?? maxRank;
  const returnRank = returnRankMap.get(cef.symbol) ?? maxRank;

  // Calculate weighted total score (lower is better, rank 1 = best)
  const totalScore = 
    yieldRank * (weights.yield / 100) +
    zScoreRank * (weights.volatility / 100) +
    returnRank * (weights.totalReturn / 100);

  return totalScore;
};

export const rankCEFs = (cefs: CEF[], weights: RankingWeights): CEF[] => {
  if (!cefs || cefs.length === 0) return [];
  
  const rankedCEFs = cefs.map(cef => ({
    ...cef,
    customScore: calculateWeightedRank(cef, cefs, weights),
  }));

  // Sort by totalScore (lower is better with rank-based method)
  const sortedCEFs = rankedCEFs.sort((a, b) => {
    const scoreA = typeof a.customScore === 'number' ? a.customScore : Infinity;
    const scoreB = typeof b.customScore === 'number' ? b.customScore : Infinity;
    return scoreA - scoreB; // Lower score = better rank
  });
  
  return sortedCEFs.map((cef, index) => ({
    ...cef,
    weightedRank: index + 1,
  }));
};

