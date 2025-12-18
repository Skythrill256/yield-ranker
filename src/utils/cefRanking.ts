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
  
  const volatilityValues = allCEFs
    .map(c => c.dividendCVPercent ?? null)
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v) && v >= 0);
  
  const returns = allCEFs
    .map(c => {
      if (returnField === "return3Mo") return c.return3Mo ?? null;
      if (returnField === "return6Mo") return c.return6Mo ?? null;
      if (returnField === "return12Mo") return c.return12Mo ?? null;
      return null;
    })
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));

  if (yields.length === 0 && volatilityValues.length === 0 && returns.length === 0) {
    return 0;
  }

  const minYield = yields.length > 0 ? Math.min(...yields) : 0;
  const maxYield = yields.length > 0 ? Math.max(...yields) : 1;
  const minVol = volatilityValues.length > 0 ? Math.min(...volatilityValues) : 0;
  const maxVol = volatilityValues.length > 0 ? Math.max(...volatilityValues) : 1;
  const minReturn = returns.length > 0 ? Math.min(...returns) : 0;
  const maxReturn = returns.length > 0 ? Math.max(...returns) : 1;

  const normalizeYield = (value: number | null) => {
    if (value === null || value === undefined || isNaN(value) || value <= 0) return 0;
    if (maxYield === minYield) return 0.5;
    return (value - minYield) / (maxYield - minYield);
  };

  const normalizeVolatility = (value: number | null) => {
    const volValue = value ?? null;
    if (volValue === null || isNaN(volValue) || volValue < 0) return 0.5;
    if (maxVol === minVol) return 0.5;
    return (maxVol - volValue) / (maxVol - minVol);
  };

  const normalizeReturn = (value: number | null) => {
    if (value === null || value === undefined || isNaN(value)) return 0;
    if (maxReturn === minReturn) return 0.5;
    return (value - minReturn) / (maxReturn - minReturn);
  };

  const yieldValue = cef.forwardYield ?? 0;
  const volatilityValue = cef.dividendCVPercent ?? null;
  const returnValue = returnField === "return3Mo" 
    ? (cef.return3Mo ?? null)
    : returnField === "return6Mo"
    ? (cef.return6Mo ?? null)
    : (cef.return12Mo ?? null);

  const yieldScore = normalizeYield(yieldValue) * (weights.yield / 100);
  const volatilityScore = normalizeVolatility(volatilityValue) * (weights.volatility / 100);
  const returnScore = normalizeReturn(returnValue) * (weights.totalReturn / 100);

  return yieldScore + volatilityScore + returnScore;
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

