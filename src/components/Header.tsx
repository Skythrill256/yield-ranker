import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { NavLink } from "./NavLink";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { SearchDropdown } from "./SearchDropdown";
import { CategorySelector } from "./CategorySelector";
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
import { useCategory } from "@/utils/category";

export const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, signOut, loading } = useAuth();
  const currentCategory = useCategory();
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

  // Context-aware navbar based on selected category
  // When CEF is selected: show "Closed End Funds"
  // When CC is selected: show "Covered Call Option ETFs"
  const docsButton = currentCategory === "cef"
    ? { label: "Closed End Funds", path: "/closed-end-funds" }
    : { label: "Covered Call Option ETFs", path: "/covered-call-etfs" };

  // Logo should navigate to the appropriate table based on selected category
  const logoPath = currentCategory === "cef" ? "/cef" : "/";

  return (
    <header className="sticky top-0 z-[100] w-full border-b-2 bg-background/95 backdrop-blur-md shadow-md">
      <div className="w-full px-4 sm:px-6 md:px-8 lg:px-12">
        <div className="flex h-20 sm:h-22 md:h-24 items-center justify-between gap-4 sm:gap-6">
          <NavLink
            to={logoPath}
            className="group flex-shrink-0 transition-transform hover:scale-[1.02]"
          >
            <Logo />
          </NavLink>

          {/* Center Search Bar - Desktop */}
          <div className="hidden md:flex flex-1 max-w-2xl mx-4 lg:mx-8">
            <SearchDropdown />
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {/* Filter Dropdown - CEFs and CC ETFs */}
            <CategorySelector />

            {/* Docs button - Shows same category as Filter, links to its documentation page */}
            <Button
              variant="ghost"
              className="px-3 lg:px-4 py-2 text-sm lg:text-base font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-lg"
              onClick={() => go(docsButton.path)}
            >
              {docsButton.label}
            </Button>

            {/* My Focus */}
            <Button
              variant="ghost"
              className="px-3 lg:px-4 py-2 text-sm lg:text-base font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-lg"
              onClick={() => go("/focus")}
            >
              <Star className="w-4 h-4 lg:w-5 lg:h-5 mr-1.5 lg:mr-2" />
              My Focus
            </Button>

            {/* Resources - Content adjusts based on selected category */}
            <Button
              variant="ghost"
              className="px-3 lg:px-4 py-2 text-sm lg:text-base font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-lg"
              onClick={() => go(currentCategory === "cef" ? "/resources-cef" : "/resources-cc")}
            >
              <FileText className="w-4 h-4 lg:w-5 lg:h-5 mr-1.5 lg:mr-2" />
              Resources
            </Button>

            {/* Newsletters - Premium users only */}
            {isAuthenticated && (profile?.is_premium || user?.user_metadata?.is_premium) && (
              <Button
                variant="ghost"
                className="px-3 lg:px-4 py-2 text-sm lg:text-base font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-lg"
                onClick={() => go("/newsletters")}
              >
                <Mail className="w-4 h-4 lg:w-5 lg:h-5 mr-1.5 lg:mr-2" />
                Newsletters
              </Button>
            )}

            {/* Plans */}
            <Button
              variant="ghost"
              className="px-3 lg:px-4 py-2 text-sm lg:text-base font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-lg"
              onClick={() => go("/plans")}
            >
              <CreditCard className="w-4 h-4 lg:w-5 lg:h-5 mr-1.5 lg:mr-2" />
              Plans
            </Button>

            {/* Contact Us */}
            <Button
              variant="ghost"
              className="px-3 lg:px-4 py-2 text-sm lg:text-base font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-lg"
              onClick={() => go("/contact")}
            >
              <Mail className="w-4 h-4 lg:w-5 lg:h-5 mr-1.5 lg:mr-2" />
              Contact Us
            </Button>

            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="px-3 lg:px-4 py-2 h-auto text-sm lg:text-base font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-lg border border-transparent hover:border-slate-200"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
                      </div>
                      <span className="text-foreground">Account</span>
                      <ChevronDown className="w-4 h-4 lg:w-5 lg:h-5 text-muted-foreground" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem className="cursor-pointer bg-slate-50 py-3" onClick={() => go("/profile")}>
                    <User className="w-5 h-5 mr-3 text-primary" />
                    <div className="flex flex-col">
                      <span className="font-semibold text-base">{loading ? "Loading..." : displayName}</span>
                      <span className="text-sm text-muted-foreground">{roleDisplay}</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer py-3" onClick={() => go("/dashboard")}>
                    <BarChart3 className="w-5 h-5 mr-3 text-primary" />
                    <span className="text-base">Dashboard</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer py-3" onClick={logout}>
                    <LogOut className="w-5 h-5 mr-3 text-primary" />
                    <span className="text-base">Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="default"
                className="px-4 lg:px-5 py-2.5 text-sm lg:text-base font-semibold bg-primary hover:bg-primary/90 text-white transition-colors rounded-lg shadow-sm"
                onClick={() => go("/login")}
              >
                <LogIn className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />
                Login / Register
              </Button>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-12 w-12 hover:bg-slate-100 transition-colors text-foreground rounded-lg"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-8 w-8 text-foreground" />
            ) : (
              <Menu className="h-8 w-8 text-foreground" />
            )}
          </Button>
        </div>

        {/* Mobile Search - Hidden on landscape orientation */}
        <div className="md:hidden pb-4 sm:pb-5 landscape:hidden">
          <SearchDropdown />
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t-2 bg-background shadow-lg">
          <nav className="w-full px-4 sm:px-6 flex flex-col py-3 space-y-1">
            {/* Filter Dropdown - CEFs and CC ETFs */}
            <div className="px-4 py-3">
              <CategorySelector />
            </div>

            <div className="border-t-2 my-2"></div>

            <Button
              variant="ghost"
              className="justify-start px-4 py-4 text-base sm:text-lg font-semibold text-foreground hover:bg-slate-100 rounded-lg"
              onClick={() => go("/focus")}
            >
              <Star className="w-5 h-5 mr-3" />
              My Focus
            </Button>
            <Button
              variant="ghost"
              className="justify-start px-4 py-4 text-base sm:text-lg font-semibold text-foreground hover:bg-slate-100 rounded-lg"
              onClick={() => go(docsButton.path)}
            >
              <FileText className="w-5 h-5 mr-3" />
              {docsButton.label}
            </Button>
            <Button
              variant="ghost"
              className="justify-start px-4 py-4 text-base sm:text-lg font-semibold text-foreground hover:bg-slate-100 rounded-lg"
              onClick={() => go(currentCategory === "cef" ? "/resources-cef" : "/resources-cc")}
            >
              <FileText className="w-5 h-5 mr-3" />
              Resources
            </Button>
            {isAuthenticated && (profile?.is_premium || user?.user_metadata?.is_premium) && (
              <Button
                variant="ghost"
                className="justify-start px-4 py-4 text-base sm:text-lg font-semibold text-foreground hover:bg-slate-100 rounded-lg"
                onClick={() => go("/newsletters")}
              >
                <Mail className="w-5 h-5 mr-3" />
                Newsletters
              </Button>
            )}
            <Button
              variant="ghost"
              className="justify-start px-4 py-4 text-base sm:text-lg font-semibold text-foreground hover:bg-slate-100 rounded-lg"
              onClick={() => go("/contact")}
            >
              <Mail className="w-5 h-5 mr-3" />
              Contact Us
            </Button>
            <Button
              variant="ghost"
              className="justify-start px-4 py-4 text-base sm:text-lg font-semibold text-foreground hover:bg-slate-100 rounded-lg"
              onClick={() => go("/plans")}
            >
              <CreditCard className="w-5 h-5 mr-3" />
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
                    <DropdownMenuItem className="cursor-pointer" onClick={logout}>
                      <LogOut className="w-4 h-4 mr-2 text-primary" />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <div className="px-4 py-3">
                <Button
                  variant="default"
                  className="w-full px-4 py-4 text-base sm:text-lg font-bold bg-primary hover:bg-primary/90 text-white transition-colors rounded-lg shadow-md"
                  onClick={() => go("/login")}
                >
                  <LogIn className="w-5 h-5 mr-3" />
                  Login / Register
                </Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};
