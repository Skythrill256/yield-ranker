import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import {
  fetchETFData,
  fetchETFDataWithMetadata,
  fetchQuickUpdates,
  fetchComparisonData,
  generateChartData,
  ChartType,
  ComparisonTimeframe,
} from "@/services/etfData";
import { rankETFs } from "@/utils/ranking";
import { RankingWeights } from "@/types/etf";
import { ETF } from "@/types/etf";
import {
  LogOut,
  Home,
  BarChart3,
  Users,
  Bell,
  TrendingUp,
  TrendingDown,
  Search,
  RotateCcw,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Upload,
  ArrowUpDown,
  Settings,
  ChevronLeft,
  PanelLeftClose,
  PanelLeft,
  Menu,
  Sliders,
  Info,
  X,
  Star,
  LineChart as LineChartIcon,
  Plus,
  Lock,
  ShieldCheck,
  RefreshCw,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { UpgradeToPremiumModal } from "@/components/UpgradeToPremiumModal";
import { useFavorites } from "@/hooks/useFavorites";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { listProfiles, updateProfile, ProfileRow } from "@/services/admin";
import {
  saveRankingWeights,
  loadRankingWeights,
  saveRankingPreset,
  loadRankingPresets,
  deleteRankingPreset,
  RankingPreset,
  saveChartSettings,
} from "@/services/preferences";
import { supabase } from "@/lib/supabase";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export default function Dashboard() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { favorites, toggleFavorite: toggleFavoriteHook } = useFavorites();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllETFs, setShowAllETFs] = useState(false);
  const [selectedETF, setSelectedETF] = useState<ETF | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] =
    useState<ComparisonTimeframe>("1D");
  const [initialETFCount, setInitialETFCount] = useState(5);
  const [adminPanelExpanded, setAdminPanelExpanded] = useState(false);
  const [accountPanelExpanded, setAccountPanelExpanded] = useState(false);
  const [showRankingPanel, setShowRankingPanel] = useState(false);
  const [infoBanner, setInfoBanner] = useState("");
  const [showTotalReturns, setShowTotalReturns] = useState(true);
  const [chartType, setChartType] = useState<ChartType>("totalReturn");
  const [comparisonETFs, setComparisonETFs] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showComparisonSelector, setShowComparisonSelector] = useState(false);
  const [comparisonSearchQuery, setComparisonSearchQuery] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [adminSection, setAdminSection] = useState<"users" | "upload" | null>(
    null
  );
  const [rankingPresets, setRankingPresets] = useState<RankingPreset[]>([]);
  const [showPresetSaveDialog, setShowPresetSaveDialog] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const isInitialChartLoad = useRef(true);
  const [adminProfiles, setAdminProfiles] = useState<ProfileRow[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [adminUpdatingId, setAdminUpdatingId] = useState<string | null>(null);
  const [etfData, setEtfData] = useState<ETF[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [lastDataUpdate, setLastDataUpdate] = useState<string | null>(null);
  const [chartHeight, setChartHeight] = useState(300);

  const isAdmin = profile?.role === "admin";
  const isPremium = !!profile;
  const isGuest = !profile;

  useEffect(() => {
    const loadETFData = async () => {
      setIsLoadingData(true);
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

      // Format the last updated timestamp
      if (result.lastUpdatedTimestamp) {
        const date = new Date(result.lastUpdatedTimestamp);
        const formatted = date.toLocaleString("en-US", {
          month: "numeric",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        setLastDataUpdate(formatted);
      } else if (result.lastUpdated) {
        setLastDataUpdate(result.lastUpdated);
      }

      setIsLoadingData(false);
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

    loadETFData();
    loadSiteSettings();
  }, []);

  // Removed quick-update polling: once ETF data is loaded from our database,
  // keep it stable instead of continuously sweeping/refreshing prices.

  const fetchAdminProfiles = useCallback(async () => {
    setAdminLoading(true);
    try {
      const data = await listProfiles();
      setAdminProfiles(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load users";
      toast({
        variant: "destructive",
        title: "Failed to load users",
        description: message,
      });
    } finally {
      setAdminLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (adminSection === "users" && isAdmin) {
      fetchAdminProfiles();
    }
  }, [adminSection, isAdmin, fetchAdminProfiles]);

  const filteredAdminProfiles = useMemo(() => {
    const term = adminSearchQuery.trim().toLowerCase();
    if (!term) return adminProfiles;
    return adminProfiles.filter((p) => {
      const name = p.display_name ?? "";
      return (
        name.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        p.role.toLowerCase().includes(term)
      );
    });
  }, [adminProfiles, adminSearchQuery]);

  const totalUsers = adminProfiles.length;
  const adminCount = adminProfiles.filter((p) => p.role === "admin").length;
  // All signed-up users are Premium - no guests
  const premiumCount = adminProfiles.filter((p) => p.role !== "admin").length;
  const guestCount = 0; // No guests - all users are Premium

  const handleAdminRoleToggle = async (row: ProfileRow) => {
    const nextRole = row.role === "admin" ? "user" : "admin";
    const key = `${row.id}-role`;
    setAdminUpdatingId(key);
    try {
      const updated = await updateProfile(row.id, { role: nextRole });
      setAdminProfiles((prev) =>
        prev.map((p) => (p.id === row.id ? updated : p))
      );
    } finally {
      setAdminUpdatingId(null);
    }
  };

  const handleAdminPremiumToggle = async (
    row: ProfileRow,
    checked: boolean
  ) => {
    const key = `${row.id}-premium`;
    setAdminUpdatingId(key);
    try {
      const updated = await updateProfile(row.id, { is_premium: checked });
      setAdminProfiles((prev) =>
        prev.map((p) => (p.id === row.id ? updated : p))
      );
    } finally {
      setAdminUpdatingId(null);
    }
  };
  // note: adminSection state defined above; removing legacy duplicate

  const returnColumns: { key: keyof ETF; label: string }[] = showTotalReturns
    ? [
        { key: "totalReturn3Yr", label: "3 Yr" },
        { key: "totalReturn12Mo", label: "12 Mo" },
        { key: "totalReturn6Mo", label: "6 Mo" },
        { key: "totalReturn3Mo", label: "3 Mo" },
        { key: "totalReturn1Mo", label: "1 Mo" },
        { key: "totalReturn1Wk", label: "1 Wk" },
      ]
    : [
        { key: "priceReturn3Yr", label: "3 Yr" },
        { key: "priceReturn12Mo", label: "12 Mo" },
        { key: "priceReturn6Mo", label: "6 Mo" },
        { key: "priceReturn3Mo", label: "3 Mo" },
        { key: "priceReturn1Mo", label: "1 Mo" },
        { key: "priceReturn1Wk", label: "1 Wk" },
      ];

  const userMetadata =
    (user?.user_metadata as {
      display_name?: string;
      name?: string;
      role?: string;
      is_premium?: boolean;
    }) ?? {};
  const appMetadata = (user?.app_metadata as { role?: string }) ?? {};
  const displayName =
    profile?.display_name ??
    userMetadata.display_name ??
    userMetadata.name ??
    user?.email ??
    "";
  const logout = async () => {
    await signOut();
  };

  const toggleFavorite = (symbol: string) => {
    if (!isPremium) {
      setShowUpgradeModal(true);
      return;
    }
    toggleFavoriteHook(symbol);
  };

  const toggleComparison = (symbol: string) => {
    if (selectedETF && symbol === selectedETF.symbol) {
      return;
    }
    if (comparisonETFs.includes(symbol)) {
      setComparisonETFs(comparisonETFs.filter((s) => s !== symbol));
    } else if (comparisonETFs.length < 5) {
      setComparisonETFs([...comparisonETFs, symbol]);
    }
  };

  // Calculate initial ETF count based on screen size
  useEffect(() => {
    const calculateInitialCount = () => {
      const height = window.innerHeight;
      const width = window.innerWidth;

      // Mobile devices
      if (width < 640) {
        setInitialETFCount(8);
      }
      // Tablets
      else if (width < 1024) {
        setInitialETFCount(15);
      }
      // Desktop - calculate based on available height
      else {
        // Approximate rows that fit: (viewport height - header - padding - controls) / row height
        // Each row is approximately 28px with new compact styling, header is ~180px, controls ~80px
        const availableHeight = height - 260;
        const rowHeight = 28;
        const calculatedCount = Math.max(
          20,
          Math.floor(availableHeight / rowHeight)
        );
        // Show all or calculated count, whichever is higher
        setInitialETFCount(calculatedCount);
      }
    };

    calculateInitialCount();
    window.addEventListener("resize", calculateInitialCount);
    return () => window.removeEventListener("resize", calculateInitialCount);
  }, []);

  // Calculate chart height for mobile landscape/portrait
  useEffect(() => {
    const calculateChartHeight = () => {
      const height = window.innerHeight;
      const width = window.innerWidth;
      const isLandscape = width > height;

      // Mobile landscape (horizontal)
      if (width < 1024 && isLandscape && height < 600) {
        setChartHeight(Math.min(250, height * 0.4));
      }
      // Mobile portrait or larger screens
      else if (width < 640) {
        setChartHeight(280);
      }
      // Tablet
      else if (width < 1024) {
        setChartHeight(350);
      }
      // Desktop
      else {
        setChartHeight(400);
      }
    };

    calculateChartHeight();
    window.addEventListener("resize", calculateChartHeight);
    window.addEventListener("orientationchange", calculateChartHeight);
    return () => {
      window.removeEventListener("resize", calculateChartHeight);
      window.removeEventListener("orientationchange", calculateChartHeight);
    };
  }, []);
  const [sortField, setSortField] = useState<keyof ETF | null>("weightedRank");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    return saved === "true";
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", sidebarCollapsed.toString());
  }, [sidebarCollapsed]);

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

  const totalWeight = (yieldWeight ?? 0) + (volatilityWeight ?? 0) + (totalReturnWeight ?? 0);
  const isValid = !isNaN(totalWeight) && totalWeight === 100;

  // Function to load weights from profile
  const loadWeightsFromProfile = useCallback(() => {
    if (!profile?.preferences) {
      console.log("⚠️ No preferences found in profile, using defaults");
      return;
    }

    const savedWeights = profile.preferences.ranking_weights as
      | RankingWeights
      | undefined;

    if (savedWeights) {
      console.log("✅ Loading saved weights from profile:", savedWeights);
      setWeights(savedWeights);
      setYieldWeight(savedWeights.yield);
      setVolatilityWeight(savedWeights.volatility ?? savedWeights.stdDev ?? 30);
      setTotalReturnWeight(savedWeights.totalReturn);
      if (
        savedWeights.timeframe === "3mo" ||
        savedWeights.timeframe === "6mo"
      ) {
        setTotalReturnTimeframe(savedWeights.timeframe);
        console.log("✅ Set timeframe to:", savedWeights.timeframe);
      }
    } else {
      console.log("⚠️ No ranking_weights in preferences, using defaults");
    }

    // Load presets
    const savedPresets = profile.preferences.ranking_presets as
      | RankingPreset[]
      | undefined;
    if (savedPresets) {
      setRankingPresets(savedPresets);
      console.log("✅ Loaded presets:", savedPresets);
    }

    // Load chart settings
    const chartSettings = profile.preferences.chart_settings;
    if (chartSettings) {
      if (chartSettings.chartType) {
        setChartType(chartSettings.chartType);
      }
      if (chartSettings.selectedTimeframe) {
        setSelectedTimeframe(
          chartSettings.selectedTimeframe as ComparisonTimeframe
        );
      }
      if (chartSettings.showTotalReturns !== undefined) {
        setShowTotalReturns(chartSettings.showTotalReturns);
      }
      console.log("✅ Loaded chart settings:", chartSettings);
    }
  }, [profile]);

  // Load saved ranking weights and presets from profile
  useEffect(() => {
    console.log("🔍 Profile loaded:", profile);
    console.log("🔍 Profile preferences:", profile?.preferences);
    loadWeightsFromProfile();
    // Mark initial load as complete after a short delay to allow state to settle
    setTimeout(() => {
      isInitialChartLoad.current = false;
    }, 500);
  }, [profile, loadWeightsFromProfile]);

  // Reload weights when navigating to dashboard
  useEffect(() => {
    if (user?.id && location.pathname.includes("dashboard")) {
      const reloadWeights = async () => {
        try {
          const { data } = await supabase
            .from("profiles")
            .select("preferences")
            .eq("id", user.id)
            .single();
          if (data?.preferences) {
            const prefs = data.preferences as {
              ranking_weights?: RankingWeights;
              ranking_presets?: RankingPreset[];
            };
            const savedWeights = prefs.ranking_weights;
            if (savedWeights) {
              setWeights(savedWeights);
              setYieldWeight(savedWeights.yield);
              setVolatilityWeight(savedWeights.volatility ?? savedWeights.stdDev ?? 30);
              setTotalReturnWeight(savedWeights.totalReturn);
              if (
                savedWeights.timeframe === "3mo" ||
                savedWeights.timeframe === "6mo"
              ) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              const prefs = data.preferences as {
                ranking_weights?: RankingWeights;
              };
              const savedWeights = prefs.ranking_weights;
              if (savedWeights) {
                setWeights(savedWeights);
                setYieldWeight(savedWeights.yield);
                setVolatilityWeight(savedWeights.volatility ?? savedWeights.stdDev ?? 30);
                setTotalReturnWeight(savedWeights.totalReturn);
                if (
                  savedWeights.timeframe === "3mo" ||
                  savedWeights.timeframe === "6mo"
                ) {
                  setTotalReturnTimeframe(savedWeights.timeframe);
                }
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

  useEffect(() => {
    if (showRankingPanel) {
      setYieldWeight(weights.yield);
      setVolatilityWeight(
        (weights.volatility ?? weights.stdDev ?? 30) || 30
      );
      setTotalReturnWeight(weights.totalReturn);
      setTotalReturnTimeframe(weights.timeframe || "6mo");
    }
  }, [showRankingPanel, weights]);

  // Save chart settings when they change (but not on initial load)
  useEffect(() => {
    if (isInitialChartLoad.current) return;
    if (user?.id && isPremium) {
      const saveSettings = async () => {
        try {
          await saveChartSettings(user.id, {
            chartType,
            selectedTimeframe,
            showTotalReturns,
          });
          console.log("✅ Saved chart settings:", {
            chartType,
            selectedTimeframe,
            showTotalReturns,
          });
        } catch (error) {
          console.error("Failed to save chart settings:", error);
        }
      };
      saveSettings();
    }
  }, [chartType, selectedTimeframe, showTotalReturns, user?.id, isPremium]);

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
    const newVolatility = (value[0] ?? 30) || 30;
    setVolatilityWeight(newVolatility);
    setWeights({
      yield: yieldWeight,
      volatility: newVolatility,
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
      timeframe: timeframe,
    });
  };

  const resetToDefaults = async () => {
    const defaultWeights: RankingWeights = {
      yield: 30,
      volatility: 30,
      totalReturn: 40,
      timeframe: "12mo",
    };

    setYieldWeight(30);
    setVolatilityWeight(30);
    setTotalReturnWeight(40);
    setTotalReturnTimeframe("12mo");
    setWeights(defaultWeights);

    // Save defaults to database
    if (user?.id && isPremium) {
      try {
        await saveRankingWeights(user.id, defaultWeights);
        console.log("Reset to defaults and saved:", defaultWeights);
        toast({
          title: "Reset to defaults",
          description: "Rankings reset and saved successfully",
        });
      } catch (error) {
        console.error("Failed to save default weights:", error);
      }
    }
  };

  const applyRankings = async () => {
    if (!isValid) {
      console.log(
        "❌ Cannot apply: weights are not valid (total:",
        totalWeight,
        ")"
      );
      toast({
        variant: "destructive",
        title: "Invalid weights",
        description: `Total must equal 100% (currently ${totalWeight}%)`,
      });
      return;
    }

    if (!isPremium) {
      setShowUpgradeModal(true);
      return;
    }

    if (!user?.id) {
      console.error("❌ Cannot save: user ID is missing");
      toast({
        variant: "destructive",
        title: "Not logged in",
        description: "Please log in to save your preferences",
      });
      return;
    }

    const newWeights: RankingWeights = {
      yield: yieldWeight,
      volatility: volatilityWeight,
      totalReturn: totalReturnWeight,
      timeframe: totalReturnTimeframe,
    };

    console.log("🎯 Applying rankings with weights:", newWeights);
    console.log("🎯 User ID:", user.id);

    // Apply immediately for instant feedback
    setWeights(newWeights);
    setShowRankingPanel(false);

    // Save weights to database
    try {
      console.log("💾 Attempting to save weights to database...");
      await saveRankingWeights(user.id, newWeights);
      console.log("✅ Saved weights successfully:", newWeights);

      // Force a profile reload to get the updated preferences
      // This ensures the profile state is updated
      if (profile) {
        const { data } = await supabase
          .from("profiles")
          .select("preferences")
          .eq("id", user.id)
          .single();
        if (data) {
          console.log("🔄 Reloaded preferences from DB:", data.preferences);
        }
      }
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
    setVolatilityWeight(
      (preset.weights.volatility ?? preset.weights.stdDev ?? 30) || 30
    );
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

  const rankedETFs = useMemo(() => {
    return rankETFs(etfData, weights);
  }, [etfData, weights]);

  const filteredETFs = rankedETFs.filter((etf) => {
    if (searchQuery.trim() === "") return true;
    return (
      etf.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      etf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      etf.issuer?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Sort ETFs - preserve ranking order by default, allow manual sorting
  const sortedETFs = useMemo(() => {
    if (!sortField || sortField === "weightedRank") {
      return filteredETFs;
    }
    
    return [...filteredETFs].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (aValue === undefined || aValue === null) return 1;
      if (bValue === undefined || bValue === null) return -1;

      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredETFs, sortField, sortDirection]);

  const favoritesFilteredETFs = showFavoritesOnly
    ? sortedETFs.filter((etf) => favorites.has(etf.symbol))
    : sortedETFs;

  const uniqueSymbolETFs = favoritesFilteredETFs.filter((etf, index, self) => {
    return self.findIndex((e) => e.symbol === etf.symbol) === index;
  });

  const displayedETFs = showAllETFs
    ? uniqueSymbolETFs
    : uniqueSymbolETFs.slice(0, initialETFCount);

  const handleSort = (field: keyof ETF) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const SortButton = ({
    field,
    children,
    align = "left",
  }: {
    field: keyof ETF;
    children: React.ReactNode;
    align?: "left" | "right";
  }) => (
    <Button
      variant="ghost"
      size="sm"
      className={`h-8 hover:bg-slate-100 hover:text-foreground transition-colors ${
        align === "left" ? "-ml-3" : "-mr-3"
      }`}
      onClick={() => handleSort(field)}
    >
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  );

  const handleNavigation = (tab: string) => {
    if (tab === "home") {
      navigate("/");
    } else if (tab === "admin") {
      navigate("/admin");
    } else {
      setActiveTab(tab);
    }
  };

  const handleETFClick = (etf: ETF) => {
    setSelectedETF(etf);
    setComparisonETFs((prev) => prev.filter((s) => s !== etf.symbol));
    setShowAllETFs(false);
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      const mainContainer = document.querySelector("main");
      if (mainContainer) {
        mainContainer.scrollTop = 0;
      }
    }, 0);
  };

  type ChartPoint = { [key: string]: number | string };
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  const marketData = [
    { name: "S&P 500", value: "5,243.28", change: "+0.56%", positive: true },
    { name: "Dow Jones", value: "38,675.43", change: "+0.32%", positive: true },
    { name: "Nasdaq", value: "16,421.18", change: "-0.15%", positive: false },
    {
      name: "Russell 2000",
      value: "2,089.30",
      change: "+0.78%",
      positive: true,
    },
  ];

  useEffect(() => {
    const buildChartData = async () => {
      if (!selectedETF) {
        setChartData([]);
        return;
      }
      setIsChartLoading(true);
      setChartError(null);
      try {
        const filteredComparison = comparisonETFs.filter(
          (s) => s !== selectedETF.symbol
        );
        const symbols = [selectedETF.symbol, ...filteredComparison];
        const comparison = await fetchComparisonData(
          symbols,
          selectedTimeframe
        );
        const data = generateChartData(comparison, chartType);
        if (!data.length) {
          setChartError("Live chart data is not available for this timeframe.");
          setChartData([]);
          return;
        }
        setChartData(data);
      } catch (error) {
        setChartError("Unable to load live chart data right now.");
        setChartData([]);
      } finally {
        setIsChartLoading(false);
      }
    };
    buildChartData();
  }, [selectedETF, comparisonETFs, chartType, selectedTimeframe]);

  useEffect(() => {
    if (selectedETF) {
      setComparisonETFs((prev) => prev.filter((s) => s !== selectedETF.symbol));
    }
  }, [selectedETF]);

  if (selectedETF) {
    const priceChange = selectedETF.totalReturn1Mo || 0;
    const priceChangePercent = (
      (priceChange / selectedETF.price) *
      100
    ).toFixed(2);
    const isPositive = priceChange >= 0;

    const chartValues = chartData
      .map((d) => d.price)
      .filter((v): v is number => typeof v === "number" && !isNaN(v));
    const minChartValue =
      chartValues.length > 0 ? Math.min(...chartValues, 0) : -10;
    const maxChartValue =
      chartValues.length > 0 ? Math.max(...chartValues, 0) : 10;

    const timeframes = [
      "1D",
      "1W",
      "1M",
      "3M",
      "6M",
      "YTD",
      "1Y",
      "3Y",
      "5Y",
      "10Y",
      "20Y",
      "MAX",
    ];

    const keyMetrics = [
      { label: "LAST CLOSE PRICE", value: `$${selectedETF.price.toFixed(2)}` },
      {
        label: "52-WEEK RANGE",
        value: `$${selectedETF.week52Low.toFixed(
          2
        )} - $${selectedETF.week52High.toFixed(2)}`,
      },
      { label: "MARKET CAP", value: "N/A" },
      {
        label: "DIVIDEND YIELD",
        value: `${selectedETF.forwardYield.toFixed(2)}%`,
      },
      { label: "PE RATIO", value: "N/A" },
      { label: "PE RATIO (FWD)", value: "N/A" },
      { label: "REVENUE TTM", value: "N/A" },
      { label: "NET INCOME TTM", value: "N/A" },
      { label: "NET PROFIT MARGIN TTM", value: "N/A" },
      {
        label: "TTM TOTAL RETURN",
        value: `${(selectedETF.totalReturn12Mo || 0).toFixed(2)}%`,
        isPercentage: true,
        value_raw: selectedETF.totalReturn12Mo || 0,
      },
      {
        label: "3Y TOTAL RETURN",
        value: `${(selectedETF.totalReturn3Yr || 0).toFixed(2)}%`,
        isPercentage: true,
        value_raw: selectedETF.totalReturn3Yr || 0,
      },
      {
        label: "5Y TOTAL RETURN",
        value: `${(selectedETF.totalReturn6Mo || 0).toFixed(2)}%`,
        isPercentage: true,
        value_raw: selectedETF.totalReturn6Mo || 0,
      },
    ];

    return (
      <div className="min-h-screen bg-slate-50 flex">
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        <aside
          className={`${
            sidebarCollapsed ? "w-16" : "w-64"
          } bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 transition-all duration-300 ${
            mobileSidebarOpen ? "fixed left-0 top-0 z-50" : "hidden lg:flex"
          }`}
        >
          <div
            className={`h-16 border-b border-slate-200 flex items-center flex-shrink-0 ${
              sidebarCollapsed ? "justify-center px-2" : "px-6 justify-between"
            }`}
          >
            {!sidebarCollapsed && <Logo simple />}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors hidden lg:block"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? (
                <PanelLeft className="w-5 h-5 text-slate-600" />
              ) : (
                <PanelLeftClose className="w-5 h-5 text-slate-600" />
              )}
            </button>
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors lg:hidden"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <nav
            className={`flex-1 overflow-y-auto ${
              sidebarCollapsed ? "p-2 space-y-1" : "p-4 space-y-2"
            }`}
          >
            <button
              onClick={() => {
                setSelectedETF(null);
                setShowFavoritesOnly(false);
                navigate("/");
              }}
              className={`w-full flex items-center ${
                sidebarCollapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-foreground`}
              title={sidebarCollapsed ? "Home" : ""}
            >
              <Home className="w-5 h-5" />
              {!sidebarCollapsed && "Home"}
            </button>
            <button
              onClick={() => {
                setShowFavoritesOnly(false);
                setSelectedETF(null);
              }}
              className={`w-full flex items-center ${
                sidebarCollapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium transition-colors ${
                !showFavoritesOnly
                  ? sidebarCollapsed
                    ? "bg-primary/10 text-primary"
                    : "bg-primary text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
              }`}
              title={sidebarCollapsed ? "Dashboard" : ""}
            >
              <BarChart3 className="w-5 h-5" />
              {!sidebarCollapsed && "Dashboard"}
            </button>
            <button
              onClick={() => {
                setShowFavoritesOnly(true);
                setSelectedETF(null);
              }}
              className={`w-full flex items-center ${
                sidebarCollapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium transition-colors ${
                showFavoritesOnly
                  ? sidebarCollapsed
                    ? "bg-yellow-50 text-yellow-600"
                    : "bg-yellow-500 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
              }`}
              title={sidebarCollapsed ? "Favorites" : ""}
            >
              <Star
                className={`w-5 h-5 ${
                  showFavoritesOnly && !sidebarCollapsed
                    ? "fill-white"
                    : showFavoritesOnly
                    ? "fill-yellow-400 text-yellow-400"
                    : ""
                }`}
              />
              {!sidebarCollapsed && (
                <span className="flex items-center gap-2">
                  Favorites
                  {favorites.size > 0 && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        showFavoritesOnly
                          ? "bg-yellow-600 text-white"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {favorites.size}
                    </span>
                  )}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate("/settings")}
              className={`w-full flex items-center ${
                sidebarCollapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-foreground transition-colors`}
              title={sidebarCollapsed ? "Settings" : ""}
            >
              <Settings className="w-5 h-5" />
              {!sidebarCollapsed && "Settings"}
            </button>
          </nav>

          <div
            className={`border-t border-slate-200 flex-shrink-0 ${
              sidebarCollapsed ? "p-2" : "p-4"
            }`}
          >
            <button
              onClick={logout}
              className={`w-full flex items-center ${
                sidebarCollapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-foreground transition-colors`}
              title={sidebarCollapsed ? "Logout" : ""}
            >
              <LogOut className="w-5 h-5" />
              {!sidebarCollapsed && "Logout"}
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center flex-shrink-0">
            <div className="flex items-center justify-between w-full gap-4">
              <div className="flex items-center gap-2 sm:gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden h-10 w-10"
                  onClick={() => setMobileSidebarOpen(true)}
                >
                  <Menu className="h-6 w-6" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setSelectedETF(null)}
                  className="hover:bg-slate-100 hover:text-foreground transition-colors text-sm sm:text-base"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Back to Rankings</span>
                  <span className="sm:hidden">Back</span>
                </Button>
              </div>
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="hidden sm:flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isAdmin ? "Admin" : "Investor"}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                </div>
                <div className="sm:hidden w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto">
            <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
              <div className="mb-4 sm:mb-6">
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4 mb-2">
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">
                    {selectedETF.symbol}
                  </h1>
                  <span className="text-base sm:text-lg text-muted-foreground">
                    {selectedETF.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl sm:text-3xl font-bold">
                    ${selectedETF.price.toFixed(2)}
                  </span>
                  <span
                    className={`text-base sm:text-lg font-semibold flex items-center ${
                      isPositive ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {isPositive ? (
                      <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 mr-1" />
                    ) : (
                      <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 mr-1" />
                    )}
                    {priceChangePercent}%
                  </span>
                </div>
              </div>

              <Card className="p-4 sm:p-6 border-2 border-slate-200 overflow-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg sm:text-xl font-semibold mb-2">
                      {selectedETF.symbol}{" "}
                      {chartType === "price" ? "Price Return" : "Total Return"} Chart
                    </h2>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => setChartType("totalReturn")}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                          chartType === "totalReturn"
                            ? "bg-primary text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        Total Return Chart
                      </button>
                      <button
                        onClick={() => setChartType("price")}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                          chartType === "price"
                            ? "bg-primary text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        Price Return Chart
                      </button>
                      <button
                        onClick={() =>
                          setShowComparisonSelector(!showComparisonSelector)
                        }
                        className="px-3 py-1 text-xs font-semibold rounded-lg transition-colors bg-accent text-white hover:bg-accent/90 flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        Compare ({comparisonETFs.length}/5)
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-0.5 sm:gap-1 flex-wrap overflow-x-auto max-w-full">
                    {timeframes.map((tf: ComparisonTimeframe) => (
                      <Button
                        key={tf}
                        variant={
                          selectedTimeframe === tf ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setSelectedTimeframe(tf)}
                        className={`h-6 sm:h-8 px-1.5 sm:px-3 text-[10px] sm:text-xs whitespace-nowrap ${
                          selectedTimeframe !== tf
                            ? "border-2 border-transparent hover:border-slate-200 hover:bg-slate-100 hover:text-foreground transition-colors"
                            : ""
                        }`}
                      >
                        {tf}
                      </Button>
                    ))}
                  </div>
                </div>

                {comparisonETFs.length > 0 && (
                  <div className="mb-4 flex gap-2 flex-wrap">
                    {[
                      selectedETF.symbol,
                      ...comparisonETFs.filter((s) => s !== selectedETF.symbol),
                    ].map((symbol, index) => {
                      const etf = rankedETFs.find((e) => e.symbol === symbol);
                      if (!etf) return null;
                      const colors = [
                        "#3b82f6",
                        "#f97316",
                        "#8b5cf6",
                        "#10b981",
                        "#f59e0b",
                      ];
                      const color = colors[index % colors.length];
                      return (
                        <div
                          key={symbol}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-2 rounded-lg"
                          style={{ borderColor: color }}
                        >
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">{symbol}</span>
                            <span className="text-xs text-muted-foreground">
                              {etf.totalReturn12Mo !== undefined
                                ? `${
                                    etf.totalReturn12Mo > 0 ? "+" : ""
                                  }${etf.totalReturn12Mo.toFixed(2)}%`
                                : "N/A"}
                            </span>
                          </div>
                          {index > 0 && (
                            <button
                              onClick={() => toggleComparison(symbol)}
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
                          {rankedETFs
                            .filter((e) => {
                              const searchLower = comparisonSearchQuery.toLowerCase();
                              return e.symbol !== selectedETF.symbol &&
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

                {showFavoritesOnly && (
                  <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                    {favorites.size > 0 ? (
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-yellow-800">
                          Viewing {favorites.size} Favorite ETF
                          {favorites.size !== 1 ? "s" : ""}
                        </p>
                        <button
                          onClick={() => setShowFavoritesOnly(false)}
                          className="text-yellow-600 hover:text-yellow-800 text-xs font-medium"
                        >
                          Show All ETFs
                        </button>
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Star className="h-12 w-12 mx-auto text-yellow-300 mb-3" />
                        <h3 className="text-lg font-bold text-slate-700 mb-2">
                          No Favorites Yet
                        </h3>
                        <p className="text-sm text-slate-600 mb-4">
                          Click the star icon next to any ETF to add it to your
                          favorites list.
                        </p>
                        <div className="bg-white border-2 border-primary/20 rounded-lg p-4 max-w-md mx-auto">
                          <p className="text-sm font-semibold text-primary mb-2">
                            Premium Feature
                          </p>
                          <p className="text-xs text-slate-600">
                            Subscribe to unlock unlimited favorites, save your
                            watchlist across devices, and receive personalized
                            alerts when your favorite ETFs meet your criteria.
                          </p>
                        </div>
                        <button
                          onClick={() => setShowFavoritesOnly(false)}
                          className="mt-4 text-yellow-600 hover:text-yellow-800 text-sm font-medium"
                        >
                          Back to All ETFs
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <ResponsiveContainer width="100%" height={chartHeight}>
                  {comparisonETFs.length > 0 ? (
                    <LineChart data={chartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f1f5f9"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="time"
                        stroke="#94a3b8"
                        fontSize={chartHeight < 280 ? 9 : 12}
                        tickLine={false}
                        axisLine={false}
                        angle={chartHeight < 280 ? -45 : 0}
                        textAnchor={chartHeight < 280 ? "end" : "middle"}
                        height={chartHeight < 280 ? 50 : 30}
                        interval="preserveStartEnd"
                        tickFormatter={(value, index, ticks) => {
                          // Deduplicate: only show label if different from previous
                          if (index === 0 || index === ticks.length - 1) return value;
                          const prevLabel = ticks[index - 1]?.value;
                          return value === prevLabel ? '' : value;
                        }}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={chartHeight < 280 ? 9 : 12}
                        domain={
                          chartType === "totalReturn"
                            ? [minChartValue, maxChartValue]
                            : [0, "auto"]
                        }
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          chartType === "totalReturn"
                            ? `${value.toFixed(1)}%`
                            : `$${value.toFixed(2)}`
                        }
                        width={chartHeight < 280 ? 40 : 60}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(255, 255, 255, 0.98)",
                          border: "none",
                          borderRadius: "12px",
                          boxShadow:
                            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                          padding: "12px 16px",
                        }}
                        labelStyle={{
                          color: "#64748b",
                          fontSize: "12px",
                          marginBottom: "4px",
                        }}
                      />
                      {[
                        selectedETF.symbol,
                        ...comparisonETFs.filter(
                          (s) => s !== selectedETF.symbol
                        ),
                      ].map((symbol, index) => {
                        const colors = [
                          "#3b82f6",
                          "#f97316",
                          "#8b5cf6",
                          "#10b981",
                          "#f59e0b",
                        ];
                        const dataKey =
                          chartType === "totalReturn"
                            ? `return_${symbol}`
                            : `price_${symbol}`;
                        return (
                          <Line
                            key={symbol}
                            type="monotone"
                            dataKey={dataKey}
                            stroke={colors[index % colors.length]}
                            strokeWidth={2.5}
                            dot={false}
                            name={symbol}
                          />
                        );
                      })}
                    </LineChart>
                  ) : (
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient
                          id="colorPrice"
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
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f1f5f9"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="time"
                        stroke="#94a3b8"
                        fontSize={chartHeight < 280 ? 9 : 12}
                        tickLine={false}
                        axisLine={false}
                        angle={chartHeight < 280 ? -45 : 0}
                        textAnchor={chartHeight < 280 ? "end" : "middle"}
                        height={chartHeight < 280 ? 50 : 30}
                        interval="preserveStartEnd"
                        tickFormatter={(value, index, ticks) => {
                          // Deduplicate: only show label if different from previous
                          if (index === 0 || index === ticks.length - 1) return value;
                          const prevLabel = ticks[index - 1]?.value;
                          return value === prevLabel ? '' : value;
                        }}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={chartHeight < 280 ? 9 : 12}
                        domain={
                          chartType === "totalReturn"
                            ? [minChartValue, maxChartValue]
                            : [0, "auto"]
                        }
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          chartType === "totalReturn"
                            ? `${value.toFixed(1)}%`
                            : `$${value.toFixed(2)}`
                        }
                        width={chartHeight < 280 ? 40 : 60}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(255, 255, 255, 0.98)",
                          border: "none",
                          borderRadius: "12px",
                          boxShadow:
                            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                          padding: "12px 16px",
                        }}
                        labelStyle={{
                          color: "#64748b",
                          fontSize: "12px",
                          marginBottom: "4px",
                        }}
                        formatter={(value: number) => [
                          chartType === "totalReturn"
                            ? `${value.toFixed(2)}%`
                            : `$${value.toFixed(2)}`,
                          chartType === "totalReturn" ? "Return" : "Price",
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke={isPositive ? "#10b981" : "#ef4444"}
                        strokeWidth={2.5}
                        fill="url(#colorPrice)"
                        fillOpacity={1}
                        dot={false}
                      />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </Card>

              <Card className="p-4 sm:p-6 border-2 border-slate-200">
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                  <h2 className="text-xl sm:text-2xl font-bold">
                    {selectedETF.symbol} Key Metrics
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {keyMetrics.map((metric, index) => (
                    <div key={index} className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {metric.label}
                      </p>
                      <p
                        className={`text-xl font-bold ${
                          metric.isPercentage && metric.value_raw !== undefined
                            ? metric.value_raw >= 0
                              ? "text-green-600"
                              : "text-red-600"
                            : "text-foreground"
                        }`}
                      >
                        {metric.value}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={`${
          sidebarCollapsed ? "w-16" : "w-64"
        } bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 transition-all duration-300 ${
          mobileSidebarOpen ? "fixed left-0 top-0 z-50" : "hidden lg:flex"
        }`}
      >
        <div
          className={`h-16 border-b border-slate-200 flex items-center flex-shrink-0 ${
            sidebarCollapsed ? "justify-center px-2" : "px-6 justify-between"
          }`}
        >
          {!sidebarCollapsed && <Logo simple />}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors hidden lg:block"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="w-5 h-5 text-slate-600" />
            ) : (
              <PanelLeftClose className="w-5 h-5 text-slate-600" />
            )}
          </button>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors lg:hidden"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <nav
          className={`flex-1 overflow-y-auto ${
            sidebarCollapsed ? "p-2 space-y-1" : "p-4 space-y-2"
          }`}
        >
          <button
            onClick={() => {
              setShowFavoritesOnly(false);
              setAdminSection(null);
              navigate("/");
            }}
            className={`w-full flex items-center ${
              sidebarCollapsed
                ? "justify-center px-0 py-2.5"
                : "gap-3 px-4 py-3"
            } rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-foreground`}
            title={sidebarCollapsed ? "Home" : ""}
          >
            <Home className="w-5 h-5" />
            {!sidebarCollapsed && "Home"}
          </button>
          <button
            onClick={() => {
              setShowFavoritesOnly(false);
              setAdminSection(null);
            }}
            className={`w-full flex items-center ${
              sidebarCollapsed
                ? "justify-center px-0 py-2.5"
                : "gap-3 px-4 py-3"
            } rounded-lg text-sm font-medium transition-colors ${
              !showFavoritesOnly && !adminSection
                ? sidebarCollapsed
                  ? "bg-primary/10 text-primary"
                  : "bg-primary text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
            }`}
            title={sidebarCollapsed ? "Dashboard" : ""}
          >
            <BarChart3
              className={`${sidebarCollapsed ? "w-5 h-5" : "w-5 h-5"}`}
            />
            {!sidebarCollapsed && "Dashboard"}
          </button>
          <button
            onClick={() => {
              setShowFavoritesOnly(!showFavoritesOnly);
              setAdminSection(null);
            }}
            className={`w-full flex items-center ${
              sidebarCollapsed
                ? "justify-center px-0 py-2.5"
                : "gap-3 px-4 py-3"
            } rounded-lg text-sm font-medium transition-colors ${
              showFavoritesOnly
                ? sidebarCollapsed
                  ? "bg-yellow-50 text-yellow-600"
                  : "bg-yellow-500 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
            }`}
            title={sidebarCollapsed ? "Favorites" : ""}
          >
            <Star
              className={`w-5 h-5 ${
                showFavoritesOnly && !sidebarCollapsed
                  ? "fill-white"
                  : showFavoritesOnly
                  ? "fill-yellow-400 text-yellow-400"
                  : ""
              }`}
            />
            {!sidebarCollapsed && (
              <span className="flex items-center gap-2">
                Favorites
                {favorites.size > 0 && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      showFavoritesOnly
                        ? "bg-yellow-600 text-white"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {favorites.size}
                  </span>
                )}
              </span>
            )}
          </button>
          {isAdmin && null}
          <button
            onClick={() => {
              setShowFavoritesOnly(false);
              setAdminSection(null);
              navigate("/settings");
            }}
            className={`w-full flex items-center ${
              sidebarCollapsed
                ? "justify-center px-0 py-2.5"
                : "gap-3 px-4 py-3"
            } rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-foreground transition-colors`}
            title={sidebarCollapsed ? "Settings" : ""}
          >
            <Settings className="w-5 h-5" />
            {!sidebarCollapsed && "Settings"}
          </button>
        </nav>

        <div
          className={`border-t border-slate-200 flex-shrink-0 ${
            sidebarCollapsed ? "p-2" : "p-4"
          }`}
        >
          <button
            onClick={logout}
            className={`w-full flex items-center ${
              sidebarCollapsed
                ? "justify-center px-0 py-2.5"
                : "gap-3 px-4 py-3"
            } rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-foreground transition-colors`}
            title={sidebarCollapsed ? "Logout" : ""}
          >
            <LogOut className="w-5 h-5" />
            {!sidebarCollapsed && "Logout"}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center flex-shrink-0">
          <div className="flex items-center justify-between w-full gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-10 w-10"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </Button>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                Dashboard
              </h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden sm:flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isAdmin ? "Admin" : "Premium"}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              </div>
              <div className="sm:hidden w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm">
                {displayName.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <div className="h-full p-2 sm:p-3 lg:p-4 flex flex-col gap-2 sm:gap-3">
            {adminSection === "users" ? (
              <div className="flex-1 overflow-auto">
                <div className="p-2 sm:p-3 lg:p-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Card className="p-5 border-2 border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-muted-foreground font-medium">
                          Total users
                        </span>
                        <Users className="w-5 h-5 text-slate-500" />
                      </div>
                      <p className="text-3xl font-bold text-foreground">
                        {totalUsers}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {adminCount} admins, {premiumCount} premium users
                      </p>
                    </Card>
                    <Card className="p-5 border-2 border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-muted-foreground font-medium">
                          Admins
                        </span>
                        <ShieldCheck className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-3xl font-bold text-foreground">
                        {adminCount}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Full system access
                      </p>
                    </Card>
                    <Card className="p-5 border-2 border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-muted-foreground font-medium">
                          Premium users
                        </span>
                        <ShieldCheck className="w-5 h-5 text-green-600" />
                      </div>
                      <p className="text-3xl font-bold text-foreground">
                        {premiumCount}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        All signed-up users
                      </p>
                    </Card>
                  </div>

                  <Card className="border-2 border-slate-200">
                    <div className="p-6 space-y-6">
                      {lastDataUpdate && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground pb-4 border-b border-slate-200">
                          <RefreshCw className="w-4 h-4" />
                          <span>
                            <strong>Data Last Updated:</strong> {lastDataUpdate}
                          </span>
                        </div>
                      )}
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="relative w-full sm:max-w-xs">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <Input
                            value={adminSearchQuery}
                            onChange={(e) =>
                              setAdminSearchQuery(e.target.value)
                            }
                            placeholder="Search by name, email, or role"
                            className="pl-10 h-10 border-2"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              const csv = [
                                [
                                  "Name",
                                  "Email",
                                  "Role",
                                  "Premium",
                                  "Created",
                                  "Last In",
                                ].join(","),
                                ...filteredAdminProfiles.map((row) => {
                                  let createdDate = "";
                                  let lastLoginDate = "Never";

                                  try {
                                    const created = new Date(row.created_at);
                                    if (!isNaN(created.getTime())) {
                                      createdDate =
                                        created.toLocaleString("en-US");
                                    }
                                  } catch (error) {
                                    console.error(
                                      "Error formatting created_at:",
                                      error
                                    );
                                  }

                                  if (row.last_login) {
                                    try {
                                      const lastLogin = new Date(
                                        row.last_login
                                      );
                                      if (!isNaN(lastLogin.getTime())) {
                                        lastLoginDate =
                                          lastLogin.toLocaleString("en-US");
                                      }
                                    } catch (error) {
                                      console.error(
                                        "Error formatting last_login:",
                                        error
                                      );
                                    }
                                  }

                                  return [
                                    row.display_name || "",
                                    row.email,
                                    row.role,
                                    row.is_premium ? "Yes" : "No",
                                    createdDate,
                                    lastLoginDate,
                                  ].join(",");
                                }),
                              ].join("\n");
                              const blob = new Blob([csv], {
                                type: "text/csv",
                              });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `users-${
                                new Date().toISOString().split("T")[0]
                              }.csv`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            disabled={
                              adminLoading || filteredAdminProfiles.length === 0
                            }
                            className="h-10 border-2"
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Download Emails CSV
                          </Button>
                          <Button
                            variant="outline"
                            onClick={fetchAdminProfiles}
                            disabled={adminLoading}
                            className="h-10 border-2"
                          >
                            <RefreshCw
                              className={`w-4 h-4 mr-2 ${
                                adminLoading ? "animate-spin" : ""
                              }`}
                            />
                            Refresh
                          </Button>
                        </div>
                      </div>

                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="min-w-full divide-y divide-slate-200 bg-white">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                Name
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                Email
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                Role
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                Premium
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                Created
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                Last In
                              </th>
                              <th className="px-4 py-3" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {adminLoading ? (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                                >
                                  Loading users...
                                </td>
                              </tr>
                            ) : filteredAdminProfiles.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                                >
                                  No users found for “{adminSearchQuery}”
                                </td>
                              </tr>
                            ) : (
                              filteredAdminProfiles.map((row) => {
                                const roleKey = `${row.id}-role`;
                                const premiumKey = `${row.id}-premium`;
                                return (
                                  <tr
                                    key={row.id}
                                    className="hover:bg-slate-50 transition-colors"
                                  >
                                    <td className="px-4 py-3 text-sm font-medium text-foreground">
                                      {row.display_name || "—"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">
                                      {row.email}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-foreground">
                                      <span
                                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                                          row.role === "admin"
                                            ? "border-primary/30 bg-primary/10 text-primary"
                                            : "border-green-300 bg-green-50 text-green-700"
                                        }`}
                                      >
                                        {row.role === "admin"
                                          ? "Admin"
                                          : "Premium"}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-foreground">
                                      <Switch
                                        checked={row.is_premium}
                                        onCheckedChange={(checked) =>
                                          handleAdminPremiumToggle(row, checked)
                                        }
                                        disabled={
                                          adminUpdatingId === premiumKey
                                        }
                                      />
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">
                                      {new Intl.DateTimeFormat("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      }).format(new Date(row.created_at))}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">
                                      {row.last_login
                                        ? (() => {
                                            try {
                                              const date = new Date(
                                                row.last_login
                                              );
                                              if (isNaN(date.getTime())) {
                                                return "—";
                                              }
                                              return new Intl.DateTimeFormat(
                                                "en-US",
                                                {
                                                  month: "short",
                                                  day: "numeric",
                                                  year: "numeric",
                                                  hour: "2-digit",
                                                  minute: "2-digit",
                                                }
                                              ).format(date);
                                            } catch (error) {
                                              console.error(
                                                "Error formatting last_login:",
                                                error,
                                                row.last_login
                                              );
                                              return "—";
                                            }
                                          })()
                                        : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          handleAdminRoleToggle(row)
                                        }
                                        disabled={adminUpdatingId === roleKey}
                                        className="border-2"
                                      >
                                        {row.role === "admin"
                                          ? "Remove admin"
                                          : "Make admin"}
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            ) : adminSection === "upload" ? (
              <div className="flex-1 overflow-auto">
                <Card className="p-6 border-2 border-slate-200">
                  <h2 className="text-2xl font-bold text-foreground mb-6">
                    Upload Data
                  </h2>
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
                      <Upload className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                      <h3 className="text-lg font-semibold text-foreground mb-2">
                        Upload ETF Data
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Upload CSV or JSON files to update ETF information
                      </p>
                      <Button>
                        <Upload className="w-4 h-4 mr-2" />
                        Choose File
                      </Button>
                    </div>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <p className="text-sm text-yellow-900">
                        <strong>Note:</strong> Upload functionality will process
                        and update ETF data in the database. Supported formats:
                        CSV, JSON.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            ) : (
              <>
                {infoBanner && (
                  <div className="w-full max-w-[98%] mx-auto">
                    <Card className="p-4 border-2 border-primary/20 bg-primary/5">
                      <p className="text-base md:text-lg text-foreground leading-relaxed font-medium">
                        {infoBanner}
                      </p>
                    </Card>
                  </div>
                )}
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="w-full max-w-[98%] mx-auto flex flex-col min-h-0 flex-1">
                    <Card className="p-2 sm:p-3 border-2 border-slate-200 flex-1 min-h-0 flex flex-col">
                      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3 flex-shrink-0">
                        <div className="flex flex-col gap-1">
                          <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                            Covered Call Option ETFs
                          </h3>
                          <span className="text-xs text-muted-foreground leading-tight flex items-center gap-1">
                            {lastDataUpdate ? (
                              <>
                                <Clock className="h-3 w-3" />
                                Last updated: {lastDataUpdate}
                                <span className="ml-2 text-primary font-medium">Source: Tiingo</span>
                              </>
                            ) : (
                              <>
                                End of Day (EOD) Data
                                <span className="ml-2 text-primary font-medium">Source: Tiingo</span>
                              </>
                            )}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          {/* Search */}
                          <div className="relative w-full sm:w-auto min-w-[200px] sm:max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              placeholder="Search ETFs..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="pl-10 w-full h-9 border-2 text-sm"
                            />
                          </div>
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
                          {/* Favorites - Rightmost */}
                          <Button
                            variant={showFavoritesOnly ? "default" : "outline"}
                            size="sm"
                            onClick={() =>
                              setShowFavoritesOnly(!showFavoritesOnly)
                            }
                            className={`border-2 h-9 transition-colors whitespace-nowrap ${
                              showFavoritesOnly
                                ? "bg-yellow-500 hover:bg-yellow-600 border-yellow-500 text-white"
                                : "border-yellow-400 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-600"
                            }`}
                          >
                            <Star
                              className={`h-4 w-4 mr-2 ${
                                showFavoritesOnly
                                  ? "fill-white"
                                  : "fill-yellow-400"
                              }`}
                            />
                            {showFavoritesOnly ? "Show All" : "Favorites"}{" "}
                            {favorites.size > 0 && `(${favorites.size})`}
                          </Button>
                        </div>
                      </div>

                      <div className="flex-1 min-h-0 flex flex-col">
                        <div className="flex-1 min-h-0 overflow-auto">
                          <table className="w-full caption-bottom text-xs min-w-max border-collapse">
                            <thead className="sticky top-0 z-[100] bg-slate-50 shadow-sm border-b border-slate-200">
                              <tr className="bg-slate-50">
                                <th
                                  colSpan={14}
                                  className="h-7 px-1.5 text-center align-middle font-bold text-foreground bg-slate-100 text-sm border-r-2 border-slate-300"
                                >
                                  ETF DETAILS
                                </th>
                                <th
                                  colSpan={returnColumns.length}
                                  className="h-7 px-1.5 text-center align-middle font-bold bg-primary/10 text-primary text-sm"
                                >
                                  TOTAL RETURNS
                                </th>
                              </tr>
                              <tr className="bg-slate-50">
                                <th className="h-6 px-1 text-center sticky left-0 z-30 bg-slate-50 border-r border-slate-200">
                                  <UITooltip delayDuration={200}>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        className="flex items-center justify-center w-full h-full hover:bg-slate-100 rounded transition-colors"
                                        aria-label="Favorites help"
                                      >
                                        <Info className="h-5 w-5 mx-auto text-slate-600 hover:text-primary transition-colors" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent 
                                      side="top" 
                                      sideOffset={8}
                                      className="bg-slate-900 text-white text-xs px-3 py-2 border-slate-700 shadow-lg max-w-[200px]"
                                    >
                                      <p className="text-center">Click the star icon in any row to add ETFs to your favorites</p>
                                    </TooltipContent>
                                  </UITooltip>
                                </th>
                                <th className="h-6 px-1 text-left sticky left-0 z-30 bg-slate-50 border-r border-slate-200 text-xs">
                                  <SortButton field="symbol">Symbol</SortButton>
                                </th>
                                <th className="h-6 px-1 text-left bg-slate-50 text-xs">
                                  <SortButton field="issuer">Issuer</SortButton>
                                </th>
                                <th className="h-6 px-1 text-left bg-slate-50 text-xs">
                                  <SortButton field="description">
                                    Description
                                  </SortButton>
                                </th>
                                <th className="h-6 px-1 text-center bg-slate-50 text-xs">
                                  <SortButton field="payDay">
                                    <div className="whitespace-normal leading-tight">
                                      Pay
                                      <br />
                                      Day
                                    </div>
                                  </SortButton>
                                </th>
                                <th className="h-6 px-1 text-center bg-slate-50 text-xs">
                                  <SortButton field="ipoPrice">
                                    <div className="whitespace-normal leading-tight">
                                      IPO
                                      <br />
                                      Price
                                    </div>
                                  </SortButton>
                                </th>
                                <th className="h-6 px-1 text-center bg-slate-50 text-xs">
                                  <SortButton field="price">Price</SortButton>
                                </th>
                                <th className="h-6 px-1 text-center bg-slate-50 text-xs">
                                  <SortButton field="priceChange">
                                    <div className="whitespace-normal leading-tight">
                                      Price
                                      <br />
                                      Chg
                                    </div>
                                  </SortButton>
                                </th>
                                <th className="h-6 px-1 text-center bg-slate-50 text-xs">
                                  <SortButton field="dividend">Div</SortButton>
                                </th>
                                <th className="h-6 px-1 text-center bg-slate-50 text-xs">
                                  <SortButton field="numPayments">
                                    # Pmt
                                  </SortButton>
                                </th>
                                <th className="h-6 px-1 text-center bg-slate-50 text-xs">
                                  <SortButton field="annualDividend">
                                    <div className="whitespace-normal leading-tight">
                                      Annual
                                      <br />
                                      Div
                                    </div>
                                  </SortButton>
                                </th>
                                <th className="h-6 px-1 text-center bg-slate-50 text-xs">
                                  <SortButton field="forwardYield">
                                    Yield
                                  </SortButton>
                                </th>
                                <th className="h-6 px-1 text-center bg-slate-50 text-xs">
                                  <SortButton field="standardDeviation">
                                    <div className="whitespace-normal leading-tight">
                                      Dividend
                                      <br />
                                      Volatility
                                    </div>
                                  </SortButton>
                                </th>
                                <th className="h-6 px-1 text-center bg-slate-50 text-xs border-r-2 border-slate-300">
                                  {isGuest ? (
                                    <button
                                      onClick={() => setShowUpgradeModal(true)}
                                      className="flex items-center justify-center gap-1 w-full hover:bg-slate-100 rounded px-2 py-1 transition-colors"
                                      title="Upgrade to Premium to access rankings"
                                    >
                                      <Lock className="h-3 w-3 text-primary" />
                                      <span>Rank</span>
                                    </button>
                                  ) : (
                                    <SortButton field="weightedRank">
                                      Rank
                                    </SortButton>
                                  )}
                                </th>
                                {returnColumns.map((col, index) => (
                                  <th
                                    key={col.key as string}
                                    className={`h-6 px-1 text-center align-middle font-bold text-foreground bg-slate-50 text-xs ${
                                      index === returnColumns.length - 1
                                        ? "border-r-2 border-slate-300"
                                        : ""
                                    }`}
                                  >
                                    <SortButton field={col.key}>
                                      <span className="font-bold">
                                        {col.label}
                                      </span>
                                    </SortButton>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                              {displayedETFs.map((etf, idx) => (
                                <tr
                                  key={`${etf.symbol}-${idx}`}
                                  className="border-b border-slate-200 transition-colors hover:bg-slate-100 group"
                                >
                                  <td
                                    className="py-0.5 px-1 align-middle text-center sticky left-0 z-10 bg-white group-hover:bg-slate-100 border-r border-slate-200 cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavorite(etf.symbol);
                                    }}
                                    title="Click to add to Favorites"
                                  >
                                    <Star
                                      className={`h-4 w-4 mx-auto cursor-pointer transition-all ${
                                        favorites.has(etf.symbol)
                                          ? "fill-yellow-400 text-yellow-400"
                                          : "text-slate-500 hover:text-yellow-500 hover:scale-110"
                                      }`}
                                    />
                                  </td>
                                  <td className="py-0.5 px-1 align-middle sticky left-0 z-10 bg-white group-hover:bg-slate-100 border-r border-slate-200">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleETFClick(etf);
                                      }}
                                      className="font-bold text-primary text-xs hover:underline cursor-pointer transition-colors"
                                      title={`View ${etf.symbol} details and charts`}
                                    >
                                      {etf.symbol}
                                    </button>
                                  </td>
                                  <td className="py-0.5 px-1 align-middle text-xs text-muted-foreground uppercase font-medium">
                                    {etf.issuer}
                                  </td>
                                  <td className="py-0.5 px-1 align-middle max-w-[120px] truncate text-xs text-muted-foreground">
                                    {etf.description}
                                  </td>
                                  <td className="py-0.5 px-1 align-middle text-center text-xs text-muted-foreground">
                                    {etf.payDay || "N/A"}
                                  </td>
                                  <td
                                    className={`py-0.5 px-1 align-middle text-center tabular-nums text-xs font-medium ${
                                      etf.price > etf.ipoPrice
                                        ? "bg-green-100 text-green-700"
                                        : ""
                                    }`}
                                  >
                                    ${etf.ipoPrice.toFixed(2)}
                                  </td>
                                  <td className="py-0.5 px-1 align-middle text-center tabular-nums text-xs font-medium text-foreground">
                                    ${etf.price.toFixed(2)}
                                  </td>
                                  <td
                                    className={`py-0.5 px-1 align-middle text-center tabular-nums text-xs font-medium ${
                                      etf.priceChange >= 0
                                        ? "text-green-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {etf.priceChange >= 0 ? "+" : ""}
                                    {etf.priceChange.toFixed(2)}
                                  </td>
                                  <td className="py-0.5 px-1 align-middle text-center">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/etf/${etf.symbol}/dividends`);
                                      }}
                                      className="tabular-nums text-xs text-primary font-medium hover:underline cursor-pointer transition-colors"
                                      title="Click to view dividend history"
                                    >
                                      {etf.dividend.toFixed(4)}
                                    </button>
                                  </td>
                                  <td className="py-0.5 px-1 align-middle text-center tabular-nums text-xs text-muted-foreground">
                                    {etf.numPayments}
                                  </td>
                                  <td className="py-0.5 px-1 align-middle text-center tabular-nums text-xs text-muted-foreground">
                                    ${etf.annualDividend.toFixed(2)}
                                  </td>
                                  <td className="py-0.5 px-1 align-middle text-center font-bold tabular-nums text-primary text-xs">
                                    {(etf.forwardYield || 0).toFixed(1)}%
                                  </td>
                                  <td className="py-0.5 px-1 align-middle text-center tabular-nums text-xs text-muted-foreground">
                                    {(etf.standardDeviation || 0).toFixed(3)}
                                  </td>
                                  <td className="py-0.5 px-1 align-middle text-center font-bold text-sm tabular-nums border-r-2 border-slate-300">
                                    {isGuest ? (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowUpgradeModal(true);
                                        }}
                                        className="flex items-center justify-center w-full"
                                        title="Upgrade to Premium to see rankings"
                                      >
                                        <Lock className="h-3 w-3 text-primary" />
                                      </button>
                                    ) : (
                                      <span className="text-primary">
                                        {etf.weightedRank || 0}
                                      </span>
                                    )}
                                  </td>
                                  {returnColumns.map((col, index) => {
                                    const rawValue = etf[col.key];
                                    const numericValue =
                                      typeof rawValue === "number"
                                        ? rawValue
                                        : undefined;
                                    const valueClass =
                                      numericValue === undefined
                                        ? "text-muted-foreground"
                                        : numericValue >= 0
                                        ? "text-green-600"
                                        : "text-red-600";
                                    return (
                                      <td
                                        key={`${etf.symbol}-${String(col.key)}`}
                                        className={`py-0.5 px-1 align-middle text-center font-bold tabular-nums text-xs ${valueClass} ${
                                          index === returnColumns.length - 1
                                            ? "border-r-2 border-slate-300"
                                            : ""
                                        }`}
                                      >
                                        {numericValue !== undefined
                                          ? `${
                                              numericValue > 0 ? "+" : ""
                                            }${numericValue.toFixed(1)}%`
                                          : "N/A"}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {!showAllETFs &&
                          filteredETFs.length > initialETFCount && (
                            <div className="mt-3 text-center flex-shrink-0 border-t border-slate-200 pt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAllETFs(true)}
                                className="border-2 border-transparent hover:border-slate-200 hover:bg-slate-100 hover:text-foreground transition-colors text-xs h-8"
                              >
                                Show More (
                                {filteredETFs.length - initialETFCount} more
                                ETFs)
                              </Button>
                            </div>
                          )}
                        {showAllETFs &&
                          filteredETFs.length > initialETFCount && (
                            <div className="mt-3 text-center flex-shrink-0 border-t border-slate-200 pt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAllETFs(false)}
                                className="border-2 border-transparent hover:border-slate-200 hover:bg-slate-100 hover:text-foreground transition-colors text-xs h-8"
                              >
                                Show Less (Show first {initialETFCount} ETFs)
                              </Button>
                            </div>
                          )}
                      </div>
                    </Card>
                  </div>
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
                              Personalize your ETF rankings by adjusting the
                              importance of each metric
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
                                        {preset.weights.volatility ?? preset.weights.stdDev ?? 30}% R:
                                        {preset.weights.totalReturn}%
                                      </p>
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleDeletePreset(preset.name)
                                      }
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
                                Dividend Volatility Index (DVI)
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
                                  onChange={(e) =>
                                    setNewPresetName(e.target.value)
                                  }
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
                              disabled={!isValid}
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
                              onClick={applyRankings}
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

                {/* Only use UpgradeToPremiumModal for upgrade prompts */}
              </>
            )}
          </div>
        </div>
      </main>

      <UpgradeToPremiumModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
      />
    </div>
  );
}
