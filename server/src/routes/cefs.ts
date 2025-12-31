/**
 * CEF (Closed End Fund) Data Routes
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
 * Calculate 3-Year Z-Score for Premium/Discount
 * Uses flexible lookback: 1Y minimum, 3Y maximum
 * Returns null if less than 1 year of data available
 */
export async function calculateCEFZScore(
  ticker: string,
  navSymbol: string | null
): Promise<number | null> {
  if (!navSymbol) return null;

  const DAYS_3Y = 3 * 252; // Max lookback (756 trading days)
  const DAYS_1Y = 1 * 252; // Min threshold (252 trading days)

  try {
    // Get the most recent date with both price and NAV data to determine actual end date
    // Fetch 4 years of data to ensure we cover 3Y window fully
    const endDate = new Date();
    const startDateForFetch = new Date();
    startDateForFetch.setFullYear(endDate.getFullYear() - 4);
    const startDateStr = formatDate(startDateForFetch);
    const endDateStr = formatDate(endDate);

    // Get price data for main ticker and NAV symbol
    // First try database, but if data is stale (more than 7 days old), fetch from API
    let [priceData, navData] = await Promise.all([
      getPriceHistory(ticker, startDateStr, endDateStr),
      getPriceHistory(navSymbol.toUpperCase(), startDateStr, endDateStr),
    ]);

    // Check if we have current data (within last 7 days)
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const minDateStr = formatDate(sevenDaysAgo);

    // Check if we need to fetch from API (data is missing or stale)
    const priceDataIsCurrent =
      priceData.length > 0 &&
      priceData[priceData.length - 1].date >= minDateStr;
    const navDataIsCurrent =
      navData.length > 0 && navData[navData.length - 1].date >= minDateStr;

    // Fetch from API if data is missing or stale
    if (!priceDataIsCurrent || priceData.length === 0) {
      try {
        const { getPriceHistoryFromAPI } = await import(
          "../services/tiingo.js"
        );
        const apiData = await getPriceHistoryFromAPI(
          ticker,
          startDateStr,
          endDateStr
        );
        if (apiData.length > 0) {
          logger.info(
            "CEF Metrics",
            `Using API data for ${ticker} (database data was stale)`
          );
          priceData = apiData;
        }
      } catch (apiError) {
        logger.warn(
          "CEF Metrics",
          `API fallback failed for ${ticker}: ${(apiError as Error).message}`
        );
      }
    }

    if (!navDataIsCurrent || navData.length === 0) {
      try {
        const { getPriceHistoryFromAPI } = await import(
          "../services/tiingo.js"
        );
        const apiData = await getPriceHistoryFromAPI(
          navSymbol.toUpperCase(),
          startDateStr,
          endDateStr
        );
        if (apiData.length > 0) {
          logger.info(
            "CEF Metrics",
            `Using API data for ${navSymbol} (database data was stale)`
          );
          navData = apiData;
        }
      } catch (apiError) {
        logger.warn(
          "CEF Metrics",
          `API fallback failed for ${navSymbol}: ${(apiError as Error).message}`
        );
      }
    }

    if (priceData.length === 0 || navData.length === 0) return null;

    // Create maps by date for efficient lookup
    // USE UNADJUSTED PRICE AND UNADJUSTED NAV ONLY (per requirements)
    // Premium/Discount analysis should use raw prices to avoid distortion from historical dividend adjustments
    const priceMap = new Map<string, number>();
    priceData.forEach((p: PriceRecord) => {
      // CRITICAL: Z-Score uses UNADJUSTED prices ONLY (p.close) - do NOT use adj_close
      const price = p.close ?? null;
      if (price !== null && price > 0) {
        priceMap.set(p.date, price);
      }
    });

    // Use UNADJUSTED close for NAV as well (ONLY p.close, NOT adj_close)
    const navMap = new Map<string, number>();
    navData.forEach((p: PriceRecord) => {
      // CRITICAL: Z-Score uses UNADJUSTED NAV ONLY (p.close) - do NOT use adj_close
      const nav = p.close ?? null;
      if (nav !== null && nav > 0) {
        navMap.set(p.date, nav);
      }
    });

    // Calculate daily discount: (Price / NAV) - 1
    // Only include dates where both price and NAV exist
    const discounts: number[] = [];
    const allDates = new Set([...priceMap.keys(), ...navMap.keys()]);
    const sortedDates = Array.from(allDates).sort();

    // Find the most recent date with both price and NAV to determine actual end date
    let actualEndDate: Date | null = null;
    for (const date of sortedDates.slice().reverse()) {
      const price = priceMap.get(date);
      const nav = navMap.get(date);
      if (price && nav && nav > 0) {
        actualEndDate = new Date(date);
        break;
      }
    }

    if (!actualEndDate) return null;

    // Calculate the 3-year lookback date from the actual end date (exactly 3 years back)
    const threeYearStartDate = new Date(actualEndDate);
    threeYearStartDate.setFullYear(actualEndDate.getFullYear() - 3);
    const threeYearStartDateStr = formatDate(threeYearStartDate);
    const actualEndDateStr = formatDate(actualEndDate);

    // Filter to dates within the 3-year range (from 3 years ago to actual end date)
    for (const date of sortedDates) {
      if (date < threeYearStartDateStr || date > actualEndDateStr) {
        continue; // Skip dates outside the 3-year window
      }
      const price = priceMap.get(date);
      const nav = navMap.get(date);
      if (price && nav && nav > 0) {
        discounts.push(price / nav - 1.0);
      }
    }

    if (discounts.length < DAYS_1Y) {
      return null; // Not enough data (less than 1 year)
    }

    // Use all discounts in the 3-year range (already filtered above)
    const history = discounts;

    if (history.length === 0) return null;

    // Calculate current discount from most recent date with both price and NAV
    // This ensures we use the actual most recent available data point
    const sortedDatesArray = Array.from(sortedDates).sort().reverse();
    let currentDiscount: number | null = null;
    for (const date of sortedDatesArray) {
      const price = priceMap.get(date);
      const nav = navMap.get(date);
      if (price && nav && nav > 0) {
        currentDiscount = price / nav - 1.0;
        break; // Use the most recent available date
      }
    }

    // Fallback to last value in history if we couldn't find a current discount
    if (currentDiscount === null) {
      currentDiscount = history[history.length - 1];
    }

    // Calculate stats from history using STDEV.P (population standard deviation)
    // The history array contains the most recent 3 years of discounts, INCLUDING the current value
    // This matches Excel's STDEV.P function which uses all values in the range
    const avgDiscount = history.reduce((sum, d) => sum + d, 0) / history.length;
    // Population variance: Σ(x - mean)² / n (matches Excel STDEV.P, not STDEV.S which uses n-1)
    const variance =
      history.reduce((sum, d) => sum + Math.pow(d - avgDiscount, 2), 0) /
      history.length;
    const stdDev = Math.sqrt(variance); // STDEV.P (population standard deviation)

    if (stdDev === 0) return 0.0;

    // Z-Score Formula: (Current - Mean) / StdDev
    // This matches Excel: (Current P/D - Average) / STDEV.P
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
 * Calculate 6-Month NAV Trend (percentage change using close price)
 * Formula: ((Current NAV - NAV 6 calendar months ago) / NAV 6 calendar months ago) * 100
 * Uses exactly 6 calendar months (not trading days)
 * Uses close price (not adj_close) to match CEO's calculation from chart data
 * Example: (36.50 - 35.79) / 35.79 * 100 = 1.9%
 */
export async function calculateNAVTrend6M(
  navSymbol: string | null
): Promise<number | null> {
  if (!navSymbol) return null;

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
        logger.info(
          "CEF Metrics",
          `6M NAV Trend: Database data is ${daysSinceLastUpdate.toFixed(1)} days old, fetching fresh from API for ${navSymbol}`
        );
        try {
          const { getPriceHistoryFromAPI } = await import("../services/tiingo.js");
          const apiData = await getPriceHistoryFromAPI(
            navSymbol.toUpperCase(),
            startDateStr,
            endDateStr
          );
          if (apiData.length > 0) {
            navData = apiData;
            logger.info(
              "CEF Metrics",
              `6M NAV Trend: Using fresh API data for ${navSymbol} (${apiData.length} records)`
            );
          }
        } catch (apiError) {
          logger.warn(
            "CEF Metrics",
            `6M NAV Trend: API fallback failed for ${navSymbol}: ${(apiError as Error).message}, using database data`
          );
        }
      }
    } else {
      // No data in database, try API
      try {
        const { getPriceHistoryFromAPI } = await import("../services/tiingo.js");
        const apiData = await getPriceHistoryFromAPI(
          navSymbol.toUpperCase(),
          startDateStr,
          endDateStr
        );
        if (apiData.length > 0) {
          navData = apiData;
          logger.info(
            "CEF Metrics",
            `6M NAV Trend: Using API data for ${navSymbol} (database was empty)`
          );
        }
      } catch (apiError) {
        logger.warn(
          "CEF Metrics",
          `6M NAV Trend: API fallback failed for ${navSymbol}: ${(apiError as Error).message}`
        );
      }
    }

    if (navData.length < 2) {
      logger.info(
        "CEF Metrics",
        `6M NAV Trend N/A for ${navSymbol}: insufficient data (${navData.length} < 2 records)`
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
      logger.info(
        "CEF Metrics",
        `6M NAV Trend N/A for ${navSymbol}: no data available for 6 months ago (${sixMonthsAgoStr})`
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
      logger.info(
        "CEF Metrics",
        `6M NAV Trend N/A for ${navSymbol}: insufficient historical data (selected record is ${monthsDiff.toFixed(
          1
        )} months ago, need ~6 months)`
      );
      return null;
    }

    // Use adjusted close price (adj_close) for NAV trends to account for distributions
    const currentNav = currentRecord.adj_close ?? currentRecord.close;
    const past6MNav = past6MRecord.adj_close ?? past6MRecord.close;

    if (!currentNav || !past6MNav || past6MNav <= 0) {
      logger.info(
        "CEF Metrics",
        `6M NAV Trend N/A for ${navSymbol}: missing close data (current=${currentNav}, past6M=${past6MNav})`
      );
      return null;
    }

    // Calculate percentage change: ((Current NAV - NAV 6 months ago) / NAV 6 months ago) * 100
    // Example: (36.50 - 35.79) / 35.79 * 100 = 1.9%
    const trend = ((currentNav - past6MNav) / past6MNav) * 100;

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
 * Calculate 12-Month NAV Trend (percentage change using close price)
 * Formula: ((Current NAV - NAV 12 calendar months ago) / NAV 12 calendar months ago) * 100
 * Uses exactly 12 calendar months (not trading days)
 * Uses close price (not adj_close) to match CEO's calculation from chart data
 * Example: (36.50 - 31.96) / 31.96 * 100 = 14.2%
 */
export async function calculateNAVReturn12M(
  navSymbol: string | null
): Promise<number | null> {
  if (!navSymbol) return null;

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
        logger.info(
          "CEF Metrics",
          `12M NAV Trend: Database data is ${daysSinceLastUpdate.toFixed(1)} days old, fetching fresh from API for ${navSymbol}`
        );
        try {
          const { getPriceHistoryFromAPI } = await import("../services/tiingo.js");
          const apiData = await getPriceHistoryFromAPI(
            navSymbol.toUpperCase(),
            startDateStr,
            endDateStr
          );
          if (apiData.length > 0) {
            navData = apiData;
            logger.info(
              "CEF Metrics",
              `12M NAV Trend: Using fresh API data for ${navSymbol} (${apiData.length} records)`
            );
          }
        } catch (apiError) {
          logger.warn(
            "CEF Metrics",
            `12M NAV Trend: API fallback failed for ${navSymbol}: ${(apiError as Error).message}, using database data`
          );
        }
      }
    } else {
      // No data in database, try API
      try {
        const { getPriceHistoryFromAPI } = await import("../services/tiingo.js");
        const apiData = await getPriceHistoryFromAPI(
          navSymbol.toUpperCase(),
          startDateStr,
          endDateStr
        );
        if (apiData.length > 0) {
          navData = apiData;
          logger.info(
            "CEF Metrics",
            `12M NAV Trend: Using API data for ${navSymbol} (database was empty)`
          );
        }
      } catch (apiError) {
        logger.warn(
          "CEF Metrics",
          `12M NAV Trend: API fallback failed for ${navSymbol}: ${(apiError as Error).message}`
        );
      }
    }

    if (navData.length < 2) {
      logger.info(
        "CEF Metrics",
        `12M NAV Trend N/A for ${navSymbol}: insufficient data (${navData.length} < 2 records)`
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
      logger.info(
        "CEF Metrics",
        `12M NAV Trend N/A for ${navSymbol}: no data available for 12 months ago (${twelveMonthsAgoStr})`
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
      logger.info(
        "CEF Metrics",
        `12M NAV Trend N/A for ${navSymbol}: insufficient historical data (selected record is ${monthsDiff.toFixed(
          1
        )} months ago, need ~12 months)`
      );
      return null;
    }

    // Use adjusted close price (adj_close) for NAV trends to account for distributions
    const currentNav = currentRecord.adj_close ?? currentRecord.close;
    const past12MNav = past12MRecord.adj_close ?? past12MRecord.close;

    if (!currentNav || !past12MNav || past12MNav <= 0) {
      logger.info(
        "CEF Metrics",
        `12M NAV Trend N/A for ${navSymbol}: missing close data (current=${currentNav}, past12M=${past12MNav})`
      );
      return null;
    }

    // Calculate percentage change: ((Current NAV - NAV 12 months ago) / NAV 12 months ago) * 100
    // Example: (36.50 - 31.96) / 31.96 * 100 = 14.2%
    const trend = ((currentNav - past12MNav) / past12MNav) * 100;

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
  period: "3Y" | "5Y" | "10Y" | "15Y"
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
      logger.info(
        "CEF Metrics",
        `No NAV data found for ${navSymbol} (checked database and Tiingo)`
      );
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
      case "3Y":
        startDateObj.setFullYear(endDateObj.getFullYear() - 3);
        break;
      case "5Y":
        startDateObj.setFullYear(endDateObj.getFullYear() - 5);
        break;
      case "10Y":
        startDateObj.setFullYear(endDateObj.getFullYear() - 10);
        break;
      case "15Y":
        startDateObj.setFullYear(endDateObj.getFullYear() - 15);
        break;
    }

    const startDate = formatDate(startDateObj);

    // Fetch NAV data with a buffer to ensure we find the nearest trading day
    // For longer periods, we need more buffer to account for weekends/holidays
    // 15Y needs ~60 days buffer (to cover ~42 trading days), 10Y needs ~45, 5Y needs ~30, 3Y needs ~20
    const bufferDays =
      period === "15Y" ? 60 : period === "10Y" ? 45 : period === "5Y" ? 30 : 20;
    const bufferDate = new Date(startDateObj);
    bufferDate.setDate(bufferDate.getDate() - bufferDays);
    const fetchStartDate = formatDate(bufferDate);

    logger.info(
      "CEF Metrics",
      `Fetching ${period} NAV data for ${navSymbol}: ${fetchStartDate} to ${endDate} (buffer: ${bufferDays} days)`
    );

    // Use same NAV fetching method as chart endpoint
    logger.info(
      "CEF Metrics",
      `Fetching ${period} NAV data for ${navSymbol}: ${fetchStartDate} to ${endDate}`
    );
    const navData = await getPriceHistory(
      navSymbol.toUpperCase(),
      fetchStartDate,
      endDate
    );

    logger.info(
      "CEF Metrics",
      `Received ${navData.length} NAV records for ${navSymbol} (requested ${period})`
    );

    if (navData.length < 2) {
      logger.info(
        "CEF Metrics",
        `${period} Return N/A for ${navSymbol}: insufficient data (${navData.length} < 2 records)`
      );
      return null;
    }

    // Log the actual date range we got
    if (navData.length > 0) {
      navData.sort((a, b) => a.date.localeCompare(b.date));
      const firstDate = navData[0].date;
      const lastDate = navData[navData.length - 1].date;
      const firstDateObj = new Date(firstDate);
      const lastDateObj = new Date(lastDate);
      const actualYears =
        (lastDateObj.getTime() - firstDateObj.getTime()) /
        (1000 * 60 * 60 * 24 * 365);
      logger.info(
        "CEF Metrics",
        `Actual date range for ${navSymbol} ${period}: ${firstDate} to ${lastDate} (${actualYears.toFixed(
          1
        )} years, ${navData.length} records)`
      );
    }

    // Convert period to approximate days for validation
    const periodDaysMap: Record<string, number> = {
      "3Y": 1095,
      "5Y": 1825,
      "10Y": 3650,
      "15Y": 5475,
    };
    const requestedDays = periodDaysMap[period];

    // Find start and end prices using same logic as calculateTotalReturnDrip
    // Find first NAV on/after start date
    const startRecord = navData.find((p) => p.date >= startDate);
    if (!startRecord) {
      logger.info(
        "CEF Metrics",
        `${period} Return N/A for ${navSymbol}: no data on/after start date ${startDate}`
      );
      return null;
    }

    // Find last NAV on/before end date
    const validEndNav = navData.filter((p) => p.date <= endDate);
    const endRecord =
      validEndNav.length > 0 ? validEndNav[validEndNav.length - 1] : null;
    if (!endRecord) {
      logger.info(
        "CEF Metrics",
        `${period} Return N/A for ${navSymbol}: no data on/before end date ${endDate}`
      );
      return null;
    }

    // Use adjusted close for total return (accounts for distributions)
    const startNav = startRecord.adj_close ?? startRecord.close;
    const endNav = endRecord.adj_close ?? endRecord.close;

    if (!startNav || !endNav || startNav <= 0 || endNav <= 0) {
      logger.info(
        "CEF Metrics",
        `${period} Return N/A for ${navSymbol}: invalid prices (start=${startNav}, end=${endNav})`
      );
      return null;
    }

    // Ensure dates are valid
    if (startRecord.date > endRecord.date) {
      logger.info(
        "CEF Metrics",
        `${period} Return N/A for ${navSymbol}: invalid date range (${startRecord.date} > ${endRecord.date})`
      );
      return null;
    }

    // Calculate total return: ((End / Start) - 1) * 100
    const totalReturn = (endNav / startNav - 1) * 100;

    // Annualize the return based on the period
    // Formula: Annualized Return = ((1 + Total Return/100)^(1/years) - 1) * 100
    const years =
      period === "3Y" ? 3 : period === "5Y" ? 5 : period === "10Y" ? 10 : 15;
    let annualizedReturn: number;

    if (totalReturn <= -100) {
      // Can't annualize a -100% or worse return
      annualizedReturn = -100;
    } else {
      annualizedReturn = (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100;
    }

    // Sanity check: returns should be reasonable
    if (
      !isFinite(annualizedReturn) ||
      annualizedReturn < -100 ||
      annualizedReturn > 1000
    ) {
      logger.warn(
        "CEF Metrics",
        `Unreasonable ${period} annualized return calculated: ${annualizedReturn}% for ${navSymbol} (total: ${totalReturn}%)`
      );
      return null;
    }

    logger.info(
      "CEF Metrics",
      `✅ Calculated ${period} Annualized NAV return for ${navSymbol}: ${annualizedReturn.toFixed(
        2
      )}% (total: ${totalReturn.toFixed(2)}% over ${years} years, ${
        navData.length
      } records)`
    );
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
  if (
    !navSymbol ||
    zScore === null ||
    navTrend6M === null ||
    navTrend12M === null
  ) {
    logger.info(
      "CEF Metrics",
      `Signal N/A for ${ticker}: missing inputs (zScore=${zScore}, navTrend6M=${navTrend6M}, navTrend12M=${navTrend12M})`
    );
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
      logger.info(
        "CEF Metrics",
        `Signal N/A for ${ticker}: insufficient history (${navData.length} < 504 trading days)`
      );
      return null; // N/A - insufficient history
    }

    const z = zScore;
    const t6 = navTrend6M;
    const t12 = navTrend12M;

    // Logic Gate Scoring (matches Python exactly)
    // +3: Optimal (Cheap + 6mo Health + 12mo Health)
    if (z < -1.5 && t6 > 0 && t12 > 0) {
      logger.info(
        "CEF Metrics",
        `Signal +3 (Optimal) for ${ticker}: z=${z.toFixed(2)}, t6=${t6.toFixed(
          2
        )}%, t12=${t12.toFixed(2)}%`
      );
      return 3;
    }
    // +2: Good Value (Cheap + 6mo Health)
    else if (z < -1.5 && t6 > 0) {
      logger.info(
        "CEF Metrics",
        `Signal +2 (Good Value) for ${ticker}: z=${z.toFixed(
          2
        )}, t6=${t6.toFixed(2)}%`
      );
      return 2;
    }
    // +1: Healthy (Not cheap, but growing assets)
    else if (z > -1.5 && t6 > 0) {
      logger.info(
        "CEF Metrics",
        `Signal +1 (Healthy) for ${ticker}: z=${z.toFixed(2)}, t6=${t6.toFixed(
          2
        )}%`
      );
      return 1;
    }
    // -1: Value Trap (Looks cheap, but assets are shrinking)
    else if (z < -1.5 && t6 < 0) {
      logger.info(
        "CEF Metrics",
        `Signal -1 (Value Trap) for ${ticker}: z=${z.toFixed(
          2
        )}, t6=${t6.toFixed(2)}%`
      );
      return -1;
    }
    // -2: Overvalued (Statistically expensive)
    else if (z > 1.5) {
      logger.info(
        "CEF Metrics",
        `Signal -2 (Overvalued) for ${ticker}: z=${z.toFixed(2)}`
      );
      return -2;
    }
    // 0: Neutral
    else {
      logger.info(
        "CEF Metrics",
        `Signal 0 (Neutral) for ${ticker}: z=${z.toFixed(2)}, t6=${t6.toFixed(
          2
        )}%`
      );
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

/**
 * Calculate Weighted Rank for CEFs using 1-N scoring system
 * Matches spreadsheet ranking methodology:
 * - YIELD: 25% (higher is better, rank 1 = highest)
 * - Z-Score: 50% (lower is better, rank 1 = lowest/most discounted)
 * - TR 3MO: 5% (higher is better, rank 1 = highest)
 * - TR 6MO: 25% (higher is better, rank 1 = highest)
 * - TR 12MO: 1% (higher is better, rank 1 = highest)
 * 
 * Returns Map<ticker, weightedRank> where lower rank = better (1 = best)
 */
export async function calculateCEFRankings(): Promise<Map<string, number>> {
  try {
    const db = getSupabase();

    // Get all CEFs (those with nav_symbol)
    const { data: cefs, error } = await db
      .from("etf_static")
      .select("ticker, forward_yield, five_year_z_score, tr_drip_3m, tr_drip_6m, tr_drip_12m")
      .not("nav_symbol", "is", null)
      .not("nav_symbol", "eq", "");

    if (error || !cefs || cefs.length === 0) {
      logger.warn("CEF Rankings", "No CEFs found or error fetching CEFs");
      return new Map();
    }

    // Filter out CEFs with insufficient data and prepare data
    interface CEFData {
      ticker: string;
      yield: number | null;
      zScore: number | null;
      return3Mo: number | null;
      return6Mo: number | null;
      return12Mo: number | null;
    }

    const cefData: CEFData[] = cefs.map((cef: any) => ({
      ticker: cef.ticker,
      yield: cef.forward_yield ?? null,
      zScore: cef.five_year_z_score ?? null,
      return3Mo: cef.tr_drip_3m ?? null,
      return6Mo: cef.tr_drip_6m ?? null,
      return12Mo: cef.tr_drip_12m ?? null,
    }));

    // Weights from spreadsheet
    const weights = {
      yield: 25,      // 25%
      zScore: 50,     // 50% (DVI equivalent)
      return3Mo: 5,   // 5%
      return6Mo: 25,  // 25%
      return12Mo: 1,  // 1%
    };

    // Rank each metric from 1 (best) to N (worst)
    // YIELD: Higher is better (rank 1 = highest yield)
    const yieldRanked = [...cefData]
      .filter((c) => c.yield !== null && !isNaN(c.yield) && c.yield > 0)
      .sort((a, b) => (b.yield ?? 0) - (a.yield ?? 0))
      .map((c, index) => ({ ticker: c.ticker, rank: index + 1 }));

    // Z-SCORE: Lower is better (rank 1 = lowest z-score, most discounted)
    const zScoreRanked = [...cefData]
      .filter((c) => c.zScore !== null && !isNaN(c.zScore))
      .sort((a, b) => (a.zScore ?? 0) - (b.zScore ?? 0))
      .map((c, index) => ({ ticker: c.ticker, rank: index + 1 }));

    // TR 3MO: Higher is better (rank 1 = highest return)
    const return3MoRanked = [...cefData]
      .filter((c) => c.return3Mo !== null && !isNaN(c.return3Mo))
      .sort((a, b) => (b.return3Mo ?? 0) - (a.return3Mo ?? 0))
      .map((c, index) => ({ ticker: c.ticker, rank: index + 1 }));

    // TR 6MO: Higher is better (rank 1 = highest return)
    const return6MoRanked = [...cefData]
      .filter((c) => c.return6Mo !== null && !isNaN(c.return6Mo))
      .sort((a, b) => (b.return6Mo ?? 0) - (a.return6Mo ?? 0))
      .map((c, index) => ({ ticker: c.ticker, rank: index + 1 }));

    // TR 12MO: Higher is better (rank 1 = highest return)
    const return12MoRanked = [...cefData]
      .filter((c) => c.return12Mo !== null && !isNaN(c.return12Mo))
      .sort((a, b) => (b.return12Mo ?? 0) - (a.return12Mo ?? 0))
      .map((c, index) => ({ ticker: c.ticker, rank: index + 1 }));

    // Create maps for quick lookup
    const yieldRankMap = new Map(yieldRanked.map((r) => [r.ticker, r.rank]));
    const zScoreRankMap = new Map(zScoreRanked.map((r) => [r.ticker, r.rank]));
    const return3MoRankMap = new Map(return3MoRanked.map((r) => [r.ticker, r.rank]));
    const return6MoRankMap = new Map(return6MoRanked.map((r) => [r.ticker, r.rank]));
    const return12MoRankMap = new Map(return12MoRanked.map((r) => [r.ticker, r.rank]));

    // Calculate total scores for each CEF
    // Use worst rank (total number of CEFs) for missing data
    const maxRank = cefData.length;

    interface CEFScore {
      ticker: string;
      totalScore: number;
    }

    const cefScores: CEFScore[] = cefData.map((cef) => {
      const yieldRank = yieldRankMap.get(cef.ticker) ?? maxRank;
      const zScoreRank = zScoreRankMap.get(cef.ticker) ?? maxRank;
      const return3MoRank = return3MoRankMap.get(cef.ticker) ?? maxRank;
      const return6MoRank = return6MoRankMap.get(cef.ticker) ?? maxRank;
      const return12MoRank = return12MoRankMap.get(cef.ticker) ?? maxRank;

      // Calculate weighted total score
      const totalScore =
        yieldRank * (weights.yield / 100) +
        zScoreRank * (weights.zScore / 100) +
        return3MoRank * (weights.return3Mo / 100) +
        return6MoRank * (weights.return6Mo / 100) +
        return12MoRank * (weights.return12Mo / 100);

      return {
        ticker: cef.ticker,
        totalScore,
      };
    });

    // Sort by total score (lower is better) and assign final ranks (1 = best)
    cefScores.sort((a, b) => a.totalScore - b.totalScore);

    const finalRanks = new Map<string, number>();
    cefScores.forEach((cef, index) => {
      finalRanks.set(cef.ticker, index + 1);
    });

    logger.info(
      "CEF Rankings",
      `Calculated weighted ranks for ${finalRanks.size} CEFs`
    );

    return finalRanks;
  } catch (error) {
    logger.warn(
      "CEF Rankings",
      `Failed to calculate CEF rankings: ${error}`
    );
    return new Map();
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
// Uses "Two-Payment Confirmation" rule with base tracking
// Matches Python script logic:
// - INCREASE: p1 > (base + threshold) AND p2 > base (both payments higher than base)
// - DECREASE: p1 < base AND p2 < base (both payments lower than base)
// - Base updates to confirmed new level (p1)
// - Threshold: 0.011 to filter out 1-cent fluctuations/noise
// Uses UNADJUSTED dividends (div_cash) from Tiingo data - NOT adj_amount
// Date range: From 2009-01-01 through today
// ============================================================================

export function calculateDividendHistory(dividends: DividendRecord[]): string {
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

  // Step 4: Two-Payment Confirmation rule with base tracking
  // IMPORTANT: Use UNADJUSTED dividends (div_cash) only - NOT adj_amount
  // Initialize base to 0.20 (matching Python script initial_base parameter)
  // This represents the base level from before 2009-01-01
  let base = 0.20; // Initial base (from pre-2009 level)
  const threshold = 0.011; // Threshold to filter out 1-cent fluctuations/noise
  
  let increases = 0;
  let decreases = 0;

  // Iterate with 2-payment window (i and i+1)
  for (let i = 0; i < filteredChronological.length - 1; i++) {
    const p1Record = filteredChronological[i];
    const p2Record = filteredChronological[i + 1];

    // Use UNADJUSTED div_cash only (from Tiingo table data)
    const p1 = Math.round((p1Record.div_cash ?? 0) * 1000) / 1000; // Round to 3 decimals
    const p2 = Math.round((p2Record.div_cash ?? 0) * 1000) / 1000; // Round to 3 decimals

    // Skip if any amount is invalid
    if (!p1 || !p2 || p1 <= 0 || p2 <= 0) {
      continue;
    }

    // INCREASE LOGIC: Both payments in the pair must be higher than base
    // For equal payments (p1 == p2): both must be > base (no threshold)
    // For unequal payments: p1 must be > (base + threshold) AND p2 must be > base AND p2 >= p1 (must be sustained/improving)
    // We use p1 as the new base candidate
    if (p1 === p2 && p1 > base) {
      // Equal payments: both just need to be above base (no threshold check)
      increases++;
      base = p1; // Update base to the confirmed new level (p1)
    } else if (p1 > (base + threshold) && p2 > base && p2 >= p1) {
      // Unequal payments: need threshold check AND p2 >= p1 (must be sustained, not a spike that goes back down)
      increases++;
      base = p1; // Update base to the confirmed new level (p1)
    }
    // DECREASE LOGIC: Both payments in the pair must be lower than base
    // p1 < base AND p2 < base AND p2 <= p1 (second payment must not be higher to confirm decrease)
    // Note: No threshold for decreases (both just need to be below base)
    else if (p1 < base && p2 < base && p2 <= p1) {
      decreases++;
      base = p1; // Update base to the confirmed new level (p1)
    }
    // If conditions not met, base remains unchanged (noise/flicker is ignored)
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

      // Category is required - must be CEF
      const categoryCol = findColumn(headerMap, "category");
      if (!categoryCol) {
        cleanupFile(filePath);
        res.status(400).json({
          error: "CATEGORY column not found (required)",
          details: `Available columns: ${headers.join(
            ", "
          )}. Please add a CATEGORY column with value "CEF".`,
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

        // Validate category - must be CEF
        const categoryValue =
          categoryCol && row[categoryCol]
            ? String(row[categoryCol]).trim().toUpperCase()
            : null;
        if (!categoryValue) {
          logger.warn(
            "CEF Upload",
            `Row with ticker ${ticker} missing CATEGORY - skipping`
          );
          skipped++;
          continue;
        }
        if (categoryValue !== "CEF") {
          logger.warn(
            "CEF Upload",
            `Row with ticker ${ticker} has invalid CATEGORY "${categoryValue}" - must be "CEF". Skipping.`
          );
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

router.get(
  "/test-data-range/:symbol",
  async (req: Request, res: Response): Promise<void> => {
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
        { name: "1Y", years: 1 },
        { name: "3Y", years: 3 },
        { name: "5Y", years: 5 },
        { name: "10Y", years: 10 },
        { name: "15Y", years: 15 },
        { name: "20Y", years: 20 },
      ];

      const results: any[] = [];

      for (const range of ranges) {
        const startDate = new Date();
        startDate.setFullYear(endDate.getFullYear() - range.years);
        const startDateStr = formatDate(startDate);
        const endDateStr = formatDate(endDate);

        const navData = await getPriceHistory(
          cef.nav_symbol,
          startDateStr,
          endDateStr
        );

        if (navData.length > 0) {
          navData.sort((a, b) => a.date.localeCompare(b.date));
          const first = navData[0];
          const last = navData[navData.length - 1];
          const firstDate = new Date(first.date);
          const lastDate = new Date(last.date);
          const actualYears =
            (lastDate.getTime() - firstDate.getTime()) /
            (1000 * 60 * 60 * 24 * 365);

          results.push({
            period: range.name,
            requestedYears: range.years,
            records: navData.length,
            firstDate: first.date,
            lastDate: last.date,
            actualYears: parseFloat(actualYears.toFixed(1)),
            hasAdjClose: navData.some((d) => d.adj_close !== null),
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
            error: "No data found",
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
      logger.error(
        "Routes",
        `Error testing data range: ${(error as Error).message}`
      );
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ============================================================================
// GET / - List all CEFs
// ============================================================================

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const cacheKey = "cef_list";

    // TEMPORARILY DISABLE CACHE to ensure fresh data with new filter
    // TODO: Re-enable cache after confirming filter works correctly
    // const cached = await getCached<any>(cacheKey);
    // if (cached) {
    //   logger.info(
    //     "Routes",
    //     `Returning ${cached.cefs?.length || 0} CEFs from Redis cache`
    //   );
    //   res.json(cached);
    //   return;
    // }

    // Clear cache to ensure fresh data
    const redis = getRedis();
    if (redis) {
      try {
        await redis.del(cacheKey);
        logger.info(
          "Routes",
          "Cleared CEF list cache to ensure fresh filtered data"
        );
      } catch (cacheError) {
        logger.warn(
          "Routes",
          `Failed to clear cache: ${(cacheError as Error).message}`
        );
      }
    }

    const supabase = getSupabase();

    // Filter at database level: Use category column if available, otherwise nav_symbol
    logger.info(
      "Routes",
      "Fetching CEFs from database with category/nav_symbol filter..."
    );
    
    // Try category filter first, fall back to nav_symbol if category not available
    let staticResult;
    const categoryCheck = await supabase
      .from("etf_static")
      .select("category")
      .limit(1)
      .single();
    
    if (categoryCheck.data && categoryCheck.data.category !== null && categoryCheck.data.category !== undefined) {
      // Category column exists - use it for filtering
      staticResult = await supabase
        .from("etf_static")
        .select("*")
        .eq("category", "CEF")
        .order("ticker", { ascending: true })
        .limit(10000);
    } else {
      // Fallback: Use nav_symbol for backward compatibility
      staticResult = await supabase
        .from("etf_static")
        .select("*")
        .not("nav_symbol", "is", null)
        .neq("nav_symbol", "")
        .order("ticker", { ascending: true })
        .limit(10000);
    }

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

    const staticData = staticResult.data || [];

    // Filter: Only include actual CEFs (not NAV symbol records, and must have NAV data)
    // CEFs are identified by having nav_symbol set AND actual NAV data
    // Records with nav_symbol but no NAV data go to ETFs table (covered calls)
    const filteredData = staticData.filter((item: any) => {
      // CRITICAL: Exclude if ticker equals nav_symbol (that's a NAV symbol record, not the CEF itself)
      // Examples: XGABX (where ticker=XGABX and nav_symbol=XGABX), XBTOX, XBMEX, etc.
      if (item.ticker === item.nav_symbol) {
        return false;
      }

      // CRITICAL: Must have actual NAV data to be considered a CEF
      // If NAV is null/undefined/0, it goes to ETFs table instead
      const hasNAVData =
        item.nav !== null && item.nav !== undefined && item.nav !== 0;
      if (!hasNAVData) {
        return false;
      }

      return true;
    });

    if (filteredData.length === 0 && staticData.length > 0) {
      logger.warn(
        "Routes",
        `No CEFs found after filtering - checking sample record`
      );
      const sample = staticData[0];
      logger.warn(
        "Routes",
        `Sample record keys: ${Object.keys(sample).join(", ")}`
      );
      logger.warn(
        "Routes",
        `Sample ticker: ${sample.ticker}, nav_symbol: ${sample.nav_symbol}, issuer: ${sample.issuer}, description: ${sample.description}`
      );
    }

    // Detailed logging for debugging
    const withNAV = staticData.filter(
      (item: any) =>
        item.nav !== null && item.nav !== undefined && item.nav !== 0
    ).length;
    const withoutNAV = staticData.filter(
      (item: any) =>
        item.nav === null || item.nav === undefined || item.nav === 0
    ).length;
    const navSymbolRecords = staticData.filter(
      (item: any) => item.ticker === item.nav_symbol
    ).length;

    logger.info(
      "Routes",
      `CEF Filter Results: ${staticData.length} total with nav_symbol → ${filteredData.length} valid CEFs`
    );
    logger.info("Routes", `  - Records with NAV data: ${withNAV}`);
    logger.info("Routes", `  - Records without NAV (N/A): ${withoutNAV}`);
    logger.info(
      "Routes",
      `  - NAV symbol records (ticker === nav_symbol): ${navSymbolRecords} (excluded)`
    );

    // Log sample of filtered CEFs
    if (filteredData.length > 0) {
      const sample = filteredData
        .slice(0, 5)
        .map(
          (cef: any) => `${cef.ticker} (nav=$${cef.nav?.toFixed(2) || "N/A"})`
        )
        .join(", ");
      logger.info("Routes", `Sample CEFs: ${sample}`);
    }

    // NO real-time calculations - use database values only
    // Process in smaller batches to prevent timeout
    const BATCH_SIZE = 10; // Process 10 CEFs at a time
    const cefsWithDividendHistory: any[] = [];

    for (let i = 0; i < filteredData.length; i += BATCH_SIZE) {
      const batch = filteredData.slice(i, i + BATCH_SIZE);
      // Use Promise.allSettled so one failure doesn't break the whole batch
      const batchResults = await Promise.allSettled(
        batch.map(async (cef: any) => {
          // Use cached dividend history from database if available
          let dividendHistory = cef.dividend_history || null;
          if (!dividendHistory) {
            try {
              // Get dividends from 2009-01-01 onwards for dividend history calculation
              const dividends = await getDividendHistory(
                cef.ticker,
                "2009-01-01"
              );
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
          const hasShortTerm =
            cef.tr_drip_1w !== null &&
            cef.tr_drip_1w !== undefined &&
            cef.tr_drip_1m !== null &&
            cef.tr_drip_1m !== undefined &&
            cef.tr_drip_3m !== null &&
            cef.tr_drip_3m !== undefined &&
            cef.tr_drip_6m !== null &&
            cef.tr_drip_6m !== undefined &&
            cef.tr_drip_12m !== null &&
            cef.tr_drip_12m !== undefined;
          // For long-term, check if ANY are null/undefined - if so, we need metrics for fallback
          const hasLongTerm =
            cef.return_3yr !== null &&
            cef.return_3yr !== undefined &&
            cef.return_5yr !== null &&
            cef.return_5yr !== undefined &&
            cef.return_10yr !== null &&
            cef.return_10yr !== undefined &&
            cef.return_15yr !== null &&
            cef.return_15yr !== undefined;
          const needsMetrics = !hasShortTerm || !hasLongTerm;

          // Read return values from database first (before NAV calculations)
          const return3Yr: number | null =
            cef.return_3yr !== undefined && cef.return_3yr !== null
              ? cef.return_3yr
              : null;
          const return5Yr: number | null =
            cef.return_5yr !== undefined && cef.return_5yr !== null
              ? cef.return_5yr
              : null;
          const return10Yr: number | null =
            cef.return_10yr !== undefined && cef.return_10yr !== null
              ? cef.return_10yr
              : null;
          const return15Yr: number | null =
            cef.return_15yr !== undefined && cef.return_15yr !== null
              ? cef.return_15yr
              : null;

          // NO REAL-TIME CALCULATIONS - Use database values only
          // All CEF metrics should be pre-calculated by refresh_cefs.ts script

          // NO real-time metrics calculation - use database values only

          // USE DATABASE VALUES ONLY - No real-time calculations
          const currentNav: number | null = cef.nav ?? null;
          const marketPrice: number | null = cef.price ?? null;

          // ALWAYS calculate premium/discount from current MP and NAV
          // Formula: ((MP / NAV - 1) * 100) as percentage
          // Example: GAB (6.18/5.56)-1 * 100 = 11.15% (displays as +11.15%)
          let premiumDiscount: number | null = null;
          if (
            currentNav &&
            currentNav !== 0 &&
            marketPrice &&
            marketPrice > 0
          ) {
            premiumDiscount = (marketPrice / currentNav - 1) * 100;
          } else if (
            cef.premium_discount !== null &&
            cef.premium_discount !== undefined
          ) {
            premiumDiscount = cef.premium_discount;
          }

          // Read CEF metrics from database first
          let fiveYearZScore: number | null =
            cef.five_year_z_score !== undefined &&
            cef.five_year_z_score !== null
              ? cef.five_year_z_score
              : null;
          let navTrend6M: number | null =
            cef.nav_trend_6m !== undefined && cef.nav_trend_6m !== null
              ? cef.nav_trend_6m
              : null;
          let navTrend12M: number | null =
            cef.nav_trend_12m !== undefined && cef.nav_trend_12m !== null
              ? cef.nav_trend_12m
              : null;
          const signal: number | null =
            cef.signal !== undefined && cef.signal !== null ? cef.signal : null;

          // NO REAL-TIME CALCULATIONS - Use database values only
          // All CEF metrics (Z-Score, NAV Trends, Signal) should be pre-calculated by refresh_cefs.ts script

          // Use database values only - no real-time calculations
          const finalReturn15Yr = return15Yr;
          const finalReturn10Yr = return10Yr;
          const finalReturn5Yr = return5Yr;
          const finalReturn3Yr = return3Yr;

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
            lastDividend: cef.last_dividend ?? null,
            numPayments: cef.payments_per_year ?? 12,
            yearlyDividend: cef.annual_dividend ?? null,
            forwardYield: cef.forward_yield ?? null,
            dividendHistory: dividendHistory,
            dividendSD: cef.dividend_sd ?? null,
            dividendCV: cef.dividend_cv ?? null,
            dividendCVPercent: cef.dividend_cv_percent ?? null,
            dividendVolatilityIndex: cef.dividend_volatility_index ?? null,
            // Long-term returns: Database values only (pre-calculated by refresh_cefs.ts)
            return15Yr: finalReturn15Yr,
            return10Yr: finalReturn10Yr,
            return5Yr: finalReturn5Yr,
            return3Yr: finalReturn3Yr,
            // Short-term returns: Database values only
            return12Mo: cef.tr_drip_12m ?? null,
            return6Mo: cef.tr_drip_6m ?? null,
            return3Mo: cef.tr_drip_3m ?? null,
            return1Mo: cef.tr_drip_1m ?? null,
            return1Wk: cef.tr_drip_1w ?? null,
            weightedRank: cef.weighted_rank || null,
            week52Low: cef.week_52_low ?? null,
            week52High: cef.week_52_high ?? null,
            lastUpdated: cef.last_updated || cef.updated_at,
            dataSource: "Tiingo",
          };
        })
      );

      // Extract successful results, log failures
      const successfulResults = batchResults
        .map((result, index) => {
          if (result.status === "fulfilled") {
            return result.value;
          } else {
            logger.warn(
              "Routes",
              `Failed to process CEF ${batch[index]?.ticker}: ${result.reason}`
            );
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

    // TEMPORARILY DISABLE CACHE - re-enable after confirming filter works
    // await setCached(cacheKey, response, CACHE_TTL.ETF_LIST);
    logger.info(
      "Routes",
      `Returning ${cefsWithDividendHistory.length} CEFs (cache disabled for testing)`
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

      // For MAX, fetch all available data (use a very early date)
      // For other periods, calculate from today
      let startDate: Date;
      const endDate: Date = new Date();

      if (period === "MAX") {
        // Use a very early date to get all available data
        startDate = new Date("2000-01-01");
        // Don't set endDate to today - let it be determined by actual data
      } else {
        // Clone endDate to avoid any reference issues, then calculate backwards
        startDate = new Date(endDate.getTime());
        switch (period) {
          case "1M":
            startDate.setMonth(startDate.getMonth() - 1);
            break;
          case "3M":
            startDate.setMonth(startDate.getMonth() - 3);
            break;
          case "6M":
            startDate.setMonth(startDate.getMonth() - 6);
            break;
          case "1Y":
            startDate.setFullYear(startDate.getFullYear() - 1);
            break;
          case "3Y":
            startDate.setFullYear(startDate.getFullYear() - 3);
            break;
          case "5Y":
            startDate.setFullYear(startDate.getFullYear() - 5);
            break;
          case "10Y":
            startDate.setFullYear(startDate.getFullYear() - 10);
            break;
          case "15Y":
            startDate.setFullYear(startDate.getFullYear() - 15);
            break;
          case "20Y":
            startDate.setFullYear(startDate.getFullYear() - 20);
            break;
          default:
            startDate.setFullYear(startDate.getFullYear() - 1);
        }
      }

      // Log the date range for debugging
      logger.info(
        "Routes",
        `Price/NAV chart: period=${period}, startDate=${
          startDate.toISOString().split("T")[0]
        }, endDate=${endDate.toISOString().split("T")[0]}`
      );

      const startDateStr = startDate.toISOString().split("T")[0];
      // For MAX, use a future date to ensure we get all data up to today
      // For other periods, use today
      const endDateStr =
        period === "MAX"
          ? new Date(Date.now() + 86400000).toISOString().split("T")[0] // Tomorrow to ensure we get today's data
          : endDate.toISOString().split("T")[0];

      // Fetch price data (with Tiingo fallback)
      let priceData = await getPriceHistory(ticker, startDateStr, endDateStr);

      // Check if we have sufficient data coverage - if not, fetch from Tiingo
      if (priceData.length > 0) {
        const firstDate = new Date(priceData[0].date);
        const lastDate = new Date(priceData[priceData.length - 1].date);
        const requestedStart = new Date(startDateStr);
        const requestedEnd = new Date(endDateStr);

        // If data doesn't cover the full range, fetch from Tiingo
        const daysMissingAtStart =
          (firstDate.getTime() - requestedStart.getTime()) /
          (1000 * 60 * 60 * 24);
        const daysMissingAtEnd =
          (requestedEnd.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysMissingAtStart > 30 || daysMissingAtEnd > 30) {
          logger.info(
            "Routes",
            `Price data incomplete for ${ticker}, fetching from Tiingo API`
          );
          try {
            const { getPriceHistoryFromAPI } = await import(
              "../services/tiingo.js"
            );
            const tiingoData = await getPriceHistoryFromAPI(
              ticker,
              startDateStr,
              endDateStr
            );
            if (tiingoData.length > priceData.length) {
              logger.info(
                "Routes",
                `Tiingo provided ${tiingoData.length} records vs ${priceData.length} from DB`
              );
              priceData = tiingoData;
            }
          } catch (tiingoError) {
            logger.warn(
              "Routes",
              `Tiingo fallback failed: ${(tiingoError as Error).message}`
            );
          }
        }
      } else {
        // No data in DB, try Tiingo
        logger.info(
          "Routes",
          `No price data in DB for ${ticker}, fetching from Tiingo API`
        );
        try {
          const { getPriceHistoryFromAPI } = await import(
            "../services/tiingo.js"
          );
          priceData = await getPriceHistoryFromAPI(
            ticker,
            startDateStr,
            endDateStr
          );
        } catch (tiingoError) {
          logger.warn(
            "Routes",
            `Tiingo API failed: ${(tiingoError as Error).message}`
          );
        }
      }

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

          // Check if we have sufficient NAV data coverage
          if (navData.length > 0) {
            const firstNavDate = new Date(navData[0].date);
            const lastNavDate = new Date(navData[navData.length - 1].date);
            const requestedStart = new Date(startDateStr);
            const requestedEnd = new Date(endDateStr);

            const daysMissingAtStart =
              (firstNavDate.getTime() - requestedStart.getTime()) /
              (1000 * 60 * 60 * 24);
            const daysMissingAtEnd =
              (requestedEnd.getTime() - lastNavDate.getTime()) /
              (1000 * 60 * 60 * 24);

            if (daysMissingAtStart > 30 || daysMissingAtEnd > 30) {
              logger.info(
                "Routes",
                `NAV data incomplete for ${navSymbol}, fetching from Tiingo API`
              );
              try {
                const { getPriceHistoryFromAPI } = await import(
                  "../services/tiingo.js"
                );
                const tiingoNavData = await getPriceHistoryFromAPI(
                  navSymbol.toUpperCase(),
                  startDateStr,
                  endDateStr
                );
                if (tiingoNavData.length > navData.length) {
                  logger.info(
                    "Routes",
                    `Tiingo provided ${tiingoNavData.length} NAV records vs ${navData.length} from DB`
                  );
                  navData = tiingoNavData;
                }
              } catch (tiingoError) {
                logger.warn(
                  "Routes",
                  `Tiingo NAV fallback failed: ${
                    (tiingoError as Error).message
                  }`
                );
              }
            }
          } else {
            // No NAV data in DB, try Tiingo
            logger.info(
              "Routes",
              `No NAV data in DB for ${navSymbol}, fetching from Tiingo API`
            );
            try {
              const { getPriceHistoryFromAPI } = await import(
                "../services/tiingo.js"
              );
              navData = await getPriceHistoryFromAPI(
                navSymbol.toUpperCase(),
                startDateStr,
                endDateStr
              );
            } catch (tiingoError) {
              logger.warn(
                "Routes",
                `Tiingo NAV API failed: ${(tiingoError as Error).message}`
              );
            }
          }

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

      // Use unadjusted close (close) for charts - PRICE (CHART) and NAV (CHART) are UNADJUSTED
      const priceMap = new Map<
        string,
        { close: number | null; date: string }
      >();
      priceData.forEach((p: any) => {
        const date = typeof p.date === "string" ? p.date.split("T")[0] : p.date;
        // Charts use unadjusted close price
        const closePrice = p.close ?? null;
        if (closePrice !== null) {
          priceMap.set(date, { close: closePrice, date });
        }
      });

      const navMap = new Map<string, { close: number | null; date: string }>();
      navData.forEach((p: any) => {
        const date = typeof p.date === "string" ? p.date.split("T")[0] : p.date;
        // Charts use unadjusted close price for NAV
        const closePrice = p.close ?? null;
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
          // Normalize date format to YYYY-MM-DD for consistent alignment
          const normalizedDate = date.includes("T") ? date.split("T")[0] : date;
          const priceEntry = priceMap.get(date);
          const navEntry = navMap.get(date);

          return {
            date: normalizedDate,
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

    // NO real-time metrics calculation for CEFs
    // All metrics should be pre-calculated and stored in database
    const metrics = null;

    let dividendHistory = cef.dividend_history || null;
    if (!dividendHistory) {
      try {
        // Get dividends from 2009-01-01 onwards for dividend history calculation
        const dividends = await getDividendHistory(ticker, "2009-01-01");
        dividendHistory = calculateDividendHistory(dividends);
      } catch (error) {
        logger.warn(
          "Routes",
          `Failed to calculate dividend history for ${ticker}: ${error}`
        );
        dividendHistory = "0+ 0-";
      }
    }

    // Use database values only - NO real-time fetches
    // NAV and premium_discount should be updated by refresh_cefs.ts script
    const currentNav: number | null = cef.nav ?? null;
    const marketPrice: number | null = cef.price ?? null;

    // Calculate premium/discount from database values if both are available
    // Otherwise use stored premium_discount value
    let premiumDiscount: number | null = null;
    if (currentNav && currentNav !== 0 && marketPrice && marketPrice > 0) {
      // Formula: ((MP / NAV - 1) * 100) as percentage
      premiumDiscount = (marketPrice / currentNav - 1) * 100;
    } else if (
      cef.premium_discount !== null &&
      cef.premium_discount !== undefined
    ) {
      // Use stored value if we can't calculate
      premiumDiscount = cef.premium_discount;
    }

    // Use database values only - NO real-time calculations
    // All CEF metrics should be pre-calculated by refresh_cefs.ts script
    const fiveYearZScore: number | null = cef.five_year_z_score ?? null;
    const navTrend6M: number | null = cef.nav_trend_6m ?? null;
    const navTrend12M: number | null = cef.nav_trend_12m ?? null;
    const signal: number | null = cef.signal ?? null;

    // Use database values only - NO real-time calculations
    // All CEF metrics should be pre-calculated by refresh_cefs.ts script
    const return3Yr: number | null = cef.return_3yr ?? null;
    const return5Yr: number | null = cef.return_5yr ?? null;
    const return10Yr: number | null = cef.return_10yr ?? null;
    const return15Yr: number | null = cef.return_15yr ?? null;

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
