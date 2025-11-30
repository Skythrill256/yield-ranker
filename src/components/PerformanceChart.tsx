import { ETF } from "@/types/etf";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface PerformanceChartProps {
  etf: ETF;
  chartType?: 'totalReturn' | 'priceReturn';
}

export const PerformanceChart = ({ etf, chartType = 'totalReturn' }: PerformanceChartProps) => {
  // Use Total Return WITH DRIP (using adjClose ratio) or Price Return (unadjusted close)
  const performanceData = chartType === 'totalReturn' 
    ? [
        { period: "1 Week", return: etf.trDrip1Wk ?? 0 },
        { period: "1 Month", return: etf.trDrip1Mo ?? 0 },
        { period: "3 Month", return: etf.trDrip3Mo ?? 0 },
        { period: "6 Month", return: etf.trDrip6Mo ?? 0 },
        { period: "12 Month", return: etf.trDrip12Mo ?? 0 },
        ...(etf.trDrip3Yr !== undefined && etf.trDrip3Yr !== null 
          ? [{ period: "3 Year", return: etf.trDrip3Yr }] 
          : []
        ),
      ]
    : [
        { period: "1 Week", return: etf.priceReturn1Wk ?? 0 },
        { period: "1 Month", return: etf.priceReturn1Mo ?? 0 },
        { period: "3 Month", return: etf.priceReturn3Mo ?? 0 },
        { period: "6 Month", return: etf.priceReturn6Mo ?? 0 },
        { period: "12 Month", return: etf.priceReturn12Mo ?? 0 },
        ...(etf.priceReturn3Yr !== undefined && etf.priceReturn3Yr !== null 
          ? [{ period: "3 Year", return: etf.priceReturn3Yr }] 
          : []
        ),
      ];

  const chartTitle = chartType === 'totalReturn' 
    ? 'Total Return (with DRIP)' 
    : 'Price Return Chart';

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">{chartTitle}</h3>
      <p className="text-sm text-muted-foreground mb-6">
        {chartType === 'totalReturn' 
          ? 'Total return with dividends reinvested (DRIP) using adjusted close prices'
          : 'Price return using unadjusted close prices (capital gains only)'
        } • Source: Tiingo
      </p>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={performanceData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis 
            dataKey="period" 
            stroke="#94a3b8" 
            fontSize={12}
            angle={-45}
            textAnchor="end"
            height={80}
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="#94a3b8" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value.toFixed(1)}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(255, 255, 255, 0.98)",
              border: "none",
              borderRadius: "12px",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              padding: "12px 16px",
            }}
            labelStyle={{ color: "#64748b", fontSize: "12px", marginBottom: "4px" }}
            formatter={(value: number) => [`${value.toFixed(2)}%`, "Return"]}
          />
          <Bar
            dataKey="return"
            radius={[6, 6, 0, 0]}
            fillOpacity={0.9}
          >
            {performanceData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.return >= 0 ? '#22c55e' : '#ef4444'} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

