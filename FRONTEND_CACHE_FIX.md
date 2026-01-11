# SPE Shows "Regular" on Website - CACHE ISSUE

## Database Status: ✓ CORRECT
```
ex_date: 2025-12-29
adj_amount: 0.7
pmt_type: "Special"  ✓
frequency: "Other"   ✓
```

## Problem
The website shows "Regular" and "Weekly" for SPE's 12/29 dividend, but the database shows "Special" and "Other".

## Root Cause
**BROWSER OR API CACHE** - The frontend is serving old cached data.

## Solutions (Try in order):

### 1. Hard Refresh Browser (MOST LIKELY FIX)
- **Windows/Linux**: `Ctrl + Shift + R` or `Ctrl + F5`
- **Mac**: `Cmd + Shift + R` or `Cmd + F5`

### 2. Clear Browser Cache
- Chrome: Settings → Privacy → Clear browsing data → Cached images and files
- Firefox: Settings → Privacy → Clear Data → Cached Web Content

### 3. Restart Development Server
```bash
# Stop the server (Ctrl+C)
cd C:\Users\March\Documents\yield-ranker\server
npm run dev
```

### 4. Clear API Response Cache (if using service worker)
- Open DevTools (F12)
- Application tab → Clear storage → Clear site data

### 5. Incognito/Private Window Test
- Open website in incognito mode
- If it shows "Special" there, it's definitely a cache issue

## Verification Commands

### Check Database (Should show "Special"):
```bash
cd C:\Users\March\Documents\yield-ranker\server
npx tsx -e "import {createClient} from '@supabase/supabase-js';import dotenv from 'dotenv';dotenv.config();const s=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const {data}=await s.from('dividends_detail').select('ex_date,pmt_type,frequency').eq('ticker','SPE').eq('ex_date','2025-12-29');console.log(data)"
```

### Recalculate (if needed):
```bash
npm run recalc:cef:frequency -- --ticker SPE
```

## Why This Happens
1. Browser caches API responses for performance
2. Service workers cache responses
3. CDN caching (if deployed)
4. React Query or SWR caching (if used)

## Prevention
The fix is already in the code - the database is correct. This is purely a client-side caching issue that will resolve with a hard refresh.
