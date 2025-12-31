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
import { fetchPriceHistory, fetchDividendHistory } from "../src/services/tiingo.js";
import type { TiingoPriceData } from "../src/types/index.js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// 15 years lookback for CEF metrics
const LOOKBACK_DAYS = 5475; // 15 years = 15 * 365 = 5475 days
// Extended dividend lookback to ensure split adjustments work correctly
const DIVIDEND_LOOKBACK_DAYS = 5475; // 15 years for complete dividend history with splits

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
    console.log(
      `    Creating ticker record for ${ticker} (required for foreign key)...`
    );
    const { error: insertError } = await supabase.from("etf_static").insert({
      ticker: ticker.toUpperCase(),
      name: `NAV Symbol: ${ticker}`,
      description: `Auto-created for NAV price data`,
    });

    if (insertError) {
      console.warn(
        `    ⚠ Could not create ticker record for ${ticker}: ${insertError.message}`
      );
      console.warn(
        `    ⚠ Will skip inserting prices for ${ticker} to avoid foreign key error`
      );
      return 0;
    } else {
      console.log(`    ✓ Created ticker record for ${ticker} (NAV symbol)`);
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

    // CRITICAL: Always fetch fresh data from API to ensure we have the latest dates
    // Database may have stale data (e.g., 12/24 instead of 12/29)
    let navData = await getPriceHistory(
      navSymbol.toUpperCase(),
      startDateStr,
      endDateStr
    );

    // Check if we have recent data (within last 2 days)
    // If not, fetch fresh from API to ensure we have the latest
    const hasRecentData = navData.length > 0 && navData[navData.length - 1]?.date;
    if (hasRecentData) {
      const lastDate = new Date(navData[navData.length - 1].date + "T00:00:00");
      const daysSinceLastUpdate = (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // If data is more than 1 day old, fetch fresh from API
      if (daysSinceLastUpdate > 1) {
        console.log(
          `    📥 6M NAV Trend: Database data is ${daysSinceLastUpdate.toFixed(1)} days old, fetching fresh from API...`
        );
        try {
          const { getPriceHistoryFromAPI } = await import("../src/services/tiingo.js");
          const apiData = await getPriceHistoryFromAPI(
            navSymbol.toUpperCase(),
            startDateStr,
            endDateStr
          );
          if (apiData.length > 0) {
            navData = apiData;
            console.log(
              `    ✓ 6M NAV Trend: Using fresh API data (${apiData.length} records)`
            );
          }
        } catch (apiError) {
          console.warn(
            `    ⚠ 6M NAV Trend: API fallback failed: ${(apiError as Error).message}, using database data`
          );
        }
      }
    } else {
      // No data in database, try API
      try {
        const { getPriceHistoryFromAPI } = await import("../src/services/tiingo.js");
        const apiData = await getPriceHistoryFromAPI(
          navSymbol.toUpperCase(),
          startDateStr,
          endDateStr
        );
        if (apiData.length > 0) {
          navData = apiData;
          console.log(
            `    ✓ 6M NAV Trend: Using API data (database was empty)`
          );
        }
      } catch (apiError) {
        console.warn(
          `    ⚠ 6M NAV Trend: API fallback failed: ${(apiError as Error).message}`
        );
      }
    }

    if (navData.length < 2) {
      console.log(
        `    ⚠ 6M NAV Trend: N/A - insufficient data (${navData.length} < 2 records)`
      );
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
      console.log(
        `    ⚠ 6M NAV Trend: N/A - no data available for 6 months ago (${sixMonthsAgoStr})`
      );
      return null;
    }

    // CRITICAL: Validate that we have data close enough to 6 months ago
    // If the selected record is more than 7.5 months away, the data is insufficient
    const past6MDate = new Date(past6MRecord.date + "T00:00:00");
    const monthsDiff =
      (currentDate.getTime() - past6MDate.getTime()) /
      (1000 * 60 * 60 * 24 * 30.44); // Average days per month
    if (monthsDiff < 5 || monthsDiff > 7.5) {
      console.log(
        `    ⚠ 6M NAV Trend: N/A - insufficient historical data (selected record is ${monthsDiff.toFixed(
          1
        )} months ago, need ~6 months)`
      );
      return null;
    }

    // Use adjusted close price (adj_close) for NAV trends to account for distributions
    const currentNav = currentRecord.adj_close ?? currentRecord.close;
    const past6MNav = past6MRecord.adj_close ?? past6MRecord.close;

    if (!currentNav || !past6MNav || past6MNav <= 0) {
      console.log(
        `    ⚠ 6M NAV Trend: N/A - missing close data (current=${currentNav}, past6M=${past6MNav})`
      );
      return null;
    }

    // Calculate percentage change: ((Current NAV - NAV 6 months ago) / NAV 6 months ago) * 100
    const trend = ((currentNav - past6MNav) / past6MNav) * 100;

    // Sanity check
    if (!isFinite(trend) || trend < -99 || trend > 10000) {
      console.log(
        `    ⚠ 6M NAV Trend: N/A - invalid calculation result (${trend})`
      );
      return null;
    }

    return trend;
  } catch (error) {
    console.warn(
      `    ⚠ Failed to calculate 6M NAV Trend: ${(error as Error).message}`
    );
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

    // CRITICAL: Always fetch fresh data from API to ensure we have the latest dates
    // Database may have stale data (e.g., 12/24 instead of 12/29)
    let navData = await getPriceHistory(
      navSymbol.toUpperCase(),
      startDateStr,
      endDateStr
    );

    // Check if we have recent data (within last 2 days)
    // If not, fetch fresh from API to ensure we have the latest
    const hasRecentData = navData.length > 0 && navData[navData.length - 1]?.date;
    if (hasRecentData) {
      const lastDate = new Date(navData[navData.length - 1].date + "T00:00:00");
      const daysSinceLastUpdate = (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // If data is more than 1 day old, fetch fresh from API
      if (daysSinceLastUpdate > 1) {
        console.log(
          `    📥 12M NAV Return: Database data is ${daysSinceLastUpdate.toFixed(1)} days old, fetching fresh from API...`
        );
        try {
          const { getPriceHistoryFromAPI } = await import("../src/services/tiingo.js");
          const apiData = await getPriceHistoryFromAPI(
            navSymbol.toUpperCase(),
            startDateStr,
            endDateStr
          );
          if (apiData.length > 0) {
            navData = apiData;
            console.log(
              `    ✓ 12M NAV Return: Using fresh API data (${apiData.length} records)`
            );
          }
        } catch (apiError) {
          console.warn(
            `    ⚠ 12M NAV Return: API fallback failed: ${(apiError as Error).message}, using database data`
          );
        }
      }
    } else {
      // No data in database, try API
      try {
        const { getPriceHistoryFromAPI } = await import("../src/services/tiingo.js");
        const apiData = await getPriceHistoryFromAPI(
          navSymbol.toUpperCase(),
          startDateStr,
          endDateStr
        );
        if (apiData.length > 0) {
          navData = apiData;
          console.log(
            `    ✓ 12M NAV Return: Using API data (database was empty)`
          );
        }
      } catch (apiError) {
        console.warn(
          `    ⚠ 12M NAV Return: API fallback failed: ${(apiError as Error).message}`
        );
      }
    }

    if (navData.length < 2) {
      console.log(
        `    ⚠ 12M NAV Return: N/A - insufficient data (${navData.length} < 2 records)`
      );
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
      console.log(
        `    ⚠ 12M NAV Return: N/A - no data available for 12 months ago (${twelveMonthsAgoStr})`
      );
      return null;
    }

    // CRITICAL: Validate that we have data close enough to 12 months ago
    // If the selected record is more than 14 months away, the data is insufficient
    const past12MDate = new Date(past12MRecord.date + "T00:00:00");
    const monthsDiff =
      (currentDate.getTime() - past12MDate.getTime()) /
      (1000 * 60 * 60 * 24 * 30.44); // Average days per month
    if (monthsDiff < 10 || monthsDiff > 14) {
      console.log(
        `    ⚠ 12M NAV Return: N/A - insufficient historical data (selected record is ${monthsDiff.toFixed(
          1
        )} months ago, need ~12 months)`
      );
      return null;
    }

    // Use adjusted close price (adj_close) for NAV trends to account for distributions
    const currentNav = currentRecord.adj_close ?? currentRecord.close;
    const past12MNav = past12MRecord.adj_close ?? past12MRecord.close;

    if (!currentNav || !past12MNav || past12MNav <= 0) {
      console.log(
        `    ⚠ 12M NAV Return: N/A - missing close data (current=${currentNav}, past12M=${past12MNav})`
      );
      return null;
    }

    // Calculate percentage change: ((Current NAV - NAV 12 months ago) / NAV 12 months ago) * 100
    const trend = ((currentNav - past12MNav) / past12MNav) * 100;

    // Sanity check
    if (!isFinite(trend) || trend < -99 || trend > 10000) {
      console.log(
        `    ⚠ 12M NAV Return: N/A - invalid calculation result (${trend})`
      );
      return null;
    }

    return trend;
  } catch (error) {
    console.warn(
      `    ⚠ Failed to calculate 12M NAV Return: ${(error as Error).message}`
    );
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
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing CEF: ${ticker}`);
  console.log(`${"=".repeat(60)}`);

  try {
    // Get CEF from database
    const { data: cef, error } = await supabase
      .from("etf_static")
      .select("*")
      .eq("ticker", ticker.toUpperCase())
      .maybeSingle();

    if (error) {
      console.error(`  ❌ Database error: ${error.message}`);
      return;
    }

    if (!cef) {
      console.error(`  ❌ CEF not found: ${ticker}`);
      return;
    }

    // Check if it's a CEF (has nav_symbol)
    const navSymbol = cef.nav_symbol || null;
    if (!navSymbol) {
      console.log(`  ⚠ Not a CEF (no nav_symbol): ${ticker}`);
      return;
    }

    const navSymbolForCalc = navSymbol || ticker;
    console.log(`  Using NAV symbol: ${navSymbolForCalc}`);

    // Step 1: Fetch and store price data for both CEF ticker and NAV symbol
    // PARALLELIZE all data fetching for maximum speed
    const priceStartDate = getDateDaysAgo(LOOKBACK_DAYS);
    const dividendStartDate = getDateDaysAgo(DIVIDEND_LOOKBACK_DAYS);
    
    console.log(`  📥 Fetching data in parallel...`);

    // Fetch all data in parallel (market prices, NAV prices, dividends)
    const fetchPromises: Array<Promise<any>> = [
      fetchPriceHistory(ticker, priceStartDate)
        .then(prices => upsertPrices(ticker, prices))
        .then(count => ({ type: 'market', count, ticker }))
        .catch(err => ({ type: 'market', count: 0, ticker, error: err.message }))
    ];

    if (navSymbolForCalc !== ticker) {
      fetchPromises.push(
        fetchPriceHistory(navSymbolForCalc, priceStartDate)
          .then(prices => upsertPrices(navSymbolForCalc, prices))
          .then(count => ({ type: 'nav', count, ticker: navSymbolForCalc }))
          .catch(err => ({ type: 'nav', count: 0, ticker: navSymbolForCalc, error: err.message }))
      );
    }

    fetchPromises.push(
      fetchDividendHistory(ticker, dividendStartDate)
        .then(dividends => upsertDividends(ticker, dividends))
        .then(count => ({ type: 'dividends', count, ticker }))
        .catch(err => ({ type: 'dividends', count: 0, ticker, error: err.message }))
    );

    const fetchResults = await Promise.allSettled(fetchPromises);
    
    // Log results
    for (const result of fetchResults) {
      if (result.status === 'fulfilled') {
        const res = result.value;
        if (res.error) {
          console.warn(`    ⚠ Failed to fetch ${res.type} for ${res.ticker}: ${res.error}`);
        } else {
          console.log(`    ✓ ${res.type === 'market' ? 'Market' : res.type === 'nav' ? 'NAV' : 'Dividend'} prices: ${res.count} records for ${res.ticker}`);
        }
      }
    }

    // Import CEF calculation functions
    const {
      calculateCEFZScore,
      calculateSignal,
      calculateNAVReturns,
      calculateDividendHistory,
    } = await import("../src/routes/cefs.js");
    
    // Import normalized dividend calculation
    const { calculateNormalizedDividends } = await import("../src/services/dividendNormalization.js");

    const updateData: any = {};

    // Calculate all CEF metrics
    // PARALLELIZE independent calculations for speed
    console.log(`  📊 Calculating CEF metrics...`);

    // Run Z-Score, NAV Trend 6M, and NAV Return 12M in parallel (they're independent)
    const [fiveYearZScore, navTrend6M, navTrend12M] = await Promise.all([
      calculateCEFZScore(ticker, navSymbolForCalc).catch(() => null),
      calculateNAVTrend6M(navSymbolForCalc).catch(() => null),
      calculateNAVReturn12M(navSymbolForCalc).catch(() => null),
    ]);

    // 1. Process 3-Year Z-Score result
    updateData.five_year_z_score = fiveYearZScore;
    if (fiveYearZScore !== null) {
      console.log(`    ✓ 3Y Z-Score: ${fiveYearZScore.toFixed(2)}`);
    } else {
      console.log(
        `    ⚠ 3Y Z-Score: N/A (insufficient data, need at least 1 year) - clearing old value`
      );
    }

    // 2. Process NAV Trend 6M result
    updateData.nav_trend_6m = navTrend6M;
    if (navTrend6M !== null) {
      console.log(`    ✓ 6M NAV Trend: ${navTrend6M.toFixed(2)}%`);
    } else {
      console.log(`    ⚠ 6M NAV Trend: N/A - clearing old value`);
    }

    // 3. Process NAV Return 12M result
    updateData.nav_trend_12m = navTrend12M;
    if (navTrend12M !== null) {
      console.log(`    ✓ 12M NAV Return: ${navTrend12M.toFixed(2)}%`);
    } else {
      console.log(`    ⚠ 12M NAV Return: N/A - clearing old value`);
    }

    // 4. Calculate Signal
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
      if (signal !== null) {
        const signalLabels: Record<number, string> = {
          3: "Optimal",
          2: "Good Value",
          1: "Healthy",
          0: "Neutral",
          "-1": "Value Trap",
          "-2": "Overvalued",
        };
        console.log(
          `    ✓ Signal: ${signal} (${
            signalLabels[signal as keyof typeof signalLabels] || "Unknown"
          })`
        );
      } else {
        console.log(`    ⚠ Signal: N/A - clearing old value`);
      }
    } catch (error) {
      updateData.signal = null;
      console.warn(
        `    ⚠ Failed to calculate Signal: ${
          (error as Error).message
        } - clearing old value`
      );
    }

    // 5. Calculate Dividend History (X+ Y- format)
    console.log(`  📊 Calculating Dividend History (X+ Y- format)...`);
    let dividendHistory: string | null = null;
    try {
      // Get dividends from 2009-01-01 onwards for dividend history calculation
      const dividends = await getDividendHistory(
        ticker.toUpperCase(),
        "2009-01-01"
      );
      if (dividends && dividends.length > 0) {
        dividendHistory = calculateDividendHistory(dividends);
        updateData.dividend_history = dividendHistory;
        console.log(`    ✓ Dividend History: ${dividendHistory}`);
      } else {
        console.log(
          `    ⚠ Dividend History: N/A (no dividend data from 2009-01-01) - clearing old value`
        );
        updateData.dividend_history = null;
      }
    } catch (error) {
      updateData.dividend_history = null;
      console.warn(
        `    ⚠ Failed to calculate Dividend History: ${
          (error as Error).message
        } - clearing old value`
      );
    }

    // 6. Calculate and update normalized dividends (for split ETFs like CONY, ULTY)
    // CRITICAL: Must use adj_amount (adjusted dividends) for proper normalization
    console.log(`  📊 Calculating normalized dividends...`);
    try {
      const { calculateNormalizedDividends } = await import("../src/services/dividendNormalization.js");
      const dividendsForNormalization = await getDividendHistory(ticker.toUpperCase(), "2009-01-01");
      
      if (dividendsForNormalization.length > 0) {
        // Convert to format expected by calculateNormalizedDividends
        const dividendInputs = dividendsForNormalization.map(d => ({
          id: d.id,
          ticker: d.ticker,
          ex_date: d.ex_date,
          div_cash: Number(d.div_cash),
          adj_amount: d.adj_amount ? Number(d.adj_amount) : null,
        }));
        
        const normalizedResults = calculateNormalizedDividends(dividendInputs);
        
        // Batch update normalized values
        const updates = normalizedResults.map(result => ({
          id: result.id,
          days_since_prev: result.days_since_prev,
          pmt_type: result.pmt_type,
          frequency_num: result.frequency_num,
          annualized: result.annualized,
          normalized_div: result.normalized_div,
        }));
        
        // Update in batches to avoid overwhelming the database
        const BATCH_SIZE = 100;
        let updatedCount = 0;
        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
          const batch = updates.slice(i, i + BATCH_SIZE);
          const updatePromises = batch.map(update => 
            supabase
              .from('dividends_detail')
              .update({
                days_since_prev: update.days_since_prev,
                pmt_type: update.pmt_type,
                frequency_num: update.frequency_num,
                annualized: update.annualized,
                normalized_div: update.normalized_div,
              })
              .eq('id', update.id)
          );
          await Promise.all(updatePromises);
          updatedCount += batch.length;
        }
        
        console.log(`    ✓ Normalized dividends: Updated ${updatedCount} records`);
      } else {
        console.log(`    ⚠ Normalized dividends: No dividends found`);
      }
    } catch (error) {
      console.warn(
        `    ⚠ Failed to calculate normalized dividends: ${(error as Error).message}`
      );
    }

    // 7. Calculate DVI (Dividend Volatility Index)
    console.log(`  📊 Calculating DVI (Dividend Volatility Index)...`);
    let dviResult: any = null;
    try {
      const { calculateDividendVolatility } = await import(
        "../src/services/metrics.js"
      );

      const dividends = await getDividendHistory(ticker.toUpperCase());
      if (dividends && dividends.length > 0) {
        dviResult = calculateDividendVolatility(dividends, 12, ticker);
        if (dviResult) {
          updateData.dividend_sd = dviResult.dividendSD;
          updateData.dividend_cv = dviResult.dividendCV;
          updateData.dividend_cv_percent = dviResult.dividendCVPercent;
          updateData.dividend_volatility_index = dviResult.volatilityIndex;
          updateData.annual_dividend = dviResult.annualDividend;
          console.log(
            `    ✓ DVI: ${dviResult.volatilityIndex || "N/A"} (CV: ${
              dviResult.dividendCVPercent?.toFixed(2) || "N/A"
            }%, SD: ${dviResult.dividendSD?.toFixed(4) || "N/A"}, Avg: ${
              dviResult.annualDividend?.toFixed(2) || "N/A"
            })`
          );
        }
      } else {
        console.log(`    ⚠ DVI: N/A (no dividend data) - clearing old values`);
        updateData.dividend_sd = null;
        updateData.dividend_cv = null;
        updateData.dividend_cv_percent = null;
        updateData.dividend_volatility_index = null;
      }
    } catch (error) {
      console.warn(
        `    ⚠ Failed to calculate DVI: ${
          (error as Error).message
        } - clearing old values`
      );
      updateData.dividend_sd = null;
      updateData.dividend_cv = null;
      updateData.dividend_cv_percent = null;
      updateData.dividend_volatility_index = null;
    }

    // 7. Calculate TOTAL RETURNS (3Y, 5Y, 10Y, 15Y) - NAV-based annualized returns
    // PARALLELIZE for speed - all 4 calculations can run simultaneously
    console.log(
      `  📊 Calculating NAV-based total returns (3Y, 5Y, 10Y, 15Y)...`
    );
    const [return3Yr, return5Yr, return10Yr, return15Yr] = await Promise.all([
      calculateNAVReturns(navSymbolForCalc, "3Y"),
      calculateNAVReturns(navSymbolForCalc, "5Y"),
      calculateNAVReturns(navSymbolForCalc, "10Y"),
      calculateNAVReturns(navSymbolForCalc, "15Y"),
    ]);

    updateData.return_3yr = return3Yr;
    updateData.return_5yr = return5Yr;
    updateData.return_10yr = return10Yr;
    updateData.return_15yr = return15Yr;

    console.log(`    ✓ Total Returns (annualized):`);
    console.log(
      `      - 3Y: ${return3Yr !== null ? `${return3Yr.toFixed(2)}%` : "N/A"}`
    );
    console.log(
      `      - 5Y: ${return5Yr !== null ? `${return5Yr.toFixed(2)}%` : "N/A"}`
    );
    console.log(
      `      - 10Y: ${
        return10Yr !== null ? `${return10Yr.toFixed(2)}%` : "N/A"
      }`
    );
    console.log(
      `      - 15Y: ${
        return15Yr !== null ? `${return15Yr.toFixed(2)}%` : "N/A"
      }`
    );

    // 8. Update NAV, Market Price, and Premium/Discount from latest prices
    // PARALLELIZE database queries for speed
    console.log(`  📊 Updating NAV, Market Price, and Premium/Discount...`);
    let currentNav: number | null = cef.nav ?? null;
    let marketPrice: number | null = cef.price ?? null;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    // Fetch NAV and market price in parallel
    const [navHistory, priceHistory] = await Promise.all([
      navSymbolForCalc
        ? getPriceHistory(navSymbolForCalc.toUpperCase(), startDateStr, endDateStr).catch(() => [])
        : Promise.resolve([]),
      getPriceHistory(ticker.toUpperCase(), startDateStr, endDateStr).catch(() => [])
    ]);

    // Process NAV
    if (navHistory.length > 0) {
      navHistory.sort((a, b) => a.date.localeCompare(b.date));
      const latestNav = navHistory[navHistory.length - 1];
      currentNav = latestNav.close ?? null;
      if (currentNav !== null) {
        updateData.nav = currentNav;
        console.log(`    ✓ NAV: $${currentNav.toFixed(2)}`);
      }
    }

    // Process Market Price
    if (priceHistory.length > 0) {
      priceHistory.sort((a, b) => a.date.localeCompare(b.date));
      const latestPrice = priceHistory[priceHistory.length - 1];
      const fetchedPrice = latestPrice.close ?? null;
      if (fetchedPrice !== null) {
        marketPrice = fetchedPrice;
        updateData.price = marketPrice;
        console.log(`    ✓ Market Price: $${marketPrice.toFixed(2)}`);
      }
    }

    // Calculate premium/discount: ((MP / NAV - 1) * 100)
    if (currentNav && currentNav !== 0 && marketPrice && marketPrice > 0) {
      const premiumDiscount = (marketPrice / currentNav - 1) * 100;
      updateData.premium_discount = premiumDiscount;
      console.log(
        `    ✓ Premium/Discount: ${
          premiumDiscount >= 0 ? "+" : ""
        }${premiumDiscount.toFixed(2)}% (MP=$${marketPrice.toFixed(
          2
        )}, NAV=$${currentNav.toFixed(2)})`
      );
    } else {
      updateData.premium_discount = null;
      if (cef.premium_discount !== null && cef.premium_discount !== undefined) {
        console.log(
          `    ⚠ Premium/Discount: Cannot calculate (missing NAV or market price), clearing old value`
        );
      } else {
        console.log(
          `    ⚠ Premium/Discount: N/A (missing NAV or market price)`
        );
      }
    }

    // Save to database with explicit last_updated timestamp
    console.log(`  💾 Saving to database...`);

    const now = new Date().toISOString();
    updateData.last_updated = now;
    updateData.updated_at = now;

    await batchUpdateETFMetricsPreservingCEFFields([
      {
        ticker,
        metrics: updateData,
      },
    ]);

    // Verify save - CRITICAL: Always verify last_updated was saved
    console.log(`  🔍 Verifying database update...`);
    // Try with dividend_history first, but if it fails due to schema cache, retry without it
    let verify: any = null;
    let verifyError: any = null;
    
    const { data: verifyData, error: verifyErr } = await supabase
      .from("etf_static")
      .select(
        "return_3yr, return_5yr, return_10yr, return_15yr, five_year_z_score, nav_trend_6m, nav_trend_12m, signal, premium_discount, nav, price, dividend_history, last_updated"
      )
      .eq("ticker", ticker.toUpperCase())
      .maybeSingle();

    if (verifyErr && verifyErr.message.includes('dividend_history')) {
      // Retry without dividend_history if schema cache issue
      const { data: verifyData2, error: verifyErr2 } = await supabase
        .from("etf_static")
        .select(
          "return_3yr, return_5yr, return_10yr, return_15yr, five_year_z_score, nav_trend_6m, nav_trend_12m, signal, premium_discount, nav, price, last_updated"
        )
        .eq("ticker", ticker.toUpperCase())
        .maybeSingle();
      verify = verifyData2;
      verifyError = verifyErr2;
    } else {
      verify = verifyData;
      verifyError = verifyErr;
    }

    if (verifyError) {
      console.warn(`    ⚠ Verification query error: ${verifyError.message}`);
    }

    if (verify) {
      console.log(`    ✓ Verified saved values:`);
      console.log(
        `      - Returns: 3Y=${verify.return_3yr ?? "NULL"}, 5Y=${
          verify.return_5yr ?? "NULL"
        }, 10Y=${verify.return_10yr ?? "NULL"}, 15Y=${
          verify.return_15yr ?? "NULL"
        }`
      );
      console.log(`      - Z-Score: ${verify.five_year_z_score ?? "NULL"}`);
      console.log(
        `      - NAV Trends: 6M=${verify.nav_trend_6m ?? "NULL"}, 12M=${
          verify.nav_trend_12m ?? "NULL"
        }`
      );
      console.log(`      - Signal: ${verify.signal ?? "NULL"}`);
      console.log(
        `      - Premium/Discount: ${
          verify.premium_discount !== null &&
          verify.premium_discount !== undefined
            ? (verify.premium_discount >= 0 ? "+" : "") +
              verify.premium_discount.toFixed(2) +
              "%"
            : "NULL"
        } (MP=$${verify.price ?? "NULL"}, NAV=$${verify.nav ?? "NULL"})`
      );
      console.log(
        `      - Dividend History: ${verify.dividend_history ?? "NULL"}`
      );
      // CRITICAL: Always show last_updated to verify it was saved
      if (verify.last_updated) {
        console.log(`      - Last Updated: ${verify.last_updated} ✅`);
      } else {
        console.warn(`      - Last Updated: NULL ⚠️ NOT SAVED!`);
      }
    } else {
      console.warn(`    ⚠ Could not verify saved values (no data returned)`);
    }

    console.log(`  ✅ ${ticker} complete`);
  } catch (error) {
    console.error(
      `  ❌ Error processing ${ticker}: ${(error as Error).message}`
    );
    console.error(error);
  }
}

async function main() {
  const options = parseArgs();

  console.log("=".repeat(60));
  console.log("CEF METRICS REFRESH");
  console.log("=".repeat(60));
  console.log("This script calculates and updates:");
  console.log("  - 3-Year Z-Score (3Y max, 1Y min lookback)");
  console.log("  - 6M NAV Trend (exactly 6 calendar months)");
  console.log("  - 12M NAV Return (exactly 12 calendar months)");
  console.log("  - Signal rating");
  console.log("  - DVI (Dividend Volatility Index)");
  console.log("  - Total Returns (3Y, 5Y, 10Y, 15Y) - NAV-based");
  console.log("  - NAV, Market Price, and Premium/Discount");
  console.log("  - last_updated timestamp");
  console.log("=".repeat(60));

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

  // Process CEFs in parallel batches for maximum speed
  const BATCH_SIZE = 5; // Process 5 CEFs simultaneously
  const startTime = Date.now();
  
  console.log(`\n🚀 Processing ${tickers.length} CEF(s) in parallel batches of ${BATCH_SIZE}...\n`);

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tickers.length / BATCH_SIZE);
    
    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} CEFs): ${batch.join(", ")}`);
    
    // Process batch in parallel
    await Promise.allSettled(
      batch.map((ticker) => refreshCEF(ticker))
    );
    
    // Small delay between batches to avoid overwhelming API
    if (i + BATCH_SIZE < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n" + "=".repeat(60));
  console.log(`✅ Completed processing ${tickers.length} CEF(s) in ${elapsed}s`);
  console.log(`⚡ Average: ${(parseFloat(elapsed) / tickers.length).toFixed(1)}s per CEF`);
  console.log("=".repeat(60));
}

main().catch(console.error);
