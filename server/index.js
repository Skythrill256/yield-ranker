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
    
    const priceReturn3YrIndex = headers.findIndex(h => 
      h && (h.includes('3 Yr') || h.includes('3 YR')) && 
      (h.toLowerCase().includes('price') || h.includes('PRICE'))
    );
    const priceReturn12MoIndex = headers.findIndex(h => 
      h && (h.includes('12') || h.toLowerCase().includes('twelve')) && 
      h.toLowerCase().includes('price') && 
      (h.toLowerCase().includes('month') || h.toLowerCase().includes('mo'))
    );
    const priceReturn6MoIndex = headers.findIndex(h => 
      h && h.includes('6') && 
      h.toLowerCase().includes('price') && 
      h.toLowerCase().includes('month')
    );
    const priceReturn3MoIndex = headers.findIndex(h => 
      h && h.includes('3') && 
      h.toLowerCase().includes('price') && 
      h.toLowerCase().includes('month')
    );
    const priceReturn1MoIndex = headers.findIndex(h => 
      h && h.includes('1') && 
      h.toLowerCase().includes('price') && 
      h.toLowerCase().includes('month')
    );
    const priceReturn1WkIndex = headers.findIndex(h => 
      h && h.includes('1') && 
      h.toLowerCase().includes('price') && 
      (h.toLowerCase().includes('week') || h.toLowerCase().includes('wk'))
    );

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
        price_return_3y: priceReturn3YrIndex !== -1 ? parseExcelValue(row[priceReturn3YrIndex]) : null,
        price_return_12m: priceReturn12MoIndex !== -1 ? parseExcelValue(row[priceReturn12MoIndex]) : null,
        price_return_6m: priceReturn6MoIndex !== -1 ? parseExcelValue(row[priceReturn6MoIndex]) : null,
        price_return_3m: priceReturn3MoIndex !== -1 ? parseExcelValue(row[priceReturn3MoIndex]) : null,
        price_return_1m: priceReturn1MoIndex !== -1 ? parseExcelValue(row[priceReturn1MoIndex]) : null,
        price_return_1w: priceReturn1WkIndex !== -1 ? parseExcelValue(row[priceReturn1WkIndex]) : null,
        favorites: false,
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

