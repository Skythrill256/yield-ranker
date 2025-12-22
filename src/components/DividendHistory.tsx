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
  Tooltip as RechartsTooltip,
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
import { Loader2, ChevronDown, ChevronUp, DollarSign, TrendingUp, TrendingDown, BarChart3, Clock } from "lucide-react";
import { fetchDividends, fetchDividendDates, type DividendData, type DividendRecord, type DividendDates } from "@/services/tiingoApi";

interface DividendHistoryProps {
  ticker: string;
  annualDividend?: number | null;
  dvi?: number | null;
  forwardYield?: number | null;
  numPayments?: number | null; // Number of payments per year (for CEFs)
}

interface YearlyDividend {
  year: number;
  total: number;
  count: number;
  avgAmount: number;
  dividends: DividendRecord[];
}

type TimeRange = '1Y' | '3Y' | '5Y' | '10Y' | '20Y' | 'ALL';

export function DividendHistory({ ticker, annualDividend, dvi, forwardYield, numPayments }: DividendHistoryProps) {
  const [dividendData, setDividendData] = useState<DividendData | null>(null);
  const [corporateActionDates, setCorporateActionDates] = useState<Map<string, DividendDates>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [timeRange, setTimeRange] = useState<TimeRange>('5Y');

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
    // Use filtered dividends to match what's shown in the table
    const filteredDivs = getFilteredDividends;
    if (!filteredDivs || filteredDivs.length === 0) return [];

    const result: YearlyDividend[] = [];
    const dividendsByYear = new Map<number, DividendRecord[]>();

    filteredDivs.forEach(d => {
      const year = new Date(d.exDate).getFullYear();
      if (!dividendsByYear.has(year)) {
        dividendsByYear.set(year, []);
      }
      dividendsByYear.get(year)!.push(d);
    });

    dividendsByYear.forEach((divs, year) => {
      // Always use adjAmount for dividend history charts (no fallback to amount)
      // This ensures accuracy and consistency with split-adjusted amounts
      const total = divs.reduce((sum, d) => {
        // Always use adjAmount - must be a valid number
        const adjAmt = typeof d.adjAmount === 'number' && !isNaN(d.adjAmount) && isFinite(d.adjAmount) && d.adjAmount > 0
          ? d.adjAmount
          : 0;
        return sum + adjAmt;
      }, 0);
      // Only include years with valid totals
      if (total > 0) {
        result.push({
          year,
          total,
          count: divs.length,
          avgAmount: total / divs.length,
          dividends: divs,
        });
      }
    });

    return result.sort((a, b) => a.year - b.year);
  }, [getFilteredDividends]);

  // Calculate chart data and frequency change detection
  const individualChartData = useMemo(() => {
    if (getFilteredDividends.length === 0) return null;

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
      .filter((f): f is 'weekly' | 'monthly' | 'quarterly' | 'semi-annual' | 'annual' => f !== null);

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

    // Calculate normalized rate only if frequency actually changed
    // Use actual payment frequency (numPayments) when available, otherwise detect from intervals
    const chartData = dividends.map((div, index, array) => {
      let normalizedRate: number | null = null;

      // Always use adjAmount for dividend history charts (no fallback to amount)
      // This ensures accuracy and consistency with split-adjusted amounts
      const amount = (typeof div.adjAmount === 'number' && !isNaN(div.adjAmount) && isFinite(div.adjAmount) && div.adjAmount > 0)
        ? div.adjAmount
        : 0;

      // Only normalize if frequency actually changed
      if (frequencyChanged && amount > 0) {
        // Determine payment frequency:
        // 1. Use numPayments if provided (for CEFs)
        // 2. Otherwise detect from days between payments
        let paymentsPerYear: number | null = null;
        
        if (numPayments && numPayments > 0) {
          // Use provided numPayments (e.g., 12 for monthly, 4 for quarterly, etc.)
          paymentsPerYear = numPayments;
        } else {
          // Detect frequency from days between payments
          let daysBetween: number | null = null;
          
          if (index < array.length - 1) {
            const currentDate = new Date(div.exDate);
            const nextDate = new Date(array[index + 1].exDate);
            daysBetween = (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24);
          } else if (index > 0) {
            const currentDate = new Date(div.exDate);
            const prevDate = new Date(array[index - 1].exDate);
            daysBetween = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
          }
          
          if (daysBetween) {
            // Convert days between payments to payments per year
            if (daysBetween <= 10) {
              paymentsPerYear = 52; // Weekly
            } else if (daysBetween <= 35) {
              paymentsPerYear = 12; // Monthly
            } else if (daysBetween <= 95) {
              paymentsPerYear = 4; // Quarterly
            } else if (daysBetween <= 185) {
              paymentsPerYear = 2; // Semi-annual
            } else {
              paymentsPerYear = 1; // Annual
            }
          }
        }
        
        // Calculate normalized rate based on actual payment frequency
        // Normalize to the actual payment period, not always weekly
        if (paymentsPerYear) {
          // Calculate annualized dividend from this payment
          const annualizedFromPayment = amount * paymentsPerYear;
          // Normalize to the payment frequency (not weekly)
          // For monthly (12 payments/year): normalized = annualized / 12
          // For quarterly (4 payments/year): normalized = annualized / 4
          // etc.
          normalizedRate = annualizedFromPayment / paymentsPerYear;
        }
      }

      // Ensure amount is a valid number
      const validAmount = typeof amount === 'number' && !isNaN(amount) && isFinite(amount) && amount > 0
        ? Number(amount.toFixed(4))
        : 0;
      
      // Ensure normalizedRate is a valid number or null
      const validNormalizedRate = normalizedRate !== null && typeof normalizedRate === 'number' && !isNaN(normalizedRate) && isFinite(normalizedRate)
        ? Number(normalizedRate.toFixed(4))
        : null;

      return {
        exDate: div.exDate,
        amount: validAmount,
        adjAmount: div.adjAmount,
        scaledAmount: div.scaledAmount,
        payDate: div.payDate,
        recordDate: div.recordDate,
        declareDate: div.declareDate,
        type: div.type,
        frequency: div.frequency,
        description: div.description,
        currency: div.currency,
        normalizedRate: validNormalizedRate,
      };
    }).filter(item => {
      // Filter out items with invalid amounts or NaN values
      return item.amount > 0 && 
             typeof item.amount === 'number' && 
             !isNaN(item.amount) && 
             isFinite(item.amount) &&
             (item.normalizedRate === null || (typeof item.normalizedRate === 'number' && !isNaN(item.normalizedRate) && isFinite(item.normalizedRate)));
    });

    return { chartData, frequencyChanged };
  }, [getFilteredDividends]);

  const chartData = useMemo(() => {
    // Determine how many years to show based on available data
    // Show 15 years if available, otherwise 10 years, otherwise all available
    const totalYears = yearlyDividends.length;
    const yearsToShow = totalYears >= 15 ? 15 : totalYears >= 10 ? 10 : totalYears;
    
    // Get the last N years (most recent) and display oldest to newest (left to right)
    return yearlyDividends
      .slice(-yearsToShow)
      .map(y => {
        const total = typeof y.total === 'number' && !isNaN(y.total) && isFinite(y.total) && y.total > 0
          ? Number(y.total.toFixed(4))
          : 0;
        return {
          year: y.year.toString(),
          total,
          count: y.count,
        };
      })
      .filter(y => y.total > 0); // Only include entries with valid totals
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
          fetchDividends(ticker, 15),
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
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </Card>
      </div>
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

  const handleViewTotalReturnChart = () => {
    // Check if we're on the ETFDetail page
    const chartSection = document.querySelector('[data-chart-section]');
    if (chartSection) {
      // Scroll to chart on same page
      chartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // Navigate to ETFDetail page - the chart will be visible
      window.location.href = `/etf/${ticker}`;
    }
  };

  return (
    <Card className="p-3 sm:p-4 md:p-6">

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

      {individualChartData && individualChartData.chartData && individualChartData.chartData.length > 0 && individualChartData.chartData.some(d => d.amount > 0 && !isNaN(d.amount)) ? (
        <div className="mb-4 sm:mb-6">
          <h3 className="text-xs sm:text-sm font-medium mb-3 sm:mb-4">
            {individualChartData.frequencyChanged
              ? `Dividend History: Individual Adjusted Dividends vs. Normalized Rate`
              : `Dividend Payments by Ex-Date`}
          </h3>
          <div className="relative">
            <ResponsiveContainer width="100%" height={210} className="sm:h-[315px] landscape:h-[245px] landscape:sm:h-[280px]">
              {individualChartData.frequencyChanged ? (
                <ComposedChart
                  data={individualChartData.chartData.filter(d => d.amount > 0 && !isNaN(d.amount) && isFinite(d.amount))}
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
                  <RechartsTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      
                      const data = payload[0]?.payload;
                      if (!data) return null;
                      
                      const date = new Date(label);
                      const exDateStr = `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},${date.getFullYear()}`;
                      
                      const amount = payload.find(p => p.dataKey === 'amount')?.value;
                      const normalizedRate = payload.find(p => p.dataKey === 'normalizedRate')?.value;
                      
                      const amountValue = typeof amount === 'number' ? amount : parseFloat(String(amount || 0));
                      const normalizedValue = typeof normalizedRate === 'number' ? normalizedRate : parseFloat(String(normalizedRate || 0));
                      
                      return (
                        <div
                          style={{
                            backgroundColor: "rgba(255, 255, 255, 0.98)",
                            border: "none",
                            borderRadius: "8px",
                            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                            padding: "8px 12px",
                          }}
                        >
                          <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                            Ex-Date: {exDateStr}
                          </div>
                          {!isNaN(amountValue) && isFinite(amountValue) && (
                            <div style={{ fontSize: '12px' }}>
                              Actual Div: {amountValue.toFixed(4)}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="amount" fill="#93c5fd" radius={[2, 2, 0, 0]} name="Individual Payment Amount (Monthly/Weekly)" minPointSize={3} />
                </ComposedChart>
              ) : (
                <BarChart
                  data={individualChartData.chartData.filter(d => d.amount > 0 && !isNaN(d.amount) && isFinite(d.amount))}
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
                  <RechartsTooltip
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
                    labelFormatter={(label) => {
                      const date = new Date(label);
                      return `Ex-Date: ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                    }}
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
            <div className="text-center text-xs text-muted-foreground mt-1">
              Adjusted Dividends Bar Chart
            </div>
          </div>
        </div>
      ) : null}

      {chartData.length > 0 && (
        <div className="mb-6 sm:mb-8">
          <h3 className="text-xs sm:text-sm font-medium mb-3 sm:mb-4">Annual Dividend Totals</h3>
          <ResponsiveContainer width="100%" height={140} className="sm:h-[175px] landscape:h-[126px] landscape:sm:h-[154px]">
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
                tickFormatter={(value) => {
                  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
                    return `$${value.toFixed(2)}`;
                  }
                  return '';
                }}
                domain={[0, 'dataMax']}
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.98)",
                  border: "none",
                  borderRadius: "8px",
                  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                }}
                formatter={(value: number | string, name: string) => {
                  const numValue = typeof value === 'number' ? value : parseFloat(String(value));
                  if (typeof numValue === 'number' && !isNaN(numValue) && isFinite(numValue)) {
                    return [`$${numValue.toFixed(4)}`, 'Total Dividends'];
                  }
                  return ['N/A', 'Total Dividends'];
                }}
                labelFormatter={(label) => `Year ${label}`}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index, arr) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === arr.length - 1 ? '#3b82f6' : '#93c5fd'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="text-center text-xs text-muted-foreground mt-1">
            Adjusted Dividends Bar Chart
          </div>
        </div>
      )}

      <div>
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
                // Calculate separate totals for raw and adjusted amounts
                const yearTotalRaw = records.reduce((sum, r) => {
                  const rawAmt = typeof r.amount === 'number' && !isNaN(r.amount) && isFinite(r.amount) && r.amount > 0
                    ? r.amount
                    : 0;
                  return sum + rawAmt;
                }, 0);
                const yearTotalAdj = records.reduce((sum, r) => {
                  const adjAmt = typeof r.adjAmount === 'number' && !isNaN(r.adjAmount) && isFinite(r.adjAmount) && r.adjAmount > 0
                    ? r.adjAmount
                    : (typeof r.amount === 'number' && !isNaN(r.amount) && isFinite(r.amount) && r.amount > 0
                      ? r.amount
                      : 0);
                  return sum + adjAmt;
                }, 0);
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
                                  ${yearTotalRaw.toFixed(4)}
                                </TableCell>
                                <TableCell className="font-semibold font-mono text-green-600 text-xs sm:text-sm px-2 sm:px-4 py-3">
                                  ${yearTotalAdj.toFixed(4)}
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
