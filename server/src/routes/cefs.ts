/**
 * CEF (Closed-End Fund) Data Routes
 * 
 * Provides endpoints for CEF data operations
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';
import { getSupabase } from '../services/database.js';
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '../services/redis.js';
import { logger, parseNumeric } from '../utils/index.js';
import { getDividendHistory, getPriceHistory } from '../services/database.js';
import type { DividendRecord } from '../types/index.js';

const router: Router = Router();

// ============================================================================
// File Upload Configuration
// ============================================================================

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const tempDir = path.join(process.cwd(), 'temp');
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
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  },
});

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
    const normalizedName = name.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
    
    if (headerMap[normalizedName] !== undefined) {
      return headerMap[normalizedName];
    }
    
    if (headerMap[name.toLowerCase()] !== undefined) {
      return headerMap[name.toLowerCase()];
    }
    
    if (headerMap[name] !== undefined) {
      return headerMap[name];
    }
    
    for (const key in headerMap) {
      if (key.includes(normalizedName) || normalizedName.includes(key)) {
        return headerMap[key];
      }
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
    .filter(d => {
      if (!d.div_type) return true;
      const dtype = d.div_type.toLowerCase();
      return dtype.includes('regular') || dtype === 'cash' || dtype === '' || !dtype.includes('special');
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

router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  let filePath: string | null = null;

  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    filePath = req.file.path;
    logger.info('CEF Upload', `Processing CEF data file: ${req.file.originalname}`);

    const workbook = XLSX.readFile(filePath);
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      cleanupFile(filePath);
      res.status(400).json({ error: 'Excel file has no sheets' });
      return;
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(allRows.length, 20); i++) {
      const row = allRows[i];
      if (!Array.isArray(row)) continue;
      const rowStr = row.map(c => String(c || '').toLowerCase().trim().replace(/[^\w\s]/g, ''));
      if (rowStr.some(c => c === 'symbol' || c === 'ticker' || c === 'ticker symbol')) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      cleanupFile(filePath);
      res.status(400).json({ 
        error: 'SYMBOL column not found in header row',
        details: 'Please ensure your spreadsheet has a header row with a SYMBOL or TICKER column'
      });
      return;
    }

    const rawData = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: null }) as Record<string, unknown>[];

    if (!rawData || rawData.length === 0) {
      cleanupFile(filePath);
      res.status(400).json({ error: 'Excel file is empty or has no data rows' });
      return;
    }

    const headers = Object.keys(rawData[0] ?? {});
    const headerMap: Record<string, string> = {};
    headers.forEach(h => {
      if (h) {
        const normalized = String(h).trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
        headerMap[normalized] = h;
        headerMap[String(h).trim().toLowerCase()] = h;
        headerMap[String(h).trim()] = h;
      }
    });

    const symbolCol = findColumn(headerMap, 'symbol', 'ticker', 'ticker symbol');
    if (!symbolCol) {
      cleanupFile(filePath);
      res.status(400).json({ 
        error: 'SYMBOL column not found',
        details: `Available columns: ${headers.join(', ')}. Please ensure your spreadsheet has a column named SYMBOL or TICKER.`
      });
      return;
    }

    const allowedCEFs = ['DNP', 'FOF', 'GOF', 'UTF', 'UTG', 'CSQ', 'PCN', 'GAB', 'FFA', 'BTO', 'IGR', 'BME'];
    
    const supabase = getSupabase();
    const now = new Date().toISOString();
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rawData) {
      const symbolValue = row[symbolCol];
      if (!symbolValue) {
        skipped++;
        continue;
      }

      const ticker = String(symbolValue).trim().toUpperCase();
      if (!allowedCEFs.includes(ticker)) {
        skipped++;
        continue;
      }

      const navSymbolCol = findColumn(headerMap, 'nav symbol', 'nav_symbol', 'navsym', 'navsym symbol');
      const descCol = findColumn(headerMap, 'description', 'desc');
      const openDateCol = findColumn(headerMap, 'open', 'open date', 'opening date');
      const ipoPriceCol = findColumn(headerMap, 'ipo price', 'ipo_price', 'ipo');
      const mpCol = findColumn(headerMap, 'mp', 'market price', 'price', 'marketprice');
      const navCol = findColumn(headerMap, 'nav', 'net asset value', 'nav value');
      const lastDivCol = findColumn(headerMap, 'last div', 'last_dividend', 'last dividend');
      const numPayCol = findColumn(headerMap, '#', 'payments', 'payments_per_year', '# payments');
      const yrlyDivCol = findColumn(headerMap, 'yrly div', 'yearly dividend', 'annual dividend', 'annual_div');
      const fYieldCol = findColumn(headerMap, 'f yield', 'forward yield', 'forward_yield');
      const premDiscCol = findColumn(headerMap, 'prem/disc', 'premium/discount', 'premium_discount');
      const dviCol = findColumn(headerMap, 'dvi');
      const return10YrCol = findColumn(headerMap, '10 yr', '10yr', '10 yr annizd', '10yr annizd');
      const return5YrCol = findColumn(headerMap, '5 yr', '5yr', '5 yr annizd', '5yr annizd');
      const return3YrCol = findColumn(headerMap, '3 yr', '3yr', '3 yr annizd', '3yr annizd');
      const return12MoCol = findColumn(headerMap, '12 month', '12m', '12 mo', '12mo');
      const return6MoCol = findColumn(headerMap, '6 month', '6m', '6 mo', '6mo');
      const return3MoCol = findColumn(headerMap, '3 month', '3m', '3 mo', '3mo');
      const return1MoCol = findColumn(headerMap, '1 month', '1m', '1 mo', '1mo');
      const return1WkCol = findColumn(headerMap, '1 week', '1w', '1 wk', '1wk');

      const navSymbol = navSymbolCol && row[navSymbolCol] ? String(row[navSymbolCol]).trim().toUpperCase() : null;
      const mp = mpCol ? parseNumeric(row[mpCol]) : null;
      const nav = navCol ? parseNumeric(row[navCol]) : null;
      
      let premiumDiscount: number | null = null;
      if (premDiscCol && row[premDiscCol]) {
        premiumDiscount = parseNumeric(row[premDiscCol]);
      } else if (mp && nav) {
        premiumDiscount = ((mp - nav) / nav) * 100;
      }

      const updateData: any = {
        ticker,
        updated_at: now,
      };

      if (navSymbolCol && navSymbol) updateData.nav_symbol = navSymbol;
      if (descCol && row[descCol]) updateData.description = String(row[descCol]).trim();
      if (openDateCol && row[openDateCol]) {
        const openDate = String(row[openDateCol]).trim();
        updateData.open_date = openDate;
      }
      if (ipoPriceCol) updateData.ipo_price = parseNumeric(row[ipoPriceCol]);
      if (mp !== null) updateData.price = mp;
      if (nav !== null) updateData.nav = nav;
      if (premiumDiscount !== null) updateData.premium_discount = premiumDiscount;
      if (lastDivCol) updateData.last_dividend = parseNumeric(row[lastDivCol]);
      if (numPayCol) updateData.payments_per_year = parseNumeric(row[numPayCol]);
      if (yrlyDivCol) updateData.annual_dividend = parseNumeric(row[yrlyDivCol]);
      if (fYieldCol) updateData.forward_yield = parseNumeric(row[fYieldCol]);
      if (dviCol) {
        const dvi = parseNumeric(row[dviCol]);
        if (dvi !== null && dvi !== 0) {
          updateData.dividend_cv_percent = dvi * 100;
        }
      }
      const return10Yr = return10YrCol ? parseNumeric(row[return10YrCol]) : null;
      const return5Yr = return5YrCol ? parseNumeric(row[return5YrCol]) : null;
      const return3Yr = return3YrCol ? parseNumeric(row[return3YrCol]) : null;
      if (return3Yr !== null) updateData.tr_drip_3y = return3Yr;
      if (return12MoCol) updateData.tr_drip_12m = parseNumeric(row[return12MoCol]);
      if (return6MoCol) updateData.tr_drip_6m = parseNumeric(row[return6MoCol]);
      if (return3MoCol) updateData.tr_drip_3m = parseNumeric(row[return3MoCol]);
      if (return1MoCol) updateData.tr_drip_1m = parseNumeric(row[return1MoCol]);
      if (return1WkCol) updateData.tr_drip_1w = parseNumeric(row[return1WkCol]);

      const { data: existing } = await supabase
        .from('etf_static')
        .select('ticker')
        .eq('ticker', ticker)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('etf_static')
          .update(updateData)
          .eq('ticker', ticker);
        
        if (error) {
          logger.error('CEF Upload', `Failed to update ${ticker}: ${error.message}`);
        } else {
          updated++;
        }
      } else {
        updateData.issuer = null;
        updateData.pay_day_text = null;
        const { error } = await supabase
          .from('etf_static')
          .insert(updateData);
        
        if (error) {
          logger.error('CEF Upload', `Failed to insert ${ticker}: ${error.message}`);
        } else {
          added++;
        }
      }

      if (lastDivCol && row[lastDivCol]) {
        const divAmount = parseNumeric(row[lastDivCol]);
        if (divAmount !== null && divAmount > 0) {
          const exDate = new Date().toISOString().split('T')[0];
          await supabase
            .from('dividends_detail')
            .upsert({
              ticker,
              ex_date: exDate,
              div_cash: divAmount,
              is_manual: true,
              pay_date: null,
              record_date: null,
              declare_date: null,
            }, {
              onConflict: 'ticker,ex_date',
              ignoreDuplicates: false,
            });
        }
      }
    }

    cleanupFile(filePath);

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
    logger.error('CEF Upload', `Error: ${(error as Error).message}`);
    res.status(500).json({ error: 'Internal server error', details: (error as Error).message });
  }
});

// ============================================================================
// GET / - List all CEFs
// ============================================================================

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const cacheKey = 'cef_list';
    const cached = await getCached<any>(cacheKey);
    if (cached) {
      logger.info('Routes', `Returning ${cached.cefs?.length || 0} CEFs from Redis cache`);
      res.json(cached);
      return;
    }

    const supabase = getSupabase();

    const staticResult = await supabase
      .from('etf_static')
      .select('*')
      .order('ticker', { ascending: true })
      .limit(10000);

    if (staticResult.error) {
      logger.error('Routes', `Error fetching CEF data: ${staticResult.error.message}`);
      res.status(500).json({ error: 'Failed to fetch CEF data' });
      return;
    }

    const staticData = staticResult.data || [];
    logger.info('Routes', `Fetched ${staticData.length} CEFs from database`);

    const cefsWithDividendHistory = await Promise.all(
      staticData.map(async (cef: any) => {
        let dividendHistory = "0+ 0-";
        try {
          const dividends = await getDividendHistory(cef.ticker);
          dividendHistory = calculateDividendHistory(dividends);
        } catch (error) {
          logger.warn('Routes', `Failed to calculate dividend history for ${cef.ticker}: ${error}`);
        }

        let premiumDiscount: number | null = null;
        if (cef.nav && cef.price) {
          premiumDiscount = ((cef.price - cef.nav) / cef.nav) * 100;
        }

        return {
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
          return10Yr: cef.tr_drip_3y || null,
          return5Yr: cef.tr_drip_3y || null,
          return3Yr: cef.tr_drip_3y || null,
          return12Mo: cef.tr_drip_12m || null,
          return6Mo: cef.tr_drip_6m || null,
          return3Mo: cef.tr_drip_3m || null,
          return1Mo: cef.tr_drip_1m || null,
          return1Wk: cef.tr_drip_1w || null,
          weightedRank: cef.weighted_rank || null,
          week52Low: cef.week_52_low || null,
          week52High: cef.week_52_high || null,
          lastUpdated: cef.last_updated || cef.updated_at,
          dataSource: 'Tiingo',
        };
      })
    );

    let lastUpdatedTimestamp: string | null = null;
    if (staticData.length > 0) {
      const mostRecent = staticData.reduce((latest: any, current: any) => {
        if (!latest || !latest.last_updated) return current;
        if (!current || !current.last_updated) return latest;
        return new Date(current.last_updated) > new Date(latest.last_updated) ? current : latest;
      }, null);
      lastUpdatedTimestamp = mostRecent?.last_updated || mostRecent?.updated_at || null;
    }

    const response = {
      cefs: cefsWithDividendHistory,
      lastUpdated: lastUpdatedTimestamp,
      lastUpdatedTimestamp: lastUpdatedTimestamp,
    };

    await setCached(cacheKey, response, CACHE_TTL.ETF_LIST);
    logger.info('Routes', `Returning ${cefsWithDividendHistory.length} CEFs (cached)`);

    res.json(response);
  } catch (error) {
    logger.error('Routes', `Error fetching CEFs: ${(error as Error).message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /:symbol/price-nav - Get price and NAV data for charting
// MUST come before /:symbol route to avoid route conflict
// ============================================================================

router.get('/:symbol/price-nav', async (req: Request, res: Response): Promise<void> => {
  try {
    const { symbol } = req.params;
    const ticker = symbol.toUpperCase();
    const { period = '1Y' } = req.query;
    
    const supabase = getSupabase();

    const staticResult = await supabase
      .from('etf_static')
      .select('nav_symbol')
      .eq('ticker', ticker)
      .maybeSingle();

    if (!staticResult.data) {
      res.status(404).json({ error: 'CEF not found' });
      return;
    }

    const navSymbol = staticResult.data.nav_symbol;

    const endDate = new Date();
    const startDate = new Date();
    switch (period) {
      case '1Y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      case '3Y':
        startDate.setFullYear(endDate.getFullYear() - 3);
        break;
      case '5Y':
        startDate.setFullYear(endDate.getFullYear() - 5);
        break;
      case '10Y':
        startDate.setFullYear(endDate.getFullYear() - 10);
        break;
      case '20Y':
        startDate.setFullYear(endDate.getFullYear() - 20);
        break;
      default:
        startDate.setFullYear(endDate.getFullYear() - 1);
    }

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const priceData = await getPriceHistory(ticker, startDateStr, endDateStr);

    let navData: any[] = [];
    if (navSymbol) {
      try {
        navData = await getPriceHistory(navSymbol.toUpperCase(), startDateStr, endDateStr);
      } catch (error) {
        logger.warn('Routes', `Failed to fetch NAV data for ${navSymbol}: ${error}`);
      }
    }

    const priceMap = new Map<string, { close: number | null; date: string }>();
    priceData.forEach((p: any) => {
      const date = typeof p.date === 'string' ? p.date.split('T')[0] : p.date;
      const closePrice = p.close ?? p.adj_close ?? null;
      if (closePrice !== null) {
        priceMap.set(date, { close: closePrice, date });
      }
    });

    const navMap = new Map<string, { close: number | null; date: string }>();
    navData.forEach((p: any) => {
      const date = typeof p.date === 'string' ? p.date.split('T')[0] : p.date;
      const closePrice = p.close ?? p.adj_close ?? null;
      if (closePrice !== null) {
        navMap.set(date, { close: closePrice, date });
      }
    });

    const allDates = new Set([...priceMap.keys(), ...navMap.keys()]);
    const combinedData = Array.from(allDates)
      .sort()
      .map(date => ({
        date,
        price: priceMap.get(date)?.close || null,
        nav: navMap.get(date)?.close || null,
      }))
      .filter(d => d.price !== null || d.nav !== null);

    res.json({
      symbol: ticker,
      navSymbol: navSymbol || null,
      period,
      data: combinedData,
    });
  } catch (error) {
    logger.error('Routes', `Error fetching price/NAV data for ${req.params.symbol}: ${(error as Error).message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /:symbol - Get single CEF
// ============================================================================

router.get('/:symbol', async (req: Request, res: Response): Promise<void> => {
  try {
    const { symbol } = req.params;
    const ticker = symbol.toUpperCase();
    const supabase = getSupabase();

    const staticResult = await supabase
      .from('etf_static')
      .select('*')
      .eq('ticker', ticker)
      .maybeSingle();

    if (!staticResult.data) {
      res.status(404).json({ error: 'CEF not found' });
      return;
    }

    const cef = staticResult.data;

    let dividendHistory = "0+ 0-";
    try {
      const dividends = await getDividendHistory(ticker);
      dividendHistory = calculateDividendHistory(dividends);
    } catch (error) {
      logger.warn('Routes', `Failed to calculate dividend history for ${ticker}: ${error}`);
    }

    let premiumDiscount: number | null = null;
    if (cef.nav && cef.price) {
      premiumDiscount = ((cef.price - cef.nav) / cef.nav) * 100;
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
      return10Yr: cef.tr_drip_3y || null,
      return5Yr: cef.tr_drip_3y || null,
      return3Yr: cef.tr_drip_3y || null,
      return12Mo: cef.tr_drip_12m || null,
      return6Mo: cef.tr_drip_6m || null,
      return3Mo: cef.tr_drip_3m || null,
      return1Mo: cef.tr_drip_1m || null,
      return1Wk: cef.tr_drip_1w || null,
      weightedRank: cef.weighted_rank || null,
      week52Low: cef.week_52_low || null,
      week52High: cef.week_52_high || null,
      lastUpdated: cef.last_updated || cef.updated_at,
      dataSource: 'Tiingo',
    };

    res.json(response);
  } catch (error) {
    logger.error('Routes', `Error fetching CEF: ${(error as Error).message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
