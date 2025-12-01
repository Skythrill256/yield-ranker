import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, TrendingUp, TrendingDown, Plus, X, Loader2, Clock, Search } from "lucide-react";
import {
  fetchETFData,
  fetchETFDataWithMetadata,
  fetchComparisonData,
  generateChartData,
  ChartType,
  ComparisonTimeframe,
} from "@/services/etfData";
import { ETF } from "@/types/etf";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Area,
  AreaChart,
  ComposedChart,
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
  const [comparisonSearchQuery, setComparisonSearchQuery] = useState("");
  const [chartData, setChartData] = useState<any[]>([]);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [hasLoadedLiveChart, setHasLoadedLiveChart] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

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
        const result = await fetchETFDataWithMetadata();
        setAllETFs(result.etfs);

        const found = result.etfs.find((e) => e.symbol === symbol?.toUpperCase());
        if (found) {
          setEtf(found);
        }
        
        // Format the last updated timestamp from database
        if (result.lastUpdatedTimestamp) {
          const date = new Date(result.lastUpdatedTimestamp);
          const formatted = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
          setLastUpdated(formatted);
        } else if (result.lastUpdated) {
          setLastUpdated(result.lastUpdated);
        }
      } catch (error) {
        console.error("[ETFDetail] Error fetching ETF data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
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

  // Load chart on mount
  useEffect(() => {
    if (!hasLoadedLiveChart && etf) {
      buildChartData();
      setHasLoadedLiveChart(true);
    }
  }, [buildChartData, hasLoadedLiveChart, etf]);

  useEffect(() => {
    if (hasLoadedLiveChart) {
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
  
  const chartValues = (chartData && Array.isArray(chartData) ? chartData : []).map(d => d.price).filter(v => typeof v === 'number' && !isNaN(v));
  const minValue = chartValues.length > 0 ? Math.min(...chartValues, 0) : -10;
  const maxValue = chartValues.length > 0 ? Math.max(...chartValues, 0) : 10;

  const timeframes: ComparisonTimeframe[] = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "10Y", "20Y", "MAX"];

  // Get the return value for display based on timeframe
  const getReturnForTimeframe = () => {
    switch (selectedTimeframe) {
      case '1W': return etf.trDrip1Wk ?? etf.totalReturn1Wk;
      case '1M': return etf.trDrip1Mo ?? etf.totalReturn1Mo;
      case '3M': return etf.trDrip3Mo ?? etf.totalReturn3Mo;
      case '6M': return etf.trDrip6Mo ?? etf.totalReturn6Mo;
      case '1Y': return etf.trDrip12Mo ?? etf.totalReturn12Mo;
      case '3Y': return etf.trDrip3Yr ?? etf.totalReturn3Yr;
      default: return etf.trDrip12Mo ?? etf.totalReturn12Mo;
    }
  };
  const currentReturn = getReturnForTimeframe();

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

        {/* Header with symbol, price, and return indicator */}
        <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-400 delay-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-4 mb-2">
                <h1 className="text-3xl sm:text-4xl font-bold">{etf.symbol}</h1>
                <span className="text-lg text-muted-foreground">{etf.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold">${etf.price.toFixed(2)}</span>
                <span className={`text-lg font-semibold flex items-center ${
                  currentReturn != null && currentReturn >= 0 ? "text-green-600" : "text-red-600"
                }`}>
                  {currentReturn != null && currentReturn >= 0 ? <TrendingUp className="w-5 h-5 mr-1" /> : <TrendingDown className="w-5 h-5 mr-1" />}
                  {currentReturn != null ? `${currentReturn >= 0 ? '+' : ''}${currentReturn.toFixed(2)}%` : 'N/A'}
                </span>
              </div>
            </div>
            {/* Last Updated + Source */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {lastUpdated && (
                <>
                  <Clock className="h-3 w-3" />
                  <span>Last updated: {lastUpdated}</span>
                  <span className="text-primary font-medium">Source: Tiingo</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Top Metrics Bar - Section 3.3: Show precomputed returns based on chart type */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-400 delay-150">
          <Card className="p-4 mb-4">
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="font-semibold text-foreground">
                  {chartType === "price" ? "Price Return:" : "Total Return:"}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">3 Yr:</span>
                  <span className={`font-semibold ${
                    chartType === "price" 
                      ? (etf.priceReturn3Yr != null && etf.priceReturn3Yr >= 0 ? 'text-green-600' : 'text-red-600')
                      : ((etf.trDrip3Yr ?? etf.totalReturn3Yr) != null && (etf.trDrip3Yr ?? etf.totalReturn3Yr)! >= 0 ? 'text-green-600' : 'text-red-600')
                  }`}>
                    {chartType === "price"
                      ? (etf.priceReturn3Yr != null ? `${etf.priceReturn3Yr >= 0 ? '+' : ''}${etf.priceReturn3Yr.toFixed(1)}%` : 'N/A')
                      : ((etf.trDrip3Yr ?? etf.totalReturn3Yr) != null ? `${(etf.trDrip3Yr ?? etf.totalReturn3Yr)! >= 0 ? '+' : ''}${(etf.trDrip3Yr ?? etf.totalReturn3Yr)!.toFixed(1)}%` : 'N/A')
                    }
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">12 Mo:</span>
                  <span className={`font-semibold ${
                    chartType === "price" 
                      ? (etf.priceReturn12Mo != null && etf.priceReturn12Mo >= 0 ? 'text-green-600' : 'text-red-600')
                      : ((etf.trDrip12Mo ?? etf.totalReturn12Mo) != null && (etf.trDrip12Mo ?? etf.totalReturn12Mo)! >= 0 ? 'text-green-600' : 'text-red-600')
                  }`}>
                    {chartType === "price"
                      ? (etf.priceReturn12Mo != null ? `${etf.priceReturn12Mo >= 0 ? '+' : ''}${etf.priceReturn12Mo.toFixed(1)}%` : 'N/A')
                      : ((etf.trDrip12Mo ?? etf.totalReturn12Mo) != null ? `${(etf.trDrip12Mo ?? etf.totalReturn12Mo)! >= 0 ? '+' : ''}${(etf.trDrip12Mo ?? etf.totalReturn12Mo)!.toFixed(1)}%` : 'N/A')
                    }
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">6 Mo:</span>
                  <span className={`font-semibold ${
                    chartType === "price" 
                      ? (etf.priceReturn6Mo != null && etf.priceReturn6Mo >= 0 ? 'text-green-600' : 'text-red-600')
                      : ((etf.trDrip6Mo ?? etf.totalReturn6Mo) != null && (etf.trDrip6Mo ?? etf.totalReturn6Mo)! >= 0 ? 'text-green-600' : 'text-red-600')
                  }`}>
                    {chartType === "price"
                      ? (etf.priceReturn6Mo != null ? `${etf.priceReturn6Mo >= 0 ? '+' : ''}${etf.priceReturn6Mo.toFixed(1)}%` : 'N/A')
                      : ((etf.trDrip6Mo ?? etf.totalReturn6Mo) != null ? `${(etf.trDrip6Mo ?? etf.totalReturn6Mo)! >= 0 ? '+' : ''}${(etf.trDrip6Mo ?? etf.totalReturn6Mo)!.toFixed(1)}%` : 'N/A')
                    }
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">3 Mo:</span>
                  <span className={`font-semibold ${
                    chartType === "price" 
                      ? (etf.priceReturn3Mo != null && etf.priceReturn3Mo >= 0 ? 'text-green-600' : 'text-red-600')
                      : ((etf.trDrip3Mo ?? etf.totalReturn3Mo) != null && (etf.trDrip3Mo ?? etf.totalReturn3Mo)! >= 0 ? 'text-green-600' : 'text-red-600')
                  }`}>
                    {chartType === "price"
                      ? (etf.priceReturn3Mo != null ? `${etf.priceReturn3Mo >= 0 ? '+' : ''}${etf.priceReturn3Mo.toFixed(1)}%` : 'N/A')
                      : ((etf.trDrip3Mo ?? etf.totalReturn3Mo) != null ? `${(etf.trDrip3Mo ?? etf.totalReturn3Mo)! >= 0 ? '+' : ''}${(etf.trDrip3Mo ?? etf.totalReturn3Mo)!.toFixed(1)}%` : 'N/A')
                    }
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">1 Mo:</span>
                  <span className={`font-semibold ${
                    chartType === "price" 
                      ? (etf.priceReturn1Mo != null && etf.priceReturn1Mo >= 0 ? 'text-green-600' : 'text-red-600')
                      : ((etf.trDrip1Mo ?? etf.totalReturn1Mo) != null && (etf.trDrip1Mo ?? etf.totalReturn1Mo)! >= 0 ? 'text-green-600' : 'text-red-600')
                  }`}>
                    {chartType === "price"
                      ? (etf.priceReturn1Mo != null ? `${etf.priceReturn1Mo >= 0 ? '+' : ''}${etf.priceReturn1Mo.toFixed(1)}%` : 'N/A')
                      : ((etf.trDrip1Mo ?? etf.totalReturn1Mo) != null ? `${(etf.trDrip1Mo ?? etf.totalReturn1Mo)! >= 0 ? '+' : ''}${(etf.trDrip1Mo ?? etf.totalReturn1Mo)!.toFixed(1)}%` : 'N/A')
                    }
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">1 Wk:</span>
                  <span className={`font-semibold ${
                    chartType === "price" 
                      ? (etf.priceReturn1Wk != null && etf.priceReturn1Wk >= 0 ? 'text-green-600' : 'text-red-600')
                      : ((etf.trDrip1Wk ?? etf.totalReturn1Wk) != null && (etf.trDrip1Wk ?? etf.totalReturn1Wk)! >= 0 ? 'text-green-600' : 'text-red-600')
                  }`}>
                    {chartType === "price"
                      ? (etf.priceReturn1Wk != null ? `${etf.priceReturn1Wk >= 0 ? '+' : ''}${etf.priceReturn1Wk.toFixed(1)}%` : 'N/A')
                      : ((etf.trDrip1Wk ?? etf.totalReturn1Wk) != null ? `${(etf.trDrip1Wk ?? etf.totalReturn1Wk)! >= 0 ? '+' : ''}${(etf.trDrip1Wk ?? etf.totalReturn1Wk)!.toFixed(1)}%` : 'N/A')
                    }
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <span className="text-muted-foreground">Fwd Yield: </span>
                  <span className="font-bold text-primary">{etf.forwardYield?.toFixed(2) ?? 'N/A'}%</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Chart Section - No tabs, direct display */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-400 delay-200 relative z-0">
          <Card className="p-6 mb-8 relative z-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 relative z-0">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                    Metric:
                  </label>
                  <Select
                    value={chartType === "price" ? "priceReturn" : "totalReturn"}
                    onValueChange={(value) => setChartType(value === "priceReturn" ? "price" : "totalReturn")}
                  >
                    <SelectTrigger className="w-[160px] h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="totalReturn">Total Return</SelectItem>
                      <SelectItem value="priceReturn">Price Return</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {timeframes.map((tf) => (
                    <Button
                      key={tf}
                      variant={selectedTimeframe === tf ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedTimeframe(tf)}
                      className="h-9 px-3 text-xs"
                    >
                      {tf}
                    </Button>
                  ))}
                </div>
                <button
                  onClick={() => setShowComparisonSelector(!showComparisonSelector)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors bg-accent text-white hover:bg-accent/90 flex items-center gap-1 h-9"
                >
                  <Plus className="h-3 w-3" />
                  Compare ({comparisonETFs.length}/5)
                </button>
              </div>
            </div>

            {comparisonETFs.length > 0 && (
              <div className="mb-4 flex gap-2 flex-wrap">
                {[etf.symbol, ...comparisonETFs].map((sym, index) => {
                  const compareETF = allETFs.find((e) => e.symbol === sym);
                  if (!compareETF) return null;
                  const colors = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ef4444"];
                  const color = colors[index % colors.length];
                  
                  let displayValue = "N/A";
                  if (chartType === "totalReturn") {
                    let returnValue: number | null | undefined;
                    switch (selectedTimeframe) {
                      case "1W":
                        returnValue = compareETF.trDrip1Wk ?? compareETF.totalReturn1Wk;
                        break;
                      case "1M":
                        returnValue = compareETF.trDrip1Mo ?? compareETF.totalReturn1Mo;
                        break;
                      case "3M":
                        returnValue = compareETF.trDrip3Mo ?? compareETF.totalReturn3Mo;
                        break;
                      case "6M":
                        returnValue = compareETF.trDrip6Mo ?? compareETF.totalReturn6Mo;
                        break;
                      case "1Y":
                        returnValue = compareETF.trDrip12Mo ?? compareETF.totalReturn12Mo;
                        break;
                      case "3Y":
                        returnValue = compareETF.trDrip3Yr ?? compareETF.totalReturn3Yr;
                        break;
                      default:
                        returnValue = compareETF.trDrip12Mo ?? compareETF.totalReturn12Mo;
                    }
                    displayValue = returnValue != null
                      ? `${returnValue > 0 ? "+" : ""}${returnValue.toFixed(2)}%`
                      : "N/A";
                  } else {
                    let returnValue: number | null | undefined;
                    switch (selectedTimeframe) {
                      case "1W":
                        returnValue = compareETF.priceReturn1Wk ?? compareETF.totalReturn1Wk;
                        break;
                      case "1M":
                        returnValue = compareETF.priceReturn1Mo ?? compareETF.totalReturn1Mo;
                        break;
                      case "3M":
                        returnValue = compareETF.priceReturn3Mo ?? compareETF.totalReturn3Mo;
                        break;
                      case "6M":
                        returnValue = compareETF.priceReturn6Mo ?? compareETF.totalReturn6Mo;
                        break;
                      case "1Y":
                        returnValue = compareETF.priceReturn12Mo ?? compareETF.totalReturn12Mo;
                        break;
                      case "3Y":
                        returnValue = compareETF.priceReturn3Yr ?? compareETF.totalReturn3Yr;
                        break;
                      default:
                        returnValue = compareETF.priceReturn12Mo ?? compareETF.totalReturn12Mo;
                    }
                    displayValue = returnValue != null
                      ? `${returnValue > 0 ? "+" : ""}${returnValue.toFixed(2)}%`
                      : "N/A";
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
              <div className="mb-4 p-4 bg-slate-50 border-2 border-slate-200 rounded-lg relative">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">Search ETFs to Compare</h3>
                  <button
                    onClick={() => {
                      setShowComparisonSelector(false);
                      setComparisonSearchQuery("");
                    }}
                    className="hover:bg-slate-200 rounded-full p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {/* Search Bar - Similar to home page */}
                <div className="relative mb-4 z-10">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none z-10" />
                  <Input
                    type="text"
                    placeholder="Search ETFs..."
                    value={comparisonSearchQuery}
                    onChange={(e) => setComparisonSearchQuery(e.target.value)}
                    onFocus={() => {}}
                    className="pl-10 pr-10 h-12 bg-background border-2 border-border focus:border-primary text-base rounded-xl"
                  />
                  {comparisonSearchQuery && (
                    <button
                      onClick={() => setComparisonSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </div>
                {/* ETF List with Search - Dropdown style */}
                {comparisonSearchQuery && (
                  <div className="absolute top-full left-4 right-4 mt-2 z-[9999] bg-background border-2 border-border rounded-xl shadow-2xl overflow-hidden">
                    <div className="max-h-96 overflow-y-auto">
                      {allETFs
                        .filter((e) => {
                          const searchLower = comparisonSearchQuery.toLowerCase();
                          return e.symbol !== etf.symbol &&
                            (e.symbol.toLowerCase().includes(searchLower) ||
                             (e.name && e.name.toLowerCase().includes(searchLower)));
                        })
                        .slice(0, 10)
                        .map((e) => {
                          const isSelected = comparisonETFs.includes(e.symbol);
                          const isDisabled = !isSelected && comparisonETFs.length >= 5;
                          return (
                            <button
                              key={e.symbol}
                              onClick={() => {
                                if (!isDisabled) {
                                  toggleComparison(e.symbol);
                                  setComparisonSearchQuery("");
                                }
                              }}
                              disabled={isDisabled}
                              className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0 ${
                                isDisabled ? "opacity-50 cursor-not-allowed" : ""
                              }`}
                            >
                              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <TrendingUp className="w-5 h-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-base text-foreground">{e.symbol}</div>
                                <div className="text-sm text-muted-foreground truncate">{e.name}</div>
                              </div>
                              <div className="text-right text-sm flex-shrink-0">
                                <div className="font-bold text-foreground">${e.price.toFixed(2)}</div>
                                <div className={`font-semibold ${e.totalReturn1Mo && e.totalReturn1Mo >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {e.totalReturn1Mo ? `${e.totalReturn1Mo > 0 ? "+" : ""}${e.totalReturn1Mo.toFixed(2)}%` : "N/A"}
                                </div>
                              </div>
                              {isSelected && (
                                <div className="text-primary">
                                  <X className="h-5 w-5" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {chartError && (
              <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                {chartError}
              </div>
            )}

            {/* Chart with Right-Side Return Legend */}
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Chart Area */}
              <div className="flex-1 min-w-0 order-2 lg:order-1">
                <ResponsiveContainer width="100%" height={400}>
                  {chartData && Array.isArray(chartData) && chartData.length > 0 ? (
                    <ComposedChart data={chartData}>
                      <defs>
                        <linearGradient
                          id={`colorPrice-${etf.symbol}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor={isPositive ? "#10b981" : "#ef4444"}
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor={isPositive ? "#10b981" : "#ef4444"}
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis 
                        dataKey="time" 
                        stroke="#94a3b8" 
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        tickFormatter={(value) => value || ''}
                      />
                      <YAxis 
                        stroke="#94a3b8" 
                        fontSize={12} 
                        domain={chartType === "totalReturn" ? [minValue, maxValue] : [minValue, maxValue]}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value.toFixed(1)}%`}
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
                        labelFormatter={(label, payload) => {
                          if (payload && payload[0]?.payload?.fullDate) {
                            const date = new Date(payload[0].payload.fullDate);
                            return date.toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            });
                          }
                          return label;
                        }}
                        formatter={(value: number, name: string) => [
                          `${value.toFixed(2)}%`,
                          name,
                        ]}
                      />
                      {/* Primary ETF with gradient Area (only when no comparisons) */}
                      {comparisonETFs.length === 0 && (
                        <Area
                          type="monotone"
                          dataKey="price"
                          stroke={isPositive ? "#10b981" : "#ef4444"}
                          strokeWidth={3}
                          fill={`url(#colorPrice-${etf.symbol})`}
                          fillOpacity={1}
                          dot={false}
                          name={etf.symbol}
                          animationDuration={500}
                          strokeLinecap="round"
                        />
                      )}
                      {/* All ETFs as Lines (when comparing) */}
                      {[etf.symbol, ...comparisonETFs].map((sym, index) => {
                        const colors = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ef4444"];
                        const color = colors[index % colors.length];
                        const dataKey = chartType === "totalReturn" ? `return_${sym}` : `price_${sym}`;
                        return (
                          <Line
                            key={sym}
                            type="monotone"
                            dataKey={dataKey}
                            stroke={color}
                            strokeWidth={index === 0 ? 3 : 2.5}
                            dot={false}
                            name={sym}
                            animationDuration={500}
                            animationBegin={(index + 1) * 100}
                            strokeLinecap="round"
                          />
                        );
                      })}
                    </ComposedChart>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <p className="text-muted-foreground">Chart data is loading or unavailable.</p>
                        {isChartLoading && <Loader2 className="h-4 w-4 animate-spin mx-auto mt-2" />}
                      </div>
                    </div>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Right Side - Return Percentages Legend */}
              <div className="w-full lg:w-52 flex-shrink-0 bg-slate-50 rounded-lg p-4 border border-slate-200 order-1 lg:order-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {chartType === "totalReturn" ? "Total Return" : "Price Return"} ({selectedTimeframe})
                </h4>
                
                {isChartLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                <div className="space-y-3">
                  {[etf.symbol, ...comparisonETFs].map((sym, index) => {
                    const colors = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ef4444"];
                    const color = colors[index % colors.length];
                    
                    // Get precomputed return value from ETF data to match top metrics bar
                    const compareETF = allETFs.find((e) => e.symbol === sym);
                    let returnValue: number | null = null;
                    
                    if (compareETF) {
                      if (chartType === "totalReturn") {
                        // Use precomputed tr_drip values (same as top metrics bar)
                        switch (selectedTimeframe) {
                          case "1W":
                            returnValue = compareETF.trDrip1Wk ?? compareETF.totalReturn1Wk ?? null;
                            break;
                          case "1M":
                            returnValue = compareETF.trDrip1Mo ?? compareETF.totalReturn1Mo ?? null;
                            break;
                          case "3M":
                            returnValue = compareETF.trDrip3Mo ?? compareETF.totalReturn3Mo ?? null;
                            break;
                          case "6M":
                            returnValue = compareETF.trDrip6Mo ?? compareETF.totalReturn6Mo ?? null;
                            break;
                          case "1Y":
                            returnValue = compareETF.trDrip12Mo ?? compareETF.totalReturn12Mo ?? null;
                            break;
                          case "3Y":
                            returnValue = compareETF.trDrip3Yr ?? compareETF.totalReturn3Yr ?? null;
                            break;
                          default:
                            returnValue = compareETF.trDrip12Mo ?? compareETF.totalReturn12Mo ?? null;
                        }
                      } else {
                        // For price return, use precomputed price return values
                        switch (selectedTimeframe) {
                          case "1W":
                            returnValue = compareETF.priceReturn1Wk ?? null;
                            break;
                          case "1M":
                            returnValue = compareETF.priceReturn1Mo ?? null;
                            break;
                          case "3M":
                            returnValue = compareETF.priceReturn3Mo ?? null;
                            break;
                          case "6M":
                            returnValue = compareETF.priceReturn6Mo ?? null;
                            break;
                          case "1Y":
                            returnValue = compareETF.priceReturn12Mo ?? null;
                            break;
                          case "3Y":
                            returnValue = compareETF.priceReturn3Yr ?? null;
                            break;
                          default:
                            returnValue = compareETF.priceReturn12Mo ?? null;
                        }
                      }
                    }
                    
                    const isPositiveReturn = returnValue !== null && returnValue >= 0;
                    
                    return (
                      <div key={sym} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: color }}
                          />
                          <span className="font-semibold text-sm">{sym}</span>
                        </div>
                        <span className={`font-bold text-sm tabular-nums ${
                          returnValue === null 
                            ? "text-muted-foreground" 
                            : isPositiveReturn 
                              ? "text-green-600" 
                              : "text-red-600"
                        }`}>
                          {returnValue !== null 
                            ? `${isPositiveReturn ? "+" : ""}${returnValue.toFixed(2)}%`
                            : "N/A"
                          }
                        </span>
                      </div>
                    );
                  })}
                </div>
                )}
                
                {/* Period Summary */}
                <div className="mt-4 pt-3 border-t border-slate-200">
                  <p className="text-xs text-muted-foreground">
                    {chartType === "totalReturn" 
                      ? "Total return includes dividends reinvested (DRIP)." 
                      : "Price return excludes dividends (capital gains only)."
                    }
                  </p>
                </div>
              </div>
            </div>
            
            {/* Trading Volume Chart - Section 3.4: gray vertical volume bars */}
            {chartData.length > 0 && chartData.some(d => d.volume && d.volume > 0) && (
              <div className="mt-6 pt-4 border-t">
                <h3 className="text-sm font-semibold mb-3">Trading Volume</h3>
                <ResponsiveContainer width="100%" height={80}>
                  <BarChart data={chartData}>
                    <XAxis 
                      dataKey="time" 
                      stroke="#94a3b8" 
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      tickFormatter={(value) => {
                        // Format dates as "Jan 2025", "Mar 2025", etc.
                        return value;
                      }}
                    />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => {
                        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                        if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                        return value.toString();
                      }}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(255, 255, 255, 0.98)",
                        border: "none",
                        borderRadius: "8px",
                        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                        padding: "8px 12px",
                      }}
                      formatter={(value: number) => [value.toLocaleString(), "Volume"]}
                    />
                    <Bar 
                      dataKey="volume" 
                      fill="#94a3b8"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            
            {/* Dividend Volume Chart */}
            {chartData.length > 0 && chartData.some(d => d.divCash && d.divCash > 0) && (
              <div className="mt-4 pt-4 border-t">
                <h3 className="text-sm font-semibold mb-3">Dividend Payments</h3>
                <ResponsiveContainer width="100%" height={80}>
                  <BarChart data={chartData.filter(d => d.divCash && d.divCash > 0)}>
                    <XAxis 
                      dataKey="time" 
                      stroke="#94a3b8" 
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      tickFormatter={(value) => {
                        // Format dates as "Jan 2025", "Mar 2025", etc.
                        return value;
                      }}
                    />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `$${value.toFixed(2)}`}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(255, 255, 255, 0.98)",
                        border: "none",
                        borderRadius: "8px",
                        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                        padding: "8px 12px",
                      }}
                      formatter={(value: number) => [`$${value.toFixed(4)}`, "Dividend"]}
                    />
                    <Bar 
                      dataKey="divCash" 
                      fill="#22c55e"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        {/* Quick Stats Card - Minimal key info only */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-400 delay-300">
          <Card className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Forward Yield</p>
                <p className="text-xl font-bold text-primary">
                  {etf.forwardYield != null ? `${etf.forwardYield.toFixed(2)}%` : 'N/A'}
                </p>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">52-Week Range</p>
                <p className="text-sm font-medium">
                  ${etf.week52Low?.toFixed(2) ?? 'N/A'} - ${etf.week52High?.toFixed(2) ?? 'N/A'}
                </p>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Annual Dividend</p>
                <p className="text-xl font-bold text-green-600">
                  ${etf.annualDividend?.toFixed(2) ?? 'N/A'}
                </p>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Dividend Volatility</p>
                <p className="text-sm font-medium">
                  {etf.dividendVolatilityIndex ?? (etf.dividendCVPercent != null ? `${etf.dividendCVPercent.toFixed(1)}%` : 'N/A')}
                </p>
              </div>
            </div>
            
            {/* Link to Dividend History */}
            <div className="mt-4 pt-4 border-t text-center">
              <Button
                variant="outline"
                onClick={() => navigate(`/etf/${etf.symbol}/dividends`)}
                className="gap-2"
              >
                View Full Dividend History
              </Button>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default ETFDetail;
