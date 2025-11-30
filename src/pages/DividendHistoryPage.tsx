import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header } from "@/components/Header";
import { DividendHistory } from "@/components/DividendHistory";
import { fetchETFDataWithMetadata } from "@/services/etfData";
import { ETF } from "@/types/etf";

const DividendHistoryPage = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [etf, setEtf] = useState<ETF | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadETF = async () => {
      if (!symbol) return;
      
      setIsLoading(true);
      try {
        const data = await fetchETFDataWithMetadata(symbol);
        setEtf(data);
      } catch (error) {
        console.error("Error loading ETF:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadETF();
  }, [symbol]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  if (!etf || !symbol) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="text-center py-12">
            <p className="text-muted-foreground">ETF not found</p>
            <Button onClick={() => navigate("/")} className="mt-4">
              Back to Rankings
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="animate-in fade-in slide-in-from-left-4 duration-300">
          <Button
            variant="ghost"
            onClick={() => navigate(`/etf/${symbol}`)}
            className="mb-6 hover:bg-slate-100 hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to {symbol} Details
          </Button>
        </div>

        <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-400 delay-100">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            {etf.symbol} - Dividend Yield & Payments
          </h1>
          <p className="text-lg text-muted-foreground">{etf.name}</p>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-400 delay-200">
          <DividendHistory 
            ticker={symbol} 
            annualDividend={etf.annualDividend ?? etf.annualDividendAmount ?? null}
          />
        </div>
      </main>
    </div>
  );
};

export default DividendHistoryPage;

