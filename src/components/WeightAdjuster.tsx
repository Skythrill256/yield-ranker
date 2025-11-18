import { useState, useEffect } from "react";
import { Slider } from "./ui/slider";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { RotateCcw } from "lucide-react";

interface WeightAdjusterProps {
  onWeightsChange: (weights: { yield: number; stdDev: number; totalReturn: number }) => void;
}

export const WeightAdjuster = ({ onWeightsChange }: WeightAdjusterProps) => {
  const [yieldWeight, setYieldWeight] = useState(30);
  const [stdDevWeight, setStdDevWeight] = useState(30);
  const [totalReturnWeight, setTotalReturnWeight] = useState(40);

  const totalWeight = yieldWeight + stdDevWeight + totalReturnWeight;
  const isValid = totalWeight === 100;

  useEffect(() => {
    if (isValid) {
      onWeightsChange({
        yield: yieldWeight,
        stdDev: stdDevWeight,
        totalReturn: totalReturnWeight,
      });
    }
  }, [yieldWeight, stdDevWeight, totalReturnWeight, isValid, onWeightsChange]);

  const handleYieldChange = (value: number[]) => {
    const newYield = value[0];
    const remaining = 100 - newYield;
    const ratio = stdDevWeight / (stdDevWeight + totalReturnWeight) || 0.5;
    
    setYieldWeight(newYield);
    setStdDevWeight(Math.round(remaining * ratio));
    setTotalReturnWeight(remaining - Math.round(remaining * ratio));
  };

  const handleStdDevChange = (value: number[]) => {
    const newStdDev = value[0];
    const remaining = 100 - newStdDev;
    const ratio = yieldWeight / (yieldWeight + totalReturnWeight) || 0.5;
    
    setStdDevWeight(newStdDev);
    setYieldWeight(Math.round(remaining * ratio));
    setTotalReturnWeight(remaining - Math.round(remaining * ratio));
  };

  const handleTotalReturnChange = (value: number[]) => {
    const newTotalReturn = value[0];
    const remaining = 100 - newTotalReturn;
    const ratio = yieldWeight / (yieldWeight + stdDevWeight) || 0.5;
    
    setTotalReturnWeight(newTotalReturn);
    setYieldWeight(Math.round(remaining * ratio));
    setStdDevWeight(remaining - Math.round(remaining * ratio));
  };

  const resetToDefaults = () => {
    setYieldWeight(30);
    setStdDevWeight(30);
    setTotalReturnWeight(40);
  };

  return (
    <Card className="shadow-card hover:shadow-elevated transition-smooth border-border/50">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-xl font-bold tracking-tight">Ranking Weight Customization</h3>
            <p className="text-sm text-muted-foreground">
              Personalize your ETF rankings by adjusting the importance of each metric
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={resetToDefaults}
            className="border-2 border-transparent hover:border-slate-200 hover:bg-slate-100 hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border/50 transition-smooth hover:bg-secondary/50">
            <div className="flex items-center justify-between">
              <Label htmlFor="yield-weight" className="text-sm font-medium text-foreground">
                Yield Weight
              </Label>
              <span className="text-lg font-bold tabular-nums text-primary">{yieldWeight}%</span>
            </div>
            <Slider
              id="yield-weight"
              value={[yieldWeight]}
              onValueChange={handleYieldChange}
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
          </div>

          <div className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border/50 transition-smooth hover:bg-secondary/50">
            <div className="flex items-center justify-between">
              <Label htmlFor="stddev-weight" className="text-sm font-medium text-foreground">
                Dividend Volatility Index
              </Label>
              <span className="text-lg font-bold tabular-nums text-primary">{stdDevWeight}%</span>
            </div>
            <Slider
              id="stddev-weight"
              value={[stdDevWeight]}
              onValueChange={handleStdDevChange}
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
          </div>

          <div className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border/50 transition-smooth hover:bg-secondary/50">
            <div className="flex items-center justify-between">
              <Label htmlFor="return-weight" className="text-sm font-medium text-foreground">
                Total Return
              </Label>
              <span className="text-lg font-bold tabular-nums text-primary">{totalReturnWeight}%</span>
            </div>
            <Slider
              id="return-weight"
              value={[totalReturnWeight]}
              onValueChange={handleTotalReturnChange}
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
          </div>
        </div>

        <div className="pt-4 border-t flex items-center justify-between bg-muted/30 -mx-6 -mb-6 px-6 py-4 rounded-b-lg">
          <span className="text-sm font-semibold text-muted-foreground">Total Weight</span>
          <div className="flex items-center gap-3">
            <span className={`text-xl font-bold tabular-nums transition-colors ${isValid ? 'text-primary' : 'text-destructive'}`}>
              {totalWeight}%
            </span>
            {isValid ? (
              <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">Valid</span>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-destructive/10 text-destructive font-medium">Must equal 100%</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};
