import express from 'express';
import cors from 'cors';
import multer from 'multer';
import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

function parseExcelValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    value = value.trim();
    if (value === 'N/A' || value === '#N/A' || value === '#DIV/0!' || value.startsWith('#')) {
      return null;
    }
    if (value.includes('%')) {
      const num = parseFloat(value.replace('%', '').replace(/,/g, ''));
      return isNaN(num) ? null : num;
    }
    const num = parseFloat(value.replace(/,/g, '').replace(/\$/g, ''));
    return isNaN(num) ? value : num;
  }
  if (typeof value === 'number') {
    return value;
  }
  return value;
}

app.post('/api/admin/upload-dtr', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = 'Sheet1';
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return res.status(400).json({ error: 'Sheet1 not found in the Excel file' });
    }

    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    if (data.length < 2) {
      return res.status(400).json({ error: 'No data rows found' });
    }

    const headers = data[0];
    const rows = data.slice(1);

    const symbolIndex = headers.indexOf('SYMBOL');
    const issuerIndex = headers.indexOf('Issuer');
    const descIndex = headers.indexOf('DESC');
    const payDayIndex = headers.indexOf('Pay Day');
    const ipoPriceIndex = headers.indexOf('IPO PRICE');
    const priceIndex = headers.indexOf('Price');
    const priceChangeIndex = headers.indexOf('Price Change');
    const dividendIndex = headers.indexOf('Dividend');
    const pmtsIndex = headers.indexOf('# Pmts');
    const annualDivIndex = headers.indexOf('Annual Div');
    const forwardYieldIndex = headers.indexOf('Forward Yield');
    const divVolatilityIndex = headers.indexOf('Dividend Volatility Index');
    const weightedRankIndex = headers.indexOf('Weighted Rank');
    const threeYrIndex = headers.indexOf('3 YR Annlzd');
    const twelveMonthIndex = headers.indexOf('12 Month');
    const sixMonthIndex = headers.indexOf('6 Month');
    const threeMonthIndex = headers.indexOf('3 Month');
    const oneMonthIndex = headers.indexOf('1 Month');
    const oneWeekIndex = headers.indexOf('1 Week');
    

    if (symbolIndex === -1) {
      return res.status(400).json({ error: 'SYMBOL column not found' });
    }

    const etfsToUpsert = [];

    for (const row of rows) {
      const symbol = row[symbolIndex];
      if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
        continue;
      }

      const price = parseExcelValue(row[priceIndex]);
      const annualDiv = parseExcelValue(row[annualDivIndex]);
      
      let forwardYield = parseExcelValue(row[forwardYieldIndex]);
      if (price && price > 0 && annualDiv !== null && forwardYield === null) {
        forwardYield = (annualDiv / price) * 100;
      }

      const etfData = {
        symbol: symbol.trim().toUpperCase(),
        issuer: issuerIndex !== -1 ? (row[issuerIndex] || null) : null,
        description: descIndex !== -1 ? (row[descIndex] || null) : null,
        pay_day: payDayIndex !== -1 ? (row[payDayIndex] ? String(row[payDayIndex]) : null) : null,
        ipo_price: ipoPriceIndex !== -1 ? parseExcelValue(row[ipoPriceIndex]) : null,
        price: price,
        price_change: priceChangeIndex !== -1 ? parseExcelValue(row[priceChangeIndex]) : null,
        dividend: dividendIndex !== -1 ? parseExcelValue(row[dividendIndex]) : null,
        payments_per_year: pmtsIndex !== -1 ? parseExcelValue(row[pmtsIndex]) : null,
        annual_div: annualDiv,
        forward_yield: forwardYield,
        dividend_volatility_index: divVolatilityIndex !== -1 ? parseExcelValue(row[divVolatilityIndex]) : null,
        weighted_rank: weightedRankIndex !== -1 ? parseExcelValue(row[weightedRankIndex]) : null,
        three_year_annualized: threeYrIndex !== -1 ? parseExcelValue(row[threeYrIndex]) : null,
        total_return_12m: twelveMonthIndex !== -1 ? parseExcelValue(row[twelveMonthIndex]) : null,
        total_return_6m: sixMonthIndex !== -1 ? parseExcelValue(row[sixMonthIndex]) : null,
        total_return_3m: threeMonthIndex !== -1 ? parseExcelValue(row[threeMonthIndex]) : null,
        total_return_1m: oneMonthIndex !== -1 ? parseExcelValue(row[oneMonthIndex]) : null,
        total_return_1w: oneWeekIndex !== -1 ? parseExcelValue(row[oneWeekIndex]) : null,
        favorites: false,
        spreadsheet_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      etfsToUpsert.push(etfData);
    }

    if (etfsToUpsert.length === 0) {
      return res.status(400).json({ error: 'No valid ETF data found' });
    }

    const { data: upsertedData, error: upsertError } = await supabase
      .from('etfs')
      .upsert(etfsToUpsert, { onConflict: 'symbol' });

    if (upsertError) {
      console.error('Supabase upsert error:', upsertError);
      return res.status(500).json({ error: 'Failed to upsert ETF data', details: upsertError.message });
    }

    res.json({
      success: true,
      message: `Successfully processed ${etfsToUpsert.length} ETFs`,
      count: etfsToUpsert.length
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process file', details: error.message });
  }
});

app.get('/api/etfs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('etfs')
      .select('*')
      .order('symbol', { ascending: true });

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ error: 'Failed to fetch ETFs', details: error.message });
    }

    res.json({ data: data || [] });
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch ETFs', details: error.message });
  }
});

