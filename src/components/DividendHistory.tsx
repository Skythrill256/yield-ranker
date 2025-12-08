/**
 * Dividend History Component
 * 
 * Per Section 3.2 of PDF - Displays:
 * - Top half: Line chart of annualized dividend over time (from rolling 365D series)
 * - Below: Bar chart of individual dividend payments by ex-date
 * - Time-range buttons: 1Y / 3Y / 5Y / 10Y / 20Y / ALL
 * - Bottom half: Dividend payout schedule table
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  Line,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ChevronDown, ChevronUp, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { fetchDividends, fetchDividendDates, type DividendData, type DividendRecord, type DividendDates } from "@/services/tiingoApi";

interface DividendHistoryProps {
  ticker: string;
  annualDividend?: number | null;
}

interface YearlyDividend {
  year: number;
  total: number;
  count: number;
  avgAmount: number;
  dividends: DividendRecord[];
}

type TimeRange = '1Y' | '3Y' | '5Y' | '10Y' | '20Y' | 'ALL';

export function DividendHistory({ ticker, annualDividend }: DividendHistoryProps) {
  const [dividendData, setDividendData] = useState<DividendData | null>(null);
  const [corporateActionDates, setCorporateActionDates] = useState<Map<string, DividendDates>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');

  const getFilteredDividends = useMemo(() => {
    if (!dividendData?.dividends) return [];

    const now = new Date();
    const cutoffDate = new Date();

    switch (timeRange) {
      case '1Y': cutoffDate.setFullYear(now.getFullYear() - 1); break;
      case '3Y': cutoffDate.setFullYear(now.getFullYear() - 3); break;
      case '5Y': cutoffDate.setFullYear(now.getFullYear() - 5); break;
      case '10Y': cutoffDate.setFullYear(now.getFullYear() - 10); break;
      case '20Y': cutoffDate.setFullYear(now.getFullYear() - 20); break;
      case 'ALL': return dividendData.dividends;
    }

    return dividendData.dividends.filter(d => new Date(d.exDate) >= cutoffDate);
  }, [dividendData, timeRange]);

  const yearlyDividends = useMemo(() => {
    if (!dividendData?.dividends) return [];

    const result: YearlyDividend[] = [];
    const dividendsByYear = new Map<number, DividendRecord[]>();

    dividendData.dividends.forEach(d => {
      const year = new Date(d.exDate).getFullYear();
      if (!dividendsByYear.has(year)) {
        dividendsByYear.set(year, []);
      }
      dividendsByYear.get(year)!.push(d);
    });

    dividendsByYear.forEach((divs, year) => {
      // Use adjusted amounts (adjAmount) for accurate totals that account for stock splits
      // Filter out any dividends with zero or invalid amounts
      const validDivs = divs.filter(d => {
        const amount = d.adjAmount ?? d.amount ?? 0;
        return amount > 0 && isFinite(amount);
      });

      // Only include years with at least one valid dividend
      if (validDivs.length === 0) return;

      const total = validDivs.reduce((sum, d) => sum + (d.adjAmount ?? d.amount ?? 0), 0);
      result.push({
        year,
        total,
        count: validDivs.length,
        avgAmount: total / validDivs.length,
        dividends: validDivs,
      });
    });

    return result.sort((a, b) => b.year - a.year);
  }, [dividendData]);

  const chartData = useMemo(() => {
    return yearlyDividends
      .slice(0, 5)
      .reverse()
      .map(y => ({
        year: y.year.toString(),
        total: Number(y.total.toFixed(4)),
        count: y.count,
      }));
  }, [yearlyDividends]);

  const yoyGrowth = useMemo(() => {
    return yearlyDividends.length >= 2
      ? ((yearlyDividends[0].total - yearlyDividends[1].total) / yearlyDividends[1].total) * 100
      : null;
  }, [yearlyDividends]);

  const getFilteredTableRecords = useMemo(() => {
    if (!dividendData?.dividends) return [];

    const now = new Date();
    const cutoffDate = new Date();

    switch (timeRange) {
      case '1Y': cutoffDate.setFullYear(now.getFullYear() - 1); break;
      case '3Y': cutoffDate.setFullYear(now.getFullYear() - 3); break;
      case '5Y': cutoffDate.setFullYear(now.getFullYear() - 5); break;
      case '10Y': cutoffDate.setFullYear(now.getFullYear() - 10); break;
      case '20Y': cutoffDate.setFullYear(now.getFullYear() - 20); break;
      case 'ALL': return dividendData.dividends;
    }

    return dividendData.dividends.filter(d => new Date(d.exDate) >= cutoffDate);
  }, [dividendData, timeRange]);

  const recordsByYear = useMemo(() => {
    const grouped = new Map<number, DividendRecord[]>();
    getFilteredTableRecords.forEach(record => {
      const year = new Date(record.exDate).getFullYear();
      if (!grouped.has(year)) {
        grouped.set(year, []);
      }
      grouped.get(year)!.push(record);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, records]) => ({ year, records }));
  }, [getFilteredTableRecords]);

  const toggleYear = (year: number) => {
    setExpandedYears(prev => {
      const newSet = new Set(prev);
      if (newSet.has(year)) {
        newSet.delete(year);
      } else {
        newSet.add(year);
      }
      return newSet;
    });
  };

  useEffect(() => {
    const loadDividends = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch Tiingo dividend data and corporate actions dates in parallel
        const [tiingoData, corpActionsResponse] = await Promise.all([
          fetchDividends(ticker, 10),
          fetchDividendDates(ticker).catch(() => ({ dividends: [] as DividendDates[] }))
        ]);

        setDividendData(tiingoData);

        // Create a map of ex-date to corporate actions dates for quick lookup
        const datesMap = new Map<string, DividendDates>();
        corpActionsResponse.dividends.forEach((div: DividendDates) => {
          // Normalize date format for matching
          const exDate = div.exDate.split('T')[0];
          datesMap.set(exDate, div);
        });
        setCorporateActionDates(datesMap);

        if (tiingoData.dividends.length > 0) {
          const firstYear = new Date(tiingoData.dividends[0].exDate).getFullYear();
          setExpandedYears(new Set([firstYear]));
        }
      } catch (err) {
        console.error('Error loading dividends:', err);
        setError('Failed to load dividend history');
      } finally {
        setIsLoading(false);
      }
    };

    loadDividends();
  }, [ticker]);

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  if (error || !dividendData || dividendData.dividends.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground py-8">
          {error || 'No dividend data available for this ticker'}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-4 mb-4 sm:mb-6">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold mb-1">Dividend History</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {dividendData.paymentsPerYear} payments per year •
            Last dividend: ${dividendData.lastDividend?.toFixed(4) || 'N/A'}
          </p>
        </div>

        <div className="flex gap-3 sm:gap-4 flex-wrap">
          <div className="text-center min-w-[100px]">
            <p className="text-xs text-muted-foreground">Annual Dividend</p>
            <p className="text-base sm:text-lg font-bold text-green-600">
              ${(dividendData.annualizedDividend ?? annualDividend)?.toFixed(2) || 'N/A'}
            </p>
          </div>
          {yoyGrowth !== null && (
            <div className="text-center min-w-[100px]">
              <p className="text-xs text-muted-foreground">YoY Growth</p>
              <p className={`text-base sm:text-lg font-bold flex items-center justify-center ${yoyGrowth >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                {yoyGrowth >= 0 ? <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 mr-1" /> : <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />}
                {yoyGrowth >= 0 ? '+' : ''}{yoyGrowth.toFixed(1)}%
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-4 flex-wrap">
        {(['1Y', '3Y', '5Y', '10Y', '20Y', 'ALL'] as TimeRange[]).map((range) => (
          <Button
            key={range}
            variant={timeRange === range ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeRange(range)}
            className="h-8 px-2 sm:px-3 text-xs flex-shrink-0"
          >
            {range}
          </Button>
        ))}
      </div>

      {getFilteredDividends.length > 0 && (() => {
        const dividends = getFilteredDividends.slice().reverse();

        // Detect if frequency changed using both API frequency field and actual payment intervals
        const frequencies = dividends
          .map(div => {
            const freq = div.frequency || '';
            // Normalize frequency strings for comparison
            const normalized = freq.toLowerCase();
            if (normalized.includes('week') || normalized === 'weekly') return 'weekly';
            if (normalized.includes('month') || normalized === 'monthly' || normalized === 'mo') return 'monthly';
            if (normalized.includes('quarter') || normalized === 'quarterly' || normalized.includes('qtr')) return 'quarterly';
            if (normalized.includes('semi') || normalized.includes('semi-annual')) return 'semi-annual';
            if (normalized.includes('annual') || normalized === 'annual' || normalized === 'yearly') return 'annual';
            return null;
          })
          .filter((f): f is string => f !== null);

        // Check if frequency changed based on API frequency field
        const uniqueFrequencies = new Set(frequencies);
        let frequencyChanged = uniqueFrequencies.size > 1;

        // Also check actual payment intervals to verify frequency change
        // If all intervals are similar, frequency hasn't actually changed
        if (dividends.length >= 3) {
          const intervals: number[] = [];
          for (let i = 0; i < dividends.length - 1; i++) {
            const currentDate = new Date(dividends[i].exDate);
            const nextDate = new Date(dividends[i + 1].exDate);
            const daysBetween = (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysBetween > 0 && daysBetween < 365) { // Valid interval
              intervals.push(daysBetween);
            }
          }

          if (intervals.length >= 2) {
            // Calculate average interval
            const avgInterval = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
            // Check if intervals are consistent (within 20% of average)
            const isConsistent = intervals.every(d => {
              const deviation = Math.abs(d - avgInterval) / avgInterval;
              return deviation <= 0.2; // Within 20% of average
            });

            // Only show frequency change if intervals are NOT consistent
            // AND we have different frequency labels
            frequencyChanged = !isConsistent && uniqueFrequencies.size > 1;
          } else {
            // Not enough intervals to determine, rely on frequency field
            frequencyChanged = uniqueFrequencies.size > 1;
          }
        } else {
          // Not enough data points, rely on frequency field
          frequencyChanged = uniqueFrequencies.size > 1;
        }

        // Calculate equivalent weekly rate only if frequency changed
        const chartData = dividends.map((div, index, array) => {
          let equivalentWeeklyRate: number | null = null;

          // Ensure amount is a valid number - use adjAmount as fallback if amount is 0/null
          const amount = (typeof div.amount === 'number' && !isNaN(div.amount) && isFinite(div.amount) && div.amount > 0)
            ? div.amount
            : ((typeof div.adjAmount === 'number' && !isNaN(div.adjAmount) && isFinite(div.adjAmount) && div.adjAmount > 0)
              ? div.adjAmount
              : 0);

          if (frequencyChanged && amount > 0) {
            // Detect frequency based on days between payments
            if (index < array.length - 1) {
              const currentDate = new Date(div.exDate);
              const nextDate = new Date(array[index + 1].exDate);
              const daysBetween = (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24);

              // Normalize to weekly rate based on detected frequency
              if (daysBetween <= 10) {
                equivalentWeeklyRate = amount;
              } else if (daysBetween <= 35) {
                equivalentWeeklyRate = amount / 4.33;
              } else if (daysBetween <= 95) {
                equivalentWeeklyRate = amount / 13;
              } else if (daysBetween <= 185) {
                equivalentWeeklyRate = amount / 26;
              } else {
                equivalentWeeklyRate = amount / 52;
              }
            } else if (index > 0) {
              // For last item, use previous payment's frequency
              const currentDate = new Date(div.exDate);
              const prevDate = new Date(array[index - 1].exDate);
              const daysBetween = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

              if (daysBetween <= 10) {
                equivalentWeeklyRate = amount;
              } else if (daysBetween <= 35) {
                equivalentWeeklyRate = amount / 4.33;
              } else if (daysBetween <= 95) {
                equivalentWeeklyRate = amount / 13;
              } else if (daysBetween <= 185) {
                equivalentWeeklyRate = amount / 26;
              } else {
                equivalentWeeklyRate = amount / 52;
              }
            }
          }

          return {
            exDate: div.exDate,
            amount: Number(amount.toFixed(4)), // Ensure amount is always a valid number with proper precision
            adjAmount: div.adjAmount,
            scaledAmount: div.scaledAmount,
            payDate: div.payDate,
            recordDate: div.recordDate,
            declareDate: div.declareDate,
            type: div.type,
            frequency: div.frequency,
            description: div.description,
            currency: div.currency,
            equivalentWeeklyRate: equivalentWeeklyRate !== null && typeof equivalentWeeklyRate === 'number' && !isNaN(equivalentWeeklyRate) && isFinite(equivalentWeeklyRate) ? Number(equivalentWeeklyRate.toFixed(4)) : null,
          };
        }).filter(item => item.amount > 0); // Filter out any items with zero or invalid amounts

        return (
          <div className="mb-4 sm:mb-6">
            <h3 className="text-xs sm:text-sm font-medium mb-3 sm:mb-4">
              {frequencyChanged
                ? `${ticker} Dividend History: Individual Payments vs. Equivalent Weekly Rate`
                : `Dividend Payments by Ex-Date`}
            </h3>
            <ResponsiveContainer width="100%" height={450} className="sm:h-[450px]">
              {frequencyChanged ? (
                <ComposedChart
                  data={chartData}
                  margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="exDate"
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => {
                      if (!value) return '';
                      try {
                        return new Date(value).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                      } catch {
                        return '';
                      }
                    }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => {
                      if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
                        return `$${value.toFixed(2)}`;
                      }
                      return '';
                    }}
                    width={50}
                    domain={[0, 'dataMax']}
                    allowDataOverflow={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.98)",
                      border: "none",
                      borderRadius: "8px",
                      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                    }}
                    formatter={(value: number | string, name: string) => {
                      const numValue = typeof value === 'number' ? value : parseFloat(String(value));
                      if (typeof numValue === 'number' && !isNaN(numValue) && isFinite(numValue)) {
                        if (name === 'amount') {
                          return [`$${numValue.toFixed(4)}`, 'Individual Payment Amount (Monthly/Weekly)'];
                        } else if (name === 'equivalentWeeklyRate') {
                          return [`$${numValue.toFixed(4)}`, 'Equivalent Weekly Rate (Rate Normalized to Weekly Payout)'];
                        }
                        return [`$${numValue.toFixed(4)}`, name];
                      }
                      return ['N/A', name];
                    }}
                    labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  />
                  <Bar dataKey="amount" fill="#93c5fd" radius={[2, 2, 0, 0]} name="Individual Payment Amount (Monthly/Weekly)" minPointSize={3} />
                  <Line
                    type="monotone"
                    dataKey="equivalentWeeklyRate"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', r: 3 }}
                    name="Equivalent Weekly Rate (Rate Normalized to Weekly Payout)"
                  />
                </ComposedChart>
              ) : (
                <BarChart
                  data={chartData}
                  margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="exDate"
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => {
                      if (!value) return '';
                      try {
                        return new Date(value).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                      } catch {
                        return '';
                      }
                    }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => {
                      if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
                        return `$${value.toFixed(2)}`;
                      }
                      return '';
                    }}
                    width={50}
                    domain={[0, 'dataMax']}
                    allowDataOverflow={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.98)",
                      border: "none",
                      borderRadius: "8px",
                      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                    }}
                    formatter={(value: number | string) => {
                      const numValue = typeof value === 'number' ? value : parseFloat(String(value));
                      if (typeof numValue === 'number' && !isNaN(numValue) && isFinite(numValue)) {
                        return [`$${numValue.toFixed(4)}`, 'Dividend'];
                      }
                      return ['N/A', 'Dividend'];
                    }}
                    labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  />
                  <Bar
                    dataKey="amount"
                    fill="#3b82f6"
                    radius={[2, 2, 0, 0]}
                    minPointSize={3}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        );
      })()}

      {chartData.length > 0 && (
        <div className="mb-6 sm:mb-8">
          <h3 className="text-xs sm:text-sm font-medium mb-3 sm:mb-4">Annual Dividend Totals</h3>
          <ResponsiveContainer width="100%" height={150} className="sm:h-[200px]">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="year"
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value.toFixed(2)}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.98)",
                  border: "none",
                  borderRadius: "8px",
                  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                }}
                formatter={(value: number, name: string) => [
                  `$${value.toFixed(4)}`,
                  'Total Dividends'
                ]}
                labelFormatter={(label) => `Year ${label}`}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === chartData.length - 1 ? '#3b82f6' : '#93c5fd'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <div className="mb-3 sm:mb-4">
          <h3 className="text-xs sm:text-sm font-medium mb-2">Dividend Payout Schedule</h3>
          <p className="text-xs text-muted-foreground">
            <strong>Amount:</strong> Original dividend paid. <strong>Scaled Amount:</strong> Adjusted to today's share price level (accounts for splits and dividends over time).
            Use Scaled Amount to compare historical dividends on equal footing with current prices.
          </p>
        </div>
        <div className="border rounded-lg overflow-hidden overflow-x-auto -mx-3 sm:mx-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="font-semibold text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">Year</TableHead>
                <TableHead className="font-semibold text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap" title="Original dividend amount paid">Amount</TableHead>
                <TableHead className="font-semibold text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap" title="Split-adjusted dividend">Adj. Amount</TableHead>
                <TableHead className="font-semibold text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">Dividend Type</TableHead>
                <TableHead className="font-semibold text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">Frequency</TableHead>
                <TableHead className="font-semibold text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">Ex-Div Date</TableHead>
                <TableHead className="font-semibold text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">Record Date</TableHead>
                <TableHead className="font-semibold text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">Pay Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recordsByYear.map(({ year, records }, yearIndex) => {
                const yearTotal = records.reduce((sum, r) => sum + (r.adjAmount ?? r.amount), 0);
                const sortedRecords = [...records].sort((a, b) =>
                  new Date(b.exDate).getTime() - new Date(a.exDate).getTime()
                );
                const isLastYear = yearIndex === recordsByYear.length - 1;

                return (
                  <React.Fragment key={year}>
                    {sortedRecords.map((div, idx) => {
                      const exDate = new Date(div.exDate);
                      const exDateStr = div.exDate.split('T')[0];
                      const isFirstInYear = idx === 0;
                      const isLastInYear = idx === sortedRecords.length - 1;

                      // Try to get dates from Tiingo Corporate Actions first, fall back to basic Tiingo data
                      const corpActionDates = corporateActionDates.get(exDateStr);
                      let payDate: Date | null = null;
                      let recordDate: Date | null = null;

                      if (corpActionDates?.paymentDate) {
                        const pd = new Date(corpActionDates.paymentDate);
                        if (!isNaN(pd.getTime())) payDate = pd;
                      } else if (div.payDate) {
                        const pd = new Date(div.payDate);
                        if (!isNaN(pd.getTime())) payDate = pd;
                      }

                      if (corpActionDates?.recordDate) {
                        const rd = new Date(corpActionDates.recordDate);
                        if (!isNaN(rd.getTime())) recordDate = rd;
                      } else if (div.recordDate) {
                        const rd = new Date(div.recordDate);
                        if (!isNaN(rd.getTime())) recordDate = rd;
                      }

                      const typeLabel = div.type === 'Special' ? 'Special' : 'Regular';

                      // Use frequency from API, which now detects per-payment frequency
                      const frequency = div.frequency || 'Monthly';

                      return (
                        <React.Fragment key={`${year}-${idx}`}>
                          <TableRow className={`hover:bg-slate-50 ${isFirstInYear && yearIndex > 0 ? 'border-t-2 border-slate-300' : ''}`}>
                            <TableCell className={`font-medium text-xs sm:text-sm px-2 sm:px-4 py-2 ${isFirstInYear ? 'font-semibold' : 'text-muted-foreground'}`}>
                              {isFirstInYear ? year : ''}
                            </TableCell>
                            <TableCell className="font-mono text-green-600 text-xs sm:text-sm px-2 sm:px-4 py-2">
                              ${div.amount.toFixed(4)}
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground text-xs sm:text-sm px-2 sm:px-4 py-2">
                              ${(div.adjAmount ?? div.amount).toFixed(4)}
                            </TableCell>
                            <TableCell className="px-2 sm:px-4 py-2">
                              <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs ${typeLabel === 'Special'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-700'
                                }`}>
                                {typeLabel}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs sm:text-sm px-2 sm:px-4 py-2">
                              {frequency}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm px-2 sm:px-4 py-2 whitespace-nowrap">
                              {exDate.toLocaleDateString('en-US', {
                                month: 'numeric',
                                day: 'numeric',
                                year: '2-digit',
                              })}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm px-2 sm:px-4 py-2 whitespace-nowrap">
                              {recordDate && !isNaN(recordDate.getTime())
                                ? recordDate.toLocaleDateString('en-US', {
                                  month: 'numeric',
                                  day: 'numeric',
                                  year: '2-digit',
                                })
                                : '_'}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm px-2 sm:px-4 py-2 whitespace-nowrap">
                              {payDate && !isNaN(payDate.getTime())
                                ? payDate.toLocaleDateString('en-US', {
                                  month: 'numeric',
                                  day: 'numeric',
                                  year: '2-digit',
                                })
                                : '_'}
                            </TableCell>
                          </TableRow>
                          {isLastInYear && (
                            <>
                              <TableRow className="bg-slate-50 border-t-2 border-slate-300">
                                <TableCell className="font-semibold text-xs sm:text-sm px-2 sm:px-4 py-3">
                                  {`Subtotal ${year}`}
                                </TableCell>
                                <TableCell className="font-semibold font-mono text-green-600 text-xs sm:text-sm px-2 sm:px-4 py-3">
                                  ${yearTotal.toFixed(4)}
                                </TableCell>
                                <TableCell className="font-semibold font-mono text-green-600 text-xs sm:text-sm px-2 sm:px-4 py-3">
                                  ${yearTotal.toFixed(4)}
                                </TableCell>
                                <TableCell colSpan={5} className="px-2 sm:px-4 py-3"></TableCell>
                              </TableRow>
                              {!isLastYear && (
                                <TableRow className="border-b-4 border-transparent">
                                  <TableCell colSpan={8} className="py-4 px-2 sm:px-4 bg-transparent"></TableCell>
                                </TableRow>
                              )}
                            </>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {getFilteredTableRecords.length > recordsByYear.reduce((sum, { year, records }) => sum + (expandedYears.has(year) ? records.length : Math.min(4, records.length)), 0) && (
          <div className="mt-4 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllRecords(!showAllRecords)}
              className="gap-2"
            >
              {showAllRecords ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Show All ({getFilteredTableRecords.length} records)
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t flex flex-col gap-2 text-[10px] sm:text-xs text-muted-foreground">
        <p className="flex items-start sm:items-center">
          <DollarSign className="h-3 w-3 inline mr-1 flex-shrink-0 mt-0.5 sm:mt-0" />
          <span>Amounts shown are per-share cash dividends.</span>
        </p>
        <p className="sm:text-right">
          Last updated: {new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })} • Source: Tiingo{corporateActionDates.size > 0 ? ' (Corporate Actions)' : ''}
        </p>
      </div>
    </Card>
  );
}

export default DividendHistory;
