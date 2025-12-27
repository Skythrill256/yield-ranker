/**
 * Test Script: Dividend History Calculation
 * 
 * Tests the new dividend history calculation using:
 * - UNADJUSTED dividends (div_cash) only
 * - Date range from 2009-01-01 onwards
 * - "Verified Date" rule (changes confirmed by next payment)
 * 
 * Usage: npx tsx server/scripts/test_dividend_history.ts <TICKER>
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
const envPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
  path.resolve(__dirname, "../.env"),
];

for (const envPath of envPaths) {
  try {
    dotenv.config({ path: envPath });
    break;
  } catch (e) {
    // Continue
  }
}

import { getDividendHistory } from "../src/services/database.js";
import type { DividendRecord } from "../src/types/index.js";

/**
 * Calculate Dividend History using "Verified Date" rule
 * Uses UNADJUSTED dividends (div_cash) from 2009-01-01 onwards
 */
function calculateDividendHistory(dividends: DividendRecord[]): string {
  if (!dividends || dividends.length < 2) {
    return dividends.length === 1 ? "1 DIV+" : "0+ 0-";
  }

  // Step 1: Filter to regular dividends only (exclude special dividends)
  const regularDivs = dividends
    .filter((d) => {
      if (!d.div_type) return true;
      const dtype = d.div_type.toLowerCase();
      return (
        dtype.includes("regular") ||
        dtype === "cash" ||
        dtype === "" ||
        !dtype.includes("special")
      );
    })
    .sort((a, b) => {
      const aManual = a.is_manual === true ? 1 : 0;
      const bManual = b.is_manual === true ? 1 : 0;
      if (aManual !== bManual) {
        return bManual - aManual;
      }
      return new Date(b.ex_date).getTime() - new Date(a.ex_date).getTime();
    });

  if (regularDivs.length < 2) {
    return regularDivs.length === 1 ? "1 DIV+" : "0+ 0-";
  }

  // Step 2: Sort to chronological order (oldest first)
  const chronological = [...regularDivs].reverse();

  // Step 3: Filter to only dividends from 2009-01-01 onwards
  const cutoffDate = new Date("2009-01-01");
  const filteredChronological = chronological.filter((d) => {
    const exDate = new Date(d.ex_date);
    return exDate >= cutoffDate;
  });

  if (filteredChronological.length < 2) {
    return filteredChronological.length === 1 ? "1 DIV+" : "0+ 0-";
  }

  // Step 4: Use "Verified Date" rule to count increases/decreases
  // IMPORTANT: Use UNADJUSTED dividends (div_cash) only - not adj_amount
  // Logic: A change is only counted if the NEXT payment verifies it
  // - Increase: if prev < current AND next >= current (verified)
  // - Decrease: if prev > current AND next <= current (verified)
  let increases = 0;
  let decreases = 0;

  console.log(`\n${"=".repeat(80)}`);
  console.log(`DIVIDEND HISTORY CALCULATION (Verified Date Rule)`);
  console.log(`Using UNADJUSTED dividends (div_cash) from 2009-01-01 onwards`);
  console.log(`${"=".repeat(80)}`);
  console.log(`Total dividends after filtering: ${filteredChronological.length}`);
  console.log(`\nFirst 10 dividends (chronological order):`);
  filteredChronological.slice(0, 10).forEach((d, i) => {
    const date = new Date(d.ex_date).toISOString().split('T')[0];
    console.log(`  ${i + 1}. ${date}: $${(d.div_cash ?? 0).toFixed(4)} (unadjusted)`);
  });

  console.log(`\n${"-".repeat(80)}`);
  console.log(`VERIFIED DATE COMPARISONS:`);
  console.log(`${"-".repeat(80)}`);

  for (let i = 1; i < filteredChronological.length - 1; i++) {
    const previous = filteredChronological[i - 1];
    const current = filteredChronological[i];
    const next = filteredChronological[i + 1];

    // Use UNADJUSTED div_cash only (from Tiingo table data)
    const prevAmount = previous.div_cash ?? 0;
    const currentAmount = current.div_cash ?? 0;
    const nextAmount = next.div_cash ?? 0;

    // Skip if any amount is invalid
    if (!prevAmount || !currentAmount || !nextAmount || 
        prevAmount <= 0 || currentAmount <= 0 || nextAmount <= 0) {
      continue;
    }

    const prevDate = new Date(previous.ex_date).toISOString().split('T')[0];
    const currDate = new Date(current.ex_date).toISOString().split('T')[0];
    const nextDate = new Date(next.ex_date).toISOString().split('T')[0];

    // Check for increase: previous < current AND next >= current (verified by next payment)
    if (prevAmount < currentAmount && nextAmount >= currentAmount) {
      increases++;
      console.log(`  ✓ INCREASE #${increases}: ${prevDate} ($${prevAmount.toFixed(4)}) → ${currDate} ($${currentAmount.toFixed(4)}) → ${nextDate} ($${nextAmount.toFixed(4)}) ✓ VERIFIED`);
    }
    // Check for decrease: previous > current AND next <= current (verified by next payment)
    else if (prevAmount > currentAmount && nextAmount <= currentAmount) {
      decreases++;
      console.log(`  ✓ DECREASE #${decreases}: ${prevDate} ($${prevAmount.toFixed(4)}) → ${currDate} ($${currentAmount.toFixed(4)}) → ${nextDate} ($${nextAmount.toFixed(4)}) ✓ VERIFIED`);
    }
    // If amounts are equal or change is not verified, don't count
  }

  const result = `${increases}+ ${decreases}-`;
  console.log(`\n${"=".repeat(80)}`);
  console.log(`RESULT: ${result}`);
  console.log(`${"=".repeat(80)}\n`);

  return result;
}

async function testDividendHistory(ticker: string) {
  console.log(`Testing Dividend History Calculation for ${ticker}`);
  console.log(`Date range: 2009-01-01 to today`);
  console.log(`Using: UNADJUSTED dividends (div_cash) only\n`);

  try {
    // Get dividends from 2009-01-01 onwards
    const dividends = await getDividendHistory(ticker, "2009-01-01");
    
    if (!dividends || dividends.length === 0) {
      console.log(`❌ No dividends found for ${ticker} from 2009-01-01 onwards`);
      return;
    }

    console.log(`Found ${dividends.length} dividend records from database`);
    
    const result = calculateDividendHistory(dividends);
    
    console.log(`\n✅ Dividend History: ${result}`);
    
  } catch (error) {
    console.error(`❌ Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Main
const ticker = process.argv[2];
if (!ticker) {
  console.error("Usage: npx tsx server/scripts/test_dividend_history.ts <TICKER>");
  console.error("Example: npx tsx server/scripts/test_dividend_history.ts UTG");
  process.exit(1);
}

testDividendHistory(ticker.toUpperCase()).catch((error) => {
  console.error(`Fatal error: ${error}`);
  process.exit(1);
});

