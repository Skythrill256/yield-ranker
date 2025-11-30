import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header } from "@/components/Header";
import { DividendHistory } from "@/components/DividendHistory";
import { fetchSingleETF } from "@/services/etfData";
import { ETF } from "@/types/etf";

const DividendHistoryPage = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [etf, setEtf] = useState<ETF | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [etfNotFound, setEtfNotFound] = useState(false);

  useEffect(() => {
    const loadETF = async () => {
      if (!symbol) return;
      
      setIsLoading(true);
      setEtfNotFound(false);
      try {
        const data = await fetchSingleETF(symbol);
        if (data) {
          setEtf(data);
        } else {
          setEtfNotFound(true);
        }
      } catch (error) {
        console.error("Error loading ETF:", error);
        setEtfNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadETF();
  }, [symbol]);

  if (!symbol) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Invalid symbol</p>
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
            onClick={() => navigate("/")}
            className="mb-6 hover:bg-slate-100 hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Rankings
          </Button>
        </div>

        <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-400 delay-100">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            {symbol.toUpperCase()} - Dividend Yield & Payments
          </h1>
          {etf ? (
            <p className="text-lg text-muted-foreground">{etf.name}</p>
          ) : etfNotFound ? (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> This ETF is not currently in our database, but dividend history may still be available.
              </p>
            </div>
          ) : null}
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-400 delay-200">
          {isLoading ? (
            <Card className="p-6">
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            </Card>
          ) : (
            <DividendHistory 
              ticker={symbol} 
              annualDividend={etf?.annualDividend ?? null}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default DividendHistoryPage;

