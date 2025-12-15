import { getSupabase } from '../src/services/database.js';
import { logger } from '../src/utils/index.js';
import fs from 'fs';
import path from 'path';

async function exportSimpleDVI() {
  logger.info('DVI Export', 'Exporting Symbol and DVI to spreadsheet...\n');
  
  const supabase = getSupabase();
  
  const { data: etfs, error } = await supabase
    .from('etf_static')
    .select('ticker, dividend_cv_percent')
    .order('ticker');
  
  if (error || !etfs) {
    logger.error('DVI Export', `Failed to fetch ETFs: ${error?.message}`);
    process.exit(1);
  }
  
  const csvRows: string[] = [];
  csvRows.push('Symbol,DVI (%)');
  
  etfs
    .sort((a, b) => {
      if (a.dividend_cv_percent == null && b.dividend_cv_percent == null) return 0;
      if (a.dividend_cv_percent == null) return 1;
      if (b.dividend_cv_percent == null) return -1;
      return a.dividend_cv_percent - b.dividend_cv_percent;
    })
    .forEach(etf => {
      const dvi = etf.dividend_cv_percent != null ? etf.dividend_cv_percent.toFixed(2) : 'N/A';
      csvRows.push(`${etf.ticker},${dvi}`);
    });
  
  const csvContent = csvRows.join('\n');
  const outputPath = path.join(process.cwd(), 'symbol_dvi.csv');
  fs.writeFileSync(outputPath, csvContent);
  
  logger.info('DVI Export', `✅ Spreadsheet generated: ${outputPath}`);
  logger.info('DVI Export', `Total ETFs: ${etfs.length}`);
  logger.info('DVI Export', `ETFs with DVI: ${etfs.filter(e => e.dividend_cv_percent != null).length}`);
}

exportSimpleDVI().catch(console.error);




