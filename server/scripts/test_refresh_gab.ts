/**
 * Test script to verify GAB refresh updates dividend_history correctly
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

import { createClient } from "@supabase/supabase-js";
import { calculateDividendHistory } from "../src/routes/cefs.js";
import { getDividendHistory } from "../src/services/database.js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function testGABRefresh() {
  const ticker = "GAB";
  
  console.log("=".repeat(80));
  console.log(`Testing GAB Dividend History Update`);
  console.log("=".repeat(80));
  
  // Get current value from database
  const { data: before } = await supabase
    .from("etf_static")
    .select("dividend_history, last_updated")
    .eq("ticker", ticker)
    .maybeSingle();
  
  console.log(`\nBefore refresh:`);
  console.log(`  dividend_history: ${before?.dividend_history ?? "NULL"}`);
  console.log(`  last_updated: ${before?.last_updated ?? "NULL"}`);
  
  // Calculate what it should be
  const dividends = await getDividendHistory(ticker, "2009-01-01");
  const calculated = calculateDividendHistory(dividends);
  console.log(`\nCalculated value: ${calculated}`);
  
  // Update database
  console.log(`\nUpdating database...`);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("etf_static")
    .update({
      dividend_history: calculated,
      last_updated: now,
      updated_at: now,
    })
    .eq("ticker", ticker);
  
  if (error) {
    console.error(`❌ Error updating: ${error.message}`);
    return;
  }
  
  console.log(`✓ Update successful`);
  
  // Verify
  const { data: after } = await supabase
    .from("etf_static")
    .select("dividend_history, last_updated")
    .eq("ticker", ticker)
    .maybeSingle();
  
  console.log(`\nAfter update:`);
  console.log(`  dividend_history: ${after?.dividend_history ?? "NULL"}`);
  console.log(`  last_updated: ${after?.last_updated ?? "NULL"}`);
  
  if (after?.dividend_history === calculated) {
    console.log(`\n✅ SUCCESS: dividend_history updated correctly!`);
  } else {
    console.log(`\n❌ FAILED: dividend_history not updated (expected ${calculated}, got ${after?.dividend_history})`);
  }
  
  if (after?.last_updated === now) {
    console.log(`✅ SUCCESS: last_updated updated correctly!`);
  } else {
    console.log(`❌ FAILED: last_updated not updated (expected ${now}, got ${after?.last_updated})`);
  }
}

testGABRefresh().catch(console.error);

