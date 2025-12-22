import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireAuth } from "@/auth/RequireAuth";
import { ScrollToTop } from "@/components/ScrollToTop";

// Eagerly loaded (critical path)
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";

// Lazy loaded pages (code splitting)
const CEFIndex = lazy(() => import("./pages/CEFIndex"));
const ETFDetail = lazy(() => import("./pages/ETFDetail"));
const CEFDetail = lazy(() => import("./pages/CEFDetail"));
const DividendHistoryPage = lazy(() => import("./pages/DividendHistoryPage"));
const CEFDividendHistoryPage = lazy(() => import("./pages/CEFDividendHistoryPage"));
const OurFocus = lazy(() => import("./pages/OurFocus"));
const Focus = lazy(() => import("./pages/Focus"));
const CoveredCallETFs = lazy(() => import("./pages/CoveredCallETFs"));
const ClosedEndFunds = lazy(() => import("./pages/ClosedEndFunds"));
const Plans = lazy(() => import("./pages/Plans"));
const Resources = lazy(() => import("./pages/Resources"));
const Contact = lazy(() => import("./pages/Contact"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const Settings = lazy(() => import("./pages/Settings"));
const Favorites = lazy(() => import("./pages/Favorites"));
const Profile = lazy(() => import("./pages/Profile"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const DoNotSell = lazy(() => import("./pages/DoNotSell"));

// Lazy loaded heavy component
const DisclaimerModal = lazy(() =>
  import("./components/DisclaimerModal").then(m => ({ default: m.DisclaimerModal }))
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
  <QueryClientProvider client={queryClient}>
    <TooltipProvider delayDuration={200}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <Suspense fallback={null}>
            <DisclaimerModal />
          </Suspense>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
