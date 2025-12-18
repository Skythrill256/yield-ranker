import { useState, useEffect, useCallback, useMemo } from "react";
import { Header } from "@/components/Header";
import { CEFTable } from "@/components/CEFTable";
import { fetchCEFDataWithMetadata, clearCEFCache, isCEFDataCached } from "@/services/cefData";
import { CEF, RankingWeights } from "@/types/cef";
import { Loader2, Clock, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { UpgradeToPremiumModal } from "@/components/UpgradeToPremiumModal";
import { useFavorites } from "@/hooks/useFavorites";
import { getSiteSettings } from "@/services/admin";
import { rankCEFs } from "@/utils/cefRanking";
import { loadRankingWeights, saveRankingWeights } from "@/services/preferences";

const Index = () => {
  const { user, profile } = useAuth();
  const isPremium = !!profile;
  const isGuest = !profile;
  const { favorites: cefFavorites, toggleFavorite, cleanupFavorites } = useFavorites('cef');

  const [cefData, setCefData] = useState<CEF[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [guestMessage, setGuestMessage] = useState("");
  const [premiumMessage, setPremiumMessage] = useState("");
  const [lastDataUpdate, setLastDataUpdate] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [weights, setWeights] = useState<RankingWeights>({
    yield: 34,
    volatility: 33,
    totalReturn: 33,
    timeframe: "12mo",
  });

  useEffect(() => {
    const loadData = async (isInitialLoad: boolean = true) => {
      try {
        if (isInitialLoad && !isCEFDataCached()) {
          setIsLoading(true);
        }
        const result = await fetchCEFDataWithMetadata();
        const seen = new Set<string>();
        const deduplicated = (result.cefs || []).filter((cef) => {
          if (seen.has(cef.symbol)) {
            return false;
          }
          seen.add(cef.symbol);
          return true;
        });
        setCefData(deduplicated);
        
        cleanupFavorites(deduplicated.map(cef => cef.symbol));

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
        console.error("[CEFIndex] Error fetching CEF data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    const loadSiteSettings = async () => {
      try {
        const settings = await getSiteSettings();
        const guestMsgSetting = settings.find((s) => s.key === "guest_message");
        const premiumMsgSetting = settings.find((s) => s.key === "premium_message");
        setGuestMessage(guestMsgSetting?.value || "");
        setPremiumMessage(premiumMsgSetting?.value || "");
      } catch (error) {
        console.error("Failed to load site settings:", error);
        setGuestMessage("");
        setPremiumMessage("");
      }
    };

    loadData();
    loadSiteSettings();

    const handleCEFDataUpdated = () => {
      clearCEFCache();
      loadData(false);
    };

    window.addEventListener('cefDataUpdated', handleCEFDataUpdated);
    return () => {
      window.removeEventListener('cefDataUpdated', handleCEFDataUpdated);
    };
  }, [cleanupFavorites]);

  // Load ranking weights from profile
  useEffect(() => {
    const loadWeights = async () => {
      if (user?.id && isPremium) {
        try {
          const savedWeights = await loadRankingWeights(user.id);
          if (savedWeights) {
            setWeights(savedWeights);
          }
        } catch (error) {
          console.error("[CEFIndex] Failed to load ranking weights:", error);
        }
      }
    };
    loadWeights();
  }, [user?.id, isPremium, profile]);

  // Save weights when they change (for premium users)
  useEffect(() => {
    if (user?.id && isPremium && weights) {
      const saveWeights = async () => {
        try {
          await saveRankingWeights(user.id, weights);
        } catch (error) {
          console.error("[CEFIndex] Failed to save ranking weights:", error);
        }
      };
      const timeoutId = setTimeout(saveWeights, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [weights, user?.id, isPremium]);

  const rankedCEFs = useMemo(() => {
    if (!cefData || cefData.length === 0) return [];
    if (isGuest) return cefData;
    try {
      return rankCEFs(cefData, weights);
    } catch (error) {
      console.error("[CEFIndex] Error ranking CEFs:", error);
      return cefData;
    }
  }, [cefData, weights, isGuest]);

  const filteredCEFs = useCallback(() => {
    const dataToFilter = isGuest ? cefData : rankedCEFs;
    if (showFavoritesOnly && isPremium) {
      return dataToFilter.filter(cef => cefFavorites.has(cef.symbol));
    }
    return dataToFilter;
  }, [isGuest, cefData, rankedCEFs, showFavoritesOnly, isPremium, cefFavorites]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <section className="relative border-b overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5"></div>
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl"></div>

        <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-20 md:py-32 relative">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground">
              Closed-End{" "}
              <span className="bg-gradient-to-r from-primary via-blue-600 to-accent bg-clip-text text-transparent">
                Funds
              </span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed font-medium">
              Advanced Analysis with Premium/Discount Metrics and NAV Trends
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
                <div className="flex items-center gap-3">
                  <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                    Closed-End Funds
                  </h3>
                </div>
                <div className="text-xs text-muted-foreground leading-tight">
                  {lastDataUpdate ? (
                    <div className="flex items-center gap-1 mb-1">
                      <Clock className="h-3 w-3" />
                      <span>Last updated: {lastDataUpdate}</span>
                      <span className="ml-2 text-primary font-medium">Source: Tiingo</span>
                    </div>
                  ) : (
                    <div className="mb-1">
                      <span>Last updated: {lastDataUpdate || 'N/A'}</span>
                      <span className="ml-2 text-primary font-medium">Source: Tiingo</span>
                    </div>
                  )}
                  <div className="mt-1">Records: {filteredCEFs().length}</div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:pt-0.5 md:flex-nowrap">
                  {isPremium && (
                    <button
                      onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                      className={`border-2 h-10 sm:h-9 md:h-9 transition-colors whitespace-nowrap w-full sm:w-auto md:flex-shrink-0 justify-center px-4 rounded-md flex items-center ${
                        showFavoritesOnly
                          ? "bg-yellow-500 hover:bg-yellow-600 border-yellow-500 text-white"
                          : "border-yellow-400 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-600"
                      }`}
                    >
                      <Star
                        className={`h-4 w-4 mr-2 ${showFavoritesOnly ? "fill-white" : "fill-yellow-400"
                          }`}
                      />
                      {showFavoritesOnly ? "Show All" : "CEF Favorites"}{" "}
                      {cefFavorites.size > 0 && `(${cefFavorites.size})`}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-lg">
              {isLoading ? (
                <div className="min-h-[60vh] flex flex-col items-center justify-center py-20 px-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                  <h3 className="text-xl font-bold text-foreground mb-2">
                    Loading CEF Data
                  </h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    Fetching the latest data. Please wait.
                  </p>
                </div>
              ) : filteredCEFs().length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-4">
                  <div className="text-6xl mb-4">⚠️</div>
                  <h3 className="text-xl font-bold text-foreground mb-2">
                    No Data Available
                  </h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    Unable to fetch live CEF data. Please check your connection
                    and try again.
                  </p>
                </div>
              ) : (
                <CEFTable
                  cefs={filteredCEFs()}
                  favorites={cefFavorites}
                  onToggleFavorite={toggleFavorite}
                />
              )}
            </div>
          </section>
        </div>

        <UpgradeToPremiumModal
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
        />
      </main>

      <Footer />
    </div>
  );
};

export default Index;

