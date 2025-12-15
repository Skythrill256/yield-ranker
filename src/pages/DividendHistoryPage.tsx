import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { ArrowLeft, Loader2, Clock, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { DividendHistory } from "@/components/DividendHistory";
import { fetchSingleETF, fetchETFDataWithMetadata } from "@/services/etfData";
import { ETF } from "@/types/etf";

const DividendHistoryPage = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [etf, setEtf] = useState<ETF | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [etfNotFound, setEtfNotFound] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    const loadETF = async () => {
      if (!symbol) return;
      
      setIsLoading(true);
      setEtfNotFound(false);
      try {
        const [singleData, metadata] = await Promise.all([
          fetchSingleETF(symbol),
          fetchETFDataWithMetadata()
        ]);
        
        if (singleData) {
          setEtf(singleData);
        } else {
          setEtfNotFound(true);
        }
        
        // Format the last updated timestamp
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
        console.error("Error loading ETF:", error);
        setEtfNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadETF();
  }, [symbol]);

  if (!symbol) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Invalid symbol</p>
            <Button onClick={() => navigate("/")} className="mt-4">
              Back to Rankings
            </Button>
          </div>
        </main>
      </div>
    );
  }

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

        {etfNotFound && (
          <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-400 delay-100">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> This ETF is not currently in our database, but dividend history may still be available.
              </p>
            </div>
          </div>
        )}

        {!isLoading && etf && (
          <>
            <div className="mb-4 sm:mb-6 animate-in fade-in slide-in-from-bottom-4 duration-400 delay-100">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl sm:text-2xl font-bold">DIVIDEND HISTORY CHART</h2>
                <Button
                  variant="default"
                  onClick={() => navigate(`/etf/${etf.symbol}`)}
                  className="gap-2 font-bold text-base bg-accent text-white hover:bg-accent/90"
                >
                  <BarChart3 className="h-4 w-4" />
                  View Total Return Chart
                </Button>
              </div>
              {etf.symbol && (
                <div className="mb-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-bold">{etf.symbol}</span>
                    <span className="text-base sm:text-lg text-muted-foreground">{etf.name}</span>
                  </div>
                  {etf.price != null && (
                    <div className="text-xl sm:text-2xl font-bold mt-1">${etf.price.toFixed(2)}</div>
                  )}
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
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-400 delay-150 mb-4">
              <Card className="p-4">
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="font-semibold text-foreground">Total Return:</span>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">3 Yr:</span>
                      <span className={`font-semibold ${
                        (etf.trDrip3Yr ?? etf.totalReturn3Yr) != null && (etf.trDrip3Yr ?? etf.totalReturn3Yr)! >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {(etf.trDrip3Yr ?? etf.totalReturn3Yr) != null ? `${(etf.trDrip3Yr ?? etf.totalReturn3Yr)! >= 0 ? '+' : ''}${(etf.trDrip3Yr ?? etf.totalReturn3Yr)!.toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">12 Mo:</span>
                      <span className={`font-semibold ${
                        (etf.trDrip12Mo ?? etf.totalReturn12Mo) != null && (etf.trDrip12Mo ?? etf.totalReturn12Mo)! >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {(etf.trDrip12Mo ?? etf.totalReturn12Mo) != null ? `${(etf.trDrip12Mo ?? etf.totalReturn12Mo)! >= 0 ? '+' : ''}${(etf.trDrip12Mo ?? etf.totalReturn12Mo)!.toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">6 Mo:</span>
                      <span className={`font-semibold ${
                        (etf.trDrip6Mo ?? etf.totalReturn6Mo) != null && (etf.trDrip6Mo ?? etf.totalReturn6Mo)! >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {(etf.trDrip6Mo ?? etf.totalReturn6Mo) != null ? `${(etf.trDrip6Mo ?? etf.totalReturn6Mo)! >= 0 ? '+' : ''}${(etf.trDrip6Mo ?? etf.totalReturn6Mo)!.toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">3 Mo:</span>
                      <span className={`font-semibold ${
                        (etf.trDrip3Mo ?? etf.totalReturn3Mo) != null && (etf.trDrip3Mo ?? etf.totalReturn3Mo)! >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {(etf.trDrip3Mo ?? etf.totalReturn3Mo) != null ? `${(etf.trDrip3Mo ?? etf.totalReturn3Mo)! >= 0 ? '+' : ''}${(etf.trDrip3Mo ?? etf.totalReturn3Mo)!.toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">1 Mo:</span>
                      <span className={`font-semibold ${
                        (etf.trDrip1Mo ?? etf.totalReturn1Mo) != null && (etf.trDrip1Mo ?? etf.totalReturn1Mo)! >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {(etf.trDrip1Mo ?? etf.totalReturn1Mo) != null ? `${(etf.trDrip1Mo ?? etf.totalReturn1Mo)! >= 0 ? '+' : ''}${(etf.trDrip1Mo ?? etf.totalReturn1Mo)!.toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">1 Wk:</span>
                      <span className={`font-semibold ${
                        (etf.trDrip1Wk ?? etf.totalReturn1Wk) != null && (etf.trDrip1Wk ?? etf.totalReturn1Wk)! >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {(etf.trDrip1Wk ?? etf.totalReturn1Wk) != null ? `${(etf.trDrip1Wk ?? etf.totalReturn1Wk)! >= 0 ? '+' : ''}${(etf.trDrip1Wk ?? etf.totalReturn1Wk)!.toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <div>
                      <span className="text-muted-foreground font-bold">Annual Div: </span>
                      <span className="font-bold text-green-600">${etf.annualDividend?.toFixed(2) ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-bold">Fwd Yield: </span>
                      <span className="font-bold text-primary">{etf.forwardYield?.toFixed(2) ?? 'N/A'}%</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-bold">52 Wk Range: </span>
                      <span className="font-semibold">${etf.week52Low?.toFixed(2) ?? 'N/A'} - ${etf.week52High?.toFixed(2) ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-bold">Div Volatility: </span>
                      <span className="font-semibold">
                        {etf.dividendCVPercent != null && etf.dividendCVPercent > 0 
                          ? `${etf.dividendCVPercent.toFixed(1)}%` 
                          : (etf.dividendVolatilityIndex || 'N/A')}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-400 delay-200">
          {isLoading ? (
            <Card className="p-6">
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            </Card>
          ) : (
            <DividendHistory 
              ticker={symbol} 
              annualDividend={etf?.annualDividend ?? null}
              dvi={etf?.dividendCVPercent ?? null}
              forwardYield={etf?.forwardYield ?? null}
            />
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DividendHistoryPage;

