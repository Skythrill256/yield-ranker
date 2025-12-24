/**
 * Debug Script: Dividend History Calculation (X+ Y- format)
 * 
 * This script shows exactly how the "DIV HISTO" column values are calculated
 * for CEFs. It provides detailed step-by-step output that can be copied into
 * a Google Doc for review.
 * 
 * Usage:
 *   npx tsx server/scripts/debug_dividend_history.ts <TICKER>
 *   npx tsx server/scripts/debug_dividend_history.ts <TICKER1> <TICKER2> ...
 * 
 * Example:
 *   npx tsx server/scripts/debug_dividend_history.ts UTG GAB
 */

import { getDividendHistory } from '../src/services/database.js';
import type { DividendRecord } from '../src/types/index.js';

// Using DividendRecord type from types/index.js

function calculateDividendHistory(dividends: DividendRecord[]): { result: string; details: any } {
  const details: any = {
    totalDividends: dividends.length,
    step1_filtering: {
      description: "Step 1: Filter to regular dividends only (exclude special dividends)",
      allDividends: dividends.map(d => {
        const exDate = d.ex_date instanceof Date 
          ? d.ex_date.toISOString().split('T')[0]
          : new Date(d.ex_date).toISOString().split('T')[0];
        return {
          exDate,
          divCash: Number(d.div_cash),
          adjAmount: d.adj_amount !== null ? Number(d.adj_amount) : null,
          divType: d.div_type || 'null',
          isRegular: !d.div_type || 
                     d.div_type.toLowerCase().includes('regular') ||
                     d.div_type.toLowerCase() === 'cash' ||
                     d.div_type === '' ||
                     !d.div_type.toLowerCase().includes('special')
        };
      }),
      regularDividends: [] as any[],
      excludedDividends: [] as any[]
    },
    step2_sorting: {
      description: "Step 2: Sort by date (newest first), with manual entries prioritized",
      sortedDividends: [] as any[]
    },
    step3_chronological: {
      description: "Step 3: Reverse to chronological order (oldest first)",
      chronologicalDividends: [] as any[]
    },
    step4_comparisons: {
      description: "Step 4: Compare each dividend to previous one",
      comparisons: [] as any[],
      increases: 0,
      decreases: 0,
      noChange: 0
    },
    finalResult: ""
  };

  // Step 1: Filter to regular dividends
  if (!dividends || dividends.length < 2) {
    const result = dividends.length === 1 ? "1 DIV+" : "0+ 0-";
    details.finalResult = result;
    return { result, details };
  }

  const regularDivs = dividends.filter((d) => {
    const isRegular = !d.div_type || 
                     d.div_type.toLowerCase().includes('regular') ||
                     d.div_type.toLowerCase() === 'cash' ||
                     d.div_type === '' ||
                     !d.div_type.toLowerCase().includes('special');
    
    if (isRegular) {
      const exDate = d.ex_date instanceof Date 
        ? d.ex_date.toISOString().split('T')[0]
        : new Date(d.ex_date).toISOString().split('T')[0];
      details.step1_filtering.regularDividends.push({
        exDate,
        divCash: Number(d.div_cash),
        adjAmount: d.adj_amount !== null ? Number(d.adj_amount) : null,
        divType: d.div_type || 'null'
      });
    } else {
      const exDate = d.ex_date instanceof Date 
        ? d.ex_date.toISOString().split('T')[0]
        : new Date(d.ex_date).toISOString().split('T')[0];
      details.step1_filtering.excludedDividends.push({
        exDate,
        divCash: Number(d.div_cash),
        adjAmount: d.adj_amount !== null ? Number(d.adj_amount) : null,
        divType: d.div_type || 'null',
        reason: 'Special dividend - excluded'
      });
    }
    
    return isRegular;
  });

  if (regularDivs.length < 2) {
    const result = regularDivs.length === 1 ? "1 DIV+" : "0+ 0-";
    details.finalResult = result;
    return { result, details };
  }

  // Step 2: Sort by date (newest first), manual entries prioritized
  const sorted = [...regularDivs].sort((a, b) => {
    const aManual = a.is_manual === true ? 1 : 0;
    const bManual = b.is_manual === true ? 1 : 0;
    if (aManual !== bManual) {
      return bManual - aManual; // Manual entries first
    }
    const aDate = a.ex_date instanceof Date ? a.ex_date : new Date(a.ex_date);
    const bDate = b.ex_date instanceof Date ? b.ex_date : new Date(b.ex_date);
    return bDate.getTime() - aDate.getTime(); // Newest first
  });

  details.step2_sorting.sortedDividends = sorted.map(d => {
    const exDate = d.ex_date instanceof Date 
      ? d.ex_date.toISOString().split('T')[0]
      : new Date(d.ex_date).toISOString().split('T')[0];
    const dateTime = d.ex_date instanceof Date 
      ? d.ex_date.getTime()
      : new Date(d.ex_date).getTime();
    return {
      exDate,
      divCash: Number(d.div_cash),
      adjAmount: d.adj_amount !== null ? Number(d.adj_amount) : null,
      isManual: d.is_manual || false,
      sortKey: `${d.is_manual ? '1' : '0'}_${dateTime}`
    };
  });

  // Step 3: Reverse to chronological order (oldest first)
  const chronological = [...sorted].reverse();

  details.step3_chronological.chronologicalDividends = chronological.map(d => {
    const exDate = d.ex_date instanceof Date 
      ? d.ex_date.toISOString().split('T')[0]
      : new Date(d.ex_date).toISOString().split('T')[0];
    return {
      exDate,
      divCash: Number(d.div_cash),
      adjAmount: d.adj_amount !== null ? Number(d.adj_amount) : null,
      amountUsed: d.adj_amount !== null ? Number(d.adj_amount) : Number(d.div_cash)
    };
  });

  // Step 4: Compare each dividend to previous one
  let increases = 0;
  let decreases = 0;
  let noChange = 0;

  for (let i = 1; i < chronological.length; i++) {
    const current = chronological[i];
    const previous = chronological[i - 1];

    const currentAmount = current.adj_amount ?? current.div_cash;
    const previousAmount = previous.adj_amount ?? previous.div_cash;

    const prevDate = previous.ex_date instanceof Date 
      ? previous.ex_date.toISOString().split('T')[0]
      : new Date(previous.ex_date).toISOString().split('T')[0];
    const currDate = current.ex_date instanceof Date 
      ? current.ex_date.toISOString().split('T')[0]
      : new Date(current.ex_date).toISOString().split('T')[0];
    
    const comparison = {
      comparisonNumber: i,
      previousDate: prevDate,
      previousAmount: previousAmount,
      previousSource: previous.adj_amount !== null ? 'adj_amount' : 'div_cash',
      currentDate: currDate,
      currentAmount: currentAmount,
      currentSource: current.adj_amount !== null ? 'adj_amount' : 'div_cash',
      change: currentAmount - previousAmount,
      changePercent: previousAmount > 0 ? ((currentAmount - previousAmount) / previousAmount * 100).toFixed(2) + '%' : 'N/A',
      result: ''
    };

    if (currentAmount > previousAmount) {
      increases++;
      comparison.result = 'INCREASE (+)';
    } else if (currentAmount < previousAmount) {
      decreases++;
      comparison.result = 'DECREASE (-)';
    } else {
      noChange++;
      comparison.result = 'NO CHANGE';
    }

    details.step4_comparisons.comparisons.push(comparison);
  }

  details.step4_comparisons.increases = increases;
  details.step4_comparisons.decreases = decreases;
  details.step4_comparisons.noChange = noChange;

  const result = `${increases}+ ${decreases}-`;
  details.finalResult = result;

  return { result, details };
}

