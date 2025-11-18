import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ETF } from "@/types/etf";
import { fetchDividendHistory, DividendHistoryPoint } from "@/services/etfData";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { ArrowUpDown, ChevronDown, ChevronUp, Info, Star, LineChart, X, Lock, Sliders } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { UpgradeToPremiumModal } from "./UpgradeToPremiumModal";
import { PremiumLockIcon } from "./PremiumLockIcon";

interface ETFTableProps {
  etfs: ETF[];
  onSelectionChange?: (symbol: string) => void;
  showRankingPanel?: boolean;
  onRankingClick?: () => void;
  viewMode?: "total" | "price";
  favorites?: Set<string>;
  onToggleFavorite?: (symbol: string) => void;
}

type SortField = keyof ETF | null;
type SortDirection = "asc" | "desc";

export const ETFTable = ({
  etfs,
  onSelectionChange,
  showRankingPanel = false,
  onRankingClick,
  viewMode = "total",
  favorites = new Set(),
  onToggleFavorite,
}: ETFTableProps) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [selectedSymbol, setSelectedSymbol] = useState<string>(
    etfs[0]?.symbol || ""
  );
  const [sortField, setSortField] = useState<SortField>("weightedRank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isExpanded, setIsExpanded] = useState(false);
  const [comparisonETFs, setComparisonETFs] = useState<string[]>([]);
  const [showDividendHistory, setShowDividendHistory] = useState(false);
  const [selectedETFForDividend, setSelectedETFForDividend] = useState<ETF | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  const isPremium = !!profile;
  const isGuest = !profile;

  useEffect(() => {
    setSortField("weightedRank");
    setSortDirection("asc");
  }, [viewMode, etfs]);

  const returnColumns: { key: keyof ETF; label: string }[] =
    viewMode === "total"
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

  const toggleFavorite = (symbol: string) => {
    if (!isPremium) {
      setShowUpgradeModal(true);
      return;
    }
    if (onToggleFavorite) {
      onToggleFavorite(symbol);
    }
  };

  const toggleComparison = (symbol: string) => {
    if (comparisonETFs.includes(symbol)) {
      setComparisonETFs(comparisonETFs.filter(s => s !== symbol));
    } else if (comparisonETFs.length < 5) {
      setComparisonETFs([...comparisonETFs, symbol]);
    }
  };

  const [dividendHistory, setDividendHistory] = useState<DividendHistoryPoint[]>([]);
  const [isDividendLoading, setIsDividendLoading] = useState(false);
  const [dividendError, setDividendError] = useState<string | null>(null);

  const handleDividendClick = (etf: ETF) => {
    setSelectedETFForDividend(etf);
    setShowDividendHistory(true);
    setDividendHistory([]);
    setDividendError(null);
    setIsDividendLoading(true);
    fetchDividendHistory(etf.symbol)
      .then((history) => {
        setDividendHistory(history);
      })
      .catch(() => {
        setDividendError("Dividend history is not available right now.");
      })
      .finally(() => {
        setIsDividendLoading(false);
      });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleSelectionChange = (symbol: string) => {
    setSelectedSymbol(symbol);
    onSelectionChange?.(symbol);
  };

  const sortedETFs = [...etfs].sort((a, b) => {
    if (!sortField) return 0;

    const aValue = a[sortField];
    const bValue = b[sortField];

    // Handle null/undefined values - push them to the end
    if (aValue === undefined || aValue === null) {
      if (bValue === undefined || bValue === null) return 0;
      return 1;
    }
    if (bValue === undefined || bValue === null) return -1;

    // Handle different data types properly
    let comparison: number;
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      comparison = aValue.localeCompare(bValue);
    } else if (typeof aValue === 'number' && typeof bValue === 'number') {
      comparison = aValue - bValue;
    } else {
      // Convert to string for mixed types or fallback
      comparison = String(aValue).localeCompare(String(bValue));
    }

    return sortDirection === "asc" ? comparison : -comparison;
  });

  const INITIAL_DISPLAY_COUNT = sortedETFs.length;
  const displayedETFs = isExpanded
    ? sortedETFs
    : sortedETFs.slice(0, INITIAL_DISPLAY_COUNT);
  const hasMore = false;

  const SortButton = ({
    field,
    children,
    align = "left",
  }: {
    field: SortField;
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

  return (
    <div className="rounded-xl border border-border/50 shadow-card bg-card overflow-hidden">
      <RadioGroup value={selectedSymbol} onValueChange={handleSelectionChange}>
        <div className="max-h-[calc(100vh-200px)] overflow-auto">
          <table className="w-full caption-bottom text-xs">
          <thead className="sticky top-0 z-50 bg-slate-50 shadow-sm border-b border-slate-200">
            <tr className="bg-slate-50">
              <th colSpan={14} className="h-7 px-1.5 text-center align-middle font-bold text-foreground bg-slate-100 text-sm border-r-2 border-slate-300">
                ETF DETAILS
              </th>
              <th colSpan={returnColumns.length} className="h-7 px-1.5 text-center align-middle font-bold text-foreground bg-slate-100 text-sm">
                {viewMode === "total" ? "TOTAL RETURNS" : "PRICE RETURNS"}
              </th>
            </tr>
            <tr className="bg-slate-50">
              <th className="h-7 px-1.5 text-center sticky left-0 z-30 bg-slate-50 border-r border-slate-200">
                <Star className="h-3 w-3 mx-auto text-slate-400" />
              </th>
              <th className="h-7 px-1.5 text-left sticky left-0 z-30 bg-slate-50 border-r border-slate-200 text-xs">
                <SortButton field="symbol">Symbol</SortButton>
              </th>
              <th className="h-7 px-1.5 text-left bg-slate-50 text-xs">
                <SortButton field="issuer">Issuer</SortButton>
              </th>
              <th className="h-7 px-1.5 text-left bg-slate-50 text-xs">
                <SortButton field="description">Description</SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="payDay">
                  <div className="whitespace-normal leading-tight">Pay<br/>Day</div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="ipoPrice">
                  <div className="whitespace-normal leading-tight">IPO<br/>Price</div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="price">Price</SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="priceChange">
                  <div className="whitespace-normal leading-tight">Price<br/>Chg</div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="dividend">Div</SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="numPayments"># Pmt</SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="annualDividend">
                  <div className="whitespace-normal leading-tight">Annual<br/>Div</div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="forwardYield">Yield</SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="standardDeviation">
                  <div className="whitespace-normal leading-tight">Dividend<br/>Volatility</div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs border-r-2 border-slate-300">
                {isGuest ? (
                  <button
                    onClick={() => setShowUpgradeModal(true)}
                    className="flex items-center justify-center gap-1.5 w-full hover:bg-slate-100 rounded px-2 py-1 transition-all duration-200 group"
                    title="Upgrade to Premium to access rankings"
                  >
                    <div className="p-0.5 rounded bg-gradient-to-br from-primary/10 to-accent/10 group-hover:from-primary/20 group-hover:to-accent/20 border border-primary/20 transition-all">
                      <Lock className="h-3 w-3 text-primary group-hover:text-accent transition-colors" />
                    </div>
                    <span className="font-semibold text-slate-600 group-hover:text-primary transition-colors">Rank</span>
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
                  className={`h-7 px-1.5 text-center align-middle font-bold text-foreground bg-slate-50 text-xs ${
                    index === returnColumns.length - 1 ? "border-r-2 border-slate-300" : ""
                  }`}
                >
                  <SortButton field={col.key}>
                    <span className="font-bold">{col.label}</span>
                  </SortButton>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedETFs.map((etf, index) => (
                <tr
                  key={`${etf.symbol}-${index}`}
                  className="border-b border-slate-200 transition-colors hover:bg-slate-100 group"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <td 
                    className="py-1 px-1.5 align-middle text-center sticky left-0 z-10 bg-white group-hover:bg-slate-100 border-r border-slate-200"
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
                    onClick={() => navigate(`/etf/${etf.symbol}`)}
                    className="py-1 px-1.5 align-middle sticky left-0 z-10 bg-white group-hover:bg-slate-100 border-r border-slate-200 font-bold text-primary group-hover:text-accent transition-colors text-xs cursor-pointer"
                  >
                    {etf.symbol}
                  </td>
                  <td className="py-1 px-1.5 align-middle text-xs text-muted-foreground uppercase font-medium">
                    {etf.issuer}
                  </td>
                  <td className="py-1 px-1.5 align-middle max-w-[120px] truncate text-xs text-muted-foreground">
                    {etf.description}
                  </td>
                  <td className="py-1 px-1.5 align-middle text-center text-xs text-muted-foreground">
                    {etf.payDay || "N/A"}
                  </td>
                  <td className={`py-1 px-1.5 align-middle text-center tabular-nums text-xs font-medium ${
                    etf.price > etf.ipoPrice ? 'bg-green-100 text-green-700' : ''
                  }`}>
                    ${etf.ipoPrice.toFixed(2)}
                  </td>
                  <td className="py-1 px-1.5 align-middle text-center tabular-nums text-xs font-medium text-foreground">
                    ${etf.price.toFixed(2)}
                  </td>
                  <td className={`py-1 px-1.5 align-middle text-center tabular-nums text-xs font-medium ${
                    etf.priceChange >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {etf.priceChange >= 0 ? '+' : ''}{etf.priceChange.toFixed(2)}
                  </td>
                  <td 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDividendClick(etf);
                    }}
                    className="py-1 px-1.5 align-middle text-center tabular-nums text-xs text-primary font-medium cursor-pointer hover:text-accent transition-colors hover:bg-slate-50 underline decoration-dotted"
                    title="Click to view dividend history"
                  >
                    {etf.dividend.toFixed(4)}
                  </td>
                  <td className="py-1 px-1.5 align-middle text-center tabular-nums text-xs text-muted-foreground">
                    {etf.numPayments}
                  </td>
                  <td className="py-1 px-1.5 align-middle text-center tabular-nums text-xs text-muted-foreground">
                    ${etf.annualDividend.toFixed(2)}
                  </td>
                  <td className="py-1 px-1.5 align-middle text-center font-bold tabular-nums text-primary text-xs">
                    {etf.forwardYield.toFixed(1)}%
                  </td>
                  <td className="py-1 px-1.5 align-middle text-center tabular-nums text-xs text-muted-foreground">
                    {etf.standardDeviation.toFixed(3)}
                  </td>
                  <td className="py-1 px-1.5 align-middle text-center font-bold text-sm tabular-nums border-r-2 border-slate-300">
                    {isGuest ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowUpgradeModal(true);
                        }}
                        className="flex items-center justify-center w-full group"
                        title="Upgrade to Premium to see rankings"
                      >
                        <div className="p-0.5 rounded bg-gradient-to-br from-primary/10 to-accent/10 group-hover:from-primary/20 group-hover:to-accent/20 border border-primary/20 group-hover:border-primary/40 transition-all duration-200">
                          <Lock className="h-3 w-3 text-primary group-hover:text-accent transition-colors" />
                        </div>
                      </button>
                    ) : (
                      <span className="text-primary">{etf.weightedRank !== null ? etf.weightedRank : '-'}</span>
                    )}
                  </td>
                  {returnColumns.map((col, colIndex) => {
                    const rawValue = etf[col.key];
                    const numericValue =
                      typeof rawValue === "number" ? rawValue : undefined;
                    const valueClass =
                      numericValue === undefined
                        ? "text-muted-foreground"
                        : numericValue >= 0
                        ? "text-green-600"
                        : "text-red-600";
                    return (
                      <td
                        key={`${etf.symbol}-${String(col.key)}`}
                        className={`py-1 px-1.5 align-middle text-center font-bold tabular-nums text-xs ${valueClass} ${
                          colIndex === returnColumns.length - 1
                            ? "border-r-2 border-slate-300"
                            : ""
                        }`}
                      >
                        {numericValue !== undefined
                          ? `${numericValue > 0 ? "+" : ""}${numericValue.toFixed(1)}%`
                          : "N/A"}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
          </table>
        </div>
      </RadioGroup>
      {hasMore && (
        <div className="flex justify-center py-4 border-t bg-muted/30">
          <Button
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="hover:bg-slate-100 hover:text-foreground transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4 mr-2" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-2" />
                Show More ({sortedETFs.length - INITIAL_DISPLAY_COUNT} more)
              </>
            )}
          </Button>
        </div>
      )}

      {showDividendHistory && selectedETFForDividend && (
        <div
          className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4"
          onClick={() => setShowDividendHistory(false)}
        >
          <Card
            className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-foreground">
                    {selectedETFForDividend.symbol} Dividend History
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedETFForDividend.name}
                  </p>
                </div>
                <button
                  onClick={() => setShowDividendHistory(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-6 min-h-[320px] flex items-center justify-center">
                {isDividendLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Loading dividend history...
                  </p>
                ) : dividendError ? (
                  <p className="text-sm text-red-600">{dividendError}</p>
                ) : dividendHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No dividend history is available for this symbol.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={dividendHistory}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f1f5f9"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        stroke="#94a3b8"
                        fontSize={11}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `$${value.toFixed(4)}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(255, 255, 255, 0.98)",
                          border: "none",
                          borderRadius: "12px",
                          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                          padding: "12px 16px",
                        }}
                        formatter={(value: number) => [
                          `$${value.toFixed(4)}`,
                          "Dividend",
                        ]}
                        labelStyle={{
                          color: "#64748b",
                          fontSize: "12px",
                          marginBottom: "4px",
                        }}
                      />
                      <Bar
                        dataKey="dividend"
                        fill="#3b82f6"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="border-2 border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-slate-100 border-b-2 border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-foreground">
                          Payment Date
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-foreground">
                          Dividend Per Share
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dividendHistory.map((item, index) => (
                        <tr
                          key={index}
                          className="border-b border-slate-200 hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {item.date}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-foreground text-right tabular-nums">
                            ${item.dividend.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  onClick={() => setShowDividendHistory(false)}
                  variant="outline"
                  className="border-2"
                >
                  Close
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <UpgradeToPremiumModal 
        open={showUpgradeModal} 
        onOpenChange={setShowUpgradeModal} 
      />
    </div>
  );
};
