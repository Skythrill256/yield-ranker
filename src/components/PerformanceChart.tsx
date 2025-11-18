import { ETF } from "@/types/etf";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface PerformanceChartProps {
  etf: ETF;
}

export const PerformanceChart = ({ etf }: PerformanceChartProps) => {
  const performanceData = [
    {
      period: "1 Week",
      return: etf.totalReturn1Wk ?? 0,
    },
    {
      period: "1 Month",
      return: etf.totalReturn1Mo ?? 0,
    },
    {
      period: "3 Month",
      return: etf.totalReturn3Mo ?? 0,
    },
    {
      period: "6 Month",
      return: etf.totalReturn6Mo ?? 0,
    },
    {
      period: "12 Month",
      return: etf.totalReturn12Mo ?? 0,
    },
  ];

  if (etf.totalReturn3Yr !== undefined) {
    performanceData.push({
      period: "3 Year",
      return: etf.totalReturn3Yr,
    });
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Performance Summary (from Spreadsheet)</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Total return data sourced directly from the DTR spreadsheet
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
            fill="#3b82f6"
            radius={[6, 6, 0, 0]}
            fillOpacity={0.8}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

