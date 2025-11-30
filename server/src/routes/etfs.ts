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
      .order('ticker', { ascending: true });

    const legacyResult = await supabase
      .from('etfs')
      .select('*')
      .order('symbol', { ascending: true });

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
      const numA = typeof a === 'number' ? a : (a != null ? parseFloat(a) : null);
      const numB = typeof b === 'number' ? b : (b != null ? parseFloat(b) : null);
      if (numA != null && !isNaN(numA) && numA !== 0) return numA;
      if (numB != null && !isNaN(numB) && numB !== 0) return numB;
      return a ?? b;
    };

    const mergedMap = new Map<string, any>();

    for (const item of staticData) {
      const ticker = (item.ticker || '').toUpperCase();
      if (ticker) {
        mergedMap.set(ticker, {
          ...item,
          symbol: item.ticker,
        });
      }
    }

    for (const item of legacyData) {
      const symbol = (item.symbol || '').toUpperCase();
      if (symbol) {
        const existing = mergedMap.get(symbol);
        if (existing) {
          mergedMap.set(symbol, {
            ...existing,
            price: preferNumeric(item.price, existing.price),
            price_change: preferNumeric(item.price_change, existing.price_change),
            price_change_pct: preferNumeric(item.price_change_pct, existing.price_change_pct),
            dividend: preferNumeric(item.dividend, existing.last_dividend),
            last_dividend: preferNumeric(item.dividend, existing.last_dividend),
            annual_div: preferNumeric(item.annual_div, existing.annual_dividend),
            annual_dividend: preferNumeric(item.annual_dividend ?? item.annual_div, existing.annual_dividend),
            forward_yield: preferNumeric(item.forward_yield, existing.forward_yield),
            dividend_sd: preferNumeric(item.dividend_sd, existing.dividend_sd),
            dividend_cv: preferNumeric(item.dividend_cv, existing.dividend_cv),
            dividend_cv_percent: preferNumeric(item.dividend_cv_percent, existing.dividend_cv_percent),
            dividend_volatility_index: preferValue(item.dividend_volatility_index, existing.dividend_volatility_index),
            weighted_rank: preferNumeric(item.weighted_rank, existing.weighted_rank),
            tr_drip_3y: preferNumeric(item.tr_drip_3y ?? item.three_year_annualized, existing.tr_drip_3y),
            tr_drip_12m: preferNumeric(item.tr_drip_12m ?? item.total_return_12m, existing.tr_drip_12m),
            tr_drip_6m: preferNumeric(item.tr_drip_6m ?? item.total_return_6m, existing.tr_drip_6m),
            tr_drip_3m: preferNumeric(item.tr_drip_3m ?? item.total_return_3m, existing.tr_drip_3m),
            tr_drip_1m: preferNumeric(item.tr_drip_1m ?? item.total_return_1m, existing.tr_drip_1m),
            tr_drip_1w: preferNumeric(item.tr_drip_1w ?? item.total_return_1w, existing.tr_drip_1w),
            price_return_3y: preferNumeric(item.price_return_3y, existing.price_return_3y),
            price_return_12m: preferNumeric(item.price_return_12m, existing.price_return_12m),
            price_return_6m: preferNumeric(item.price_return_6m, existing.price_return_6m),
            price_return_3m: preferNumeric(item.price_return_3m, existing.price_return_3m),
            price_return_1m: preferNumeric(item.price_return_1m, existing.price_return_1m),
            price_return_1w: preferNumeric(item.price_return_1w, existing.price_return_1w),
            week_52_high: preferNumeric(item.week_52_high, existing.week_52_high),
            week_52_low: preferNumeric(item.week_52_low, existing.week_52_low),
            last_updated: preferValue(item.last_updated, existing.last_updated),
            spreadsheet_updated_at: preferValue(item.spreadsheet_updated_at, existing.updated_at),
          });
        } else {
          mergedMap.set(symbol, {
            ...item,
            ticker: item.symbol,
            pay_day_text: item.pay_day,
          });
        }
      }
    }

    const mergedArray = Array.from(mergedMap.values()).sort((a, b) => {
      const symbolA = (a.symbol || a.ticker || '').toUpperCase();
      const symbolB = (b.symbol || b.ticker || '').toUpperCase();
      return symbolA.localeCompare(symbolB);
    });

    res.json(mergedArray);
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
      const numA = typeof a === 'number' ? a : (a != null ? parseFloat(a) : null);
      const numB = typeof b === 'number' ? b : (b != null ? parseFloat(b) : null);
      if (numA != null && !isNaN(numA) && numA !== 0) return numA;
      if (numB != null && !isNaN(numB) && numB !== 0) return numB;
      return a ?? b;
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
        ...staticData,
        symbol: staticData.ticker,
        price: preferNumeric(legacyData.price, staticData.price),
        price_change: preferNumeric(legacyData.price_change, staticData.price_change),
        price_change_pct: preferNumeric(legacyData.price_change_pct, staticData.price_change_pct),
        dividend: preferNumeric(legacyData.dividend, staticData.last_dividend),
        last_dividend: preferNumeric(legacyData.dividend, staticData.last_dividend),
        annual_div: preferNumeric(legacyData.annual_div, staticData.annual_dividend),
        annual_dividend: preferNumeric(legacyData.annual_dividend ?? legacyData.annual_div, staticData.annual_dividend),
        forward_yield: preferNumeric(legacyData.forward_yield, staticData.forward_yield),
        dividend_sd: preferNumeric(legacyData.dividend_sd, staticData.dividend_sd),
        dividend_cv: preferNumeric(legacyData.dividend_cv, staticData.dividend_cv),
        dividend_cv_percent: preferNumeric(legacyData.dividend_cv_percent, staticData.dividend_cv_percent),
        dividend_volatility_index: preferValue(legacyData.dividend_volatility_index, staticData.dividend_volatility_index),
        weighted_rank: preferNumeric(legacyData.weighted_rank, staticData.weighted_rank),
        tr_drip_3y: preferNumeric(legacyData.tr_drip_3y ?? legacyData.three_year_annualized, staticData.tr_drip_3y),
        tr_drip_12m: preferNumeric(legacyData.tr_drip_12m ?? legacyData.total_return_12m, staticData.tr_drip_12m),
        tr_drip_6m: preferNumeric(legacyData.tr_drip_6m ?? legacyData.total_return_6m, staticData.tr_drip_6m),
        tr_drip_3m: preferNumeric(legacyData.tr_drip_3m ?? legacyData.total_return_3m, staticData.tr_drip_3m),
        tr_drip_1m: preferNumeric(legacyData.tr_drip_1m ?? legacyData.total_return_1m, staticData.tr_drip_1m),
        tr_drip_1w: preferNumeric(legacyData.tr_drip_1w ?? legacyData.total_return_1w, staticData.tr_drip_1w),
        price_return_3y: preferNumeric(legacyData.price_return_3y, staticData.price_return_3y),
        price_return_12m: preferNumeric(legacyData.price_return_12m, staticData.price_return_12m),
        price_return_6m: preferNumeric(legacyData.price_return_6m, staticData.price_return_6m),
        price_return_3m: preferNumeric(legacyData.price_return_3m, staticData.price_return_3m),
        price_return_1m: preferNumeric(legacyData.price_return_1m, staticData.price_return_1m),
        price_return_1w: preferNumeric(legacyData.price_return_1w, staticData.price_return_1w),
        week_52_high: preferNumeric(legacyData.week_52_high, staticData.week_52_high),
        week_52_low: preferNumeric(legacyData.week_52_low, staticData.week_52_low),
        last_updated: preferValue(legacyData.last_updated, staticData.last_updated),
        spreadsheet_updated_at: preferValue(legacyData.spreadsheet_updated_at, staticData.updated_at),
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

    res.json(merged);
  } catch (error) {
    logger.error('Routes', `Error fetching ETF: ${(error as Error).message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
