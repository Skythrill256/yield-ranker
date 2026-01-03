import { Link } from "react-router-dom";
import { NewsletterSubscribe } from "./NewsletterSubscribe";
import { useAuth } from "@/contexts/AuthContext";
import { Mail } from "lucide-react";
import { Button } from "./ui/button";

export const Footer = () => {
  const { profile, user } = useAuth();
  const isPremium = profile?.is_premium || user?.user_metadata?.is_premium;

  return (
    <footer className="w-full bg-white border-t border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        {/* Newsletter Subscription Section */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-primary/5 to-accent/5 px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">
                Stay Updated
              </h3>
              <p className="text-sm text-muted-foreground">
                Get the latest ETF insights and market updates delivered to your inbox.
              </p>
            </div>
            <NewsletterSubscribe />
          </div>
        </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs sm:text-sm text-muted-foreground">
        <span>© 2025 Dividends And Total Returns LLC All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link to="/terms" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <Link to="/do-not-sell" className="hover:text-foreground transition-colors">
            Do Not Sell My Personal Information
          </Link>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-8">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary mb-3">
          Important Disclaimers
        </h3>
        <p className="text-xs sm:text-sm leading-relaxed text-slate-600">
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
