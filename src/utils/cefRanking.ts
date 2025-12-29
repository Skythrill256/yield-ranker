import { CEF, RankingWeights } from "@/types/cef";

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
  
  const yields = allCEFs
    .map(c => c.forwardYield)
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v) && v > 0);
  
  const zScoreValues = allCEFs
    .map(c => c.fiveYearZScore ?? null)
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
  
  const returns = allCEFs
    .map(c => {
      if (returnField === "return3Mo") return c.return3Mo ?? null;
      if (returnField === "return6Mo") return c.return6Mo ?? null;
      if (returnField === "return12Mo") return c.return12Mo ?? null;
      return null;
    })
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));

  if (yields.length === 0 && zScoreValues.length === 0 && returns.length === 0) {
    return 0;
  }

  const minYield = yields.length > 0 ? Math.min(...yields) : 0;
  const maxYield = yields.length > 0 ? Math.max(...yields) : 1;
  const minZScore = zScoreValues.length > 0 ? Math.min(...zScoreValues) : -3;
  const maxZScore = zScoreValues.length > 0 ? Math.max(...zScoreValues) : 3;
  const minReturn = returns.length > 0 ? Math.min(...returns) : 0;
  const maxReturn = returns.length > 0 ? Math.max(...returns) : 1;

  const normalizeYield = (value: number | null) => {
    if (value === null || value === undefined || isNaN(value) || value <= 0) return 0;
    if (maxYield === minYield) return 0.5;
    return (value - minYield) / (maxYield - minYield);
  };

  const normalizeZScore = (value: number | null) => {
    const zScoreValue = value ?? null;
    if (zScoreValue === null || isNaN(zScoreValue)) return 0.5;
    if (maxZScore === minZScore) return 0.5;
    // Invert: lower (more negative) Z-scores are better, so they should get higher normalized scores
    // Formula: (maxZScore - zScoreValue) / (maxZScore - minZScore)
    // This gives: minZScore (best) → 1.0, maxZScore (worst) → 0.0
    return (maxZScore - zScoreValue) / (maxZScore - minZScore);
  };

  const normalizeReturn = (value: number | null) => {
    if (value === null || value === undefined || isNaN(value)) return 0;
    if (maxReturn === minReturn) return 0.5;
    return (value - minReturn) / (maxReturn - minReturn);
  };

  const yieldValue = cef.forwardYield ?? 0;
  const zScoreValue = cef.fiveYearZScore ?? null;
  const returnValue = returnField === "return3Mo" 
    ? (cef.return3Mo ?? null)
    : returnField === "return6Mo"
    ? (cef.return6Mo ?? null)
    : (cef.return12Mo ?? null);

  const yieldScore = normalizeYield(yieldValue) * (weights.yield / 100);
  const zScoreScore = normalizeZScore(zScoreValue) * (weights.volatility / 100);
  const returnScore = normalizeReturn(returnValue) * (weights.totalReturn / 100);

  return yieldScore + zScoreScore + returnScore;
};

export const rankCEFs = (cefs: CEF[], weights: RankingWeights): CEF[] => {
  if (!cefs || cefs.length === 0) return [];
  
  const rankedCEFs = cefs.map(cef => ({
    ...cef,
    customScore: calculateWeightedRank(cef, cefs, weights),
  }));

  const sortedCEFs = rankedCEFs.sort((a, b) => {
    const scoreA = typeof a.customScore === 'number' ? a.customScore : 0;
    const scoreB = typeof b.customScore === 'number' ? b.customScore : 0;
    return scoreB - scoreA;
  });
  
  return sortedCEFs.map((cef, index) => ({
    ...cef,
    weightedRank: index + 1,
  }));
};

