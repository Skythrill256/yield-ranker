/**
 * CEF (Closed-End Fund) Data Routes
 *
 * Provides endpoints for CEF data operations
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import XLSX from "xlsx";
import { getSupabase } from "../services/database.js";
import {
  getCached,
  setCached,
  CACHE_KEYS,
  CACHE_TTL,
  getRedis,
} from "../services/redis.js";
import {
  logger,
  parseNumeric,
  getDateYearsAgo,
  formatDate,
} from "../utils/index.js";
import {
  getDividendHistory,
  getPriceHistory,
  getLatestPrice,
} from "../services/database.js";
import type { DividendRecord, PriceRecord } from "../types/index.js";

const router: Router = Router();

// ============================================================================
// CEF-Specific Metrics Calculation
// ============================================================================

/**
 * Calculate 5-Year Z-Score for Premium/Discount
 * Uses flexible lookback: 2Y minimum, 5Y maximum
 * Returns null if less than 2 years of data available
 */
export async function calculateCEFZScore(
  ticker: string,
  navSymbol: string | null
): Promise<number | null> {
  if (!navSymbol) return null;

  const DAYS_5Y = 5 * 252; // Max lookback (1260 trading days)
  const DAYS_2Y = 2 * 252; // Min threshold (504 trading days)

  try {
    // Fetch 6 years of data to ensure we cover 5Y window fully
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 6);
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    // Get price data for main ticker and NAV symbol
    const [priceData, navData] = await Promise.all([
      getPriceHistory(ticker, startDateStr, endDateStr),
      getPriceHistory(navSymbol.toUpperCase(), startDateStr, endDateStr),
    ]);

    if (priceData.length === 0 || navData.length === 0) return null;

    // Create maps by date for efficient lookup
    // Use adjusted close for price (like Python example uses adjClose)
    const priceMap = new Map<string, number>();
    priceData.forEach((p: PriceRecord) => {
      const price = p.adj_close ?? p.close;
      if (price !== null && price > 0) {
        priceMap.set(p.date, price);
      }
    });

    // Use adjusted close for NAV as well (consistent with price data)
    const navMap = new Map<string, number>();
    navData.forEach((p: PriceRecord) => {
      const nav = p.adj_close ?? p.close;
      if (nav !== null && nav > 0) {
        navMap.set(p.date, nav);
      }
    });

    // Calculate daily discount: (Price / NAV) - 1
    // Only include dates where both price and NAV exist
    const discounts: number[] = [];
    const allDates = new Set([...priceMap.keys(), ...navMap.keys()]);
    const sortedDates = Array.from(allDates).sort();

    for (const date of sortedDates) {
      const price = priceMap.get(date);
      const nav = navMap.get(date);
      if (price && nav && nav > 0) {
        discounts.push(price / nav - 1.0);
      }
    }

    if (discounts.length < DAYS_2Y) {
      return null; // Not enough data (less than 2 years)
    }

    // Use up to 5 years of data (most recent)
    const lookbackPeriod = Math.min(discounts.length, DAYS_5Y);
    const history = discounts.slice(-lookbackPeriod);

    if (history.length === 0) return null;

    // Calculate stats
    const currentDiscount = history[history.length - 1];
    const avgDiscount = history.reduce((sum, d) => sum + d, 0) / history.length;
    const variance =
      history.reduce((sum, d) => sum + Math.pow(d - avgDiscount, 2), 0) /
      history.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0.0;

    // Z-Score Formula: (Current - Mean) / StdDev
    const zScore = (currentDiscount - avgDiscount) / stdDev;

    return zScore;
  } catch (error) {
    logger.warn(
      "CEF Metrics",
      `Failed to calculate Z-Score for ${ticker}: ${error}`
    );
    return null;
  }
}

/**
 * Calculate 6-Month NAV Trend (percentage change using adjusted close)
 * Formula: ((Current NAV / NAV 126 days ago) - 1) * 100
 * Uses exactly 126 trading days (not calendar months)
 * Requires adjusted NAV from Tiingo (adj_close) which accounts for distributions
 */
export async function calculateNAVTrend6M(
  navSymbol: string | null
): Promise<number | null> {
  if (!navSymbol) return null;

  try {
    // Get enough history: need at least 126 trading days + buffer
    // 126 trading days ≈ 6 months, but we need buffer for weekends/holidays
    // Fetch ~1 year to ensure we have enough trading days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 1); // Get 1 year of data
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    const navData = await getPriceHistory(
      navSymbol.toUpperCase(),
      startDateStr,
      endDateStr
    );
    
    // Need at least 127 records (126 days back + current day)
    if (navData.length < 127) {
      logger.info("CEF Metrics", `6M NAV Trend N/A for ${navSymbol}: insufficient data (${navData.length} < 127 records)`);
      return null;
    }

    // Sort by date ascending (oldest first)
    navData.sort((a, b) => a.date.localeCompare(b.date));

    // Get current NAV (last record)
    const currentRecord = navData[navData.length - 1];
    // Get NAV from 126 trading days ago
    const past126Record = navData[navData.length - 1 - 126];

    if (!currentRecord || !past126Record) return null;

    // Use adjusted close for accuracy (handles splits/dividends/distributions)
    const currentNav = currentRecord.adj_close ?? currentRecord.close;
    const past126Nav = past126Record.adj_close ?? past126Record.close;

    if (!currentNav || !past126Nav || past126Nav <= 0) return null;

    // Calculate percentage change: ((Current / Past) - 1) * 100
    const trend = (currentNav / past126Nav - 1) * 100;

    // Sanity check
    if (!isFinite(trend) || trend < -99 || trend > 10000) return null;

    return trend;
  } catch (error) {
    logger.warn(
      "CEF Metrics",
      `Failed to calculate NAV Trend 6M for ${navSymbol}: ${error}`
    );
    return null;
  }
}

/**
 * Calculate 12-Month NAV Trend (percentage change using adjusted close)
 * Formula: ((Current NAV / NAV 252 days ago) - 1) * 100
 * Uses exactly 252 trading days (not calendar year)
 * Requires adjusted NAV from Tiingo (adj_close) which accounts for distributions
 */
export async function calculateNAVReturn12M(
  navSymbol: string | null
): Promise<number | null> {
  if (!navSymbol) return null;

  try {
    // Get enough history: need at least 252 trading days + buffer
    // 252 trading days ≈ 1 year, but we need buffer for weekends/holidays
    // Fetch ~2 years to ensure we have enough trading days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 2); // Get 2 years of data
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    const navData = await getPriceHistory(
      navSymbol.toUpperCase(),
      startDateStr,
      endDateStr
    );
    
    // Need at least 253 records (252 days back + current day)
    if (navData.length < 253) {
      logger.info("CEF Metrics", `12M NAV Trend N/A for ${navSymbol}: insufficient data (${navData.length} < 253 records)`);
      return null;
    }

    // Sort by date ascending (oldest first)
    navData.sort((a, b) => a.date.localeCompare(b.date));

    // Get current NAV (last record)
    const currentRecord = navData[navData.length - 1];
    // Get NAV from 252 trading days ago
    const past252Record = navData[navData.length - 1 - 252];

    if (!currentRecord || !past252Record) return null;

    // Use adjusted close for accuracy (handles splits/dividends/distributions)
    const currentNav = currentRecord.adj_close ?? currentRecord.close;
    const past252Nav = past252Record.adj_close ?? past252Record.close;

    if (!currentNav || !past252Nav || past252Nav <= 0) return null;

    // Calculate percentage change: ((Current / Past) - 1) * 100
    const trend = (currentNav / past252Nav - 1) * 100;

    // Sanity check
    if (!isFinite(trend) || trend < -99 || trend > 10000) return null;

    return trend;
  } catch (error) {
    logger.warn(
      "CEF Metrics",
      `Failed to calculate NAV Trend 12M for ${navSymbol}: ${error}`
    );
    return null;
  }
}

/**
 * Calculate TOTAL RETURNS for CEFs (3Y, 5Y, 10Y, 15Y) using NAV data
 * 
 * For CEFs, Total Returns are calculated using NAV (Net Asset Value) instead of market price
 * because NAV represents the underlying asset value, while price can trade at premium/discount.
 * 
 * Uses adjusted close (adj_close) which accounts for distributions/dividends,
 * giving true total return with DRIP (Dividend Reinvestment Plan).
 * 
 * Formula: ((NAV_adj_end / NAV_adj_start) - 1) * 100
 * 
 * This is equivalent to calculateTotalReturnDrip but uses NAV data instead of price data.
 * These values are displayed as "TOTAL RETURNS" in the CEF table.
 */
