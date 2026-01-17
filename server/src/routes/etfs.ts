/**
 * ETF Data Routes (Legacy + New)
 * 
 * Provides endpoints for ETF data operations
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';
import { getSupabase } from '../services/database.js';
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '../services/redis.js';
import config from '../config/index.js';
import { logger, parseNumeric } from '../utils/index.js';
import type { ETFStaticRecord } from '../types/index.js';
import { calculateMetrics } from '../services/metrics.js';
import { fetchDividendDates, getLatestDividendDates } from '../services/alphaVantage.js';
import { fetchPriceHistory, fetchDividendHistory } from '../services/tiingo.js';
import { getDateDaysAgo } from '../utils/index.js';
import type { TiingoPriceData } from '../types/index.js';

const router: Router = Router();

// ============================================================================
// ETF Ranking Calculation
// ============================================================================

/**
 * Calculate Weighted Rank for CC ETFs using 1-N scoring system
 * Matches spreadsheet ranking methodology:
 * - YIELD: 25% (higher is better, rank 1 = highest)
 * - DVI: 50% (lower is better, rank 1 = lowest DVI)
 * - TR 3MO: 5% (higher is better, rank 1 = highest)
 * - TR 6MO: 25% (higher is better, rank 1 = highest)
 * - TR 12MO: 1% (higher is better, rank 1 = highest)
 * 
 * Returns Map<ticker, weightedRank> where lower rank = better (1 = best)
 */
export async function calculateETFRankings(): Promise<Map<string, number>> {
  try {
    const db = getSupabase();

    // Get all ETFs (those without nav_symbol or without NAV data - CC ETFs)
    // This matches the filter logic used in GET / route
    const { data: allETFs, error: fetchError } = await db
      .from("etf_static")
      .select("ticker, forward_yield, dividend_cv_percent, tr_drip_3m, tr_drip_6m, tr_drip_12m, nav_symbol, nav, issuer, description")
      .order("ticker", { ascending: true })
      .limit(10000);

    if (fetchError || !allETFs || allETFs.length === 0) {
      logger.warn("ETF Rankings", "No ETFs found or error fetching ETFs");
      return new Map();
    }

    // Filter to CC ETFs only (same logic as GET / route)
    const etfs = allETFs.filter((etf: any) => {
      // CRITICAL: If category column exists and is set, use it for filtering
      // This is the PRIMARY and MOST RELIABLE filter
      if (etf.category) {
        const category = etf.category.toUpperCase();
        // Only include CCETF, explicitly exclude CEF
        if (category === 'CEF') {
          return false; // Explicitly exclude CEFs
        }
        return category === 'CCETF';
      }

      // Fallback: Use nav_symbol logic for backward compatibility
      const ticker = etf.ticker || '';
      const navSymbol = etf.nav_symbol || '';
      const issuer = etf.issuer || '';
      const description = etf.description || '';

      // Exclude NAV symbol records (where ticker === nav_symbol)
      if (ticker === navSymbol && navSymbol !== '') {
        return false;
      }

      // Exclude NAV proxy symbols by pattern
      const isNavProxySymbol = ticker.length >= 4 && ticker.startsWith('X') && ticker.endsWith('X');
      if (isNavProxySymbol) {
        return false;
      }

      // Exclude auto-created CEF placeholder records
      const isAutoCreatedRecord = !issuer && description.toLowerCase().includes('auto-created for nav');
      if (isAutoCreatedRecord) {
        return false;
      }

      // Exclude records with blank issuer AND have a nav_symbol set (these are CEFs)
      if (!issuer && navSymbol) {
        return false;
      }

      const hasNavSymbol = etf.nav_symbol !== null && etf.nav_symbol !== undefined && etf.nav_symbol !== '';
      const hasNAVData = etf.nav !== null && etf.nav !== undefined && etf.nav !== 0;

      // CRITICAL: If it has nav_symbol AND NAV data, it's a CEF (exclude from ETFs)
      // This is the most reliable fallback check - CEFs have both nav_symbol and nav data
      if (hasNavSymbol && hasNAVData) {
        return false;
      }

      // Include everything else: CCETFs
      return true;
    });

    if (etfs.length === 0) {
      logger.warn("ETF Rankings", "No CC ETFs found after filtering");
      return new Map();
    }

    // Prepare data
    interface ETFData {
      ticker: string;
      yield: number | null;
      dvi: number | null;  // dividend_cv_percent
      return3Mo: number | null;
      return6Mo: number | null;
      return12Mo: number | null;
    }

    const etfData: ETFData[] = etfs.map((etf: any) => ({
      ticker: etf.ticker,
      yield: etf.forward_yield ?? null,
      dvi: etf.dividend_cv_percent ?? null,  // DVI (Dividend Volatility Index)
      return3Mo: etf.tr_drip_3m ?? null,
      return6Mo: etf.tr_drip_6m ?? null,
      return12Mo: etf.tr_drip_12m ?? null,
    }));

    // Weights from spreadsheet
    const weights = {
      yield: 25,      // 25%
      dvi: 50,        // 50%
      return3Mo: 5,   // 5%
      return6Mo: 25,  // 25%
      return12Mo: 1,  // 1%
    };

    // Rank each metric from 1 (best) to N (worst)
    // YIELD: Higher is better (rank 1 = highest yield)
    const yieldRanked = [...etfData]
      .filter((e) => e.yield !== null && !isNaN(e.yield) && e.yield > 0)
      .sort((a, b) => (b.yield ?? 0) - (a.yield ?? 0))
      .map((e, index) => ({ ticker: e.ticker, rank: index + 1 }));

    // DVI: Lower is better (rank 1 = lowest DVI, least volatile)
    const dviRanked = [...etfData]
      .filter((e) => e.dvi !== null && !isNaN(e.dvi) && e.dvi >= 0)
      .sort((a, b) => (a.dvi ?? 0) - (b.dvi ?? 0))
      .map((e, index) => ({ ticker: e.ticker, rank: index + 1 }));

    // TR 3MO: Higher is better (rank 1 = highest return)
    const return3MoRanked = [...etfData]
      .filter((e) => e.return3Mo !== null && !isNaN(e.return3Mo))
      .sort((a, b) => (b.return3Mo ?? 0) - (a.return3Mo ?? 0))
      .map((e, index) => ({ ticker: e.ticker, rank: index + 1 }));

    // TR 6MO: Higher is better (rank 1 = highest return)
    const return6MoRanked = [...etfData]
      .filter((e) => e.return6Mo !== null && !isNaN(e.return6Mo))
      .sort((a, b) => (b.return6Mo ?? 0) - (a.return6Mo ?? 0))
      .map((e, index) => ({ ticker: e.ticker, rank: index + 1 }));

    // TR 12MO: Higher is better (rank 1 = highest return)
    const return12MoRanked = [...etfData]
      .filter((e) => e.return12Mo !== null && !isNaN(e.return12Mo))
      .sort((a, b) => (b.return12Mo ?? 0) - (a.return12Mo ?? 0))
      .map((e, index) => ({ ticker: e.ticker, rank: index + 1 }));

    // Create maps for quick lookup
    const yieldRankMap = new Map(yieldRanked.map((r) => [r.ticker, r.rank]));
    const dviRankMap = new Map(dviRanked.map((r) => [r.ticker, r.rank]));
    const return3MoRankMap = new Map(return3MoRanked.map((r) => [r.ticker, r.rank]));
    const return6MoRankMap = new Map(return6MoRanked.map((r) => [r.ticker, r.rank]));
    const return12MoRankMap = new Map(return12MoRanked.map((r) => [r.ticker, r.rank]));

    // Calculate total scores for each ETF
    // Use worst rank (total number of ETFs) for missing data
    const maxRank = etfData.length;

    interface ETFScore {
      ticker: string;
      totalScore: number;
    }

    const etfScores: ETFScore[] = etfData.map((etf) => {
      const yieldRank = yieldRankMap.get(etf.ticker) ?? maxRank;
      const dviRank = dviRankMap.get(etf.ticker) ?? maxRank;
      const return3MoRank = return3MoRankMap.get(etf.ticker) ?? maxRank;
      const return6MoRank = return6MoRankMap.get(etf.ticker) ?? maxRank;
      const return12MoRank = return12MoRankMap.get(etf.ticker) ?? maxRank;

      // Calculate weighted total score
      const totalScore =
        yieldRank * (weights.yield / 100) +
        dviRank * (weights.dvi / 100) +
        return3MoRank * (weights.return3Mo / 100) +
        return6MoRank * (weights.return6Mo / 100) +
        return12MoRank * (weights.return12Mo / 100);

      return {
        ticker: etf.ticker,
        totalScore,
      };
    });

    // Sort by total score (lower is better) and assign final ranks (1 = best)
    etfScores.sort((a, b) => a.totalScore - b.totalScore);

    const finalRanks = new Map<string, number>();
    etfScores.forEach((etf, index) => {
      finalRanks.set(etf.ticker, index + 1);
    });

    logger.info(
      "ETF Rankings",
      `Calculated weighted ranks for ${finalRanks.size} CC ETFs`
    );

    return finalRanks;
  } catch (error) {
    logger.warn(
      "ETF Rankings",
      `Failed to calculate ETF rankings: ${error}`
    );
    return new Map();
  }
}

