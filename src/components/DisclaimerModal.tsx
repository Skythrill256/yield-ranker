import { useState, useEffect } from "react";
import { Shield, AlertTriangle, FileText } from "lucide-react";
import { Button } from "./ui/button";
import { getSiteSettings } from "@/services/admin";

export const DisclaimerModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasAgreed, setHasAgreed] = useState(false);
  const [dataLastUpdated, setDataLastUpdated] = useState("");

  useEffect(() => {
    const hasAccepted = sessionStorage.getItem("disclaimer_accepted");
    if (!hasAccepted) {
      setIsOpen(true);
    }

    const fetchLastUpdated = async () => {
      try {
        const settings = await getSiteSettings();
        const lastUpdatedSetting = settings.find(s => s.key === "data_last_updated");
        if (lastUpdatedSetting) {
          const date = new Date(lastUpdatedSetting.value);
          const formatted = date.toLocaleDateString("en-US", {
            month: "numeric",
            day: "numeric",
            year: "numeric",
          }) + " " + date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
          setDataLastUpdated(formatted);
        }
      } catch (error) {
        console.error("Failed to fetch last updated date:", error);
      }
    };

    fetchLastUpdated();
  }, []);

  const handleAccept = () => {
    if (hasAgreed) {
      sessionStorage.setItem("disclaimer_accepted", "true");
      setIsOpen(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-background overflow-y-auto">
      <div className="min-h-screen flex flex-col">
        {/* Header Section */}
        <div className="relative border-b overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5"></div>
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl"></div>
          
          <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-16 md:py-24 relative">
            <div className="max-w-4xl mx-auto text-center space-y-4">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">
                Dividends &amp;{" "}
                <span className="bg-gradient-to-r from-primary via-blue-600 to-accent bg-clip-text text-transparent">
                  Total Returns
                </span>
              </h1>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed font-medium">
                Maximizing Investment Value Through Dividend Income and Price Change with Advanced Screening and Custom Rankings
              </p>
            </div>
          </div>
        </div>

        {/* Disclaimer Content */}
        <div className="flex-1 flex items-center justify-center py-8 px-4">
          <div className="w-full max-w-3xl">
            <div className="bg-white rounded-xl shadow-2xl overflow-hidden border-2 border-slate-200">
              <div className="bg-primary px-6 py-4">
                <div className="flex items-center gap-3">
                  <Shield className="h-6 w-6 text-white" />
                  <div>
                    <h2 className="text-xl font-bold text-white">Important Legal Disclaimer</h2>
                    <p className="text-blue-100 text-xs mt-0.5">You must read and accept this disclaimer to continue</p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-5 space-y-4 max-h-[50vh] overflow-y-auto">
                <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <h3 className="text-base font-bold text-amber-900">END OF DAY (EOD) DATA NOTICE</h3>
                      <p className="text-sm text-amber-800 leading-relaxed">
                        All data on this website is <span className="font-bold">END OF DAY (EOD)</span> data and <span className="font-bold">IS NOT REAL-TIME</span>. 
                        Price data, dividends, and returns are updated periodically and may be delayed. Do not rely on this information for intraday trading decisions.
                      </p>
                      {dataLastUpdated && (
                        <p className="text-xs font-semibold text-amber-900 mt-2 bg-amber-100 inline-block px-2.5 py-1 rounded">
                          EOD Posting - Last Updated: {dataLastUpdated}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <FileText className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-bold text-blue-900 mb-1.5">WE ARE NOT FINANCIAL ADVISORS</h3>
                        <p className="text-xs text-blue-800 leading-relaxed">
                          The information on this website is provided for educational and informational purposes only and does not constitute 
                          financial, investment, tax, or legal advice. We are not licensed financial advisors, broker-dealers, or registered investment advisers.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-bold text-blue-900 mb-1.5">NO INVESTMENT RECOMMENDATIONS</h3>
                        <p className="text-xs text-blue-800 leading-relaxed">
                          No content on this site should be interpreted as a recommendation to buy, sell, or hold any security, ETF, stock, 
                          or other financial instrument. All investment decisions are your sole responsibility.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-bold text-blue-900 mb-1.5">DATA ACCURACY & TIMELINESS</h3>
                        <p className="text-xs text-blue-800 leading-relaxed">
                          All data is provided "AS IS" without warranties of any kind. We do not guarantee the accuracy, completeness, or timeliness of any data. 
                          Data may contain errors, omissions, or be outdated. Market data is END OF DAY and not suitable for real-time trading.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-bold text-blue-900 mb-1.5">INVESTMENT RISKS</h3>
                        <p className="text-xs text-blue-800 leading-relaxed">
                          All investments involve risk, including the potential loss of principal. Past performance does not guarantee future results. 
                          Covered call ETFs and dividend strategies carry specific risks including volatility, dividend cuts, and limited upside potential.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-1">YOUR RESPONSIBILITY</h3>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      You must conduct your own research and due diligence. Consult with a qualified, licensed financial professional before making any investment decisions. 
                      You acknowledge that you are using this site entirely at your own risk.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-1">LIMITATION OF LIABILITY</h3>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      We assume no liability for any losses, damages, or adverse consequences arising from your use of this website or reliance on any information provided herein. 
                      By using this site, you agree to hold us harmless from any claims, damages, or losses.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t bg-blue-50 px-6 py-4">
                <div className="flex items-start gap-2.5 mb-3">
                  <input
                    type="checkbox"
                    id="agree"
                    checked={hasAgreed}
                    onChange={(e) => setHasAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                  />
                  <label htmlFor="agree" className="text-xs text-slate-700 leading-relaxed cursor-pointer">
                    I have read and understood this disclaimer in its entirety. I acknowledge that all data is END OF DAY and not real-time. 
                    I understand this is not financial advice and I will consult with a licensed professional before making investment decisions. 
                    I agree to use this website at my own risk and hold the site operators harmless from any losses or damages.
                  </label>
                </div>
                <Button
                  onClick={handleAccept}
                  disabled={!hasAgreed}
                  className="w-full bg-primary hover:bg-primary/90 text-white py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                >
                  I Accept - Continue to Site
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
