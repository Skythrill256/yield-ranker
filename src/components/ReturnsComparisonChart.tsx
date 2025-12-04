/**
 * Returns Comparison Chart Component
 * 
 * Multi-line chart showing:
 * - Line 1: Total Return (using adjClose, normalized to start at 0%)
 * - Line 2: Price Return (using close, normalized to start at 0%)
 * - Optional: Overlay comparison ETFs
 */

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, X, TrendingUp, TrendingDown } from "lucide-react";
import {
  fetchComparison,
  generateComparisonChartData,
  type ChartPeriod,
  type ComparisonData,
} from "@/services/tiingoApi";

interface ReturnsComparisonChartProps {
  ticker: string;
  allTickers?: string[];
  onComparisonChange?: (tickers: string[]) => void;
}

const CHART_COLORS = {
  totalReturn: "#3b82f6",   // Blue
  priceReturn: "#10b981",   // Green
  comparison: ["#f97316", "#8b5cf6", "#f59e0b", "#ec4899"], // Orange, Purple, Amber, Pink
};

const PERIODS: ChartPeriod[] = ['1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'MAX'];

export function ReturnsComparisonChart({
  ticker,
  allTickers = [],
  onComparisonChange,
}: ReturnsComparisonChartProps) {
  const [period, setPeriod] = useState<ChartPeriod>('1Y');
  const [showBothLines, setShowBothLines] = useState(true);
  const [comparisonTickers, setComparisonTickers] = useState<string[]>([]);
  const [showComparisonSelector, setShowComparisonSelector] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalReturns, setFinalReturns] = useState<Record<string, { total: number; price: number }>>({});
  const [chartHeight, setChartHeight] = useState(400);

  // Calculate chart height for mobile landscape/portrait
  useEffect(() => {
    const calculateChartHeight = () => {
      const height = window.innerHeight;
      const width = window.innerWidth;
      const isLandscape = width > height;

      // Mobile landscape (horizontal) - show more data
      if (width < 1024 && isLandscape && height < 600) {
        setChartHeight(Math.max(300, Math.min(400, height * 0.5)));
      }
      // Mobile portrait
      else if (width < 640) {
        setChartHeight(280);
      }
      // Tablet
      else if (width < 1024) {
        setChartHeight(350);
      }
      // Desktop
      else {
        setChartHeight(400);
      }
    };

    calculateChartHeight();
    window.addEventListener("resize", calculateChartHeight);
    window.addEventListener("orientationchange", calculateChartHeight);
    return () => {
      window.removeEventListener("resize", calculateChartHeight);
      window.removeEventListener("orientationchange", calculateChartHeight);
    };
  }, []);

  // Load chart data
  useEffect(() => {
    const loadChartData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const tickers = [ticker, ...comparisonTickers];
        const comparison = await fetchComparison(tickers, period, 'totalReturn');
        
        // Generate chart data
        const data = generateChartDataFromComparison(comparison);
        setChartData(data);
        
        // Calculate final returns for legend
        const returns: Record<string, { total: number; price: number }> = {};
        for (const t of tickers) {
          const tickerData = comparison.data[t];
          if (tickerData && tickerData.totalReturns.length > 0) {
            returns[t] = {
              total: tickerData.totalReturns[tickerData.totalReturns.length - 1],
              price: tickerData.priceReturns[tickerData.priceReturns.length - 1],
            };
          }
        }
        setFinalReturns(returns);
        
      } catch (err) {
        console.error('Error loading chart data:', err);
        setError('Failed to load chart data. Using existing data source.');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadChartData();
  }, [ticker, comparisonTickers, period]);

  // Generate chart data from comparison response
  function generateChartDataFromComparison(comparison: ComparisonData): any[] {
    const tickers = comparison.tickers;
    if (tickers.length === 0) return [];
    
    const primaryTicker = tickers[0];
    const primaryData = comparison.data[primaryTicker];
    if (!primaryData || primaryData.timestamps.length === 0) return [];
    
    const result: any[] = [];
    
    for (let i = 0; i < primaryData.timestamps.length; i++) {
      const timestamp = primaryData.timestamps[i];
      const date = new Date(timestamp * 1000);
      
      const point: any = {
        time: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      };
      
      // Add primary ticker data
      if (primaryData.totalReturns[i] !== undefined) {
        point.totalReturn = Number(primaryData.totalReturns[i].toFixed(2));
        point.priceReturn = Number(primaryData.priceReturns[i].toFixed(2));
      }
      
      // Add comparison tickers
      for (let j = 1; j < tickers.length; j++) {
        const compTicker = tickers[j];
        const compData = comparison.data[compTicker];
        if (compData && compData.totalReturns[i] !== undefined) {
          point[`total_${compTicker}`] = Number(compData.totalReturns[i].toFixed(2));
        }
      }
      
      result.push(point);
    }
    
    return result;
  }

  // Toggle comparison ticker
  const toggleComparison = (compTicker: string) => {
    if (comparisonTickers.includes(compTicker)) {
      const newTickers = comparisonTickers.filter(t => t !== compTicker);
      setComparisonTickers(newTickers);
      onComparisonChange?.(newTickers);
    } else if (comparisonTickers.length < 3) {
      const newTickers = [...comparisonTickers, compTicker];
      setComparisonTickers(newTickers);
      onComparisonChange?.(newTickers);
    }
  };

  // Calculate Y axis domain
  const allValues = chartData.flatMap(d => {
    const vals = [d.totalReturn, d.priceReturn].filter(v => v !== undefined);
    comparisonTickers.forEach(t => {
      if (d[`total_${t}`] !== undefined) vals.push(d[`total_${t}`]);
    });
    return vals;
  });
  const minValue = Math.min(...allValues, 0);
  const maxValue = Math.max(...allValues, 0);
  const padding = Math.abs(maxValue - minValue) * 0.1;

  return (
    <Card className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">
            Return Comparison Chart
          </h2>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={showBothLines ? "default" : "outline"}
              size="sm"
              onClick={() => setShowBothLines(true)}
            >
              Total vs Price Return
            </Button>
            <Button
              variant={!showBothLines ? "default" : "outline"}
              size="sm"
              onClick={() => setShowBothLines(false)}
            >
              Total Return Only
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowComparisonSelector(!showComparisonSelector)}
              className="gap-1"
            >
              <Plus className="h-3 w-3" />
              Compare ({comparisonTickers.length}/3)
            </Button>
          </div>
        </div>
        
        {/* Period Selector */}
        <div className="flex gap-1 flex-wrap">
          {PERIODS.map(p => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(p)}
              className="h-8 px-3 text-xs"
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      {/* Comparison Selector */}
      {showComparisonSelector && (
        <div className="mb-4 p-4 bg-slate-50 border rounded-lg max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Select ETFs to Compare (max 3)</h3>
            <button
              onClick={() => setShowComparisonSelector(false)}
              className="hover:bg-slate-200 rounded-full p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {allTickers
              .filter(t => t !== ticker)
              .slice(0, 30)
              .map(t => {
                const isSelected = comparisonTickers.includes(t);
                const isDisabled = !isSelected && comparisonTickers.length >= 3;
                return (
                  <button
                    key={t}
                    onClick={() => !isDisabled && toggleComparison(t)}
                    disabled={isDisabled}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      isSelected
                        ? "bg-primary text-white"
                        : isDisabled
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-white border hover:border-primary"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Legend with Final Returns */}
      <div className="mb-4 flex gap-3 flex-wrap">
        {/* Primary ticker */}
        <div className="flex items-center gap-4 px-3 py-2 bg-slate-50 rounded-lg border-2" style={{ borderColor: CHART_COLORS.totalReturn }}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS.totalReturn }} />
            <span className="font-bold text-sm">{ticker}</span>
          </div>
          {finalReturns[ticker] && (
            <div className="flex gap-3 text-xs">
              <span className={finalReturns[ticker].total >= 0 ? "text-green-600" : "text-red-600"}>
                Total: {finalReturns[ticker].total >= 0 ? '+' : ''}{finalReturns[ticker].total.toFixed(2)}%
              </span>
              {showBothLines && (
                <span className={finalReturns[ticker].price >= 0 ? "text-green-600" : "text-red-600"}>
                  Price: {finalReturns[ticker].price >= 0 ? '+' : ''}{finalReturns[ticker].price.toFixed(2)}%
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Comparison tickers */}
        {comparisonTickers.map((t, idx) => (
          <div
            key={t}
            className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg border-2"
            style={{ borderColor: CHART_COLORS.comparison[idx] }}
          >
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS.comparison[idx] }} />
              <span className="font-bold text-sm">{t}</span>
            </div>
            {finalReturns[t] && (
              <span className={`text-xs ${finalReturns[t].total >= 0 ? "text-green-600" : "text-red-600"}`}>
                {finalReturns[t].total >= 0 ? '+' : ''}{finalReturns[t].total.toFixed(2)}%
              </span>
            )}
            <button
              onClick={() => toggleComparison(t)}
              className="hover:bg-slate-200 rounded-full p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {/* Chart */}
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="#94a3b8"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              domain={[minValue - padding, maxValue + padding]}
              tickFormatter={(value) => {
                if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
                  return `${value.toFixed(0)}%`;
                }
                return '';
              }}
            />
            <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3" />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(255, 255, 255, 0.98)",
                border: "none",
                borderRadius: "12px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                padding: "12px 16px",
              }}
              formatter={(value: number | string, name: string) => {
                const numValue = typeof value === 'number' ? value : parseFloat(String(value));
                if (typeof numValue === 'number' && !isNaN(numValue) && isFinite(numValue)) {
                  const label = name.includes('total') ? 'Total Return' : 
                               name.includes('price') ? 'Price Return' : name;
                  return [`${numValue.toFixed(2)}%`, label];
                }
                return ['N/A', name];
              }}
              labelFormatter={(label, payload) => {
                if (payload && payload[0]?.payload?.fullDate) {
                  return payload[0].payload.fullDate;
                }
                return label;
              }}
            />
            
            {/* Primary ticker - Total Return */}
            <Line
              type="monotone"
              dataKey="totalReturn"
              stroke={CHART_COLORS.totalReturn}
              strokeWidth={2.5}
              dot={false}
              name={`${ticker} Total Return`}
            />
            
            {/* Primary ticker - Price Return (optional) */}
            {showBothLines && (
              <Line
                type="monotone"
                dataKey="priceReturn"
                stroke={CHART_COLORS.priceReturn}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name={`${ticker} Price Return`}
              />
            )}
            
            {/* Comparison tickers */}
            {comparisonTickers.map((t, idx) => (
              <Line
                key={t}
                type="monotone"
                dataKey={`total_${t}`}
                stroke={CHART_COLORS.comparison[idx]}
                strokeWidth={2}
                dot={false}
                name={`${t} Total Return`}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer explanation */}
      <div className="mt-4 text-xs text-muted-foreground">
        <p>
          <strong>Total Return</strong> (solid line): Includes dividends reinvested, calculated using adjusted close prices.
        </p>
        {showBothLines && (
          <p>
            <strong>Price Return</strong> (dashed line): Price change only, excludes dividends.
          </p>
        )}
      </div>
    </Card>
  );
}

export default ReturnsComparisonChart;
