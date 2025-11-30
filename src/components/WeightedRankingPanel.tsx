/**
 * Weighted Ranking Panel Component
 * 
 * Allows users to customize ranking weights and see live-ranked ETFs
 * Uses Min-Max normalization with inverted volatility (lower is better)
 */

import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  Info, 
  RefreshCw,
  Download,
  Settings2,
  BarChart3,
} from "lucide-react";
import {
  fetchRankings,
  type RankedETF,
  type RankingsResponse,
} from "@/services/tiingoApi";

interface WeightedRankingPanelProps {
  onSelectETF?: (ticker: string) => void;
}

interface Weights {
  yield: number;
  totalReturn: number;
  volatility: number;
}

const DEFAULT_WEIGHTS: Weights = {
  yield: 34,
  totalReturn: 33,
  volatility: 33,
};

const PRESET_STRATEGIES: { name: string; weights: Weights; description: string }[] = [
  {
    name: "Balanced",
    weights: { yield: 34, totalReturn: 33, volatility: 33 },
    description: "Equal weighting across all factors",
  },
  {
    name: "Income Focus",
    weights: { yield: 60, totalReturn: 25, volatility: 15 },
    description: "Prioritize high dividend yield",
  },
  {
    name: "Growth Focus",
    weights: { yield: 20, totalReturn: 60, volatility: 20 },
    description: "Prioritize total return performance",
  },
  {
    name: "Low Risk",
    weights: { yield: 25, totalReturn: 25, volatility: 50 },
    description: "Prioritize dividend stability",
  },
];

