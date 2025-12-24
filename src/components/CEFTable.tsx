import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CEF } from "@/types/cef";
import { ArrowUpDown, Info, Star, Lock } from "lucide-react";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { UpgradeToPremiumModal } from "./UpgradeToPremiumModal";

interface CEFTableProps {
  cefs: CEF[];
  onSelectionChange?: (symbol: string) => void;
  favorites?: Set<string>;
  onToggleFavorite?: (symbol: string) => void;
}

type SortField = keyof CEF | null;
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
      className={`h-8 hover:bg-slate-100 hover:text-foreground transition-colors ${align === "left" ? "-ml-3" : "-mr-3"
        } ${isActive ? "font-semibold" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSort(field);
      }}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown
          className={`h-3 w-3 ${isActive ? "text-primary" : "text-slate-400"}`}
        />
      </div>
    </Button>
  );
};

export const CEFTable = ({
  cefs,
  onSelectionChange,
  favorites = new Set(),
  onToggleFavorite,
}: CEFTableProps) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isGuest = !profile;
  const [sortField, setSortField] = useState<SortField>("weightedRank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleSort = useCallback((field: SortField) => {
    if (field === null) return;
    setSortField((prevField) => {
      if (prevField === field) {
        setSortDirection((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return field;
      }
      setSortDirection("asc");
      return field;
    });
  }, []);

  const returnColumns = [
    { key: "return15Yr" as keyof CEF, label: "15 YR" },
    { key: "return10Yr" as keyof CEF, label: "10 YR" },
    { key: "return5Yr" as keyof CEF, label: "5 YR" },
    { key: "return3Yr" as keyof CEF, label: "3 YR" },
    { key: "return12Mo" as keyof CEF, label: "12 Mo" },
    { key: "return6Mo" as keyof CEF, label: "6 Mo" },
    { key: "return3Mo" as keyof CEF, label: "3 Mo" },
    { key: "return1Mo" as keyof CEF, label: "1 Mo" },
    { key: "return1Wk" as keyof CEF, label: "1 Wk" },
  ];

  const sortedCEFs = useMemo(() => {
    if (!sortField) return cefs;

    const sorted = [...cefs].sort(
      (a, b) => {
        const aValue = a[sortField];
        const bValue = b[sortField];

        const parseNumeric = (val: any): number | null => {
          if (val === null || val === undefined || val === "") return null;
          if (typeof val === "number") return val;
          const parsed = parseFloat(String(val));
          return isNaN(parsed) ? null : parsed;
        };

        const aNum = parseNumeric(aValue);
        const bNum = parseNumeric(bValue);

        const bothNumeric = aNum !== null && bNum !== null;

        const textFields: (keyof CEF)[] = [
          "symbol",
          "issuer",
          "description",
          "navSymbol",
          "openDate",
          "dividendHistory",
        ];
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
      },
      [cefs, sortField, sortDirection]
    );

    return sorted;
  }, [cefs, sortField, sortDirection]);

  const formatPercentage = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return "N/A";
    // Value is already a percentage (e.g., 11.15 from ((mp/nav)-1)*100)
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  const formatCurrency = (
    value: number | null | undefined,
    decimals: number = 2
  ): string => {
    if (value === null || value === undefined) return "N/A";
    return `$${value.toFixed(decimals)}`;
  };

  return (
    <div className="rounded-lg sm:rounded-xl border-2 border-border/50 shadow-card bg-card overflow-hidden">
      <div className="max-h-[calc(100vh-150px)] sm:max-h-[calc(100vh-200px)] overflow-x-auto overflow-y-scroll touch-auto">
        <table className="w-full caption-bottom text-xs min-w-max">
          <thead className="sticky top-0 z-50 bg-slate-50 shadow-sm border-b-2 border-slate-200">
            <tr className="bg-slate-50">
              <th
                colSpan={20}
                className="h-7 px-1.5 text-center align-middle font-bold text-foreground bg-slate-100 text-sm border-r-2 border-slate-300"
              >
                CEF DETAILS
              </th>
              <th
                colSpan={returnColumns.length}
                className="h-8 px-1.5 text-center align-middle font-bold bg-primary/10 text-primary text-sm"
              >
                TOTAL RETURNS
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
                    <p className="text-center">
                      Click the star icon to add CEFs to your favorites
                    </p>
                  </TooltipContent>
                </Tooltip>
              </th>
              <th className="h-7 px-1.5 sm:px-2 text-left sticky left-[28px] z-30 bg-slate-50 border-r border-slate-200 text-xs shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] min-w-[70px] sm:min-w-[80px]">
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div>
                      <SortButton
                        field="symbol"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      >
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
              <th className="h-7 px-1.5 text-left bg-slate-50 text-xs">
                <SortButton
                  field="navSymbol"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  NAV
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-left bg-slate-50 text-xs">
                <SortButton
                  field="description"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Description
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton
                  field="openDate"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  OPEN
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton
                  field="dividendHistory"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  <div className="whitespace-normal leading-tight">
                    DIV
                    <br />
                    HISTO
                  </div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton
                  field="ipoPrice"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  <div className="whitespace-normal leading-tight">
                    IPO
                    <br />
                    Price
                  </div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton
                  field="marketPrice"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  MP
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton
                  field="nav"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  NAV
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div>
                      <SortButton
                        field="lastDividend"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      >
                        <div className="whitespace-normal leading-tight">
                          Last
                          <br />
                          <span className="font-bold">Div</span>
                        </div>
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
                <SortButton
                  field="numPayments"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  #
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton
                  field="yearlyDividend"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  <div className="whitespace-normal leading-tight">
                    Yrly
                    <br />
                    Div
                  </div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton
                  field="forwardYield"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  <div className="whitespace-normal leading-tight">
                    F<br />
                    Yield
                  </div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton
                  field="premiumDiscount"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  <div className="whitespace-normal leading-tight">
                    Prem/
                    <br />
                    Disc
                  </div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton
                  field="fiveYearZScore"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  <div className="whitespace-normal leading-tight">
                    5 Yr
                    <br />
                    Z-Score
                  </div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton
                  field="navTrend6M"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  <div className="whitespace-normal leading-tight">
                    6 Mo
                    <br />
                    NAV Trend
                  </div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <SortButton
                  field="navTrend12M"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  <div className="whitespace-normal leading-tight">
                    12 Mo
                    <br />
                    NAV Trend
                  </div>
                </SortButton>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div>
                      <SortButton
                        field="signal"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      >
                        Signal
                      </SortButton>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={8}
                    className="bg-slate-900 text-white text-xs px-3 py-2 border-slate-700 shadow-lg max-w-[350px]"
                  >
                    <p className="font-semibold mb-2">
                      Signal Rating (-2 to +3):
                    </p>
                    <ul className="space-y-1 text-left">
                      <li>
                        <span className="font-bold text-green-400">+3:</span>{" "}
                        Optimal - Deeply undervalued with perfect health
                      </li>
                      <li>
                        <span className="font-bold text-green-400">+2:</span>{" "}
                        Good Value - Cheap with positive momentum
                      </li>
                      <li>
                        <span className="font-bold text-blue-400">+1:</span>{" "}
                        Healthy - Growing assets, fair price
                      </li>
                      <li>
                        <span className="font-bold text-gray-400">0:</span>{" "}
                        Neutral - No clear signal
                      </li>
                      <li>
                        <span className="font-bold text-orange-400">-1:</span>{" "}
                        Value Trap - Looks cheap but shrinking
                      </li>
                      <li>
                        <span className="font-bold text-red-400">-2:</span>{" "}
                        Overvalued - Statistically expensive
                      </li>
                    </ul>
                    <p className="mt-2 text-xs text-slate-300">
                      N/A = Insufficient history (&lt;2 years)
                    </p>
                  </TooltipContent>
                </Tooltip>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs">
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div>
                      <SortButton
                        field="dividendCVPercent"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      >
                        DVI
                      </SortButton>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={8}
                    className="bg-slate-900 text-white text-xs px-3 py-2 border-slate-700 shadow-lg max-w-[300px]"
                  >
                    <p>
                      Dividend Volatility Index is computed using the
                      Coefficient of Variation (CV) with Adjusted Dividends
                    </p>
                  </TooltipContent>
                </Tooltip>
              </th>
              <th className="h-7 px-1.5 text-center bg-slate-50 text-xs border-r-2 border-slate-300">
                <SortButton
                  field="weightedRank"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Rank
                </SortButton>
              </th>
              {returnColumns.map((col) => (
                <th
                  key={col.key}
                  className="h-7 px-1.5 text-center bg-slate-50 text-xs"
                >
                  <SortButton
                    field={col.key}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    {col.label}
                  </SortButton>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedCEFs.map((cef) => (
              <tr
                key={cef.symbol}
                data-cef-symbol={cef.symbol}
                className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                onClick={() => {
                  onSelectionChange?.(cef.symbol);
                  navigate(`/cef/${cef.symbol}`);
                }}
              >
                <td className="py-1 px-1.5 align-middle text-center sticky left-0 z-10 bg-white border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite?.(cef.symbol);
                    }}
                    className="flex items-center justify-center w-full"
                    title="Click to add to Favorites"
                  >
                    <Star
                      className={`h-4 w-4 mx-auto cursor-pointer transition-all ${favorites.has(cef.symbol)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-slate-500 hover:text-yellow-500 hover:scale-110"
                        }`}
                    />
                  </button>
                </td>
                <td className="py-1 px-1.5 sm:px-2 align-middle sticky left-[28px] z-10 bg-white border-r border-slate-200 text-primary text-xs transition-all shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] min-w-[70px] sm:min-w-[80px]">
                  <button
                    onClick={() => navigate(`/cef/${cef.symbol}`)}
                    className="hover:underline hover:text-primary/80 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 rounded px-1 whitespace-nowrap font-bold"
                  >
                    {cef.symbol}
                  </button>
                </td>
                <td className="py-1 px-1.5 align-middle text-xs text-muted-foreground uppercase font-medium whitespace-nowrap">
                  {cef.navSymbol || "N/A"}
                </td>
                <td className="py-1 px-1.5 align-middle max-w-[120px] sm:max-w-[150px] truncate text-xs text-muted-foreground">
                  {cef.description || "N/A"}
                </td>
                <td className="py-1 px-1.5 align-middle text-center text-xs text-muted-foreground">
                  {cef.openDate || "N/A"}
                </td>
                <td className="py-1 px-1.5 align-middle text-center text-xs text-muted-foreground font-medium">
                  {cef.dividendHistory || "N/A"}
                </td>
                <td
                  className={`py-1 px-1.5 align-middle text-center tabular-nums text-xs font-medium ${cef.ipoPrice &&
                      cef.marketPrice &&
                      cef.marketPrice > cef.ipoPrice
                      ? "bg-green-100 text-green-700"
                      : ""
                    }`}
                >
                  {cef.ipoPrice != null ? formatCurrency(cef.ipoPrice) : "N/A"}
                </td>
                <td className="py-1 px-1.5 align-middle text-center tabular-nums text-xs font-medium text-foreground">
                  {cef.marketPrice != null
                    ? formatCurrency(cef.marketPrice)
                    : "N/A"}
                </td>
                <td className="py-1 px-1.5 align-middle text-center tabular-nums text-xs font-medium text-foreground">
                  {cef.nav != null ? formatCurrency(cef.nav) : "N/A"}
                </td>
                <td className="py-1 px-1.5 align-middle text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/cef/${cef.symbol}/dividends`);
                    }}
                    className="tabular-nums text-xs text-primary font-medium hover:underline cursor-pointer transition-colors"
                    title="Click to view dividend history"
                  >
                    {cef.lastDividend != null
                      ? cef.lastDividend.toFixed(4)
                      : "N/A"}
                  </button>
                </td>
                <td className="py-1 px-1.5 align-middle text-center tabular-nums text-xs text-muted-foreground">
                  {cef.numPayments || "N/A"}
                </td>
                <td className="py-1 px-1.5 align-middle text-center tabular-nums text-xs text-muted-foreground">
                  {cef.yearlyDividend != null
                    ? formatCurrency(cef.yearlyDividend)
                    : "N/A"}
                </td>
                <td className="py-1 px-1.5 align-middle text-center font-bold tabular-nums text-primary text-xs">
                  {cef.forwardYield != null
                    ? `${cef.forwardYield.toFixed(1)}%`
                    : "N/A"}
                </td>
                <td
                  className={`py-1 px-1.5 align-middle text-center tabular-nums text-xs font-medium ${cef.premiumDiscount != null && cef.premiumDiscount >= 0
                      ? "text-green-600"
                      : "text-red-600"
                    }`}
                >
                  {cef.premiumDiscount != null
                    ? formatPercentage(cef.premiumDiscount)
                    : "N/A"}
                </td>
                <td
                  className={`py-1 px-1.5 align-middle text-center tabular-nums text-xs font-medium ${cef.fiveYearZScore != null && cef.fiveYearZScore >= 0
                      ? "text-green-600"
                      : "text-red-600"
                    }`}
                >
                  {cef.fiveYearZScore != null
                    ? cef.fiveYearZScore.toFixed(2)
                    : "N/A"}
                </td>
                <td
                  className={`py-1 px-1.5 align-middle text-center tabular-nums text-xs font-medium ${cef.navTrend6M != null && cef.navTrend6M >= 0
                      ? "text-green-600"
                      : "text-red-600"
                    }`}
                >
                  {cef.navTrend6M != null
                    ? formatPercentage(cef.navTrend6M)
                    : "N/A"}
                </td>
                <td
                  className={`py-1 px-1.5 align-middle text-center tabular-nums text-xs font-medium ${cef.navTrend12M != null && cef.navTrend12M >= 0
                      ? "text-green-600"
                      : "text-red-600"
                    }`}
                >
                  {cef.navTrend12M != null
                    ? formatPercentage(cef.navTrend12M)
                    : "N/A"}
                </td>
                <td className="py-1 px-1.5 align-middle text-center tabular-nums text-xs font-bold">
                  {cef.signal != null ? (
                    <span
                      className={
                        cef.signal === 3
                          ? "text-green-700 bg-green-50 px-2 py-0.5 rounded"
                          : cef.signal === 2
                            ? "text-green-600 bg-green-50/50 px-2 py-0.5 rounded"
                            : cef.signal === 1
                              ? "text-blue-600"
                              : cef.signal === 0
                                ? "text-gray-500"
                                : cef.signal === -1
                                  ? "text-orange-600"
                                  : "text-red-600"
                      }
                    >
                      {cef.signal > 0 ? `+${cef.signal}` : cef.signal}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">N/A</span>
                  )}
                </td>
                <td className="py-1 px-1.5 align-middle text-center tabular-nums text-xs text-muted-foreground">
                  {cef.dividendCVPercent != null
                    ? `${cef.dividendCVPercent.toFixed(1)}%`
                    : cef.dividendCV != null
                      ? `${(cef.dividendCV * 100).toFixed(1)}%`
                      : "N/A"}
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
                    <span className="text-primary">
                      {cef.weightedRank !== null ? cef.weightedRank : "-"}
                    </span>
                  )}
                </td>
                {returnColumns.map((col, colIndex) => {
                  const rawValue = cef[col.key];
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
                      key={`${cef.symbol}-${String(col.key)}`}
                      className={`py-1.5 px-1.5 sm:px-2 align-middle text-center font-bold tabular-nums text-xs sm:text-sm ${valueClass} whitespace-nowrap min-w-[60px] sm:min-w-[70px] ${colIndex === returnColumns.length - 1
                          ? "border-r-2 border-slate-300"
                          : ""
                        }`}
                    >
                      {numericValue !== undefined
                        ? `${numericValue > 0 ? "+" : ""}${numericValue.toFixed(
                          1
                        )}%`
                        : "N/A"}
                    </td>
                  );
                })}
              </tr>
            ))}
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