function formatOutput(ticker: string, result: string, details: any): string {
  let output = `\n${'='.repeat(80)}\n`;
  output += `DIVIDEND HISTORY CALCULATION FOR: ${ticker.toUpperCase()}\n`;
  output += `${'='.repeat(80)}\n\n`;

  output += `FINAL RESULT: ${result}\n\n`;

  output += `${details.step1_filtering.description}\n`;
  output += `${'-'.repeat(80)}\n`;
  output += `Total Dividends in Database: ${details.totalDividends}\n\n`;
  
  if (details.step1_filtering.excludedDividends.length > 0) {
    output += `EXCLUDED (Special Dividends):\n`;
    details.step1_filtering.excludedDividends.forEach((d: any) => {
      output += `  - ${d.exDate}: $${d.divCash.toFixed(4)} (${d.divType})\n`;
    });
    output += `\n`;
  }

  output += `INCLUDED (Regular Dividends): ${details.step1_filtering.regularDividends.length}\n`;
  details.step1_filtering.regularDividends.forEach((d: any, idx: number) => {
    output += `  ${idx + 1}. ${d.exDate}: $${d.divCash.toFixed(4)} (adj: ${d.adjAmount !== null ? '$' + d.adjAmount.toFixed(4) : 'null'}) [${d.divType}]\n`;
  });
  output += `\n`;

  output += `${details.step2_sorting.description}\n`;
  output += `${'-'.repeat(80)}\n`;
  output += `Sorted Order (Newest First, Manual Prioritized):\n`;
  details.step2_sorting.sortedDividends.forEach((d: any, idx: number) => {
    output += `  ${idx + 1}. ${d.exDate}: $${d.adjAmount !== null ? d.adjAmount.toFixed(4) : d.divCash.toFixed(4)} ${d.isManual ? '[MANUAL]' : ''}\n`;
  });
  output += `\n`;

  output += `${details.step3_chronological.description}\n`;
  output += `${'-'.repeat(80)}\n`;
  output += `Chronological Order (Oldest First):\n`;
  details.step3_chronological.chronologicalDividends.forEach((d: any, idx: number) => {
    output += `  ${idx + 1}. ${d.exDate}: $${d.amountUsed.toFixed(4)} (using ${d.adjAmount !== null ? 'adj_amount' : 'div_cash'})\n`;
  });
  output += `\n`;

  output += `${details.step4_comparisons.description}\n`;
  output += `${'-'.repeat(80)}\n`;
  output += `Total Comparisons: ${details.step4_comparisons.comparisons.length}\n\n`;
  
  details.step4_comparisons.comparisons.forEach((comp: any) => {
    output += `Comparison ${comp.comparisonNumber}:\n`;
    output += `  Previous: ${comp.previousDate} = $${comp.previousAmount.toFixed(4)} (from ${comp.previousSource})\n`;
    output += `  Current:  ${comp.currentDate} = $${comp.currentAmount.toFixed(4)} (from ${comp.currentSource})\n`;
    output += `  Change:   $${comp.change.toFixed(4)} (${comp.changePercent})\n`;
    output += `  Result:   ${comp.result}\n\n`;
  });

  output += `SUMMARY:\n`;
  output += `${'-'.repeat(80)}\n`;
  output += `Increases (+): ${details.step4_comparisons.increases}\n`;
  output += `Decreases (-): ${details.step4_comparisons.decreases}\n`;
  output += `No Change:     ${details.step4_comparisons.noChange}\n`;
  output += `\nFINAL RESULT: ${result}\n`;
  output += `${'='.repeat(80)}\n\n`;

  return output;
}

