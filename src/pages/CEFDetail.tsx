import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Clock, TrendingUp, TrendingDown, BarChart3, Plus, X, Search } from "lucide-react";
import { Footer } from "@/components/Footer";
import { fetchSingleCEF, fetchCEFDataWithMetadata, fetchCEFPriceNAV, PriceNAVData } from "@/services/cefData";
import { CEF } from "@/types/cef";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReturnsComparisonChart } from "@/components/ReturnsComparisonChart";
import { fetchCEFData } from "@/services/cefData";
import { SEO, getFinancialProductSchema } from "@/components/SEO";

type Timeframe = "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "10Y" | "20Y";
type ChartType = "priceNAV" | "totalReturn" | "priceReturn";

const CEFDetail = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [cef, setCef] = useState<CEF | null>(null);
  const [allCEFs, setAllCEFs] = useState<CEF[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("6M");
  const [chartType, setChartType] = useState<ChartType>("priceNAV");
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartError, setChartError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [comparisonCEFs, setComparisonCEFs] = useState<string[]>([]);
  const [showComparisonSelector, setShowComparisonSelector] = useState(false);
  const [comparisonSearchQuery, setComparisonSearchQuery] = useState("");

  const toggleComparison = (compSymbol: string) => {
    if (comparisonCEFs.includes(compSymbol)) {
      setComparisonCEFs(comparisonCEFs.filter((s) => s !== compSymbol));
    } else if (comparisonCEFs.length < 5) {
      setComparisonCEFs([...comparisonCEFs, compSymbol]);
    }
  };

  const buildChartData = useCallback(async () => {
    if (!symbol || chartType !== "priceNAV") return;

    // Don't show loading spinner when switching timeframes - keep existing data visible for smooth transition
    setChartError(null);

    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Chart data fetch timeout")), 30000); // 30 second timeout
      });

      // Fetch data for main symbol and all comparison symbols
      const symbolsToFetch = [symbol, ...comparisonCEFs];
      const fetchPromises = symbolsToFetch.map(sym => 
        fetchCEFPriceNAV(sym, selectedTimeframe)
      );
      
      const allData = await Promise.race([
        Promise.all(fetchPromises),
        timeoutPromise
      ]) as Awaited<ReturnType<typeof fetchCEFPriceNAV>>[];

      // Get main symbol data
      const mainData = allData[0];
      if (!mainData.data || mainData.data.length === 0) {
        setChartError("Chart data is not available for this timeframe.");
        setChartData([]);
        return;
      }

      // Create a map of dates to data points
      const dateMap = new Map<string, any>();

      // Process main symbol data
      mainData.data.forEach(d => {
        const dateStr = d.date;
        const priceValue = d.price !== null && d.price !== undefined ? Number(d.price) : null;
        const navValue = d.nav !== null && d.nav !== undefined ? Number(d.nav) : null;

        dateMap.set(dateStr, {
          date: new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          fullDate: dateStr,
          price: priceValue,
          nav: navValue,
        });
      });

      // Process comparison symbols data
      comparisonCEFs.forEach((compSymbol, index) => {
        const compData = allData[index + 1];
        if (compData && compData.data) {
          compData.data.forEach(d => {
            const dateStr = d.date;
            const priceValue = d.price !== null && d.price !== undefined ? Number(d.price) : null;
            const navValue = d.nav !== null && d.nav !== undefined ? Number(d.nav) : null;

            if (dateMap.has(dateStr)) {
              const existing = dateMap.get(dateStr);
              dateMap.set(dateStr, {
                ...existing,
                [`price_${compSymbol}`]: priceValue,
                [`nav_${compSymbol}`]: navValue,
              });
            } else {
              dateMap.set(dateStr, {
                date: new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                fullDate: dateStr,
                price: null,
                nav: null,
                [`price_${compSymbol}`]: priceValue,
                [`nav_${compSymbol}`]: navValue,
              });
            }
          });
        }
      });

      // Convert map to array and sort by date
      const formattedData = Array.from(dateMap.values()).sort((a, b) => {
        const dateA = new Date(a.fullDate).getTime();
        const dateB = new Date(b.fullDate).getTime();
        return dateA - dateB;
      });

      setChartData(formattedData);
    } catch (error) {
      console.error("[CEFDetail] Error building chart data:", error);
      setChartError("Unable to load chart data right now.");
      setChartData([]);
    }
  }, [symbol, selectedTimeframe, chartType, comparisonCEFs]);


  useEffect(() => {
    const loadData = async () => {
      if (!symbol) return;

      setIsLoading(true);
      try {
        const [singleData, metadata, allCEFsData] = await Promise.all([
          fetchSingleCEF(symbol),
          fetchCEFDataWithMetadata(),
          fetchCEFData()
        ]);

        if (singleData) {
          setCef(singleData);
        }

        setAllCEFs(allCEFsData);

        if (metadata.lastUpdatedTimestamp) {
          const date = new Date(metadata.lastUpdatedTimestamp);
          const formatted = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
          setLastUpdated(formatted);
        } else if (metadata.lastUpdated) {
          setLastUpdated(metadata.lastUpdated);
        }
      } catch (error) {
        console.error("Error loading CEF:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [symbol]);

  useEffect(() => {
    if (cef && chartType === "priceNAV") {
      buildChartData();
    }
  }, [cef, buildChartData, chartType]);

  if (!symbol) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Invalid symbol</p>
            <Button onClick={() => navigate("/cef")} className="mt-4">
              Back to CEFs
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  if (!cef) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/cef")}
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to CEFs
          </Button>
          <div className="text-center py-12">
            <p className="text-muted-foreground">CEF not found</p>
          </div>
        </main>
      </div>
    );
  }

  // Price/NAV chart timeframes - align with total returns (3Y, 5Y, 10Y, 20Y)
  const timeframes: Timeframe[] = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "10Y", "20Y"];

  // Calculate current return for display (using 12 Mo return as default)
  const currentReturn = cef.return12Mo;
  const isPositive = currentReturn != null && currentReturn >= 0;

  // Calculate price and NAV ranges for chart (including comparison CEFs)
  const getAllPriceValues = () => {
    const values: number[] = [];
    chartData.forEach(d => {
      if (d.price !== null) values.push(d.price);
      if (d.nav !== null) values.push(d.nav);
      comparisonCEFs.forEach(sym => {
        if (d[`price_${sym}`] !== null && d[`price_${sym}`] !== undefined) values.push(d[`price_${sym}`]);
        if (d[`nav_${sym}`] !== null && d[`nav_${sym}`] !== undefined) values.push(d[`nav_${sym}`]);
      });
    });
    return values;
  };
  const allValues = getAllPriceValues();
  const minValue = allValues.length > 0 ? Math.min(...allValues) * 0.95 : 0;
  const maxValue = allValues.length > 0 ? Math.max(...allValues) * 1.05 : 100;

  // Colors for comparison lines
  const comparisonColors = ["#f97316", "#8b5cf6", "#10b981", "#ef4444", "#ec4899"];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${cef.symbol} CEF Analysis - Premium/Discount & Returns`}
        description={`Analyze ${cef.symbol} (${cef.name || cef.description}) closed-end fund with NAV trends, premium/discount metrics, and dividend history.`}
        keywords={`${cef.symbol}, closed-end fund, CEF analysis, NAV discount, dividend yield, ${cef.name || ''}`}
        structuredData={getFinancialProductSchema(cef.symbol, cef.name || cef.description || '', 'CEF')}
      />
      <Header />

      <main className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="animate-in fade-in slide-in-from-left-4 duration-300">
          <Button
            variant="ghost"
            onClick={() => navigate("/cef")}
            className="mb-6 hover:bg-slate-100 hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to CEFs
          </Button>
        </div>

        {/* Header with symbol, price, and return indicator */}
        <div className="mb-4 sm:mb-6 animate-in fade-in slide-in-from-bottom-4 duration-400 delay-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl sm:text-2xl font-bold">
              {chartType === "priceNAV" ? "PRICE/NAV CHART" : chartType === "totalReturn" ? "TOTAL RETURN CHART" : "PRICE RETURN CHART"}
            </h2>
            <Button
              variant="default"
              onClick={() => navigate(`/cef/${cef.symbol}/dividends`)}
              className="gap-2 font-bold text-base bg-accent text-white hover:bg-accent/90"
            >
              View Dividend History
            </Button>
          </div>
          {cef.symbol && (
            <div className="mb-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold">{cef.symbol}</span>
                <span className="text-base sm:text-lg text-muted-foreground">{cef.name || cef.description}</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xl sm:text-2xl font-bold">
                  {cef.marketPrice != null ? `$${cef.marketPrice.toFixed(2)}` : (cef.nav != null ? `$${cef.nav.toFixed(2)}` : 'N/A')}
                </span>
                {currentReturn != null && (
                  <span className={`text-lg font-semibold flex items-center ${isPositive ? "text-green-600" : "text-red-600"
                    }`}>
                    {isPositive ? <TrendingUp className="w-5 h-5 mr-1" /> : <TrendingDown className="w-5 h-5 mr-1" />}
                    {`${currentReturn >= 0 ? '+' : ''}${currentReturn.toFixed(2)}%`}
                  </span>
                )}
              </div>
              {lastUpdated && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <Clock className="h-3 w-3" />
                  <span>Last updated {lastUpdated}</span>
                  <span className="text-primary font-medium">Source: Tiingo</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Top Metrics Bar */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-400 delay-150">
          <Card className="p-4 mb-4">
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="font-semibold text-foreground">Total Return:</span>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">15 Yr:</span>
                  <span className={`font-semibold ${cef.return15Yr != null && cef.return15Yr >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {cef.return15Yr != null ? `${cef.return15Yr >= 0 ? '+' : ''}${cef.return15Yr.toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">10 Yr:</span>
                  <span className={`font-semibold ${cef.return10Yr != null && cef.return10Yr >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {cef.return10Yr != null ? `${cef.return10Yr >= 0 ? '+' : ''}${cef.return10Yr.toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">5 Yr:</span>
                  <span className={`font-semibold ${cef.return5Yr != null && cef.return5Yr >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {cef.return5Yr != null ? `${cef.return5Yr >= 0 ? '+' : ''}${cef.return5Yr.toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">3 Yr:</span>
                  <span className={`font-semibold ${cef.return3Yr != null && cef.return3Yr >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {cef.return3Yr != null ? `${cef.return3Yr >= 0 ? '+' : ''}${cef.return3Yr.toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">12 Mo:</span>
                  <span className={`font-semibold ${cef.return12Mo != null && cef.return12Mo >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {cef.return12Mo != null ? `${cef.return12Mo >= 0 ? '+' : ''}${cef.return12Mo.toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">6 Mo:</span>
                  <span className={`font-semibold ${cef.return6Mo != null && cef.return6Mo >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {cef.return6Mo != null ? `${cef.return6Mo >= 0 ? '+' : ''}${cef.return6Mo.toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">3 Mo:</span>
                  <span className={`font-semibold ${cef.return3Mo != null && cef.return3Mo >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {cef.return3Mo != null ? `${cef.return3Mo >= 0 ? '+' : ''}${cef.return3Mo.toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">1 Mo:</span>
                  <span className={`font-semibold ${cef.return1Mo != null && cef.return1Mo >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {cef.return1Mo != null ? `${cef.return1Mo >= 0 ? '+' : ''}${cef.return1Mo.toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">1 Wk:</span>
                  <span className={`font-semibold ${cef.return1Wk != null && cef.return1Wk >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {cef.return1Wk != null ? `${cef.return1Wk >= 0 ? '+' : ''}${cef.return1Wk.toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <div>
                  <span className="text-muted-foreground font-bold">Annual Div: </span>
                  <span className="font-bold text-green-600">${cef.yearlyDividend?.toFixed(2) ?? 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground font-bold">Fwd Yield: </span>
                  <span className="font-bold text-primary">{cef.forwardYield?.toFixed(2) ?? 'N/A'}%</span>
                </div>
                {cef.week52Low != null && cef.week52High != null && (
                  <div>
                    <span className="text-muted-foreground font-bold">52 Wk Range: </span>
                    <span className="font-semibold">${cef.week52Low.toFixed(2)} - ${cef.week52High.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Chart Section */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-400 delay-200 relative z-0" data-chart-section>
          <Card className="p-6 mb-8 relative z-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-bold">
                {chartType === "priceNAV" ? "PRICE/NAV CHART" : chartType === "totalReturn" ? "TOTAL RETURN CHART" : "PRICE RETURN CHART"}
              </h2>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 relative z-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-bold text-muted-foreground whitespace-nowrap">
                    Metric:
                  </label>
                  <Select
                    value={chartType}
                    onValueChange={(value: ChartType) => setChartType(value)}
                  >
                    <SelectTrigger className="w-[160px] h-9 text-sm text-blue-600 border-blue-600 focus:border-blue-600 focus:ring-blue-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priceNAV">
                        <span className="font-bold">Price/NAV</span>
                      </SelectItem>
                      <SelectItem value="totalReturn">
                        <span className="font-bold">Total Return (DRIP)</span>
                      </SelectItem>
                      <SelectItem value="priceReturn">
                        <span className="font-bold">Price Return</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {chartType === "priceNAV" && (
                  <button
                    onClick={() => setShowComparisonSelector(!showComparisonSelector)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors bg-accent text-white hover:bg-accent/90 flex items-center gap-1 h-9"
                  >
                    <Plus className="h-3 w-3" />
                    Compare ({comparisonCEFs.length}/5)
                  </button>
                )}
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
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
            </div>

            {chartType === "priceNAV" && comparisonCEFs.length > 0 && (
              <div className="mb-4 flex gap-2 flex-wrap">
                {[symbol, ...comparisonCEFs].map((sym, index) => {
                  const compareCEF = allCEFs.find((c) => c.symbol === sym);
                  if (!compareCEF) return null;
                  const colors = ["#1f2937", "#f97316", "#8b5cf6", "#10b981", "#ef4444", "#ec4899"];
                  const color = colors[index % colors.length];

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
                        {compareCEF.marketPrice != null && (
                          <span className="text-xs text-muted-foreground">
                            ${compareCEF.marketPrice.toFixed(2)}
                          </span>
                        )}
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

            {chartType === "priceNAV" && showComparisonSelector && (
              <div className="mb-4 p-4 bg-slate-50 border-2 border-slate-200 rounded-lg relative">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">Search CEFs to Compare</h3>
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
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search by symbol..."
                    value={comparisonSearchQuery}
                    onChange={(e) => setComparisonSearchQuery(e.target.value.toUpperCase())}
                    className="pl-9"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {allCEFs
                    .filter((c) => {
                      const query = comparisonSearchQuery.toLowerCase();
                      return (
                        c.symbol.toLowerCase().includes(query) &&
                        c.symbol !== symbol &&
                        !comparisonCEFs.includes(c.symbol)
                      );
                    })
                    .slice(0, 10)
                    .map((c) => (
                      <button
                        key={c.symbol}
                        onClick={() => {
                          toggleComparison(c.symbol);
                          setComparisonSearchQuery("");
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-200 rounded flex items-center justify-between"
                      >
                        <div>
                          <span className="font-semibold">{c.symbol}</span>
                          {c.name && (
                            <span className="text-xs text-muted-foreground ml-2">
                              {c.name}
                            </span>
                          )}
                        </div>
                        {c.marketPrice != null && (
                          <span className="text-sm font-semibold">
                            ${c.marketPrice.toFixed(2)}
                          </span>
                        )}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {chartError && (
              <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                {chartError}
              </div>
            )}

            {/* Show actual date range when data is available */}
            {chartData && chartData.length > 0 && (
              <div className="mb-2 text-xs text-muted-foreground">
                Showing data from{' '}
                {chartData[0]?.fullDate ? new Date(chartData[0].fullDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : chartData[0]?.date}
                {' '}to{' '}
                {chartData[chartData.length - 1]?.fullDate ? new Date(chartData[chartData.length - 1].fullDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : chartData[chartData.length - 1]?.date}
                {' '}({chartData.length} data points)
              </div>
            )}

            {chartType === "priceNAV" ? (
              <>
                {chartError ? (
                  <div className="flex items-center justify-center h-96 text-muted-foreground">
                    <p>{chartError}</p>
                  </div>
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="#94a3b8"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        interval={
                          chartData.length <= 30 ? 0 :
                            chartData.length <= 90 ? Math.floor(chartData.length / 6) :
                              chartData.length <= 365 ? Math.floor(chartData.length / 8) :
                                Math.floor(chartData.length / 10)
                        }
                        tickFormatter={(value) => value || ''}
                      />
                      <YAxis
                        domain={[minValue, maxValue]}
                        stroke="#94a3b8"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => {
                          if (typeof value === 'number' && !isNaN(value)) {
                            return `$${value.toFixed(2)}`;
                          }
                          return '';
                        }}
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
                        labelFormatter={(label) => {
                          const dataPoint = chartData.find(d => d.date === label);
                          if (dataPoint?.fullDate) {
                            const date = new Date(dataPoint.fullDate);
                            return date.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            });
                          }
                          return label;
                        }}
                        formatter={(value: number | null, name: string) => {
                          if (value === null || value === undefined) return 'N/A';
                          if (typeof value === 'number' && !isNaN(value)) {
                            return [`$${value.toFixed(2)}`, name];
                          }
                          return ['N/A', name];
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="left"
                        iconType="line"
                        wrapperStyle={{ paddingBottom: '10px', fontSize: '12px', color: '#64748b' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke="#1f2937"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 5 }}
                        name={`${symbol} Price`}
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        dataKey="nav"
                        stroke="#3b82f6"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 5 }}
                        name={`${symbol} NAV`}
                        connectNulls={true}
                      />
                      {comparisonCEFs.map((compSymbol, index) => {
                        const color = comparisonColors[index % comparisonColors.length];
                        return (
                          <React.Fragment key={compSymbol}>
                            <Line
                              type="monotone"
                              dataKey={`price_${compSymbol}`}
                              stroke={color}
                              strokeWidth={2}
                              strokeDasharray="5 5"
                              dot={false}
                              activeDot={{ r: 4 }}
                              name={`${compSymbol} Price`}
                              connectNulls={true}
                            />
                            <Line
                              type="monotone"
                              dataKey={`nav_${compSymbol}`}
                              stroke={color}
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4 }}
                              name={`${compSymbol} NAV`}
                              connectNulls={true}
                            />
                          </React.Fragment>
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-96 text-muted-foreground">
                    <p>No chart data available</p>
                  </div>
                )}
              </>
            ) : (
              <ReturnsComparisonChart
                ticker={symbol || ""}
                allTickers={allCEFs.map(c => c.symbol)}
                externalPeriod={selectedTimeframe === "10Y" ? "5Y" : selectedTimeframe === "20Y" ? "MAX" : selectedTimeframe as any}
                hidePeriodSelector={true}
              />
            )}
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CEFDetail;