export async function calculateNAVReturns(
  navSymbol: string | null,
  period: '3Y' | '5Y' | '10Y' | '15Y'
): Promise<number | null> {
  if (!navSymbol) return null;

  try {
    // Get the most recent NAV to determine actual end date
    // Use getPriceHistory with Tiingo fallback instead of getLatestPrice (which doesn't have fallback)
    const endDateForLatest = new Date();
    const startDateForLatest = new Date();
    startDateForLatest.setDate(endDateForLatest.getDate() - 30); // Get last 30 days to find latest
    const latestNav = await getPriceHistory(
      navSymbol.toUpperCase(),
      formatDate(startDateForLatest),
      formatDate(endDateForLatest)
    );
    
    if (latestNav.length === 0) {
      logger.info("CEF Metrics", `No NAV data found for ${navSymbol} (checked database and Tiingo)`);
      return null;
    }

    // Sort by date and get the most recent
    latestNav.sort((a, b) => a.date.localeCompare(b.date));
    const endDate = latestNav[latestNav.length - 1].date;
    const endDateObj = new Date(endDate);
    let startDateObj = new Date(endDate);

    // Calculate start date based on the end date (not today)
    // This ensures we're measuring exactly 3/5/10/15 years from the last trading day
    switch (period) {
      case '3Y':
        startDateObj.setFullYear(endDateObj.getFullYear() - 3);
        break;
      case '5Y':
        startDateObj.setFullYear(endDateObj.getFullYear() - 5);
        break;
      case '10Y':
        startDateObj.setFullYear(endDateObj.getFullYear() - 10);
        break;
      case '15Y':
        startDateObj.setFullYear(endDateObj.getFullYear() - 15);
        break;
    }

    const startDate = formatDate(startDateObj);

    // Fetch NAV data with a buffer to ensure we find the nearest trading day
    // For longer periods, we need more buffer to account for weekends/holidays
    // 15Y needs ~60 days buffer (to cover ~42 trading days), 10Y needs ~45, 5Y needs ~30, 3Y needs ~20
    const bufferDays = period === '15Y' ? 60 : period === '10Y' ? 45 : period === '5Y' ? 30 : 20;
    const bufferDate = new Date(startDateObj);
    bufferDate.setDate(bufferDate.getDate() - bufferDays);
    const fetchStartDate = formatDate(bufferDate);
    
    logger.info("CEF Metrics", `Fetching ${period} NAV data for ${navSymbol}: ${fetchStartDate} to ${endDate} (buffer: ${bufferDays} days)`);

    // Use same NAV fetching method as chart endpoint
    logger.info("CEF Metrics", `Fetching ${period} NAV data for ${navSymbol}: ${fetchStartDate} to ${endDate}`);
    const navData = await getPriceHistory(
      navSymbol.toUpperCase(),
      fetchStartDate,
      endDate
    );

    logger.info("CEF Metrics", `Received ${navData.length} NAV records for ${navSymbol} (requested ${period})`);

    if (navData.length < 2) {
      logger.info("CEF Metrics", `${period} Return N/A for ${navSymbol}: insufficient data (${navData.length} < 2 records)`);
      return null;
    }

    // Log the actual date range we got
    if (navData.length > 0) {
      navData.sort((a, b) => a.date.localeCompare(b.date));
      const firstDate = navData[0].date;
      const lastDate = navData[navData.length - 1].date;
      const firstDateObj = new Date(firstDate);
      const lastDateObj = new Date(lastDate);
      const actualYears = (lastDateObj.getTime() - firstDateObj.getTime()) / (1000 * 60 * 60 * 24 * 365);
      logger.info("CEF Metrics", `Actual date range for ${navSymbol} ${period}: ${firstDate} to ${lastDate} (${actualYears.toFixed(1)} years, ${navData.length} records)`);
    }

    // Convert period to approximate days for validation
    const periodDaysMap: Record<string, number> = {
      '3Y': 1095,
      '5Y': 1825,
      '10Y': 3650,
      '15Y': 5475,
    };
    const requestedDays = periodDaysMap[period];

    // Find start and end prices using same logic as calculateTotalReturnDrip
    // Find first NAV on/after start date
    const startRecord = navData.find(p => p.date >= startDate);
    if (!startRecord) {
      logger.info("CEF Metrics", `${period} Return N/A for ${navSymbol}: no data on/after start date ${startDate}`);
      return null;
    }

    // Find last NAV on/before end date
    const validEndNav = navData.filter(p => p.date <= endDate);
    const endRecord = validEndNav.length > 0 ? validEndNav[validEndNav.length - 1] : null;
    if (!endRecord) {
      logger.info("CEF Metrics", `${period} Return N/A for ${navSymbol}: no data on/before end date ${endDate}`);
      return null;
    }

    // Use adjusted close for total return (accounts for distributions)
    const startNav = startRecord.adj_close ?? startRecord.close;
    const endNav = endRecord.adj_close ?? endRecord.close;

    if (!startNav || !endNav || startNav <= 0 || endNav <= 0) {
      logger.info("CEF Metrics", `${period} Return N/A for ${navSymbol}: invalid prices (start=${startNav}, end=${endNav})`);
      return null;
    }

    // Ensure dates are valid
    if (startRecord.date > endRecord.date) {
      logger.info("CEF Metrics", `${period} Return N/A for ${navSymbol}: invalid date range (${startRecord.date} > ${endRecord.date})`);
      return null;
    }

    // Calculate total return: ((End / Start) - 1) * 100
    const totalReturn = ((endNav / startNav) - 1) * 100;

    // Annualize the return based on the period
    // Formula: Annualized Return = ((1 + Total Return/100)^(1/years) - 1) * 100
    const years = period === '3Y' ? 3 : period === '5Y' ? 5 : period === '10Y' ? 10 : 15;
    let annualizedReturn: number;
    
    if (totalReturn <= -100) {
      // Can't annualize a -100% or worse return
      annualizedReturn = -100;
    } else {
      annualizedReturn = ((Math.pow(1 + totalReturn / 100, 1 / years)) - 1) * 100;
    }

    // Sanity check: returns should be reasonable
    if (!isFinite(annualizedReturn) || annualizedReturn < -100 || annualizedReturn > 1000) {
      logger.warn("CEF Metrics", `Unreasonable ${period} annualized return calculated: ${annualizedReturn}% for ${navSymbol} (total: ${totalReturn}%)`);
      return null;
    }

    logger.info("CEF Metrics", `✅ Calculated ${period} Annualized NAV return for ${navSymbol}: ${annualizedReturn.toFixed(2)}% (total: ${totalReturn.toFixed(2)}% over ${years} years, ${navData.length} records)`);
    return annualizedReturn;
  } catch (error) {
    logger.warn(
      "CEF Metrics",
      `Failed to calculate NAV return ${period} for ${navSymbol}: ${error}`
    );
    return null;
  }
}

/**
 * Calculate Signal Rating (Column Q)
 * Purpose: The "Brain" - combines Z-Score with NAV trends to give a sortable action rank from -2 to +3
 * Constraint: Returns null (N/A) if fund history is < 2 years (504 trading days)
 * 
 * Score Rating Logic:
 * +3: Optimal - Z < -1.5 AND 6M Trend > 0 AND 12M Trend > 0
 * +2: Good Value - Z < -1.5 AND 6M Trend > 0
 * +1: Healthy - Z > -1.5 AND 6M Trend > 0
 *  0: Neutral - Default
 * -1: Value Trap - Z < -1.5 AND 6M Trend < 0
 * -2: Overvalued - Z > 1.5
 */