export function WeightedRankingPanel({ onSelectETF }: WeightedRankingPanelProps) {
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [rankings, setRankings] = useState<RankedETF[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("Balanced");

  // Load rankings
  const loadRankings = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetchRankings(weights);
      setRankings(response.rankings);
    } catch (err) {
      console.error('Error loading rankings:', err);
      setError('Failed to load rankings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Load on mount and when weights change
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      loadRankings();
    }, 500);
    
    return () => clearTimeout(debounceTimer);
  }, [weights]);

  // Handle weight change
  const handleWeightChange = (key: keyof Weights, value: number) => {
    // Calculate remaining weight
    const otherKeys = Object.keys(weights).filter(k => k !== key) as (keyof Weights)[];
    const newWeights: Weights = { ...weights, [key]: value };
    
    // Distribute remaining weight proportionally
    const remaining = 100 - value;
    const currentOtherTotal = otherKeys.reduce((sum: number, k) => sum + weights[k], 0);
    
    if (currentOtherTotal > 0) {
      otherKeys.forEach(k => {
        newWeights[k] = Math.round((weights[k] / currentOtherTotal) * remaining);
      });
      
      // Adjust for rounding errors
      const total = newWeights.yield + newWeights.totalReturn + newWeights.volatility;
      if (total !== 100) {
        newWeights[otherKeys[0]] += 100 - total;
      }
    } else {
      const perKey = Math.floor(remaining / otherKeys.length);
      otherKeys.forEach((k, i) => {
        newWeights[k] = perKey + (i === 0 ? remaining % otherKeys.length : 0);
      });
    }
    
    setWeights(newWeights);
    setSelectedStrategy("Custom");
  };

  // Apply preset strategy
  const applyStrategy = (strategy: typeof PRESET_STRATEGIES[0]) => {
    setWeights(strategy.weights);
    setSelectedStrategy(strategy.name);
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Rank', 'Ticker', 'Yield %', 'Total Return %', 'Volatility', 'Score'];
    const rows = rankings.map(r => [
      r.rank,
      r.ticker,
      r.yield?.toFixed(2) || 'N/A',
      r.totalReturn?.toFixed(2) || 'N/A',
      r.volatility?.toFixed(2) || 'N/A',
      r.compositeScore.toFixed(4),
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etf-rankings-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Weight Configuration Panel */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Ranking Weights</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            {showSettings ? 'Hide' : 'Show'} Settings
          </Button>
        </div>

        {showSettings && (
          <>
            {/* Strategy Presets */}
            <div className="mb-6">
              <p className="text-sm text-muted-foreground mb-3">Quick Presets:</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_STRATEGIES.map(strategy => (
                  <Button
                    key={strategy.name}
                    variant={selectedStrategy === strategy.name ? "default" : "outline"}
                    size="sm"
                    onClick={() => applyStrategy(strategy)}
                    className="gap-2"
                  >
                    {strategy.name}
                  </Button>
                ))}
              </div>
              {selectedStrategy !== "Custom" && (
                <p className="text-xs text-muted-foreground mt-2">
                  {PRESET_STRATEGIES.find(s => s.name === selectedStrategy)?.description}
                </p>
              )}
            </div>

            {/* Weight Sliders */}
            <div className="space-y-6">
              {/* Yield Weight */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Dividend Yield</label>
                  <span className="text-sm font-bold text-primary">{weights.yield}%</span>
                </div>
                <Slider
                  value={[weights.yield]}
                  onValueChange={([value]) => handleWeightChange('yield', value)}
                  max={100}
                  min={0}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Higher yield = better score
                </p>
              </div>

              {/* Total Return Weight */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">1-Year Total Return</label>
                  <span className="text-sm font-bold text-primary">{weights.totalReturn}%</span>
                </div>
                <Slider
                  value={[weights.totalReturn]}
                  onValueChange={([value]) => handleWeightChange('totalReturn', value)}
                  max={100}
                  min={0}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Higher return = better score
                </p>
              </div>

              {/* Volatility Weight (Dividend CV%) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Dividend Stability (CV%)</label>
                  <span className="text-sm font-bold text-primary">{weights.volatility}%</span>
                </div>
                <Slider
                  value={[weights.volatility]}
                  onValueChange={([value]) => handleWeightChange('volatility', value)}
                  max={100}
                  min={0}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Lower dividend CV% = more stable dividends = better score (inverted normalization)
                </p>
              </div>
            </div>

            {/* Total Check */}
            <div className="mt-4 p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span>Total Weight:</span>
                <span className={`font-bold ${
                  weights.yield + weights.totalReturn + weights.volatility === 100
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}>
                  {weights.yield + weights.totalReturn + weights.volatility}%
                </span>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Rankings Table */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Ranked ETFs</h2>
            <Badge variant="secondary">{rankings.length} ETFs</Badge>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadRankings}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={rankings.length === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-16 font-semibold">Rank</TableHead>
                  <TableHead className="font-semibold">Ticker</TableHead>
                  <TableHead className="font-semibold text-right">Yield</TableHead>
                  <TableHead className="font-semibold text-right">1Y Return</TableHead>
                  <TableHead className="font-semibold text-right">Volatility</TableHead>
                  <TableHead className="font-semibold text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankings.slice(0, 50).map((etf) => (
                  <TableRow
                    key={etf.ticker}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => onSelectETF?.(etf.ticker)}
                  >
                    <TableCell>
                      <Badge
                        variant={etf.rank <= 3 ? "default" : "secondary"}
                        className={etf.rank <= 3 ? "bg-primary" : ""}
                      >
                        #{etf.rank}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-bold">{etf.ticker}</TableCell>
                    <TableCell className="text-right">
                      {etf.yield !== null ? (
                        <span className="text-green-600">{etf.yield.toFixed(2)}%</span>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {etf.totalReturn !== null ? (
                        <span className={etf.totalReturn >= 0 ? "text-green-600" : "text-red-600"}>
                          {etf.totalReturn >= 0 ? '+' : ''}{etf.totalReturn.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {etf.volatility !== null ? (
                        <span className={etf.volatility < 50 ? "text-green-600" : "text-amber-600"}>
                          {etf.volatility.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {(etf.compositeScore * 100).toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Methodology Note */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
          <Info className="h-4 w-4 inline mr-2" />
          <strong>Methodology:</strong> Rankings use Min-Max normalization (0-1 scale). 
          Dividend volatility uses the industry-standard frequency-proof CV% calculation 
          (rolling 365-day annualized series, immune to payout frequency changes). 
          Lower CV% = more stable dividends = higher score. 
          Total return uses DRIP method (adjClose ratio). Source: Tiingo
        </div>
      </Card>
    </div>
  );
}

export default WeightedRankingPanel;
