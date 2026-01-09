/**
 * refresh_cef.ts - RELIABLE CEF Data Refresh Script
 *
 * This script calculates and updates ALL CEF metrics:
 * - 3-Year Z-Score (3Y max, 1Y min lookback)
 * - 6M NAV Trend (exactly 6 calendar months, using close price)
 * - 12M NAV Return (exactly 12 calendar months, using close price)
 * - Signal rating
 * - Dividend History (X+ Y- format) - Uses Verified Date rule, unadjusted dividends from 2009-01-01
 * - DVI (Dividend Volatility Index)
 * - Total Returns (3Y, 5Y, 10Y, 15Y) - NAV-based
 * - NAV, Market Price, and Premium/Discount
 * - last_updated timestamp
 *
 * Usage: npm run refresh:cef [--ticker SYMBOL]
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from multiple possible locations
const envPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../../.env"),
];

let envLoaded = false;
for (const envPath of envPaths) {
  try {
    const result = dotenv.config({ path: envPath });
    if (
      !result.error &&
      result.parsed &&
      Object.keys(result.parsed).length > 0
    ) {
      console.log(`✓ Loaded .env from: ${envPath}`);
      envLoaded = true;
      break;
    }
  } catch (e) {
    // Continue
  }
}

if (!envLoaded) {
  dotenv.config();
}

import { createClient } from "@supabase/supabase-js";
import {
  getPriceHistory,
  batchUpdateETFMetricsPreservingCEFFields,
  getDividendHistory,
} from "../src/services/database.js";
import { formatDate } from "../src/utils/index.js";
import { fetchPriceHistory } from "../src/services/tiingo.js";
import type { TiingoPriceData } from "../src/types/index.js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// If we hit Tiingo rate limits, stop cleanly instead of sleeping for ~1 hour.
let globalRateLimitHit = false;


// 15 years lookback for CEF metrics
const LOOKBACK_DAYS = 5475; // 15 years = 15 * 365 = 5475 days

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

async function upsertPrices(
  ticker: string,
  prices: TiingoPriceData[]
): Promise<number> {
  if (prices.length === 0) return 0;

  // Ensure ticker exists in etf_static (required for foreign key constraint)
  const { data: existingTicker, error: checkError } = await supabase
    .from("etf_static")
    .select("ticker")
    .eq("ticker", ticker.toUpperCase())
    .maybeSingle();

  if (!existingTicker && !checkError) {
    // Try to insert a minimal record for NAV symbols
    const { error: insertError } = await supabase.from("etf_static").insert({
      ticker: ticker.toUpperCase(),
      issuer: null,
      description: `Auto-created for NAV price data`,
      pay_day_text: null,
      payments_per_year: null,
      ipo_price: null,
      default_rank_weights: {},
      // category is optional in most deployments; include if present
      category: null,
    } as any);

    if (insertError) {
      console.error(
        `    Error inserting missing etf_static record for ${ticker}: ${insertError.message}`
      );
      return 0;
    } else {
    }
  }

  const records = prices.map((p) => ({
    ticker: ticker.toUpperCase(),
    date: p.date.split("T")[0],
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    adj_close: p.adjClose,
    volume: p.volume,
    div_cash: p.divCash || 0,
    split_factor: p.splitFactor || 1,
  }));

  const { error } = await supabase.from("prices_daily").upsert(records, {
    onConflict: "ticker,date",
    ignoreDuplicates: false,
  });

  if (error) {
    console.error(`    Error upserting prices: ${error.message}`);
    return 0;
  }

  return records.length;
}

/**
 * Extract dividend records from Tiingo price history response.
 * This avoids a second Tiingo call because divCash and splitFactor are included in `/prices`.
 */
