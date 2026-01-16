import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AuthWidget } from "@/auth/AuthWidget";
import { useAuth } from "@/contexts/AuthContext";

const Auth = () => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: { pathname: string } } | null;
  const redirectTo =
    state?.from?.pathname && state.from.pathname !== "/login"
      ? state.from.pathname
      : "/";

  useEffect(() => {
    if (!loading && session) {
      navigate(redirectTo, { replace: true });
    }
  }, [loading, session, navigate, redirectTo]);

  const handleSuccess = () => {
    navigate(redirectTo, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="relative flex-1 flex items-center justify-center">
        <div className="container max-w-md mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="w-full space-y-6 sm:space-y-8">
            <div className="space-y-2 sm:space-y-3">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                {mode === "login" ? "Welcome back" : "Create an account"}
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                {mode === "login"
                  ? "Sign in to access your portfolio and favorites"
                  : "Start exploring and utilizing all the resources that will help you make informed investment decisions."}
              </p>
            </div>
            <AuthWidget onSuccess={handleSuccess} onModeChange={setMode} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Auth;
