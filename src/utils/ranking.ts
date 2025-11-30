import { ETF, RankingWeights } from "@/types/etf";

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
  
  const yields = allETFs
    .map(e => e.forwardYield)
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v) && v > 0);
  
  const volatilityValues = allETFs
    .map(e => e.dividendCVPercent ?? e.standardDeviation ?? null)
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v) && v >= 0);
  
  const returns = allETFs
    .map(e => {
      if (returnField === "trDrip3Mo") return e.trDrip3Mo ?? e.totalReturn3Mo ?? null;
      if (returnField === "trDrip6Mo") return e.trDrip6Mo ?? e.totalReturn6Mo ?? null;
      if (returnField === "trDrip12Mo") return e.trDrip12Mo ?? e.totalReturn12Mo ?? null;
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

  const yieldValue = etf.forwardYield ?? 0;
  const volatilityValue = etf.dividendCVPercent ?? etf.standardDeviation ?? null;
  const returnValue = returnField === "trDrip3Mo" 
    ? (etf.trDrip3Mo ?? etf.totalReturn3Mo ?? null)
    : returnField === "trDrip6Mo"
    ? (etf.trDrip6Mo ?? etf.totalReturn6Mo ?? null)
    : (etf.trDrip12Mo ?? etf.totalReturn12Mo ?? null);

  const yieldScore = normalizeYield(yieldValue) * (weights.yield / 100);
  const volatilityScore = normalizeVolatility(volatilityValue) * (weights.volatility / 100);
  const returnScore = normalizeReturn(returnValue) * (weights.totalReturn / 100);

  return yieldScore + volatilityScore + returnScore;
};

export const rankETFs = (etfs: ETF[], weights: RankingWeights): ETF[] => {
  if (!etfs || etfs.length === 0) return [];
  
  const rankedETFs = etfs.map(etf => ({
    ...etf,
    customScore: calculateWeightedRank(etf, etfs, weights),
  }));

  const sortedETFs = rankedETFs.sort((a, b) => {
    const scoreA = typeof a.customScore === 'number' ? a.customScore : 0;
    const scoreB = typeof b.customScore === 'number' ? b.customScore : 0;
    return scoreB - scoreA;
  });
  
  return sortedETFs.map((etf, index) => ({
    ...etf,
    weightedRank: index + 1,
  }));
};
