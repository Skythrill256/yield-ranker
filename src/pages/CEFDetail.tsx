import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Clock, TrendingUp, TrendingDown } from "lucide-react";
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

type Timeframe = "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "10Y" | "20Y" | "MAX";

const CEFDetail = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [cef, setCef] = useState<CEF | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("1Y");
  const [chartData, setChartData] = useState<PriceNAVData[]>([]);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!symbol) return;
      
      try {
        setIsLoading(true);
        const [singleData, metadata] = await Promise.all([
          fetchSingleCEF(symbol),
          fetchCEFDataWithMetadata()
        ]);
        
        if (singleData) {
          setCef(singleData);
        }
        
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
        console.error("[CEFDetail] Error fetching CEF data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();

    const handleCEFDataUpdated = () => {
      loadData();
      if (cef) {
        buildChartData();
      }
    };

    window.addEventListener('cefDataUpdated', handleCEFDataUpdated);
    return () => {
      window.removeEventListener('cefDataUpdated', handleCEFDataUpdated);
    };
  }, [symbol]);

  const buildChartData = useCallback(async () => {
    if (!symbol) return;

    setIsChartLoading(true);
    setChartError(null);

    try {
      const data = await fetchCEFPriceNAV(symbol, selectedTimeframe);
      if (!data.data || data.data.length === 0) {
        setChartError("Chart data is not available for this timeframe.");
        setChartData([]);
        return;
      }

      // Format data for chart - ensure proper date filtering and sorting
      const endDate = new Date();
      const startDate = new Date();
      
      switch (selectedTimeframe) {
        case '1M':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        case '3M':
          startDate.setMonth(endDate.getMonth() - 3);
          break;
        case '6M':
          startDate.setMonth(endDate.getMonth() - 6);
          break;
        case '1Y':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        case '3Y':
          startDate.setFullYear(endDate.getFullYear() - 3);
          break;
        case '5Y':
          startDate.setFullYear(endDate.getFullYear() - 5);
          break;
        case '10Y':
          startDate.setFullYear(endDate.getFullYear() - 10);
          break;
        case '20Y':
          startDate.setFullYear(endDate.getFullYear() - 20);
          break;
        default:
          startDate.setFullYear(endDate.getFullYear() - 1);
      }

      const filteredData = data.data
        .filter(d => {
          const dataDate = new Date(d.date);
          return dataDate >= startDate && dataDate <= endDate;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const formattedData = filteredData.map(d => ({
        date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        fullDate: d.date,
        price: d.price !== null && d.price !== undefined ? Number(d.price) : null,
        nav: d.nav !== null && d.nav !== undefined ? Number(d.nav) : null,
      }));

      setChartData(formattedData);
    } catch (error) {
      console.error("[CEFDetail] Error building chart data:", error);
      setChartError("Unable to load chart data right now.");
      setChartData([]);
    } finally {
      setIsChartLoading(false);
    }
  }, [symbol, selectedTimeframe]);

  useEffect(() => {
    if (cef) {
      buildChartData();
    }
  }, [cef, buildChartData]);

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

  const timeframes: Timeframe[] = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "10Y", "20Y", "MAX"];

  // Calculate price and NAV ranges for chart
  const priceValues = chartData.map(d => d.price).filter(v => v !== null) as number[];
  const navValues = chartData.map(d => d.nav).filter(v => v !== null) as number[];
  const allValues = [...priceValues, ...navValues];
  const minValue = allValues.length > 0 ? Math.min(...allValues) * 0.95 : 0;
  const maxValue = allValues.length > 0 ? Math.max(...allValues) * 1.05 : 100;

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

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">{cef.symbol}</h1>
                <p className="text-muted-foreground">{cef.name || cef.description}</p>
                {cef.issuer && <p className="text-sm text-muted-foreground mt-1">Issuer: {cef.issuer}</p>}
              </div>
              {lastUpdated && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4 md:mt-0">
                  <Clock className="h-4 w-4" />
                  <span>Last updated: {lastUpdated}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">Market Price</h3>
                <p className="text-2xl font-bold">{cef.marketPrice != null ? `$${cef.marketPrice.toFixed(2)}` : 'N/A'}</p>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">NAV</h3>
                <p className="text-2xl font-bold">{cef.nav != null ? `$${cef.nav.toFixed(2)}` : 'N/A'}</p>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">Premium/Discount</h3>
                <p className={`text-2xl font-bold ${cef.premiumDiscount != null && cef.premiumDiscount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {cef.premiumDiscount != null ? `${cef.premiumDiscount >= 0 ? '+' : ''}${cef.premiumDiscount.toFixed(2)}%` : 'N/A'}
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">Last Dividend</h3>
                <p className="text-2xl font-bold">{cef.lastDividend != null ? `$${cef.lastDividend.toFixed(4)}` : 'N/A'}</p>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">Forward Yield</h3>
                <p className="text-2xl font-bold text-primary">{cef.forwardYield != null ? `${cef.forwardYield.toFixed(2)}%` : 'N/A'}</p>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">Dividend History</h3>
                <p className="text-2xl font-bold">{cef.dividendHistory || 'N/A'}</p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t">
              <Button
                onClick={() => navigate(`/cef/${cef.symbol}/dividends`)}
                className="w-full md:w-auto"
              >
                View Dividend History
              </Button>
            </div>
          </Card>

          {/* Price/NAV Chart */}
          <Card className="p-6">
            <div className="mb-4">
              <h2 className="text-xl font-bold mb-4">Price & NAV Chart</h2>
              
              {/* Timeframe selector */}
              <div className="flex flex-wrap gap-2 mb-4">
                {timeframes.map((tf) => (
                  <Button
                    key={tf}
                    variant={selectedTimeframe === tf ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTimeframe(tf)}
                    className={selectedTimeframe === tf ? "bg-primary" : ""}
                  >
                    {tf}
                  </Button>
                ))}
              </div>
            </div>

            {isChartLoading ? (
              <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : chartError ? (
              <div className="flex items-center justify-center h-96 text-muted-foreground">
                <p>{chartError}</p>
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={450}>
                <LineChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#666"
                    style={{ fontSize: '11px', fontWeight: 500 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    tick={{ fill: '#666' }}
                  />
                  <YAxis 
                    domain={[minValue, maxValue]}
                    stroke="#666"
                    style={{ fontSize: '11px', fontWeight: 500 }}
                    tickFormatter={(value) => `$${value.toFixed(2)}`}
                    label={{ value: 'Closing Price ($)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: '12px', fill: '#666' } }}
                    tick={{ fill: '#666' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      padding: '8px',
                    }}
                    formatter={(value: number | null, name: string) => {
                      if (value === null) return 'N/A';
                      return [`$${value.toFixed(2)}`, name === 'price' ? 'Price' : 'NAV'];
                    }}
                    labelStyle={{ fontWeight: 600, marginBottom: '4px' }}
                  />
                  <Legend 
                    verticalAlign="top"
                    align="left"
                    iconType="line"
                    wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#1f2937"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    name="Price"
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="nav"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    name="NAV"
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-96 text-muted-foreground">
                <p>No chart data available</p>
              </div>
            )}
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CEFDetail;
