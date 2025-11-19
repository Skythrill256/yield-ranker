import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";

export const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
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

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-md shadow-sm">
      <div className="container max-w-[95%] mx-auto px-3 sm:px-4 lg:px-6">
        <div className="flex h-24 items-center justify-between gap-3 sm:gap-4 lg:gap-6">
          <NavLink
            to="/"
            className="group flex-shrink-0 transition-transform hover:scale-[1.02]"
          >
            <Logo />
          </NavLink>

          {/* Center Search Bar - Desktop */}
          <div className="hidden md:flex flex-1 max-w-2xl mx-4 lg:mx-8">
            <SearchDropdown />
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1 xl:gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              className="px-3 xl:px-4 py-2 text-sm xl:text-base font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-md whitespace-nowrap"
              onClick={() => go("/focus")}
            >
              My Focus
            </Button>
            <Button
              variant="ghost"
              className="px-3 xl:px-4 py-2 text-sm xl:text-base font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-md whitespace-nowrap"
              onClick={() => go("/covered-call-etfs")}
            >
              CC Option ETFs
            </Button>
            <Button
              variant="ghost"
              className="px-3 xl:px-4 py-2 text-sm xl:text-base font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-md whitespace-nowrap"
              onClick={() => go("/plans")}
            >
              Plans
            </Button>
            <Button
              variant="ghost"
              className="px-3 xl:px-4 py-2 text-sm xl:text-base font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-md whitespace-nowrap"
              onClick={() => go("/resources")}
            >
              Resources
            </Button>
            <Button
              variant="ghost"
              className="px-3 xl:px-4 py-2 text-sm xl:text-base font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-md whitespace-nowrap"
              onClick={() => go("/contact")}
            >
              Contact
            </Button>
            {!isAuthenticated ? (
              <Button
                variant="default"
                className="px-3 xl:px-4 py-2 text-sm xl:text-base font-medium bg-primary text-white hover:bg-primary/90 transition-colors rounded-md whitespace-nowrap"
                onClick={() => go("/login")}
              >
                Login / Register
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="px-2 xl:px-3 py-2 h-auto text-sm xl:text-base font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-md border border-transparent hover:border-slate-200"
                  >
                    <div className="flex items-center gap-1 xl:gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-foreground hidden xl:inline">Account</span>
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 text-base">
                  <DropdownMenuItem className="cursor-pointer bg-slate-50" onClick={() => go("/profile")}>
                    <User className="w-5 h-5 mr-2 text-primary" />
                    <div className="flex flex-col">
                      <span className="font-medium text-base">{loading ? "Loading..." : displayName}</span>
                      <span className="text-sm text-muted-foreground">{roleDisplay}</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer text-base" onClick={() => go("/dashboard")}>
                    <BarChart3 className="w-5 h-5 mr-2 text-primary" />
                    <span>Dashboard</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer text-base" onClick={() => go("/favorites")}>
                    <Star className="w-5 h-5 mr-2 text-yellow-500" />
                    <span>Favorites</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer text-base" onClick={logout}>
                    <LogOut className="w-5 h-5 mr-2 text-primary" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-12 w-12 hover:bg-slate-100 transition-colors text-foreground flex-shrink-0"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-7 w-7 text-foreground" />
            ) : (
              <Menu className="h-7 w-7 text-foreground" />
            )}
          </Button>
        </div>

        {/* Mobile/Tablet Search */}
        <div className="lg:hidden pb-4 px-3">
          <SearchDropdown />
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t bg-background">
          <nav className="container flex flex-col py-2">
            <Button
              variant="ghost"
              className="justify-start px-4 py-2.5 text-base font-medium text-foreground hover:bg-slate-100 rounded-md"
              onClick={() => go("/focus")}
            >
              My Focus
            </Button>
            <Button
              variant="ghost"
              className="justify-start px-4 py-2.5 text-base font-medium text-foreground hover:bg-slate-100 rounded-md"
              onClick={() => go("/covered-call-etfs")}
            >
              CC Option ETFs
            </Button>
            <Button
              variant="ghost"
              className="justify-start px-4 py-2.5 text-base font-medium text-foreground hover:bg-slate-100 rounded-md"
              onClick={() => go("/plans")}
            >
              Plans
            </Button>
            <Button
              variant="ghost"
              className="justify-start px-4 py-2.5 text-base font-medium text-foreground hover:bg-slate-100 rounded-md"
              onClick={() => go("/resources")}
            >
              Resources
            </Button>
            <Button
              variant="ghost"
              className="justify-start px-4 py-2.5 text-base font-medium text-foreground hover:bg-slate-100 rounded-md"
              onClick={() => go("/contact")}
            >
              Contact Us
            </Button>
            {!isAuthenticated ? (
              <Button
                variant="default"
                className="mx-4 mt-2 mb-1 text-base font-medium bg-primary text-white hover:bg-primary/90 transition-colors rounded-md"
                onClick={() => go("/login")}
              >
                Login / Register
              </Button>
            ) : (
              <div className="px-4 py-2.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-start px-0 text-sm font-medium text-foreground hover:bg-slate-100 hover:text-foreground"
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
            )}
          </nav>
        </div>
      )}
    </header>
  );
};
