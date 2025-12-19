import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, TrendingUp, FileText, BookOpen, X, Building2 } from "lucide-react";
import { Input } from "./ui/input";
import { fetchETFData } from "@/services/etfData";
import { fetchCEFData } from "@/services/cefData";
import { ETF } from "@/types/etf";
import { CEF } from "@/types/cef";

export const SearchDropdown = () => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [etfList, setEtfList] = useState<ETF[]>([]);
  const [cefList, setCefList] = useState<CEF[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const searchRef = useRef<HTMLDivElement>(null);

  const pages = [
    { name: "Our Focus", path: "/our-focus", icon: FileText },
    { name: "Resources", path: "/resources", icon: BookOpen },
  ];

  // Load ETF and CEF data on mount
  useEffect(() => {
    fetchETFData().then(setEtfList).catch(console.error);
    fetchCEFData().then(setCefList).catch(console.error);
  }, []);

  const filteredETFs = etfList.filter((etf) =>
    etf.symbol.toLowerCase().includes(query.toLowerCase()) ||
    (etf.name && etf.name.toLowerCase().includes(query.toLowerCase()))
  ).slice(0, 6);

  const filteredCEFs = cefList.filter((cef) => {
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
  }).slice(0, 6);

  const filteredPages = pages.filter((page) =>
    page.name.toLowerCase().includes(query.toLowerCase())
  );

  const hasResults = filteredETFs.length > 0 || filteredCEFs.length > 0 || filteredPages.length > 0;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (path: string) => {
    navigate(path);
    setQuery("");
    setIsOpen(false);
  };

  const handleETFSelect = (symbol: string) => {
    const isHomePage = location.pathname === "/";
    const isDashboard = location.pathname === "/dashboard";
    
    if (isHomePage || isDashboard) {
      const etfRow = document.getElementById(`etf-row-${symbol}`);
      
      if (etfRow) {
        setQuery("");
        setIsOpen(false);
        
        setTimeout(() => {
          etfRow.scrollIntoView({ 
            behavior: "smooth", 
            block: "center",
            inline: "nearest" 
          });
          
          etfRow.classList.add("animate-pulse");
          etfRow.style.backgroundColor = "rgba(59, 130, 246, 0.15)";
          
          setTimeout(() => {
            etfRow.classList.remove("animate-pulse");
            etfRow.style.backgroundColor = "";
          }, 2000);
        }, 100);
      } else {
        navigate(`/etf/${symbol}`);
        setQuery("");
        setIsOpen(false);
      }
    } else {
      navigate(`/etf/${symbol}`);
      setQuery("");
      setIsOpen(false);
    }
  };

  const handleCEFSelect = (symbol: string) => {
    const isCEFPage = location.pathname === "/cef";
    
    if (isCEFPage) {
      // Try to find the CEF row in the table
      const cefRow = document.querySelector(`[data-cef-symbol="${symbol}"]`) as HTMLElement;
      
      if (cefRow) {
        setQuery("");
        setIsOpen(false);
        
        setTimeout(() => {
          cefRow.scrollIntoView({ 
            behavior: "smooth", 
            block: "center",
            inline: "nearest" 
          });
          
          cefRow.classList.add("animate-pulse");
          cefRow.style.backgroundColor = "rgba(59, 130, 246, 0.15)";
          
          setTimeout(() => {
            cefRow.classList.remove("animate-pulse");
            cefRow.style.backgroundColor = "";
          }, 2000);
        }, 100);
      } else {
        navigate(`/cef/${symbol}`);
        setQuery("");
        setIsOpen(false);
      }
    } else {
      // Navigate to CEF page first, then scroll
      navigate(`/cef`);
      setQuery("");
      setIsOpen(false);
      
      // Wait for page to load, then scroll to row
      setTimeout(() => {
        const cefRow = document.querySelector(`[data-cef-symbol="${symbol}"]`) as HTMLElement;
        if (cefRow) {
          cefRow.scrollIntoView({ 
            behavior: "smooth", 
            block: "center",
            inline: "nearest" 
          });
          
          cefRow.classList.add("animate-pulse");
          cefRow.style.backgroundColor = "rgba(59, 130, 246, 0.15)";
          
          setTimeout(() => {
            cefRow.classList.remove("animate-pulse");
            cefRow.style.backgroundColor = "";
          }, 2000);
        }
      }, 500);
    }
  };

  return (
    <div ref={searchRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground pointer-events-none z-10" />
        <Input
          type="text"
          placeholder="Search ETFs & CEFs..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="pl-12 sm:pl-14 pr-10 sm:pr-12 h-12 sm:h-14 bg-muted/50 border-2 border-border/50 focus:bg-background focus:border-primary/50 text-base sm:text-lg rounded-xl [&::-webkit-search-cancel-button]:hidden transition-all"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setIsOpen(false);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        )}
      </div>

      {isOpen && query && (
        <div className="absolute top-full mt-2 w-full bg-background border-2 border-border rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in-0 slide-in-from-top-2 duration-200">
            {hasResults ? (
              <div className="max-h-[70vh] sm:max-h-96 overflow-y-auto">
                {filteredETFs.length > 0 && (
                  <div>
                    <div className="px-4 sm:px-5 py-3 text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30 sticky top-0">
                      ETFs
                    </div>
                    {filteredETFs.map((etf) => (
                      <button
                        key={etf.symbol}
                        onClick={() => handleETFSelect(etf.symbol)}
                        className="w-full px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left border-b border-slate-100 last:border-0"
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-base sm:text-lg text-foreground">{etf.symbol}</div>
                          <div className="text-sm sm:text-base text-muted-foreground truncate">{etf.name}</div>
                        </div>
                        <div className="text-right text-sm sm:text-base flex-shrink-0">
                          <div className="font-bold text-foreground">${etf.price.toFixed(2)}</div>
                          <div className={`font-semibold ${etf.totalReturn1Mo && etf.totalReturn1Mo >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {etf.totalReturn1Mo ? `${etf.totalReturn1Mo > 0 ? "+" : ""}${etf.totalReturn1Mo.toFixed(2)}%` : "N/A"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {filteredCEFs.length > 0 && (
                  <div>
                    <div className={`px-4 sm:px-5 py-3 text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30 ${filteredETFs.length > 0 ? 'border-t' : ''} sticky top-0`}>
                      CEFs
                    </div>
                    {filteredCEFs.map((cef) => (
                      <button
                        key={cef.symbol}
                        onClick={() => handleCEFSelect(cef.symbol)}
                        className="w-full px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left border-b border-slate-100 last:border-0"
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-base sm:text-lg text-foreground">{cef.symbol}</div>
                          <div className="text-sm sm:text-base text-muted-foreground truncate">{cef.name || cef.description || "N/A"}</div>
                        </div>
                        <div className="text-right text-sm sm:text-base flex-shrink-0">
                          <div className="font-bold text-foreground">${cef.marketPrice?.toFixed(2) || cef.nav?.toFixed(2) || "N/A"}</div>
                          <div className={`font-semibold ${cef.forwardYield != null && cef.forwardYield >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {cef.forwardYield != null ? `${cef.forwardYield.toFixed(2)}%` : "N/A"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {filteredPages.length > 0 && (
                  <div>
                    <div className="px-4 sm:px-5 py-3 text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30 border-t sticky top-0">
                      Pages
                    </div>
                    {filteredPages.map((page) => {
                      const Icon = page.icon;
                      return (
                        <button
                          key={page.path}
                          onClick={() => handleSelect(page.path)}
                          className="w-full px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left border-b border-slate-100 last:border-0"
                        >
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                          </div>
                          <div className="font-semibold text-base sm:text-lg text-foreground">{page.name}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 sm:px-6 py-8 sm:py-12 text-center text-base sm:text-lg text-muted-foreground">
                No results found for "{query}"
              </div>
            )}
        </div>
      )}
    </div>
  );
};

