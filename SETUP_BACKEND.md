# Backend Setup - Step by Step

## Your Questions Answered

### Q: Does Excel upload work?
**A: YES!** The backend is ready. You just need to:
1. Install dependencies (`npm install` in server folder)
2. Add Supabase credentials to `.env` file
3. Start the server (`npm start`)
4. Upload your Excel file in Admin Panel

### Q: Is data from spreadsheet working?
**A: YES!** All these fields come from YOUR spreadsheet:
- ✅ Price
- ✅ Price Change  
- ✅ Dividend
- ✅ Annual Dividend
- ✅ Forward Yield (calculated as Annual Div / Price)
- ✅ All Total Returns (1W, 1M, 3M, 6M, 12M, 3Y)
- ✅ Weighted Rank (your custom rank)
- ✅ Issuer, Description, Pay Day
- ✅ Dividend Volatility Index

### Q: What about Yahoo Finance?
**A:** Yahoo Finance is ONLY used for:
- Live price charts (historical) - when user clicks "Live Price Chart" tab
- Dividend history charts - when user clicks to view history
- Everything else comes from YOUR spreadsheet!

## Quick Setup (5 minutes)

### 1. Get Supabase Credentials

Go to: https://supabase.com/dashboard

1. Select your project
2. Click Settings (gear icon) → API
3. Copy these two values:
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **service_role key** (the secret one, NOT anon public)

### 2. Create Backend .env File

In `yield-ranker/server/` folder, create file named `.env`:

```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
PORT=4000
```

**Replace** with your actual values from step 1!

### 3. Create Database Table

In Supabase dashboard:
1. Go to SQL Editor
2. Click "New Query"
3. Copy ENTIRE contents of `SUPABASE_ETF_TABLE.sql`
4. Paste into query editor
5. Click "Run"

You should see "Success. No rows returned"

### 4. Install Backend

```powershell
cd yield-ranker/server
npm install
```

### 5. Start Backend

```powershell
npm start
```

You should see: `Server running on port 4000`

**Leave this running!**

### 6. Update Frontend Config

In `yield-ranker/.env.local`:

```
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 7. Restart Frontend

Stop frontend (Ctrl+C) and restart:

```powershell
cd yield-ranker
npm run dev
```

### 8. Upload Your Excel

1. Open browser → http://localhost:8081
2. Login as admin
3. Go to Admin Panel
4. Click "ETF Data Management" tab
5. Click "Select Excel File"
6. Choose your DTR Excel file (e.g., `DTR 11-16-25.xlsx`)
7. Click "Upload & Process"

**Done!** Your data is now live.

## Expected Excel Format

Your Excel file should have:
- **Sheet Name:** Sheet1
- **Row 1:** Headers (exactly these names)
- **Row 2+:** Data rows

### Required Headers (Row 1):

```
Favorites | SYMBOL | Issuer | DESC | Pay Day | IPO PRICE | Price | Price Change | Dividend | # Pmts | Annual Div | Forward Yield | Dividend Volatility Index | Weighted Rank | 3 YR Annlzd | 12 Month | 6 Month | 3 Month | 1 Month | 1 Week
```

## What Each Field Does

| Field | Source | Notes |
|-------|--------|-------|
| SYMBOL | Required | Unique identifier |
| Issuer | Spreadsheet | Shows in table |
| DESC | Spreadsheet | ETF description |
| Pay Day | Spreadsheet | When dividends paid |
| IPO PRICE | Spreadsheet | Initial price |
| **Price** | **Spreadsheet** | Current price (YOUR data!) |
| **Price Change** | **Spreadsheet** | Daily change (YOUR data!) |
| **Dividend** | **Spreadsheet** | Latest dividend (YOUR data!) |
| # Pmts | Spreadsheet | Payments per year (52 for weekly, 12 for monthly) |
| **Annual Div** | **Spreadsheet** | Used for yield calculation |
| Forward Yield | Auto-calculated | = Annual Div / Price * 100 |
| Dividend Volatility Index | Spreadsheet | Standard deviation |
| **Weighted Rank** | **Spreadsheet** | Your custom ranking |
| **1 Week** | **Spreadsheet** | Total return % |
| **1 Month** | **Spreadsheet** | Total return % |
| **3 Month** | **Spreadsheet** | Total return % |
| **6 Month** | **Spreadsheet** | Total return % |
| **12 Month** | **Spreadsheet** | Total return % |
| **3 YR Annlzd** | **Spreadsheet** | Total return % |

## Fixes Applied

✅ **1. Sorting** - Works from top to bottom, respects weighted rank from spreadsheet  
✅ **2. Price & Price Change** - Come from spreadsheet (YOUR most current data)  
✅ **3. Dividend** - Comes from spreadsheet (YOUR most current data)  
✅ **4. Yield Calculation** - FIXED! Annual Div / Price * 100  
✅ **5. Dividend History Sorting** - Newest to oldest  
✅ **6. Rank** - Shows your spreadsheet rank, or "-" if not set  
✅ **7. Total Returns** - ALL come from spreadsheet (1W, 1M, 3M, 6M, 12M, 3Y)  
✅ **8. Charts** - Performance tab uses spreadsheet data, Live tab uses Yahoo Finance  

## Troubleshooting

### "No file uploaded"
- Make sure you selected a file first
- File must be .xlsx or .xls format

### "Sheet1 not found"
- Open Excel file
- Right-click sheet tab at bottom
- Rename to "Sheet1" (exactly)

### "SYMBOL column not found"  
- Check Row 1 has "SYMBOL" header (all caps)
- No extra spaces before/after

### "Failed to upsert ETF data"
- Check Supabase credentials in `.env`
- Make sure database table was created (step 3)
- Check backend console for detailed error

### Backend won't start
```powershell
# Check if port 4000 is in use
netstat -ano | findstr :4000

# If something is using it, kill it or change PORT in .env
```

### Data not showing in frontend
```powershell
# 1. Check backend is running
# Look for "Server running on port 4000"

# 2. Check frontend .env.local has correct URL
# VITE_API_URL=http://localhost:4000

# 3. Hard refresh browser
# Ctrl + Shift + R

# 4. Check browser console for errors
# F12 → Console tab
```

## Testing Upload

After upload, you should see:
- ✅ Success message with number of ETFs processed
- ✅ Green success card
- ✅ Data appears in tables immediately (refresh if needed)

If you see errors, check:
1. Backend console for detailed logs
2. Browser console (F12) for frontend errors
3. Supabase dashboard → Table Editor → etfs table has data

## Data Flow

```
Your Excel File (DTR)
        ↓
Admin Panel Upload
        ↓
Backend Parser (server/index.js)
        ↓
Supabase Database (etfs table)
        ↓
Frontend Tables & Charts
```

## Production Deployment

When ready for production:

1. Deploy backend to Railway/Render
2. Get production URL (e.g., `https://your-app.railway.app`)
3. Update frontend `.env.production`:
   ```
   VITE_API_URL=https://your-app.railway.app
   ```
4. Build frontend: `npm run build`
5. Deploy to Vercel/Netlify

## Summary

- **Backend Ready:** ✅ Excel parser, database integration, all APIs
- **Frontend Ready:** ✅ Tables use spreadsheet, charts lazy-loaded
- **Upload Ready:** ✅ Admin panel with drag & drop
- **Calculations:** ✅ Yield = Annual Div / Price
- **Sorting:** ✅ By spreadsheet rank or custom weights
- **Charts:** ✅ Spreadsheet data (primary) + Yahoo Finance (historical)

**Next Step:** Follow steps 1-8 above to get it running!

