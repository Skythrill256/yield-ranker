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
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const supabase = getSupabase();
    
    // Try etf_static first (new table), fallback to etfs (legacy)
    let { data, error } = await supabase
      .from('etf_static')
      .select('*')
      .order('ticker', { ascending: true });

    // If etf_static doesn't exist or is empty, fallback to legacy etfs table
    if (error || !data || data.length === 0) {
      const legacyResult = await supabase
        .from('etfs')
        .select('*')
        .order('symbol', { ascending: true });
      
      if (!legacyResult.error && legacyResult.data) {
        data = legacyResult.data;
        error = null;
      }
    }

    if (error) {
      res.status(500).json({ error: 'Failed to fetch ETFs' });
      return;
    }

    // Transform etf_static data to match expected format if needed
    const transformedData = data?.map((item: any) => {
      // If from etf_static, ensure symbol field exists (map from ticker)
      if (item.ticker && !item.symbol) {
        return { ...item, symbol: item.ticker };
      }
      return item;
    });

    res.json(transformedData ?? []);
  } catch (error) {
    logger.error('Routes', `Error fetching ETFs: ${(error as Error).message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /:symbol - Get single ETF
 */
router.get('/:symbol', async (req: Request, res: Response): Promise<void> => {
  try {
    const { symbol } = req.params;
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('etfs')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'ETF not found' });
      return;
    }

    res.json(data);
  } catch (error) {
    logger.error('Routes', `Error fetching ETF: ${(error as Error).message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