export async function calculateSignal(
  ticker: string,
  navSymbol: string | null,
  zScore: number | null,
  navTrend6M: number | null,
  navTrend12M: number | null
): Promise<number | null> {
  // If we don't have required inputs, return null
  if (!navSymbol || zScore === null || navTrend6M === null || navTrend12M === null) {
    logger.info("CEF Metrics", `Signal N/A for ${ticker}: missing inputs (zScore=${zScore}, navTrend6M=${navTrend6M}, navTrend12M=${navTrend12M})`);
    return null;
  }

  try {
    // Check if we have enough history (504 trading days = 2 years)
    // Rule: Minimum 2 years (504 days) of history required for reliability
    // Matches Python: if len(df) < 504: return "N/A"
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 3); // Get 3 years to ensure we have 504 trading days
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    const navData = await getPriceHistory(
      navSymbol.toUpperCase(),
      startDateStr,
      endDateStr
    );

    // Need at least 504 trading days of history (matches Python: if len(df) < 504: return "N/A")
    if (navData.length < 504) {
      logger.info("CEF Metrics", `Signal N/A for ${ticker}: insufficient history (${navData.length} < 504 trading days)`);
      return null; // N/A - insufficient history
    }

    const z = zScore;
    const t6 = navTrend6M;
    const t12 = navTrend12M;

    // Logic Gate Scoring (matches Python exactly)
    // +3: Optimal (Cheap + 6mo Health + 12mo Health)
    if (z < -1.5 && t6 > 0 && t12 > 0) {
      logger.info("CEF Metrics", `Signal +3 (Optimal) for ${ticker}: z=${z.toFixed(2)}, t6=${t6.toFixed(2)}%, t12=${t12.toFixed(2)}%`);
      return 3;
    }
    // +2: Good Value (Cheap + 6mo Health)
    else if (z < -1.5 && t6 > 0) {
      logger.info("CEF Metrics", `Signal +2 (Good Value) for ${ticker}: z=${z.toFixed(2)}, t6=${t6.toFixed(2)}%`);
      return 2;
    }
    // +1: Healthy (Not cheap, but growing assets)
    else if (z > -1.5 && t6 > 0) {
      logger.info("CEF Metrics", `Signal +1 (Healthy) for ${ticker}: z=${z.toFixed(2)}, t6=${t6.toFixed(2)}%`);
      return 1;
    }
    // -1: Value Trap (Looks cheap, but assets are shrinking)
    else if (z < -1.5 && t6 < 0) {
      logger.info("CEF Metrics", `Signal -1 (Value Trap) for ${ticker}: z=${z.toFixed(2)}, t6=${t6.toFixed(2)}%`);
      return -1;
    }
    // -2: Overvalued (Statistically expensive)
    else if (z > 1.5) {
      logger.info("CEF Metrics", `Signal -2 (Overvalued) for ${ticker}: z=${z.toFixed(2)}`);
      return -2;
    }
    // 0: Neutral
    else {
      logger.info("CEF Metrics", `Signal 0 (Neutral) for ${ticker}: z=${z.toFixed(2)}, t6=${t6.toFixed(2)}%`);
      return 0;
    }
  } catch (error) {
    logger.warn(
      "CEF Metrics",
      `Failed to calculate Signal for ${ticker}: ${error}`
    );
    return null;
  }
}

// ============================================================================
// File Upload Configuration
// ============================================================================

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const tempDir = path.join(process.cwd(), "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `cef-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files are allowed"));
    }
  },
});

function cleanupFile(filePath: string | null): void {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      logger.warn("Upload", `Failed to cleanup file: ${filePath}`);
    }
  }
}

function findColumn(
  headerMap: Record<string, string>,
  ...names: string[]
): string | null {
  for (const name of names) {
    const key = name.toLowerCase();
    if (headerMap[key] !== undefined) {
      return headerMap[key];
    }
  }
  return null;
}

// ============================================================================
// Helper: Calculate Dividend History (X+ Y- format)
// ============================================================================

function calculateDividendHistory(dividends: DividendRecord[]): string {
  if (!dividends || dividends.length < 2) {
    return dividends.length === 1 ? "1 DIV+" : "0+ 0-";
  }

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

  const chronological = [...regularDivs].reverse();

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

  return `${increases}+ ${decreases}-`;
}

// ============================================================================
// POST /upload - Upload CEF data from Excel
// ============================================================================

