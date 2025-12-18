import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { NavLink } from "./NavLink";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { SearchDropdown } from "./SearchDropdown";
import {
  Menu,
  X,
  User,
  LogIn,
  LogOut,
  ChevronDown,
  Star,
  BarChart3,
  LayoutGrid,
  FileText,
  Mail,
  CreditCard,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "./ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";

export const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, signOut, loading } = useAuth();
  const isAuthenticated = !!user;
  const displayName =
    profile?.display_name ||
    user?.user_metadata?.display_name ||
    (user?.email ? user.email.split("@")[0] : "Guest");
  const roleDisplay = profile?.role === 'admin' ? 'Admin' : (profile ? 'Premium' : 'Guest');

  const go = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const logout = async () => {
    await signOut();
    navigate("/login");
    setMobileMenuOpen(false);
  };

  const getCurrentCategory = (): string => {
    if (location.pathname.startsWith("/cef")) {
      return "Closed-End Funds";
    }
    return "Covered Call Option ETFs";
  };

  return (
    <header className="sticky top-0 z-[100] w-full border-b bg-background/95 backdrop-blur-md shadow-sm">
      <div className="w-full px-6 sm:px-8 lg:px-12">
        <div className="flex h-20 items-center justify-between gap-6">
          <NavLink
            to="/"
            className="group flex-shrink-0 transition-transform hover:scale-[1.02]"
          >
            <Logo />
          </NavLink>

          {/* Center Search Bar - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-6">
            <SearchDropdown />
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-2">
            {/* Categories Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="px-4 py-2 text-sm font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-md flex items-center gap-1"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>Categories</span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground uppercase font-semibold">
                  Investment Categories
                </DropdownMenuLabel>
                <DropdownMenuItem 
                  className="cursor-pointer"
                  onClick={() => go("/")}
                >
                  <span className={location.pathname === "/" || location.pathname.startsWith("/etf/") ? "font-semibold text-primary" : ""}>
                    Covered Call Option ETFs
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="cursor-pointer"
                  onClick={() => go("/cef")}
                >
                  <span className={location.pathname.startsWith("/cef") ? "font-semibold text-primary" : ""}>
                    Closed-End Funds
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* My Focus */}
            <Button
              variant="ghost"
              className="px-4 py-2 text-sm font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-md"
              onClick={() => go("/focus")}
            >
              My Focus
            </Button>

            {/* Resources Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="px-4 py-2 text-sm font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-md flex items-center gap-1"
                >
                  <FileText className="w-4 h-4" />
                  <span>Resources</span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground uppercase font-semibold">
                  Information & Help
                </DropdownMenuLabel>
                <DropdownMenuItem 
                  className="cursor-pointer"
                  onClick={() => go("/covered-call-etfs")}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  <span>Covered Call Option ETFs</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="cursor-pointer"
                  onClick={() => go("/resources")}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  <span>Resources</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="cursor-pointer"
                  onClick={() => go("/contact")}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  <span>Contact Us</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Plans */}
            <Button
              variant="ghost"
              className="px-4 py-2 text-sm font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-md"
              onClick={() => go("/plans")}
            >
              <CreditCard className="w-4 h-4 mr-1.5" />
              Plans
            </Button>

            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="px-3 py-2 h-auto text-sm font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-md border border-transparent hover:border-slate-200"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-foreground">Account</span>
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem className="cursor-pointer bg-slate-50" onClick={() => go("/profile")}>
                    <User className="w-4 h-4 mr-2 text-primary" />
                    <div className="flex flex-col">
                      <span className="font-medium">{loading ? "Loading..." : displayName}</span>
                      <span className="text-xs text-muted-foreground">{roleDisplay}</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer" onClick={() => go("/dashboard")}>
                    <BarChart3 className="w-4 h-4 mr-2 text-primary" />
                    <span>Dashboard</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer" onClick={() => go("/favorites")}>
                    <Star className="w-4 h-4 mr-2 text-yellow-500" />
                    <span>Favorites</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer" onClick={logout}>
                    <LogOut className="w-4 h-4 mr-2 text-primary" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="default"
                className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-white transition-colors rounded-md"
                onClick={() => go("/login")}
              >
                <LogIn className="w-4 h-4 mr-2" />
                Login / Register
              </Button>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-10 w-10 hover:bg-slate-100 transition-colors text-foreground rounded-lg"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6 text-foreground" />
            ) : (
              <Menu className="h-6 w-6 text-foreground" />
            )}
          </Button>
        </div>

        {/* Mobile Search - Hidden on landscape orientation */}
        <div className="md:hidden pb-4 landscape:hidden">
          <SearchDropdown />
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background">
          <nav className="w-full px-6 flex flex-col py-2">
            <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
              Categories
            </div>
            <Button
              variant="ghost"
              className={`justify-start px-4 py-3 text-base font-semibold hover:bg-slate-100 rounded-md ${
                location.pathname === "/" || location.pathname.startsWith("/etf/")
                  ? "text-primary bg-primary/5"
                  : "text-foreground"
              }`}
              onClick={() => go("/")}
            >
              Covered Call Option ETFs
            </Button>
            <Button
              variant="ghost"
              className={`justify-start px-4 py-3 text-base font-semibold hover:bg-slate-100 rounded-md ${
                location.pathname.startsWith("/cef")
                  ? "text-primary bg-primary/5"
                  : "text-foreground"
              }`}
              onClick={() => go("/cef")}
            >
              Closed-End Funds
            </Button>
            
            <div className="border-t my-2"></div>
            
            <Button
              variant="ghost"
              className="justify-start px-4 py-3 text-base font-semibold text-foreground hover:bg-slate-100 rounded-md"
              onClick={() => go("/focus")}
            >
              My Focus
            </Button>
            <Button
              variant="ghost"
              className="justify-start px-4 py-3 text-base font-semibold text-foreground hover:bg-slate-100 rounded-md"
              onClick={() => go("/resources")}
            >
              Resources
            </Button>
            <Button
              variant="ghost"
              className="justify-start px-4 py-3 text-base font-semibold text-foreground hover:bg-slate-100 rounded-md"
              onClick={() => go("/contact")}
            >
              Contact Us
            </Button>
            <Button
              variant="ghost"
              className="justify-start px-4 py-3 text-base font-semibold text-foreground hover:bg-slate-100 rounded-md"
              onClick={() => go("/plans")}
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Plans
            </Button>
            {isAuthenticated ? (
              <div className="px-4 py-2.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-start px-0 text-base font-semibold text-foreground hover:bg-slate-100 hover:text-foreground"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <User className="w-4 h-4 text-white" />
                        </div>
                        <span>Account</span>
                        <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem className="cursor-pointer bg-slate-50" onClick={() => go("/profile")}>
                      <User className="w-4 h-4 mr-2 text-primary" />
                      <div className="flex flex-col">
                        <span className="font-medium">{loading ? "Loading..." : displayName}</span>
                        <span className="text-xs text-muted-foreground">{roleDisplay}</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer" onClick={() => go("/dashboard")}>
                      <BarChart3 className="w-4 h-4 mr-2 text-primary" />
                      <span>Dashboard</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer" onClick={() => go("/favorites")}>
                      <Star className="w-4 h-4 mr-2 text-yellow-500" />
                      <span>Favorites</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer" onClick={logout}>
                      <LogOut className="w-4 h-4 mr-2 text-primary" />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <Button
                variant="default"
                className="mx-4 my-2 justify-start px-4 py-3 text-base font-semibold bg-primary hover:bg-primary/90 text-white rounded-md"
                onClick={() => go("/login")}
              >
                <LogIn className="w-4 h-4 mr-2" />
                Login / Register
              </Button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};
