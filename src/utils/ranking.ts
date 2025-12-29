import { ETF, RankingWeights } from "@/types/etf";

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
  etf: ETF,
  allETFs: ETF[],
  weights: RankingWeights
): number => {
  const timeframe = weights.timeframe || "12mo";
  const returnField = timeframe === "3mo" 
    ? "trDrip3Mo" 
    : timeframe === "6mo" 
    ? "trDrip6Mo" 
    : "trDrip12Mo";
  
  // Filter to only include ETFs that have data for ALL metrics with non-zero weights
  const hasYield = weights.yield > 0;
  const hasVolatility = weights.volatility > 0;
  const hasReturn = weights.totalReturn > 0;

  const validETFs = allETFs.filter(e => {
    if (hasYield && (e.forwardYield === null || isNaN(e.forwardYield) || e.forwardYield <= 0)) return false;
    if (hasVolatility) {
      const vol = e.dividendCVPercent ?? e.standardDeviation ?? null;
      if (vol === null || isNaN(vol) || vol < 0) return false;
    }
    if (hasReturn) {
      if (returnField === "trDrip3Mo" && (e.trDrip3Mo === null && e.totalReturn3Mo === null)) return false;
      if (returnField === "trDrip6Mo" && (e.trDrip6Mo === null && e.totalReturn6Mo === null)) return false;
      if (returnField === "trDrip12Mo" && (e.trDrip12Mo === null && e.totalReturn12Mo === null)) return false;
    }
    return true;
  });

  if (validETFs.length === 0) {
    return 0;
  }

  const maxRank = validETFs.length;

  // Rank YIELD: Higher is better (rank 1 = highest yield)
  const yieldRanked = [...validETFs]
    .filter(e => e.forwardYield !== null && !isNaN(e.forwardYield) && e.forwardYield > 0)
    .sort((a, b) => (b.forwardYield ?? 0) - (a.forwardYield ?? 0))
    .map((e, index) => ({ ticker: e.symbol, rank: index + 1 }));
  const yieldRankMap = new Map(yieldRanked.map(r => [r.ticker, r.rank]));

  // Rank VOLATILITY (DVI): Lower is better (rank 1 = lowest volatility/DVI)
  const volatilityRanked = [...validETFs]
    .filter(e => {
      const vol = e.dividendCVPercent ?? e.standardDeviation ?? null;
      return vol !== null && !isNaN(vol) && vol >= 0;
    })
    .sort((a, b) => {
      const aVol = a.dividendCVPercent ?? a.standardDeviation ?? 0;
      const bVol = b.dividendCVPercent ?? b.standardDeviation ?? 0;
      return aVol - bVol; // Lower is better
    })
    .map((e, index) => ({ ticker: e.symbol, rank: index + 1 }));
  const volatilityRankMap = new Map(volatilityRanked.map(r => [r.ticker, r.rank]));

  // Rank RETURN: Higher is better (rank 1 = highest return)
  const returnRanked = [...validETFs]
    .filter(e => {
      if (returnField === "trDrip3Mo") return (e.trDrip3Mo !== null || e.totalReturn3Mo !== null) && !isNaN(e.trDrip3Mo ?? e.totalReturn3Mo ?? 0);
      if (returnField === "trDrip6Mo") return (e.trDrip6Mo !== null || e.totalReturn6Mo !== null) && !isNaN(e.trDrip6Mo ?? e.totalReturn6Mo ?? 0);
      if (returnField === "trDrip12Mo") return (e.trDrip12Mo !== null || e.totalReturn12Mo !== null) && !isNaN(e.trDrip12Mo ?? e.totalReturn12Mo ?? 0);
      return false;
    })
    .sort((a, b) => {
      const aVal = returnField === "trDrip3Mo" ? (a.trDrip3Mo ?? a.totalReturn3Mo ?? 0) : 
                   returnField === "trDrip6Mo" ? (a.trDrip6Mo ?? a.totalReturn6Mo ?? 0) : 
                   (a.trDrip12Mo ?? a.totalReturn12Mo ?? 0);
      const bVal = returnField === "trDrip3Mo" ? (b.trDrip3Mo ?? b.totalReturn3Mo ?? 0) : 
                   returnField === "trDrip6Mo" ? (b.trDrip6Mo ?? b.totalReturn6Mo ?? 0) : 
                   (b.trDrip12Mo ?? b.totalReturn12Mo ?? 0);
      return bVal - aVal; // Higher is better
    })
    .map((e, index) => ({ ticker: e.symbol, rank: index + 1 }));
  const returnRankMap = new Map(returnRanked.map(r => [r.ticker, r.rank]));

  // Get ranks for this ETF (use maxRank if not found = worst rank)
  const yieldRank = yieldRankMap.get(etf.symbol) ?? maxRank;
  const volatilityRank = volatilityRankMap.get(etf.symbol) ?? maxRank;
  const returnRank = returnRankMap.get(etf.symbol) ?? maxRank;

  // Calculate weighted total score (lower is better, rank 1 = best)
  const totalScore = 
    yieldRank * (weights.yield / 100) +
    volatilityRank * (weights.volatility / 100) +
    returnRank * (weights.totalReturn / 100);

  return totalScore;
};

export const rankETFs = (etfs: ETF[], weights: RankingWeights): ETF[] => {
  if (!etfs || etfs.length === 0) return [];
  
  const rankedETFs = etfs.map(etf => ({
    ...etf,
    customScore: calculateWeightedRank(etf, etfs, weights),
  }));

  // Sort by totalScore (lower is better with rank-based method)
  const sortedETFs = rankedETFs.sort((a, b) => {
    const scoreA = typeof a.customScore === 'number' ? a.customScore : Infinity;
    const scoreB = typeof b.customScore === 'number' ? b.customScore : Infinity;
    return scoreA - scoreB; // Lower score = better rank
  });
  
  return sortedETFs.map((etf, index) => ({
    ...etf,
    weightedRank: index + 1,
  }));
};
