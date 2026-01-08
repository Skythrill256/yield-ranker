import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { ETFTable } from "@/components/ETFTable";
import { CEFTable } from "@/components/CEFTable";
import { fetchETFData } from "@/services/etfData";
import { fetchCEFDataWithMetadata } from "@/services/cefData";
import { rankETFs } from "@/utils/ranking";
import { rankCEFs } from "@/utils/cefRanking";
import { ETF, RankingWeights as ETFRankingWeights } from "@/types/etf";
import { CEF, RankingWeights as CEFRankingWeights } from "@/types/cef";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Sliders, RotateCcw, X, Star, Lock, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { UpgradeToPremiumModal } from "@/components/UpgradeToPremiumModal";
import { useFavorites } from "@/hooks/useFavorites";
import { Footer } from "@/components/Footer";

const Favorites = () => {
  const { profile } = useAuth();
  const isPremium = !!profile;
  const isGuest = !profile;
  const { favorites: etfFavorites, toggleFavorite: toggleETFFavorite, cleanupFavorites: cleanupETFFavorites } = useFavorites('etf');
  const { favorites: cefFavorites, toggleFavorite: toggleCEFFavorite, cleanupFavorites: cleanupCEFFavorites } = useFavorites('cef');

  const [etfWeights, setEtfWeights] = useState<ETFRankingWeights>({
    yield: 30,
    stdDev: 30,
    totalReturn: 40,
    timeframe: "12mo",
  });
  const [cefWeights, setCefWeights] = useState<CEFRankingWeights>({
    yield: 34,
    volatility: 33,
    totalReturn: 33,
    timeframe: "12mo",
  });
  const [etfYieldWeight, setEtfYieldWeight] = useState(30);
  const [etfStdDevWeight, setEtfStdDevWeight] = useState(30);
  const [etfTotalReturnWeight, setEtfTotalReturnWeight] = useState(40);
  const [etfTotalReturnTimeframe, setEtfTotalReturnTimeframe] = useState<'3mo' | '6mo'>('6mo');
  const [cefYieldWeight, setCefYieldWeight] = useState(34);
  const [cefVolatilityWeight, setCefVolatilityWeight] = useState(33);
  const [cefTotalReturnWeight, setCefTotalReturnWeight] = useState(33);
  const [cefTotalReturnTimeframe, setCefTotalReturnTimeframe] = useState<'3mo' | '6mo' | '12mo'>('12mo');
  const [showEtfRankingPanel, setShowEtfRankingPanel] = useState(false);
  const [showCefRankingPanel, setShowCefRankingPanel] = useState(false);
  const [returnView, setReturnView] = useState<"total" | "price">("total");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [etfData, setEtfData] = useState<ETF[]>([]);
  const [cefData, setCefData] = useState<CEF[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const [etfs, cefs] = await Promise.all([
        fetchETFData(),
        fetchCEFDataWithMetadata()
      ]);
      
      const seen = new Set<string>();
      const deduplicatedETFs = etfs.filter((etf) => {
        if (seen.has(etf.symbol)) {
          return false;
        }
        seen.add(etf.symbol);
        return true;
      });
      setEtfData(deduplicatedETFs);
      cleanupETFFavorites(deduplicatedETFs.map(etf => etf.symbol));

      const seenCEFs = new Set<string>();
      const deduplicatedCEFs = cefs.filter((cef) => {
        if (seenCEFs.has(cef.symbol)) {
          return false;
        }
        seenCEFs.add(cef.symbol);
        return true;
      });
      setCefData(deduplicatedCEFs);
      cleanupCEFFavorites(deduplicatedCEFs.map(cef => cef.symbol));
      
      setIsLoading(false);
    };
    loadData();
  }, []);

  const etfTotalWeight = etfYieldWeight + etfStdDevWeight + etfTotalReturnWeight;
  const etfIsValid = etfTotalWeight === 100;
  const cefTotalWeight = (cefYieldWeight ?? 0) + (cefVolatilityWeight ?? 0) + (cefTotalReturnWeight ?? 0);
  const cefIsValid = !isNaN(cefTotalWeight) && cefTotalWeight === 100;

  const handleEtfYieldChange = (value: number[]) => {
    const newYield = value[0];
    setEtfYieldWeight(newYield);
    setEtfWeights({
      yield: newYield,
      stdDev: etfStdDevWeight,
      totalReturn: etfTotalReturnWeight,
      timeframe: etfTotalReturnTimeframe,
    });
  };

  const handleEtfStdDevChange = (value: number[]) => {
    const newStdDev = value[0];
    setEtfStdDevWeight(newStdDev);
    setEtfWeights({
      yield: etfYieldWeight,
      stdDev: newStdDev,
      totalReturn: etfTotalReturnWeight,
      timeframe: etfTotalReturnTimeframe,
    });
  };

  const handleEtfTotalReturnChange = (value: number[]) => {
    const newTotalReturn = value[0];
    setEtfTotalReturnWeight(newTotalReturn);
    setEtfWeights({
      yield: etfYieldWeight,
      stdDev: etfStdDevWeight,
      totalReturn: newTotalReturn,
      timeframe: etfTotalReturnTimeframe,
    });
  };

  const handleEtfTimeframeChange = (timeframe: '3mo' | '6mo') => {
    setEtfTotalReturnTimeframe(timeframe);
    setEtfWeights({
      yield: etfYieldWeight,
      stdDev: etfStdDevWeight,
      totalReturn: etfTotalReturnWeight,
      timeframe: timeframe,
    });
  };

  const handleCefYieldChange = (value: number[]) => {
    const newYield = value[0];
    setCefYieldWeight(newYield);
    setCefWeights({
      yield: newYield,
      volatility: cefVolatilityWeight,
      totalReturn: cefTotalReturnWeight,
      timeframe: cefTotalReturnTimeframe,
    });
  };

  const handleCefVolatilityChange = (value: number[]) => {
    const newVol = value[0] ?? 33;
    setCefVolatilityWeight(newVol);
    setCefWeights({
      yield: cefYieldWeight,
      volatility: newVol,
      totalReturn: cefTotalReturnWeight,
      timeframe: cefTotalReturnTimeframe,
    });
  };

  const handleCefTotalReturnChange = (value: number[]) => {
    const newTotalReturn = value[0];
    setCefTotalReturnWeight(newTotalReturn);
    setCefWeights({
      yield: cefYieldWeight,
      volatility: cefVolatilityWeight,
      totalReturn: newTotalReturn,
      timeframe: cefTotalReturnTimeframe,
    });
  };

  const handleCefTimeframeChange = (timeframe: '3mo' | '6mo' | '12mo') => {
    setCefTotalReturnTimeframe(timeframe);
    setCefWeights({
      yield: cefYieldWeight,
      volatility: cefVolatilityWeight,
      totalReturn: cefTotalReturnWeight,
      timeframe,
    });
  };

  const resetEtfToDefaults = () => {
    setEtfYieldWeight(30);
    setEtfStdDevWeight(30);
    setEtfTotalReturnWeight(40);
    setEtfTotalReturnTimeframe("6mo");
    setEtfWeights({ yield: 30, stdDev: 30, totalReturn: 40, timeframe: "6mo" });
  };

  const resetCefToDefaults = () => {
    setCefYieldWeight(34);
    setCefVolatilityWeight(33);
    setCefTotalReturnWeight(33);
    setCefTotalReturnTimeframe("12mo");
    setCefWeights({ yield: 34, volatility: 33, totalReturn: 33, timeframe: "12mo" });
  };

  const rankedETFs = rankETFs(etfData, etfWeights);
  const favoriteETFs = rankedETFs.filter((etf) => etfFavorites.has(etf.symbol));
  const rankedCEFs = rankCEFs(cefData, cefWeights);
  const favoriteCEFs = rankedCEFs.filter((cef) => cefFavorites.has(cef.symbol));

  const hasAnyFavorites = etfFavorites.size > 0 || cefFavorites.size > 0;

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
                  Favorites
                </span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-medium">
                Track and manage your favorite investments across all categories
              </p>
            </div>
          </div>
        </div>
      </section>

      <main className="w-full max-w-[98%] mx-auto px-2 sm:px-3 py-8 md:py-12">
        <div className="space-y-8">
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
                  Upgrade to Premium to save your favorite investments and access weighted rankings customization.
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
                      Select your favorite investments and view them in dedicated tables for easy comparison and tracking.
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
                      Customize rankings by adjusting weights for Yield, DVI/Z-Score, and Total Returns.
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
          ) : !hasAnyFavorites ? (
            <Card className="p-12 border-2 border-slate-200">
              <div className="text-center max-w-2xl mx-auto space-y-6">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-yellow-50 border-4 border-yellow-200 mb-4">
                  <Star className="h-12 w-12 text-yellow-400" />
                </div>
                <h2 className="text-3xl font-bold text-foreground">
                  No Favorites Yet
                </h2>
                <p className="text-lg text-muted-foreground">
                  Start building your watchlist by favoriting investments you're interested in tracking.
                  Click the star icon on any investment in the main tables to add it to your favorites.
                </p>
                <div className="flex gap-4 justify-center mt-6">
                  <Button 
                    onClick={() => window.location.href = '/'}
                    className="mt-4" 
                    size="lg"
                  >
                    Browse CC ETFs
                  </Button>
                  <Button 
                    onClick={() => window.location.href = '/cef'}
                    className="mt-4" 
                    size="lg"
                    variant="outline"
                  >
                    Browse CEFs
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <>
              {etfFavorites.size > 0 && (
                <Card className="border-2 border-slate-200">
                  <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight text-foreground">
                        CC ETF Favorites
                      </h2>
                      <p className="text-muted-foreground mt-1">
                        {etfFavorites.size} ETF{etfFavorites.size !== 1 ? "s" : ""} in your watchlist
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
                            setShowEtfRankingPanel(true);
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
                      showRankingPanel={showEtfRankingPanel}
                      onRankingClick={() => setShowEtfRankingPanel(true)}
                      viewMode={returnView}
                      favorites={etfFavorites}
                      onToggleFavorite={toggleETFFavorite}
                    />
                  </div>
                  </div>
                </Card>
              )}

              {cefFavorites.size > 0 && (
                <Card className="border-2 border-slate-200">
                  <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight text-foreground">
                        CEF Favorites
                      </h2>
                      <p className="text-muted-foreground mt-1">
                        {cefFavorites.size} CEF{cefFavorites.size !== 1 ? "s" : ""} in your watchlist
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
                            setShowCefRankingPanel(true);
                          }
                        }}
                        className="border-2 border-primary bg-white text-primary hover:bg-white hover:text-primary h-9 rounded-md"
                      >
                        <Sliders className="h-4 w-4 mr-2" />
                        Customize Rankings
                      </Button>
                    </div>
                  </div>

                  <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-lg">
                    <CEFTable
                      cefs={favoriteCEFs}
                      favorites={cefFavorites}
                      onToggleFavorite={toggleCEFFavorite}
                    />
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {showEtfRankingPanel && isPremium && (
          <div
            className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4"
            onClick={() => setShowEtfRankingPanel(false)}
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
                      Personalize your CC ETF rankings by adjusting the importance of each metric
                    </p>
                  </div>
                  <button
                    onClick={() => setShowEtfRankingPanel(false)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium text-foreground">
                        Yield
                      </Label>
                      <span className="text-2xl font-bold tabular-nums text-primary">
                        {etfYieldWeight}%
                      </span>
                    </div>
                    <Slider
                      value={[etfYieldWeight]}
                      onValueChange={handleEtfYieldChange}
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
                        {etfStdDevWeight}%
                      </span>
                    </div>
                    <Slider
                      value={[etfStdDevWeight]}
                      onValueChange={handleEtfStdDevChange}
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
                        {etfTotalReturnWeight}%
                      </span>
                    </div>
                    <Slider
                      value={[etfTotalReturnWeight]}
                      onValueChange={handleEtfTotalReturnChange}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleEtfTimeframeChange('3mo')}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          etfTotalReturnTimeframe === '3mo'
                            ? 'bg-primary text-white'
                            : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        3 Mo
                      </button>
                      <button
                        onClick={() => handleEtfTimeframeChange('6mo')}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          etfTotalReturnTimeframe === '6mo'
                            ? 'bg-primary text-white'
                            : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
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
                          etfIsValid ? "text-primary" : "text-destructive"
                        }`}
                      >
                        {etfTotalWeight}%
                      </span>
                      {etfIsValid ? (
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
                    onClick={resetEtfToDefaults}
                    className="flex-1 border-2"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Defaults
                  </Button>
                  <Button
                    onClick={() => setShowEtfRankingPanel(false)}
                    className="flex-1"
                    disabled={!etfIsValid}
                  >
                    Apply Rankings
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {showCefRankingPanel && isPremium && (
          <div
            className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4"
            onClick={() => setShowCefRankingPanel(false)}
          >
            <Card
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-foreground">
                      Customize CEF Rankings
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Personalize your CEF rankings by adjusting the importance of each metric
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCefRankingPanel(false)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium text-foreground">
                        Yield
                      </Label>
                      <span className="text-2xl font-bold tabular-nums text-primary">
                        {cefYieldWeight}%
                      </span>
                    </div>
                    <Slider
                      value={[cefYieldWeight]}
                      onValueChange={handleCefYieldChange}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium text-foreground">
                        Z-Score
                      </Label>
                      <span className="text-2xl font-bold tabular-nums text-primary">
                        {cefVolatilityWeight ?? 0}%
                      </span>
                    </div>
                    <Slider
                      value={[cefVolatilityWeight ?? 0]}
                      onValueChange={handleCefVolatilityChange}
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
                        {cefTotalReturnWeight}%
                      </span>
                    </div>
                    <Slider
                      value={[cefTotalReturnWeight]}
                      onValueChange={handleCefTotalReturnChange}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleCefTimeframeChange('3mo')}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          cefTotalReturnTimeframe === '3mo'
                            ? 'bg-primary text-white'
                            : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        3 Mo
                      </button>
                      <button
                        onClick={() => handleCefTimeframeChange('6mo')}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          cefTotalReturnTimeframe === '6mo'
                            ? 'bg-primary text-white'
                            : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        6 Mo
                      </button>
                      <button
                        onClick={() => handleCefTimeframeChange('12mo')}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          cefTotalReturnTimeframe === '12mo'
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
                          cefIsValid ? "text-primary" : "text-destructive"
                        }`}
                      >
                        {isNaN(cefTotalWeight) ? 0 : cefTotalWeight}%
                      </span>
                      {cefIsValid ? (
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
                    onClick={resetCefToDefaults}
                    className="flex-1 border-2"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Defaults
                  </Button>
                  <Button
                    onClick={() => setShowCefRankingPanel(false)}
                    className="flex-1"
                    disabled={!cefIsValid}
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

export default Favorites;
