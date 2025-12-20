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
<<<<<<< HEAD
import CEFIndex from "./pages/CEFIndex";
import ETFDetail from "./pages/ETFDetail";
import CEFDetail from "./pages/CEFDetail";
import DividendHistoryPage from "./pages/DividendHistoryPage";
import CEFDividendHistoryPage from "./pages/CEFDividendHistoryPage";
import OurFocus from "./pages/OurFocus";
import Focus from "./pages/Focus";
import CoveredCallETFs from "./pages/CoveredCallETFs";
import ClosedEndFunds from "./pages/ClosedEndFunds";
import Plans from "./pages/Plans";
import Resources from "./pages/Resources";
import Contact from "./pages/Contact";
import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import Settings from "./pages/Settings";
import Favorites from "./pages/Favorites";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
=======
>>>>>>> a70d87f304c6727e4fb80a561482c9c739387fe7
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";

// Lazy loaded pages (code splitting)
const ETFDetail = lazy(() => import("./pages/ETFDetail"));
const DividendHistoryPage = lazy(() => import("./pages/DividendHistoryPage"));
const OurFocus = lazy(() => import("./pages/OurFocus"));
const Focus = lazy(() => import("./pages/Focus"));
const CoveredCallETFs = lazy(() => import("./pages/CoveredCallETFs"));
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

// Loading fallback for lazy loaded pages
const PageLoading = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider delayDuration={200}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
<<<<<<< HEAD
          <DisclaimerModal />
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
            <Route path="/resources" element={<Resources />} />
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
=======
          <Suspense fallback={null}>
            <DisclaimerModal />
          </Suspense>
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/etf/:symbol" element={<ETFDetail />} />
              <Route path="/etf/:symbol/dividends" element={<DividendHistoryPage />} />
              <Route path="/our-focus" element={<OurFocus />} />
              <Route path="/focus" element={<Focus />} />
              <Route path="/covered-call-etfs" element={<CoveredCallETFs />} />
              <Route path="/plans" element={<Plans />} />
              <Route path="/resources" element={<Resources />} />
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
>>>>>>> a70d87f304c6727e4fb80a561482c9c739387fe7
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