router.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    let filePath: string | null = null;

    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      filePath = req.file.path;
      logger.info(
        "CEF Upload",
        `Processing CEF data file: ${req.file.originalname}`
      );

      const workbook = XLSX.readFile(filePath);
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        cleanupFile(filePath);
        res.status(400).json({ error: "Excel file has no sheets" });
        return;
      }

      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const allRows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
      }) as unknown[][];

      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(allRows.length, 20); i++) {
        const row = allRows[i];
        if (!Array.isArray(row)) continue;
        const rowStr = row.map((c) => String(c).toLowerCase().trim());
        if (rowStr.includes("symbol") || rowStr.includes("ticker")) {
          headerRowIndex = i;
          break;
        }
      }

      const rawData = XLSX.utils.sheet_to_json(sheet, {
        range: headerRowIndex,
        defval: null,
      }) as Record<string, unknown>[];

      if (!rawData || rawData.length === 0) {
        cleanupFile(filePath);
        res.status(400).json({ error: "Excel file is empty" });
        return;
      }

      const headers = Object.keys(rawData[0] ?? {});
      const headerMap: Record<string, string> = {};
      headers.forEach((h) => {
        if (h) headerMap[String(h).trim().toLowerCase()] = h;
      });

      const symbolCol = findColumn(
        headerMap,
        "symbol",
        "ticker",
        "ticker symbol"
      );
      if (!symbolCol) {
        cleanupFile(filePath);
        logger.error(
          "CEF Upload",
          `SYMBOL column not found. Headers: ${JSON.stringify(headers)}`
        );
        logger.error("CEF Upload", `Header map: ${JSON.stringify(headerMap)}`);
        res.status(400).json({
          error: "SYMBOL column not found",
          details: `Available columns: ${headers.join(
            ", "
          )}. Please ensure your spreadsheet has a column named SYMBOL or TICKER.`,
        });
        return;
      }

      logger.info(
        "CEF Upload",
        `Found SYMBOL column: ${symbolCol}, Total headers: ${headers.length}`
      );
      logger.info("CEF Upload", `Available columns: ${headers.join(", ")}`);

      const supabase = getSupabase();
      const now = new Date().toISOString();
      let added = 0;
      let updated = 0;
      let skipped = 0;

      let navSymbolCol = findColumn(
        headerMap,
        "nav symbol",
        "nav_symbol",
        "navsym",
        "nav sym",
        "nav ticker",
        "navticker"
      );
      const descCol = findColumn(headerMap, "desc", "description");
      const openDateCol = findColumn(
        headerMap,
        "open",
        "open date",
        "opening date"
      );
      const divHistoryCol = findColumn(
        headerMap,
        "div history",
        "dividend history",
        "div_history",
        "dividend_history"
      );
      const ipoPriceCol = findColumn(
        headerMap,
        "ipo price",
        "ipo_price",
        "ipo"
      );
      const mpCol = findColumn(headerMap, "mp", "market price", "price");

      let navCol = findColumn(
        headerMap,
        "net asset value",
        "nav value",
        "nav_value"
      );
      if (!navCol) {
        const navColCandidate = findColumn(headerMap, "nav");
        if (navColCandidate) {
          const firstRow = rawData.find((r) => r && r[symbolCol]);
          if (firstRow && firstRow[navColCandidate]) {
            const testValue = String(firstRow[navColCandidate]).trim();
            const numericTest = parseNumeric(testValue);
            if (numericTest !== null) {
              navCol = navColCandidate;
            } else if (testValue.length <= 6 && !navSymbolCol) {
              navSymbolCol = navColCandidate;
            }
          }
        }
      }

      if (!navCol && navSymbolCol) {
        const navColCandidate = findColumn(headerMap, "nav");
        if (navColCandidate && navColCandidate !== navSymbolCol) {
          navCol = navColCandidate;
        }
      }
      const lastDivCol = findColumn(
        headerMap,
        "last div",
        "last_dividend",
        "last dividend",
        "lastdiv"
      );
      const numPayCol = findColumn(
        headerMap,
        "#",
        "payments",
        "payments_per_year",
        "# payments",
        "num payments"
      );
      const yrlyDivCol = findColumn(
        headerMap,
        "yrly div",
        "yearly dividend",
        "annual dividend",
        "annual_div",
        "yrlydiv"
      );
      const fYieldCol = findColumn(
        headerMap,
        "f yield",
        "forward yield",
        "fyield",
        "forward_yield"
      );
      const premDiscCol = findColumn(
        headerMap,
        "prem /disc",
        "prem/disc",
        "premium/discount",
        "premium discount",
        "premdisc"
      );
      const avePDCol = findColumn(
        headerMap,
        "ave p/d",
        "ave p/d",
        "average p/d",
        "average premium/discount",
        "avg p/d",
        "avg prem/disc"
      );
      const zScoreCol = findColumn(
        headerMap,
        "5 yr z-score",
        "5yr z-score",
        "5 year z-score",
        "z-score",
        "z score",
        "5y z-score",
        "5y z score",
        "n - 5y z-score"
      );
      const navTrend6MCol = findColumn(
        headerMap,
        "6m nav trend",
        "6m nav trend %",
        "6 month nav trend",
        "nav trend 6m",
        "nav trend 6 month",
        "6mo nav trend"
      );
      const navTrend12MCol = findColumn(
        headerMap,
        "12m nav return",
        "12m nav return %",
        "12 month nav return",
        "nav return 12m",
        "nav return 12 month",
        "12mo nav return",
        "12m nav trend",
        "q - 12m nav return"
      );
      const valueHealthScoreCol = findColumn(
        headerMap,
        "value/health score",
        "value health score",
        "value health",
        "health score",
        "p - value/health score"
      );
      const dviCol = findColumn(headerMap, "dvi", "dividend volatility index");
      const return15YrCol = findColumn(
        headerMap,
        "15 yr annlzd",
        "15 yr annizd",
        "15 yr",
        "15yr",
        "15 year",
        "15year"
      );
      const return10YrCol = findColumn(
        headerMap,
        "10 yr annlzd",
        "10 yr annizd",
        "10 yr",
        "10yr",
        "10 year",
        "10year"
      );
      const return5YrCol = findColumn(
        headerMap,
        "5 yr annlzd",
        "5 yr annizd",
        "5 yr",
        "5yr",
        "5 year",
        "5year"
      );
      const return3YrCol = findColumn(
        headerMap,
        "3 yr annlzd",
        "3 yr annizd",
        "3 yr",
        "3yr",
        "3 year",
        "3year"
      );
      const return12MoCol = findColumn(
        headerMap,
        "12 month",
        "12m",
        "12 mo",
        "12mo",
        "12 month return"
      );
      const return6MoCol = findColumn(
        headerMap,
        "6 month",
        "6m",
        "6 mo",
        "6mo",
        "6 month return"
      );
      const return3MoCol = findColumn(
        headerMap,
        "3 month",
        "3m",
        "3 mo",
        "3mo",
        "3 month return"
      );
      const return1MoCol = findColumn(
        headerMap,
        "1 month",
        "1m",
        "1 mo",
        "1mo",
        "1 month return"
      );
      const return1WkCol = findColumn(
        headerMap,
        "1 week",
        "1w",
        "1 wk",
        "1wk",
        "1 week return"
      );

      logger.info(
        "CEF Upload",
        `Processing ${rawData.length} rows, symbol column: ${symbolCol}`
      );
      logger.info(
        "CEF Upload",
        `Column mappings - NAV Symbol: ${navSymbolCol}, MP: ${mpCol}, NAV: ${navCol}, Last Div: ${lastDivCol}`
      );

      for (const row of rawData) {
        const symbolValue = row[symbolCol];
        if (
          !symbolValue ||
          String(symbolValue).trim() === "" ||
          String(symbolValue).trim().toLowerCase() === "null"
        ) {
          skipped++;
          continue;
        }

        const ticker = String(symbolValue).trim().toUpperCase();
        if (!ticker || ticker.length === 0) {
          skipped++;
          continue;
        }

        logger.info("CEF Upload", `Processing ${ticker}`);

        let navSymbol: string | null = null;
        if (navSymbolCol && row[navSymbolCol]) {
          const navSymbolValue = String(row[navSymbolCol]).trim();
          if (navSymbolValue && navSymbolValue.toUpperCase() !== "NULL") {
            const numericTest = parseNumeric(navSymbolValue);
            if (numericTest === null || navSymbolValue.length <= 6) {
              navSymbol = navSymbolValue.toUpperCase();
            }
          }
        }
        const mp = mpCol && row[mpCol] ? parseNumeric(row[mpCol]) : null;
        let nav: number | null = null;
        if (navCol && row[navCol]) {
          nav = parseNumeric(row[navCol]);
        } else if (
          navSymbolCol &&
          navSymbolCol.toLowerCase() === "nav" &&
          row[navSymbolCol]
        ) {
          const navValue = parseNumeric(String(row[navSymbolCol]));
          if (navValue !== null) {
            nav = navValue;
          }
        }

        let premiumDiscount: number | null = null;
        if (premDiscCol && row[premDiscCol]) {
          premiumDiscount = parseNumeric(row[premDiscCol]);
        } else if (mp !== null && nav !== null && nav !== 0) {
          // Formula: ((MP / NAV - 1) * 100) as percentage
          premiumDiscount = (mp / nav - 1) * 100;
        }

        const updateData: any = {
          ticker,
          updated_at: now,
        };

        if (navSymbolCol && navSymbol) {
          updateData.nav_symbol = navSymbol;
          logger.info(
            "CEF Upload",
            `${ticker}: Setting nav_symbol = ${navSymbol}`
          );
        }
        if (descCol && row[descCol]) {
          const descValue = String(row[descCol]).trim();
          if (descValue && descValue.toLowerCase() !== "null") {
            updateData.description = descValue;
            logger.info(
              "CEF Upload",
              `${ticker}: Setting description = ${descValue}`
            );
          }
        }
        if (divHistoryCol && row[divHistoryCol]) {
          const divHistValue = String(row[divHistoryCol]).trim();
          if (divHistValue && divHistValue.toLowerCase() !== "null") {
            updateData.dividend_history = divHistValue;
          }
        }
        if (openDateCol && row[openDateCol]) {
          const openDate = String(row[openDateCol]).trim();
          if (openDate) updateData.open_date = openDate;
        }
        if (ipoPriceCol && row[ipoPriceCol]) {
          const ipoPrice = parseNumeric(row[ipoPriceCol]);
          if (ipoPrice !== null) updateData.ipo_price = ipoPrice;
        }
        if (mp !== null) updateData.price = mp;
        if (nav !== null) updateData.nav = nav;
        if (premiumDiscount !== null)
          updateData.premium_discount = premiumDiscount;
        if (avePDCol && row[avePDCol]) {
          const avePD = parseNumeric(row[avePDCol]);
          if (avePD !== null) {
            updateData.average_premium_discount = avePD;
          }
        }
        if (lastDivCol && row[lastDivCol]) {
          const lastDiv = parseNumeric(row[lastDivCol]);
          if (lastDiv !== null) updateData.last_dividend = lastDiv;
        }
        if (numPayCol && row[numPayCol]) {
          const numPay = parseNumeric(row[numPayCol]);
          if (numPay !== null) updateData.payments_per_year = numPay;
        }
        if (yrlyDivCol && row[yrlyDivCol]) {
          const yrlyDiv = parseNumeric(row[yrlyDivCol]);
          if (yrlyDiv !== null) updateData.annual_dividend = yrlyDiv;
        }
        if (fYieldCol && row[fYieldCol]) {
          const fYield = parseNumeric(row[fYieldCol]);
          if (fYield !== null) updateData.forward_yield = fYield;
        }
        if (zScoreCol && row[zScoreCol]) {
          const zScore = parseNumeric(row[zScoreCol]);
          if (zScore !== null) updateData.five_year_z_score = zScore;
        }
        if (navTrend6MCol && row[navTrend6MCol]) {
          const navTrend6M = parseNumeric(row[navTrend6MCol]);
          if (navTrend6M !== null) updateData.nav_trend_6m = navTrend6M;
        }
        if (navTrend12MCol && row[navTrend12MCol]) {
          const navTrend12M = parseNumeric(row[navTrend12MCol]);
          if (navTrend12M !== null) updateData.nav_trend_12m = navTrend12M;
        }
        if (valueHealthScoreCol && row[valueHealthScoreCol]) {
          const valueHealthScore = parseNumeric(row[valueHealthScoreCol]);
          if (valueHealthScore !== null)
            updateData.value_health_score = valueHealthScore;
        }
        if (dviCol && row[dviCol]) {
          const dvi = parseNumeric(row[dviCol]);
          if (dvi !== null && dvi !== 0) {
            updateData.dividend_cv_percent = dvi * 100;
          }
        }
        if (return15YrCol && row[return15YrCol]) {
          const return15Yr = parseNumeric(row[return15YrCol]);
          if (return15Yr !== null) {
            updateData.tr_drip_15y = return15Yr;
          }
        }
        if (return10YrCol && row[return10YrCol]) {
          const return10Yr = parseNumeric(row[return10YrCol]);
          if (return10Yr !== null) {
            updateData.tr_drip_10y = return10Yr;
          }
        }
        if (return5YrCol && row[return5YrCol]) {
          const return5Yr = parseNumeric(row[return5YrCol]);
          if (return5Yr !== null) {
            updateData.tr_drip_5y = return5Yr;
          }
        }
        if (return3YrCol && row[return3YrCol]) {
          const return3Yr = parseNumeric(row[return3YrCol]);
          if (return3Yr !== null) updateData.tr_drip_3y = return3Yr;
        }
        if (return12MoCol && row[return12MoCol]) {
          const return12Mo = parseNumeric(row[return12MoCol]);
          if (return12Mo !== null) updateData.tr_drip_12m = return12Mo;
        }
        if (return6MoCol && row[return6MoCol]) {
          const return6Mo = parseNumeric(row[return6MoCol]);
          if (return6Mo !== null) updateData.tr_drip_6m = return6Mo;
        }
        if (return3MoCol && row[return3MoCol]) {
          const return3Mo = parseNumeric(row[return3MoCol]);
          if (return3Mo !== null) updateData.tr_drip_3m = return3Mo;
        }
        if (return1MoCol && row[return1MoCol]) {
          const return1Mo = parseNumeric(row[return1MoCol]);
          if (return1Mo !== null) updateData.tr_drip_1m = return1Mo;
        }
        if (return1WkCol && row[return1WkCol]) {
          const return1Wk = parseNumeric(row[return1WkCol]);
          if (return1Wk !== null) updateData.tr_drip_1w = return1Wk;
        }

        const { data: existing } = await supabase
          .from("etf_static")
          .select("ticker")
          .eq("ticker", ticker)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("etf_static")
            .update(updateData)
            .eq("ticker", ticker);

          if (error) {
            logger.error(
              "CEF Upload",
              `Failed to update ${ticker}: ${error.message}`
            );
            logger.error(
              "CEF Upload",
              `Update data: ${JSON.stringify(updateData)}`
            );
          } else {
            updated++;
            logger.info("CEF Upload", `Successfully updated ${ticker}`);
          }
        } else {
          updateData.issuer = null;
          updateData.pay_day_text = null;
          const { error } = await supabase
            .from("etf_static")
            .insert(updateData);

          if (error) {
            logger.error(
              "CEF Upload",
              `Failed to insert ${ticker}: ${error.message}`
            );
            logger.error(
              "CEF Upload",
              `Insert data: ${JSON.stringify(updateData)}`
            );
          } else {
            added++;
            logger.info("CEF Upload", `Successfully added ${ticker}`);
          }
        }

        if (lastDivCol && row[lastDivCol]) {
          const divAmount = parseNumeric(row[lastDivCol]);
          if (divAmount !== null && divAmount > 0) {
            const exDate = new Date().toISOString().split("T")[0];
            await supabase.from("dividends_detail").upsert(
              {
                ticker,
                ex_date: exDate,
                div_cash: divAmount,
                is_manual: true,
                pay_date: null,
                record_date: null,
                declare_date: null,
              },
              {
                onConflict: "ticker,ex_date",
                ignoreDuplicates: false,
              }
            );
          }
        }
      }

      cleanupFile(filePath);

      // Clear CEF cache immediately
      const redis = getRedis();
      if (redis) {
        try {
          await redis.del("cef_list");
          logger.info("CEF Upload", "Cleared CEF list cache after upload");
        } catch (cacheError) {
          logger.warn(
            "CEF Upload",
            `Failed to clear cache: ${(cacheError as Error).message}`
          );
        }
      }

      res.json({
        success: true,
        message: `Processed CEF upload: ${added} added, ${updated} updated, ${skipped} skipped`,
        added,
        updated,
        skipped,
        count: added + updated,
      });
    } catch (error) {
      cleanupFile(filePath);
      logger.error("CEF Upload", `Error: ${(error as Error).message}`);
      res.status(500).json({
        error: "Internal server error",
        details: (error as Error).message,
      });
    }
  }
);

