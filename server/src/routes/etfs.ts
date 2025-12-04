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
import config from '../config/index.js';
import { logger, parseNumeric } from '../utils/index.js';
import type { ETFStaticRecord } from '../types/index.js';
import { calculateMetrics } from '../services/metrics.js';
import { fetchDividendDates, getLatestDividendDates } from '../services/alphaVantage.js';

const router: Router = Router();

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
    const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
    
    // Find header row
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

    const rawData = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: null }) as Record<string, unknown>[];
    
    if (!rawData || rawData.length === 0) {
      cleanupFile(filePath);
      res.status(400).json({ error: 'Excel file is empty' });
      return;
    }

    // Build header map
    const headers = Object.keys(rawData[0] ?? {});
    const headerMap: Record<string, string> = {};
    headers.forEach(h => {
      if (h) headerMap[String(h).trim().toLowerCase()] = h;
    });

    // Find columns
    const symbolCol = findColumn(headerMap, 'symbol', 'symbols', 'ticker');
    if (!symbolCol) {
      cleanupFile(filePath);
      res.status(400).json({
        error: 'SYMBOL/TICKER column not found',
        details: `Available columns: ${headers.join(', ')}`,
      });
      return;
    }

    const issuerCol = findColumn(headerMap, 'issuer');
    const descCol = findColumn(headerMap, 'desc', 'description', 'name');
    const payDayCol = findColumn(headerMap, 'pay day', 'pay_day', 'pay_day_text', 'payment frequency');
    const pmtsCol = findColumn(headerMap, '# pmts', 'payments_per_year', '# payments');
    const ipoPriceCol = findColumn(headerMap, 'ipo price', 'ipo_price');

    // Build records - using Partial since we only upload core identity fields
    const records: Partial<ETFStaticRecord>[] = [];
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

      records.push({
        ticker,
        issuer: issuerCol && row[issuerCol] ? String(row[issuerCol]).trim() : null,
        description: descCol && row[descCol] ? String(row[descCol]).trim() : null,
        pay_day_text: payDayCol && row[payDayCol] ? String(row[payDayCol]).trim() : null,
        payments_per_year: pmtsCol ? parseNumeric(row[pmtsCol]) : null,
        ipo_price: ipoPriceCol ? parseNumeric(row[ipoPriceCol]) : null,
        default_rank_weights: null,
        updated_at: now,
      });
    }

    if (records.length === 0) {
      cleanupFile(filePath);
      res.status(400).json({
        error: 'No valid ticker data found',
      });
      return;
    }

    logger.info('Upload', `Upserting ${records.length} tickers to etf_static`);

    // Upsert to etf_static
    const supabase = getSupabase();
    const { error: upsertError } = await supabase
      .from('etf_static')
      .upsert(records, { onConflict: 'ticker' });

    if (upsertError) {
      cleanupFile(filePath);
      res.status(500).json({
        error: 'Failed to save static data',
        details: upsertError.message,
      });
      return;
    }

    // Also update legacy etfs table for backward compatibility
    const legacyRecords = records.map(r => ({
      symbol: r.ticker,
      issuer: r.issuer,
      description: r.description,
      pay_day: r.pay_day_text,
      payments_per_year: r.payments_per_year,
      ipo_price: r.ipo_price,
      spreadsheet_updated_at: now,
    }));

    await supabase.from('etfs').upsert(legacyRecords, { onConflict: 'symbol' });

    cleanupFile(filePath);

    res.json({
      success: true,
      count: records.length,
      skipped: skippedRows,
      message: `Successfully updated ${records.length} tickers`,
      note: 'Run "npm run seed:history" to fetch price/dividend data from Tiingo',
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
 * POST /upload-static - Backward compatibility alias
 */
router.post('/upload-static', upload.single('file'), handleStaticUpload);

// ============================================================================
// ETF List Endpoint
// ============================================================================

/**
 * GET / - Get all ETFs
 * Merges data from etf_static (Excel uploads) and etfs (legacy/API data)
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
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

    const staticData = staticResult.data || [];
    const legacyData = legacyResult.data || [];
    
    logger.info('Routes', `Fetched ${staticData.length} from etf_static, ${legacyData.length} from etfs`);

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

    const legacyMap = new Map<string, any>();
    for (const item of legacyData) {
      const symbol = (item.symbol || '').toUpperCase();
      if (symbol) {
        legacyMap.set(symbol, item);
      }
    }

    const mergedMap = new Map<string, any>();

    for (const staticItem of staticData) {
      const ticker = (staticItem.ticker || '').toUpperCase();
      if (!ticker) continue;

      const legacyItem = legacyMap.get(ticker);
      
      if (legacyItem) {
        const merged = {
          ticker: staticItem.ticker,
          symbol: staticItem.ticker,
          issuer: preferValue(staticItem.issuer, legacyItem.issuer),
          description: preferValue(staticItem.description, legacyItem.description),
          pay_day_text: preferValue(staticItem.pay_day_text, legacyItem.pay_day),
          pay_day: preferValue(staticItem.pay_day_text, legacyItem.pay_day),
          payments_per_year: preferNumeric(staticItem.payments_per_year, legacyItem.payments_per_year),
          ipo_price: preferNumeric(staticItem.ipo_price, legacyItem.ipo_price),
          price: preferNumeric(staticItem.price, legacyItem.price),
          price_change: preferNumeric(staticItem.price_change, legacyItem.price_change),
          price_change_pct: preferNumeric(staticItem.price_change_pct, legacyItem.price_change_pct),
          dividend: preferNumeric(legacyItem.dividend, staticItem.last_dividend),
          last_dividend: preferNumeric(staticItem.last_dividend, legacyItem.dividend),
          annual_div: preferNumeric(legacyItem.annual_div, staticItem.annual_dividend),
          annual_dividend: preferNumeric(staticItem.annual_dividend, legacyItem.annual_dividend ?? legacyItem.annual_div),
          forward_yield: preferNumeric(staticItem.forward_yield, legacyItem.forward_yield),
          dividend_sd: preferNumeric(staticItem.dividend_sd, legacyItem.dividend_sd),
          dividend_cv: preferNumeric(staticItem.dividend_cv, legacyItem.dividend_cv),
          dividend_cv_percent: preferNumeric(staticItem.dividend_cv_percent, legacyItem.dividend_cv_percent),
          // Only use string volatility index values (ignore legacy numeric values)
          dividend_volatility_index: typeof staticItem.dividend_volatility_index === 'string' 
            ? staticItem.dividend_volatility_index 
            : (typeof legacyItem.dividend_volatility_index === 'string' ? legacyItem.dividend_volatility_index : null),
          weighted_rank: preferNumeric(staticItem.weighted_rank, legacyItem.weighted_rank),
          tr_drip_3y: preferNumeric(staticItem.tr_drip_3y, legacyItem.tr_drip_3y ?? legacyItem.three_year_annualized),
          tr_drip_12m: preferNumeric(staticItem.tr_drip_12m, legacyItem.tr_drip_12m ?? legacyItem.total_return_12m),
          tr_drip_6m: preferNumeric(staticItem.tr_drip_6m, legacyItem.tr_drip_6m ?? legacyItem.total_return_6m),
          tr_drip_3m: preferNumeric(staticItem.tr_drip_3m, legacyItem.tr_drip_3m ?? legacyItem.total_return_3m),
          tr_drip_1m: preferNumeric(staticItem.tr_drip_1m, legacyItem.tr_drip_1m ?? legacyItem.total_return_1m),
          tr_drip_1w: preferNumeric(staticItem.tr_drip_1w, legacyItem.tr_drip_1w ?? legacyItem.total_return_1w),
          price_return_3y: preferNumeric(staticItem.price_return_3y, legacyItem.price_return_3y),
          price_return_12m: preferNumeric(staticItem.price_return_12m, legacyItem.price_return_12m),
          price_return_6m: preferNumeric(staticItem.price_return_6m, legacyItem.price_return_6m),
          price_return_3m: preferNumeric(staticItem.price_return_3m, legacyItem.price_return_3m),
          price_return_1m: preferNumeric(staticItem.price_return_1m, legacyItem.price_return_1m),
          price_return_1w: preferNumeric(staticItem.price_return_1w, legacyItem.price_return_1w),
          week_52_high: preferNumeric(staticItem.week_52_high, legacyItem.week_52_high),
          week_52_low: preferNumeric(staticItem.week_52_low, legacyItem.week_52_low),
          last_updated: preferValue(staticItem.last_updated, legacyItem.last_updated),
          spreadsheet_updated_at: preferValue(staticItem.updated_at, legacyItem.spreadsheet_updated_at),
          three_year_annualized: preferNumeric(staticItem.tr_drip_3y, legacyItem.three_year_annualized),
          total_return_12m: preferNumeric(staticItem.tr_drip_12m, legacyItem.total_return_12m),
          total_return_6m: preferNumeric(staticItem.tr_drip_6m, legacyItem.total_return_6m),
          total_return_3m: preferNumeric(staticItem.tr_drip_3m, legacyItem.total_return_3m),
          total_return_1m: preferNumeric(staticItem.tr_drip_1m, legacyItem.total_return_1m),
          total_return_1w: preferNumeric(staticItem.tr_drip_1w, legacyItem.total_return_1w),
        };
        mergedMap.set(ticker, merged);
      } else {
        // Only use string volatility index values
        const volatilityIndex = typeof staticItem.dividend_volatility_index === 'string' 
          ? staticItem.dividend_volatility_index : null;
        mergedMap.set(ticker, {
          ...staticItem,
          symbol: staticItem.ticker,
          dividend_volatility_index: volatilityIndex,
        });
      }
    }

    for (const legacyItem of legacyData) {
      const symbol = (legacyItem.symbol || '').toUpperCase();
      if (symbol && !mergedMap.has(symbol)) {
        // Only use string volatility index values
        const volatilityIndex = typeof legacyItem.dividend_volatility_index === 'string' 
          ? legacyItem.dividend_volatility_index : null;
        mergedMap.set(symbol, {
          ...legacyItem,
          ticker: legacyItem.symbol,
          pay_day_text: legacyItem.pay_day,
          dividend_volatility_index: volatilityIndex,
        });
      }
    }

    let mergedArray = Array.from(mergedMap.values()).sort((a, b) => {
      const symbolA = (a.symbol || a.ticker || '').toUpperCase();
      const symbolB = (b.symbol || b.ticker || '').toUpperCase();
      return symbolA.localeCompare(symbolB);
    });

    // For ETFs missing price returns but having total returns, calculate them
    // Only do this for a limited number to avoid performance issues
    const etfsNeedingPriceReturns = mergedArray.filter(etf => {
      const hasTotalReturns = (
        etf.tr_drip_3y != null || etf.tr_drip_12m != null || 
        etf.tr_drip_6m != null || etf.tr_drip_3m != null || 
        etf.tr_drip_1m != null || etf.tr_drip_1w != null
      );
      const missingPriceReturns = (
        !etf.price_return_3y && !etf.price_return_12m && !etf.price_return_6m &&
        !etf.price_return_3m && !etf.price_return_1m && !etf.price_return_1w
      );
      return hasTotalReturns && missingPriceReturns;
    }).slice(0, 10); // Limit to first 10 to avoid performance issues

    // Calculate price returns for ETFs that need them (in parallel, but limited)
    if (etfsNeedingPriceReturns.length > 0) {
      const calculations = etfsNeedingPriceReturns.map(async (etf) => {
        try {
          const ticker = (etf.ticker || etf.symbol || '').toUpperCase();
          if (!ticker) return;
          const metrics = await calculateMetrics(ticker);
          if (metrics.priceReturn) {
            const etfIndex = mergedArray.findIndex(e => 
              (e.ticker || e.symbol || '').toUpperCase() === ticker
            );
            if (etfIndex >= 0) {
              mergedArray[etfIndex].price_return_3y = mergedArray[etfIndex].price_return_3y ?? metrics.priceReturn['3Y'];
              mergedArray[etfIndex].price_return_12m = mergedArray[etfIndex].price_return_12m ?? metrics.priceReturn['1Y'];
              mergedArray[etfIndex].price_return_6m = mergedArray[etfIndex].price_return_6m ?? metrics.priceReturn['6M'];
              mergedArray[etfIndex].price_return_3m = mergedArray[etfIndex].price_return_3m ?? metrics.priceReturn['3M'];
              mergedArray[etfIndex].price_return_1m = mergedArray[etfIndex].price_return_1m ?? metrics.priceReturn['1M'];
              mergedArray[etfIndex].price_return_1w = mergedArray[etfIndex].price_return_1w ?? metrics.priceReturn['1W'];
            }
          }
        } catch (error) {
          logger.warn('Routes', `Failed to calculate price returns: ${(error as Error).message}`);
        }
      });
      await Promise.all(calculations);
    }

    let lastUpdatedTimestamp: string | null = null;
    
    const syncLogResult = await supabase
      .from('data_sync_log')
      .select('updated_at')
      .eq('data_type', 'prices')
      .eq('status', 'success')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (syncLogResult.data?.updated_at) {
      lastUpdatedTimestamp = syncLogResult.data.updated_at;
    } else {
      for (const item of mergedArray) {
        const timestamp = item.last_updated || item.updated_at || item.spreadsheet_updated_at;
        if (timestamp) {
          const ts = new Date(timestamp).getTime();
          if (!lastUpdatedTimestamp || ts > new Date(lastUpdatedTimestamp).getTime()) {
            lastUpdatedTimestamp = timestamp;
          }
        }
      }
    }

    res.json({
      data: mergedArray,
      last_updated: lastUpdatedTimestamp,
      last_updated_timestamp: lastUpdatedTimestamp,
    });
  } catch (error) {
    logger.error('Routes', `Error fetching ETFs: ${(error as Error).message}`);
    res.status(500).json({ error: 'Internal server error' });
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

// ============================================================================
// Excel Export Endpoint
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

    const staticData = staticResult.data || [];
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
      '3 YR Annlzd': etf.tr_drip_3y ? (etf.tr_drip_3y >= 0 ? '+' : '') + etf.tr_drip_3y.toFixed(1) + '%' : null,
      '12 Month': etf.tr_drip_12m ? (etf.tr_drip_12m >= 0 ? '+' : '') + etf.tr_drip_12m.toFixed(1) + '%' : null,
      '6 Month': etf.tr_drip_6m ? (etf.tr_drip_6m >= 0 ? '+' : '') + etf.tr_drip_6m.toFixed(1) + '%' : null,
      '3 Month': etf.tr_drip_3m ? (etf.tr_drip_3m >= 0 ? '+' : '') + etf.tr_drip_3m.toFixed(1) + '%' : null,
      '1 Month': etf.tr_drip_1m ? (etf.tr_drip_1m >= 0 ? '+' : '') + etf.tr_drip_1m.toFixed(1) + '%' : null,
      '1 Week': etf.tr_drip_1w ? (etf.tr_drip_1w >= 0 ? '+' : '') + etf.tr_drip_1w.toFixed(1) + '%' : null,
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

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

export default router;