// ============================================================================
// File Upload Configuration
// ============================================================================

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(config.upload.tempDir)) {
      fs.mkdirSync(config.upload.tempDir, { recursive: true });
    }
    cb(null, config.upload.tempDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter: (_req, file, cb) => {
    if (config.upload.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

function cleanupFile(filePath: string | null): void {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      logger.warn('Upload', `Failed to cleanup file: ${filePath}`);
    }
  }
}

function findColumn(headerMap: Record<string, string>, ...names: string[]): string | null {
  for (const name of names) {
    const key = name.toLowerCase();
    if (headerMap[key] !== undefined) {
      return headerMap[key];
    }
  }
  return null;
}

// ============================================================================
// Static Data Upload (Tiingo Integration)
// ============================================================================

/**
 * Shared handler for DTR/static upload
 */
async function handleStaticUpload(req: Request, res: Response): Promise<void> {
  let filePath: string | null = null;

  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    filePath = req.file.path;
    logger.info('Upload', `Processing static data file: ${req.file.originalname}`);

    // Read Excel file
    const workbook = XLSX.readFile(filePath as string);

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      cleanupFile(filePath);
      res.status(400).json({ error: 'Excel file has no sheets' });
      return;
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // Use array format (header: 1) which works reliably regardless of Excel formatting
    const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];

    logger.info('Upload', `Total rows in file: ${allRows.length}`);
    if (allRows.length > 0) {
      logger.info('Upload', `First row: ${JSON.stringify(allRows[0])}`);
    }
    if (allRows.length > 1) {
      logger.info('Upload', `Second row: ${JSON.stringify(allRows[1])}`);
    }

    if (allRows.length < 2) {
      cleanupFile(filePath);
      res.status(400).json({ error: 'Excel file is empty or has no data rows' });
      return;
    }

    // Find header row - look for row containing 'symbol' or 'ticker'
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(allRows.length, 20); i++) {
      const row = allRows[i];
      if (!Array.isArray(row)) continue;
      const rowStr = row.map(c => String(c).toLowerCase().trim());
      if (rowStr.includes('symbol') || rowStr.includes('ticker')) {
        headerRowIndex = i;
        logger.info('Upload', `Found header row at index: ${headerRowIndex}`);
        break;
      }
    }

    // Extract headers from the identified header row
    const headerRow = allRows[headerRowIndex] as unknown[];
    const headers: string[] = headerRow.map((h, idx) => {
      const headerStr = String(h || `column_${idx}`).trim();
      return headerStr || `column_${idx}`;
    });
    logger.info('Upload', `Extracted headers: ${JSON.stringify(headers)}`);

    // Build header map (lowercase -> original header name)
    const headerMap: Record<string, string> = {};
    headers.forEach(h => {
      if (h) headerMap[String(h).trim().toLowerCase()] = h;
    });
    logger.info('Upload', `Header map: ${JSON.stringify(headerMap)}`);

    // Convert remaining rows to objects using extracted headers
    const rawData: Record<string, unknown>[] = [];
    for (let i = headerRowIndex + 1; i < allRows.length; i++) {
      const row = allRows[i] as unknown[];
      if (!row || row.length === 0) continue;

      const obj: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        obj[header] = row[idx] ?? null;
      });
      rawData.push(obj);
    }

    logger.info('Upload', `Parsed ${rawData.length} data rows`);

    if (rawData.length === 0) {
      cleanupFile(filePath);
      res.status(400).json({ error: 'Excel file has no data rows after header' });
      return;
    }

    // Find columns
    const symbolCol = findColumn(headerMap, 'symbol', 'symbols', 'ticker');
    logger.info('Upload', `Symbol column: ${symbolCol}`);
    if (!symbolCol) {
      cleanupFile(filePath);
      res.status(400).json({
        error: 'SYMBOL/TICKER column not found',
        details: `Available columns: ${headers.join(', ')}`,
      });
      return;
    }

    // Category is required - must be CCETF or CCEF
    const categoryCol = findColumn(headerMap, 'category', 'cat');
    if (!categoryCol) {
      cleanupFile(filePath);
      res.status(400).json({
        error: 'CATEGORY column not found (required)',
        details: `Available columns: ${headers.join(', ')}. Please add a CATEGORY column with values "CCETF" or "CCEF".`,
      });
      return;
    }


    const issuerCol = findColumn(headerMap, 'issuer');
    const descCol = findColumn(headerMap, 'desc', 'description', 'name');
    const payDayCol = findColumn(headerMap, 'pay day', 'pay_day', 'pay_day_text', 'payment frequency');
    const pmtsCol = findColumn(headerMap, '# pmts', 'payments_per_year', '# payments');
    const ipoPriceCol = findColumn(headerMap, 'ipo price', 'ipo_price');
    const divCol = findColumn(headerMap, 'div', 'dividend', 'div_cash', 'dividend amount');

    // Build records - using Partial since we only upload core identity fields
    const records: Partial<ETFStaticRecord>[] = [];
    const dividendUpdates: Array<{ ticker: string; divAmount: number }> = [];
    const now = new Date().toISOString();
    let skippedRows = 0;

    for (const row of rawData) {
      const symbolValue = symbolCol ? row[symbolCol] : null;
      if (!symbolValue) {
        skippedRows++;
        continue;
      }

      const ticker = String(symbolValue).trim().toUpperCase();
      if (!ticker) {
        skippedRows++;
        continue;
      }

      // Validate category
      const categoryValue = categoryCol && row[categoryCol] ? String(row[categoryCol]).trim().toUpperCase() : null;
      if (!categoryValue) {
        logger.warn('ETF Upload', `Row with ticker ${ticker} missing CATEGORY - skipping`);
        skippedRows++;
        continue;
      }
      if (categoryValue !== 'CCETF' && categoryValue !== 'CCEF') {
        logger.warn('ETF Upload', `Row with ticker ${ticker} has invalid CATEGORY "${categoryValue}" - must be "CCETF" or "CCEF". Skipping.`);
        skippedRows++;
        continue;
      }

      records.push({
        ticker,
        category: categoryValue,  // Save category to database
        issuer: issuerCol && row[issuerCol] ? String(row[issuerCol]).trim() : null,
        description: descCol && row[descCol] ? String(row[descCol]).trim() : null,
        pay_day_text: payDayCol && row[payDayCol] ? String(row[payDayCol]).trim() : null,
        payments_per_year: pmtsCol ? parseNumeric(row[pmtsCol]) : null,
        ipo_price: ipoPriceCol ? parseNumeric(row[ipoPriceCol]) : null,
        default_rank_weights: null,
        updated_at: now,
      });

      // If div column exists, collect dividend updates
      if (divCol && row[divCol]) {
        const divAmount = parseNumeric(row[divCol]);
        if (divAmount && divAmount > 0) {
          dividendUpdates.push({ ticker, divAmount });
        }
      }
    }

    if (records.length === 0) {
      cleanupFile(filePath);
      res.status(400).json({
        error: 'No valid ticker data found',
      });
      return;
    }

    logger.info('Upload', `Processing ${records.length} tickers (add/update only, no deletions)`);

    const supabase = getSupabase();

    const { data: existingETFs } = await supabase
      .from('etf_static')
      .select('*')
      .in('ticker', records.map(r => r.ticker));

    const existingETFsMap = new Map((existingETFs || []).map((e: any) => [e.ticker, e]));
    const newTickers: Partial<ETFStaticRecord>[] = [];
    const updatedTickers: Partial<ETFStaticRecord>[] = [];

    for (const record of records) {
      const existing = existingETFsMap.get(record.ticker);
      if (existing) {
        const updateRecord: Partial<ETFStaticRecord> = {
          ticker: record.ticker,
          updated_at: now,
        };

        if (record.category !== null && record.category !== undefined) updateRecord.category = record.category;
        if (record.issuer !== null && record.issuer !== undefined) updateRecord.issuer = record.issuer;
        if (record.description !== null && record.description !== undefined) updateRecord.description = record.description;
        if (record.pay_day_text !== null && record.pay_day_text !== undefined) updateRecord.pay_day_text = record.pay_day_text;
        if (record.payments_per_year !== null && record.payments_per_year !== undefined) updateRecord.payments_per_year = record.payments_per_year;
        if (record.ipo_price !== null && record.ipo_price !== undefined) updateRecord.ipo_price = record.ipo_price;

        updatedTickers.push(updateRecord);
      } else {
        newTickers.push(record);
      }
    }

    logger.info('Upload', `Adding ${newTickers.length} new ticker(s), updating ${updatedTickers.length} existing ticker(s)`);

    if (newTickers.length > 0) {
      const { error: insertError } = await supabase
        .from('etf_static')
        .insert(newTickers);

      if (insertError) {
        cleanupFile(filePath);
        res.status(500).json({
          error: 'Failed to add new ETFs',
          details: insertError.message,
        });
        return;
      }

      // Automatically fetch data for newly added ETFs
      logger.info('Upload', `Fetching price/dividend data for ${newTickers.length} newly added ticker(s)...`);
      const LOOKBACK_DAYS = 15 * 365; // 15 years
      const priceStartDate = getDateDaysAgo(LOOKBACK_DAYS);
      const dividendStartDate = getDateDaysAgo(LOOKBACK_DAYS);

      for (const record of newTickers) {
        const ticker = record.ticker;
        if (!ticker) continue; // Skip if ticker is undefined
        try {
          logger.info('Upload', `Fetching data for ${ticker}...`);

          // Fetch and insert prices
          const prices = await fetchPriceHistory(ticker, priceStartDate);
          if (prices.length > 0) {
            const priceRecords = prices.map(p => ({
              ticker: ticker.toUpperCase(),
              date: p.date.split('T')[0],
              open: p.open,
              high: p.high,
              low: p.low,
              close: p.close,
              adj_close: p.adjClose,
              volume: p.volume,
              div_cash: p.divCash || 0,
              split_factor: p.splitFactor || 1,
            }));

            const { error: priceError } = await supabase
              .from('prices_daily')
              .upsert(priceRecords, {
                onConflict: 'ticker,date',
                ignoreDuplicates: false,
              });

            if (priceError) {
              logger.warn('Upload', `Failed to insert prices for ${ticker}: ${priceError.message}`);
            } else {
              logger.info('Upload', `Inserted ${priceRecords.length} price records for ${ticker}`);
            }
          }

          // Fetch and insert dividends
          const dividends = await fetchDividendHistory(ticker, dividendStartDate);
          if (dividends.length > 0) {
            const exDatesToUpdate = dividends.map(d => d.date.split('T')[0]);

            const { data: allManualUploads } = await supabase
              .from('dividends_detail')
              .select('ex_date, description, div_cash, adj_amount, pay_date, record_date, declare_date, scaled_amount, split_factor')
              .eq('ticker', ticker.toUpperCase())
              .or('description.ilike.%Manual upload%,description.ilike.%Early announcement%');

            const manualUploadsMap = new Map<string, { divCash: number; adjAmount: number | null; payDate: string | null; recordDate: string | null; declareDate: string | null; scaledAmount: number | null; splitFactor: number }>();
            (allManualUploads || []).forEach(d => {
              const exDate = d.ex_date.split('T')[0];
              const divCash = parseFloat(d.div_cash);
              const adjAmount = d.adj_amount ? parseFloat(d.adj_amount) : null;
              const scaledAmount = d.scaled_amount ? parseFloat(d.scaled_amount) : null;
              const splitFactor = d.split_factor ? parseFloat(d.split_factor) : 1;
              manualUploadsMap.set(exDate, {
                divCash,
                adjAmount,
                payDate: d.pay_date,
                recordDate: d.record_date,
                declareDate: d.declare_date,
                scaledAmount,
                splitFactor
              });
            });

            let alignedCount = 0;
            let preservedCount = 0;

            const manualUploadsToPreserve: Array<{ ticker: string; ex_date: string; pay_date: string | null; record_date: string | null; declare_date: string | null; div_cash: number; adj_amount: number | null; scaled_amount: number | null; split_factor: number; description: string }> = [];

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
              const desc = record?.description || '';
              return desc.includes('Manual upload') || desc.includes('Early announcement');
            };

            const tiingoRecordsToUpsert: Array<any> = [];

            for (const d of dividends) {
              const exDate = d.date.split('T')[0];
              const existing = existingDividendsMap.get(exDate);

              if (existing && isManualUpload(existing)) {
                const tiingoDivCash = d.dividend;
                const tiingoAdjAmount = d.adjDividend > 0 ? d.adjDividend : null;
                const manualDivCash = parseFloat(existing.div_cash);
                const manualAdjAmount = existing.adj_amount ? parseFloat(existing.adj_amount) : null;
                const tolerance = 0.001;

                let isAligned = false;
                if (tiingoAdjAmount && manualAdjAmount !== null) {
                  isAligned = Math.abs(manualAdjAmount - tiingoAdjAmount) < tolerance;
                } else {
                  isAligned = Math.abs(manualDivCash - tiingoDivCash) < tolerance;
                }

                if (isAligned) {
                  alignedCount++;
                  tiingoRecordsToUpsert.push({
                    ticker: ticker.toUpperCase(),
                    ex_date: exDate,
                    record_date: d.recordDate?.split('T')[0] || existing.record_date,
                    pay_date: d.paymentDate?.split('T')[0] || existing.pay_date,
                    declare_date: d.declarationDate?.split('T')[0] || existing.declare_date,
                    div_cash: d.dividend,
                    adj_amount: d.adjDividend > 0 ? d.adjDividend : null,
                    scaled_amount: d.scaledDividend > 0 ? d.scaledDividend : null,
                    split_factor: d.adjDividend > 0 ? d.dividend / d.adjDividend : 1,
                  });
                } else {
                  preservedCount++;
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
                  });
                }
              } else {
                tiingoRecordsToUpsert.push({
                  ticker: ticker.toUpperCase(),
                  ex_date: exDate,
                  record_date: d.recordDate?.split('T')[0] || null,
                  pay_date: d.paymentDate?.split('T')[0] || null,
                  declare_date: d.declarationDate?.split('T')[0] || null,
                  div_cash: d.dividend,
                  adj_amount: d.adjDividend > 0 ? d.adjDividend : null,
                  scaled_amount: d.scaledDividend > 0 ? d.scaledDividend : null,
                  split_factor: d.adjDividend > 0 ? d.dividend / d.adjDividend : 1,
                });
              }
            }

            const dividendRecords = [...tiingoRecordsToUpsert];

            const { data: allManualUploadsNotInTiingo } = await supabase
              .from('dividends_detail')
              .select('*')
              .eq('ticker', ticker.toUpperCase())
              .or('description.ilike.%Manual upload%,description.ilike.%Early announcement%');

            (allManualUploadsNotInTiingo || []).forEach(existing => {
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
                });
              }
            });

            if (alignedCount > 0) {
              logger.info('Upload', `Updating ${alignedCount} dividend(s) for ${ticker} where Tiingo aligns with manual upload`);
            }
            if (preservedCount > 0) {
              logger.info('Upload', `Preserving ${preservedCount} manual dividend upload(s) for ${ticker} (values don't align)`);
            }

            const allDividendRecords = [...dividendRecords, ...manualUploadsToPreserve];

            if (allDividendRecords.length > 0) {
              const { error: divError } = await supabase
                .from('dividends_detail')
                .upsert(allDividendRecords, {
                  onConflict: 'ticker,ex_date',
                  ignoreDuplicates: false,
                });

              if (divError) {
                logger.warn('Upload', `Failed to insert dividends for ${ticker}: ${divError.message}`);
              } else {
                logger.info('Upload', `Inserted ${dividendRecords.length} dividend records for ${ticker}`);
                if (manualUploadsToPreserve.length > 0) {
                  logger.info('Upload', `Preserved ${manualUploadsToPreserve.length} manual upload(s) for ${ticker} not yet in Tiingo data`);
                }
              }
            }
          }

          // Calculate and update metrics
          logger.info('Upload', `Calculating metrics for ${ticker}...`);
          const metrics = await calculateMetrics(ticker);
          await supabase
            .from('etf_static')
            .update({
              price: metrics.currentPrice,
              price_change: metrics.priceChange,
              price_change_pct: metrics.priceChangePercent,
              last_dividend: metrics.lastDividend,
              annual_dividend: metrics.annualizedDividend,
              forward_yield: metrics.forwardYield,
              dividend_sd: metrics.dividendSD,
              dividend_cv: metrics.dividendCV,
              dividend_cv_percent: metrics.dividendCVPercent,
              dividend_volatility_index: metrics.dividendVolatilityIndex,
              week_52_high: metrics.week52High,
              week_52_low: metrics.week52Low,
              tr_drip_3y: metrics.totalReturnDrip?.['3Y'],
              tr_drip_12m: metrics.totalReturnDrip?.['1Y'],
              tr_drip_6m: metrics.totalReturnDrip?.['6M'],
              tr_drip_3m: metrics.totalReturnDrip?.['3M'],
              tr_drip_1m: metrics.totalReturnDrip?.['1M'],
              tr_drip_1w: metrics.totalReturnDrip?.['1W'],
              price_return_3y: metrics.priceReturn?.['3Y'],
              price_return_12m: metrics.priceReturn?.['1Y'],
              price_return_6m: metrics.priceReturn?.['6M'],
              price_return_3m: metrics.priceReturn?.['3M'],
              price_return_1m: metrics.priceReturn?.['1M'],
              price_return_1w: metrics.priceReturn?.['1W'],
            })
            .eq('ticker', ticker);
          logger.info('Upload', `✓ ${ticker} complete - Price: $${metrics.currentPrice?.toFixed(2) || 'N/A'}, Yield: ${metrics.forwardYield?.toFixed(2) || 'N/A'}%, DVI: ${metrics.dividendCVPercent?.toFixed(1) || 'N/A'}%`);
        } catch (error) {
          logger.warn('Upload', `Failed to fetch/calculate data for ${ticker}: ${(error as Error).message}`);
        }
      }
    }

    if (updatedTickers.length > 0) {
      for (const updateRecord of updatedTickers) {
        const { error: updateError } = await supabase
          .from('etf_static')
          .update(updateRecord)
          .eq('ticker', updateRecord.ticker);

        if (updateError) {
          logger.warn('Upload', `Failed to update ${updateRecord.ticker}: ${updateError.message}`);
        }
      }
    }

    const allProcessedRecords = [...newTickers, ...updatedTickers];
    const legacyRecords = allProcessedRecords.map(r => ({
      symbol: r.ticker,
      issuer: r.issuer ?? undefined,
      description: r.description ?? undefined,
      pay_day: r.pay_day_text ?? undefined,
      payments_per_year: r.payments_per_year ?? undefined,
      ipo_price: r.ipo_price ?? undefined,
      spreadsheet_updated_at: now,
    })).filter(r => r.symbol);

    if (legacyRecords.length > 0) {
      await supabase.from('etfs').upsert(legacyRecords, { onConflict: 'symbol' });
    }

    // If div column was provided, update or create dividend records
    // This prioritizes manual updates while keeping them recognizable for Tiingo sync
    let dividendsUpdated = 0;
    const tickersToRecalc = new Set<string>();

    if (dividendUpdates.length > 0) {
      logger.info('Upload', `Processing dividend updates for ${dividendUpdates.length} ticker(s)`);

      for (const { ticker, divAmount } of dividendUpdates) {
        // Get the absolute most recent dividend for this ticker
        const { data: recentDividends } = await supabase
          .from('dividends_detail')
          .select('*')
          .eq('ticker', ticker)
          .order('ex_date', { ascending: false })
          .limit(1);

        const latestDiv = recentDividends?.[0];
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        // Deciding whether to update the latest record or create a new one:
        // If the latest dividend's ex_date is "old" (> 25 days ago), we assume this is a new announcement
        // for the next period and create a new record.
        let shouldCreateNew = !latestDiv;
        if (latestDiv) {
          const exDate = new Date(latestDiv.ex_date);
          const diffDays = (now.getTime() - exDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 25) {
            shouldCreateNew = true;
          }
        }

        if (!shouldCreateNew && latestDiv) {
          // Update the "current" or "upcoming" dividend record
          const { error: updateError } = await supabase
            .from('dividends_detail')
            .update({
              div_cash: divAmount,
              adj_amount: divAmount,
              is_manual: true,
              description: 'Manual upload - DTR spreadsheet update',
            })
            .eq('ticker', ticker)
            .eq('ex_date', latestDiv.ex_date);

          if (!updateError) {
            dividendsUpdated++;
            tickersToRecalc.add(ticker);
            logger.info('Upload', `Updated recent dividend for ${ticker} to $${divAmount} (ex-date: ${latestDiv.ex_date.split('T')[0]})`);
          }
        } else {
          // Create a new manual dividend record for the upcoming period
          const declareDate = todayStr;

          // Get payment frequency to estimate upcoming ex-date
          const { data: staticData } = await supabase
            .from('etf_static')
            .select('payments_per_year')
            .eq('ticker', ticker)
            .single();

          const paymentsPerYear = staticData?.payments_per_year ?? 12;

          let estimatedExDateObj = new Date(now);
          if (latestDiv) {
            // Base new ex_date on previous one + interval
            estimatedExDateObj = new Date(latestDiv.ex_date);
            const monthsPerPmt = Math.max(1, Math.round(12 / paymentsPerYear));
            estimatedExDateObj.setMonth(estimatedExDateObj.getMonth() + monthsPerPmt);
          } else {
            // Heuristic if no history: roughly one period from now
            const daysPerPmt = Math.ceil(365 / paymentsPerYear);
            estimatedExDateObj.setDate(estimatedExDateObj.getDate() + daysPerPmt);
          }

          const exDate = estimatedExDateObj.toISOString().split('T')[0];

          const { error: insertError } = await supabase
            .from('dividends_detail')
            .upsert({
              ticker,
              ex_date: exDate,
              declare_date: declareDate,
              div_cash: divAmount,
              adj_amount: divAmount,
              split_factor: 1,
              description: 'Manual upload - DTR spreadsheet update',
              is_manual: true,
              currency: 'USD',
            }, {
              onConflict: 'ticker,ex_date',
              ignoreDuplicates: false,
            });

          if (!insertError) {
            dividendsUpdated++;
            tickersToRecalc.add(ticker);
            logger.info('Upload', `Created new manual dividend for ${ticker}: $${divAmount} (est. ex-date: ${exDate})`);
          } else {
            logger.warn('Upload', `Failed to create dividend for ${ticker}: ${insertError.message}`);
          }
        }
      }
    }

    cleanupFile(filePath);

    // Recalculate metrics for tickers with dividend updates
    if (tickersToRecalc.size > 0) {
      logger.info('Upload', `Recalculating metrics for ${tickersToRecalc.size} ticker(s)`);
      for (const ticker of tickersToRecalc) {
        try {
          const metrics = await calculateMetrics(ticker);
          await supabase
            .from('etf_static')
            .update({
              last_dividend: metrics.lastDividend,
              annual_dividend: metrics.annualizedDividend,
              forward_yield: metrics.forwardYield,
              dividend_sd: metrics.dividendSD,
              dividend_cv: metrics.dividendCV,
              dividend_cv_percent: metrics.dividendCVPercent,
              dividend_volatility_index: metrics.dividendVolatilityIndex,
            })
            .eq('ticker', ticker);
        } catch (error) {
          logger.warn('Upload', `Failed to recalculate metrics for ${ticker}: ${(error as Error).message}`);
        }
      }
    }

    res.json({
      success: true,
      count: records.length,
      added: newTickers.length,
      updated: updatedTickers.length,
      skipped: skippedRows,
      dividendsUpdated,
      message: `Successfully processed ${records.length} ticker(s): ${newTickers.length} added, ${updatedTickers.length} updated${dividendsUpdated > 0 ? `, ${dividendsUpdated} dividend amount(s) updated` : ''}${newTickers.length > 0 ? `. Automatically fetched price/dividend data and calculated metrics for new tickers.` : ''}`,
      note: dividendUpdates.length > 0
        ? 'Dividend amounts updated while preserving all Tiingo data (dates, split adjustments, etc.)'
        : newTickers.length > 0
          ? 'Price/dividend data automatically fetched from Tiingo and metrics calculated'
          : 'All data up to date',
    });
  } catch (error) {
    logger.error('Upload', `Error processing file: ${(error as Error).message}`);
    cleanupFile(filePath);
    res.status(500).json({
      error: 'Failed to process Excel file',
      message: (error as Error).message,
    });
  }
}

