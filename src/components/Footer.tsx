import { Link } from "react-router-dom";
import { NewsletterSubscribe } from "./NewsletterSubscribe";
import { useAuth } from "@/contexts/AuthContext";
import { Mail, Settings } from "lucide-react";
import { Button } from "./ui/button";

export const Footer = () => {
  const { profile, user } = useAuth();
  const isPremium = profile?.is_premium || user?.user_metadata?.is_premium;

  return (
    <footer className="w-full bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14 lg:py-16 space-y-8 sm:space-y-10">
        {/* Newsletter Subscription Section */}
        <div className="rounded-2xl border-2 border-slate-200 bg-gradient-to-r from-primary/5 to-accent/5 px-5 sm:px-6 md:px-8 py-6 sm:py-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 md:gap-6">
            <div className="space-y-2">
              <h3 className="text-lg sm:text-xl font-bold text-foreground">
                Stay Updated
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Get the latest ETF insights and market updates delivered to your inbox.
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full md:w-auto">
              <NewsletterSubscribe />
              {/* Manage Subscriptions button - only on mobile */}
              <div className="md:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-2 text-sm font-medium"
                  onClick={() => window.open('https://dashboard.mailerlite.com/forms/1163804/143468965883892672/share', '_blank')}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Manage Subscriptions
                </Button>
              </div>
            </div>
          </div>
        </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-5 text-sm sm:text-base text-muted-foreground">
        <span className="font-medium">© 2025 Dividends And Total Returns LLC All rights reserved.</span>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <Link to="/terms" className="hover:text-foreground transition-colors font-medium hover:underline">
            Terms of Service
          </Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors font-medium hover:underline">
            Privacy Policy
          </Link>
          <Link to="/do-not-sell" className="hover:text-foreground transition-colors font-medium hover:underline">
            Do Not Sell My Personal Information
          </Link>
          {/* Manage Subscriptions link - only on desktop */}
          <button
            onClick={() => window.open('https://dashboard.mailerlite.com/forms/1163804/143468965883892672/share', '_blank')}
            className="hidden md:inline hover:text-foreground transition-colors font-medium hover:underline"
          >
            Manage Subscriptions
          </button>
        </div>
      </div>
      <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-5 sm:px-6 md:px-8 py-6 sm:py-8 shadow-sm">
        <h3 className="text-sm sm:text-base font-bold uppercase tracking-wide text-primary mb-4">
          Important Disclaimers
        </h3>
        <p className="text-xs sm:text-sm md:text-base leading-relaxed text-slate-700">
          DividendsandTotalReturns.com is independent and is neither a broker, dealer, nor registered
          investment adviser. All content is for informational purposes only and should not be viewed
          as an offer, recommendation, or personalized advice. Use of this site and its data is at
          your own risk; we assume no liability for any losses or damages. Information, including
          prices, is provided "as is" without guarantees of accuracy, completeness, or timeliness, and
          past performance does not predict future results. Company trademarks remain the property of
          their respective owners and appear for editorial use only.
        </p>
      </div>
    </div>
  </footer>
  );
};
