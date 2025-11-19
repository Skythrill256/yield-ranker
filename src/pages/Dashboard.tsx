import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  fetchETFData,
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
import { listProfiles, updateProfile, ProfileRow } from "@/services/admin";
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
  const [adminPanelExpanded, setAdminPanelExpanded] = useState(isAdmin);
  const [accountPanelExpanded, setAccountPanelExpanded] = useState(false);
  const [showRankingPanel, setShowRankingPanel] = useState(false);
  const [infoBanner, setInfoBanner] = useState(
    "The highest yielding dividend etf is GraniteShares YieldBOOST TSLA ETF (TSYY) with a dividend yield of 166.82%, followed by YieldMax SMCI Option Income Strategy ETF (SMCY) and YieldMax™ COIN Option Income Strategy ETF (CONY). Last updated Oct 31, 2025."
  );
  const [showTotalReturns, setShowTotalReturns] = useState(true);
  const [chartType, setChartType] = useState<ChartType>("totalReturn");
  const [comparisonETFs, setComparisonETFs] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showComparisonSelector, setShowComparisonSelector] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [adminSection, setAdminSection] = useState<"users" | "upload" | null>(
    null
  );
  const [adminProfiles, setAdminProfiles] = useState<ProfileRow[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [adminUpdatingId, setAdminUpdatingId] = useState<string | null>(null);
  const [etfData, setEtfData] = useState<ETF[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const isAdmin = profile?.role === "admin";
  const isPremium = !!profile;
  const isGuest = !profile;

  useEffect(() => {
    const loadETFData = async () => {
      setIsLoadingData(true);
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
      setIsLoadingData(false);
    };
    loadETFData();
  }, []);

  useEffect(() => {
    if (!etfData.length) return;
    const symbols = etfData.map((e) => e.symbol);
    const tick = async () => {
      try {
        const updates = await fetchQuickUpdates(symbols);
        setEtfData((prev) =>
          prev.map((etf) => {
            const u = updates[etf.symbol];
            if (!u || u.price == null) return etf;
            return {
              ...etf,
              price: u.price,
              priceChange: u.priceChange ?? etf.priceChange,
            };
          })
        );
      } catch (_e) {
        // ignore quick update errors
      }
    };
    tick();
    const interval = setInterval(tick, 15000);
    return () => clearInterval(interval);
  }, [etfData]);

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
  const premiumCount = adminProfiles.filter(
    (p) => p.is_premium && p.role !== "admin"
  ).length;
  const guestCount = adminProfiles.filter(
    (p) => !p.is_premium && p.role !== "admin"
  ).length;

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
    stdDev: 30,
    totalReturn: 40,
    timeframe: "12mo",
  });
  const [yieldWeight, setYieldWeight] = useState(30);
  const [stdDevWeight, setStdDevWeight] = useState(30);
  const [totalReturnWeight, setTotalReturnWeight] = useState(40);
  const [totalReturnTimeframe, setTotalReturnTimeframe] = useState<
    "3mo" | "6mo" | "12mo"
  >("12mo");

  const totalWeight = yieldWeight + stdDevWeight + totalReturnWeight;
  const isValid = totalWeight === 100;

  useEffect(() => {
    setSortField("weightedRank");
    setSortDirection("asc");
  }, [showTotalReturns, weights]);

  useEffect(() => {
    if (showRankingPanel) {
      setYieldWeight(weights.yield);
      setStdDevWeight(weights.stdDev);
      setTotalReturnWeight(weights.totalReturn);
      setTotalReturnTimeframe(weights.timeframe || "12mo");
    }
  }, [showRankingPanel, weights]);

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

  const handleTimeframeChange = (timeframe: "3mo" | "6mo" | "12mo") => {
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
    setTotalReturnTimeframe("12mo");
    setWeights({ yield: 30, stdDev: 30, totalReturn: 40, timeframe: "12mo" });
  };

  const applyRankings = () => {
    if (!isValid) return;
    if (!isPremium) {
      setShowUpgradeModal(true);
      return;
    }
    setShowRankingPanel(false);
  };

  const rankedETFs = rankETFs(etfData, weights);
  const filteredETFs = rankedETFs.filter((etf) => {
    if (showFavoritesOnly && !favorites.has(etf.symbol)) return false;
    if (searchQuery.trim() === "") return true;
    return (
      etf.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      etf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      etf.issuer?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Sort ETFs
  const sortedETFs = [...filteredETFs].sort((a, b) => {
    if (!sortField) return 0;

    const aValue = a[sortField];
    const bValue = b[sortField];

    if (aValue === undefined || aValue === null) return 1;
    if (bValue === undefined || bValue === null) return -1;

    const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    return sortDirection === "asc" ? comparison : -comparison;
  });

  const favoritesFilteredETFs = showFavoritesOnly
    ? sortedETFs.filter((etf) => favorites.has(etf.symbol))
    : sortedETFs;

  const rerankedETFs = favoritesFilteredETFs.map((etf, index) => ({
    ...etf,
    weightedRank: index + 1,
  }));

  const uniqueSymbolETFs = rerankedETFs.filter((etf, index, self) => {
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
            {isAdmin &&
              (!sidebarCollapsed ? (
                <div>
                  <button
                    onClick={() => setAdminPanelExpanded(!adminPanelExpanded)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      adminSection ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Users className="w-5 h-5" />
                      Admin Panel
                    </div>
                    {adminPanelExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                  {adminPanelExpanded && (
                    <div className="pl-4 mt-1 space-y-1">
                      <button
                        onClick={() => {
                          setAdminSection("users");
                          setShowFavoritesOnly(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          adminSection === "users" ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100 hover:text-foreground'
                        }`}
                      >
                        <Users className="w-4 h-4" />
                        User Administration
                      </button>
                      <button
                        onClick={() => {
                          setAdminSection("upload");
                          setShowFavoritesOnly(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          adminSection === "upload" ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100 hover:text-foreground'
                        }`}
                      >
                        <Upload className="w-4 h-4" />
                        ETF Data Management
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => {
                    setAdminPanelExpanded(true);
                    setAdminSection("users");
                  }}
                  className={`w-full flex items-center justify-center px-0 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    adminSection ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100 hover:text-foreground'
                  }`}
                  title="Admin Panel"
                >
                  <Users className="w-5 h-5" />
                </button>
              ))}
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

              <Card className="p-4 sm:p-6 border-2 border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex-1">
                    <h2 className="text-lg sm:text-xl font-semibold mb-2">
                      {selectedETF.symbol}{" "}
                      {chartType === "price" ? "Price" : "Total Return"} Chart
                    </h2>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => setChartType("price")}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                          chartType === "price"
                            ? "bg-primary text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        Price Chart
                      </button>
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
                  <div className="flex gap-1 flex-wrap">
                    {timeframes.map((tf: ComparisonTimeframe) => (
                      <Button
                        key={tf}
                        variant={
                          selectedTimeframe === tf ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setSelectedTimeframe(tf)}
                        className={`h-7 sm:h-8 px-2 sm:px-3 text-xs ${
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
                  <div className="mb-4 p-4 bg-slate-50 border-2 border-slate-200 rounded-lg max-h-64 overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-sm">
                        Select ETFs to Compare
                      </h3>
                      <button
                        onClick={() => setShowComparisonSelector(false)}
                        className="hover:bg-slate-200 rounded-full p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {rankedETFs
                        .filter((etf) => etf.symbol !== selectedETF.symbol)
                        .sort((a, b) => a.symbol.localeCompare(b.symbol))
                        .slice(0, 20)
                        .map((etf, idx) => {
                          const isSelected = comparisonETFs.includes(
                            etf.symbol
                          );
                          const isDisabled =
                            !isSelected && comparisonETFs.length >= 5;
                          return (
                            <button
                              key={`${etf.symbol}-${idx}`}
                              onClick={() =>
                                !isDisabled && toggleComparison(etf.symbol)
                              }
                              disabled={isDisabled}
                              className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                                isSelected
                                  ? "bg-primary text-white"
                                  : isDisabled
                                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                  : "bg-white border-2 border-slate-300 hover:border-primary hover:bg-slate-100"
                              }`}
                            >
                              {etf.symbol}
                            </button>
                          );
                        })}
                    </div>
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

                <ResponsiveContainer
                  width="100%"
                  height={300}
                  className="sm:h-[400px]"
                >
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
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={12}
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
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={12}
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
                {adminSection ? "Admin Panel" : "Dashboard"}
              </h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden sm:flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isAdmin ? "Admin" : isPremium ? "Premium" : "Guest"}
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
                {!adminSection && infoBanner && (
                  <div className="w-full max-w-[98%] mx-auto">
                    <Card className="p-3 border-2 border-primary/20 bg-primary/5">
                      <p className="text-lg text-foreground leading-relaxed">
                        {infoBanner}
                      </p>
                    </Card>
                  </div>
                )}
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="w-full max-w-[98%] mx-auto flex flex-col min-h-0 flex-1">
                    {adminSection ? (
                      <Card className="p-4 sm:p-6 border-2 border-slate-200">
                        {adminSection === "users" && (
                          <div className="space-y-6">
                            <div>
                              <h2 className="text-2xl font-bold text-foreground mb-2">User Administration</h2>
                              <p className="text-muted-foreground">Manage user accounts and permissions</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                              <Card className="p-4 border-2">
                                <div className="flex items-center gap-3">
                                  <Users className="h-8 w-8 text-primary" />
                                  <div>
                                    <p className="text-sm text-muted-foreground">Total Users</p>
                                    <p className="text-2xl font-bold">{totalUsers}</p>
                                  </div>
                                </div>
                              </Card>
                              <Card className="p-4 border-2">
                                <div className="flex items-center gap-3">
                                  <ShieldCheck className="h-8 w-8 text-orange-500" />
                                  <div>
                                    <p className="text-sm text-muted-foreground">Admins</p>
                                    <p className="text-2xl font-bold">{adminCount}</p>
                                  </div>
                                </div>
                              </Card>
                              <Card className="p-4 border-2">
                                <div className="flex items-center gap-3">
                                  <Star className="h-8 w-8 text-yellow-500" />
                                  <div>
                                    <p className="text-sm text-muted-foreground">Premium</p>
                                    <p className="text-2xl font-bold">{premiumCount}</p>
                                  </div>
                                </div>
                              </Card>
                              <Card className="p-4 border-2">
                                <div className="flex items-center gap-3">
                                  <Users className="h-8 w-8 text-slate-400" />
                                  <div>
                                    <p className="text-sm text-muted-foreground">Guests</p>
                                    <p className="text-2xl font-bold">{guestCount}</p>
                                  </div>
                                </div>
                              </Card>
                            </div>

                            <div className="flex items-center justify-between gap-4">
                              <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder="Search users..."
                                  value={adminSearchQuery}
                                  onChange={(e) => setAdminSearchQuery(e.target.value)}
                                  className="pl-10 border-2"
                                />
                              </div>
                              <Button onClick={fetchAdminProfiles} disabled={adminLoading}>
                                <RefreshCw className={`h-4 w-4 mr-2 ${adminLoading ? 'animate-spin' : ''}`} />
                                Refresh
                              </Button>
                            </div>

                            {adminLoading ? (
                              <div className="flex items-center justify-center py-12">
                                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                              </div>
                            ) : (
                              <div className="border-2 rounded-lg overflow-hidden">
                                <table className="w-full">
                                  <thead className="bg-slate-50 border-b-2">
                                    <tr>
                                      <th className="px-4 py-3 text-left text-sm font-semibold">User</th>
                                      <th className="px-4 py-3 text-left text-sm font-semibold">Email</th>
                                      <th className="px-4 py-3 text-center text-sm font-semibold">Role</th>
                                      <th className="px-4 py-3 text-center text-sm font-semibold">Premium</th>
                                      <th className="px-4 py-3 text-center text-sm font-semibold">Created</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filteredAdminProfiles.map((profile) => (
                                      <tr key={profile.id} className="border-b hover:bg-slate-50">
                                        <td className="px-4 py-3">
                                          <div className="font-medium">{profile.display_name || 'N/A'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-muted-foreground">{profile.email}</td>
                                        <td className="px-4 py-3 text-center">
                                          <Button
                                            variant={profile.role === 'admin' ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => handleAdminRoleToggle(profile)}
                                            disabled={adminUpdatingId === `${profile.id}-role`}
                                            className="min-w-[80px]"
                                          >
                                            {profile.role === 'admin' ? 'Admin' : 'User'}
                                          </Button>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <Switch
                                            checked={profile.is_premium}
                                            onCheckedChange={(checked) => handleAdminPremiumToggle(profile, checked)}
                                            disabled={adminUpdatingId === `${profile.id}-premium`}
                                          />
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                                          {new Date(profile.created_at).toLocaleDateString()}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {adminSection === "upload" && (
                          <div className="space-y-6">
                            <div>
                              <h2 className="text-2xl font-bold text-foreground mb-2">ETF Data Management</h2>
                              <p className="text-muted-foreground">Upload Excel files to update ETF information</p>
                            </div>

                            <Card className="p-6 border-2 bg-slate-50">
                              <div className="space-y-4">
                                <div>
                                  <Label htmlFor="dtr-file-input" className="text-base font-semibold">Upload DTR Excel File</Label>
                                  <p className="text-sm text-muted-foreground mt-1">Select an Excel file (.xlsx) containing ETF data</p>
                                </div>
                                <Input
                                  id="dtr-file-input"
                                  type="file"
                                  accept=".xlsx"
                                  className="border-2"
                                />
                                <Button className="w-full sm:w-auto">
                                  <Upload className="h-4 w-4 mr-2" />
                                  Upload and Process
                                </Button>
                              </div>
                            </Card>
                          </div>
                        )}
                      </Card>
                    ) : (
                    <Card className="p-2 sm:p-3 border-2 border-slate-200 flex-1 min-h-0 flex flex-col">
                      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3 flex-shrink-0">
                        <div className="flex flex-col gap-1">
                          <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                            Covered Call Option ETFs
                          </h3>
                          <span className="text-xs text-muted-foreground leading-tight">
                            Last updated:{" "}
                            {new Date().toLocaleDateString("en-US", {
                              month: "numeric",
                              day: "numeric",
                              year: "numeric",
                            })}{" "}
                            {new Date().toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            })}
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
                                  <Star className="h-3 w-3 mx-auto text-slate-400" />
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
                                      Std
                                      <br />
                                      Dev
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
                                    className="py-0.5 px-1 align-middle text-center sticky left-0 z-10 bg-white group-hover:bg-slate-100 border-r border-slate-200"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavorite(etf.symbol);
                                    }}
                                  >
                                    <Star
                                      className={`h-3.5 w-3.5 mx-auto cursor-pointer transition-colors ${
                                        favorites.has(etf.symbol)
                                          ? "fill-yellow-400 text-yellow-400"
                                          : "text-slate-300 hover:text-yellow-400"
                                      }`}
                                    />
                                  </td>
                                  <td
                                    className="py-0.5 px-1 align-middle sticky left-0 z-10 bg-white group-hover:bg-slate-100 border-r border-slate-200 font-bold text-primary transition-colors text-xs"
                                  >
                                    {etf.symbol}
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
                                  <td
                                    className="py-0.5 px-1 align-middle text-center tabular-nums text-xs text-foreground font-medium"
                                  >
                                    {etf.dividend.toFixed(4)}
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
                            onClick={applyRankings}
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

                {/* Only use UpgradeToPremiumModal for upgrade prompts */}
                  </div>
                </div>
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
