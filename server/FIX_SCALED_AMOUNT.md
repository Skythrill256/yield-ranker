# Fix: scaled_amount Column Missing

## Quick Answers:

### 1. Do you need to push to repo after running daily_update.ts?
**NO** - The script updates your **database**, not code files. Frontend automatically reads from database. No code push needed.

### 2. Why are dividends showing as 0?
- **Error preventing saves**: Missing `scaled_amount` column is blocking dividend saves
- **No new dividends**: Script only checks last 30 days. If no new dividends in that period, shows 0 (normal)
- **Weekend**: Market is closed, so no new data anyway

## Fix: Add Database Column

Run this SQL in your **Supabase SQL Editor**:

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Paste and run:

```sql
ALTER TABLE public.dividends_detail
ADD COLUMN IF NOT EXISTS scaled_amount DECIMAL(12, 6);
```

3. After running SQL, re-run:
```bash
npx tsx scripts/daily_update.ts
```

## After Fix:

✅ Dividends will save correctly  
✅ Scaled amounts will be calculated  
✅ Frontend automatically shows scaled dividends (no code push needed)

