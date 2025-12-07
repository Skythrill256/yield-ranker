import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function addScaledAmountColumn() {
  console.log('============================================');
  console.log('Adding scaled_amount Column to Database');
  console.log('============================================\n');

  console.log('Checking if column exists...');
  
  const sql = `
    ALTER TABLE public.dividends_detail
    ADD COLUMN IF NOT EXISTS scaled_amount DECIMAL(12, 6);
  `;

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.log('\n⚠️  Cannot run migration automatically via API.');
      console.log('\nPlease run this SQL manually in your Supabase SQL Editor:');
      console.log('\n' + sql);
      console.log('\nSteps:');
      console.log('1. Go to Supabase Dashboard → SQL Editor');
      console.log('2. Paste the SQL above');
      console.log('3. Click Run');
      console.log('\nThen re-run: npx tsx scripts/daily_update.ts');
      process.exit(1);
    }

    console.log('✅ Column added successfully!');
    console.log('\nYou can now run: npx tsx scripts/daily_update.ts');
  } catch (err: any) {
    console.error('\n❌ Error:', err.message);
    console.log('\n⚠️  Please run this SQL manually in your Supabase SQL Editor:');
    console.log('\n' + sql);
    console.log('\nSteps:');
    console.log('1. Go to Supabase Dashboard → SQL Editor');
    console.log('2. Paste the SQL above');
    console.log('3. Click Run');
    process.exit(1);
  }
}

addScaledAmountColumn();

