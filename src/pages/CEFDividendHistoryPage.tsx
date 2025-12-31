import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { ArrowLeft, Loader2, Clock, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { DividendHistory } from "@/components/DividendHistory";
import { fetchSingleCEF, fetchCEFDataWithMetadata } from "@/services/cefData";
import { CEF } from "@/types/cef";

const CEFDividendHistoryPage = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [cef, setCef] = useState<CEF | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cefNotFound, setCefNotFound] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    const loadCEF = async () => {
      if (!symbol) return;
      
      setIsLoading(true);
      setCefNotFound(false);
      try {
        const [singleData, metadata] = await Promise.all([
          fetchSingleCEF(symbol),
          fetchCEFDataWithMetadata()
        ]);
        
        if (singleData) {
          setCef(singleData);
        } else {
          setCefNotFound(true);
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
        console.error("Error loading CEF:", error);
        setCefNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadCEF();
  }, [symbol]);

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

  return (
    <div className="min-h-screen bg-background">
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

        {cefNotFound && (
          <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-400 delay-100">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> This CEF is not currently in our database, but dividend history may still be available.
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {cef && (
              <>
                <div className="mb-4 sm:mb-6 animate-in fade-in slide-in-from-bottom-4 duration-400 delay-100">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xl sm:text-2xl font-bold">DIVIDEND HISTORY CHART</h2>
                    <Button
                      variant="default"
                      onClick={() => navigate(`/cef/${cef.symbol}`)}
                      className="gap-2 font-bold text-base bg-accent text-white hover:bg-accent/90"
                    >
                      <BarChart3 className="h-4 w-4" />
                      View Price/NAV Chart
                    </Button>
                  </div>
                  {cef.symbol && (
                    <div className="mb-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl sm:text-3xl font-bold">{cef.symbol}</span>
                        <span className="text-base sm:text-lg text-muted-foreground">{cef.name || cef.description}</span>
                      </div>
                      {(cef.marketPrice != null || cef.nav != null) && (
                        <div className="text-xl sm:text-2xl font-bold mt-1">
                          ${cef.marketPrice != null ? cef.marketPrice.toFixed(2) : (cef.nav != null ? cef.nav.toFixed(2) : 'N/A')}
                        </div>
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
                          <span className="text-muted-foreground">15 Yr:</span>
                          <span className={`font-semibold ${
                            cef.return15Yr != null && cef.return15Yr >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {cef.return15Yr != null ? `${cef.return15Yr >= 0 ? '+' : ''}${cef.return15Yr.toFixed(1)}%` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">10 Yr:</span>
                          <span className={`font-semibold ${
                            cef.return10Yr != null && cef.return10Yr >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {cef.return10Yr != null ? `${cef.return10Yr >= 0 ? '+' : ''}${cef.return10Yr.toFixed(1)}%` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">5 Yr:</span>
                          <span className={`font-semibold ${
                            cef.return5Yr != null && cef.return5Yr >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {cef.return5Yr != null ? `${cef.return5Yr >= 0 ? '+' : ''}${cef.return5Yr.toFixed(1)}%` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">3 Yr:</span>
                          <span className={`font-semibold ${
                            cef.return3Yr != null && cef.return3Yr >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {cef.return3Yr != null ? `${cef.return3Yr >= 0 ? '+' : ''}${cef.return3Yr.toFixed(1)}%` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">12 Mo:</span>
                          <span className={`font-semibold ${
                            cef.return12Mo != null && cef.return12Mo >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {cef.return12Mo != null ? `${cef.return12Mo >= 0 ? '+' : ''}${cef.return12Mo.toFixed(1)}%` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">6 Mo:</span>
                          <span className={`font-semibold ${
                            cef.return6Mo != null && cef.return6Mo >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {cef.return6Mo != null ? `${cef.return6Mo >= 0 ? '+' : ''}${cef.return6Mo.toFixed(1)}%` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">3 Mo:</span>
                          <span className={`font-semibold ${
                            cef.return3Mo != null && cef.return3Mo >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {cef.return3Mo != null ? `${cef.return3Mo >= 0 ? '+' : ''}${cef.return3Mo.toFixed(1)}%` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">1 Mo:</span>
                          <span className={`font-semibold ${
                            cef.return1Mo != null && cef.return1Mo >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {cef.return1Mo != null ? `${cef.return1Mo >= 0 ? '+' : ''}${cef.return1Mo.toFixed(1)}%` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">1 Wk:</span>
                          <span className={`font-semibold ${
                            cef.return1Wk != null && cef.return1Wk >= 0 ? 'text-green-600' : 'text-red-600'
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
                        {/* DVI/Div Volatility removed per CEO request */}
                      </div>
                    </div>
                  </Card>
                </div>
              </>
            )}

            <DividendHistory
              ticker={symbol.toUpperCase()}
              annualDividend={cef?.yearlyDividend || null}
              dvi={cef?.dividendCVPercent || null}
              forwardYield={cef?.forwardYield || null}
              numPayments={cef?.numPayments || null}
            />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default CEFDividendHistoryPage;
