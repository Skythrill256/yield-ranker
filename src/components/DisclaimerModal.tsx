import { useState, useEffect } from "react";
import { X, AlertTriangle, Shield, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-primary to-blue-600 px-8 py-6 text-white">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8" />
            <div>
              <h2 className="text-2xl font-bold">Important Legal Disclaimer</h2>
              <p className="text-blue-100 text-sm mt-1">You must read and accept this disclaimer to continue</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-8 w-8 text-amber-600 flex-shrink-0 mt-1" />
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-amber-900">END OF DAY (EOD) DATA NOTICE</h3>
                <p className="text-amber-800 leading-relaxed">
                  All data on this website is <span className="font-bold">END OF DAY (EOD)</span> data and <span className="font-bold">IS NOT REAL-TIME</span>. 
                  Price data, dividends, and returns are updated periodically and may be delayed. Do not rely on this information for intraday trading decisions.
                </p>
                {dataLastUpdated && (
                  <p className="text-sm font-semibold text-amber-900 mt-3 bg-amber-100 inline-block px-3 py-1.5 rounded-lg">
                    EOD Posting - Last Updated: {dataLastUpdated}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <FileText className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-blue-900 mb-2">WE ARE NOT FINANCIAL ADVISORS</h3>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    The information on this website is provided for educational and informational purposes only and does not constitute 
                    financial, investment, tax, or legal advice. We are not licensed financial advisors, broker-dealers, or registered investment advisers.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-blue-900 mb-2">NO INVESTMENT RECOMMENDATIONS</h3>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    No content on this site should be interpreted as a recommendation to buy, sell, or hold any security, ETF, stock, 
                    or other financial instrument. All investment decisions are your sole responsibility.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <Shield className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-blue-900 mb-2">DATA ACCURACY & TIMELINESS</h3>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    All data is provided "AS IS" without warranties of any kind. We do not guarantee the accuracy, completeness, or timeliness of any data. 
                    Data may contain errors, omissions, or be outdated. Market data is END OF DAY and not suitable for real-time trading.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-blue-900 mb-2">INVESTMENT RISKS</h3>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    All investments involve risk, including the potential loss of principal. Past performance does not guarantee future results. 
                    Covered call ETFs and dividend strategies carry specific risks including volatility, dividend cuts, and limited upside potential.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <h3 className="font-bold text-slate-900 mb-3">YOUR RESPONSIBILITY</h3>
            <p className="text-sm text-slate-700 leading-relaxed mb-3">
              You must conduct your own research and due diligence. Consult with a qualified, licensed financial professional before making any investment decisions. 
              You acknowledge that you are using this site entirely at your own risk.
            </p>
            <h3 className="font-bold text-slate-900 mb-3">LIMITATION OF LIABILITY</h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              We assume no liability for any losses, damages, or adverse consequences arising from your use of this website or reliance on any information provided herein. 
              By using this site, you agree to hold us harmless from any claims, damages, or losses.
            </p>
          </div>
        </div>

        <div className="border-t bg-slate-50 px-8 py-6">
          <div className="flex items-start gap-3 mb-4">
            <Checkbox
              id="agree"
              checked={hasAgreed}
              onCheckedChange={(checked) => setHasAgreed(checked === true)}
              className="mt-1"
            />
            <label htmlFor="agree" className="text-sm text-slate-700 leading-relaxed cursor-pointer">
              I have read and understood this disclaimer in its entirety. I acknowledge that all data is END OF DAY and not real-time. 
              I understand this is not financial advice and I will consult with a licensed professional before making investment decisions. 
              I agree to use this website at my own risk and hold the site operators harmless from any losses or damages.
            </label>
          </div>
          <Button
            onClick={handleAccept}
            disabled={!hasAgreed}
            className="w-full bg-primary hover:bg-primary/90 text-white py-6 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="h-5 w-5 mr-2" />
            I Accept - Continue to Site
          </Button>
        </div>
      </div>
    </div>
  );
};

