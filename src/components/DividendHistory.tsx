/**
 * Dividend History Component
 * 
 * Per Section 3.2 of PDF - Displays:
 * - Top half: Line chart of annualized dividend over time (from rolling 365D series)
 * - Below: Bar chart of individual dividend payments by ex-date
 * - Time-range buttons: 1W (if weekly) / 1M / 3M / 6M / 1Y / 3Y / 5Y / 10Y / 20Y
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

type TimeRange = '1W' | '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | '20Y';

export function DividendHistory({ ticker, annualDividend, dvi, forwardYield, numPayments }: DividendHistoryProps) {
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
      case '1W': cutoffDate.setDate(now.getDate() - 7); break;
      case '1M': cutoffDate.setMonth(now.getMonth() - 1); break;
      case '3M': cutoffDate.setMonth(now.getMonth() - 3); break;
      case '6M': cutoffDate.setMonth(now.getMonth() - 6); break;
      case '1Y': cutoffDate.setFullYear(now.getFullYear() - 1); break;
      case '3Y': cutoffDate.setFullYear(now.getFullYear() - 3); break;
      case '5Y': cutoffDate.setFullYear(now.getFullYear() - 5); break;
      case '10Y': cutoffDate.setFullYear(now.getFullYear() - 10); break;
      case '20Y': cutoffDate.setFullYear(now.getFullYear() - 20); break;
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

    // CRITICAL: Only detect frequency changes for REGULAR dividends
    // Special/Initial dividends should not affect frequency change detection
    // Filter to only Regular dividends for frequency detection
    const regularDividends = dividends.filter(div => {
      const pmtType = div.pmtType || (div.daysSincePrev !== undefined && div.daysSincePrev !== null && div.daysSincePrev <= 5 ? 'Special' : 'Regular');
      return pmtType === 'Regular';
    });

    // Only check frequency changes if we have at least 2 regular dividends
    let frequencyChanged = false;
    if (regularDividends.length >= 2) {
      // CRITICAL: Verify frequency consistency using ACTUAL payment intervals
      // Calculate days between consecutive regular dividends to verify consistency
      const intervals: number[] = [];
      for (let i = 0; i < regularDividends.length - 1; i++) {
        const current = regularDividends[i];
        const next = regularDividends[i + 1];
        
        const currentDate = new Date(current.exDate);
        const nextDate = new Date(next.exDate);
        const daysBetween = Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysBetween > 0 && daysBetween < 400) { // Valid interval
          intervals.push(daysBetween);
        }
      }
      
      // If we have intervals, check if they're consistent (all within same frequency range)
      if (intervals.length >= 2) {
        // Determine frequency category for each interval using DAYS FORMULA ranges
        const getFrequencyCategory = (days: number): string => {
          if (days >= 5 && days <= 10) return 'weekly';
          if (days >= 20 && days <= 40) return 'monthly';
          if (days >= 60 && days <= 110) return 'quarterly';
          if (days >= 150 && days <= 210) return 'semi-annual';
          if (days >= 300 && days <= 380) return 'annual';
          return 'irregular';
        };
        
        const categories = intervals.map(getFrequencyCategory);
        const uniqueCategories = new Set(categories);
        
        // If all intervals fall into the same frequency category, frequency hasn't changed
        if (uniqueCategories.size === 1) {
          frequencyChanged = false; // All intervals are consistent - no frequency change
        } else {
          // Intervals fall into different categories - frequency has changed
          frequencyChanged = true;
        }
      } else {
        // Fallback: Check frequencyNum values if we don't have enough intervals
        for (let i = 0; i < regularDividends.length - 1; i++) {
          const current = regularDividends[i];
          const next = regularDividends[i + 1];
          
          const currentFreq = current.frequencyNum;
          const nextFreq = next.frequencyNum;
          
          // Both must have valid frequency numbers
          if (currentFreq !== undefined && currentFreq !== null && 
              nextFreq !== undefined && nextFreq !== null &&
              currentFreq !== nextFreq) {
            // Found a frequency change between consecutive regular dividends
            frequencyChanged = true;
            break;
          }
        }
        
        // If no frequencyNum changes found, check frequency string field as fallback
        if (!frequencyChanged) {
          const frequencies = regularDividends
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

          // Check for actual transitions in frequency strings
          for (let i = 0; i < frequencies.length - 1; i++) {
            if (frequencies[i] !== frequencies[i + 1]) {
              frequencyChanged = true;
              break;
            }
          }
        }
      }
    }

    // Map dividends to chart data
    // Per CEO: "USE ADJ DIV FOR LINE AND UNADJ PRICE FOR BAR"
    // Bars = unadjusted dividend (div.amount = div_cash)
    // Line = normalized column (div.normalizedDiv = normalized_div from database)
    const chartData = dividends.map((div) => {
      // BAR: Use adjusted dividend (div.adjAmount = adj_amount from database)
      // This ensures bars align with normalized line, especially for ETFs with splits
      // Example ULTY 11/25: ADJ_AMT=$0.5940 → bar shows $0.5940 (matches line)
      // Example ULTY 12/2+: ADJ_AMT=$0.5881 → bar shows $0.5881 (matches line)
      // For ETFs without splits: adj_amount = div_cash, so no change
      const amount = (typeof div.adjAmount === 'number' && !isNaN(div.adjAmount) && isFinite(div.adjAmount) && div.adjAmount > 0)
        ? div.adjAmount
        : (typeof div.amount === 'number' && !isNaN(div.amount) && isFinite(div.amount) && div.amount > 0)
          ? div.amount
          : 0;

      // LINE: Use normalized column (div.normalizedDiv = normalized_div from database)
      // This is the NORMALZD column - weekly equivalent rate calculated from adj_amount
      // For weekly (FREQ=52): normalizedDiv = ADJ DIV (e.g., 0.5705 = 0.5705)
      // For monthly (FREQ=12): normalizedDiv = (ADJ DIV × 12) / 52 (e.g., 4.6530 → 1.073769231)
      // Example GOOY: FREQ=52 → normalizedDiv=0.0869, FREQ=12 → normalizedDiv=0.1601538462
      // Example ULTY: FREQ=52 → normalizedDiv=0.5705, FREQ=12 → normalizedDiv=1.073769231
      let normalizedRate: number | null = null;

      // Filter out Special dividends from the line (they would spike artificially)
      const pmtType = div.pmtType || (div.daysSincePrev !== undefined && div.daysSincePrev !== null && div.daysSincePrev <= 5 ? 'Special' : 'Regular');

      if (pmtType === 'Regular') {
        // CRITICAL: Use normalizedDiv directly from database - this is the NORMALZD column
        // For weekly (FREQ=52): normalizedDiv = ADJ DIV (e.g., 0.5705)
        // For monthly (FREQ=12): normalizedDiv = (ADJ DIV × 12) / 52 (e.g., 4.6530 → 1.073769231)
        // The database should have this calculated correctly, but verify it's not null
        if (div.normalizedDiv !== null && div.normalizedDiv !== undefined && !isNaN(div.normalizedDiv) && isFinite(div.normalizedDiv) && div.normalizedDiv > 0) {
          normalizedRate = div.normalizedDiv;
        } else {
          // Fallback: If normalizedDiv is missing, calculate it from adjAmount and frequencyNum
          // This should not happen if refresh_all.ts has run, but handle it gracefully
          const adjAmount = (typeof div.adjAmount === 'number' && !isNaN(div.adjAmount) && isFinite(div.adjAmount) && div.adjAmount > 0)
            ? div.adjAmount
            : null;
          const freqNum = div.frequencyNum || numPayments || 12;
          if (adjAmount !== null && adjAmount > 0) {
            // Calculate normalized: (adj_amount × frequency) / 52
            const annualizedRaw = adjAmount * freqNum;
            normalizedRate = annualizedRaw / 52;
          }
        }
      }
      // For Special/Initial dividends, normalizedRate stays null (skip in line chart)

      // Ensure amount is a valid number
      const validAmount = typeof amount === 'number' && !isNaN(amount) && isFinite(amount) && amount > 0
        ? Number(amount.toFixed(4))
        : 0;

      // Ensure normalizedRate is a valid number or null
      // Use full precision from database (9 decimals) to match spreadsheet exactly
      const validNormalizedRate = normalizedRate !== null && typeof normalizedRate === 'number' && !isNaN(normalizedRate) && isFinite(normalizedRate)
        ? Number(normalizedRate.toFixed(9)) // Use 9 decimals to match database precision
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
        pmtType: div.pmtType,
        frequencyNum: div.frequencyNum,
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
  }, [getFilteredDividends, numPayments]);


  const chartData = useMemo(() => {
    // Determine how many years to show based on available data
    // Show 20 years if available, otherwise 10 years, otherwise all available
    const totalYears = yearlyDividends.length;
    const yearsToShow = totalYears >= 20 ? 20 : totalYears >= 10 ? 10 : totalYears;

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

  // Table should always show ALL historical dividends regardless of chart time range filter
  const getAllTableRecords = useMemo(() => {
    if (!dividendData?.dividends) return [];
    // Return ALL dividends for the table (no time range filtering)
    return dividendData.dividends;
  }, [dividendData]);

  const recordsByYear = useMemo(() => {
    const grouped = new Map<number, DividendRecord[]>();
    getAllTableRecords.forEach(record => {
      const year = new Date(record.exDate).getFullYear();
      if (!grouped.has(year)) {
        grouped.set(year, []);
      }
      grouped.get(year)!.push(record);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => b[0] - a[0]) // Sort descending (newest year first)
      .map(([year, records]) => ({ year, records }));
  }, [getAllTableRecords]);

  // Detect if there are weekly dividends
  const hasWeeklyDividends = useMemo(() => {
    if (!dividendData?.dividends || dividendData.dividends.length < 2) return false;

    // Check numPayments prop (52 = weekly)
    if (numPayments === 52) return true;

    // Check frequency field in recent dividends
    const recentDividends = dividendData.dividends.slice(0, Math.min(10, dividendData.dividends.length));
    const hasWeeklyFrequency = recentDividends.some(div => {
      const freq = String(div.frequency || '').toLowerCase();
      return freq.includes('week') || freq === 'weekly' || freq === 'wk' || freq === 'w';
    });
    if (hasWeeklyFrequency) return true;

    // Check actual payment intervals (if <= 10 days between payments, it's weekly)
    for (let i = 0; i < recentDividends.length - 1; i++) {
      const currentDate = new Date(recentDividends[i].exDate);
      const nextDate = new Date(recentDividends[i + 1].exDate);
      const daysBetween = Math.abs((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysBetween <= 10) return true;
    }

    return false;
  }, [dividendData, numPayments]);

  // Reset timeRange if it's '1W' but there are no weekly dividends
  useEffect(() => {
    if (timeRange === '1W' && !hasWeeklyDividends && dividendData) {
      setTimeRange('1Y');
    }
  }, [timeRange, hasWeeklyDividends, dividendData]);

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
        // Fetch 50 years to support ALL time periods including 20Y and ALL
        // This ensures we get all available dividend history data
        const [tiingoData, corpActionsResponse] = await Promise.all([
          fetchDividends(ticker, 50),
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
        {((hasWeeklyDividends ? ['1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', '10Y', '20Y'] : ['1M', '3M', '6M', '1Y', '3Y', '5Y', '10Y', '20Y']) as TimeRange[]).map((range) => (
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
              ? `Dividend History: Individual Dividends vs. Normalized Rate`
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
                        // Parse date as local to avoid timezone conversion
                        const dateParts = String(value).split('T')[0].split('-');
                        const date = new Date(
                          parseInt(dateParts[0]),
                          parseInt(dateParts[1]) - 1,
                          parseInt(dateParts[2])
                        );
                        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
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

                      // Parse date as local to avoid timezone conversion
                      const labelStr = String(label);
                      const dateParts = labelStr.split('T')[0].split('-');
                      const date = new Date(
                        parseInt(dateParts[0]),
                        parseInt(dateParts[1]) - 1,
                        parseInt(dateParts[2])
                      );
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
                          {!isNaN(normalizedValue) && isFinite(normalizedValue) && normalizedValue > 0 && (
                            <div style={{ fontSize: '12px', color: '#ef4444' }}>
                              Normalized: {normalizedValue.toFixed(4)}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="amount" fill="#93c5fd" radius={[2, 2, 0, 0]} name="Individual Payment Amount" minPointSize={3} />
                  <Line
                    type="monotone"
                    dataKey="normalizedRate"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    name="Normalized Rate"
                    connectNulls={false}
                  />
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
                        // Parse date as local to avoid timezone conversion
                        const dateParts = String(value).split('T')[0].split('-');
                        const date = new Date(
                          parseInt(dateParts[0]),
                          parseInt(dateParts[1]) - 1,
                          parseInt(dateParts[2])
                        );
                        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
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

                      // Parse date as local to avoid timezone conversion
                      const labelStr = String(label);
                      const dateParts = labelStr.split('T')[0].split('-');
                      const date = new Date(
                        parseInt(dateParts[0]),
                        parseInt(dateParts[1]) - 1,
                        parseInt(dateParts[2])
                      );
                      const exDateStr = `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},${date.getFullYear()}`;

                      const amount = payload.find(p => p.dataKey === 'amount')?.value;
                      const amountValue = typeof amount === 'number' ? amount : parseFloat(String(amount || 0));

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
                  <Bar dataKey="amount" fill="#93c5fd" radius={[2, 2, 0, 0]} name="Individual Payment Amount" minPointSize={3} />
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
                      // Parse date as local date to avoid timezone conversion issues
                      // If exDate is "2025-10-16", parse it as local date, not UTC
                      const exDateParts = div.exDate.split('T')[0].split('-');
                      const exDate = new Date(
                        parseInt(exDateParts[0]), // year
                        parseInt(exDateParts[1]) - 1, // month (0-indexed)
                        parseInt(exDateParts[2]) // day
                      );
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

                      // Use pmtType from normalized calculation (Regular/Special/Initial)
                      // Fallback to div.type if pmtType not available
                      const typeLabel = div.pmtType || (div.type === 'Special' ? 'Special' : 'Regular');

                      // Convert frequencyNum to readable string, fallback to frequency field
                      let frequency = 'Monthly'; // Default
                      if (div.frequencyNum) {
                        if (div.frequencyNum === 52) frequency = 'Weekly';
                        else if (div.frequencyNum === 12) frequency = 'Monthly';
                        else if (div.frequencyNum === 4) frequency = 'Quarterly';
                        else if (div.frequencyNum === 2) frequency = 'Semi-Annual';
                        else if (div.frequencyNum === 1) frequency = 'Annual';
                        else frequency = `${div.frequencyNum}x/Yr`;
                      } else if (div.frequency) {
                        frequency = div.frequency;
                      }

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

        {getAllTableRecords.length > recordsByYear.reduce((sum, { year, records }) => sum + (expandedYears.has(year) ? records.length : Math.min(4, records.length)), 0) && (
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
                  Show All ({getAllTableRecords.length} records)
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
