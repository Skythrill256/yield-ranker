import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { ETFTable } from "@/components/ETFTable";
import { fetchETFData } from "@/services/etfData";
import { rankETFs } from "@/utils/ranking";
import { ETF } from "@/types/etf";
import { Loader2 } from "lucide-react";
import { RankingWeights } from "@/types/etf";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { RotateCcw, X, Star, Lock, Sliders } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { UpgradeToPremiumModal } from "@/components/UpgradeToPremiumModal";
import { useFavorites } from "@/hooks/useFavorites";

const Index = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isPremium = !!profile;
  const isGuest = !profile;
  const { favorites, toggleFavorite } = useFavorites();
  const [weights, setWeights] = useState<RankingWeights>({
    yield: 30,
    stdDev: 30,
    totalReturn: 40,
    timeframe: "12mo",
  });
  const [yieldWeight, setYieldWeight] = useState(30);
  const [stdDevWeight, setStdDevWeight] = useState(30);
  const [totalReturnWeight, setTotalReturnWeight] = useState(40);
  const [totalReturnTimeframe, setTotalReturnTimeframe] = useState<
    "3mo" | "6mo"
  >("6mo");
  const [showRankingPanel, setShowRankingPanel] = useState(false);
  const [returnView, setReturnView] = useState<"total" | "price">("total");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [etfData, setEtfData] = useState<ETF[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [infoBanner, setInfoBanner] = useState("");
  const lastUpdated = new Date();

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const data = await fetchETFData();
        const seen = new Set<string>();
        const deduplicated = data.filter((etf) => {
          if (seen.has(etf.symbol)) {
            return false;
          }
          seen.add(etf.symbol);
          return true;
        });
        setEtfData(deduplicated);
      } catch (error) {
        console.error("[Index] Error fetching ETF data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    const loadSiteSettings = async () => {
      try {
        const { getSiteSettings } = await import("@/services/admin");
        const settings = await getSiteSettings();
        const bannerSetting = settings.find((s) => s.key === "homepage_banner");
        if (bannerSetting) {
          setInfoBanner(bannerSetting.value);
        }
      } catch (error) {
        console.error("Failed to load site settings:", error);
      }
    };

    loadData();
    loadSiteSettings();
    // Removed auto-refresh interval: once data is loaded from our database,
    // keep it stable for a clean, non-jittery experience.
  }, []);

  const totalWeight = yieldWeight + stdDevWeight + totalReturnWeight;
  const isValid = totalWeight === 100;

  const handleYieldChange = (value: number[]) => {
    const newYield = value[0];
    setYieldWeight(newYield);
    setWeights({
      yield: newYield,
      stdDev: stdDevWeight,
      totalReturn: totalReturnWeight,
      timeframe: totalReturnTimeframe,
    });
  };

  const handleStdDevChange = (value: number[]) => {
    const newStdDev = value[0];
    setStdDevWeight(newStdDev);
    setWeights({
      yield: yieldWeight,
      stdDev: newStdDev,
      totalReturn: totalReturnWeight,
      timeframe: totalReturnTimeframe,
    });
  };

  const handleTotalReturnChange = (value: number[]) => {
    const newTotalReturn = value[0];
    setTotalReturnWeight(newTotalReturn);
    setWeights({
      yield: yieldWeight,
      stdDev: stdDevWeight,
      totalReturn: newTotalReturn,
      timeframe: totalReturnTimeframe,
    });
  };

  const handleTimeframeChange = (timeframe: "3mo" | "6mo") => {
    setTotalReturnTimeframe(timeframe);
    setWeights({
      yield: yieldWeight,
      stdDev: stdDevWeight,
      totalReturn: totalReturnWeight,
      timeframe,
    });
  };

  const resetToDefaults = () => {
    setYieldWeight(30);
    setStdDevWeight(30);
    setTotalReturnWeight(40);
    setTotalReturnTimeframe("6mo");
    setWeights({ yield: 30, stdDev: 30, totalReturn: 40, timeframe: "6mo" });
  };

  const rankedETFs = rankETFs(etfData, weights);

  const sortedETFs = isGuest
    ? [...rankedETFs].sort((a, b) => a.symbol.localeCompare(b.symbol))
    : rankedETFs;

  const filteredETFs = showFavoritesOnly
    ? sortedETFs.filter((etf) => favorites.has(etf.symbol))
    : sortedETFs;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="relative border-b overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5"></div>
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl"></div>

        <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-20 md:py-32 relative">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground">
              Dividends &amp;{" "}
              <span className="bg-gradient-to-r from-primary via-blue-600 to-accent bg-clip-text text-transparent">
                Total Returns
              </span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed font-medium">
              Maximizing Investment Value Through Dividend Income and Price
              Change with Advanced Screening and Custom Rankings
            </p>
          </div>
        </div>
      </section>

      <main className="w-full max-w-[98%] mx-auto px-2 sm:px-3 py-8 md:py-12">
        <div className="space-y-6">
          {infoBanner && (
            <div className="w-full">
              <Card className="p-4 border-2 border-primary/20 bg-primary/5">
                <p className="text-base md:text-lg text-foreground leading-relaxed font-medium">
                  {infoBanner}
                </p>
              </Card>
            </div>
          )}

          <section className="w-full">
            <div className="flex items-start justify-between gap-2 mb-6">
              <div className="flex flex-col gap-1">
                <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                  Covered Call Option ETFs
                </h3>
                <p className="text-xs text-muted-foreground leading-tight">
                  EOD - Last updated:{" "}
                  {lastUpdated.toLocaleDateString("en-US", {
                    month: "numeric",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  {lastUpdated.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {/* Customize Rankings */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (isGuest) {
                      setShowUpgradeModal(true);
                    } else {
                      setShowRankingPanel(true);
                    }
                  }}
                  className="border-2 border-primary bg-white text-primary hover:bg-white hover:text-primary h-9 rounded-md whitespace-nowrap"
                >
                  <Sliders className="h-4 w-4 mr-2" />
                  Customize Rankings
                </Button>
                {/* Favorites - Rightmost - Only show for premium users */}
                {isPremium && (
                  <Button
                    variant={showFavoritesOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                    className={`border-2 h-9 transition-colors whitespace-nowrap ${
                      showFavoritesOnly
                        ? "bg-yellow-500 hover:bg-yellow-600 border-yellow-500 text-white"
                        : "border-yellow-400 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-600"
                    }`}
                  >
                    <Star
                      className={`h-4 w-4 mr-2 ${
                        showFavoritesOnly ? "fill-white" : "fill-yellow-400"
                      }`}
                    />
                    {showFavoritesOnly ? "Show All" : "Favorites"}{" "}
                    {favorites.size > 0 && `(${favorites.size})`}
                  </Button>
                )}
              </div>
            </div>

            <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-lg">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 px-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                  <h3 className="text-xl font-bold text-foreground mb-2">
                    Loading ETF Data
                  </h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    Fetching latest prices and data from Finnhub...
                  </p>
                </div>
              ) : etfData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-4">
                  <div className="text-6xl mb-4">⚠️</div>
                  <h3 className="text-xl font-bold text-foreground mb-2">
                    No Data Available
                  </h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    Unable to fetch live ETF data. Please check your connection
                    and try again.
                  </p>
                </div>
              ) : (
                <ETFTable
                  etfs={filteredETFs}
                  showRankingPanel={showRankingPanel}
                  onRankingClick={() => setShowRankingPanel(true)}
                  viewMode={returnView}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                />
              )}
            </div>
          </section>
        </div>

        {showRankingPanel && isPremium && (
          <div
            className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center p-4"
            onClick={() => setShowRankingPanel(false)}
          >
            <Card
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-foreground">
                      Customize Rankings
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Personalize your ETF rankings by adjusting the importance
                      of each metric
                    </p>
                  </div>
                  <button
                    onClick={() => setShowRankingPanel(false)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium text-foreground">
                        Yield Weight
                      </Label>
                      <span className="text-2xl font-bold tabular-nums text-primary">
                        {yieldWeight}%
                      </span>
                    </div>
                    <Slider
                      value={[yieldWeight]}
                      onValueChange={handleYieldChange}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium text-foreground">
                        Dividend Volatility Index
                      </Label>
                      <span className="text-2xl font-bold tabular-nums text-primary">
                        {stdDevWeight}%
                      </span>
                    </div>
                    <Slider
                      value={[stdDevWeight]}
                      onValueChange={handleStdDevChange}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium text-foreground">
                        Total Return
                      </Label>
                      <span className="text-2xl font-bold tabular-nums text-primary">
                        {totalReturnWeight}%
                      </span>
                    </div>
                    <Slider
                      value={[totalReturnWeight]}
                      onValueChange={handleTotalReturnChange}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleTimeframeChange("3mo")}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          totalReturnTimeframe === "3mo"
                            ? "bg-primary text-white"
                            : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        3 Mo
                      </button>
                      <button
                        onClick={() => handleTimeframeChange("6mo")}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          totalReturnTimeframe === "6mo"
                            ? "bg-primary text-white"
                            : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        6 Mo
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 border-2 rounded-lg bg-white">
                    <span className="text-base font-semibold text-muted-foreground">
                      Total Weight
                    </span>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-3xl font-bold tabular-nums ${
                          isValid ? "text-primary" : "text-destructive"
                        }`}
                      >
                        {totalWeight}%
                      </span>
                      {isValid ? (
                        <span className="text-sm px-3 py-1.5 rounded-full bg-green-100 text-green-700 font-medium border border-green-300">
                          Valid
                        </span>
                      ) : (
                        <span className="text-sm px-3 py-1.5 rounded-full bg-red-100 text-red-700 font-medium border border-red-300">
                          Not Valid
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={resetToDefaults}
                    className="flex-1 border-2"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Defaults
                  </Button>
                  <Button
                    onClick={() => {
                      if (isGuest) {
                        setShowUpgradeModal(true);
                      } else {
                        setShowRankingPanel(false);
                      }
                    }}
                    className="flex-1"
                    disabled={!isValid}
                  >
                    Apply Rankings
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>

      <UpgradeToPremiumModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
      />

      <Footer />
    </div>
  );
};

export default Index;
