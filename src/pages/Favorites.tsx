import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { ETFTable } from "@/components/ETFTable";
import { fetchETFData } from "@/services/etfData";
import { rankETFs } from "@/utils/ranking";
import { ETF } from "@/types/etf";
import { RankingWeights } from "@/types/etf";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Sliders, RotateCcw, X, Star, Lock, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { UpgradeToPremiumModal } from "@/components/UpgradeToPremiumModal";
import { useFavorites } from "@/hooks/useFavorites";

const Favorites = () => {
  const { profile } = useAuth();
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
  const [totalReturnTimeframe, setTotalReturnTimeframe] = useState<'3mo' | '6mo' | '12mo'>('12mo');
  const [showRankingPanel, setShowRankingPanel] = useState(false);
  const [returnView, setReturnView] = useState<"total" | "price">("total");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [etfData, setEtfData] = useState<ETF[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadETFData = async () => {
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
      setIsLoading(false);
    };
    loadETFData();
    
    const interval = setInterval(loadETFData, 30000);
    return () => clearInterval(interval);
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

  const handleTimeframeChange = (timeframe: '3mo' | '6mo' | '12mo') => {
    setTotalReturnTimeframe(timeframe);
    setWeights({
      yield: yieldWeight,
      stdDev: stdDevWeight,
      totalReturn: totalReturnWeight,
      timeframe: timeframe,
    });
  };

  const resetToDefaults = () => {
    setYieldWeight(30);
    setStdDevWeight(30);
    setTotalReturnWeight(40);
    setTotalReturnTimeframe("12mo");
    setWeights({ yield: 30, stdDev: 30, totalReturn: 40, timeframe: "12mo" });
  };

  const rankedETFs = rankETFs(etfData, weights);
  const favoriteETFs = rankedETFs.filter((etf) => favorites.has(etf.symbol));

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="relative border-b overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5"></div>
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl"></div>

        <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-20 md:py-32 relative">
          <div className="max-w-5xl mx-auto text-center space-y-10">
            <div className="space-y-6">
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-foreground leading-[1.05]">
                Your
                <br />
                <span className="bg-gradient-to-r from-primary via-blue-600 to-accent bg-clip-text text-transparent">
                  Favorite ETFs
                </span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-medium">
                Track and manage your favorite Covered Call Option ETFs in one
                place
              </p>
            </div>
          </div>
        </div>
      </section>

      <main className="w-full max-w-[98%] mx-auto px-2 sm:px-3 py-8 md:py-12">
        <div className="space-y-6">
          {isGuest ? (
            <Card className="p-12 border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-blue-50">
              <div className="text-center max-w-3xl mx-auto space-y-6">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary/10 border-4 border-primary/20 mb-4">
                  <Lock className="h-12 w-12 text-primary" />
                </div>
                <h2 className="text-4xl font-bold text-foreground">
                  Unlock Favorites Feature
                </h2>
                <p className="text-lg text-slate-600 leading-relaxed">
                  Upgrade to Premium to save your favorite ETFs and access weighted rankings customization.
                </p>
                
                <div className="grid sm:grid-cols-2 gap-6 mt-8">
                  <div className="bg-white rounded-xl p-6 border border-slate-200 text-left">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Star className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">Save Favorites</h3>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Select your favorite ETFs and view them in a dedicated table for easy comparison and tracking.
                    </p>
                  </div>
                  
                  <div className="bg-white rounded-xl p-6 border border-slate-200 text-left">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Sliders className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">Custom Rankings</h3>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Customize ETF rankings by adjusting weights for Yield, Dividend Volatility Index (DVI), and Total Returns.
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 border-2 border-primary/30 mt-6">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Check className="w-5 h-5 text-primary" />
                    <p className="text-lg font-bold text-slate-900">FREE Premium - No Credit Card Required</p>
                  </div>
                  <Button 
                    onClick={() => setShowUpgradeModal(true)}
                    className="mt-4 bg-primary hover:bg-primary/90" 
                    size="lg"
                  >
                    <Star className="h-5 w-5 mr-2" />
                    Upgrade to Premium
                  </Button>
                </div>
              </div>
            </Card>
          ) : favorites.size === 0 ? (
            <Card className="p-12 border-2 border-slate-200">
              <div className="text-center max-w-2xl mx-auto space-y-6">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-yellow-50 border-4 border-yellow-200 mb-4">
                  <Star className="h-12 w-12 text-yellow-400" />
                </div>
                <h2 className="text-3xl font-bold text-foreground">
                  No Favorites Yet
                </h2>
                <p className="text-lg text-muted-foreground">
                  Start building your watchlist by favoriting ETFs you're interested in tracking.
                  Click the star icon on any ETF in the main table to add it to your favorites.
                </p>
                <Button 
                  onClick={() => window.location.href = '/'}
                  className="mt-4" 
                  size="lg"
                >
                  Browse All ETFs
                </Button>
              </div>
            </Card>
          ) : (
            <section className="w-full">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-foreground">
                    Your Favorite ETFs
                  </h2>
                  <p className="text-muted-foreground mt-1">
                    {favorites.size} ETF{favorites.size !== 1 ? "s" : ""} in
                    your watchlist
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 justify-end">
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
                    className="border-2 border-primary bg-white text-primary hover:bg-white hover:text-primary h-9 rounded-md"
                  >
                    <Sliders className="h-4 w-4 mr-2" />
                    Customize Rankings
                  </Button>
                  <div className="inline-flex items-center h-9 border-2 border-slate-300 rounded-md overflow-hidden">
                    <button
                      onClick={() => setReturnView("total")}
                      className={`px-4 py-2 text-xs font-semibold transition-all duration-200 ${
                        returnView === "total"
                          ? "bg-primary text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white"
                      }`}
                    >
                      Total Returns
                    </button>
                    <button
                      onClick={() => setReturnView("price")}
                      className={`px-4 py-2 text-xs font-semibold transition-all duration-200 ${
                        returnView === "price"
                          ? "bg-primary text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white"
                      }`}
                    >
                      Price Returns
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-lg">
                <ETFTable
                  etfs={favoriteETFs}
                  showRankingPanel={showRankingPanel}
                  onRankingClick={() => setShowRankingPanel(true)}
                  viewMode={returnView}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                />
              </div>
            </section>
          )}
        </div>

        {showRankingPanel && isPremium && (
          <div
            className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4"
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
                        Dividend Volatility Index (DVI)
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
                        onClick={() => handleTimeframeChange('3mo')}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          totalReturnTimeframe === '3mo'
                            ? 'bg-primary text-white'
                            : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        3 Mo
                      </button>
                      <button
                        onClick={() => handleTimeframeChange('6mo')}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          totalReturnTimeframe === '6mo'
                            ? 'bg-primary text-white'
                            : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        6 Mo
                      </button>
                      <button
                        onClick={() => handleTimeframeChange('12mo')}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          totalReturnTimeframe === '12mo'
                            ? 'bg-primary text-white'
                            : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        12 Mo
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
                    onClick={() => setShowRankingPanel(false)}
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
    </div>
  );
};

export default Favorites;
