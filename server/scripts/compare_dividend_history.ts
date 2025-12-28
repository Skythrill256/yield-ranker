/**
 * Compare Database vs Calculated Dividend History
 * 
 * This script queries the database for stored dividend_history values
 * and compares them with our calculated values to identify discrepancies.
 */

import { getDividendHistory } from '../src/services/database.js';
import { getSupabase } from '../src/services/database.js';
import type { DividendRecord } from '../src/types/index.js';

function calculateDividendHistory(dividends: DividendRecord[]): { result: string; increases: number; decreases: number; totalDividends: number; regularDividends: number } {
  if (!dividends || dividends.length < 2) {
    return {
      result: dividends.length === 1 ? "1 DIV+" : "0+ 0-",
      increases: dividends.length === 1 ? 1 : 0,
      decreases: 0,
      totalDividends: dividends.length,
      regularDividends: dividends.length
    };
  }

  const regularDivs = dividends.filter((d) => {
    if (!d.div_type) return true;
    const dtype = d.div_type.toLowerCase();
    return (
      dtype.includes("regular") ||
      dtype === "cash" ||
      dtype === "" ||
      !dtype.includes("special")
    );
  });

  if (regularDivs.length < 2) {
    return {
      result: regularDivs.length === 1 ? "1 DIV+" : "0+ 0-",
      increases: regularDivs.length === 1 ? 1 : 0,
      decreases: 0,
      totalDividends: dividends.length,
      regularDividends: regularDivs.length
    };
  }

  const sorted = [...regularDivs].sort((a, b) => {
    const aManual = a.is_manual === true ? 1 : 0;
    const bManual = b.is_manual === true ? 1 : 0;
    if (aManual !== bManual) {
      return bManual - aManual;
    }
    const aDate = new Date(a.ex_date);
    const bDate = new Date(b.ex_date);
    return bDate.getTime() - aDate.getTime();
  });

  const chronological = [...sorted].reverse();

  let increases = 0;
  let decreases = 0;

  for (let i = 1; i < chronological.length; i++) {
    const current = chronological[i];
    const previous = chronological[i - 1];

    const currentAmount = current.adj_amount ?? current.div_cash;
    const previousAmount = previous.adj_amount ?? previous.div_cash;

    if (currentAmount > previousAmount) {
      increases++;
    } else if (currentAmount < previousAmount) {
      decreases++;
    }
  }

  return {
    result: `${increases}+ ${decreases}-`,
    increases,
    decreases,
    totalDividends: dividends.length,
    regularDividends: regularDivs.length
  };
}

async function getAllCEFTickers(): Promise<string[]> {
  const db = getSupabase();

  const { data, error } = await db
    .from('etf_static')
    .select('ticker, nav_symbol, nav')
    .not('nav_symbol', 'is', null)
    .neq('nav_symbol', '');

  if (error) {
    throw new Error(`Failed to fetch CEF tickers: ${error.message}`);
  }

  const actualCEFs = (data || []).filter((row: any) => {
    return row.ticker !== row.nav_symbol && row.nav !== null && row.nav !== undefined;
  });

  return actualCEFs.map((row: any) => row.ticker);
}

async function compareDividendHistory(): Promise<void> {
  console.log('Fetching all CEF tickers and dividend_history from database...');
  const tickers = await getAllCEFTickers();
  const db = getSupabase();

  const results: Array<{
    ticker: string;
    dbValue: string | null;
    calculatedValue: string;
    calculatedIncreases: number;
    calculatedDecreases: number;
    totalDividends: number;
    regularDividends: number;
    match: boolean;
  }> = [];

  for (const ticker of tickers) {
    try {
      // Get stored value from database
      const { data: cefData, error } = await db
        .from('etf_static')
        .select('ticker, dividend_history')
        .eq('ticker', ticker)
        .maybeSingle();

      const dbValue = cefData?.dividend_history || null;

      // Calculate our value
      const dividends = await getDividendHistory(ticker);
      const calculated = calculateDividendHistory(dividends);

      const match = dbValue === calculated.result;

      results.push({
        ticker,
        dbValue,
        calculatedValue: calculated.result,
        calculatedIncreases: calculated.increases,
        calculatedDecreases: calculated.decreases,
        totalDividends: calculated.totalDividends,
        regularDividends: calculated.regularDividends,
        match
      });
    } catch (error) {
      console.error(`Error processing ${ticker}:`, error);
    }
  }

  // Sort by ticker
  results.sort((a, b) => a.ticker.localeCompare(b.ticker));

  // Output table format
  console.log('\n' + '='.repeat(100));
  console.log('DIVIDEND HISTORY COMPARISON');
  console.log('='.repeat(100));
  console.log('\nTicker | DIV HISTO (DB) | DIV HISTO (Calc) | Increases | Decreases | Total Divs | Regular Divs | Match');
  console.log('-'.repeat(100));

  for (const r of results) {
    const matchSymbol = r.match ? '✓' : '✗';
    console.log(
      `${r.ticker.padEnd(6)} | ${(r.dbValue || 'NULL').padEnd(14)} | ${r.calculatedValue.padEnd(16)} | ${String(r.calculatedIncreases).padStart(9)} | ${String(r.calculatedDecreases).padStart(9)} | ${String(r.totalDividends).padStart(11)} | ${String(r.regularDividends).padStart(13)} | ${matchSymbol}`
    );
  }

  // Also output in the format the user wants
  console.log('\n' + '='.repeat(100));
  console.log('EXPECTED FORMAT OUTPUT:');
  console.log('='.repeat(100));
  console.log('Ticker');
  console.log('DIV HISTO');
  console.log('Increases');
  console.log('Decreases');
  console.log('Total Dividends');
  console.log('Regular Dividends');

  for (const r of results) {
    console.log(r.ticker);
    console.log(r.calculatedValue);
    console.log(r.calculatedIncreases);
    console.log(r.calculatedDecreases);
    console.log(r.totalDividends);
    console.log(r.regularDividends);
    console.log(''); // blank line between tickers
  }
}

async function main() {
  try {
    await compareDividendHistory();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();






