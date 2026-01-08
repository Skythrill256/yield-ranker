import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireAuth } from "@/auth/RequireAuth";
import { ScrollToTop } from "@/components/ScrollToTop";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalErrorDialog } from "@/components/GlobalErrorDialog";
import { setupGlobalErrorHandlers, restoreAppState } from "@/utils/errorHandler";

// Setup global error handlers on app initialization
setupGlobalErrorHandlers();

// Component to restore app state on mount
function AppStateRestorer() {
  useEffect(() => {
    // Restore app state after component mounts
    const timer = setTimeout(() => {
      restoreAppState();
    }, 100);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

// Eagerly loaded (critical path)
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";

// Retry function for failed module imports with state saving
const retryLazyImport = (
  importFn: () => Promise<any>,
  retries = 3,
  delay = 1000
): Promise<any> => {
  // Import saveAppState function dynamically to avoid circular dependency
  const saveState = () => {
    try {
      const state = {
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        timestamp: Date.now(),
        scrollY: window.scrollY,
      };
      localStorage.setItem('app_recovery_state', JSON.stringify(state));
    } catch (e) {
      // Ignore errors
    }
  };

  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      importFn()
        .then(resolve)
        .catch((error) => {
          // Save state before retrying
          saveState();

          if (remaining > 0) {
            console.warn(
              `[Lazy Import] Failed to load module, retrying... (${remaining} attempts left)`
            );
            // Exponential backoff
            const backoffDelay = delay * (retries - remaining + 1);
            setTimeout(() => attempt(remaining - 1), backoffDelay);
          } else {
            console.error("[Lazy Import] Failed to load module after retries:", error);
            // Save state one more time before showing error
            saveState();
            // Return a fallback component instead of crashing
            resolve({
              default: () => (
                <div className="min-h-screen bg-background flex items-center justify-center p-4">
                  <div className="max-w-md w-full bg-card border border-destructive rounded-lg p-6 space-y-4">
                    <h2 className="text-xl font-semibold text-foreground">
                      Failed to Load Page
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      The page could not be loaded after multiple attempts. This may be due to network issues or a deployment update.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          // Clear cache and reload
                          if ("caches" in window) {
                            caches.keys().then((names) => {
                              names.forEach((name) => {
                                caches.delete(name);
                              });
                              window.location.reload();
                            });
                          } else {
                            globalThis.location.reload();
                          }
                        }}
                        className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                      >
                        Reload Page
                      </button>
                      <button
                        onClick={() => window.history.back()}
                        className="flex-1 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90"
                      >
                        Go Back
                      </button>
                    </div>
                  </div>
                </div>
              ),
            });
          }
        });
    };
    attempt(retries);
  });
};

// Lazy loaded pages (code splitting) with retry logic
const CEFIndex = lazy(() => retryLazyImport(() => import("./pages/CEFIndex")));
const ETFDetail = lazy(() => retryLazyImport(() => import("./pages/ETFDetail")));
const CEFDetail = lazy(() => retryLazyImport(() => import("./pages/CEFDetail")));
const DividendHistoryPage = lazy(() =>
  retryLazyImport(() => import("./pages/DividendHistoryPage"))
);
const CEFDividendHistoryPage = lazy(() =>
  retryLazyImport(() => import("./pages/CEFDividendHistoryPage"))
);
const OurFocus = lazy(() => retryLazyImport(() => import("./pages/OurFocus")));
const Focus = lazy(() => retryLazyImport(() => import("./pages/Focus")));
const CoveredCallETFs = lazy(() =>
  retryLazyImport(() => import("./pages/CoveredCallETFs"))
);
const ClosedEndFunds = lazy(() =>
  retryLazyImport(() => import("./pages/ClosedEndFunds"))
);
const Plans = lazy(() => retryLazyImport(() => import("./pages/Plans")));
const Resources = lazy(() => retryLazyImport(() => import("./pages/Resources")));
const Contact = lazy(() => retryLazyImport(() => import("./pages/Contact")));
const Dashboard = lazy(() => retryLazyImport(() => import("./pages/Dashboard")));
const AdminPanel = lazy(() => retryLazyImport(() => import("./pages/AdminPanel")));
const Settings = lazy(() => retryLazyImport(() => import("./pages/Settings")));
const Favorites = lazy(() => retryLazyImport(() => import("./pages/Favorites")));
const Profile = lazy(() => retryLazyImport(() => import("./pages/Profile")));
const Newsletters = lazy(() => retryLazyImport(() => import("./pages/Newsletters")));
const TermsOfService = lazy(() =>
  retryLazyImport(() => import("./pages/TermsOfService"))
);
const PrivacyPolicy = lazy(() =>
  retryLazyImport(() => import("./pages/PrivacyPolicy"))
);
const DoNotSell = lazy(() => retryLazyImport(() => import("./pages/DoNotSell")));

// Lazy loaded heavy component
const DisclaimerModal = lazy(() =>
  retryLazyImport(() =>
    import("./components/DisclaimerModal").then(m => ({ default: m.DisclaimerModal }))
  )
);

const queryClient = new QueryClient();

// Loading fallback for lazy loaded pages - must have background to prevent white flash
const PageLoading = () => (
  <div className="flex items-center justify-center min-h-screen bg-background w-full" style={{ backgroundColor: 'hsl(var(--background))' }}>
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

// Regular page routing - no transitions, no effects, just clean navigation
const AppRoutes = () => {
  return (
    <div
      className="min-h-screen w-full"
      style={{
        backgroundColor: 'hsl(var(--background))',
        minHeight: '100vh'
      }}
    >
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/cef" element={<CEFIndex />} />
          <Route path="/cef/:symbol" element={<CEFDetail />} />
          <Route path="/cef/:symbol/dividends" element={<CEFDividendHistoryPage />} />
          <Route path="/etf/:symbol" element={<ETFDetail />} />
          <Route path="/etf/:symbol/dividends" element={<DividendHistoryPage />} />
          <Route path="/our-focus" element={<OurFocus />} />
          <Route path="/focus" element={<Focus />} />
          <Route path="/covered-call-etfs" element={<CoveredCallETFs />} />
          <Route path="/closed-end-funds" element={<ClosedEndFunds />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/resources" element={<Navigate to="/resources-cc" replace />} />
          <Route path="/resources-cc" element={<Resources />} />
          <Route path="/resources-cef" element={<Resources />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route
            path="/newsletters"
            element={
              <RequireAuth>
                <Newsletters />
              </RequireAuth>
            }
          />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/do-not-sell" element={<DoNotSell />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/auth" element={<Navigate to="/login" replace />} />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <Navigate to="/admin/users" replace />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAuth>
                <AdminPanel />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/data"
            element={
              <RequireAuth>
                <Navigate to="/admin/upload" replace />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/upload"
            element={
              <RequireAuth>
                <AdminPanel />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/delete"
            element={
              <RequireAuth>
                <AdminPanel />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/favorites"
            element={
              <RequireAuth>
                <AdminPanel />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <RequireAuth>
                <AdminPanel />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/price-reference"
            element={
              <RequireAuth>
                <AdminPanel />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/notebook"
            element={
              <RequireAuth>
                <AdminPanel />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/newsletters"
            element={
              <RequireAuth>
                <AdminPanel />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <Settings />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <Toaster />
        <Sonner />
        <GlobalErrorDialog />
        <AppStateRestorer />
        <BrowserRouter>
          <ScrollToTop />
          <AuthProvider>
            <ErrorBoundary>
              <Suspense fallback={null}>
                <DisclaimerModal />
              </Suspense>
              <AppRoutes />
            </ErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