// ============================================================================
// GET /test-data-range/:symbol - Test endpoint to check data ranges
// ============================================================================

router.get("/test-data-range/:symbol", async (req: Request, res: Response): Promise<void> => {
  try {
    const { symbol } = req.params;
    const ticker = symbol.toUpperCase();
    const supabase = getSupabase();

    const { data: cef } = await supabase
      .from("etf_static")
      .select("ticker, nav_symbol, description")
      .eq("ticker", ticker)
      .maybeSingle();

    if (!cef || !cef.nav_symbol) {
      res.status(404).json({ error: "CEF not found or no NAV symbol" });
      return;
    }

    const endDate = new Date();
    const ranges = [
      { name: '1Y', years: 1 },
      { name: '3Y', years: 3 },
      { name: '5Y', years: 5 },
      { name: '10Y', years: 10 },
      { name: '15Y', years: 15 },
      { name: '20Y', years: 20 },
    ];

    const results: any[] = [];

    for (const range of ranges) {
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - range.years);
      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);

      const navData = await getPriceHistory(cef.nav_symbol, startDateStr, endDateStr);

      if (navData.length > 0) {
        navData.sort((a, b) => a.date.localeCompare(b.date));
        const first = navData[0];
        const last = navData[navData.length - 1];
        const firstDate = new Date(first.date);
        const lastDate = new Date(last.date);
        const actualYears = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365);

        results.push({
          period: range.name,
          requestedYears: range.years,
          records: navData.length,
          firstDate: first.date,
          lastDate: last.date,
          actualYears: parseFloat(actualYears.toFixed(1)),
          hasAdjClose: navData.some(d => d.adj_close !== null),
          samplePrices: {
            first: {
              close: first.close,
              adj_close: first.adj_close,
            },
            last: {
              close: last.close,
              adj_close: last.adj_close,
            },
          },
        });
      } else {
        results.push({
          period: range.name,
          requestedYears: range.years,
          records: 0,
          error: 'No data found',
        });
      }
    }

    res.json({
      ticker: cef.ticker,
      navSymbol: cef.nav_symbol,
      description: cef.description,
      dataRanges: results,
    });
  } catch (error) {
    logger.error("Routes", `Error testing data range: ${(error as Error).message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// GET / - List all CEFs
// ============================================================================

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const cacheKey = "cef_list";
    const cached = await getCached<any>(cacheKey);
    if (cached) {
      logger.info(
        "Routes",
        `Returning ${cached.cefs?.length || 0} CEFs from Redis cache`
      );
      res.json(cached);
      return;
    }

    const supabase = getSupabase();

    const staticResult = await supabase
      .from("etf_static")
      .select("*")
      .order("ticker", { ascending: true })
      .limit(10000);

    if (staticResult.error) {
      logger.error(
        "Routes",
        `Error fetching CEF data: ${JSON.stringify(staticResult.error)}`
      );
      res.status(500).json({
        error: "Failed to fetch CEF data",
        details: staticResult.error.message || String(staticResult.error),
        code: staticResult.error.code,
      });
      return;
    }

    const allData = staticResult.data || [];

    // Only include CEFs: must have nav_symbol OR nav set OR premium_discount set
    // This ensures we don't filter out CEFs that might have data but missing nav_symbol
    const staticData = allData.filter((item: any) => {
      const hasNavSymbol =
        item.nav_symbol !== null &&
        item.nav_symbol !== undefined &&
        item.nav_symbol !== "";
      const hasNav =
        item.nav !== null && item.nav !== undefined && item.nav !== "";
      const hasPremDisc =
        item.premium_discount !== null &&
        item.premium_discount !== undefined;
      // Must have at least one CEF identifier
      return hasNavSymbol || hasNav || hasPremDisc;
    });

    if (staticData.length === 0 && allData.length > 0) {
      logger.warn("Routes", `No CEFs found - checking sample record`);
      const sample = allData[0];
      logger.warn(
        "Routes",
        `Sample record keys: ${Object.keys(sample).join(", ")}`
      );
      logger.warn(
        "Routes",
        `Sample nav_symbol: ${sample.nav_symbol}, nav: ${sample.nav}`
      );
    }

    logger.info(
      "Routes",
      `Fetched ${allData.length} total records, ${staticData.length} CEFs (filtered by nav_symbol or nav)`
    );

    const { calculateMetrics } = await import("../services/metrics.js");

    // Process CEFs with optimized approach: use database values first, calculate only if missing
    // Process in smaller batches to prevent timeout
    const BATCH_SIZE = 10; // Process 10 CEFs at a time
    const cefsWithDividendHistory: any[] = [];
    
    for (let i = 0; i < staticData.length; i += BATCH_SIZE) {
      const batch = staticData.slice(i, i + BATCH_SIZE);
      // Use Promise.allSettled so one failure doesn't break the whole batch
      const batchResults = await Promise.allSettled(
        batch.map(async (cef: any) => {
        // Use cached dividend history from database if available
        let dividendHistory = cef.dividend_history || null;
        if (!dividendHistory) {
          try {
            const dividends = await getDividendHistory(cef.ticker);
            dividendHistory = calculateDividendHistory(dividends);
          } catch (error) {
            logger.warn(
              "Routes",
              `Failed to calculate dividend history for ${cef.ticker}: ${error}`
            );
            dividendHistory = "0+ 0-";
          }
        }

        // Calculate metrics if ANY database values are missing (short-term OR long-term returns)
        // Use cached metrics first, then calculate with timeout to prevent loading issues
        let metrics: any = null;
        const hasShortTerm = (cef.tr_drip_1w !== null && cef.tr_drip_1w !== undefined) &&
                            (cef.tr_drip_1m !== null && cef.tr_drip_1m !== undefined) &&
                            (cef.tr_drip_3m !== null && cef.tr_drip_3m !== undefined) &&
                            (cef.tr_drip_6m !== null && cef.tr_drip_6m !== undefined) &&
                            (cef.tr_drip_12m !== null && cef.tr_drip_12m !== undefined);
        // For long-term, check if ANY are null/undefined - if so, we need metrics for fallback
        const hasLongTerm = (cef.return_3yr !== null && cef.return_3yr !== undefined) &&
                           (cef.return_5yr !== null && cef.return_5yr !== undefined) &&
                           (cef.return_10yr !== null && cef.return_10yr !== undefined) &&
                           (cef.return_15yr !== null && cef.return_15yr !== undefined);
        const needsMetrics = !hasShortTerm || !hasLongTerm;
        
        // Calculate metrics with timeout and caching to prevent loading issues
        // CRITICAL: Always try to get metrics if long-term returns are missing
        // This ensures we show data even if database values are null
        if (needsMetrics) {
          try {
            // Try cache first (5 minute TTL)
            const metricsCacheKey = `cef:metrics:${cef.ticker}`;
            const cachedMetrics = await getCached<any>(metricsCacheKey);
            if (cachedMetrics) {
              metrics = cachedMetrics;
              logger.debug("Routes", `Using cached metrics for ${cef.ticker}`);
            } else {
              // Calculate with 10 second timeout to prevent hanging
              logger.info("Routes", `Calculating metrics for ${cef.ticker} (missing database values)`);
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Metrics calculation timeout')), 10000)
              );
              metrics = await Promise.race([
                calculateMetrics(cef.ticker),
                timeoutPromise
              ]) as any;
              
              // Cache the result for 5 minutes
              if (metrics) {
                await setCached(metricsCacheKey, metrics, 300);
                logger.info("Routes", `Cached metrics for ${cef.ticker}: 5Y=${metrics?.totalReturnDrip?.["5Y"]}, 10Y=${metrics?.totalReturnDrip?.["10Y"]}, 15Y=${metrics?.totalReturnDrip?.["15Y"]}`);
              }
            }
          } catch (error) {
            // Timeout or calculation error - just log and continue
            logger.warn("Routes", `Failed to calculate metrics for ${cef.ticker}: ${(error as Error).message}`);
            metrics = null;
          }
        }

        // USE DATABASE VALUES ONLY - Do not fetch prices in real-time for list endpoint
        // This prevents timeouts. Prices should be updated by refresh_all.ts
        const currentNav: number | null = cef.nav ?? null;
        const marketPrice: number | null = cef.price ?? metrics?.currentPrice ?? null;

        // ALWAYS calculate premium/discount from current MP and NAV
        // Formula: ((MP / NAV - 1) * 100) as percentage
        // Example: GAB (6.18/5.56)-1 * 100 = 11.15% (displays as +11.15%)
        let premiumDiscount: number | null = null;
        if (currentNav && currentNav !== 0 && marketPrice && marketPrice > 0) {
          premiumDiscount = (marketPrice / currentNav - 1) * 100;
        } else if (cef.premium_discount !== null && cef.premium_discount !== undefined) {
          premiumDiscount = cef.premium_discount;
        }

        // USE DATABASE VALUES ONLY - Do not calculate in real-time for list endpoint
        // This prevents timeouts. All values should be pre-computed by refresh_all.ts
        // Real-time calculations are only done in single CEF endpoint (/:symbol)
        // Read values directly from database - handle both null and undefined
        const fiveYearZScore: number | null = (cef.five_year_z_score !== undefined && cef.five_year_z_score !== null) ? cef.five_year_z_score : null;
        const navTrend6M: number | null = (cef.nav_trend_6m !== undefined && cef.nav_trend_6m !== null) ? cef.nav_trend_6m : null;
        const navTrend12M: number | null = (cef.nav_trend_12m !== undefined && cef.nav_trend_12m !== null) ? cef.nav_trend_12m : null;
        const signal: number | null = (cef.signal !== undefined && cef.signal !== null) ? cef.signal : null;
        // For returns, check if column exists and has value
        // If database values are null/undefined, we'll use metrics fallback
        const return3Yr: number | null = (cef.return_3yr !== undefined && cef.return_3yr !== null) ? cef.return_3yr : null;
        const return5Yr: number | null = (cef.return_5yr !== undefined && cef.return_5yr !== null) ? cef.return_5yr : null;
        const return10Yr: number | null = (cef.return_10yr !== undefined && cef.return_10yr !== null) ? cef.return_10yr : null;
        const return15Yr: number | null = (cef.return_15yr !== undefined && cef.return_15yr !== null) ? cef.return_15yr : null;

        return {
          symbol: cef.ticker,
          name: cef.description || cef.ticker,
          issuer: cef.issuer || null,
          description: cef.description || null,
          navSymbol: cef.nav_symbol || null,
          openDate: cef.open_date || null,
          ipoPrice: cef.ipo_price || null,
          marketPrice: marketPrice,
          nav: currentNav,
          premiumDiscount: premiumDiscount,
          fiveYearZScore: fiveYearZScore,
          navTrend6M: navTrend6M,
          navTrend12M: navTrend12M,
          signal: signal,
          valueHealthScore: cef.value_health_score || null,
          lastDividend: metrics?.lastDividend ?? cef.last_dividend ?? null,
          numPayments: metrics?.paymentsPerYear ?? cef.payments_per_year ?? 12,
          yearlyDividend:
            metrics?.annualizedDividend ?? cef.annual_dividend ?? null,
          forwardYield: metrics?.forwardYield ?? cef.forward_yield ?? null,
          dividendHistory: dividendHistory,
          dividendSD: metrics?.dividendSD ?? cef.dividend_sd ?? null,
          dividendCV: metrics?.dividendCV ?? cef.dividend_cv ?? null,
          dividendCVPercent:
            metrics?.dividendCVPercent ?? cef.dividend_cv_percent ?? null,
          dividendVolatilityIndex:
            metrics?.dividendVolatilityIndex ??
            cef.dividend_volatility_index ??
            null,
          // Long-term returns: Use database values first (NAV-based from refresh_all.ts), 
          // then fall back to metrics (price-based) - EXACTLY like short-term returns
          // CRITICAL: If database value is null/undefined, use metrics fallback
          // This ensures we always show data when available
          const finalReturn15Yr = (return15Yr != null) ? return15Yr : (metrics?.totalReturnDrip?.["15Y"] ?? null);
          const finalReturn10Yr = (return10Yr != null) ? return10Yr : (metrics?.totalReturnDrip?.["10Y"] ?? null);
          const finalReturn5Yr = (return5Yr != null) ? return5Yr : (metrics?.totalReturnDrip?.["5Y"] ?? null);
          const finalReturn3Yr = (return3Yr != null) ? return3Yr : (metrics?.totalReturnDrip?.["3Y"] ?? null);
          
          // LOG EVERY CEF to help debug - show first 5 CEFs
          if (i < 5) {
            console.log(`\n[CEF ${i+1}] ${cef.ticker}:`);
            console.log(`  DB values: 3Y=${return3Yr}, 5Y=${return5Yr}, 10Y=${return10Yr}, 15Y=${return15Yr}`);
            console.log(`  Metrics: 3Y=${metrics?.totalReturnDrip?.["3Y"]}, 5Y=${metrics?.totalReturnDrip?.["5Y"]}, 10Y=${metrics?.totalReturnDrip?.["10Y"]}, 15Y=${metrics?.totalReturnDrip?.["15Y"]}`);
            console.log(`  FINAL: 3Y=${finalReturn3Yr}, 5Y=${finalReturn5Yr}, 10Y=${finalReturn10Yr}, 15Y=${finalReturn15Yr}`);
          }
          
          return15Yr: finalReturn15Yr,
          return10Yr: finalReturn10Yr,
          return5Yr: finalReturn5Yr,
          return3Yr: finalReturn3Yr,
          // Short-term returns: Use metrics first, then database - already working correctly
          return12Mo: metrics?.totalReturnDrip?.["1Y"] ?? cef.tr_drip_12m ?? null,
          return6Mo: metrics?.totalReturnDrip?.["6M"] ?? cef.tr_drip_6m ?? null,
          return3Mo: metrics?.totalReturnDrip?.["3M"] ?? cef.tr_drip_3m ?? null,
          return1Mo: metrics?.totalReturnDrip?.["1M"] ?? cef.tr_drip_1m ?? null,
          return1Wk: metrics?.totalReturnDrip?.["1W"] ?? cef.tr_drip_1w ?? null,
          weightedRank: cef.weighted_rank || null,
          week52Low: metrics?.week52Low ?? cef.week_52_low ?? null,
          week52High: metrics?.week52High ?? cef.week_52_high ?? null,
          lastUpdated: cef.last_updated || cef.updated_at,
          dataSource: "Tiingo",
        };
        })
      );
      
      // Extract successful results, log failures
      const successfulResults = batchResults
        .map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            logger.warn("Routes", `Failed to process CEF ${batch[index]?.ticker}: ${result.reason}`);
            return null;
          }
        })
        .filter((cef): cef is any => cef !== null);
      
      cefsWithDividendHistory.push(...successfulResults);
    }

    let lastUpdatedTimestamp: string | null = null;
    if (staticData.length > 0) {
      const mostRecent = staticData.reduce((latest: any, current: any) => {
        if (!latest || !latest.last_updated) return current;
        if (!current || !current.last_updated) return latest;
        return new Date(current.last_updated) > new Date(latest.last_updated)
          ? current
          : latest;
      }, null);
      lastUpdatedTimestamp =
        mostRecent?.last_updated || mostRecent?.updated_at || null;
    }

    const response = {
      cefs: cefsWithDividendHistory,
      lastUpdated: lastUpdatedTimestamp,
      lastUpdatedTimestamp: lastUpdatedTimestamp,
    };

    await setCached(cacheKey, response, CACHE_TTL.ETF_LIST);
    logger.info(
      "Routes",
      `Returning ${cefsWithDividendHistory.length} CEFs (cached)`
    );

    res.json(response);
  } catch (error) {
    logger.error("Routes", `Error fetching CEFs: ${(error as Error).message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// GET /:symbol/price-nav - Get price and NAV data for charting
// MUST come before /:symbol route to avoid route conflict
// ============================================================================

router.get(
  "/:symbol/price-nav",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { symbol } = req.params;
      const ticker = symbol.toUpperCase();
      const { period = "1Y" } = req.query;

      const supabase = getSupabase();

      const staticResult = await supabase
        .from("etf_static")
        .select("nav_symbol")
        .eq("ticker", ticker)
        .maybeSingle();

      if (!staticResult.data) {
        res.status(404).json({ error: "CEF not found" });
        return;
      }

      const navSymbol = staticResult.data.nav_symbol;

      const endDate = new Date();
      const startDate = new Date();
      switch (period) {
        case "1M":
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        case "3M":
          startDate.setMonth(endDate.getMonth() - 3);
          break;
        case "6M":
          startDate.setMonth(endDate.getMonth() - 6);
          break;
        case "1Y":
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        case "3Y":
          startDate.setFullYear(endDate.getFullYear() - 3);
          break;
        case "5Y":
          startDate.setFullYear(endDate.getFullYear() - 5);
          break;
        case "10Y":
          startDate.setFullYear(endDate.getFullYear() - 10);
          break;
        case "15Y":
          startDate.setFullYear(endDate.getFullYear() - 15);
          break;
        case "MAX":
          // Fetch maximum available data (20 years should be enough)
          startDate.setFullYear(endDate.getFullYear() - 20);
          break;
        default:
          startDate.setFullYear(endDate.getFullYear() - 1);
      }

      const startDateStr = startDate.toISOString().split("T")[0];
      const endDateStr = endDate.toISOString().split("T")[0];

      // Fetch price data (with Tiingo fallback)
      const priceData = await getPriceHistory(ticker, startDateStr, endDateStr);
      logger.info(
        "Routes",
        `Fetched ${priceData.length} price records for ${ticker} (${startDateStr} to ${endDateStr})`
      );

      // Fetch NAV data (with Tiingo fallback)
      let navData: any[] = [];
      if (navSymbol && navSymbol.trim()) {
        try {
          navData = await getPriceHistory(
            navSymbol.toUpperCase(),
            startDateStr,
            endDateStr
          );
          logger.info(
            "Routes",
            `Fetched ${navData.length} NAV records for ${navSymbol} (${startDateStr} to ${endDateStr})`
          );
        } catch (error) {
          logger.warn(
            "Routes",
            `Failed to fetch NAV data for ${navSymbol}: ${error}`
          );
        }
      } else {
        logger.warn(
          "Routes",
          `No NAV symbol found for ${ticker}, NAV chart data will be empty`
        );
      }
      
      // Log data availability for debugging
      if (priceData.length === 0) {
        logger.warn(
          "Routes",
          `No price data found for ${ticker} in period ${period} (${startDateStr} to ${endDateStr}). Chart may show only NAV data.`
        );
      }
      if (navData.length === 0 && navSymbol) {
        logger.warn(
          "Routes",
          `No NAV data found for ${navSymbol} in period ${period} (${startDateStr} to ${endDateStr}). Chart may show only price data.`
        );
      }

      const priceMap = new Map<
        string,
        { close: number | null; date: string }
      >();
      priceData.forEach((p: any) => {
        const date = typeof p.date === "string" ? p.date.split("T")[0] : p.date;
        const closePrice = p.close ?? p.adj_close ?? null;
        if (closePrice !== null) {
          priceMap.set(date, { close: closePrice, date });
        }
      });

      const navMap = new Map<string, { close: number | null; date: string }>();
      navData.forEach((p: any) => {
        const date = typeof p.date === "string" ? p.date.split("T")[0] : p.date;
        const closePrice = p.close ?? p.adj_close ?? null;
        if (closePrice !== null) {
          navMap.set(date, { close: closePrice, date });
        }
      });

      // Combine dates from both price and NAV data
      // Only include dates that have actual data (no forward-filling)
      const allDates = new Set([...priceMap.keys(), ...navMap.keys()]);
      const sortedDates = Array.from(allDates).sort();

      // Use only actual daily prices - no forward filling
      // This ensures the chart shows actual trading day data with natural gaps
      const combinedData = sortedDates
        .map((date) => {
          const priceEntry = priceMap.get(date);
          const navEntry = navMap.get(date);

          return {
            date,
            price: priceEntry?.close ?? null,
            nav: navEntry?.close ?? null,
          };
        })
        .filter((d) => d.price !== null || d.nav !== null);

      res.json({
        symbol: ticker,
        navSymbol: navSymbol || null,
        period,
        data: combinedData,
      });
    } catch (error) {
      logger.error(
        "Routes",
        `Error fetching price/NAV data for ${req.params.symbol}: ${
          (error as Error).message
        }`
      );
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ============================================================================
// GET /:symbol - Get single CEF
// ============================================================================

router.get("/:symbol", async (req: Request, res: Response): Promise<void> => {
  try {
    const { symbol } = req.params;
    const ticker = symbol.toUpperCase();
    const supabase = getSupabase();

    const staticResult = await supabase
      .from("etf_static")
      .select("*")
      .eq("ticker", ticker)
      .maybeSingle();

    if (!staticResult.data) {
      res.status(404).json({ error: "CEF not found" });
      return;
    }

    const cef = staticResult.data;

    // Calculate metrics for accurate yearly returns (like ETFs do)
    let metrics = null;
    try {
      const { calculateMetrics } = await import("../services/metrics.js");
      metrics = await calculateMetrics(ticker);
      if (!metrics) {
        logger.warn("Routes", `calculateMetrics returned null for ${ticker}`);
      }
    } catch (error) {
      logger.warn("Routes", `Failed to calculate metrics for ${ticker}: ${error}`);
    }

    let dividendHistory = cef.dividend_history || null;
    if (!dividendHistory) {
      try {
        const dividends = await getDividendHistory(ticker);
        dividendHistory = calculateDividendHistory(dividends);
      } catch (error) {
        logger.warn(
          "Routes",
          `Failed to calculate dividend history for ${ticker}: ${error}`
        );
        dividendHistory = "0+ 0-";
      }
    }

    // Get current NAV from latest price of nav_symbol if nav_symbol exists
    // Use same approach as chart: getPriceHistory with recent date range (has Tiingo fallback)
    let currentNav: number | null = cef.nav ?? null;
    if (!currentNav && cef.nav_symbol) {
      try {
        // Get last 30 days of NAV data to find the most recent price
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);
        const startDateStr = formatDate(startDate);
        const endDateStr = formatDate(endDate);

        const navHistory = await getPriceHistory(
          cef.nav_symbol.toUpperCase(),
          startDateStr,
          endDateStr
        );

        // Get the most recent NAV price (last record)
        if (navHistory.length > 0) {
          const latestNav = navHistory[navHistory.length - 1];
          currentNav = latestNav.close ?? latestNav.adj_close ?? null;
        }
      } catch (error) {
        logger.warn(
          "Routes",
          `Failed to fetch NAV price for ${cef.nav_symbol}: ${error}`
        );
      }
    }

    // Get the market price (MP) - use latest from metrics or fetch from price history (has Tiingo fallback)
    let marketPrice = metrics?.currentPrice ?? cef.price ?? null;

    // If we don't have a current price, try to get it from price history (has Tiingo fallback)
    if (!marketPrice) {
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);
        const startDateStr = formatDate(startDate);
        const endDateStr = formatDate(endDate);

        const priceHistory = await getPriceHistory(
          ticker,
          startDateStr,
          endDateStr
        );

        if (priceHistory.length > 0) {
          const latestPrice = priceHistory[priceHistory.length - 1];
          marketPrice = latestPrice.close ?? latestPrice.adj_close ?? null;
        }
      } catch (error) {
        logger.warn("Routes", `Failed to fetch price for ${ticker}: ${error}`);
      }
    }

    // ALWAYS calculate premium/discount from current MP and NAV
    // Formula: ((MP / NAV - 1) * 100) as percentage
    // Example: GAB (6.18/5.56)-1 * 100 = 11.15% (displays as +11.15%)
    let premiumDiscount: number | null = null;
    if (currentNav && currentNav !== 0 && marketPrice) {
      premiumDiscount = (marketPrice / currentNav - 1) * 100;
    } else {
      // Fallback to database value only if we can't calculate
      premiumDiscount = cef.premium_discount ?? null;
    }

    // Calculate Z-Score (use database value if available, otherwise calculate)
    let fiveYearZScore: number | null = cef.five_year_z_score ?? null;
    if (fiveYearZScore === null && cef.nav_symbol) {
      try {
        fiveYearZScore = await calculateCEFZScore(ticker, cef.nav_symbol);
      } catch (error) {
        logger.warn("Routes", `Failed to calculate Z-Score for ${ticker}: ${error}`);
      }
    }

    // Calculate NAV Trend 6M (use database value if available, otherwise calculate)
    let navTrend6M: number | null = cef.nav_trend_6m ?? null;
    if (navTrend6M === null && cef.nav_symbol) {
      try {
        navTrend6M = await calculateNAVTrend6M(cef.nav_symbol);
      } catch (error) {
        logger.warn("Routes", `Failed to calculate NAV Trend 6M for ${ticker}: ${error}`);
      }
    }

    // Calculate NAV Return 12M (use database value if available, otherwise calculate)
    let navTrend12M: number | null = cef.nav_trend_12m ?? null;
    if (navTrend12M === null && cef.nav_symbol) {
      try {
        navTrend12M = await calculateNAVReturn12M(cef.nav_symbol);
      } catch (error) {
        logger.warn("Routes", `Failed to calculate NAV Return 12M for ${ticker}: ${error}`);
      }
    }

    // Calculate Signal (use database value if available, otherwise calculate)
    let signal: number | null = cef.signal ?? null;
    if (signal === null && fiveYearZScore !== null && navTrend6M !== null && navTrend12M !== null) {
      try {
        signal = await calculateSignal(ticker, cef.nav_symbol, fiveYearZScore, navTrend6M, navTrend12M);
      } catch (error) {
        logger.warn("Routes", `Failed to calculate Signal for ${ticker}: ${error}`);
      }
    }

    // Calculate TOTAL RETURNS (use database values if available, otherwise calculate)
    let return3Yr: number | null = cef.return_3yr ?? cef.tr_drip_3y ?? null;
    let return5Yr: number | null = cef.return_5yr ?? cef.tr_drip_5y ?? null;
    let return10Yr: number | null = cef.return_10yr ?? cef.tr_drip_10y ?? null;
    let return15Yr: number | null = cef.return_15yr ?? cef.tr_drip_15y ?? null;
    
    // Only calculate missing returns (expensive, so prefer database values)
    if (cef.nav_symbol && (return3Yr === null || return5Yr === null || return10Yr === null || return15Yr === null)) {
      try {
        const calculated = await Promise.all([
          return3Yr === null ? calculateNAVReturns(cef.nav_symbol, '3Y') : Promise.resolve(return3Yr),
          return5Yr === null ? calculateNAVReturns(cef.nav_symbol, '5Y') : Promise.resolve(return5Yr),
          return10Yr === null ? calculateNAVReturns(cef.nav_symbol, '10Y') : Promise.resolve(return10Yr),
          return15Yr === null ? calculateNAVReturns(cef.nav_symbol, '15Y') : Promise.resolve(return15Yr),
        ]);
        return3Yr = calculated[0];
        return5Yr = calculated[1];
        return10Yr = calculated[2];
        return15Yr = calculated[3];
      } catch (error) {
        logger.warn("Routes", `Failed to calculate Total Returns (NAV-based) for ${ticker}: ${error}`);
      }
    }

    const response = {
      symbol: cef.ticker,
      name: cef.description || cef.ticker,
      issuer: cef.issuer || null,
      description: cef.description || null,
      navSymbol: cef.nav_symbol || null,
      openDate: cef.open_date || null,
      ipoPrice: cef.ipo_price || null,
      marketPrice: marketPrice,
      nav: currentNav,
      premiumDiscount: premiumDiscount,
      fiveYearZScore: fiveYearZScore,
      navTrend6M: navTrend6M,
      navTrend12M: navTrend12M,
      signal: signal,
      valueHealthScore: cef.value_health_score || null,
      lastDividend: cef.last_dividend || null,
      numPayments: cef.payments_per_year || 12,
      yearlyDividend: cef.annual_dividend || null,
      forwardYield: cef.forward_yield || null,
      dividendHistory: dividendHistory,
      dividendSD: cef.dividend_sd || null,
      dividendCV: cef.dividend_cv || null,
      dividendCVPercent: cef.dividend_cv_percent || null,
      dividendVolatilityIndex: cef.dividend_volatility_index || null,
      return15Yr: return15Yr,
      return10Yr: return10Yr,
      return5Yr: return5Yr,
      return3Yr: return3Yr,
      return12Mo: cef.return_12mo ?? cef.tr_drip_12m ?? null,
      return6Mo: cef.return_6mo ?? cef.tr_drip_6m ?? null,
      return3Mo: cef.return_3mo ?? cef.tr_drip_3m ?? null,
      return1Mo: cef.return_1mo ?? cef.tr_drip_1m ?? null,
      return1Wk: cef.return_1wk ?? cef.tr_drip_1w ?? null,
      weightedRank: cef.weighted_rank || null,
      week52Low: cef.week_52_low || null,
      week52High: cef.week_52_high || null,
      lastUpdated: cef.last_updated || cef.updated_at,
      dataSource: "Tiingo",
    };

    res.json(response);
  } catch (error) {
    logger.error("Routes", `Error fetching CEF: ${(error as Error).message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