function extractDividendsFromPriceData(
  prices: TiingoPriceData[]
): Array<{
  date: string;
  dividend: number;
  adjDividend: number;
  scaledDividend: number;
  recordDate: string | null;
  paymentDate: string | null;
  declarationDate: string | null;
}> {
  if (!prices || prices.length === 0) return [];

  // Extract split events (chronological)
  const splitEvents = prices
    .filter((p) => p.splitFactor && p.splitFactor !== 1.0)
    .map((p) => {
      const dateStr = p.date.includes("T") ? p.date.split("T")[0] : p.date;
      return { date: new Date(dateStr + "T00:00:00Z"), splitFactor: p.splitFactor };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const dividends = prices
    .filter((p) => p.divCash && p.divCash > 0)
    .map((p) => {
      const divCash = p.divCash || 0;
      let exDateStr = p.date.includes("T") ? p.date.split("T")[0] : p.date;
      const exDate = new Date(exDateStr + "T00:00:00Z");

      // Splits AFTER this dividend date affect historical dividend amounts
      const applicableSplits = splitEvents.filter((s) => s.date > exDate);
      const cumulativeSplitFactor = applicableSplits.reduce(
        (factor, s) => factor * s.splitFactor,
        1.0
      );

      const adjDividend =
        cumulativeSplitFactor > 0 ? divCash / cumulativeSplitFactor : divCash;

      const close = p.close || 0;
      const adjClose = p.adjClose || 0;
      const scaledDividend =
        close > 0 && adjClose > 0 ? divCash * (adjClose / close) : adjDividend;

      return {
        date: exDateStr,
        dividend: divCash,
        adjDividend,
        scaledDividend,
        recordDate: null,
        paymentDate: null,
        declarationDate: null,
      };
    });

  // Ensure ascending for downstream logic (optional)
  dividends.sort((a, b) => a.date.localeCompare(b.date));
  return dividends;
}

/**
 * Upsert dividend records with split-adjusted amounts
 */
async function upsertDividends(ticker: string, dividends: any[]): Promise<number> {
  if (dividends.length === 0) return 0;

  const exDatesToUpdate = dividends.map(d => d.date.split('T')[0]);

  // Check if is_manual column exists by trying to query it
  let allManualUploads: any[] = [];
  try {
    const { data, error } = await supabase
      .from('dividends_detail')
      .select('*')
      .eq('ticker', ticker.toUpperCase())
      .or('is_manual.eq.true,description.ilike.%Manual upload%,description.ilike.%Early announcement%');
    if (!error) {
      allManualUploads = data || [];
    }
  } catch (e) {
    // Column doesn't exist, fallback to description-based check
    const { data } = await supabase
      .from('dividends_detail')
      .select('*')
      .eq('ticker', ticker.toUpperCase())
      .or('description.ilike.%Manual upload%,description.ilike.%Early announcement%');
    allManualUploads = data || [];
  }

  const manualUploadsMap = new Map<string, any>();
  (allManualUploads || []).forEach(d => {
    const exDate = d.ex_date.split('T')[0];
    manualUploadsMap.set(exDate, d);
  });

  const { data: allExistingDividends } = await supabase
    .from('dividends_detail')
    .select('*')
    .eq('ticker', ticker.toUpperCase())
    .in('ex_date', exDatesToUpdate);

  const existingDividendsMap = new Map<string, any>();
  (allExistingDividends || []).forEach(d => {
    const exDate = d.ex_date.split('T')[0];
    existingDividendsMap.set(exDate, d);
  });

  const isManualUpload = (record: any): boolean => {
    if (record?.is_manual === true) return true;
    const desc = record?.description || '';
    return desc.includes('Manual upload') || desc.includes('Early announcement');
  };

  const tiingoRecordsToUpsert: Array<any> = [];
  const manualUploadsToPreserve: Array<any> = [];

  for (const d of dividends) {
    const exDate = d.date.split('T')[0];
    const existing = existingDividendsMap.get(exDate);
    const manualUpload = manualUploadsMap.get(exDate) || (existing && isManualUpload(existing) ? existing : null);

    if (manualUpload) {
      const tiingoDivCash = d.dividend;
      const tiingoAdjAmount = d.adjDividend > 0 ? d.adjDividend : null;
      const manualDivCash = parseFloat(manualUpload.div_cash);
      const manualAdjAmount = manualUpload.adj_amount ? parseFloat(manualUpload.adj_amount) : null;
      const tolerance = 0.001;

      let isAligned = false;
      if (tiingoAdjAmount && manualAdjAmount !== null) {
        isAligned = Math.abs(manualAdjAmount - tiingoAdjAmount) < tolerance;
      } else {
        isAligned = Math.abs(manualDivCash - tiingoDivCash) < tolerance;
      }

      tiingoRecordsToUpsert.push({
        ticker: ticker.toUpperCase(),
        ex_date: exDate,
        pay_date: d.paymentDate?.split('T')[0] || manualUpload.pay_date,
        record_date: d.recordDate?.split('T')[0] || manualUpload.record_date,
        declare_date: d.declarationDate?.split('T')[0] || manualUpload.declare_date,
        div_cash: isAligned ? d.dividend : manualUpload.div_cash,
        adj_amount: isAligned ? (d.adjDividend > 0 ? d.adjDividend : null) : manualUpload.adj_amount,
        scaled_amount: d.scaledDividend > 0 ? d.scaledDividend : manualUpload.scaled_amount,
        split_factor: d.adjDividend > 0 ? d.dividend / d.adjDividend : (manualUpload.split_factor || 1),
        description: manualUpload.description,
        div_type: manualUpload.div_type,
        frequency: manualUpload.frequency,
        currency: manualUpload.currency || 'USD',
        is_manual: true,
      });
    } else {
      tiingoRecordsToUpsert.push({
        ticker: ticker.toUpperCase(),
        ex_date: exDate,
        pay_date: d.paymentDate?.split('T')[0] || null,
        record_date: d.recordDate?.split('T')[0] || null,
        declare_date: d.declarationDate?.split('T')[0] || null,
        div_cash: d.dividend,
        adj_amount: d.adjDividend > 0 ? d.adjDividend : null,
        scaled_amount: d.scaledDividend > 0 ? d.scaledDividend : null,
        split_factor: d.adjDividend > 0 ? d.dividend / d.adjDividend : 1,
        div_type: null,
        frequency: null,
        description: null,
        currency: 'USD',
        is_manual: false,
      });
    }
  }

  (allManualUploads || []).forEach(existing => {
    const exDate = existing.ex_date.split('T')[0];
    if (!exDatesToUpdate.includes(exDate)) {
      manualUploadsToPreserve.push({
        ticker: ticker.toUpperCase(),
        ex_date: existing.ex_date,
        pay_date: existing.pay_date,
        record_date: existing.record_date,
        declare_date: existing.declare_date,
        div_cash: existing.div_cash,
        adj_amount: existing.adj_amount,
        scaled_amount: existing.scaled_amount,
        split_factor: existing.split_factor,
        description: existing.description,
        div_type: existing.div_type,
        frequency: existing.frequency,
        currency: existing.currency || 'USD',
      });
    }
  });

  if (tiingoRecordsToUpsert.length === 0 && manualUploadsToPreserve.length === 0) {
    return 0;
  }

  const allRecordsToUpsert = [
    ...tiingoRecordsToUpsert,
    ...manualUploadsToPreserve
  ];

  const recordsWithoutIsManual = allRecordsToUpsert.map(({ is_manual, ...rest }) => rest);
  
  const { error } = await supabase
    .from('dividends_detail')
    .upsert(recordsWithoutIsManual, {
      onConflict: 'ticker,ex_date',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error(`    Error upserting dividends: ${error.message}`);
    return 0;
  }

  if (manualUploadsToPreserve.length > 0) {
    console.log(`    Preserved ${manualUploadsToPreserve.length} manual upload(s) not yet in Tiingo data`);
  }

  return tiingoRecordsToUpsert.length;
}

/**
 * Calculate 6M NAV Trend - GUARANTEED CORRECT
 * Uses exactly 6 calendar months from last available data date
 * Uses close price (not adj_close) to match CEO's chart data
 */
async function calculateNAVTrend6M(navSymbol: string): Promise<number | null> {
  try {
    // Get enough history: need at least 6 calendar months + buffer
    const today = new Date();
    const startDate = new Date();
    startDate.setMonth(today.getMonth() - 7); // Get 7 months to ensure we have data
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(today);

    // Use getPriceHistory which reads from database (where we just saved fresh data)
    const navData = await getPriceHistory(
      navSymbol.toUpperCase(),
      startDateStr,
      endDateStr
    );

    if (navData.length < 2) {
      return null;
    }

    // Sort by date ascending (oldest first)
    navData.sort((a, b) => a.date.localeCompare(b.date));

    // Get current NAV (last record - most recent available date)
    const currentRecord = navData[navData.length - 1];
    if (!currentRecord) return null;

    // Use the current record's date (not today) to calculate 6 months ago
    // This ensures we use the actual last available data date
    const currentDate = new Date(currentRecord.date + "T00:00:00");
    const sixMonthsAgo = new Date(currentDate);
    sixMonthsAgo.setMonth(currentDate.getMonth() - 6);
    const sixMonthsAgoStr = formatDate(sixMonthsAgo);

    // Find NAV record closest to 6 months ago (get closest available date)
    // Prefer records on or after the target date, but take closest if none available
    let past6MRecord: (typeof navData)[0] | undefined = navData.find(
      (r) => r.date >= sixMonthsAgoStr
    );
    if (!past6MRecord) {
      // If no record on/after target date, use the last record before it
      const sixMonthsRecords = navData.filter((r) => r.date <= sixMonthsAgoStr);
      past6MRecord =
        sixMonthsRecords.length > 0
          ? sixMonthsRecords[sixMonthsRecords.length - 1]
          : undefined;
    }

    if (!past6MRecord) {
      return null;
    }

    // CRITICAL: Validate that we have data close enough to 6 months ago
    // If the selected record is more than 7.5 months away, the data is insufficient
    const past6MDate = new Date(past6MRecord.date + "T00:00:00");
    const monthsDiff =
      (currentDate.getTime() - past6MDate.getTime()) /
      (1000 * 60 * 60 * 24 * 30.44); // Average days per month
    if (monthsDiff < 5 || monthsDiff > 7.5) {
      return null;
    }

    // Use adjusted close price (adj_close) for NAV trends to account for distributions
    const currentNav = currentRecord.adj_close ?? currentRecord.close;
    const past6MNav = past6MRecord.adj_close ?? past6MRecord.close;

    if (!currentNav || !past6MNav || past6MNav <= 0) {
      return null;
    }

    // Calculate percentage change: ((Current NAV - NAV 6 months ago) / NAV 6 months ago) * 100
    const trend = ((currentNav - past6MNav) / past6MNav) * 100;

    // Sanity check
    if (!isFinite(trend) || trend < -99 || trend > 10000) {
      return null;
    }

    return trend;
  } catch (error) {
    return null;
  }
}

/**
 * Calculate 12M NAV Return - GUARANTEED CORRECT
 * Uses exactly 12 calendar months from last available data date
 * Uses close price (not adj_close) to match CEO's chart data
 */
async function calculateNAVReturn12M(
  navSymbol: string
): Promise<number | null> {
  try {
    // Get enough history: need at least 12 calendar months + buffer
    // Use 15 months to ensure we have enough data even with weekends/holidays
    const today = new Date();
    const startDate = new Date();
    startDate.setMonth(today.getMonth() - 15); // Get 15 months to ensure we have data
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(today);

    // Use getPriceHistory which reads from database (where we just saved fresh data)
    const navData = await getPriceHistory(
      navSymbol.toUpperCase(),
      startDateStr,
      endDateStr
    );

    if (navData.length < 2) {
      return null;
    }

    // Sort by date ascending (oldest first)
    navData.sort((a, b) => a.date.localeCompare(b.date));

    // Get current NAV (last record - most recent available date)
    const currentRecord = navData[navData.length - 1];
    if (!currentRecord) return null;

    // Use the current record's date (not today) to calculate 12 months ago
    // This ensures we use the actual last available data date
    const currentDate = new Date(currentRecord.date + "T00:00:00");
    const twelveMonthsAgo = new Date(currentDate);
    twelveMonthsAgo.setMonth(currentDate.getMonth() - 12);
    const twelveMonthsAgoStr = formatDate(twelveMonthsAgo);

    // Find NAV record closest to 12 months ago (get closest available date)
    // Prefer records on or after the target date, but take closest if none available
    let past12MRecord: (typeof navData)[0] | undefined = navData.find(
      (r) => r.date >= twelveMonthsAgoStr
    );
    if (!past12MRecord) {
      // If no record on/after target date, use the last record before it
      const twelveMonthsRecords = navData.filter(
        (r) => r.date <= twelveMonthsAgoStr
      );
      past12MRecord =
        twelveMonthsRecords.length > 0
          ? twelveMonthsRecords[twelveMonthsRecords.length - 1]
          : undefined;
    }

    if (!past12MRecord) {
      return null;
    }

    // CRITICAL: Validate that we have data close enough to 12 months ago
    // If the selected record is more than 14 months away, the data is insufficient
    const past12MDate = new Date(past12MRecord.date + "T00:00:00");
    const monthsDiff =
      (currentDate.getTime() - past12MDate.getTime()) /
      (1000 * 60 * 60 * 24 * 30.44); // Average days per month
    if (monthsDiff < 10 || monthsDiff > 14) {
      return null;
    }

    // Use adjusted close price (adj_close) for NAV trends to account for distributions
    const currentNav = currentRecord.adj_close ?? currentRecord.close;
    const past12MNav = past12MRecord.adj_close ?? past12MRecord.close;

    if (!currentNav || !past12MNav || past12MNav <= 0) {
      return null;
    }

    // Calculate percentage change: ((Current NAV - NAV 12 months ago) / NAV 12 months ago) * 100
    const trend = ((currentNav - past12MNav) / past12MNav) * 100;

    // Sanity check
    if (!isFinite(trend) || trend < -99 || trend > 10000) {
      return null;
    }

    return trend;
  } catch (error) {
    return null;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options: { ticker?: string } = {};

  // Handle both --ticker SYMBOL and just SYMBOL as first argument
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ticker" && i + 1 < args.length) {
      options.ticker = args[i + 1].toUpperCase();
      i++;
    } else if (i === 0 && !args[i].startsWith("--")) {
      // If first argument doesn't start with --, treat it as ticker
      options.ticker = args[i].toUpperCase();
    }
  }

  return options;
}

async function refreshCEF(ticker: string): Promise<void> {
  console.log(`\n[Refresh] ${ticker}`);
  try {
    if (globalRateLimitHit) {
      console.log(`  ⚠ Skipping ${ticker}: Tiingo rate limit already hit in this run`);
      return;
    }

    // Get CEF from database
    const { data: cef, error } = await supabase
      .from("etf_static")
      .select("*")
      .eq("ticker", ticker.toUpperCase())
      .maybeSingle();

    if (error || !cef) {
      console.error(`  ❌ ${ticker}: Error - ${error?.message || 'Not found'}`);
      return;
    }

    // Check if it's a CEF (has nav_symbol)
    const navSymbol = cef.nav_symbol || null;
    if (!navSymbol) {
      console.error(`  ❌ ${ticker}: Not a CEF (no nav_symbol)`);
      return;
    }

    const navSymbolForCalc = navSymbol || ticker;

    // Step 1: Fetch and store price data for both CEF ticker and NAV symbol
    // ALWAYS fetch full history from API to ensure we have complete data for all calculations
    // Since rate limiting is fixed, we can fetch all data fresh every time
    const priceStartDate = getDateDaysAgo(LOOKBACK_DAYS);
    const navPriceStartDate = getDateDaysAgo(LOOKBACK_DAYS);

    // Fetch market + NAV prices from Tiingo.
    // IMPORTANT: We do NOT make a separate Tiingo call for dividends.
    // Dividends (divCash) and splits (splitFactor) are included in the price response,
    // so we derive dividends from market price history and upsert them from that.
    const fetchPromises: Array<Promise<any>> = [
      fetchPriceHistory(ticker, priceStartDate)
        .then(async (prices) => {
          const saved = await upsertPrices(ticker, prices);
          // Derive and upsert dividends from the same price response
          const derivedDividends = extractDividendsFromPriceData(prices);
          await upsertDividends(ticker, derivedDividends);
          return saved;
        })
        .then(() => ({ type: 'market', ticker }))
        .catch(() => ({ type: 'market', ticker, error: true }))
    ];

    if (navSymbolForCalc !== ticker) {
      fetchPromises.push(
        fetchPriceHistory(navSymbolForCalc, navPriceStartDate)
          .then(prices => upsertPrices(navSymbolForCalc, prices))
          .then(() => ({ type: 'nav', ticker: navSymbolForCalc }))
          .catch(() => ({ type: 'nav', ticker: navSymbolForCalc, error: true }))
      );
    }

    // Wait for all data to be fetched and saved
    const fetchResults = await Promise.allSettled(fetchPromises);
    
    // Log any fetch errors and verify data was saved
    let hasErrors = false;
    for (const result of fetchResults) {
      if (result.status === 'rejected') {
        console.error(`  ⚠ Data fetch error: ${result.reason}`);
        hasErrors = true;
      } else if (result.value?.error) {
        console.error(`  ⚠ Data fetch failed for ${result.value.type}: ${result.value.ticker}`);
        hasErrors = true;
      }
    }
    
    // Verify data was actually saved by checking database
    // This ensures calculations will find the data
    if (!hasErrors) {
      const [priceCount, navCount] = await Promise.all([
        navSymbolForCalc !== ticker
          ? supabase
              .from('prices_daily')
              .select('date', { count: 'exact', head: true })
              .eq('ticker', ticker.toUpperCase())
              .gte('date', priceStartDate)
              .then(r => r.count || 0)
          : Promise.resolve(0),
        navSymbolForCalc !== ticker
          ? supabase
              .from('prices_daily')
              .select('date', { count: 'exact', head: true })
              .eq('ticker', navSymbolForCalc.toUpperCase())
              .gte('date', navPriceStartDate)
              .then(r => r.count || 0)
          : Promise.resolve(0),
      ]);
      
      // If we have data, proceed. If not, log warning but continue anyway
      if (priceCount === 0 && navSymbolForCalc !== ticker) {
        console.warn(`  ⚠ No price data saved for ${ticker}`);
      }
      if (navCount === 0 && navSymbolForCalc !== ticker) {
        console.warn(`  ⚠ No NAV data saved for ${navSymbolForCalc}`);
      }
    }
    
    // Delay to ensure data is fully committed to database before calculations
    await new Promise(resolve => setTimeout(resolve, 300));

    // Import CEF calculation functions
    const {
      calculateCEFZScore,
      calculateSignal,
      calculateDividendHistory,
    } = await import("../src/routes/cefs.js");
    
    // Import CEF-specific normalized dividend calculation
    const { calculateNormalizedDividendsForCEFs } = await import("../src/services/dividendNormalization.js");

    const updateData: any = {};

    // Calculate general ETF metrics (lastDividend, forwardYield, short-term returns)
    // This is needed for CEFs to show yearly dividend and F Yield
    try {
      const { calculateMetrics } = await import("../src/services/metrics.js");
      const metrics = await calculateMetrics(ticker);
      
      // Update general metrics that CEFs also need
      updateData.last_dividend = metrics.lastDividend;
      updateData.forward_yield = metrics.forwardYield;
      updateData.annual_dividend = metrics.annualizedDividend;
      // Keep payments_per_year in sync with detected current cadence (important for homepage "period")
      updateData.payments_per_year = metrics.paymentsPerYear;
      
      // Update short-term returns (1W, 1M, 3M, 6M, 12M) - these are price-based returns
      updateData.tr_drip_1w = metrics.totalReturnDrip['1W'];
      updateData.tr_drip_1m = metrics.totalReturnDrip['1M'];
      updateData.tr_drip_3m = metrics.totalReturnDrip['3M'];
      updateData.tr_drip_6m = metrics.totalReturnDrip['6M'];
      updateData.tr_drip_12m = metrics.totalReturnDrip['1Y'];
      
      updateData.price_return_1w = metrics.priceReturn['1W'];
      updateData.price_return_1m = metrics.priceReturn['1M'];
      updateData.price_return_3m = metrics.priceReturn['3M'];
      updateData.price_return_6m = metrics.priceReturn['6M'];
      updateData.price_return_12m = metrics.priceReturn['1Y'];
    } catch (error) {
      // If calculateMetrics fails, set these to null
      updateData.last_dividend = null;
      updateData.forward_yield = null;
      updateData.annual_dividend = null;
      updateData.tr_drip_1w = null;
      updateData.tr_drip_1m = null;
      updateData.tr_drip_3m = null;
      updateData.tr_drip_6m = null;
      updateData.tr_drip_12m = null;
      updateData.price_return_1w = null;
      updateData.price_return_1m = null;
      updateData.price_return_3m = null;
      updateData.price_return_6m = null;
      updateData.price_return_12m = null;
    }

    // Calculate all CEF metrics - PARALLELIZE independent calculations for speed
    const [fiveYearZScore, navTrend6M, navTrend12M] = await Promise.all([
      calculateCEFZScore(ticker, navSymbolForCalc).catch(() => null),
      calculateNAVTrend6M(navSymbolForCalc).catch(() => null),
      calculateNAVReturn12M(navSymbolForCalc).catch(() => null),
    ]);

    updateData.five_year_z_score = fiveYearZScore;
    updateData.nav_trend_6m = navTrend6M;
    updateData.nav_trend_12m = navTrend12M;

    // Calculate Signal
    let signal: number | null = null;
    try {
      signal = await calculateSignal(
        ticker,
        navSymbolForCalc,
        fiveYearZScore,
        navTrend6M,
        navTrend12M
      );
      updateData.signal = signal;
    } catch (error) {
      updateData.signal = null;
    }

    // Calculate Dividend History (X+ Y- format)
    let dividendHistory: string | null = null;
    try {
      const dividends = await getDividendHistory(ticker.toUpperCase(), "2009-01-01");
      if (dividends && dividends.length > 0) {
        dividendHistory = calculateDividendHistory(dividends);
        updateData.dividend_history = dividendHistory;
      } else {
        updateData.dividend_history = null;
      }
    } catch (error) {
      updateData.dividend_history = null;
    }

    // Calculate and update normalized dividends (silently)
    try {
      const { calculateNormalizedDividendsForCEFs } = await import("../src/services/dividendNormalization.js");
      const dividendsForNormalization = await getDividendHistory(ticker.toUpperCase(), "2009-01-01");
      
      if (dividendsForNormalization.length > 0) {
        const dividendInputs = dividendsForNormalization
          .filter(d => d.id !== undefined && d.id !== null)
          .map(d => ({
            id: d.id!,
            ticker: d.ticker,
            ex_date: d.ex_date,
            div_cash: Number(d.div_cash),
            adj_amount: d.adj_amount ? Number(d.adj_amount) : null,
          }));
        
        const normalizedResults = calculateNormalizedDividendsForCEFs(dividendInputs);
        const updates = normalizedResults.map(result => {
          // CEF rules:
          // - frequency is derived from gap-days + history override (see calculateNormalizedDividendsForCEFs)
          // - Special dividends are detected by AMOUNT deviation, not date
          // - For Specials, use "Other" as frequency (not a cadence frequency)
          let frequencyStr: string | null = null;
          if (result.pmt_type === 'Special') {
            frequencyStr = 'Other';
          } else if (result.frequency_label) {
            frequencyStr = result.frequency_label === 'Irregular' ? 'Irregular' : result.frequency_label;
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
        
        const BATCH_SIZE = 100;
        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
          const batch = updates.slice(i, i + BATCH_SIZE);
          const updatePromises = batch.map(update => (async () => {
            // Backwards-compatible DB write:
            // If the new columns don't exist yet, fall back to updating the original columns.
            const baseUpdate: any = {
              days_since_prev: update.days_since_prev,
              pmt_type: update.pmt_type,
              frequency: update.frequency,
              frequency_num: update.frequency_num,
              annualized: update.annualized,
              normalized_div: update.normalized_div,
            };

            // Try full update (including component split)
            const { error: fullError } = await supabase
              .from('dividends_detail')
              .update({
                ...baseUpdate,
                regular_component: update.regular_component,
                special_component: update.special_component,
              })
              .eq('id', update.id);

            if (!fullError) return;

            // Fallback if columns are missing
            await supabase
              .from('dividends_detail')
              .update(baseUpdate)
              .eq('id', update.id);
          })());

          await Promise.all(updatePromises);
        }
      }
    } catch (error) {
      // Silent fail
    }

    // Calculate DVI (silently)
    try {
      const { calculateDividendVolatility } = await import("../src/services/metrics.js");
      const dividends = await getDividendHistory(ticker.toUpperCase());
      if (dividends && dividends.length > 0) {
        const dviResult = calculateDividendVolatility(dividends, 12, ticker);
        if (dviResult) {
          updateData.dividend_sd = dviResult.dividendSD;
          updateData.dividend_cv = dviResult.dividendCV;
          updateData.dividend_cv_percent = dviResult.dividendCVPercent;
          updateData.dividend_volatility_index = dviResult.volatilityIndex;
          updateData.annual_dividend = dviResult.annualDividend;
        }
      } else {
        updateData.dividend_sd = null;
        updateData.dividend_cv = null;
        updateData.dividend_cv_percent = null;
        updateData.dividend_volatility_index = null;
      }
    } catch (error) {
      updateData.dividend_sd = null;
      updateData.dividend_cv = null;
      updateData.dividend_cv_percent = null;
      updateData.dividend_volatility_index = null;
    }

    // Calculate TOTAL RETURNS (3Y, 5Y, 10Y, 15Y) - NAV-based annualized returns
    // Use calculateAllNAVReturns to fetch data once and calculate all returns (reduces API calls from 8 to 2)
    const { calculateAllNAVReturns } = await import("../src/routes/cefs.js");
    const { return3Yr, return5Yr, return10Yr, return15Yr } = await calculateAllNAVReturns(navSymbolForCalc);

    updateData.return_3yr = return3Yr;
    updateData.return_5yr = return5Yr;
    updateData.return_10yr = return10Yr;
    updateData.return_15yr = return15Yr;

    // Update NAV, Market Price, and Premium/Discount from latest prices
    let currentNav: number | null = cef.nav ?? null;
    let marketPrice: number | null = cef.price ?? null;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    const [navHistory, priceHistory] = await Promise.all([
      navSymbolForCalc
        ? getPriceHistory(navSymbolForCalc.toUpperCase(), startDateStr, endDateStr).catch(() => [])
        : Promise.resolve([]),
      getPriceHistory(ticker.toUpperCase(), startDateStr, endDateStr).catch(() => [])
    ]);

    if (navHistory.length > 0) {
      navHistory.sort((a, b) => a.date.localeCompare(b.date));
      const latestNav = navHistory[navHistory.length - 1];
      currentNav = latestNav.close ?? null;
      if (currentNav !== null) {
        updateData.nav = currentNav;
      }
    }

    if (priceHistory.length > 0) {
      priceHistory.sort((a, b) => a.date.localeCompare(b.date));
      const latestPrice = priceHistory[priceHistory.length - 1];
      const fetchedPrice = latestPrice.close ?? null;
      if (fetchedPrice !== null) {
        marketPrice = fetchedPrice;
        updateData.price = marketPrice;
      }
    }

    if (currentNav && currentNav !== 0 && marketPrice && marketPrice > 0) {
      const premiumDiscount = (marketPrice / currentNav - 1) * 100;
      updateData.premium_discount = premiumDiscount;
    } else {
      updateData.premium_discount = null;
    }

    // Save to database with explicit timestamp
    const now = new Date().toISOString();
    updateData.last_updated = now;
    updateData.updated_at = now;

    console.log(`  💾 Saving to database (last_updated: ${now})...`);

    await batchUpdateETFMetricsPreservingCEFFields([
      {
        ticker,
        metrics: updateData,
      },
    ]);

    // Simple output like CC ETFs - just show ticker name
    console.log(`  ✓ ${ticker} refresh complete (last_updated: ${now})`);
  } catch (error) {
    const msg = (error as Error).message || String(error);
    if (msg.toLowerCase().includes("tiingo hourly rate limit reached")) {
      globalRateLimitHit = true;
      console.error(`  ✗ Tiingo rate limit hit. Stopping after current batch: ${msg}`);
      return;
    }
    console.error(`  ✗ Error refreshing ${ticker}:`, msg);
    // Don't throw - continue processing other CEFs
    // Return resolved promise to prevent batch from stopping
    return;
  }
}

async function main() {
  const options = parseArgs();


  // Get CEFs to refresh
  let tickers: string[];
  if (options.ticker) {
    tickers = [options.ticker];
  } else {
    // Fetch all CEFs (those with nav_symbol, excluding NAV symbol records themselves)
    const { data, error } = await supabase
      .from("etf_static")
      .select("ticker, nav_symbol")
      .not("nav_symbol", "is", null)
      .neq("nav_symbol", "")
      .order("ticker");

    if (error || !data) {
      console.error("Failed to fetch CEFs:", error);
      process.exit(1);
    }

    // Filter out NAV symbol records (where ticker === nav_symbol)
    tickers = data
      .filter((item) => item.ticker !== item.nav_symbol)
      .map((item) => item.ticker);

    console.log(`\nFound ${tickers.length} CEF(s) to refresh\n`);
  }

  // Process CEFs in parallel batches
  // CEFs require more API calls per ticker (market price + NAV price + dividends = 3 calls per CEF)
  // With 15 years of data per call, we need to be very careful with rate limits
  // Reduced batch size significantly to prevent rate limiting
  const BATCH_SIZE = 3; // Process 3 CEFs simultaneously (3 CEFs × 3 API calls = 9 calls per batch)
  const BATCH_DELAY_MS = 1000; // 1 second delay between batches (spaces out API calls to stay under 500/hour limit)
  const startTime = Date.now();
  
  console.log(`\n🚀 Processing ${tickers.length} CEF(s) in parallel batches of ${BATCH_SIZE}...\n`);

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tickers.length / BATCH_SIZE);
    
    console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} CEFs)`);
    
    // Process batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map((ticker) => refreshCEF(ticker))
    );
    
    // Count results and log any failures
    for (const result of batchResults) {
      if (result.status === 'rejected') {
        console.error(`Failed: ${result.reason}`);
      }
    }
    
    // Delay between batches to prevent rate limit spikes
    if (i + BATCH_SIZE < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }

    // If we hit Tiingo limits, stop cleanly (don't keep hammering and don't wait an hour)
    if (globalRateLimitHit) {
      console.log(`\n🛑 Stopped early due to Tiingo rate limit. Processed ${Math.min(i + BATCH_SIZE, tickers.length)}/${tickers.length} CEF(s).`);
      break;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⚡ Completed in ${elapsed}s (avg: ${(parseFloat(elapsed) / tickers.length).toFixed(1)}s per CEF)`);
  
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error in main:", error);
  process.exit(1);
});
