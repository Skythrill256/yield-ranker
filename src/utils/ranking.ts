import { ETF, RankingWeights } from "@/types/etf";

export const calculateWeightedRank = (
  etf: ETF,
  allETFs: ETF[],
  weights: RankingWeights
): number => {
  const timeframe = weights.timeframe || "12mo";
  const returnField = timeframe === "3mo" ? "totalReturn3Mo" : timeframe === "6mo" ? "totalReturn6Mo" : "totalReturn12Mo";
  
  const yields = allETFs.map(e => e.forwardYield).filter(v => !isNaN(v));
  const stdDevs = allETFs.map(e => e.standardDeviation).filter(v => !isNaN(v));
  const returns = allETFs.map(e => e[returnField] || 0).filter(v => !isNaN(v));

  const minYield = Math.min(...yields);
  const maxYield = Math.max(...yields);
  const minStdDev = Math.min(...stdDevs);
  const maxStdDev = Math.max(...stdDevs);
  const minReturn = Math.min(...returns);
  const maxReturn = Math.max(...returns);

  const normalizeYield = (value: number) => {
    if (maxYield === minYield) return 0.5;
    return (value - minYield) / (maxYield - minYield);
  };

  const normalizeStdDev = (value: number) => {
    if (maxStdDev === minStdDev) return 0.5;
    return 1 - (value - minStdDev) / (maxStdDev - minStdDev);
  };

  const normalizeReturn = (value: number) => {
    if (maxReturn === minReturn) return 0.5;
    return (value - minReturn) / (maxReturn - minReturn);
  };

  const yieldScore = normalizeYield(etf.forwardYield) * (weights.yield / 100);
  const stdDevScore = normalizeStdDev(etf.standardDeviation) * (weights.stdDev / 100);
  const returnScore = normalizeReturn(etf[returnField] || 0) * (weights.totalReturn / 100);

  return yieldScore + stdDevScore + returnScore;
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