app.get('/api/etfs/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { data, error } = await supabase
      .from('etfs')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'ETF not found' });
      }
      console.error('Supabase query error:', error);
      return res.status(500).json({ error: 'Failed to fetch ETF', details: error.message });
    }

    res.json({ data });
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch ETF', details: error.message });
  }
});

app.get('/api/yahoo-finance/returns', async (req, res) => {
  const { symbol } = req.query;
  
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  try {
    const yahooFinance = await import('yahoo-finance2').then(m => m.default);
    
    const quote = await yahooFinance.quote(symbol);
    const currentPrice = quote.regularMarketPrice || null;
    const priceChange = quote.regularMarketChange || null;
    
    const now = Math.floor(Date.now() / 1000);
    const oneWeekAgo = now - (7 * 24 * 60 * 60);
    const oneMonthAgo = now - (30 * 24 * 60 * 60);
    const threeMonthsAgo = now - (90 * 24 * 60 * 60);
    const sixMonthsAgo = now - (180 * 24 * 60 * 60);
    const oneYearAgo = now - (365 * 24 * 60 * 60);
    const threeYearsAgo = now - (3 * 365 * 24 * 60 * 60);

    const historical = await yahooFinance.historical(symbol, {
      period1: new Date(threeYearsAgo * 1000),
      period2: new Date(now * 1000),
      interval: '1d'
    });

    function findClosestPrice(targetTimestamp) {
      if (!historical || historical.length === 0) return null;
      
      let closest = historical[0];
      let minDiff = Math.abs(Math.floor(historical[0].date.getTime() / 1000) - targetTimestamp);
      
      for (const point of historical) {
        const diff = Math.abs(Math.floor(point.date.getTime() / 1000) - targetTimestamp);
        if (diff < minDiff) {
          minDiff = diff;
          closest = point;
        }
      }
      
      return closest.close;
    }

    function calculateReturn(oldPrice, newPrice) {
      if (!oldPrice || !newPrice || oldPrice <= 0) return null;
      return ((newPrice - oldPrice) / oldPrice) * 100;
    }

    const price1WkAgo = findClosestPrice(oneWeekAgo);
    const price1MoAgo = findClosestPrice(oneMonthAgo);
    const price3MoAgo = findClosestPrice(threeMonthsAgo);
    const price6MoAgo = findClosestPrice(sixMonthsAgo);
    const price12MoAgo = findClosestPrice(oneYearAgo);
    const price3YrAgo = findClosestPrice(threeYearsAgo);

    res.json({
      symbol,
      currentPrice,
      priceChange,
      priceReturn1Wk: calculateReturn(price1WkAgo, currentPrice),
      priceReturn1Mo: calculateReturn(price1MoAgo, currentPrice),
      priceReturn3Mo: calculateReturn(price3MoAgo, currentPrice),
      priceReturn6Mo: calculateReturn(price6MoAgo, currentPrice),
      priceReturn12Mo: calculateReturn(price12MoAgo, currentPrice),
      priceReturn3Yr: calculateReturn(price3YrAgo, currentPrice),
      totalReturn1Wk: calculateReturn(price1WkAgo, currentPrice),
      totalReturn1Mo: calculateReturn(price1MoAgo, currentPrice),
      totalReturn3Mo: calculateReturn(price3MoAgo, currentPrice),
      totalReturn6Mo: calculateReturn(price6MoAgo, currentPrice),
      totalReturn12Mo: calculateReturn(price12MoAgo, currentPrice),
      totalReturn3Yr: calculateReturn(price3YrAgo, currentPrice),
    });
  } catch (error) {
    console.error(`Error fetching Yahoo Finance data for ${symbol}:`, error);
    res.status(500).json({ error: 'Failed to fetch Yahoo Finance data' });
  }
});

app.get('/api/yahoo-finance/dividends', async (req, res) => {
  const { symbol } = req.query;
  
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  try {
    const yahooFinance = await import('yahoo-finance2').then(m => m.default);
    
    const fiveYearsAgo = Math.floor(Date.now() / 1000) - (5 * 365 * 24 * 60 * 60);
    const now = Math.floor(Date.now() / 1000);
    
    const events = await yahooFinance.historical(symbol, {
      period1: new Date(fiveYearsAgo * 1000),
      period2: new Date(now * 1000),
      events: 'dividends'
    });

    const dividends = (events || [])
      .filter(e => e.dividends !== undefined)
      .map(e => ({
        date: e.date.toISOString().split('T')[0],
        amount: e.dividends
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({
      symbol,
      dividends
    });
  } catch (error) {
    console.error(`Error fetching dividend history for ${symbol}:`, error);
    res.status(500).json({ error: 'Failed to fetch dividend history' });
  }
});

app.get('/api/yahoo-finance/etf', async (req, res) => {
  const { symbol } = req.query;
  
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  try {
    const yahooFinance = await import('yahoo-finance2').then(m => m.default);
    
    const threeYearsAgo = Math.floor(Date.now() / 1000) - (3 * 365 * 24 * 60 * 60);
    const now = Math.floor(Date.now() / 1000);
    
    const historical = await yahooFinance.historical(symbol, {
      period1: new Date(threeYearsAgo * 1000),
      period2: new Date(now * 1000),
      interval: '1d'
    });

    const data = (historical || []).map(point => ({
      timestamp: Math.floor(point.date.getTime() / 1000),
      close: point.close,
      high: point.high,
      low: point.low,
      open: point.open,
      volume: point.volume
    }));

    res.json({
      symbol,
      data
    });
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

