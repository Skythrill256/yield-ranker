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

const router = Router();

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
          dividend_volatility_index: preferValue(staticItem.dividend_volatility_index, legacyItem.dividend_volatility_index),
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
        mergedMap.set(ticker, {
          ...staticItem,
          symbol: staticItem.ticker,
        });
      }
    }

    for (const legacyItem of legacyData) {
      const symbol = (legacyItem.symbol || '').toUpperCase();
      if (symbol && !mergedMap.has(symbol)) {
        mergedMap.set(symbol, {
          ...legacyItem,
          ticker: legacyItem.symbol,
          pay_day_text: legacyItem.pay_day,
        });
      }
    }

    const mergedArray = Array.from(mergedMap.values()).sort((a, b) => {
      const symbolA = (a.symbol || a.ticker || '').toUpperCase();
      const symbolB = (b.symbol || b.ticker || '').toUpperCase();
      return symbolA.localeCompare(symbolB);
    });

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
        dividend_volatility_index: preferValue(staticData.dividend_volatility_index, legacyData.dividend_volatility_index),
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

export default router;
