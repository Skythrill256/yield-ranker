/**
 * Recalculate CEF dividend cadence + payments_per_year WITHOUT hitting Tiingo.
 *
 * Why this exists:
 * - The UI displays `#` (payments/year) from `etf_static.payments_per_year`.
 * - That value can become stale or wrong if cadence detection logic changed since the last refresh.
 * - This script recomputes cadence purely from existing `dividends_detail` rows and updates:
 *   - dividends_detail: days_since_prev, pmt_type, frequency, frequency_num, annualized, normalized_div
 *   - etf_static: payments_per_year (and timestamps)
 *
 * Usage:
 *   npm run recalc:cef:frequency -- --ticker THW
 *   npm run recalc:cef:frequency -- --ticker THW --ticker USA
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { calculateNormalizedDividendsForCEFs } from "../src/services/dividendNormalization.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from multiple possible locations (match other scripts)
const envPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../../.env"),
];

let envLoaded = false;
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error && result.parsed && Object.keys(result.parsed).length > 0) {
    console.log(`✓ Loaded .env from: ${envPath}`);
    envLoaded = true;
    break;
  }
}
if (!envLoaded) dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

type DividendRow = {
  id: number;
  ticker: string;
  ex_date: string;
  div_cash: number;
  adj_amount: number | null;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const tickers: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ticker" && i + 1 < args.length) {
      tickers.push(String(args[i + 1]).toUpperCase());
      i++;
    }
  }
  return { tickers };
}

function cadenceFromNormalizedResults(results: Array<{ pmt_type: string; frequency_num: number | null }>): number {
  // Prefer most recent non-special with a known cadence
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];
    if (r.pmt_type === "Special") continue;
    const n = Number(r.frequency_num);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 12; // reasonable default
}

async function recalcOne(ticker: string) {
  const t = ticker.toUpperCase();
  const { data, error } = await supabase
    .from("dividends_detail")
    .select("id,ticker,ex_date,div_cash,adj_amount")
    .eq("ticker", t)
    .order("ex_date", { ascending: true });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as DividendRow[];
  if (rows.length === 0) {
    console.log(`- ${t}: no dividends_detail rows, skipping`);
    return;
  }

  const normalized = calculateNormalizedDividendsForCEFs(
    rows.map((r) => ({
      id: r.id,
      ticker: r.ticker,
      ex_date: r.ex_date,
      div_cash: Number(r.div_cash),
      adj_amount: r.adj_amount !== null ? Number(r.adj_amount) : null,
    }))
  );

  const updates = normalized.map((result) => {
    let frequencyStr: string | null = null;
    if (result.pmt_type === "Special") {
      frequencyStr = "Other";
    } else if (result.frequency_label) {
      frequencyStr = result.frequency_label === "Irregular" ? "Irregular" : result.frequency_label;
    }
    return {
      id: result.id,
      days_since_prev: result.days_since_prev,
      pmt_type: result.pmt_type,
      frequency: frequencyStr,
      frequency_num: result.frequency_num,
      annualized: result.annualized,
      normalized_div: result.normalized_div,
      regular_component: (result as any).regular_component ?? null,
      special_component: (result as any).special_component ?? null,
    };
  });

  // Update dividends_detail in batches (update-by-id, to avoid requiring upsert by PK)
  const BATCH_SIZE = 200;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (u) => {
        const baseUpdate: any = {
          days_since_prev: u.days_since_prev,
          pmt_type: u.pmt_type,
          frequency: u.frequency,
          frequency_num: u.frequency_num,
          annualized: u.annualized,
          normalized_div: u.normalized_div,
        };

        // Try to update component-split columns too (if present in this DB)
        const { error: fullErr } = await supabase
          .from("dividends_detail")
          .update({
            ...baseUpdate,
            regular_component: u.regular_component,
            special_component: u.special_component,
          })
          .eq("id", u.id);

        if (!fullErr) return;

        // Fallback: older schemas without component columns
        const { error: updErr } = await supabase
          .from("dividends_detail")
          .update(baseUpdate)
          .eq("id", u.id);

        if (updErr) throw new Error(`[${t}] dividends_detail update failed for id=${u.id}: ${updErr.message}`);
      })
    );
  }

  const paymentsPerYear = cadenceFromNormalizedResults(
    normalized.map((r) => ({ pmt_type: r.pmt_type, frequency_num: r.frequency_num }))
  );

  const now = new Date().toISOString();
  const { error: staticErr } = await supabase
    .from("etf_static")
    .update({
      payments_per_year: paymentsPerYear,
      last_updated: now,
      updated_at: now,
    })
    .eq("ticker", t);
  if (staticErr) throw new Error(`[${t}] etf_static update failed: ${staticErr.message}`);

  console.log(`✓ ${t}: updated cadence → payments_per_year=${paymentsPerYear} (dividends updated: ${updates.length})`);
}

async function main() {
  const { tickers } = parseArgs();
  if (tickers.length === 0) {
    console.error("Usage: npm run recalc:cef:frequency -- --ticker SYMBOL [--ticker SYMBOL...]");
    process.exit(1);
  }

  for (const t of tickers) {
    await recalcOne(t);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