/**
 * POST /upload-dtr - Upload DTR spreadsheet (static data only)
 */
router.post('/upload-dtr', upload.single('file'), handleStaticUpload);

/**
 * POST /upload-dividends - Upload latest dividends from Excel
 * 
 * Expected Excel format:
 * - Column: "Symbol" or "Ticker" (required)
 * - Column: "Div" or "Dividend" (required) - dividend amount
 * - Column: "Ex Date" or "Ex-Date" (optional) - if missing, uses declaration date + typical payment schedule
 * - Column: "Declare Date" or "Declaration Date" (optional) - defaults to today
 * - Column: "Pay Date" or "Payment Date" (optional)
 * 
 * When Tiingo syncs later, it will match by:
 * 1. Same ex_date (if provided)
 * 2. OR same amount within ±7 days
 */
router.post('/upload-dividends', upload.single('file'), async (req: Request, res: Response) => {
  let filePath: string | null = null;

  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    filePath = req.file.path;
    logger.info('Upload', `Processing dividend upload file: ${req.file.originalname}`);

    const workbook = XLSX.readFile(filePath as string);

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      cleanupFile(filePath);
      res.status(400).json({ error: 'Excel file has no sheets' });
      return;
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];

    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(allRows.length, 20); i++) {
      const row = allRows[i];
      if (!Array.isArray(row)) continue;
      const rowStr = row.map(c => String(c).toLowerCase().trim());
      if (rowStr.includes('symbol') || rowStr.includes('ticker')) {
        headerRowIndex = i;
        break;
      }
    }

    const rawData = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: null, raw: false, blankrows: false }) as Record<string, unknown>[];

    if (!rawData || rawData.length === 0) {
      cleanupFile(filePath);
      res.status(400).json({ error: 'Excel file is empty' });
      return;
    }

    const headers = Object.keys(rawData[0] ?? {});
    const headerMap: Record<string, string> = {};
    headers.forEach(h => {
      if (h) headerMap[String(h).trim().toLowerCase()] = h;
    });

    const symbolCol = findColumn(headerMap, 'symbol', 'symbols', 'ticker');
    if (!symbolCol) {
      cleanupFile(filePath);
      res.status(400).json({
        error: 'SYMBOL/TICKER column not found',
        details: `Available columns: ${headers.join(', ')}`,
      });
      return;
    }

    const divCol = findColumn(headerMap, 'div', 'dividend', 'div_cash', 'dividend amount');
    if (!divCol) {
      cleanupFile(filePath);
      res.status(400).json({
        error: 'DIV/DIVIDEND column not found',
        details: `Available columns: ${headers.join(', ')}`,
      });
      return;
    }

    const exDateCol = findColumn(headerMap, 'ex date', 'ex-date', 'ex_date', 'ex dividend date');
    const declareDateCol = findColumn(headerMap, 'declare date', 'declaration date', 'declare_date', 'declaration_date');
    const payDateCol = findColumn(headerMap, 'pay date', 'payment date', 'pay_date', 'payment_date');

    const supabase = getSupabase();
    const records: any[] = [];
    const now = new Date();
    let skippedRows = 0;
    let errors: string[] = [];

    for (const row of rawData) {
      const symbolValue = symbolCol ? row[symbolCol] : null;
      const divValue = divCol ? row[divCol] : null;

      if (!symbolValue || !divValue) {
        skippedRows++;
        continue;
      }

      const ticker = String(symbolValue).trim().toUpperCase();

      let divAmount: number | null = null;
      let divAmountStr: string | null = null;

      if (typeof divValue === 'number') {
        divAmount = divValue;
        divAmountStr = divValue.toString();
      } else {
        const str = String(divValue).trim();
        if (str && str !== 'n/a' && str !== 'N/A' && str !== '' && str !== '-') {
          const cleaned = str.replace(/[^0-9.-]/g, '');
          divAmountStr = cleaned;
          const parsed = parseFloat(cleaned);
          if (!isNaN(parsed) && isFinite(parsed)) {
            divAmount = parsed;
          }
        }
      }

      if (!ticker || !divAmount || divAmount <= 0) {
        skippedRows++;
        errors.push(`Row ${rawData.indexOf(row) + 1}: Invalid ticker or dividend amount`);
        continue;
      }

      logger.info('Upload', `Processing ${ticker}: dividend=${divAmountStr} (raw: ${divValue}, parsed: ${divAmount})`);

      let exDate: string | null = null;
      let declareDate: string | null = null;
      let payDate: string | null = null;

      if (exDateCol && row[exDateCol]) {
        const exDateValue = row[exDateCol];
        if (exDateValue instanceof Date) {
          exDate = exDateValue.toISOString().split('T')[0];
        } else {
          const parsed = new Date(String(exDateValue));
          if (!isNaN(parsed.getTime())) {
            exDate = parsed.toISOString().split('T')[0];
          }
        }
      }

      if (declareDateCol && row[declareDateCol]) {
        const declareDateValue = row[declareDateCol];
        if (declareDateValue instanceof Date) {
          declareDate = declareDateValue.toISOString().split('T')[0];
        } else {
          const parsed = new Date(String(declareDateValue));
          if (!isNaN(parsed.getTime())) {
            declareDate = parsed.toISOString().split('T')[0];
          }
        }
      }

      if (payDateCol && row[payDateCol]) {
        const payDateValue = row[payDateCol];
        if (payDateValue instanceof Date) {
          payDate = payDateValue.toISOString().split('T')[0];
        } else {
          const parsed = new Date(String(payDateValue));
          if (!isNaN(parsed.getTime())) {
            payDate = parsed.toISOString().split('T')[0];
          }
        }
      }

      if (!exDate) {
        if (declareDate) {
          declareDate = declareDate;
        } else {
          declareDate = now.toISOString().split('T')[0];
        }

        const staticData = await supabase
          .from('etf_static')
          .select('payments_per_year')
          .eq('ticker', ticker)
          .single();

        const paymentsPerYear = staticData.data?.payments_per_year ?? 12;
        const daysUntilExDate = Math.ceil(365 / paymentsPerYear);

        const declareDateObj = new Date(declareDate);
        declareDateObj.setDate(declareDateObj.getDate() + daysUntilExDate);
        exDate = declareDateObj.toISOString().split('T')[0];
      } else if (!declareDate) {
        declareDate = now.toISOString().split('T')[0];
      }

      const finalDivAmount = divAmountStr ? parseFloat(divAmountStr) : divAmount;
      records.push({
        ticker,
        ex_date: exDate,
        pay_date: payDate,
        record_date: null,
        declare_date: declareDate,
        div_cash: finalDivAmount,
        adj_amount: finalDivAmount,
        scaled_amount: null,
        split_factor: 1,
        div_type: 'Cash',
        frequency: null,
        description: 'Manual upload - Early announcement',
        is_manual: true,  // Flag to prevent API overwrites
        currency: 'USD',
        _rawDivValue: divAmountStr || String(finalDivAmount),
      });
    }

    if (records.length === 0) {
      cleanupFile(filePath);
      res.status(400).json({
        error: 'No valid dividend data found',
        errors,
      });
      return;
    }

    logger.info('Upload', `Upserting ${records.length} manual dividend records`);

    const recordsToSave = records.map((r: any) => {
      const { _rawDivValue, ...recordWithoutRaw } = r;
      return recordWithoutRaw;
    });

    const { error: upsertError } = await supabase
      .from('dividends_detail')
      .upsert(recordsToSave, {
        onConflict: 'ticker,ex_date',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      cleanupFile(filePath);
      res.status(500).json({
        error: 'Failed to save dividends',
        details: upsertError.message,
      });
      return;
    }

    const tickersToRecalc = [...new Set(records.map(r => r.ticker))];
    const uploadedDividends = new Map<string, { amount: number; exDate: string; rawValue: string }>();
    records.forEach((r: any) => {
      const existing = uploadedDividends.get(r.ticker);
      if (!existing || new Date(r.ex_date) > new Date(existing.exDate)) {
        uploadedDividends.set(r.ticker, {
          amount: r.div_cash,
          exDate: r.ex_date,
          rawValue: r._rawDivValue || String(r.div_cash)
        });
      }
    });

    logger.info('Upload', `Recalculating metrics for ${tickersToRecalc.length} ticker(s)`);

    const recalcResults: Array<{ ticker: string; success: boolean; error?: string }> = [];

    for (const ticker of tickersToRecalc) {
      try {
        const uploadedDivData = uploadedDividends.get(ticker);
        const uploadedDiv = uploadedDivData?.amount ?? null;
        const uploadedDivRaw = uploadedDivData?.rawValue ?? null;

        if (uploadedDiv === null) {
          logger.warn('Upload', `No uploaded dividend found for ${ticker}, skipping update`);
          continue;
        }

        const metrics = await calculateMetrics(ticker);
        const staticData = await supabase
          .from('etf_static')
          .select('payments_per_year, price')
          .eq('ticker', ticker)
          .single();

        const paymentsPerYear = staticData.data?.payments_per_year ?? 12;
        const currentPrice = metrics.currentPrice ?? staticData.data?.price ?? null;

        const lastDividend = parseFloat(uploadedDivRaw || String(uploadedDiv));
        const annualDividend = lastDividend * paymentsPerYear;
        const forwardYield = currentPrice ? (annualDividend / currentPrice) * 100 : null;

        logger.info('Upload', `Updating ${ticker}: last_dividend=${lastDividend} (raw: ${uploadedDivRaw}), annual_dividend=${annualDividend}, forward_yield=${forwardYield}`);

        const { error: updateError } = await supabase
          .from('etf_static')
          .update({
            price: metrics.currentPrice,
            price_change: metrics.priceChange,
            price_change_pct: metrics.priceChangePercent,
            last_dividend: lastDividend,
            annual_dividend: annualDividend,
            forward_yield: forwardYield,
            dividend_sd: metrics.dividendSD,
            dividend_cv: metrics.dividendCV,
            dividend_cv_percent: metrics.dividendCVPercent,
            dividend_volatility_index: metrics.dividendVolatilityIndex,
            week_52_high: metrics.week52High,
            week_52_low: metrics.week52Low,
            tr_drip_3y: metrics.totalReturnDrip?.['3Y'],
            tr_drip_12m: metrics.totalReturnDrip?.['1Y'],
            tr_drip_6m: metrics.totalReturnDrip?.['6M'],
            tr_drip_3m: metrics.totalReturnDrip?.['3M'],
            tr_drip_1m: metrics.totalReturnDrip?.['1M'],
            tr_drip_1w: metrics.totalReturnDrip?.['1W'],
            price_return_3y: metrics.priceReturn?.['3Y'],
            price_return_12m: metrics.priceReturn?.['1Y'],
            price_return_6m: metrics.priceReturn?.['6M'],
            price_return_3m: metrics.priceReturn?.['3M'],
            price_return_1m: metrics.priceReturn?.['1M'],
            price_return_1w: metrics.priceReturn?.['1W'],
          })
          .eq('ticker', ticker);

        if (updateError) {
          recalcResults.push({ ticker, success: false, error: updateError.message });
        } else {
          recalcResults.push({ ticker, success: true });
        }
      } catch (error) {
        recalcResults.push({ ticker, success: false, error: (error as Error).message });
      }
    }

    cleanupFile(filePath);

    const successCount = recalcResults.filter(r => r.success).length;
    const failCount = recalcResults.filter(r => !r.success).length;

    res.json({
      success: true,
      dividendsAdded: records.length,
      skippedRows,
      metricsRecalculated: successCount,
      metricsFailed: failCount,
      recalcResults,
      updatedTickers: tickersToRecalc,
      message: `Successfully uploaded ${records.length} dividend(s) and recalculated metrics for ${successCount} ticker(s)`,
      note: 'When Tiingo syncs, it will automatically match and update these dividends with official data',
    });
  } catch (error) {
    logger.error('Upload', `Error processing dividend file: ${(error as Error).message}`);
    cleanupFile(filePath);
    res.status(500).json({
      error: 'Failed to process Excel file',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /upload-static - Backward compatibility alias
 */
router.post('/upload-static', upload.single('file'), handleStaticUpload);

/**
 * GET / - Get all ETFs with pre-computed metrics from database
 * Serves metrics that were calculated during the hourly cron job
 * Uses Redis caching for faster responses
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const supabase = getSupabase();

    // CRITICAL: Clear cache to ensure fresh data with new database-level filtering
    // This prevents old cached data with CEFs from being returned
    try {
      const { deleteCached } = await import('../services/redis.js');
      await deleteCached(CACHE_KEYS.ETF_LIST);
      logger.info('Routes', 'Cleared ETF list cache to ensure fresh filtered data');
    } catch (cacheError) {
      logger.warn('Routes', `Failed to clear cache: ${(cacheError as Error).message}`);
    }

    // CRITICAL: Filter at database level using category column
    // This is the PRIMARY and MOST RELIABLE filter - only get CCETFs from database
    const staticResult = await supabase
      .from('etf_static')
      .select('*')
      .eq('category', 'CCETF')  // ONLY get CCETFs, exclude CEFs at database level
      .order('ticker', { ascending: true })
      .limit(10000);

    if (staticResult.error) {
      logger.error('Routes', `Error fetching etf_static: ${staticResult.error.message}`);
      res.status(500).json({ error: 'Failed to fetch ETF data' });
      return;
    }

    const allData = staticResult.data || [];

    // Additional filtering for safety (backup checks)
    // Since we're already filtering by category = 'CCETF' at database level,
    // this is just extra safety to exclude any edge cases
    const staticData = allData.filter((item: any) => {
      // Double-check category (should already be filtered, but safety check)
      if (item.category && item.category.toUpperCase() === 'CEF') {
        return false; // Explicitly exclude CEFs
      }

      // Exclude NAV symbol records (where ticker === nav_symbol)
      const ticker = item.ticker || '';
      const navSymbol = item.nav_symbol || '';
      if (ticker === navSymbol && navSymbol !== '') {
        return false;
      }

      // Exclude NAV proxy symbols by pattern
      const isNavProxySymbol = ticker.length >= 4 && ticker.startsWith('X') && ticker.endsWith('X');
      if (isNavProxySymbol) {
        return false;
      }

      // All records should already be CCETFs from database filter, but include for safety
      return true;
    });

    // Detailed logging for debugging
    const navSymbolRecords = allData.filter((item: any) => {
      const ticker = item.ticker || '';
      const navSymbol = item.nav_symbol || '';
      return ticker === navSymbol && navSymbol !== '';
    }).length;
    const navProxySymbols = allData.filter((item: any) => {
      const ticker = item.ticker || '';
      return ticker.length >= 4 && ticker.startsWith('X') && ticker.endsWith('X');
    }).length;
    const withoutNavSymbol = allData.filter((item: any) => !item.nav_symbol || item.nav_symbol === '').length;
    const autoCreatedRecords = allData.filter((item: any) => {
      const issuer = item.issuer || '';
      const description = item.description || '';
      return !issuer && description.toLowerCase().includes('auto-created for nav');
    }).length;
    const blankIssuerCEFs = allData.filter((item: any) => {
      const issuer = item.issuer || '';
      const navSymbol = item.nav_symbol || '';
      return !issuer && navSymbol;
    }).length;
    const excludedCEFs = allData.filter((item: any) => {
      const hasNavSymbol = item.nav_symbol !== null && item.nav_symbol !== undefined && item.nav_symbol !== '';
      const hasNAVData = item.nav !== null && item.nav !== undefined && item.nav !== 0;
      return hasNavSymbol && hasNAVData;
    }).length;

    logger.info('Routes', `CCETF Filter Results: ${allData.length} total → ${staticData.length} CCETFs`);
    logger.info('Routes', `  - Records without nav_symbol: ${withoutNavSymbol}`);
    logger.info('Routes', `  - Excluded CEFs (nav_symbol + NAV data): ${excludedCEFs}`);
    logger.info('Routes', `  - Excluded NAV symbol records (ticker === nav_symbol): ${navSymbolRecords}`);
    logger.info('Routes', `  - Excluded NAV proxy symbols (X...X pattern): ${navProxySymbols}`);
    logger.info('Routes', `  - Excluded auto-created CEF records: ${autoCreatedRecords}`);
    logger.info('Routes', `  - Excluded blank issuer CEFs: ${blankIssuerCEFs}`);

    // Map to frontend format
    const results = staticData.map((etf: any) => ({
      ticker: etf.ticker,
      symbol: etf.ticker,
      issuer: etf.issuer,
      description: etf.description,
      pay_day_text: etf.pay_day_text,
      pay_day: etf.pay_day_text,
      payments_per_year: etf.payments_per_year,
      ipo_price: etf.ipo_price,
      // Pre-computed price data from cron job
      price: etf.price,
      price_change: etf.price_change,
      price_change_pct: etf.price_change_pct,
      // Pre-computed dividend data from cron job
      dividend: etf.last_dividend,
      last_dividend: etf.last_dividend,
      annual_div: etf.annual_dividend,
      annual_dividend: etf.annual_dividend,
      forward_yield: etf.forward_yield,
      // Pre-computed volatility metrics from cron job
      dividend_sd: etf.dividend_sd,
      dividend_cv: etf.dividend_cv,
      dividend_cv_percent: etf.dividend_cv_percent,
      dividend_volatility_index: etf.dividend_volatility_index,
      // Pre-computed 52-week range from cron job
      week_52_high: etf.week_52_high,
      week_52_low: etf.week_52_low,
      // Pre-computed Total Return WITH DRIP from cron job
      tr_drip_3y: etf.tr_drip_3y,
      tr_drip_12m: etf.tr_drip_12m,
      tr_drip_6m: etf.tr_drip_6m,
      tr_drip_3m: etf.tr_drip_3m,
      tr_drip_1m: etf.tr_drip_1m,
      tr_drip_1w: etf.tr_drip_1w,
      // Pre-computed Price Return from cron job
      price_return_3y: etf.price_return_3y,
      price_return_12m: etf.price_return_12m,
      price_return_6m: etf.price_return_6m,
      price_return_3m: etf.price_return_3m,
      price_return_1m: etf.price_return_1m,
      price_return_1w: etf.price_return_1w,
      // Legacy fields for backward compatibility
      three_year_annualized: etf.tr_drip_3y,
      total_return_12m: etf.tr_drip_12m,
      total_return_6m: etf.tr_drip_6m,
      total_return_3m: etf.tr_drip_3m,
      total_return_1m: etf.tr_drip_1m,
      total_return_1w: etf.tr_drip_1w,
      // Metadata
      last_updated: etf.last_updated || etf.updated_at,
      weighted_rank: etf.weighted_rank,
    }));

    // Get the most recent sync time from data_sync_log (actual Tiingo sync time)
    const { data: syncLogs } = await supabase
      .from('data_sync_log')
      .select('updated_at, last_sync_date')
      .eq('data_type', 'prices')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get the most recent update time from etf_static
    let mostRecentETFUpdate: string | null = null;
    if (staticData.length > 0) {
      const mostRecent = staticData.reduce((latest: any, current: any) => {
        if (!latest || !latest.last_updated) return current;
        if (!current || !current.last_updated) return latest;
        return new Date(current.last_updated) > new Date(latest.last_updated) ? current : latest;
      }, null);
      mostRecentETFUpdate = mostRecent?.last_updated || mostRecent?.updated_at || null;
    }

    // Use the most recent timestamp from either sync log or ETF updates
    let lastUpdatedTimestamp: string | null = null;
    const syncLogTime = syncLogs?.updated_at ? new Date(syncLogs.updated_at).getTime() : 0;
    const etfUpdateTime = mostRecentETFUpdate ? new Date(mostRecentETFUpdate).getTime() : 0;

    if (syncLogs?.updated_at && syncLogTime > etfUpdateTime) {
      lastUpdatedTimestamp = syncLogs.updated_at;
    } else if (mostRecentETFUpdate) {
      lastUpdatedTimestamp = mostRecentETFUpdate;
    } else if (syncLogs?.updated_at) {
      lastUpdatedTimestamp = syncLogs.updated_at;
    }

    const response = {
      data: results,
      last_updated: lastUpdatedTimestamp,
      last_updated_timestamp: lastUpdatedTimestamp,
    };

    // Cache the response in Redis
    await setCached(CACHE_KEYS.ETF_LIST, response, CACHE_TTL.ETF_LIST);
    logger.info('Routes', `Returning ${results.length} ETFs (cached for ${CACHE_TTL.ETF_LIST}s)`);

    res.json(response);
  } catch (error) {
    logger.error('Routes', `Error fetching ETFs: ${(error as Error).message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// Excel Export Endpoint (MUST be before /:symbol to avoid route conflict)
// ============================================================================

/**
 * GET /export - Export all ETF data to Excel file
 * Returns an Excel file with all ETF data matching the dashboard table format
 */
router.get('/export', async (_req: Request, res: Response): Promise<void> => {
  try {
    const supabase = getSupabase();

    const staticResult = await supabase
      .from('etf_static')
      .select('*')
      .order('ticker', { ascending: true })
      .limit(10000);

    const legacyResult = await supabase
      .from('etfs')
      .select('*')
      .order('symbol', { ascending: true })
      .limit(10000);

    if (staticResult.error) {
      logger.error('Routes', `Error fetching etf_static: ${staticResult.error.message}`);
    }
    if (legacyResult.error) {
      logger.error('Routes', `Error fetching etfs: ${legacyResult.error.message}`);
    }

    const allStaticData = staticResult.data || [];
    // Filter out CEFs from export - only include CCETFs (same logic as main GET endpoint)
    const staticData = allStaticData.filter((item: any) => {
      const ticker = item.ticker || '';
      const navSymbol = item.nav_symbol || '';
      const issuer = item.issuer || '';
      const description = item.description || '';

      // Exclude NAV symbol records (ticker === nav_symbol)
      if (ticker === navSymbol && navSymbol !== '') return false;

      // Exclude NAV proxy symbols (X...X pattern)
      if (ticker.length >= 4 && ticker.startsWith('X') && ticker.endsWith('X')) return false;

      // Exclude auto-created CEF placeholder records
      if (!issuer && description.toLowerCase().includes('auto-created for nav')) return false;

      // Exclude records with blank issuer AND have nav_symbol set (these are CEFs)
      if (!issuer && navSymbol) return false;

      // Exclude CEFs (have nav_symbol + NAV data)
      const hasNavSymbol = navSymbol !== '';
      const hasNAVData = item.nav !== null && item.nav !== undefined && item.nav !== 0;
      if (hasNavSymbol && hasNAVData) return false;

      return true;
    });
    const legacyData = legacyResult.data || [];

    const preferValue = (a: any, b: any): any => {
      if (a !== null && a !== undefined && a !== 0 && a !== '0' && a !== '') {
        return a;
      }
      if (b !== null && b !== undefined && b !== 0 && b !== '0' && b !== '') {
        return b;
      }
      return a ?? b;
    };

    const preferNumeric = (a: any, b: any): any => {
      const numA = typeof a === 'number' ? a : parseFloat(String(a || 0));
      const numB = typeof b === 'number' ? b : parseFloat(String(b || 0));
      if (!isNaN(numA) && numA !== 0) return numA;
      if (!isNaN(numB) && numB !== 0) return numB;
      return numA || numB || null;
    };

    const tickerMap = new Map<string, any>();

    staticData.forEach((row: any) => {
      tickerMap.set(row.ticker, row);
    });

    legacyData.forEach((row: any) => {
      const ticker = row.symbol;
      if (tickerMap.has(ticker)) {
        const existing = tickerMap.get(ticker);
        tickerMap.set(ticker, {
          ...existing,
          issuer: preferValue(existing.issuer, row.issuer),
          description: preferValue(existing.description, row.description),
          pay_day_text: preferValue(existing.pay_day_text, row.pay_day),
          payments_per_year: preferNumeric(existing.payments_per_year, row.payments_per_year),
          ipo_price: preferNumeric(existing.ipo_price, row.ipo_price),
        });
      } else {
        tickerMap.set(ticker, {
          ticker: row.symbol,
          issuer: row.issuer,
          description: row.description,
          pay_day_text: row.pay_day,
          payments_per_year: row.payments_per_year,
          ipo_price: row.ipo_price,
          price: null,
          price_change: null,
          price_change_pct: null,
          last_dividend: null,
          annual_dividend: null,
          forward_yield: null,
          dividend_cv_percent: null,
          dividend_volatility_index: null,
          weighted_rank: null,
          tr_drip_3y: null,
          tr_drip_12m: null,
          tr_drip_6m: null,
          tr_drip_3m: null,
          tr_drip_1m: null,
          tr_drip_1w: null,
          price_return_3y: null,
          price_return_12m: null,
          price_return_6m: null,
          price_return_3m: null,
          price_return_1m: null,
          price_return_1w: null,
          week_52_high: null,
          week_52_low: null,
        });
      }
    });

    const allETFs = Array.from(tickerMap.values()).sort((a, b) =>
      (a.ticker || '').localeCompare(b.ticker || '')
    );

    const worksheetData = allETFs.map((etf: any) => ({
      'Favorites': '',
      'SYMBOL': etf.ticker || '',
      'Issuer': etf.issuer || '',
      'DESC': etf.description || '',
      'Pay Day': etf.pay_day_text || '',
      'IPO PRICE': etf.ipo_price || null,
      'Price': etf.price || null,
      'Price Change': etf.price_change || null,
      'Dividend': etf.last_dividend || null,
      '# Pmts': etf.payments_per_year || null,
      'Annual Div': etf.annual_dividend || null,
      'Forward Yield': etf.forward_yield ? (etf.forward_yield * 100).toFixed(2) + '%' : null,
      'Dividend Volatility Index': etf.dividend_volatility_index || etf.dividend_cv_percent || null,
      'Weighted Rank': etf.weighted_rank || null,
      '52 Wk High': etf.week_52_high || null,
      '52 Wk Low': etf.week_52_low || null,
      'TR DRIP 3 YR': etf.tr_drip_3y ? (etf.tr_drip_3y >= 0 ? '+' : '') + etf.tr_drip_3y.toFixed(2) + '%' : null,
      'TR DRIP 12 Mo': etf.tr_drip_12m ? (etf.tr_drip_12m >= 0 ? '+' : '') + etf.tr_drip_12m.toFixed(2) + '%' : null,
      'TR DRIP 6 Mo': etf.tr_drip_6m ? (etf.tr_drip_6m >= 0 ? '+' : '') + etf.tr_drip_6m.toFixed(2) + '%' : null,
      'TR DRIP 3 Mo': etf.tr_drip_3m ? (etf.tr_drip_3m >= 0 ? '+' : '') + etf.tr_drip_3m.toFixed(2) + '%' : null,
      'TR DRIP 1 Mo': etf.tr_drip_1m ? (etf.tr_drip_1m >= 0 ? '+' : '') + etf.tr_drip_1m.toFixed(2) + '%' : null,
      'TR DRIP 1 Wk': etf.tr_drip_1w ? (etf.tr_drip_1w >= 0 ? '+' : '') + etf.tr_drip_1w.toFixed(2) + '%' : null,
      'Price Return 3 YR': etf.price_return_3y ? (etf.price_return_3y >= 0 ? '+' : '') + etf.price_return_3y.toFixed(2) + '%' : null,
      'Price Return 12 Mo': etf.price_return_12m ? (etf.price_return_12m >= 0 ? '+' : '') + etf.price_return_12m.toFixed(2) + '%' : null,
      'Price Return 6 Mo': etf.price_return_6m ? (etf.price_return_6m >= 0 ? '+' : '') + etf.price_return_6m.toFixed(2) + '%' : null,
      'Price Return 3 Mo': etf.price_return_3m ? (etf.price_return_3m >= 0 ? '+' : '') + etf.price_return_3m.toFixed(2) + '%' : null,
      'Price Return 1 Mo': etf.price_return_1m ? (etf.price_return_1m >= 0 ? '+' : '') + etf.price_return_1m.toFixed(2) + '%' : null,
      'Price Return 1 Wk': etf.price_return_1w ? (etf.price_return_1w >= 0 ? '+' : '') + etf.price_return_1w.toFixed(2) + '%' : null,
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ETF Data');

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const filename = `ETF_Data_Export_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(excelBuffer);

    logger.info('Routes', `Exported ${allETFs.length} ETFs to Excel`);
  } catch (error) {
    logger.error('Routes', `Error exporting ETF data: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to export ETF data' });
  }
});

/**
 * GET /:symbol - Get single ETF
 * Merges data from etf_static and etfs tables
 */
router.get('/:symbol', async (req: Request, res: Response): Promise<void> => {
  try {
    const { symbol } = req.params;
    const ticker = symbol.toUpperCase();
    const supabase = getSupabase();

    const staticResult = await supabase
      .from('etf_static')
      .select('*')
      .eq('ticker', ticker)
      .single();

    const legacyResult = await supabase
      .from('etfs')
      .select('*')
      .eq('symbol', ticker)
      .single();

    const staticData = staticResult.data;
    const legacyData = legacyResult.data;

    if (!staticData && !legacyData) {
      res.status(404).json({ error: 'ETF not found' });
      return;
    }

    const preferNumeric = (a: any, b: any): any => {
      if (a === null || a === undefined || a === '') {
        return b ?? null;
      }
      if (b === null || b === undefined || b === '') {
        return a ?? null;
      }
      const numA = typeof a === 'number' ? a : parseFloat(String(a));
      const numB = typeof b === 'number' ? b : parseFloat(String(b));
      if (!isNaN(numA) && numA !== 0) return numA;
      if (!isNaN(numB) && numB !== 0) return numB;
      if (!isNaN(numA)) return numA;
      if (!isNaN(numB)) return numB;
      return a ?? b ?? null;
    };

    const preferValue = (a: any, b: any): any => {
      if (a !== null && a !== undefined && a !== 0 && a !== '0' && a !== '') {
        return a;
      }
      if (b !== null && b !== undefined && b !== 0 && b !== '0' && b !== '') {
        return b;
      }
      return a ?? b;
    };

    let merged: any;
    if (staticData && legacyData) {
      merged = {
        ticker: staticData.ticker,
        symbol: staticData.ticker,
        issuer: preferValue(staticData.issuer, legacyData.issuer),
        description: preferValue(staticData.description, legacyData.description),
        pay_day_text: preferValue(staticData.pay_day_text, legacyData.pay_day),
        pay_day: preferValue(staticData.pay_day_text, legacyData.pay_day),
        payments_per_year: preferNumeric(staticData.payments_per_year, legacyData.payments_per_year),
        ipo_price: preferNumeric(staticData.ipo_price, legacyData.ipo_price),
        price: preferNumeric(staticData.price, legacyData.price),
        price_change: preferNumeric(staticData.price_change, legacyData.price_change),
        price_change_pct: preferNumeric(staticData.price_change_pct, legacyData.price_change_pct),
        dividend: preferNumeric(legacyData.dividend, staticData.last_dividend),
        last_dividend: preferNumeric(staticData.last_dividend, legacyData.dividend),
        annual_div: preferNumeric(legacyData.annual_div, staticData.annual_dividend),
        annual_dividend: preferNumeric(staticData.annual_dividend, legacyData.annual_dividend ?? legacyData.annual_div),
        forward_yield: preferNumeric(staticData.forward_yield, legacyData.forward_yield),
        dividend_sd: preferNumeric(staticData.dividend_sd, legacyData.dividend_sd),
        dividend_cv: preferNumeric(staticData.dividend_cv, legacyData.dividend_cv),
        dividend_cv_percent: preferNumeric(staticData.dividend_cv_percent, legacyData.dividend_cv_percent),
        // Only use string volatility index values (ignore legacy numeric values)
        dividend_volatility_index: typeof staticData.dividend_volatility_index === 'string'
          ? staticData.dividend_volatility_index
          : (typeof legacyData.dividend_volatility_index === 'string' ? legacyData.dividend_volatility_index : null),
        weighted_rank: preferNumeric(staticData.weighted_rank, legacyData.weighted_rank),
        tr_drip_3y: preferNumeric(staticData.tr_drip_3y, legacyData.tr_drip_3y ?? legacyData.three_year_annualized),
        tr_drip_12m: preferNumeric(staticData.tr_drip_12m, legacyData.tr_drip_12m ?? legacyData.total_return_12m),
        tr_drip_6m: preferNumeric(staticData.tr_drip_6m, legacyData.tr_drip_6m ?? legacyData.total_return_6m),
        tr_drip_3m: preferNumeric(staticData.tr_drip_3m, legacyData.tr_drip_3m ?? legacyData.total_return_3m),
        tr_drip_1m: preferNumeric(staticData.tr_drip_1m, legacyData.tr_drip_1m ?? legacyData.total_return_1m),
        tr_drip_1w: preferNumeric(staticData.tr_drip_1w, legacyData.tr_drip_1w ?? legacyData.total_return_1w),
        price_return_3y: preferNumeric(staticData.price_return_3y, legacyData.price_return_3y),
        price_return_12m: preferNumeric(staticData.price_return_12m, legacyData.price_return_12m),
        price_return_6m: preferNumeric(staticData.price_return_6m, legacyData.price_return_6m),
        price_return_3m: preferNumeric(staticData.price_return_3m, legacyData.price_return_3m),
        price_return_1m: preferNumeric(staticData.price_return_1m, legacyData.price_return_1m),
        price_return_1w: preferNumeric(staticData.price_return_1w, legacyData.price_return_1w),
        week_52_high: preferNumeric(staticData.week_52_high, legacyData.week_52_high),
        week_52_low: preferNumeric(staticData.week_52_low, legacyData.week_52_low),
        last_updated: preferValue(staticData.last_updated, legacyData.last_updated),
        spreadsheet_updated_at: preferValue(staticData.updated_at, legacyData.spreadsheet_updated_at),
        three_year_annualized: preferNumeric(staticData.tr_drip_3y, legacyData.three_year_annualized),
        total_return_12m: preferNumeric(staticData.tr_drip_12m, legacyData.total_return_12m),
        total_return_6m: preferNumeric(staticData.tr_drip_6m, legacyData.total_return_6m),
        total_return_3m: preferNumeric(staticData.tr_drip_3m, legacyData.total_return_3m),
        total_return_1m: preferNumeric(staticData.tr_drip_1m, legacyData.total_return_1m),
        total_return_1w: preferNumeric(staticData.tr_drip_1w, legacyData.total_return_1w),
      };
    } else if (staticData) {
      merged = {
        ...staticData,
        symbol: staticData.ticker,
      };
    } else {
      merged = {
        ...legacyData,
        ticker: legacyData.symbol,
        pay_day_text: legacyData.pay_day,
      };
    }

    // If price returns are missing but total returns exist, calculate them on-the-fly
    const needsPriceReturns = (
      (!merged.price_return_3y && merged.tr_drip_3y != null) ||
      (!merged.price_return_12m && merged.tr_drip_12m != null) ||
      (!merged.price_return_6m && merged.tr_drip_6m != null) ||
      (!merged.price_return_3m && merged.tr_drip_3m != null) ||
      (!merged.price_return_1m && merged.tr_drip_1m != null) ||
      (!merged.price_return_1w && merged.tr_drip_1w != null)
    );

    if (needsPriceReturns) {
      try {
        const metrics = await calculateMetrics(ticker);
        if (metrics.priceReturn) {
          merged.price_return_3y = merged.price_return_3y ?? metrics.priceReturn['3Y'];
          merged.price_return_12m = merged.price_return_12m ?? metrics.priceReturn['1Y'];
          merged.price_return_6m = merged.price_return_6m ?? metrics.priceReturn['6M'];
          merged.price_return_3m = merged.price_return_3m ?? metrics.priceReturn['3M'];
          merged.price_return_1m = merged.price_return_1m ?? metrics.priceReturn['1M'];
          merged.price_return_1w = merged.price_return_1w ?? metrics.priceReturn['1W'];
        }
      } catch (error) {
        logger.warn('Routes', `Failed to calculate price returns for ${ticker}: ${(error as Error).message}`);
      }
    }

    res.json(merged);
  } catch (error) {
    logger.error('Routes', `Error fetching ETF: ${(error as Error).message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// Dividend Dates (Tiingo Corporate Actions)
// ============================================================================

/**
 * GET /api/etfs/:ticker/dividend-dates
 * Fetch dividend record and payment dates from Tiingo Corporate Actions API
 */
router.get('/:ticker/dividend-dates', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const { limit } = req.query;

    if (!ticker) {
      res.status(400).json({ error: 'Ticker is required' });
      return;
    }

    logger.info('Routes', `Fetching dividend dates for ${ticker}`);

    let dividends = await fetchDividendDates(ticker.toUpperCase());

    // Apply limit if specified
    if (limit && !isNaN(Number(limit))) {
      dividends = dividends.slice(0, Number(limit));
    }

    res.json({
      ticker: ticker.toUpperCase(),
      dividends,
      count: dividends.length,
    });
  } catch (error) {
    logger.error('Routes', `Error fetching dividend dates: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to fetch dividend dates' });
  }
});

/**
 * GET /api/etfs/:ticker/latest-dividend
 * Get the most recent dividend with dates
 */
router.get('/:ticker/latest-dividend', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;

    if (!ticker) {
      res.status(400).json({ error: 'Ticker is required' });
      return;
    }

    const dividend = await getLatestDividendDates(ticker.toUpperCase());

    if (!dividend) {
      res.status(404).json({ error: 'No dividend data found' });
      return;
    }

    res.json({
      ticker: ticker.toUpperCase(),
      ...dividend,
    });
  } catch (error) {
    logger.error('Routes', `Error fetching latest dividend: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to fetch latest dividend' });
  }
});

/**
 * DELETE /api/etfs/:ticker - Delete a specific ETF
 */
router.delete('/:ticker', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ticker } = req.params;
    const upperTicker = ticker.toUpperCase();
    const supabase = getSupabase();

    // Delete related data first
    const { error: deleteDividendsError } = await supabase
      .from('dividends_detail')
      .delete()
      .eq('ticker', upperTicker);

    if (deleteDividendsError) {
      logger.warn('Routes', `Failed to delete from dividends_detail: ${deleteDividendsError.message}`);
    }

    const { error: deletePricesError } = await supabase
      .from('prices_daily')
      .delete()
      .eq('ticker', upperTicker);

    if (deletePricesError) {
      logger.warn('Routes', `Failed to delete from prices_daily: ${deletePricesError.message}`);
    }

    const { error: deleteSyncLogError } = await supabase
      .from('data_sync_log')
      .delete()
      .eq('ticker', upperTicker);

    if (deleteSyncLogError) {
      logger.warn('Routes', `Failed to delete from data_sync_log: ${deleteSyncLogError.message}`);
    }

    const { error: deleteStaticError } = await supabase
      .from('etf_static')
      .delete()
      .eq('ticker', upperTicker);

    if (deleteStaticError) {
      logger.error('Routes', `Failed to delete from etf_static: ${deleteStaticError.message}`);
      res.status(500).json({
        error: 'Failed to delete ETF',
        details: deleteStaticError.message,
      });
      return;
    }

    // Clear cache immediately after deletion
    try {
      const { deleteCached } = await import('../services/redis.js');
      await deleteCached(CACHE_KEYS.ETF_LIST);
      logger.info('Routes', `Cleared ETF list cache after deleting ${upperTicker}`);
    } catch (cacheError) {
      logger.warn('Routes', `Failed to clear cache: ${(cacheError as Error).message}`);
    }

    const { error: deleteLegacyError } = await supabase
      .from('etfs')
      .delete()
      .eq('symbol', upperTicker);

    if (deleteLegacyError) {
      logger.warn('Routes', `Failed to delete from etfs: ${deleteLegacyError.message}`);
    }

    logger.info('Routes', `Deleted ETF: ${upperTicker}`);
    res.json({
      success: true,
      message: `Successfully deleted ${upperTicker}`,
    });
  } catch (error) {
    logger.error('Routes', `Error deleting ETF: ${(error as Error).message}`);
    res.status(500).json({
      error: 'Failed to delete ETF',
      message: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/etfs/batch - Delete multiple ETFs
 */
router.delete('/batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const { tickers } = req.body;

    if (!Array.isArray(tickers) || tickers.length === 0) {
      res.status(400).json({
        error: 'Invalid request',
        details: 'tickers must be a non-empty array',
      });
      return;
    }

    const upperTickers = tickers.map((t: string) => String(t).toUpperCase());
    const supabase = getSupabase();

    const { error: deleteStaticError } = await supabase
      .from('etf_static')
      .delete()
      .in('ticker', upperTickers);

    if (deleteStaticError) {
      logger.error('Routes', `Failed to delete from etf_static: ${deleteStaticError.message}`);
      res.status(500).json({
        error: 'Failed to delete ETFs',
        details: deleteStaticError.message,
      });
      return;
    }

    const { error: deleteLegacyError } = await supabase
      .from('etfs')
      .delete()
      .in('symbol', upperTickers);

    if (deleteLegacyError) {
      logger.warn('Routes', `Failed to delete from etfs: ${deleteLegacyError.message}`);
    }

    logger.info('Routes', `Deleted ${upperTickers.length} ETF(s): ${upperTickers.join(', ')}`);
    res.json({
      success: true,
      count: upperTickers.length,
      message: `Successfully deleted ${upperTickers.length} ETF(s)`,
    });
  } catch (error) {
    logger.error('Routes', `Error deleting ETFs: ${(error as Error).message}`);
    res.status(500).json({
      error: 'Failed to delete ETFs',
      message: (error as Error).message,
    });
  }
});

export default router;
