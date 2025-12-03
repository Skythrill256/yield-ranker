import { useState, useEffect, useCallback, useMemo } from "react";
import { Header } from "@/components/Header";
import { ETFTable } from "@/components/ETFTable";
import { fetchETFData, fetchETFDataWithMetadata } from "@/services/etfData";
import { rankETFs } from "@/utils/ranking";
import { ETF } from "@/types/etf";
import { Loader2 } from "lucide-react";
import { RankingWeights } from "@/types/etf";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { RotateCcw, X, Star, Lock, Sliders, Plus, Clock } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { UpgradeToPremiumModal } from "@/components/UpgradeToPremiumModal";
import { useFavorites } from "@/hooks/useFavorites";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  saveRankingPreset,
  loadRankingPresets,
  deleteRankingPreset,
  RankingPreset,
  saveRankingWeights,
} from "@/services/preferences";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const isPremium = !!profile;
  const isGuest = !profile;
  const { favorites, toggleFavorite, cleanupFavorites } = useFavorites();
  const [weights, setWeights] = useState<RankingWeights>({
    yield: 30,
    volatility: 30,
    totalReturn: 40,
    timeframe: "12mo",
  });
  const [yieldWeight, setYieldWeight] = useState(30);
  const [volatilityWeight, setVolatilityWeight] = useState<number>(30);
  const [totalReturnWeight, setTotalReturnWeight] = useState(40);
  const [totalReturnTimeframe, setTotalReturnTimeframe] = useState<
    "3mo" | "6mo" | "12mo"
  >("12mo");
  const [showRankingPanel, setShowRankingPanel] = useState(false);
  const [returnView, setReturnView] = useState<"total" | "price">("total");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [etfData, setEtfData] = useState<ETF[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [guestMessage, setGuestMessage] = useState("");
  const [premiumMessage, setPremiumMessage] = useState("");
  const [rankingPresets, setRankingPresets] = useState<RankingPreset[]>([]);
  const [showPresetSaveDialog, setShowPresetSaveDialog] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [lastDataUpdate, setLastDataUpdate] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const result = await fetchETFDataWithMetadata();
        const seen = new Set<string>();
        const deduplicated = result.etfs.filter((etf) => {
          if (seen.has(etf.symbol)) {
            return false;
          }
          seen.add(etf.symbol);
          return true;
        });
        setEtfData(deduplicated);
        
        // Clean up favorites to remove symbols that no longer exist
        cleanupFavorites(deduplicated.map(etf => etf.symbol));
        
        // Format the last updated timestamp to match ETFDetail format
        if (result.lastUpdatedTimestamp) {
          const date = new Date(result.lastUpdatedTimestamp);
          const formatted = date.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });
          setLastDataUpdate(formatted);
        } else if (result.lastUpdated) {
          setLastDataUpdate(result.lastUpdated);
        }
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
        const guestMsgSetting = settings.find((s) => s.key === "guest_message");
        const premiumMsgSetting = settings.find((s) => s.key === "premium_message");
        // Always set values, even if empty (so empty strings are preserved)
        setGuestMessage(guestMsgSetting?.value || "");
        setPremiumMessage(premiumMsgSetting?.value || "");
      } catch (error) {
        console.error("Failed to load site settings:", error);
        // Set empty strings on error so UI doesn't break
        setGuestMessage("");
        setPremiumMessage("");
      }
    };

    loadData();
    loadSiteSettings();
    // Removed auto-refresh interval: once data is loaded from our database,
    // keep it stable for a clean, non-jittery experience.
  }, []);

  // Function to load weights from profile
  const loadWeightsFromProfile = useCallback(() => {
    if (!profile?.preferences) return;

    const savedWeights = profile.preferences.ranking_weights as RankingWeights | undefined;
    if (savedWeights) {
      setWeights(savedWeights);
      setYieldWeight(savedWeights.yield);
      setVolatilityWeight(savedWeights.volatility ?? savedWeights.stdDev ?? 30);
      setTotalReturnWeight(savedWeights.totalReturn);
      if (savedWeights.timeframe === "3mo" || savedWeights.timeframe === "6mo") {
        setTotalReturnTimeframe(savedWeights.timeframe);
      }
    }

    const savedPresets = profile.preferences.ranking_presets as RankingPreset[] | undefined;
    if (savedPresets) {
      setRankingPresets(savedPresets);
    }
  }, [profile]);

  // Load weights and presets from profile
  useEffect(() => {
    loadWeightsFromProfile();
  }, [profile, loadWeightsFromProfile]);

  // Reload weights when navigating to this page
  useEffect(() => {
    if (user?.id && location.pathname === "/") {
      const reloadWeights = async () => {
        try {
          const { data } = await supabase
            .from("profiles")
            .select("preferences")
            .eq("id", user.id)
            .single();
          if (data?.preferences) {
            const prefs = data.preferences as { ranking_weights?: RankingWeights; ranking_presets?: RankingPreset[] };
            const savedWeights = prefs.ranking_weights;
            if (savedWeights) {
              setWeights(savedWeights);
              setYieldWeight(savedWeights.yield);
              setVolatilityWeight(savedWeights.volatility ?? savedWeights.stdDev ?? 30);
              setTotalReturnWeight(savedWeights.totalReturn);
              if (savedWeights.timeframe === "3mo" || savedWeights.timeframe === "6mo" || savedWeights.timeframe === "12mo") {
                setTotalReturnTimeframe(savedWeights.timeframe);
              }
            }
            const savedPresets = prefs.ranking_presets;
            if (savedPresets) {
              setRankingPresets(savedPresets);
            }
          }
        } catch (error) {
          console.error("Failed to reload weights on navigation:", error);
        }
      };
      reloadWeights();
    }
  }, [location.pathname, user?.id]);

  // Reload weights when page becomes visible (handles navigation between pages)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && user?.id) {
        // Reload profile from database to get latest weights
        const reloadProfile = async () => {
          try {
            const { data } = await supabase
              .from("profiles")
              .select("preferences")
              .eq("id", user.id)
              .single();
            if (data?.preferences) {
              const prefs = data.preferences as { ranking_weights?: RankingWeights; ranking_presets?: RankingPreset[] };
              const savedWeights = prefs.ranking_weights;
              if (savedWeights) {
                setWeights(savedWeights);
                setYieldWeight(savedWeights.yield);
                setVolatilityWeight(savedWeights.volatility ?? savedWeights.stdDev ?? 30);
                setTotalReturnWeight(savedWeights.totalReturn);
                if (savedWeights.timeframe === "3mo" || savedWeights.timeframe === "6mo") {
                  setTotalReturnTimeframe(savedWeights.timeframe);
                }
              }
              const savedPresets = prefs.ranking_presets;
              if (savedPresets) {
                setRankingPresets(savedPresets);
              }
            }
          } catch (error) {
            console.error("Failed to reload profile:", error);
          }
        };
        reloadProfile();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user?.id]);

  const totalWeight = (yieldWeight ?? 0) + (volatilityWeight ?? 0) + (totalReturnWeight ?? 0);
  const isValid = !isNaN(totalWeight) && totalWeight === 100;

  const handleYieldChange = (value: number[]) => {
    const newYield = value[0];
    setYieldWeight(newYield);
    setWeights({
      yield: newYield,
      volatility: volatilityWeight,
      totalReturn: totalReturnWeight,
      timeframe: totalReturnTimeframe,
    });
  };

  const handleStdDevChange = (value: number[]) => {
    const newStdDev = (value[0] ?? 30) || 30;
    setVolatilityWeight(newStdDev);
    setWeights({
      yield: yieldWeight,
      volatility: newStdDev,
      totalReturn: totalReturnWeight,
      timeframe: totalReturnTimeframe,
    });
  };

  const handleTotalReturnChange = (value: number[]) => {
    const newTotalReturn = value[0];
    setTotalReturnWeight(newTotalReturn);
    setWeights({
      yield: yieldWeight,
      volatility: volatilityWeight,
      totalReturn: newTotalReturn,
      timeframe: totalReturnTimeframe,
    });
  };

  const handleTimeframeChange = (timeframe: "3mo" | "6mo" | "12mo") => {
    setTotalReturnTimeframe(timeframe);
    setWeights({
      yield: yieldWeight,
      volatility: volatilityWeight,
      totalReturn: totalReturnWeight,
      timeframe,
    });
  };

  const resetToDefaults = () => {
    setYieldWeight(30);
    setVolatilityWeight(30);
    setTotalReturnWeight(40);
    setTotalReturnTimeframe("12mo");
    setWeights({ yield: 30, volatility: 30, totalReturn: 40, timeframe: "12mo" });
  };

  const handleSavePreset = async () => {
    if (!newPresetName.trim()) {
      toast({
        variant: "destructive",
        title: "Invalid name",
        description: "Please enter a preset name",
      });
      return;
    }

    if (!isValid) {
      toast({
        variant: "destructive",
        title: "Invalid weights",
        description: "Total weight must equal 100%",
      });
      return;
    }

    if (!user?.id) return;

    const newWeights: RankingWeights = {
      yield: yieldWeight,
      volatility: volatilityWeight,
      totalReturn: totalReturnWeight,
      timeframe: totalReturnTimeframe,
    };

    try {
      await saveRankingPreset(user.id, newPresetName.trim(), newWeights);
      const updatedPresets = await loadRankingPresets(user.id);
      setRankingPresets(updatedPresets);
      setNewPresetName("");
      setShowPresetSaveDialog(false);
      toast({
        title: "Preset saved",
        description: `"${newPresetName.trim()}" has been saved successfully.`,
      });
    } catch (error) {
      console.error("❌ Failed to save preset:", error);
      toast({
        variant: "destructive",
        title: "Failed to save preset",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleLoadPreset = (preset: RankingPreset) => {
    setYieldWeight(preset.weights.yield);
    setVolatilityWeight(preset.weights.volatility ?? preset.weights.stdDev ?? 30);
    setTotalReturnWeight(preset.weights.totalReturn);
    setTotalReturnTimeframe(preset.weights.timeframe || "6mo");
    setWeights(preset.weights);
    toast({
      title: "Preset loaded",
      description: `"${preset.name}" has been loaded.`,
    });
  };

  const handleDeletePreset = async (presetName: string) => {
    if (!user?.id) return;

    try {
      await deleteRankingPreset(user.id, presetName);
      const updatedPresets = await loadRankingPresets(user.id);
      setRankingPresets(updatedPresets);
      toast({
        title: "Preset deleted",
        description: `"${presetName}" has been deleted.`,
      });
    } catch (error) {
      console.error("❌ Failed to delete preset:", error);
      toast({
        variant: "destructive",
        title: "Failed to delete preset",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const applyRankings = async () => {
    if (!isValid) {
      toast({
        variant: "destructive",
        title: "Invalid weights",
        description: "Total weight must equal 100%",
      });
      return;
    }

    const newWeights: RankingWeights = {
      yield: yieldWeight,
      volatility: volatilityWeight,
      totalReturn: totalReturnWeight,
      timeframe: totalReturnTimeframe,
    };

    setWeights(newWeights);
    setShowRankingPanel(false);

    if (user?.id && isPremium) {
      try {
        await saveRankingWeights(user.id, newWeights);
      } catch (error) {
        console.error("❌ Failed to save weights:", error);
        toast({
          variant: "destructive",
          title: "Failed to save",
          description: `Error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }
    }
  };

  const rankedETFs = useMemo(() => {
    return rankETFs(etfData, weights);
  }, [etfData, weights]);

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
          {((isGuest && guestMessage) || (isPremium && premiumMessage)) && (
            <div className="w-full">
              <Card className="p-4 border-2 border-primary/20 bg-primary/5">
                <p className="text-base md:text-lg text-foreground leading-relaxed font-medium">
                  {isGuest ? guestMessage : premiumMessage}
                </p>
              </Card>
            </div>
          )}

          <section className="w-full relative z-0">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
              <div className="flex flex-col gap-1">
                <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                  Covered Call Option ETFs
                </h3>
                <p className="text-xs text-muted-foreground leading-tight">
                  {lastDataUpdate ? (
                    <>
                      <Clock className="h-3 w-3 inline mr-1" />
                      Last updated: {lastDataUpdate}
                      <span className="ml-2 text-primary font-medium">Source: Tiingo</span>
                    </>
                  ) : (
                    <>
                      Last updated: {lastDataUpdate || 'N/A'}
                      <span className="ml-2 text-primary font-medium">Source: Tiingo</span>
                    </>
                  )}
                  <br />
                  <span>Records: {filteredETFs.length}</span>
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {/* Current Rankings Display - Above button */}
                {isPremium && (
                  <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1 sm:gap-2 flex-wrap">
                    <span className="font-medium">Ranking:</span>
                    <span>Yield {yieldWeight}%</span>
                    <span>•</span>
                    <span>Volatility {volatilityWeight}%</span>
                    <span>•</span>
                    <span>Return {totalReturnWeight}%</span>
                    <span>•</span>
                    <span>{totalReturnTimeframe.toUpperCase()}</span>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:pt-0.5 md:flex-nowrap">
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
                    className="border-2 border-primary bg-white text-primary hover:bg-white hover:text-primary h-10 sm:h-9 md:h-9 rounded-md whitespace-nowrap w-full sm:w-auto md:flex-shrink-0 justify-center"
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
                      className={`border-2 h-10 sm:h-9 md:h-9 transition-colors whitespace-nowrap w-full sm:w-auto md:flex-shrink-0 justify-center ${
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

                {/* Presets Section */}
                {rankingPresets.length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-base font-semibold text-foreground">
                      Saved Presets
                    </Label>
                    <div className="max-h-48 overflow-y-auto pr-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        {rankingPresets.map((preset) => (
                          <div
                            key={preset.name}
                            className="group relative flex items-center gap-2 p-3 rounded-lg border-2 border-slate-200 bg-blue-50 hover:border-primary hover:bg-primary/5 transition-all"
                          >
                            <button
                              onClick={() => handleLoadPreset(preset)}
                              className="flex-1 text-left min-w-0"
                            >
                              <p className="text-sm font-semibold text-foreground truncate">
                                {preset.name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                Y:{preset.weights.yield}% D:
                                {preset.weights.volatility ?? preset.weights.stdDev ?? 0}% R:
                                {preset.weights.totalReturn}%
                              </p>
                            </button>
                            <button
                              onClick={() => handleDeletePreset(preset.name)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all flex-shrink-0"
                              title="Delete preset"
                            >
                              <X className="h-4 w-4 text-red-600" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium text-foreground">
                        Yield
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
                        {volatilityWeight ?? 0}%
                      </span>
                    </div>
                    <Slider
                      value={[volatilityWeight ?? 0]}
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
                      <button
                        onClick={() => handleTimeframeChange("12mo")}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          totalReturnTimeframe === "12mo"
                            ? "bg-primary text-white"
                            : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
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
                        {isNaN(totalWeight) ? 0 : totalWeight}%
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

                <div className="space-y-3 pt-4 border-t">
                  {/* Save Preset Dialog */}
                  {showPresetSaveDialog ? (
                    <div className="p-4 rounded-lg border-2 border-primary bg-primary/5 space-y-3">
                      <Label className="text-sm font-semibold text-foreground">
                        Save Current Settings as Preset
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          value={newPresetName}
                          onChange={(e) => setNewPresetName(e.target.value)}
                          placeholder="Enter preset name..."
                          className="flex-1 border-2"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSavePreset();
                            if (e.key === "Escape") {
                              setShowPresetSaveDialog(false);
                              setNewPresetName("");
                            }
                          }}
                          autoFocus
                        />
                        <Button
                          onClick={handleSavePreset}
                          size="sm"
                          disabled={!newPresetName.trim() || !isValid}
                        >
                          Save
                        </Button>
                        <Button
                          onClick={() => {
                            setShowPresetSaveDialog(false);
                            setNewPresetName("");
                          }}
                          size="sm"
                          variant="outline"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setShowPresetSaveDialog(true)}
                      className="w-full border-2 border-dashed border-primary text-primary hover:bg-primary/10 hover:text-primary"
                      disabled={!isValid || isGuest}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Save as Preset
                    </Button>
                  )}

                  <div className="flex items-center gap-3">
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
                          applyRankings();
                        }
                      }}
                      className="flex-1"
                      disabled={!isValid}
                    >
                      Apply Rankings
                    </Button>
                  </div>
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
