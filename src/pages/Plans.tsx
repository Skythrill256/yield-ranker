import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Lock, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

export default function Plans() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isGuest = !profile;
  const isPremium = !!profile;

  const handleUpgradeToPremium = async () => {
    if (!user) {
      toast({
        title: "Sign up to get Premium",
        description: "Create an account and automatically get premium access.",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }

    toast({
      title: "You already have Premium!",
      description: "All signed-up users have full access to premium features.",
    });
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      
      <main className="flex-1 py-16">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-6">
              Choose your plan
            </h1>
            <p className="text-lg text-slate-600">
              All signed-up users automatically receive Premium access for FREE
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <Card className="relative p-8 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-slate-900 mb-2">Guest</h2>
                <p className="text-2xl font-bold text-slate-600">Free</p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-slate-700 text-base">View all ETF data and metrics</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-slate-700 text-base">Symbol, Issuer, Description</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-slate-700 text-base">Pay Day, IPO Price, Current Price</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-slate-700 text-base">Price Change, Dividend, Annual Dividend</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-slate-700 text-base">Forward Yield & DVI</span>
                </div>
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-slate-400 text-base">Favorites</span>
                </div>
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-slate-400 text-base">Custom Weighted Rankings</span>
                </div>
              </div>
            </Card>

            <Card className="relative p-8 bg-gradient-to-br from-primary to-blue-600 border-0 rounded-2xl shadow-lg">
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-white mb-2">Premium</h2>
                <p className="text-2xl font-bold text-blue-100">Free</p>
              </div>

              <div className="space-y-4 mb-10">
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-white flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-white text-base">Everything in Guest</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-white flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-white text-base">Save Favorite ETFs</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-white flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-white text-base">Custom Weighted Rankings</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-white flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-white text-base">Adjust weights for Yield, DVI & Total Returns</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-white flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-white text-base">Filter and analyze your favorites</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-white flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-white text-base">Access to Dashboard</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-white flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-white text-base">Premium features unlocked</span>
                </div>
              </div>

              {isPremium ? (
                <Button 
                  className="w-full bg-white hover:bg-slate-50 text-primary font-bold text-base h-12 rounded-xl"
                  size="lg"
                  disabled
                >
                  Current Plan
                </Button>
              ) : (
                <Button 
                  className="w-full bg-white hover:bg-slate-50 text-primary font-bold text-base h-12 rounded-xl"
                  size="lg"
                  onClick={handleUpgradeToPremium}
                >
                  Get Premium
                </Button>
              )}
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

