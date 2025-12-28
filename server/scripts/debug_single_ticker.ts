/**
 * Debug a single ticker's dividend history
 */

import { getDividendHistory } from '../src/services/database.js';
import type { DividendRecord } from '../src/types/index.js';

async function debugTicker(ticker: string) {
  console.log(`\n=== DEBUGGING ${ticker} ===\n`);

  const dividends = await getDividendHistory(ticker);
  console.log(`Total dividends fetched: ${dividends.length}`);

  // Show first and last 5 dividends
  console.log('\nFirst 5 dividends (newest):');
  dividends.slice(0, 5).forEach((d, i) => {
    const date = new Date(d.ex_date).toISOString().split('T')[0];
    console.log(`  ${i + 1}. ${date}: div_cash=$${d.div_cash}, adj_amount=${d.adj_amount !== null ? '$' + d.adj_amount : 'null'}, type=${d.div_type || 'null'}`);
  });

  console.log('\nLast 5 dividends (oldest):');
  dividends.slice(-5).forEach((d, i) => {
    const date = new Date(d.ex_date).toISOString().split('T')[0];
    console.log(`  ${i + 1}. ${date}: div_cash=$${d.div_cash}, adj_amount=${d.adj_amount !== null ? '$' + d.adj_amount : 'null'}, type=${d.div_type || 'null'}`);
  });

  // Filter regular dividends
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

  console.log(`\nRegular dividends: ${regularDivs.length}`);
  console.log(`Special dividends excluded: ${dividends.length - regularDivs.length}`);

  // Show date range
  if (regularDivs.length > 0) {
    const dates = regularDivs.map(d => {
      return new Date(d.ex_date);
    }).sort((a, b) => a.getTime() - b.getTime());

    const oldest = dates[0];
    const newest = dates[dates.length - 1];
    console.log(`\nDate range: ${oldest.toISOString().split('T')[0]} to ${newest.toISOString().split('T')[0]}`);
    console.log(`Years covered: ${((newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24 * 365)).toFixed(1)}`);
  }
}

const ticker = process.argv[2] || 'BME';
debugTicker(ticker).catch(console.error);






