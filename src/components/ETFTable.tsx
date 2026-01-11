import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ETF } from "@/types/etf";
import { ArrowUpDown, Info, Star, LineChart, X, Lock, Sliders } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
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
  onSymbolClick?: (symbol: string) => void;
  onDividendClick?: (symbol: string) => void;
}

type SortField = keyof ETF | null;
type SortDirection = "asc" | "desc";

const SortButton = ({
  field,
  children,
  align = "left",
  sortField,
  sortDirection,
  onSort,
}: {
  field: SortField;
  children: React.ReactNode;
  align?: "left" | "right";
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}) => {
  const isActive = sortField === field;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`h-8 hover:bg-slate-100 hover:text-foreground transition-colors ${align === "left" ? "-ml-3" : "-mr-3"} ${isActive ? "font-semibold" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSort(field);
      }}
    >
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  );
};

export const ETFTable = ({
  etfs,
  onSelectionChange,
  showRankingPanel = false,
  onRankingClick,
  viewMode = "total",
  favorites = new Set(),
  onToggleFavorite,
  onSymbolClick,
  onDividendClick,
}: ETFTableProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const [pinnedSymbol, setPinnedSymbol] = useState<string | null>(null);
  const lastHighlightedElRef = useRef<HTMLElement | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>(
    etfs[0]?.symbol || ""
  );
  const [sortField, setSortField] = useState<SortField>("weightedRank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [comparisonETFs, setComparisonETFs] = useState<string[]>([]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const isPremium = !!profile;
  const isGuest = !profile;

  // Total Return WITH DRIP columns (using adjClose ratio method)
  // Price Return columns (using unadjusted close prices)
  const returnColumns: { key: keyof ETF; label: string }[] =
    viewMode === "total"
      ? [
        { key: "trDrip3Yr", label: "3 Yr" },
        { key: "trDrip12Mo", label: "12 Mo" },
        { key: "trDrip6Mo", label: "6 Mo" },
        { key: "trDrip3Mo", label: "3 Mo" },
        { key: "trDrip1Mo", label: "1 Mo" },
        { key: "trDrip1Wk", label: "1 Wk" },
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

  const handleSort = useCallback((field: SortField) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortDirection((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevField;
      } else {
        setSortDirection("desc");
        return field;
      }
    });
  }, []);

  const handleSelectionChange = (symbol: string) => {
    setSelectedSymbol(symbol);
    onSelectionChange?.(symbol);
  };

  // Consume ?highlight=SYMBOL, pin that symbol to the top (until refresh), scroll to top-left, and highlight it.
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const highlight = urlParams.get("highlight")?.toUpperCase() || null;
    if (!highlight) return;

    setPinnedSymbol(highlight);

    // Remove the param immediately so refresh clears the behavior naturally.
    navigate(location.pathname, { replace: true });

    // Defer until after render so the row exists.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = document.getElementById("etf-table-scroll");
        if (container) {
          container.scrollTop = 0;
          container.scrollLeft = 0;
        }

        // Clear previous highlight if any
        if (lastHighlightedElRef.current) {
          lastHighlightedElRef.current.style.backgroundColor = "";
          lastHighlightedElRef.current.style.outline = "";
          lastHighlightedElRef.current.style.outlineOffset = "";
        }

        const row = document.getElementById(`etf-row-${highlight}`) as HTMLElement | null;
        if (row) {
          row.style.backgroundColor = "rgba(59, 130, 246, 0.15)";
          row.style.outline = "2px solid rgba(59, 130, 246, 0.35)";
          row.style.outlineOffset = "-2px";
          lastHighlightedElRef.current = row;
        }

        // Ensure the user sees the sticky left columns
        if (container) container.scrollLeft = 0;
      });
    });
  }, [location.search, location.pathname, navigate]);

  const sortedETFs = useMemo(() => {
    console.log('[ETFTable] Sorting by:', sortField, sortDirection, 'ETFs count:', etfs.length);

    const normalizeText = (v: unknown) =>
      String(v ?? "")
        .replace(/\u00A0/g, " ") // NBSP
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    // If no sort field is selected and no highlight, return the ranked order (default by weightedRank asc)
    if (!sortField && !pinnedSymbol) {
      console.log('[ETFTable] No sort field, returning unsorted etfs');
      return etfs;
    }

    // Create a stable sorted array - use symbol as secondary sort to ensure stability
    let sorted = [...etfs];
    
    // If pinned symbol is set, bring it to top (sticky until refresh)
    if (pinnedSymbol) {
      const highlightedIndex = sorted.findIndex(e => e.symbol.toUpperCase() === pinnedSymbol);
      if (highlightedIndex >= 0) {
        const highlighted = sorted.splice(highlightedIndex, 1)[0];
        sorted = [highlighted, ...sorted];
      }
      // If we're highlighting and have a sort field, sort the rest normally but keep highlighted at top
      if (sortField && sortField !== 'symbol') {
        const [highlighted, ...rest] = sorted;
        rest.sort((a, b) => {
          // Use existing sort logic for the rest
          const aValue = a[sortField];
          const bValue = b[sortField];

          if (aValue === undefined || aValue === null) {
            if (bValue === undefined || bValue === null) {
              return a.symbol.localeCompare(b.symbol);
            }
            return 1;
          }
          if (bValue === undefined || bValue === null) return -1;

          const parseNumeric = (val: any): number | null => {
            if (typeof val === 'number') {
              return isNaN(val) ? null : val;
            }
            if (typeof val === 'string') {
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
          const textFields: (keyof ETF)[] = ['symbol', 'issuer', 'description', 'payDay', 'dataSource'];
          const forceString = textFields.includes(sortField);

          let comparison: number = 0;
          if (bothNumeric && !forceString) {
            comparison = aNum - bNum;
          } else {
            const aStr = String(aValue).toLowerCase();
            const bStr = String(bValue).toLowerCase();
            comparison = aStr.localeCompare(bStr);
          }

          if (comparison !== 0) {
            return sortDirection === "asc" ? comparison : -comparison;
          }
          return a.symbol.localeCompare(b.symbol);
        });
        sorted = [highlighted, ...rest];
      }
      console.log('[ETFTable] Pinned symbol:', pinnedSymbol, '- brought to top');
      return sorted;
    }

    // Normal sorting when no highlight (but sortField is set)
    if (!sortField) {
      return sorted; // Should not reach here due to early return, but safety check
    }
    
    sorted = sorted.sort((a, b) => {
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

      let comparison: number = 0;

      // Special case: issuer sorts by rank (weightedRank) instead of alphabetically
      if (sortField === "issuer") {
        const aRank = a.weightedRank ?? Infinity;
        const bRank = b.weightedRank ?? Infinity;
        comparison = aRank - bRank;
      } else {
        // If the sort field is explicitly a text field, prefer string sort
        // unless parsing was requested. Ideally, we distinguish by column type.
        // But here, let's assume if it PARSES as a number, we treat it as a number 
        // UNLESS the field is 'symbol', 'description'.
        const textFields: (keyof ETF)[] = ['symbol', 'description', 'payDay', 'dataSource'];
        const forceString = textFields.includes(sortField);

        if (bothNumeric && !forceString) {
          comparison = aNum - bNum;
        } else {
          // Fallback to string comparison
          const aStr = normalizeText(aValue);
          const bStr = normalizeText(bValue);
          comparison = aStr.localeCompare(bStr);
        }
      }

      if (comparison !== 0) {
        return sortDirection === "asc" ? comparison : -comparison;
      }
      // If values are equal, sort by symbol for stability
      return a.symbol.localeCompare(b.symbol);
    });

    console.log('[ETFTable] Sorted ETFs - first 3:', sorted.slice(0, 3).map(e => ({ symbol: e.symbol, [sortField]: e[sortField] })));
    return sorted;
  }, [etfs, sortField, sortDirection, pinnedSymbol]);



  return (
    <div className="rounded-lg sm:rounded-xl border-2 border-border/50 shadow-card bg-card overflow-hidden">
      <div id="etf-table-scroll" className="max-h-[calc(100vh-150px)] sm:max-h-[calc(100vh-200px)] overflow-x-auto overflow-y-scroll touch-auto">
        <table className="w-full caption-bottom text-xs min-w-max">
          <thead className="sticky top-0 z-50 bg-slate-50 shadow-sm border-b-2 border-slate-200">
            <tr className="bg-slate-50">
              <th colSpan={13} className="h-7 px-1.5 text-center align-middle font-bold text-foreground bg-slate-100 text-sm border-r-2 border-slate-300">
                ETF DETAILS
              </th>
              <th colSpan={returnColumns.length} className="h-8 px-1.5 text-center align-middle font-bold bg-primary/10 text-primary text-sm">
                TOTAL RETURNS (DRIP)
              </th>
            </tr>
            <tr className="bg-slate-50">
              <th className="h-7 px-1.5 text-center sticky left-0 z-30 bg-slate-50 border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                <Tooltip delayDuration={200}>
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
                </Tooltip>
              </th>
              <th className="h-7 px-1.5 sm:px-2 text-left sticky left-[28px] z-30 bg-slate-50 border-r border-slate-200 text-xs shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] min-w-[70px] sm:min-w-[80px]">
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div>
                      <SortButton field="symbol" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                        <span className="font-bold">Symbol</span>
                      </SortButton>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={8}
                    className="bg-slate-900 text-white text-xs px-3 py-2 border-slate-700 shadow-lg"
                  >
                    <p>Click to see charts</p>
                  </TooltipContent>
                </Tooltip>
              </th>
              <th className="h-7 px-1.5 text-left bg-slate-50 text-xs min-w-[60px] sm:min-w-[70px] max-w-[70px] sm:max-w-[80px]">
                <SortButton field="issuer" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Issuer</SortButton>
              </th>
              <th className="h-7 px-1.5 text-left bg-slate-50 text-xs min-w-[180px] sm:min-w-[220px] max-w-[250px] sm:max-w-[300px]">
                <SortButton field="description" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Description</SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="payDay" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                  <div className="whitespace-normal leading-tight">Pay<br />Day</div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="price" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Price</SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="priceChange" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                  <div className="whitespace-normal leading-tight">Price<br />Chg</div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div>
                      <SortButton field="dividend" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                        <span className="font-bold">Div</span>
                      </SortButton>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={8}
                    className="bg-slate-900 text-white text-xs px-3 py-2 border-slate-700 shadow-lg"
                  >
                    <p>Click to see div history</p>
                  </TooltipContent>
                </Tooltip>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="numPayments" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}># Pmt</SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="annualDividend" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                  <div className="whitespace-normal leading-tight">Annual<br />Div</div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton field="forwardYield" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}><span className="font-bold">Yield</span></SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div>
                      <SortButton field="dividendCVPercent" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                        DVI
                      </SortButton>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={8}
                    className="bg-slate-900 text-white text-xs px-3 py-2 border-slate-700 shadow-lg max-w-[300px]"
                  >
                    <p>Dividend Volatility Index is computed using the Coefficient of Variation (CV) with Adjusted Dividends that have been annualized to normalize for frequency changes</p>
                  </TooltipContent>
                </Tooltip>
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
                  <SortButton field="weightedRank" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    Rank
                  </SortButton>
                )}
              </th>
              {returnColumns.map((col, index) => (
                <th
                  key={col.key as string}
                  className={`h-7 px-1.5 text-center align-middle font-bold text-foreground bg-slate-50 text-xs ${index === returnColumns.length - 1 ? "border-r-2 border-slate-300" : ""
                    }`}
                >
                  <SortButton field={col.key} sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    <span className="font-bold">{col.label}</span>
                  </SortButton>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedETFs.map((etf, index) => {
              const prev = index > 0 ? sortedETFs[index - 1] : null;
              const normalizeIssuer = (v: unknown) =>
                String(v ?? "")
                  .replace(/\u00A0/g, " ") // NBSP
                  .replace(/\s+/g, " ")
                  .trim()
                  .toLowerCase();
              const issuerChanged =
                sortField === "issuer" &&
                prev &&
                normalizeIssuer(prev.issuer) !== normalizeIssuer(etf.issuer);

              return (
              <tr
                key={etf.symbol}
                id={`etf-row-${etf.symbol}`}
                data-etf-symbol={etf.symbol}
                className={`border-b border-slate-200 transition-all hover:bg-slate-100 group ${issuerChanged ? "border-t-4 border-slate-300" : ""}`}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <td
                  className="py-1 px-1.5 align-middle text-center sticky left-0 z-10 bg-white border-r border-slate-200 transition-all cursor-pointer shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(etf.symbol);
                  }}
                  title="Click to add to Favorites"
                >
                  <Star
                    className={`h-4 w-4 mx-auto cursor-pointer transition-all ${favorites.has(etf.symbol)
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-slate-500 hover:text-yellow-500 hover:scale-110"
                      }`}
                  />
                </td>
                <td
                  data-symbol-cell
                  className="py-1 px-1.5 sm:px-2 align-middle sticky left-[28px] z-10 bg-white border-r border-slate-200 text-primary text-xs transition-all shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] min-w-[70px] sm:min-w-[80px]"
                >
                  <button
                    onClick={() => {
                      if (onSymbolClick) {
                        onSymbolClick(etf.symbol);
                      } else {
                        navigate(`/etf/${etf.symbol}`);
                      }
                    }}
                    className="hover:underline hover:text-primary/80 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 rounded px-1 whitespace-nowrap font-bold"
                  >
                    {etf.symbol}
                  </button>
                </td>
                <td className="py-1 px-1.5 sm:px-2 align-middle text-xs text-muted-foreground uppercase font-medium whitespace-nowrap min-w-[60px] sm:min-w-[70px] max-w-[70px] sm:max-w-[80px] truncate">
                  {etf.issuer}
                </td>
                <td className="py-1 px-1.5 sm:px-2 align-middle max-w-[150px] sm:max-w-[180px] truncate text-xs text-muted-foreground min-w-[120px] sm:min-w-[140px]">
                  {etf.description}
                </td>
                <td className="py-1 px-1.5 align-middle text-center text-xs text-muted-foreground">
                  {etf.payDay || "N/A"}
                </td>
                <td className="py-1 px-1.5 align-middle text-center tabular-nums text-xs font-bold text-foreground">
                  ${etf.price.toFixed(2)}
                </td>
                <td className={`py-1 px-1.5 align-middle text-center tabular-nums text-xs font-bold ${etf.priceChange != null && etf.priceChange >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                  {etf.priceChange != null ? `${etf.priceChange >= 0 ? '+' : ''}${etf.priceChange.toFixed(2)}` : 'N/A'}
                </td>
                <td className="py-1 px-1.5 align-middle text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onDividendClick) {
                        onDividendClick(etf.symbol);
                      } else {
                        navigate(`/etf/${etf.symbol}/dividends`);
                      }
                    }}
                    className="tabular-nums text-sm text-primary font-bold hover:underline cursor-pointer transition-colors"
                    title="Click to view dividend history"
                  >
                    {etf.dividend != null ? etf.dividend.toFixed(4) : 'N/A'}
                  </button>
                </td>
                <td className="py-1 px-1.5 align-middle text-center tabular-nums text-xs font-bold text-muted-foreground">
                  {etf.numPayments}
                </td>
                <td className="py-1 px-1.5 align-middle text-center tabular-nums text-xs font-bold text-muted-foreground">
                  {(() => {
                    // Calculate Annual Div = Div × #Pmt to ensure accuracy
                    const calculatedAnnualDiv = etf.dividend && etf.numPayments
                      ? etf.dividend * etf.numPayments
                      : null;
                    // Use calculated value if available, fallback to database value
                    const annualDiv = calculatedAnnualDiv ?? etf.annualDividend;
                    return annualDiv != null && annualDiv > 0
                      ? `$${annualDiv.toFixed(2)}`
                      : 'N/A';
                  })()}
                </td>
                <td className="py-1 px-1.5 align-middle text-center font-bold tabular-nums text-primary text-sm">
                  {etf.forwardYield != null ? `${etf.forwardYield.toFixed(1)}%` : 'N/A'}
                </td>
                <td className="py-1 px-1.5 align-middle text-center tabular-nums text-xs font-bold text-muted-foreground">
                  {etf.dividendCVPercent != null ? `${etf.dividendCVPercent.toFixed(1)}%` : (etf.dividendCV != null ? `${(etf.dividendCV * 100).toFixed(1)}%` : 'N/A')}
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
                      className={`py-1.5 px-1.5 sm:px-2 align-middle text-center font-bold tabular-nums text-xs sm:text-sm ${valueClass} whitespace-nowrap min-w-[65px] sm:min-w-[75px] ${colIndex === returnColumns.length - 1
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
              );
            })}
          </tbody>
        </table>
      </div>

      <UpgradeToPremiumModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
      />
    </div>
  );
};
