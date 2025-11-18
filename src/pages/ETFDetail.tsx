import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PerformanceChart } from "@/components/PerformanceChart";
import { ArrowLeft, TrendingUp, TrendingDown, Plus, X, Loader2, BarChart3, LineChartIcon } from "lucide-react";
import {
  fetchETFData,
  fetchComparisonData,
  generateChartData,
  ChartType,
  ComparisonTimeframe,
} from "@/services/etfData";
import { ETF } from "@/types/etf";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const ETFDetail = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [etf, setEtf] = useState<ETF | null>(null);
  const [allETFs, setAllETFs] = useState<ETF[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState<ComparisonTimeframe>("6M");
  const [chartType, setChartType] = useState<ChartType>("totalReturn");
  const [comparisonETFs, setComparisonETFs] = useState<string[]>([]);
  const [showComparisonSelector, setShowComparisonSelector] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [activeChartTab, setActiveChartTab] = useState<string>("performance");
  const [hasLoadedLiveChart, setHasLoadedLiveChart] = useState(false);

  const toggleComparison = (compSymbol: string) => {
    if (comparisonETFs.includes(compSymbol)) {
      setComparisonETFs(comparisonETFs.filter((s) => s !== compSymbol));
    } else if (comparisonETFs.length < 5) {
      setComparisonETFs([...comparisonETFs, compSymbol]);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const data = await fetchETFData();
        setAllETFs(data);

        const found = data.find((e) => e.symbol === symbol?.toUpperCase());
        if (found) {
          setEtf(found);
        }
      } catch (error) {
        console.error("[ETFDetail] Error fetching ETF data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();

    // Refresh data every 1 minute
    const interval = setInterval(loadData, 60000);

    return () => clearInterval(interval);
  }, [symbol]);

  const buildChartData = useCallback(async () => {
    if (!etf) return;

    setIsChartLoading(true);
    setChartError(null);

    try {
      const symbols = [etf.symbol, ...comparisonETFs];
      const comparison = await fetchComparisonData(symbols, selectedTimeframe);
      const data = generateChartData(comparison, chartType);
      if (!data.length) {
        setChartError("Live chart data is not available for this timeframe.");
        setChartData([]);
        return;
      }
      setChartData(data);
    } catch (error) {
      console.error("[ETFDetail] Error building chart data:", error);
      setChartError("Unable to load live chart data right now.");
      setChartData([]);
    } finally {
      setIsChartLoading(false);
    }
  }, [etf, comparisonETFs, chartType, selectedTimeframe]);

  useEffect(() => {
    if (activeChartTab === "live" && !hasLoadedLiveChart) {
      buildChartData();
      setHasLoadedLiveChart(true);
    }
  }, [activeChartTab, buildChartData, hasLoadedLiveChart]);

  useEffect(() => {
    if (activeChartTab === "live" && hasLoadedLiveChart) {
      buildChartData();
    }
  }, [comparisonETFs, chartType, selectedTimeframe]);

  if (!etf) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-7xl mx-auto px-4 py-12">
          <div className="text-center">
            {isLoading ? (
              <>
                <h1 className="text-2xl font-bold mb-4">Loading ETF data...</h1>
                <p className="text-muted-foreground text-sm">
                  Fetching the latest data. Please wait.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold mb-4">ETF Not Found</h1>
                <Button onClick={() => navigate("/")}>Return Home</Button>
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  const priceChange = etf.totalReturn1Mo || 0;
  const priceChangePercent = ((priceChange / etf.price) * 100).toFixed(2);
  const isPositive = priceChange >= 0;
  
  const chartValues = chartData.map(d => d.price).filter(v => typeof v === 'number' && !isNaN(v));
  const minValue = chartValues.length > 0 ? Math.min(...chartValues, 0) : -10;
  const maxValue = chartValues.length > 0 ? Math.max(...chartValues, 0) : 10;

  const timeframes = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "10Y", "20Y", "MAX"];

  const keyMetrics = [
    { label: "LAST CLOSE PRICE", value: `$${etf.price.toFixed(2)}` },
    { label: "52-WEEK RANGE", value: `$${etf.week52Low.toFixed(2)} - $${etf.week52High.toFixed(2)}` },
    { label: "MARKET CAP", value: "N/A" },
    { label: "DIVIDEND YIELD", value: `${etf.forwardYield.toFixed(2)}%` },
    { label: "PE RATIO", value: "N/A" },
    { label: "PE RATIO (FWD)", value: "N/A" },
    { label: "REVENUE TTM", value: "N/A" },
    { label: "NET INCOME TTM", value: "N/A" },
    { label: "NET PROFIT MARGIN TTM", value: "N/A" },
    { label: "TTM TOTAL RETURN", value: `${(etf.totalReturn12Mo || 0).toFixed(2)}%`, isPercentage: true, value_raw: etf.totalReturn12Mo || 0 },
    { label: "3Y TOTAL RETURN", value: `${(etf.totalReturn3Yr || 0).toFixed(2)}%`, isPercentage: true, value_raw: etf.totalReturn3Yr || 0 },
    { label: "5Y TOTAL RETURN", value: `${(etf.totalReturn6Mo || 0).toFixed(2)}%`, isPercentage: true, value_raw: etf.totalReturn6Mo || 0 },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="animate-in fade-in slide-in-from-left-4 duration-300">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-6 hover:bg-slate-100 hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Rankings
          </Button>
        </div>

        <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-400 delay-100">
          <div className="flex items-baseline gap-4 mb-2">
            <h1 className="text-3xl sm:text-4xl font-bold">{etf.symbol}</h1>
            <span className="text-lg text-muted-foreground">{etf.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold">${etf.price.toFixed(2)}</span>
            <span className={`text-lg font-semibold flex items-center ${isPositive ? "text-green-600" : "text-red-600"}`}>
              {isPositive ? <TrendingUp className="w-5 h-5 mr-1" /> : <TrendingDown className="w-5 h-5 mr-1" />}
              {priceChangePercent}%
            </span>
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-400 delay-200">
          <Card className="p-6 mb-8">
            <Tabs value={activeChartTab} onValueChange={setActiveChartTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="performance">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Performance Summary
                </TabsTrigger>
                <TabsTrigger value="live">
                  <LineChartIcon className="w-4 h-4 mr-2" />
                  Live Price Chart
                </TabsTrigger>
              </TabsList>

              <TabsContent value="performance">
                <PerformanceChart etf={etf} />
              </TabsContent>

              <TabsContent value="live">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-2">
                  {etf.symbol} {chartType === "price" ? "Price" : "Total Return"} Chart (Yahoo Finance)
                </h2>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setChartType("price")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                      chartType === "price"
                        ? "bg-primary text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Price Chart
                  </button>
                  <button
                    onClick={() => setChartType("totalReturn")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                      chartType === "totalReturn"
                        ? "bg-primary text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Total Return Chart
                  </button>
                    <button
                      onClick={() => setShowComparisonSelector(!showComparisonSelector)}
                      className="px-3 py-1 text-xs font-semibold rounded-lg transition-colors bg-accent text-white hover:bg-accent/90 flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Compare ({comparisonETFs.length}/5)
                    </button>
                </div>
              </div>
              <div className="flex gap-1 flex-wrap">
                {timeframes.map((tf) => (
                  <Button
                    key={tf}
                    variant={selectedTimeframe === tf ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTimeframe(tf)}
                    className="h-8 px-3 text-xs"
                  >
                    {tf}
                  </Button>
                ))}
              </div>
            </div>

            {comparisonETFs.length > 0 && (
              <div className="mb-4 flex gap-2 flex-wrap">
                {[etf.symbol, ...comparisonETFs].map((sym, index) => {
                  const compareETF = allETFs.find((e) => e.symbol === sym);
                  if (!compareETF) return null;
                  const colors = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#f59e0b"];
                  const color = colors[index % colors.length];
                  
                  let displayValue = "N/A";
                  if (chartType === "totalReturn") {
                    let returnValue: number | undefined;
                    switch (selectedTimeframe) {
                      case "1W":
                        returnValue = compareETF.totalReturn1Wk;
                        break;
                      case "1M":
                        returnValue = compareETF.totalReturn1Mo;
                        break;
                      case "3M":
                        returnValue = compareETF.totalReturn3Mo;
                        break;
                      case "6M":
                        returnValue = compareETF.totalReturn6Mo;
                        break;
                      case "1Y":
                        returnValue = compareETF.totalReturn12Mo;
                        break;
                      case "3Y":
                        returnValue = compareETF.totalReturn3Yr;
                        break;
                      default:
                        returnValue = compareETF.totalReturn12Mo;
                    }
                    displayValue = returnValue !== undefined
                      ? `${returnValue > 0 ? "+" : ""}${returnValue.toFixed(2)}%`
                      : "N/A";
                  } else {
                    displayValue = `$${compareETF.price.toFixed(2)}`;
                  }
                  
                  return (
                    <div
                      key={sym}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-2 rounded-lg"
                      style={{ borderColor: color }}
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{sym}</span>
                        <span className="text-xs text-muted-foreground">
                          {displayValue}
                        </span>
                      </div>
                      {index > 0 && (
                        <button
                          onClick={() => toggleComparison(sym)}
                          className="ml-1 hover:bg-slate-200 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {showComparisonSelector && (
              <div className="mb-4 p-4 bg-slate-50 border-2 border-slate-200 rounded-lg max-h-64 overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">Select ETFs to Compare</h3>
                  <button
                    onClick={() => setShowComparisonSelector(false)}
                    className="hover:bg-slate-200 rounded-full p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {allETFs
                    .filter((e) => e.symbol !== etf.symbol)
                    .sort((a, b) => a.symbol.localeCompare(b.symbol))
                    .slice(0, 20)
                    .map((e) => {
                      const isSelected = comparisonETFs.includes(e.symbol);
                      const isDisabled = !isSelected && comparisonETFs.length >= 5;
                      return (
                        <button
                          key={e.symbol}
                          onClick={() => !isDisabled && toggleComparison(e.symbol)}
                          disabled={isDisabled}
                          className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                            isSelected
                              ? "bg-primary text-white"
                              : isDisabled
                              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                              : "bg-white border-2 border-slate-300 hover:border-primary hover:bg-slate-100"
                          }`}
                        >
                          {e.symbol}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {chartError && (
              <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                {chartError}
              </div>
            )}

            <ResponsiveContainer width="100%" height={400}>
              {comparisonETFs.length > 0 ? (
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
                    domain={chartType === "totalReturn" ? [minValue, maxValue] : [0, 'auto']}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => 
                      chartType === "totalReturn" 
                        ? `${value.toFixed(1)}%`
                        : `$${value.toFixed(2)}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.98)",
                      border: "none",
                      borderRadius: "12px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                      padding: "12px 16px",
                    }}
                    labelStyle={{ color: "#64748b", fontSize: "12px", marginBottom: "4px" }}
                    formatter={(value: number) => [
                      chartType === "totalReturn"
                        ? `${value.toFixed(2)}%`
                        : `$${value.toFixed(2)}`,
                      chartType === "totalReturn" ? "Return" : "Price",
                    ]}
                  />
                  {[etf.symbol, ...comparisonETFs].map((sym, index) => {
                    const colors = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#f59e0b"];
                    const dataKey = chartType === "totalReturn" ? `return_${sym}` : `price_${sym}`;
                    return (
                      <Line
                        key={sym}
                        type="monotone"
                        dataKey={dataKey}
                        stroke={colors[index % colors.length]}
                        strokeWidth={2.5}
                        dot={false}
                        name={sym}
                      />
                    );
                  })}
                </LineChart>
              ) : (
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
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
                    domain={chartType === "totalReturn" ? [minValue, maxValue] : [0, 'auto']}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      chartType === "totalReturn"
                        ? `${value.toFixed(1)}%`
                        : `$${value.toFixed(2)}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.98)",
                      border: "none",
                      borderRadius: "12px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                      padding: "12px 16px",
                    }}
                    labelStyle={{ color: "#64748b", fontSize: "12px", marginBottom: "4px" }}
                    formatter={(value: number) => [
                      chartType === "totalReturn"
                        ? `${value.toFixed(2)}%`
                        : `$${value.toFixed(2)}`,
                      chartType === "totalReturn" ? "Return" : "Price",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke={isPositive ? "#10b981" : "#ef4444"}
                    strokeWidth={2.5}
                    fill="url(#colorPrice)"
                    fillOpacity={1}
                    dot={false}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-400 delay-300">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">{etf.symbol} Key Metrics</h2>
              <Button variant="outline" size="sm">
                See All Metrics
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {keyMetrics.map((metric, index) => (
                <div key={index} className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {metric.label}
                  </p>
                  <p className={`text-xl font-bold ${
                    metric.isPercentage && metric.value_raw !== undefined
                      ? metric.value_raw >= 0
                        ? "text-green-600"
                        : "text-red-600"
                      : "text-foreground"
                  }`}>
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default ETFDetail;
