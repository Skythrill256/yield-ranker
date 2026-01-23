import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, TrendingUp, FileText, BookOpen, X, Building2 } from "lucide-react";
import { Input } from "./ui/input";
import { fetchETFData } from "@/services/etfData";
import { fetchCEFData } from "@/services/cefData";
import { ETF } from "@/types/etf";
import { CEF } from "@/types/cef";
import { useCategory } from "@/utils/category";

export const SearchDropdown = () => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [etfList, setEtfList] = useState<ETF[]>([]);
  const [cefList, setCefList] = useState<CEF[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const currentCategory = useCategory();
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInteractingRef = useRef(false);

  const pages = [
    { name: "Our Focus", path: "/our-focus", icon: FileText },
    { name: "Resources", path: "/resources", icon: BookOpen },
  ];

  // Load ETF and CEF data on mount
  useEffect(() => {
    fetchETFData().then(setEtfList).catch(console.error);
    fetchCEFData().then(setCefList).catch(console.error);
  }, []);

  // Filter based on selected category - only show results for the current category
  const filteredETFs = currentCategory === "cc"
    ? etfList.filter((etf) =>
      etf.symbol.toLowerCase().includes(query.toLowerCase()) ||
      (etf.name && etf.name.toLowerCase().includes(query.toLowerCase()))
    ).slice(0, 6)
    : [];

  const filteredCEFs = currentCategory === "cef"
    ? cefList.filter((cef) => {
      const queryLower = query.toLowerCase();
      const symbolMatch = cef.symbol.toLowerCase().includes(queryLower);
      const nameMatch = cef.name?.toLowerCase().includes(queryLower);
      const descriptionMatch = cef.description?.toLowerCase().includes(queryLower);
      const issuerMatch = cef.issuer?.toLowerCase().includes(queryLower);

      // Special handling for "covered call" and related searches
      const queryHasCoveredCallTerms = queryLower.includes("covered call") ||
        queryLower.includes("coveredcall") ||
        queryLower.includes("cc option") ||
        (queryLower.includes("cc") && queryLower.includes("option")) ||
        queryLower.includes("option");

      const descriptionHasCoveredCallTerms = cef.description?.toLowerCase().includes("covered call") ||
        cef.description?.toLowerCase().includes("coveredcall") ||
        cef.description?.toLowerCase().includes("cc") ||
        cef.description?.toLowerCase().includes("option");

      const coveredCallMatch = queryHasCoveredCallTerms && descriptionHasCoveredCallTerms;

      return symbolMatch || nameMatch || descriptionMatch || issuerMatch || coveredCallMatch;
    }).slice(0, 6)
    : [];

  const filteredPages = pages.filter((page) =>
    page.name.toLowerCase().includes(query.toLowerCase())
  );

  const hasResults = filteredETFs.length > 0 || filteredCEFs.length > 0 || filteredPages.length > 0;

  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      // Don't close if currently interacting with input
      if (isInteractingRef.current) {
        return;
      }

      const target = event.target as Node;

      // Don't close if clicking inside the search component
      if (searchRef.current && searchRef.current.contains(target)) {
        return;
      }

      // Only close if dropdown is open and has query
      if (isOpen && query) {
        // Small delay to allow result clicks to register first
        setTimeout(() => {
          if (!isInteractingRef.current) {
            setIsOpen(false);
          }
        }, 150);
      }
    };

    // Use mousedown for desktop and touchend for mobile
    // Avoid touchstart as it conflicts with input focus on Samsung devices
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchend", handleClickOutside, { passive: true });
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchend", handleClickOutside);
    };
  }, [isOpen, query]);

  const handleSelect = (path: string) => {
    navigate(path);
    setQuery("");
    setIsOpen(false);
  };

  const handleETFSelect = (symbol: string) => {
    const pathname = location.pathname;
    const isHomePage = pathname === "/";
    const isDashboard = pathname === "/dashboard";
    const isCoveredCallPage = pathname === "/covered-call-etfs";

    // Check if on ETF dividend history page (must check first to prioritize)
    const isETFDividendPage = /^\/etf\/[^/]+\/dividends$/.test(pathname);

    // Check if on ETF detail page (total return chart)
    const isETFDetailPage = /^\/etf\/[^/]+$/.test(pathname) && !pathname.includes("/dividends");

    // If on dividend history page, stay on dividend history page with new symbol
    if (isETFDividendPage) {
      navigate(`/etf/${symbol}/dividends`);
      setQuery("");
      setIsOpen(false);
      return;
    }

    // If on total return chart page, stay on total return chart page with new symbol
    if (isETFDetailPage) {
      navigate(`/etf/${symbol}`);
      setQuery("");
      setIsOpen(false);
      return;
    }

    if (isHomePage || isDashboard || isCoveredCallPage) {
      // The table component will consume this param, pin the row to the top, scroll to top-left, and highlight.
      navigate(`${pathname}?highlight=${symbol}`, { replace: true });
      setQuery("");
      setIsOpen(false);
    } else {
      navigate(`/etf/${symbol}`);
      setQuery("");
      setIsOpen(false);
    }
  };

  const handleCEFSelect = (symbol: string) => {
    const pathname = location.pathname;
    const isCEFPage = pathname === "/cef";

    // Check if on CEF dividend history page (must check first to prioritize)
    const isCEFDividendPage = /^\/cef\/[^/]+\/dividends$/.test(pathname);

    // Check if on CEF detail page (total return chart / price/NAV chart)
    const isCEFDetailPage = /^\/cef\/[^/]+$/.test(pathname) && !pathname.includes("/dividends");

    // If on dividend history page, stay on dividend history page with new symbol
    if (isCEFDividendPage) {
      navigate(`/cef/${symbol}/dividends`);
      setQuery("");
      setIsOpen(false);
      return;
    }

    // If on price/NAV chart page, stay on price/NAV chart page with new symbol
    if (isCEFDetailPage) {
      navigate(`/cef/${symbol}`);
      setQuery("");
      setIsOpen(false);
      return;
    }

    if (isCEFPage) {
      // Let the CEF table consume ?highlight=SYMBOL, pin to top, scroll to top-left, and highlight until refresh
      navigate(`${pathname}?highlight=${symbol}`, { replace: true });
      setQuery("");
      setIsOpen(false);
    } else {
      // Navigate to CEF page first, then scroll
      navigate(`/cef?highlight=${symbol}`);
      setQuery("");
      setIsOpen(false);
    }
  };

  return (
    <div ref={searchRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground pointer-events-none z-10" />
        <Input
          ref={inputRef}
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          placeholder={currentCategory === "cef" ? "Search CEFs..." : "Search ETFs..."}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            isInteractingRef.current = true;
            setIsOpen(true);
            // Release interaction lock after focus is established
            setTimeout(() => {
              isInteractingRef.current = false;
            }, 300);
          }}
          onBlur={() => {
            // Delay blur to allow result selection
            setTimeout(() => {
              isInteractingRef.current = false;
              // Don't auto-close on blur to avoid Samsung keyboard issues
            }, 300);
          }}
          onTouchStart={() => {
            isInteractingRef.current = true;
          }}
          onTouchEnd={() => {
            // Release interaction lock after touch completes
            setTimeout(() => {
              isInteractingRef.current = false;
            }, 300);
          }}
          className="pl-12 sm:pl-14 pr-10 sm:pr-12 h-12 sm:h-14 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 focus:bg-white dark:focus:bg-slate-900 focus:border-primary focus:ring-2 focus:ring-primary/20 text-base sm:text-lg leading-[1.5] rounded-xl [&::-webkit-search-cancel-button]:hidden transition-all duration-200 touch-manipulation shadow-sm hover:shadow-md"
          style={{
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
            color: '#1e293b',
            caretColor: '#1e293b'
          }}
        />
        {query && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setQuery("");
              setIsOpen(false);
            }}
            onTouchStart={() => {
              isInteractingRef.current = true;
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-muted-foreground hover:text-foreground hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200 touch-manipulation"
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            aria-label="Clear search"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        )}
      </div>

      {isOpen && query && (
        <div className="absolute top-full mt-3 w-full min-w-[320px] sm:min-w-[400px] md:min-w-[480px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-700/80 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden z-50 animate-in fade-in-0 slide-in-from-top-3 duration-300">
          {hasResults ? (
            <div className="max-h-[70vh] sm:max-h-[420px] overflow-y-auto scrollbar-thin">
              {filteredETFs.length > 0 && (
                <div>
                  <div className="px-5 py-3 text-xs font-bold text-primary uppercase tracking-wider bg-gradient-to-r from-primary/5 to-transparent sticky top-0 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5" />
                    ETFs
                  </div>
                  {filteredETFs.map((etf, index) => (
                    <button
                      key={etf.symbol}
                      onClick={(e) => {
                        e.preventDefault();
                        handleETFSelect(etf.symbol);
                      }}
                      onTouchStart={() => {
                        isInteractingRef.current = true;
                      }}
                      className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gradient-to-r hover:from-primary/5 hover:to-transparent active:bg-primary/10 transition-all duration-200 text-left border-b border-slate-100/80 dark:border-slate-800/80 last:border-0 touch-manipulation group"
                      style={{
                        touchAction: 'manipulation',
                        WebkitTapHighlightColor: 'rgba(0,0,0,0.1)',
                        animationDelay: `${index * 50}ms`
                      }}
                    >
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200 shadow-sm">
                        <TrendingUp className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">{etf.symbol}</div>
                        <div className="text-sm text-muted-foreground line-clamp-1">{etf.name}</div>
                      </div>
                      <div className="text-right flex-shrink-0 pl-3">
                        <div className="font-bold text-base text-foreground">${etf.price.toFixed(2)}</div>
                        <div className={`text-sm font-semibold ${etf.totalReturn1Mo && etf.totalReturn1Mo >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {etf.totalReturn1Mo ? `${etf.totalReturn1Mo > 0 ? "+" : ""}${etf.totalReturn1Mo.toFixed(2)}%` : "N/A"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {filteredCEFs.length > 0 && (
                <div>
                  <div className={`px-5 py-3 text-xs font-bold text-accent uppercase tracking-wider bg-gradient-to-r from-accent/5 to-transparent ${filteredETFs.length > 0 ? 'border-t border-slate-200/80 dark:border-slate-700/80' : ''} sticky top-0 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 flex items-center gap-2`}>
                    <Building2 className="w-3.5 h-3.5" />
                    CEFs
                  </div>
                  {filteredCEFs.map((cef, index) => (
                    <button
                      key={cef.symbol}
                      onClick={(e) => {
                        e.preventDefault();
                        handleCEFSelect(cef.symbol);
                      }}
                      onTouchStart={() => {
                        isInteractingRef.current = true;
                      }}
                      className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gradient-to-r hover:from-accent/5 hover:to-transparent active:bg-accent/10 transition-all duration-200 text-left border-b border-slate-100/80 dark:border-slate-800/80 last:border-0 touch-manipulation group"
                      style={{
                        touchAction: 'manipulation',
                        WebkitTapHighlightColor: 'rgba(0,0,0,0.1)',
                        animationDelay: `${index * 50}ms`
                      }}
                    >
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200 shadow-sm">
                        <Building2 className="w-6 h-6 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-lg text-foreground group-hover:text-accent transition-colors">{cef.symbol}</div>
                        <div className="text-sm text-muted-foreground line-clamp-1">{cef.name || cef.description || "N/A"}</div>
                      </div>
                      <div className="text-right flex-shrink-0 pl-3">
                        <div className="font-bold text-base text-foreground">${cef.marketPrice?.toFixed(2) || cef.nav?.toFixed(2) || "N/A"}</div>
                        <div className={`text-sm font-semibold ${cef.forwardYield != null && cef.forwardYield >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {cef.forwardYield != null ? `${cef.forwardYield.toFixed(2)}%` : "N/A"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {filteredPages.length > 0 && (
                <div>
                  <div className="px-5 py-3 text-xs font-bold text-blue-600 uppercase tracking-wider bg-gradient-to-r from-blue-500/5 to-transparent border-t border-slate-200/80 dark:border-slate-700/80 sticky top-0 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    Pages
                  </div>
                  {filteredPages.map((page, index) => {
                    const Icon = page.icon;
                    return (
                      <button
                        key={page.path}
                        onClick={(e) => {
                          e.preventDefault();
                          handleSelect(page.path);
                        }}
                        onTouchStart={() => {
                          isInteractingRef.current = true;
                        }}
                        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gradient-to-r hover:from-blue-500/5 hover:to-transparent active:bg-blue-500/10 transition-all duration-200 text-left border-b border-slate-100/80 dark:border-slate-800/80 last:border-0 touch-manipulation group"
                        style={{
                          touchAction: 'manipulation',
                          WebkitTapHighlightColor: 'rgba(0,0,0,0.1)',
                          animationDelay: `${index * 50}ms`
                        }}
                      >
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200 shadow-sm">
                          <Icon className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="font-semibold text-lg text-foreground group-hover:text-blue-600 transition-colors">{page.name}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium text-foreground mb-1">No results found</p>
              <p className="text-sm text-muted-foreground">Try searching for "{query}" with different keywords</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