async function debugTicker(ticker: string): Promise<void> {
  try {
    console.log(`\nFetching dividend data for ${ticker.toUpperCase()}...`);
    
    const dividends = await getDividendHistory(ticker.toUpperCase());
    
    if (!dividends || dividends.length === 0) {
      console.log(`\n❌ No dividend data found for ${ticker.toUpperCase()}\n`);
      return;
    }

    console.log(`✓ Found ${dividends.length} dividend records`);

    const { result, details } = calculateDividendHistory(dividends);
    const output = formatOutput(ticker, result, details);
    
    console.log(output);
    
    // Also output JSON for detailed analysis
    console.log(`\n${'='.repeat(80)}`);
    console.log(`DETAILED JSON DATA (for further analysis):`);
    console.log(`${'='.repeat(80)}\n`);
    console.log(JSON.stringify(details, null, 2));
    console.log(`\n`);

  } catch (error) {
    console.error(`\n❌ Error processing ${ticker.toUpperCase()}:`, error);
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: npx tsx server/scripts/debug_dividend_history.ts <TICKER> [TICKER2] ...

Examples:
  npx tsx server/scripts/debug_dividend_history.ts UTG
  npx tsx server/scripts/debug_dividend_history.ts UTG GAB BME

This script shows exactly how the "DIV HISTO" (X+ Y-) values are calculated.
`);
    process.exit(1);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`DIVIDEND HISTORY CALCULATION DEBUG SCRIPT`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Tickers to analyze: ${args.join(', ').toUpperCase()}`);
  console.log(`\n`);

  for (const ticker of args) {
    await debugTicker(ticker);
  }

  // Script complete
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

