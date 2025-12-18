import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkColumns() {
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'dividends_detail' });
    if (error) {
        // If RPC doesn't exist, try a simple select
        console.log('RPC get_table_columns failed, trying simple select * limit 1');
        const { data: selectData, error: selectError } = await supabase
            .from('dividends_detail')
            .select('*')
            .limit(1);

        if (selectError) {
            console.error('Select error:', selectError);
        } else {
            console.log('Columns found:', Object.keys(selectData?.[0] || {}));
        }
    } else {
        console.log('Columns:', data);
    }
}

checkColumns();
