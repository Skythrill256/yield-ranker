import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useCategory } from "@/utils/category";
import {
  fetchETFData,
  fetchETFDataWithMetadata,
  fetchComparisonData,
  generateChartData,
  clearETFCache,
  isETFDataCached,
  ChartType,
  ComparisonTimeframe,
} from "@/services/etfData";
import {
  fetchCEFDataWithMetadata,
  isCEFDataCached,
  clearCEFCache,
} from "@/services/cefData";
import { rankETFs } from "@/utils/ranking";
import { rankCEFs } from "@/utils/cefRanking";
import { RankingWeights } from "@/types/etf";
import { RankingWeights as CEFRankingWeights } from "@/types/cef";
import { ETF } from "@/types/etf";
import { CEF } from "@/types/cef";
import { CEFTable } from "@/components/CEFTable";
import { ETFTable } from "@/components/ETFTable";
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
  Loader2,
  Target,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/Footer";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LayoutGrid, ChevronDown } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { UpgradeToPremiumModal } from "@/components/UpgradeToPremiumModal";
import { useFavorites } from "@/hooks/useFavorites";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DividendHistory } from "@/components/DividendHistory";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listProfiles, updateProfile, ProfileRow } from "@/services/admin";
import {
  saveRankingWeights,
  loadRankingWeights,
  saveRankingPreset,
  loadRankingPresets,
  deleteRankingPreset,
  RankingPreset,
  saveChartSettings,
  loadCEFRankingWeights,
  saveCEFRankingWeights,
  loadCEFRankingPresets,
  saveCEFRankingPreset,
  deleteCEFRankingPreset,
} from "@/services/preferences";
import { supabase } from "@/lib/supabase";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
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
  const location = useLocation();
  const currentCategory = useCategory();
  // Dashboard has its own category state - independent from navbar filter
  const [selectedCategory, setSelectedCategory] = useState<"cef" | "cc">(currentCategory);
  const [cefData, setCefData] = useState<CEF[]>([]);
  const [isLoadingCEFData, setIsLoadingCEFData] = useState(false);
  
  // Use appropriate favorites hook based on category
  const { favorites, toggleFavorite: toggleFavoriteHook, cleanupFavorites } = useFavorites(
    selectedCategory === "cef" ? "cef" : "etf"
  );
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllETFs, setShowAllETFs] = useState(false);
  const [selectedETF, setSelectedETF] = useState<ETF | null>(null);
  const [showDividendModal, setShowDividendModal] = useState(false);
  const [dividendModalSymbol, setDividendModalSymbol] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] =
    useState<ComparisonTimeframe>("6M");
  const [initialETFCount, setInitialETFCount] = useState(5);
  const [adminPanelExpanded, setAdminPanelExpanded] = useState(false);
  const [accountPanelExpanded, setAccountPanelExpanded] = useState(false);
  const [showRankingPanel, setShowRankingPanel] = useState(false);
  const [guestMessage, setGuestMessage] = useState("");
  const [premiumMessage, setPremiumMessage] = useState("");
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
  // Start with false - only show loading if we actually need to fetch (not cached)
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [lastDataUpdate, setLastDataUpdate] = useState<string | null>(null);
  const [lastCEFDataUpdate, setLastCEFDataUpdate] = useState<string | null>(null);
  const [chartHeight, setChartHeight] = useState(300);
  const [isLandscape, setIsLandscape] = useState(false);

  const isAdmin = profile?.role === "admin";
  const isPremium = !!profile;
  const isGuest = !profile;

  // Load CEF data
  const loadCEFData = async (showLoading: boolean = true) => {
    console.log("[Dashboard] Starting to load CEF data...");
    if (showLoading && !isCEFDataCached()) {
      setIsLoadingCEFData(true);
    }
    try {
      const result = await fetchCEFDataWithMetadata();
      console.log("[Dashboard] Fetched CEF data:", result.cefs?.length || 0, "CEFs");
      const seen = new Set<string>();
      const deduplicated = result.cefs.filter((cef) => {
        if (seen.has(cef.symbol)) {
          return false;
        }
        seen.add(cef.symbol);
        return true;
      });
      console.log("[Dashboard] Deduplicated CEFs:", deduplicated.length);
      setCefData(deduplicated);

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
        setLastCEFDataUpdate(formatted);
      } else if (result.lastUpdated) {
        setLastCEFDataUpdate(result.lastUpdated);
      }
    } catch (error) {
      console.error("[Dashboard] Failed to load CEF data:", error);
      setCefData([]);
    } finally {
      setIsLoadingCEFData(false);
    }
  };

  // Load site settings function - can be called with different categories
  const loadSiteSettings = async (category: "cc" | "cef" = "cc") => {
    try {
      const { getSiteSettings } = await import("@/services/admin");
      const settings = await getSiteSettings();
      // Load category-specific messages
      const guestMsgSetting = settings.find((s) => s.key === `guest_message_${category}`);
      const premiumMsgSetting = settings.find((s) => s.key === `premium_message_${category}`);
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

  // Load ETF data and site settings on initial mount only
  useEffect(() => {
    const loadETFData = async (showLoading: boolean = true) => {
      console.log("[Dashboard] Starting to load ETF data...");
      // Only show loading state when data is not cached to prevent flickering
      if (showLoading && !isETFDataCached()) {
        setIsLoadingData(true);
      }
      try {
        const result = await fetchETFDataWithMetadata();
        console.log("[Dashboard] Fetched ETF data:", result.etfs?.length || 0, "ETFs");
        const seen = new Set<string>();
        const deduplicated = result.etfs.filter((etf) => {
          if (seen.has(etf.symbol)) {
            return false;
          }
          seen.add(etf.symbol);
          return true;
        });
        console.log("[Dashboard] Deduplicated ETFs:", deduplicated.length);
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
      } catch (error) {
        console.error("[Dashboard] Failed to load ETF data:", error);
        // Set empty array so the page doesn't stay in a broken state
        setEtfData([]);
      } finally {
        setIsLoadingData(false);
      }
    };

    loadETFData();
    loadCEFData();
    loadSiteSettings(selectedCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload site settings when category changes
  useEffect(() => {
    loadSiteSettings(selectedCategory);
  }, [selectedCategory]);

  // Load CEF data when category changes to CEF
  useEffect(() => {
    if (selectedCategory === "cef" && cefData.length === 0) {
      loadCEFData();
    }
  }, [selectedCategory]);

  // Load CEF ranking weights from profile (CEF-specific)
  useEffect(() => {
    const loadCEFWeights = async () => {
      if (user?.id && isPremium && selectedCategory === "cef") {
        try {
          const savedWeights = await loadCEFRankingWeights(user.id);
          if (savedWeights) {
            setCefWeights(savedWeights);
            setCefYieldWeight(savedWeights.yield);
            setCefVolatilityWeight(savedWeights.volatility ?? 33);
            setCefTotalReturnWeight(savedWeights.totalReturn);
            setCefTotalReturnTimeframe(savedWeights.timeframe || "12mo");
          }
          const presets = await loadCEFRankingPresets(user.id);
          if (presets) {
            setCefRankingPresets(presets);
          }
        } catch (error) {
          console.error("[Dashboard] Failed to load CEF ranking weights:", error);
        }
      }
    };
    loadCEFWeights();
  }, [user?.id, isPremium, selectedCategory]);

  // Clean up favorites when data changes
  useEffect(() => {
    if (selectedCategory === "cc" && etfData.length > 0) {
      cleanupFavorites(etfData.map(etf => etf.symbol));
    } else if (selectedCategory === "cef" && cefData.length > 0) {
      cleanupFavorites(cefData.map(cef => cef.symbol));
    }
  }, [etfData, cefData, selectedCategory, cleanupFavorites]);

  // Handle ETF deletion events
  useEffect(() => {
    const handleETFDeleted = (event: CustomEvent<{ ticker: string }>) => {
      const deletedTicker = event.detail.ticker;
      setEtfData((prev) => prev.filter((etf) => etf.symbol !== deletedTicker));
      if (selectedETF?.symbol === deletedTicker) {
        setSelectedETF(null);
        setChartData([]);
      } else {
        // If deleted ETF was in comparison, remove it and rebuild chart
        setComparisonETFs((prev) => {
          const filtered = prev.filter((s) => s !== deletedTicker);
          // If the comparison ETFs changed, the chart will rebuild via useEffect
          return filtered;
        });
      }
      clearETFCache();
      const reloadData = async () => {
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
      };
      reloadData();
    };

    const handleETFDataUpdated = () => {
      clearETFCache();
      const reloadData = async () => {
        try {
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
          cleanupFavorites(deduplicated.map(etf => etf.symbol));
          
          if (selectedETF) {
            const updated = deduplicated.find(e => e.symbol === selectedETF.symbol);
            if (updated) {
              setSelectedETF(updated);
            }
          }
        } catch (error) {
          console.error("[Dashboard] Failed to reload ETF data:", error);
        }
      };
      reloadData();
    };

    window.addEventListener('etfDeleted', handleETFDeleted as EventListener);
    window.addEventListener('etfDataUpdated', handleETFDataUpdated);
    return () => {
      window.removeEventListener('etfDeleted', handleETFDeleted as EventListener);
      window.removeEventListener('etfDataUpdated', handleETFDataUpdated);
    };
  }, [cleanupFavorites]);


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

  // Calculate chart height for mobile landscape/portrait and detect landscape
  useEffect(() => {
    const calculateChartHeight = () => {
      const height = window.innerHeight;
      const width = window.innerWidth;
      const landscape = width > height;
      setIsLandscape(landscape);

      // Mobile landscape (horizontal) - show more data
      if (width < 1024 && landscape && height < 600) {
        setChartHeight(Math.max(300, Math.min(400, height * 0.5)));
      }
      // Mobile portrait
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

  // CEF Ranking weights (separate from ETF weights)
  const [cefWeights, setCefWeights] = useState<CEFRankingWeights>({
    yield: 34,
    volatility: 33,
    totalReturn: 33,
    timeframe: "12mo",
  });
  const [cefYieldWeight, setCefYieldWeight] = useState(34);
  const [cefVolatilityWeight, setCefVolatilityWeight] = useState(33);
  const [cefTotalReturnWeight, setCefTotalReturnWeight] = useState(33);
  const [cefTotalReturnTimeframe, setCefTotalReturnTimeframe] = useState<
    "3mo" | "6mo" | "12mo"
  >("12mo");
  const [cefRankingPresets, setCefRankingPresets] = useState<RankingPreset[]>([]);

  const totalWeight = (yieldWeight ?? 0) + (volatilityWeight ?? 0) + (totalReturnWeight ?? 0);
  const isValid = !isNaN(totalWeight) && totalWeight === 100;
  const cefTotalWeight = (cefYieldWeight ?? 0) + (cefVolatilityWeight ?? 0) + (cefTotalReturnWeight ?? 0);
  const cefIsValid = !isNaN(cefTotalWeight) && cefTotalWeight === 100;

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

    // Load presets - ensure it's an array
    const savedPresets = profile.preferences.ranking_presets as
      | RankingPreset[]
      | undefined;
    if (Array.isArray(savedPresets) && savedPresets.length > 0) {
      setRankingPresets(savedPresets);
      console.log("✅ Loaded presets:", savedPresets);
    } else {
      setRankingPresets([]);
      console.log("⚠️ No valid presets found, using empty array");
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
        description: `Error: ${error instanceof Error ? error.message : "Unknown error"
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

  // Process ETF data
  const rankedETFs = useMemo(() => {
    if (selectedCategory !== "cc") return [];
    return rankETFs(etfData, weights);
  }, [etfData, weights, selectedCategory]);

  // Process CEF data - use rankCEFs like CEFIndex
  const rankedCEFs = useMemo(() => {
    if (selectedCategory !== "cef") return [];
    if (!cefData || cefData.length === 0) return [];
    if (isGuest) return cefData;
    try {
      return rankCEFs(cefData, cefWeights);
    } catch (error) {
      console.error("[Dashboard] Error ranking CEFs:", error);
      return cefData;
    }
  }, [cefData, cefWeights, selectedCategory, isGuest]);

  const filteredETFs = rankedETFs.filter((etf) => {
    if (searchQuery.trim() === "") return true;
    return (
      etf.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      etf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      etf.issuer?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const filteredCEFs = useMemo(() => {
    const dataToFilter = isGuest ? cefData : rankedCEFs;
    let filtered = dataToFilter;
    
    // Apply favorites filter if enabled
    if (showFavoritesOnly && isPremium) {
      filtered = filtered.filter(cef => favorites.has(cef.symbol));
    }
    
    // Apply search query filter
    if (searchQuery.trim() !== "") {
      filtered = filtered.filter((cef) => {
        return (
          cef.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cef.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cef.issuer?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      });
    }
    
    return filtered;
  }, [isGuest, cefData, rankedCEFs, showFavoritesOnly, isPremium, favorites, searchQuery]);

  // Sort data - preserve ranking order by default, allow manual sorting
  // Use stable sort to prevent chart from re-rendering unnecessarily
  const sortedETFs = useMemo(() => {
    if (selectedCategory !== "cc") return [];
    console.log('[Dashboard] sortedETFs useMemo triggered - sortField:', sortField, 'sortDirection:', sortDirection, 'ETF count:', filteredETFs.length);

    // If no sort field is selected, return the ranked order (default by weightedRank asc)
    if (!sortField) {
      console.log('[Dashboard] No sort field, returning unsorted filteredETFs');
      return filteredETFs;
    }

    // Create a stable sorted array - use symbol as secondary sort to ensure stability
    const sorted = [...filteredETFs].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (aValue === undefined || aValue === null) {
        if (bValue === undefined || bValue === null) {
          // Both null - sort by symbol for stability
          return a.symbol.localeCompare(b.symbol);
        }
        return 1;
      }
      if (bValue === undefined || bValue === null) return -1;

      // Aggressive numeric parsing helper
      const parseNumeric = (val: any): number | null => {
        if (typeof val === 'number') {
          return isNaN(val) ? null : val;
        }
        if (typeof val === 'string') {
          // Remove currency symbols, commas, percentages, and whitespace
          const clean = val.replace(/[$,%\s]/g, '');
          if (clean === '') return null;
          const num = Number(clean);
          return isNaN(num) ? null : num;
        }
        return null;
      };

      const aNum = parseNumeric(aValue);
      const bNum = parseNumeric(bValue);

      const bothNumeric = aNum !== null && bNum !== null;

      // If the sort field is explicitly a text field, prefer string sort
      // unless parsing was requested. Ideally, we distinguish by column type.
      // But here, let's assume if it PARSES as a number, we treat it as a number 
      // UNLESS the field is 'symbol', 'issuer', 'description'.
      const textFields: (keyof ETF)[] = ['symbol', 'issuer', 'description', 'payDay', 'dataSource'];
      const forceString = textFields.includes(sortField);

      let comparison: number = 0;

      if (bothNumeric && !forceString) {
        comparison = aNum - bNum;
      } else {
        // Fallback to string comparison
        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();
        comparison = aStr.localeCompare(bStr);
      }

      if (comparison !== 0) {
        return sortDirection === "asc" ? comparison : -comparison;
      }
      // If values are equal, sort by symbol for stability
      return a.symbol.localeCompare(b.symbol);
    });

    console.log('[Dashboard] Sorted ETFs - first 3:', sorted.slice(0, 3).map(e => ({ symbol: e.symbol, [sortField]: e[sortField] })));
    return sorted;
  }, [filteredETFs, sortField, sortDirection, selectedCategory]);

  // CEFTable handles its own sorting, so we just pass filteredCEFs
  const sortedCEFs = filteredCEFs;

  const favoritesFilteredETFs = showFavoritesOnly
    ? sortedETFs.filter((etf) => favorites.has(etf.symbol))
    : sortedETFs;

  const uniqueSymbolETFs = favoritesFilteredETFs.filter((etf, index, self) => {
    return self.findIndex((e) => e.symbol === etf.symbol) === index;
  });

  // Use appropriate data based on selected category
  const displayedETFs = selectedCategory === "cc" ? uniqueSymbolETFs : [];
  // CEFs are handled by CEFTable component, no need for displayedCEFs

  const handleSort = (field: keyof ETF) => {
    console.log('[Dashboard] handleSort called with field:', field, 'current sortField:', sortField, 'current direction:', sortDirection);
    if (sortField === field) {
      const newDirection = sortDirection === "asc" ? "desc" : "asc";
      console.log('[Dashboard] Toggling direction to:', newDirection);
      setSortDirection(newDirection);
    } else {
      console.log('[Dashboard] Setting new field:', field, 'with direction: desc');
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
  }) => {
    const isActive = sortField === field;

    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`h-8 hover:bg-slate-100 hover:text-foreground transition-colors ${align === "left" ? "-ml-3" : "-mr-3"
          } ${isActive ? "font-semibold" : ""}`}
        onClick={(e) => {
          console.log('[Dashboard] SortButton clicked for field:', field);
          e.preventDefault();
          e.stopPropagation();
          handleSort(field);
        }}
      >
        {children}
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    );
  };

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
    // Set selected ETF to show detail view within dashboard
    setSelectedETF(etf);
  };

  const handleETFSymbolClick = (symbol: string) => {
    // Find the ETF and set it as selected to show detail view within dashboard
    const etf = uniqueSymbolETFs.find((e) => e.symbol === symbol);
    if (etf) {
      setSelectedETF(etf);
    }
  };

  const handleETFDividendClick = (symbol: string) => {
    // Show dividend modal within dashboard
    setDividendModalSymbol(symbol);
    setShowDividendModal(true);
  };

  const [selectedCEF, setSelectedCEF] = useState<CEF | null>(null);

  const handleCEFSymbolClick = (symbol: string) => {
    // Find the CEF and set it as selected to show detail view within dashboard
    const cef = filteredCEFs.find((c) => c.symbol === symbol);
    if (cef) {
      setSelectedCEF(cef);
    }
  };

  const handleCEFDividendClick = (symbol: string) => {
    // Show dividend modal within dashboard
    setDividendModalSymbol(symbol);
    setShowDividendModal(true);
  };

  type ChartPoint = { [key: string]: number | string | null };
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

  const sanitizeChartData = useCallback((data: any[]): ChartPoint[] => {
    try {
      if (!Array.isArray(data)) return [];

      return data.map(point => {
        if (!point || typeof point !== 'object') {
          return { time: '', fullDate: '', timestamp: 0 };
        }

        const sanitized: ChartPoint = {
          time: (point.time && typeof point.time === 'string') ? point.time : '',
          fullDate: (point.fullDate && typeof point.fullDate === 'string') ? point.fullDate : '',
          timestamp: (typeof point.timestamp === 'number' && !isNaN(point.timestamp)) ? point.timestamp : 0
        };

        for (const key in point) {
          if (key === 'time' || key === 'fullDate' || key === 'timestamp') continue;

          try {
            const value = point[key];
            if (value === null || value === undefined) {
              sanitized[key] = null;
            } else if (typeof value === 'number') {
              sanitized[key] = (isNaN(value) || !isFinite(value)) ? null : value;
            } else if (typeof value === 'string') {
              const num = parseFloat(value);
              sanitized[key] = (isNaN(num) || !isFinite(num)) ? null : num;
            } else {
              sanitized[key] = null;
            }
          } catch (e) {
            sanitized[key] = null;
          }
        }

        return sanitized;
      });
    } catch (error) {
      console.error('Error sanitizing chart data:', error);
      return [];
    }
  }, []);

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
        if (!data || !Array.isArray(data) || !data.length) {
          setChartError("Live chart data is not available for this timeframe.");
          setChartData([]);
          return;
        }
        const sanitized = sanitizeChartData(data);
        if (!sanitized || !Array.isArray(sanitized) || !sanitized.length) {
          setChartError("Live chart data is not available for this timeframe.");
          setChartData([]);
          return;
        }
        setChartData(sanitized);
      } catch (error) {
        setChartError("Unable to load live chart data right now.");
        setChartData([]);
      } finally {
        setIsChartLoading(false);
      }
    };
    buildChartData();
  }, [selectedETF, comparisonETFs, chartType, selectedTimeframe, sanitizeChartData, etfData]);

  useEffect(() => {
    if (selectedETF) {
      setComparisonETFs((prev) => prev.filter((s) => s !== selectedETF.symbol));
    }
  }, [selectedETF]);

  if (selectedETF) {
    const priceChange = selectedETF.totalReturn1Mo || 0;
    const priceChangePercent = (() => {
      const price = selectedETF.price;
      if (typeof price === 'number' && !isNaN(price) && isFinite(price) && price > 0) {
        const percent = (priceChange / price) * 100;
        if (typeof percent === 'number' && !isNaN(percent) && isFinite(percent)) {
          return percent;
        }
      }
      return 0;
    })();
    const isPositive = priceChange >= 0;

    const chartValues = (chartData && Array.isArray(chartData) ? chartData : [])
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
      {
        label: "LAST CLOSE PRICE",
        value: (() => {
          const price = selectedETF.price;
          if (typeof price === 'number' && !isNaN(price) && isFinite(price)) {
            return `$${price.toFixed(2)}`;
          }
          return 'N/A';
        })()
      },
      {
        label: "52-WEEK RANGE",
        value: (() => {
          const low = selectedETF.week52Low;
          const high = selectedETF.week52High;
          if (typeof low === 'number' && !isNaN(low) && isFinite(low) &&
            typeof high === 'number' && !isNaN(high) && isFinite(high)) {
            return `$${low.toFixed(2)} - $${high.toFixed(2)}`;
          }
          return 'N/A';
        })()
      },
      { label: "MARKET CAP", value: "N/A" },
      {
        label: "DIVIDEND YIELD",
        value: (() => {
          const yieldVal = selectedETF.forwardYield;
          if (typeof yieldVal === 'number' && !isNaN(yieldVal) && isFinite(yieldVal)) {
            return `${yieldVal.toFixed(2)}%`;
          }
          return 'N/A';
        })()
      },
      { label: "PE RATIO", value: "N/A" },
      { label: "PE RATIO (FWD)", value: "N/A" },
      { label: "REVENUE TTM", value: "N/A" },
      { label: "NET INCOME TTM", value: "N/A" },
      { label: "NET PROFIT MARGIN TTM", value: "N/A" },
      {
        label: "TTM TOTAL RETURN",
        value: (() => {
          const val = selectedETF.totalReturn12Mo;
          if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
            return `${val.toFixed(2)}%`;
          }
          return 'N/A';
        })(),
        isPercentage: true,
        value_raw: (typeof selectedETF.totalReturn12Mo === 'number' && !isNaN(selectedETF.totalReturn12Mo) && isFinite(selectedETF.totalReturn12Mo)) ? selectedETF.totalReturn12Mo : 0,
      },
      {
        label: "3Y TOTAL RETURN",
        value: (() => {
          const val = selectedETF.totalReturn3Yr;
          if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
            return `${val.toFixed(2)}%`;
          }
          return 'N/A';
        })(),
        isPercentage: true,
        value_raw: (typeof selectedETF.totalReturn3Yr === 'number' && !isNaN(selectedETF.totalReturn3Yr) && isFinite(selectedETF.totalReturn3Yr)) ? selectedETF.totalReturn3Yr : 0,
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
          className={`${sidebarCollapsed ? "w-16" : "w-64"
            } bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 transition-all duration-300 ${mobileSidebarOpen ? "fixed left-0 top-0 z-50" : "hidden lg:flex"
            }`}
        >
          <div
            className={`h-16 border-b border-slate-200 flex items-center flex-shrink-0 ${sidebarCollapsed ? "justify-center px-2" : "px-6 justify-between"
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
            className={`flex-1 overflow-y-auto ${sidebarCollapsed ? "p-2 space-y-1" : "p-4 space-y-2"
              }`}
          >
            <button
              onClick={() => {
                setSelectedETF(null);
                setShowFavoritesOnly(false);
                navigate("/");
              }}
              className={`w-full flex items-center ${sidebarCollapsed
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
              className={`w-full flex items-center ${sidebarCollapsed
                ? "justify-center px-0 py-2.5"
                : "gap-3 px-4 py-3"
                } rounded-lg text-sm font-medium transition-colors ${!showFavoritesOnly
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
              className={`w-full flex items-center ${sidebarCollapsed
                ? "justify-center px-0 py-2.5"
                : "gap-3 px-4 py-3"
                } rounded-lg text-sm font-medium transition-colors ${showFavoritesOnly
                  ? sidebarCollapsed
                    ? "bg-yellow-50 text-yellow-600"
                    : "bg-yellow-500 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
                }`}
              title={sidebarCollapsed ? "Favorites" : ""}
            >
              <Star
                className={`w-5 h-5 ${showFavoritesOnly && !sidebarCollapsed
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
                      className={`text-xs px-2 py-0.5 rounded-full ${showFavoritesOnly
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
              className={`w-full flex items-center ${sidebarCollapsed
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
            className={`border-t border-slate-200 flex-shrink-0 ${sidebarCollapsed ? "p-2" : "p-4"
              }`}
          >
            <button
              onClick={logout}
              className={`w-full flex items-center ${sidebarCollapsed
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
              {((isGuest && guestMessage) || (isPremium && premiumMessage)) && (
                <div className="w-full">
                  <Card className="p-4 border-2 border-primary/20 bg-primary/5">
                    <p className="text-base md:text-lg text-foreground leading-relaxed font-medium">
                      {isGuest ? guestMessage : premiumMessage}
                    </p>
                  </Card>
                </div>
              )}
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
                    ${selectedETF.price != null ? selectedETF.price.toFixed(2) : 'N/A'}
                  </span>
                  <span
                    className={`text-base sm:text-lg font-semibold flex items-center ${isPositive ? "text-green-600" : "text-red-600"
                      }`}
                  >
                    {isPositive ? (
                      <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 mr-1" />
                    ) : (
                      <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 mr-1" />
                    )}
                    {priceChangePercent != null ? `${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%` : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Top Metrics Bar - Matching ETFDetail design */}
              <Card className="p-4 mb-4">
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="font-semibold text-foreground">
                      {chartType === "price" ? "Price Return:" : "Total Return (DRIP):"}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">3 Yr:</span>
                      <span className={`font-semibold ${chartType === "price"
                        ? (selectedETF.priceReturn3Yr != null && selectedETF.priceReturn3Yr >= 0 ? 'text-green-600' : 'text-red-600')
                        : ((selectedETF.trDrip3Yr ?? selectedETF.totalReturn3Yr) != null && (selectedETF.trDrip3Yr ?? selectedETF.totalReturn3Yr)! >= 0 ? 'text-green-600' : 'text-red-600')
                        }`}>
                        {chartType === "price"
                          ? (selectedETF.priceReturn3Yr != null ? `${selectedETF.priceReturn3Yr >= 0 ? '+' : ''}${selectedETF.priceReturn3Yr.toFixed(1)}%` : 'N/A')
                          : ((selectedETF.trDrip3Yr ?? selectedETF.totalReturn3Yr) != null ? `${(selectedETF.trDrip3Yr ?? selectedETF.totalReturn3Yr)! >= 0 ? '+' : ''}${(selectedETF.trDrip3Yr ?? selectedETF.totalReturn3Yr)!.toFixed(1)}%` : 'N/A')
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">12 Mo:</span>
                      <span className={`font-semibold ${chartType === "price"
                        ? (selectedETF.priceReturn12Mo != null && selectedETF.priceReturn12Mo >= 0 ? 'text-green-600' : 'text-red-600')
                        : ((selectedETF.trDrip12Mo ?? selectedETF.totalReturn12Mo) != null && (selectedETF.trDrip12Mo ?? selectedETF.totalReturn12Mo)! >= 0 ? 'text-green-600' : 'text-red-600')
                        }`}>
                        {chartType === "price"
                          ? (selectedETF.priceReturn12Mo != null ? `${selectedETF.priceReturn12Mo >= 0 ? '+' : ''}${selectedETF.priceReturn12Mo.toFixed(1)}%` : 'N/A')
                          : ((selectedETF.trDrip12Mo ?? selectedETF.totalReturn12Mo) != null ? `${(selectedETF.trDrip12Mo ?? selectedETF.totalReturn12Mo)! >= 0 ? '+' : ''}${(selectedETF.trDrip12Mo ?? selectedETF.totalReturn12Mo)!.toFixed(1)}%` : 'N/A')
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">6 Mo:</span>
                      <span className={`font-semibold ${chartType === "price"
                        ? (selectedETF.priceReturn6Mo != null && selectedETF.priceReturn6Mo >= 0 ? 'text-green-600' : 'text-red-600')
                        : ((selectedETF.trDrip6Mo ?? selectedETF.totalReturn6Mo) != null && (selectedETF.trDrip6Mo ?? selectedETF.totalReturn6Mo)! >= 0 ? 'text-green-600' : 'text-red-600')
                        }`}>
                        {chartType === "price"
                          ? (selectedETF.priceReturn6Mo != null ? `${selectedETF.priceReturn6Mo >= 0 ? '+' : ''}${selectedETF.priceReturn6Mo.toFixed(1)}%` : 'N/A')
                          : ((selectedETF.trDrip6Mo ?? selectedETF.totalReturn6Mo) != null ? `${(selectedETF.trDrip6Mo ?? selectedETF.totalReturn6Mo)! >= 0 ? '+' : ''}${(selectedETF.trDrip6Mo ?? selectedETF.totalReturn6Mo)!.toFixed(1)}%` : 'N/A')
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">3 Mo:</span>
                      <span className={`font-semibold ${chartType === "price"
                        ? (selectedETF.priceReturn3Mo != null && selectedETF.priceReturn3Mo >= 0 ? 'text-green-600' : 'text-red-600')
                        : ((selectedETF.trDrip3Mo ?? selectedETF.totalReturn3Mo) != null && (selectedETF.trDrip3Mo ?? selectedETF.totalReturn3Mo)! >= 0 ? 'text-green-600' : 'text-red-600')
                        }`}>
                        {chartType === "price"
                          ? (selectedETF.priceReturn3Mo != null ? `${selectedETF.priceReturn3Mo >= 0 ? '+' : ''}${selectedETF.priceReturn3Mo.toFixed(1)}%` : 'N/A')
                          : ((selectedETF.trDrip3Mo ?? selectedETF.totalReturn3Mo) != null ? `${(selectedETF.trDrip3Mo ?? selectedETF.totalReturn3Mo)! >= 0 ? '+' : ''}${(selectedETF.trDrip3Mo ?? selectedETF.totalReturn3Mo)!.toFixed(1)}%` : 'N/A')
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">1 Mo:</span>
                      <span className={`font-semibold ${chartType === "price"
                        ? (selectedETF.priceReturn1Mo != null && selectedETF.priceReturn1Mo >= 0 ? 'text-green-600' : 'text-red-600')
                        : ((selectedETF.trDrip1Mo ?? selectedETF.totalReturn1Mo) != null && (selectedETF.trDrip1Mo ?? selectedETF.totalReturn1Mo)! >= 0 ? 'text-green-600' : 'text-red-600')
                        }`}>
                        {chartType === "price"
                          ? (selectedETF.priceReturn1Mo != null ? `${selectedETF.priceReturn1Mo >= 0 ? '+' : ''}${selectedETF.priceReturn1Mo.toFixed(1)}%` : 'N/A')
                          : ((selectedETF.trDrip1Mo ?? selectedETF.totalReturn1Mo) != null ? `${(selectedETF.trDrip1Mo ?? selectedETF.totalReturn1Mo)! >= 0 ? '+' : ''}${(selectedETF.trDrip1Mo ?? selectedETF.totalReturn1Mo)!.toFixed(1)}%` : 'N/A')
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">1 Wk:</span>
                      <span className={`font-semibold ${chartType === "price"
                        ? (selectedETF.priceReturn1Wk != null && selectedETF.priceReturn1Wk >= 0 ? 'text-green-600' : 'text-red-600')
                        : ((selectedETF.trDrip1Wk ?? selectedETF.totalReturn1Wk) != null && (selectedETF.trDrip1Wk ?? selectedETF.totalReturn1Wk)! >= 0 ? 'text-green-600' : 'text-red-600')
                        }`}>
                        {chartType === "price"
                          ? (selectedETF.priceReturn1Wk != null ? `${selectedETF.priceReturn1Wk >= 0 ? '+' : ''}${selectedETF.priceReturn1Wk.toFixed(1)}%` : 'N/A')
                          : ((selectedETF.trDrip1Wk ?? selectedETF.totalReturn1Wk) != null ? `${(selectedETF.trDrip1Wk ?? selectedETF.totalReturn1Wk)! >= 0 ? '+' : ''}${(selectedETF.trDrip1Wk ?? selectedETF.totalReturn1Wk)!.toFixed(1)}%` : 'N/A')
                        }
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <span className="text-muted-foreground">Fwd Yield: </span>
                      <span className="font-bold text-primary">{selectedETF.forwardYield != null ? `${selectedETF.forwardYield.toFixed(2)}%` : 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-4 sm:p-6 border-2 border-slate-200 overflow-auto relative" style={{ zIndex: 1 }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 relative" style={{ zIndex: 1 }}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                        Metric:
                      </label>
                      <Select
                        value={chartType === "price" ? "priceReturn" : "totalReturn"}
                        onValueChange={(value) => setChartType(value === "priceReturn" ? "price" : "totalReturn")}
                      >
                        <SelectTrigger className="w-[160px] h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="totalReturn">
                            <span className="font-bold">Total Return (DRIP)</span>
                          </SelectItem>
                          <SelectItem value="priceReturn">
                            <span className="font-bold">Price Return</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
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
                          className={`h-9 px-1.5 sm:px-3 text-[10px] sm:text-xs whitespace-nowrap ${selectedTimeframe !== tf
                            ? "border-2 border-transparent hover:border-slate-200 hover:bg-slate-100 hover:text-foreground transition-colors"
                            : ""
                            }`}
                        >
                          {tf}
                        </Button>
                      ))}
                      <button
                        onClick={() =>
                          setShowComparisonSelector(!showComparisonSelector)
                        }
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors bg-accent text-white hover:bg-accent/90 flex items-center gap-1 h-9"
                      >
                        <Plus className="h-3 w-3" />
                        Compare ({comparisonETFs.length}/5)
                      </button>
                    </div>
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
                        "#ef4444",
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
                                ? `${etf.totalReturn12Mo > 0 ? "+" : ""
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
                        onFocus={() => { }}
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
                                  className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0 ${isDisabled ? "opacity-50 cursor-not-allowed" : ""
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

                {(() => {
                  const chartValues = (chartData && Array.isArray(chartData) ? chartData : []).map(d => {
                    if (comparisonETFs.length > 0) {
                      const dataKey = chartType === "totalReturn" ? `return_${selectedETF.symbol}` : `price_${selectedETF.symbol}`;
                      return d[dataKey];
                    }
                    return d.price;
                  }).filter((v): v is number => typeof v === 'number' && !isNaN(v));
                  const minValue = chartValues.length > 0 ? Math.min(...chartValues, 0) : -10;
                  const maxValue = chartValues.length > 0 ? Math.max(...chartValues, 0) : 10;

                  return (
                    <div className="flex flex-col lg:flex-row gap-4 h-full">
                      {/* Chart Area */}
                      <div className="flex-1 min-w-0 order-2 lg:order-1 flex flex-col min-h-0">
                        <div className="flex-1 min-h-0 overflow-auto">
                          <ResponsiveContainer width="100%" height={chartHeight}>
                            {chartData && Array.isArray(chartData) && chartData.length > 0 ? (
                              <ComposedChart
                                key={`chart-${selectedETF.symbol}-${chartType}-${selectedTimeframe}`}
                                data={chartData}
                              >
                                <defs>
                                  <linearGradient
                                    id="colorPricePrimary"
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
                                  tickFormatter={(value) => value || ''}
                                />
                                <YAxis
                                  stroke="#94a3b8"
                                  fontSize={12}
                                  domain={chartType === "totalReturn" ? [minValue, maxValue] : [minValue, maxValue]}
                                  tickLine={false}
                                  axisLine={false}
                                  tickFormatter={(value: any) => {
                                    if (value === null || value === undefined) return '';
                                    const numValue = typeof value === 'number' ? value : parseFloat(String(value));
                                    if (typeof numValue === 'number' && !isNaN(numValue) && isFinite(numValue)) {
                                      try {
                                        return `${numValue.toFixed(1)}%`;
                                      } catch (e) {
                                        return '';
                                      }
                                    }
                                    return '';
                                  }}
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
                                  formatter={(value: any, name: string) => {
                                    if (value === null || value === undefined) {
                                      return ['N/A', name];
                                    }
                                    const numValue = typeof value === 'number' ? value : parseFloat(String(value));
                                    if (typeof numValue === 'number' && !isNaN(numValue) && isFinite(numValue)) {
                                      try {
                                        return [`${numValue.toFixed(2)}%`, name];
                                      } catch (e) {
                                        return ['N/A', name];
                                      }
                                    }
                                    return ['N/A', name];
                                  }}
                                />
                                {/* Primary ETF with gradient Area (only when no comparisons) */}
                                {comparisonETFs.length === 0 && (
                                  <Area
                                    type="monotone"
                                    dataKey="price"
                                    stroke={isPositive ? "#10b981" : "#ef4444"}
                                    strokeWidth={3}
                                    fill="url(#colorPricePrimary)"
                                    fillOpacity={1}
                                    dot={false}
                                    name={selectedETF.symbol}
                                    animationDuration={500}
                                    strokeLinecap="round"
                                    connectNulls={false}
                                  />
                                )}
                                {/* All ETFs as Lines (when comparing) */}
                                {[
                                  selectedETF.symbol,
                                  ...comparisonETFs.filter((s) => s !== selectedETF.symbol),
                                ].map((symbol, index) => {
                                  const colors = [
                                    "#3b82f6",
                                    "#f97316",
                                    "#8b5cf6",
                                    "#10b981",
                                    "#ef4444",
                                  ];
                                  const color = colors[index % colors.length];
                                  const dataKey =
                                    chartType === "totalReturn"
                                      ? `return_${symbol}`
                                      : `price_${symbol}`;
                                  return (
                                    <Line
                                      key={symbol}
                                      type="monotone"
                                      dataKey={dataKey}
                                      stroke={color}
                                      strokeWidth={index === 0 ? 3 : 2.5}
                                      dot={false}
                                      name={symbol}
                                      animationDuration={500}
                                      animationBegin={(index + 1) * 100}
                                      strokeLinecap="round"
                                      connectNulls={false}
                                    />
                                  );
                                })}
                              </ComposedChart>
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <div className="text-center">
                                  <p className="text-muted-foreground">Chart data is loading or unavailable.</p>
                                  {isChartLoading && <RefreshCw className="h-4 w-4 animate-spin mx-auto mt-2" />}
                                </div>
                              </div>
                            )}
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Right Side - Return Percentages Legend */}
                      <div className="w-full lg:w-52 flex-shrink-0 bg-slate-50 rounded-lg p-3 sm:p-4 border border-slate-200 order-1 lg:order-2">
                        <h4 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 sm:mb-3">
                          {chartType === "totalReturn" ? "Total Return" : "Price Return"} ({selectedTimeframe})
                        </h4>

                        {isChartLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <div className="space-y-2 sm:space-y-3">
                            {[
                              selectedETF.symbol,
                              ...comparisonETFs.filter((s) => s !== selectedETF.symbol),
                            ].map((sym, index) => {
                              const colors = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ef4444"];
                              const color = colors[index % colors.length];

                              // Use the same data source as the table (uniqueSymbolETFs) to ensure consistency
                              const compareETF = uniqueSymbolETFs.find((e) => e.symbol === sym) || rankedETFs.find((e) => e.symbol === sym);
                              let returnValue: number | null = null;

                              if (compareETF) {
                                if (chartType === "totalReturn") {
                                  switch (selectedTimeframe) {
                                    case "1W":
                                      returnValue = compareETF.trDrip1Wk ?? compareETF.totalReturn1Wk ?? null;
                                      break;
                                    case "1M":
                                      returnValue = compareETF.trDrip1Mo ?? compareETF.totalReturn1Mo ?? null;
                                      break;
                                    case "3M":
                                      returnValue = compareETF.trDrip3Mo ?? compareETF.totalReturn3Mo ?? null;
                                      break;
                                    case "6M":
                                      returnValue = compareETF.trDrip6Mo ?? compareETF.totalReturn6Mo ?? null;
                                      break;
                                    case "1Y":
                                      returnValue = compareETF.trDrip12Mo ?? compareETF.totalReturn12Mo ?? null;
                                      break;
                                    case "3Y":
                                      returnValue = compareETF.trDrip3Yr ?? compareETF.totalReturn3Yr ?? null;
                                      break;
                                    default:
                                      returnValue = compareETF.trDrip12Mo ?? compareETF.totalReturn12Mo ?? null;
                                  }
                                } else {
                                  switch (selectedTimeframe) {
                                    case "1W":
                                      returnValue = compareETF.priceReturn1Wk ?? null;
                                      break;
                                    case "1M":
                                      returnValue = compareETF.priceReturn1Mo ?? null;
                                      break;
                                    case "3M":
                                      returnValue = compareETF.priceReturn3Mo ?? null;
                                      break;
                                    case "6M":
                                      returnValue = compareETF.priceReturn6Mo ?? null;
                                      break;
                                    case "1Y":
                                      returnValue = compareETF.priceReturn12Mo ?? null;
                                      break;
                                    case "3Y":
                                      returnValue = compareETF.priceReturn3Yr ?? null;
                                      break;
                                    default:
                                      returnValue = compareETF.priceReturn12Mo ?? null;
                                  }
                                }
                              }

                              const isPositiveReturn = returnValue !== null && returnValue >= 0;

                              return (
                                <div key={sym} className="flex items-center justify-between gap-2 sm:gap-3 py-1">
                                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-shrink">
                                    <div
                                      className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: color }}
                                    />
                                    <span className="font-semibold text-xs sm:text-sm truncate">{sym}</span>
                                  </div>
                                  <span className={`font-bold text-xs sm:text-sm tabular-nums whitespace-nowrap flex-shrink-0 ${isPositiveReturn ? "text-green-600" : "text-red-600"
                                    }`}>
                                    {returnValue != null && typeof returnValue === 'number' && !isNaN(returnValue) && isFinite(returnValue)
                                      ? `${returnValue >= 0 ? '+' : ''}${returnValue.toFixed(1)}%`
                                      : 'N/A'
                                    }
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="mt-4 pt-3 border-t border-slate-200">
                          <p className="text-[10px] text-muted-foreground leading-relaxed">
                            {chartType === "totalReturn"
                              ? "Total return includes dividends reinvested (DRIP)."
                              : "Price return excludes dividends."
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </Card>

              {/* Quick Stats Card - Matching home version */}
              <Card className="p-4 sm:p-6 border-2 border-slate-200">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Forward Yield</p>
                    <p className="text-xl font-bold text-primary">
                      {selectedETF.forwardYield != null && typeof selectedETF.forwardYield === 'number' && !isNaN(selectedETF.forwardYield) && isFinite(selectedETF.forwardYield)
                        ? `${selectedETF.forwardYield.toFixed(2)}%`
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">52-Week Range</p>
                    <p className="text-sm font-medium">
                      {selectedETF.week52Low != null && typeof selectedETF.week52Low === 'number' && !isNaN(selectedETF.week52Low) && isFinite(selectedETF.week52Low) &&
                        selectedETF.week52High != null && typeof selectedETF.week52High === 'number' && !isNaN(selectedETF.week52High) && isFinite(selectedETF.week52High)
                        ? `$${selectedETF.week52Low.toFixed(2)} - $${selectedETF.week52High.toFixed(2)}`
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Annual Dividend</p>
                    <p className="text-xl font-bold text-green-600">
                      {(() => {
                        // Calculate Annual Div = Div × #Pmt to ensure accuracy
                        const calculatedAnnualDiv = selectedETF.dividend && selectedETF.numPayments
                          ? selectedETF.dividend * selectedETF.numPayments
                          : null;
                        // Use calculated value if available, fallback to database value
                        const annualDiv = calculatedAnnualDiv ?? selectedETF.annualDividend;
                        return annualDiv != null && typeof annualDiv === 'number' && !isNaN(annualDiv) && isFinite(annualDiv) && annualDiv > 0
                          ? `$${annualDiv.toFixed(2)}`
                          : 'N/A';
                      })()}
                    </p>
                  </div>
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Dividend Volatility</p>
                    <p className="text-sm font-medium">
                      {selectedETF.dividendCVPercent != null && typeof selectedETF.dividendCVPercent === 'number' && !isNaN(selectedETF.dividendCVPercent) && isFinite(selectedETF.dividendCVPercent)
                        ? `${selectedETF.dividendCVPercent.toFixed(1)}%`
                        : 'N/A'}
                    </p>
                  </div>
                </div>
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
                        className={`text-xl font-bold ${metric.isPercentage && metric.value_raw !== undefined
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

  // Show CEF detail view if a CEF is selected
  if (selectedCEF) {
    return (
      <div className="min-h-screen bg-slate-50 flex">
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-[90] lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        <aside
          className={`${sidebarCollapsed ? "w-16" : "w-64"
            } bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 transition-all duration-300 ${mobileSidebarOpen ? "fixed left-0 top-0 z-[100]" : "hidden lg:flex"
            }`}
        >
          {/* Sidebar content - same as main dashboard */}
          <div
            className={`h-16 border-b border-slate-200 flex items-center flex-shrink-0 ${sidebarCollapsed ? "justify-center px-2" : "px-6 justify-between"
              }`}
          >
            {!sidebarCollapsed && (
              <button
                onClick={() => {
                  const homePath = selectedCategory === "cef" ? "/cef" : "/";
                  navigate(homePath);
                }}
                className="hover:opacity-80 transition-opacity cursor-pointer"
              >
                <Logo simple />
              </button>
            )}
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
            className={`flex-1 overflow-y-auto ${sidebarCollapsed ? "p-2 space-y-1" : "p-4 space-y-2"
              }`}
          >
            <button
              onClick={() => {
                setSelectedCEF(null);
                setShowFavoritesOnly(false);
                setAdminSection(null);
                navigate("/");
              }}
              className={`w-full flex items-center ${sidebarCollapsed
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
                setSelectedCEF(null);
                setShowFavoritesOnly(false);
                setAdminSection(null);
                setSelectedCategory("cc");
                navigate("/dashboard");
              }}
              className={`w-full flex items-center ${sidebarCollapsed
                ? "justify-center px-0 py-2.5"
                : "gap-3 px-4 py-3"
                } rounded-lg text-sm font-medium transition-colors ${selectedCategory === "cc" && !showFavoritesOnly
                  ? sidebarCollapsed
                    ? "bg-primary/10 text-primary"
                    : "bg-primary text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
                }`}
              title={sidebarCollapsed ? "CC ETFs" : ""}
            >
              <BarChart3 className="w-5 h-5" />
              {!sidebarCollapsed && "CC ETFs"}
            </button>
            <button
              onClick={() => {
                setSelectedCEF(null);
                setShowFavoritesOnly(false);
                setAdminSection(null);
                setSelectedCategory("cef");
                navigate("/dashboard");
              }}
              className={`w-full flex items-center ${sidebarCollapsed
                ? "justify-center px-0 py-2.5"
                : "gap-3 px-4 py-3"
                } rounded-lg text-sm font-medium transition-colors ${selectedCategory === "cef"
                  ? sidebarCollapsed
                    ? "bg-primary/10 text-primary"
                    : "bg-primary text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
                }`}
              title={sidebarCollapsed ? "CEFs" : ""}
            >
              <TrendingUp className="w-5 h-5" />
              {!sidebarCollapsed && "CEFs"}
            </button>
            <button
              onClick={() => {
                setSelectedCEF(null);
                setShowFavoritesOnly(false);
                setAdminSection(null);
                navigate("/focus");
              }}
              className={`w-full flex items-center ${sidebarCollapsed
                ? "justify-center px-0 py-2.5"
                : "gap-3 px-4 py-3"
                } rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-foreground`}
              title={sidebarCollapsed ? "My Focus" : ""}
            >
              <Target className="w-5 h-5" />
              {!sidebarCollapsed && "My Focus"}
            </button>
          </nav>

          <div
            className={`border-t border-slate-200 flex-shrink-0 ${sidebarCollapsed ? "p-2" : "p-4"
              }`}
          >
            <button
              onClick={logout}
              className={`w-full flex items-center ${sidebarCollapsed
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

        <div className="flex-1 flex flex-col min-h-screen min-w-0 overflow-hidden">
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCEF(null);
                      setShowFavoritesOnly(false);
                    }}
                    className="hover:bg-slate-100 hover:text-foreground transition-colors text-sm sm:text-base"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Back to Rankings</span>
                    <span className="sm:hidden">Back</span>
                  </Button>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
              <div className="space-y-6">
                <div className="mb-4 sm:mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4 mb-2">
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">
                      {selectedCEF.symbol}
                    </h1>
                    <span className="text-base sm:text-lg text-muted-foreground">
                      {selectedCEF.description || "N/A"}
                    </span>
                  </div>
                </div>

                <Card className="p-4 sm:p-6 border-2 border-slate-200">
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <h2 className="text-xl sm:text-2xl font-bold">
                      {selectedCEF.symbol} Key Metrics
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Market Price
                      </p>
                      <p className="text-xl font-bold text-foreground">
                        {selectedCEF.marketPrice != null ? `$${selectedCEF.marketPrice.toFixed(2)}` : 'N/A'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        NAV
                      </p>
                      <p className="text-xl font-bold text-foreground">
                        {selectedCEF.nav != null ? `$${selectedCEF.nav.toFixed(2)}` : 'N/A'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Premium/Discount
                      </p>
                      <p className={`text-xl font-bold ${selectedCEF.premiumDiscount != null && selectedCEF.premiumDiscount >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {selectedCEF.premiumDiscount != null ? `${selectedCEF.premiumDiscount >= 0 ? '+' : ''}${selectedCEF.premiumDiscount.toFixed(2)}%` : 'N/A'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Forward Yield
                      </p>
                      <p className="text-xl font-bold text-foreground">
                        {selectedCEF.forwardYield != null ? `${selectedCEF.forwardYield.toFixed(2)}%` : 'N/A'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        3-Year Z-Score
                      </p>
                      <p className="text-xl font-bold text-foreground">
                        {selectedCEF.zScore5Yr != null ? selectedCEF.zScore5Yr.toFixed(2) : 'N/A'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Last Dividend
                      </p>
                      <p className="text-xl font-bold text-foreground">
                        {selectedCEF.lastDividend != null ? `$${selectedCEF.lastDividend.toFixed(4)}` : 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <Button
                      onClick={() => navigate(`/cef/${selectedCEF.symbol}`)}
                      className="w-full sm:w-auto"
                    >
                      View Full Details & Charts
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[90] lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={`${sidebarCollapsed ? "w-16" : "w-64"
          } bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 transition-all duration-300 ${mobileSidebarOpen ? "fixed left-0 top-0 z-[100]" : "hidden lg:flex"
          }`}
      >
        <div
          className={`h-16 border-b border-slate-200 flex items-center flex-shrink-0 ${sidebarCollapsed ? "justify-center px-2" : "px-6 justify-between"
            }`}
        >
          {!sidebarCollapsed && (
            <button
              onClick={() => {
                const homePath = selectedCategory === "cef" ? "/cef" : "/";
                navigate(homePath);
              }}
              className="hover:opacity-80 transition-opacity cursor-pointer"
            >
              <Logo simple />
            </button>
          )}
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
          className={`flex-1 overflow-y-auto ${sidebarCollapsed ? "p-2 space-y-1" : "p-4 space-y-2"
            }`}
        >
          <button
            onClick={() => {
              setShowFavoritesOnly(false);
              setAdminSection(null);
              navigate("/");
            }}
            className={`w-full flex items-center ${sidebarCollapsed
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
            className={`w-full flex items-center ${sidebarCollapsed
              ? "justify-center px-0 py-2.5"
              : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium transition-colors ${!showFavoritesOnly && !adminSection
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
            className={`w-full flex items-center ${sidebarCollapsed
              ? "justify-center px-0 py-2.5"
              : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium transition-colors ${showFavoritesOnly
                ? sidebarCollapsed
                  ? "bg-yellow-50 text-yellow-600"
                  : "bg-yellow-500 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
              }`}
            title={sidebarCollapsed ? "Favorites" : ""}
          >
            <Star
              className={`w-5 h-5 ${showFavoritesOnly && !sidebarCollapsed
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
                    className={`text-xs px-2 py-0.5 rounded-full ${showFavoritesOnly
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
              navigate("/newsletters");
            }}
            className={`w-full flex items-center ${sidebarCollapsed
              ? "justify-center px-0 py-2.5"
              : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-foreground transition-colors`}
            title={sidebarCollapsed ? "Newsletters" : ""}
          >
            <Mail className="w-5 h-5" />
            {!sidebarCollapsed && "Newsletters"}
          </button>
          <button
            onClick={() => {
              setShowFavoritesOnly(false);
              setAdminSection(null);
              navigate("/settings");
            }}
            className={`w-full flex items-center ${sidebarCollapsed
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
          className={`border-t border-slate-200 flex-shrink-0 ${sidebarCollapsed ? "p-2" : "p-4"
            }`}
        >
          <button
            onClick={logout}
            className={`w-full flex items-center ${sidebarCollapsed
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

      <div className="flex-1 flex flex-col min-h-screen min-w-0 overflow-hidden">
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 px-3 text-sm font-medium text-foreground hover:bg-slate-50 hover:text-foreground border-slate-200 flex items-center gap-1.5 [&>span]:text-foreground"
                    >
                      <LayoutGrid className="w-4 h-4 hover:text-primary transition-colors" />
                      <span className="hidden sm:inline text-foreground">
                        {selectedCategory === "cef" ? "Closed End Funds" : "Covered Call Option ETFs"}
                      </span>
                      <span className="sm:hidden text-foreground">
                        {selectedCategory === "cef" ? "CEF" : "CC ETFs"}
                      </span>
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedCategory("cc");
                        // Stay in Dashboard - don't navigate
                      }}
                      className={`cursor-pointer ${selectedCategory === "cc" ? 'bg-slate-100 font-semibold' : ''}`}
                    >
                      Covered Call Option ETFs
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedCategory("cef");
                        // Stay in Dashboard - don't navigate
                        if (cefData.length === 0) {
                          loadCEFData();
                        }
                      }}
                      className={`cursor-pointer ${selectedCategory === "cef" ? 'bg-slate-100 font-semibold' : ''}`}
                    >
                      Closed End Funds
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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

          <div className="flex-1 overflow-auto min-h-0">
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
                                a.download = `users-${new Date().toISOString().split("T")[0]
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
                                className={`w-4 h-4 mr-2 ${adminLoading ? "animate-spin" : ""
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
                                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${row.role === "admin"
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
                  {((isGuest && guestMessage) || (isPremium && premiumMessage)) && (
                    <div className="w-full">
                      <Card className="p-4 border-2 border-primary/20 bg-primary/5">
                        <p className="text-base md:text-lg text-foreground leading-relaxed font-medium">
                          {isGuest ? guestMessage : premiumMessage}
                        </p>
                      </Card>
                    </div>
                  )}
                  {/* Covered Call Option ETFs Section - Only show when CC category is selected */}
                  {selectedCategory === "cc" && (
                    <div className="space-y-6">
                      <Card className="p-6">
                        <div className="space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                            <div className="flex flex-col gap-1">
                              <h2 className="text-2xl font-bold text-foreground">
                                Covered Call Option ETFs
                              </h2>
                              <p className="text-sm text-muted-foreground mt-1">
                                {isLoadingData ? "Loading..." : `${uniqueSymbolETFs.length} ETFs`}
                                {lastDataUpdate && ` • Last updated: ${lastDataUpdate}`}
                              </p>
                            </div>
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:pt-0.5 md:flex-nowrap">
                                <div className="relative">
                                  {isPremium && (
                                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs sm:text-sm text-muted-foreground font-medium whitespace-nowrap">
                                      {yieldWeight} {volatilityWeight ?? 0} {totalReturnWeight} {totalReturnTimeframe.toUpperCase()}
                                    </div>
                                  )}
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
                                </div>
                                {/* Total Return / Price Return Toggle */}
                                <div className="relative inline-flex items-center h-10 sm:h-9 md:h-9 border-2 border-slate-300 rounded-md overflow-hidden w-full sm:w-auto">
                                  <div
                                    className={`absolute top-0 bottom-0 left-0 bg-primary transition-all duration-200 ${showTotalReturns ? 'w-1/2' : 'w-1/2 translate-x-full'
                                      }`}
                                    style={{ zIndex: 0 }}
                                  />
                                  <button
                                    onClick={() => setShowTotalReturns(true)}
                                    className={`relative z-10 flex-1 px-3 sm:px-4 py-2 text-xs font-semibold transition-colors duration-200 whitespace-nowrap ${showTotalReturns
                                      ? "text-white"
                                      : "text-slate-600 hover:text-slate-900"
                                      }`}
                                  >
                                    Total Returns
                                  </button>
                                  <button
                                    onClick={() => setShowTotalReturns(false)}
                                    className={`relative z-10 flex-1 px-3 sm:px-4 py-2 text-xs font-semibold transition-colors duration-200 md:whitespace-nowrap ${!showTotalReturns
                                      ? "text-white"
                                      : "text-slate-600 hover:text-slate-900"
                                      }`}
                                  >
                                    Price Returns
                                  </button>
                                </div>
                                {isPremium && (
                                  <button
                                    onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                                    className={`border-2 h-10 sm:h-9 md:h-9 transition-colors whitespace-nowrap w-full sm:w-auto md:flex-shrink-0 justify-center px-4 rounded-md flex items-center ${showFavoritesOnly
                                        ? "bg-yellow-500 hover:bg-yellow-600 border-yellow-500 text-white"
                                        : "border-yellow-400 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-600"
                                      }`}
                                  >
                                    <Star
                                      className={`h-4 w-4 mr-2 ${showFavoritesOnly ? "fill-white" : "fill-yellow-400"
                                        }`}
                                    />
                                    {showFavoritesOnly ? "Show All" : "Favorites"}{" "}
                                    {favorites.size > 0 && `(${favorites.size})`}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-lg">
                            {isLoadingData ? (
                              <div className="min-h-[60vh] flex flex-col items-center justify-center py-20 px-4">
                                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                                <h3 className="text-xl font-bold text-foreground mb-2">
                                  Loading ETF Data
                                </h3>
                                <p className="text-sm text-muted-foreground text-center max-w-md">
                                  Fetching the latest data. Please wait.
                                </p>
                              </div>
                            ) : uniqueSymbolETFs.length === 0 ? (
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
                                etfs={uniqueSymbolETFs}
                                favorites={favorites}
                                onToggleFavorite={toggleFavorite}
                                viewMode={showTotalReturns ? "total" : "price"}
                                onSymbolClick={handleETFSymbolClick}
                                onDividendClick={handleETFDividendClick}
                              />
                            )}
                          </div>
                        </div>
                      </Card>
                    </div>
                  )}

                  {/* Closed End Funds Section - Only show when CEF category is selected */}
                  {selectedCategory === "cef" && (
                    <div className="space-y-6">
                      <Card className="p-6">
                        <div className="space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                            <div className="flex flex-col gap-1">
                              <h2 className="text-2xl font-bold text-foreground">
                                Closed End Funds
                              </h2>
                              <p className="text-sm text-muted-foreground mt-1">
                                {isLoadingCEFData ? "Loading..." : `${filteredCEFs.length} CEFs`}
                                {lastCEFDataUpdate && ` • Last updated: ${lastCEFDataUpdate}`}
                              </p>
                            </div>
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:pt-0.5 md:flex-nowrap">
                                <div className="relative">
                                  {isPremium && (
                                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs sm:text-sm text-muted-foreground font-medium whitespace-nowrap">
                                      {cefYieldWeight} {cefVolatilityWeight} {cefTotalReturnWeight} {cefTotalReturnTimeframe.toUpperCase()}
                                    </div>
                                  )}
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
                                </div>
                                {isPremium && (
                                  <button
                                    onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                                    className={`border-2 h-10 sm:h-9 md:h-9 transition-colors whitespace-nowrap w-full sm:w-auto md:flex-shrink-0 justify-center px-4 rounded-md flex items-center ${showFavoritesOnly
                                        ? "bg-yellow-500 hover:bg-yellow-600 border-yellow-500 text-white"
                                        : "border-yellow-400 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-600"
                                      }`}
                                  >
                                    <Star
                                      className={`h-4 w-4 mr-2 ${showFavoritesOnly ? "fill-white" : "fill-yellow-400"
                                        }`}
                                    />
                                    {showFavoritesOnly ? "Show All" : "CEF Favorites"}{" "}
                                    {favorites.size > 0 && `(${favorites.size})`}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-lg">
                            {isLoadingCEFData ? (
                              <div className="min-h-[60vh] flex flex-col items-center justify-center py-20 px-4">
                                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                                <h3 className="text-xl font-bold text-foreground mb-2">
                                  Loading CEF Data
                                </h3>
                                <p className="text-sm text-muted-foreground text-center max-w-md">
                                  Fetching the latest data. Please wait.
                                </p>
                              </div>
                            ) : filteredCEFs.length === 0 ? (
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
                                cefs={filteredCEFs}
                                favorites={favorites}
                                onToggleFavorite={toggleFavorite}
                                onSymbolClick={handleCEFSymbolClick}
                                onDividendClick={handleCEFDividendClick}
                              />
                            )}
                          </div>
                        </div>
                      </Card>
                    </div>
                  )}

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
                                Customize {selectedCategory === "cef" ? "CEF" : "ETF"} Rankings
                              </h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                Personalize your {selectedCategory === "cef" ? "CEF" : "ETF"} rankings by adjusting the
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
                          {(selectedCategory === "cc" ? rankingPresets : cefRankingPresets).length > 0 && (
                            <div className="space-y-3">
                              <Label className="text-base font-semibold text-foreground">
                                Saved Presets
                              </Label>
                              <div className="max-h-48 overflow-y-auto pr-2 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  {(selectedCategory === "cc" ? rankingPresets : cefRankingPresets).map((preset) => (
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
                                  {selectedCategory === "cef" ? cefYieldWeight : yieldWeight}%
                                </span>
                              </div>
                              <Slider
                                value={selectedCategory === "cef" ? [cefYieldWeight] : [yieldWeight]}
                                onValueChange={selectedCategory === "cef" ? (value) => {
                                  const newYield = value[0];
                                  setCefYieldWeight(newYield);
                                  setCefWeights({
                                    yield: newYield,
                                    volatility: cefVolatilityWeight,
                                    totalReturn: cefTotalReturnWeight,
                                    timeframe: cefTotalReturnTimeframe,
                                  });
                                } : handleYieldChange}
                                min={0}
                                max={100}
                                step={5}
                                className="w-full"
                              />
                            </div>

                            <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
                              <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium text-foreground">
                                  {selectedCategory === "cef" ? "Z-Score" : "Dividend Volatility Index (DVI)"}
                                </Label>
                                <span className="text-2xl font-bold tabular-nums text-primary">
                                  {selectedCategory === "cef" ? (cefVolatilityWeight ?? 0) : (volatilityWeight ?? 0)}%
                                </span>
                              </div>
                              <Slider
                                value={selectedCategory === "cef" ? [cefVolatilityWeight ?? 0] : [volatilityWeight ?? 0]}
                                onValueChange={selectedCategory === "cef" ? (value) => {
                                  const newVol = value[0] ?? 33;
                                  setCefVolatilityWeight(newVol);
                                  setCefWeights({
                                    yield: cefYieldWeight,
                                    volatility: newVol,
                                    totalReturn: cefTotalReturnWeight,
                                    timeframe: cefTotalReturnTimeframe,
                                  });
                                } : handleStdDevChange}
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
                                  {selectedCategory === "cef" ? cefTotalReturnWeight : totalReturnWeight}%
                                </span>
                              </div>
                              <Slider
                                value={selectedCategory === "cef" ? [cefTotalReturnWeight] : [totalReturnWeight]}
                                onValueChange={selectedCategory === "cef" ? (value) => {
                                  const newTotalReturn = value[0];
                                  setCefTotalReturnWeight(newTotalReturn);
                                  setCefWeights({
                                    yield: cefYieldWeight,
                                    volatility: cefVolatilityWeight,
                                    totalReturn: newTotalReturn,
                                    timeframe: cefTotalReturnTimeframe,
                                  });
                                } : handleTotalReturnChange}
                                min={0}
                                max={100}
                                step={5}
                                className="w-full"
                              />
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={() => selectedCategory === "cef" ? setCefTotalReturnTimeframe("3mo") : handleTimeframeChange("3mo")}
                                  className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${(selectedCategory === "cef" ? cefTotalReturnTimeframe : totalReturnTimeframe) === "3mo"
                                    ? "bg-primary text-white"
                                    : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
                                    }`}
                                >
                                  3 Mo
                                </button>
                                <button
                                  onClick={() => selectedCategory === "cef" ? setCefTotalReturnTimeframe("6mo") : handleTimeframeChange("6mo")}
                                  className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${(selectedCategory === "cef" ? cefTotalReturnTimeframe : totalReturnTimeframe) === "6mo"
                                    ? "bg-primary text-white"
                                    : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
                                    }`}
                                >
                                  6 Mo
                                </button>
                                <button
                                  onClick={() => selectedCategory === "cef" ? setCefTotalReturnTimeframe("12mo") : handleTimeframeChange("12mo")}
                                  className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${(selectedCategory === "cef" ? cefTotalReturnTimeframe : totalReturnTimeframe) === "12mo"
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
                                  className={`text-3xl font-bold tabular-nums ${(selectedCategory === "cef" ? cefIsValid : isValid) ? "text-primary" : "text-destructive"
                                    }`}
                                >
                                  {isNaN(selectedCategory === "cef" ? cefTotalWeight : totalWeight) ? 0 : (selectedCategory === "cef" ? cefTotalWeight : totalWeight)}%
                                </span>
                                {(selectedCategory === "cef" ? cefIsValid : isValid) ? (
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

        {/* Dividend History Modal */}
        <Dialog open={showDividendModal} onOpenChange={setShowDividendModal}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                    {dividendModalSymbol && (
                      <>
                        {dividendModalSymbol.toUpperCase()} - Dividend Yield & Payments
                        {selectedCategory === "cc" ? (
                          etfData.find(e => e.symbol === dividendModalSymbol) ? (
                            <p className="text-sm font-normal text-muted-foreground mt-1">
                              {etfData.find(e => e.symbol === dividendModalSymbol)?.name}
                            </p>
                          ) : (
                            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                              <strong>Note:</strong> This ETF is not currently in our database, but dividend history may still be available.
                            </div>
                          )
                        ) : (
                          cefData.find(c => c.symbol === dividendModalSymbol) ? (
                            <p className="text-sm font-normal text-muted-foreground mt-1">
                              {cefData.find(c => c.symbol === dividendModalSymbol)?.name}
                            </p>
                          ) : (
                            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                              <strong>Note:</strong> This CEF is not currently in our database, but dividend history may still be available.
                            </div>
                          )
                        )}
                      </>
                    )}
              </DialogTitle>
            </DialogHeader>
            {dividendModalSymbol && (
              <DividendHistory
                ticker={dividendModalSymbol}
                annualDividend={
                  selectedCategory === "cc"
                    ? (etfData.find(e => e.symbol === dividendModalSymbol)?.annualDividend ?? null)
                    : (cefData.find(c => c.symbol === dividendModalSymbol)?.yearlyDividend ?? null)
                }
                dvi={
                  selectedCategory === "cc"
                    ? (etfData.find(e => e.symbol === dividendModalSymbol)?.dividendCVPercent ?? null)
                    : (cefData.find(c => c.symbol === dividendModalSymbol)?.dividendCVPercent ?? null)
                }
                forwardYield={
                  selectedCategory === "cc"
                    ? (etfData.find(e => e.symbol === dividendModalSymbol)?.forwardYield ?? null)
                    : (cefData.find(c => c.symbol === dividendModalSymbol)?.forwardYield ?? null)
                }
              />
            )}
          </DialogContent>
        </Dialog>
        <Footer />
      </div>
    </div>
  );
}
