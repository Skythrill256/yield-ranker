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
import { logger, parseNumeric } from "../utils/index.js";
import { getDividendHistory, getPriceHistory } from "../services/database.js";
import type { DividendRecord } from "../types/index.js";

const router: Router = Router();

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
        } else if (mp !== null && nav !== null) {
          premiumDiscount = ((mp - nav) / nav) * 100;
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

    // Only include CEFs: must have nav_symbol OR nav set
    const staticData = allData.filter((item: any) => {
      const hasNavSymbol =
        item.nav_symbol !== null &&
        item.nav_symbol !== undefined &&
        item.nav_symbol !== "";
      const hasNav =
        item.nav !== null && item.nav !== undefined && item.nav !== "";
      // Must have at least one CEF identifier
      return hasNavSymbol || hasNav;
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

    const cefsWithDividendHistory = await Promise.all(
      staticData.map(async (cef: any) => {
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

        // Calculate metrics using the same system as ETFs for accuracy
        let metrics: any = null;
        try {
          metrics = await calculateMetrics(cef.ticker);
        } catch (error) {
          logger.warn(
            "Routes",
            `Failed to calculate metrics for ${cef.ticker}: ${error}`
          );
        }

        let premiumDiscount: number | null = cef.premium_discount ?? null;
        // Calculate premium/discount if not in database but we have price and nav
        if (
          premiumDiscount === null &&
          cef.nav &&
          (cef.price || metrics?.currentPrice)
        ) {
          const price = metrics?.currentPrice ?? cef.price;
          if (price && cef.nav) {
            premiumDiscount = ((price - cef.nav) / cef.nav) * 100;
          }
        }

        return {
          symbol: cef.ticker,
          name: cef.description || cef.ticker,
          issuer: cef.issuer || null,
          description: cef.description || null,
          navSymbol: cef.nav_symbol || null,
          openDate: cef.open_date || null,
          ipoPrice: cef.ipo_price || null,
          marketPrice: metrics?.currentPrice ?? cef.price ?? null,
          nav: cef.nav || null,
          premiumDiscount: premiumDiscount,
          fiveYearZScore: cef.five_year_z_score || null,
          navTrend6M: cef.nav_trend_6m || null,
          navTrend12M: cef.nav_trend_12m || null,
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
          return15Yr: cef.tr_drip_15y || null,
          return10Yr:
            metrics?.totalReturnDrip?.["10Y"] ?? cef.tr_drip_10y ?? null,
          return5Yr: metrics?.totalReturnDrip?.["5Y"] ?? cef.tr_drip_5y ?? null,
          return3Yr: metrics?.totalReturnDrip?.["3Y"] ?? cef.tr_drip_3y ?? null,
          return12Mo:
            metrics?.totalReturnDrip?.["1Y"] ?? cef.tr_drip_12m ?? null,
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
        case "20Y":
          startDate.setFullYear(endDate.getFullYear() - 20);
          break;
        default:
          startDate.setFullYear(endDate.getFullYear() - 1);
      }

      const startDateStr = startDate.toISOString().split("T")[0];
      const endDateStr = endDate.toISOString().split("T")[0];

      const priceData = await getPriceHistory(ticker, startDateStr, endDateStr);

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

      const allDates = new Set([...priceMap.keys(), ...navMap.keys()]);
      const sortedDates = Array.from(allDates).sort();

      // Forward-fill both Price and NAV data points from previous values
      // This ensures both lines are continuous and consistent
      let lastPriceValue: number | null = null;
      let lastNavValue: number | null = null;
      const combinedData = sortedDates
        .map((date) => {
          const price = priceMap.get(date)?.close || null;
          const nav = navMap.get(date)?.close || null;

          // Forward-fill Price if missing (use last known price value)
          const priceToUse = price !== null ? price : lastPriceValue;
          if (priceToUse !== null) {
            lastPriceValue = priceToUse;
          }

          // Forward-fill NAV if missing (use last known NAV value)
          const navToUse = nav !== null ? nav : lastNavValue;
          if (navToUse !== null) {
            lastNavValue = navToUse;
          }

          return {
            date,
            price: priceToUse,
            nav: navToUse,
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

    // Calculate metrics for accurate yearly returns
    let metrics = null;
    try {
      const { calculateMetrics } = await import("../services/metrics.js");
      metrics = await calculateMetrics(ticker);
    } catch (error) {
      logger.warn(
        "Routes",
        `Failed to calculate metrics for ${ticker}: ${error}`
      );
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

    let premiumDiscount: number | null = cef.premium_discount ?? null;
    // Calculate premium/discount if not in database but we have price and nav
    if (
      premiumDiscount === null &&
      cef.nav &&
      (cef.price || metrics?.currentPrice)
    ) {
      const price = metrics?.currentPrice ?? cef.price;
      if (price && cef.nav) {
        premiumDiscount = ((price - cef.nav) / cef.nav) * 100;
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
      marketPrice: cef.price || null,
      nav: cef.nav || null,
      premiumDiscount: premiumDiscount,
      fiveYearZScore: cef.five_year_z_score || null,
      navTrend6M: cef.nav_trend_6m || null,
      navTrend12M: cef.nav_trend_12m || null,
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
      return15Yr: metrics?.totalReturnDrip?.["10Y"] ?? cef.tr_drip_15y ?? null, // Using 10Y as closest to 15Y
      return10Yr: metrics?.totalReturnDrip?.["10Y"] ?? cef.tr_drip_10y ?? null,
      return5Yr: metrics?.totalReturnDrip?.["5Y"] ?? cef.tr_drip_5y ?? null,
      return3Yr: metrics?.totalReturnDrip?.["3Y"] ?? cef.tr_drip_3y ?? null,
      return12Mo: metrics?.totalReturnDrip?.["1Y"] ?? cef.tr_drip_12m ?? null,
      return6Mo: cef.tr_drip_6m || null,
      return3Mo: cef.tr_drip_3m || null,
      return1Mo: cef.tr_drip_1m || null,
      return1Wk: cef.tr_drip_1w || null,
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
