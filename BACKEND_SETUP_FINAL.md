# Backend Setup - Final Version

## What Your Backend Does

### 1. **Accepts Excel Upload** (Admin Panel)
- Reads your DTR spreadsheet
- Parses ALL columns exactly as shown in your image
- Saves to Supabase database

### 2. **Serves Spreadsheet Data** (API)
- `/api/etfs` - Returns all ETFs from your spreadsheet
- `/api/etfs/:symbol` - Returns single ETF

### 3. **Fills Gaps with Yahoo Finance** (API)
- `/api/yahoo-finance/returns?symbol=AAPW` - Gets Price Returns & Total Returns
- `/api/yahoo-finance/dividends?symbol=AAPW` - Gets 5-year dividend history
- `/api/yahoo-finance/etf?symbol=AAPW` - Gets historical price data for charts

## Quick Setup (5 Minutes)

### Step 1: Install Dependencies

```powershell
cd server
npm install
```

This installs:
- `express` - Web server
- `cors` - Cross-origin requests
- `multer` - File uploads
- `xlsx` - Excel parsing
- `@supabase/supabase-js` - Database
- `yahoo-finance2` - Real-time data
- `dotenv` - Environment variables

### Step 2: Create `.env` File

Create `server/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
PORT=4000
```

**Get these from Supabase:**
1. Go to your Supabase project
2. Settings → API
3. Copy "Project URL" → `SUPABASE_URL`
4. Copy "service_role" key (NOT anon key) → `SUPABASE_SERVICE_ROLE_KEY`

### Step 3: Run SQL in Supabase

Open `SUPABASE_ETF_TABLE.sql` and run in Supabase SQL Editor.

This creates the `etfs` table with all columns.

### Step 4: Start Backend

```powershell
cd server
npm start
```

You should see:
```
Server running on port 4000
```

## Testing Backend

### Test 1: Health Check
```powershell
curl http://localhost:4000/api/etfs
```

Should return: `{"data":[],"count":0}` (empty until you upload)

### Test 2: Upload Excel

1. Open browser: `http://localhost:8081`
2. Login as admin
3. Admin Panel → ETF Data Management
4. Upload your Excel file
5. Should see: "Success! Processed 108 ETFs"

### Test 3: Verify Data
```powershell
curl http://localhost:4000/api/etfs
```

Should return: All 108 ETFs with data

### Test 4: Yahoo Finance
```powershell
curl "http://localhost:4000/api/yahoo-finance/returns?symbol=AAPW"
```

Should return: Price returns, total returns, current price

## Data Flow

### When You Upload Excel:

```
1. Admin uploads DTR.xlsx
   ↓
2. Backend parses Sheet1
   ↓
3. Extracts all columns (SYMBOL, Price, Dividend, Total Returns, etc.)
   ↓
4. Upserts to Supabase `etfs` table
   ↓
5. Saves `spreadsheet_updated_at` timestamp
   ↓
6. Returns success + count
```

### When User Views Homepage:

```
1. Frontend fetches /api/etfs
   ↓
2. Gets YOUR spreadsheet data (price, dividend, total returns)
   ↓
3. For each ETF, calls Yahoo Finance API to fill gaps:
   - Price Returns (not in spreadsheet)
   - Any N/A total returns (from spreadsheet)
   ↓
4. Displays merged data in table
```

### When User Clicks Symbol:

```
1. Shows spreadsheet-based performance chart (immediate)
   ↓
2. If user clicks "Live Price Chart" tab:
   ↓
3. Calls /api/yahoo-finance/etf?symbol=AAPW
   ↓
4. Gets historical prices for line chart
   ↓
5. Renders interactive chart
```

### When User Clicks Dividend:

```
1. Calls /api/yahoo-finance/dividends?symbol=AAPW
   ↓
2. Gets 5 years of dividend history
   ↓
3. Sorts newest → oldest
   ↓
4. Shows in modal/table
```

## Your Excel Structure

Based on your image, these columns are parsed:

| Column | Spreadsheet Header | Database Column | Notes |
|--------|-------------------|-----------------|-------|
| 1 | Favorites | (ignored) | Checkbox column |
| 2 | SYMBOL | symbol | ⭐ Required, unique |
| 3 | Issuer | issuer | ROUNDHILL, YIELDMAX, etc. |
| 4 | DESC | description | AAPL, AMD, BITCOIN, etc. |
| 5 | Pay Day | pay_day | TU, FRI, Monthly, etc. |
| 6 | IPO PRICE | ipo_price | Initial offering price |
| 7 | **Price** | price | ⭐ YOUR most current |
| 8 | **Price Cha[nge]** | price_change | ⭐ YOUR data |
| 9 | **Dividend** | dividend | ⭐ Latest dividend only |
| 10 | # Pmts | payments_per_year | 52 for weekly, 12 monthly |
| 11 | Annual Div | annual_div | Total annual dividend |
| 12 | Forward Y[ield] | forward_yield | Auto-calculated if blank |
| 13 | Dividend Vo[latility] | dividend_volatility_index | Standard deviation |
| 14 | Weighted [Rank] | weighted_rank | Your custom ranking |
| 15 | 3 YR Annlz[ed] | three_year_annualized | Total return (may be N/A) |
| 16 | **12 Month** | total_return_12m | ⭐ Total return |
| 17 | **6 Month** | total_return_6m | ⭐ Total return |
| 18 | **3 Month** | total_return_3m | ⭐ Total return |
| 19 | **1 Month** | total_return_1m | ⭐ Total return |
| 20 | **1 Week** | total_return_1w | ⭐ Total return |

## What Gets Filled by Yahoo Finance

### Always from Yahoo Finance:
1. **Price Returns** (1W, 1M, 3M, 6M, 12M, 3Y)
   - NOT in spreadsheet
   - Calculated from historical prices
   - Price change only (no dividends)

2. **Dividend History** (5 years)
   - NOT in spreadsheet (you only provide latest)
   - Shows timeline of all dividend payments
   - Displayed in history view only

### Conditionally from Yahoo Finance:
3. **Total Returns** - If your spreadsheet has N/A
   - Yahoo Finance calculates from price history
   - Used as fallback only

4. **Current Price** - If more recent than spreadsheet
   - Yahoo Finance updates during market hours
   - Your spreadsheet updated when you upload

## Backend Code Structure

```
server/
├── index.js          # Main server file
│   ├── /api/admin/upload-dtr (POST)
│   ├── /api/etfs (GET)
│   ├── /api/etfs/:symbol (GET)
│   ├── /api/yahoo-finance/returns (GET)
│   ├── /api/yahoo-finance/dividends (GET)
│   └── /api/yahoo-finance/etf (GET)
├── .env              # Your credentials
├── package.json      # Dependencies
└── uploads/          # Temp storage for Excel files
```

## Troubleshooting

### "SUPABASE_URL is not set"
- Check `server/.env` file exists
- Verify `SUPABASE_URL` is set correctly
- Restart server after changing `.env`

### "Symbol column not found"
- Check Excel file has "SYMBOL" in row 1
- Make sure row 1 is headers, row 2+ is data
- Try opening Excel and verifying column names

### "Failed to upsert data"
- Check Supabase connection
- Verify service role key (not anon key)
- Check SQL table was created correctly

### "Yahoo Finance timeout"
- Normal during market hours (high load)
- Backend retries automatically
- Shows cached data if available

### "Only processed 50 instead of 108"
- Check for empty rows in Excel
- Ensure SYMBOL column has values in all rows
- Remove any completely blank rows

## Production Deployment

### Railway (Recommended):

1. **Push to GitHub**
```powershell
git add .
git commit -m "Add backend"
git push
```

2. **Deploy to Railway**
- Go to railway.app
- New Project → Deploy from GitHub
- Select your repo
- Root directory: `server`
- Add environment variables (same as `.env`)

3. **Update Frontend**
```env
VITE_API_URL=https://your-backend.railway.app
```

### Environment Variables for Production:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `PORT` - Will be set by Railway automatically

## API Reference

### Upload Excel
```
POST /api/admin/upload-dtr
Content-Type: multipart/form-data
Body: file (Excel file)

Response:
{
  "message": "Successfully processed 108 ETFs",
  "count": 108
}
```

### Get All ETFs
```
GET /api/etfs

Response:
{
  "data": [ /* array of all ETFs */ ],
  "count": 108
}
```

### Get Single ETF
```
GET /api/etfs/AAPW

Response:
{
  "data": { /* single ETF object */ }
}
```

### Get Yahoo Finance Returns
```
GET /api/yahoo-finance/returns?symbol=AAPW

Response:
{
  "symbol": "AAPW",
  "currentPrice": 42.61,
  "priceChange": 0.11,
  "priceReturn1Wk": 1.27,
  "priceReturn1Mo": 10.51,
  "priceReturn3Mo": 18.27,
  "priceReturn6Mo": 31.06,
  "priceReturn12Mo": null,
  "priceReturn3Yr": null,
  "totalReturn1Wk": 1.27,
  "totalReturn1Mo": 10.51,
  "totalReturn3Mo": 18.27,
  "totalReturn6Mo": 31.06,
  "totalReturn12Mo": null,
  "totalReturn3Yr": null
}
```

### Get Dividend History
```
GET /api/yahoo-finance/dividends?symbol=AAPW

Response:
{
  "symbol": "AAPW",
  "dividends": [
    { "date": "2024-11-15", "amount": 0.23638 },
    { "date": "2024-11-08", "amount": 0.23638 },
    ...
  ]
}
```

### Get Historical Chart Data
```
GET /api/yahoo-finance/etf?symbol=AAPW

Response:
{
  "symbol": "AAPW",
  "data": [
    {
      "timestamp": 1699920000,
      "close": 42.61,
      "high": 43.12,
      "low": 42.30,
      "open": 42.50,
      "volume": 123456
    },
    ...
  ]
}
```

## Summary

✅ **Backend parses YOUR Excel exactly**  
✅ **All 108 symbols saved to database**  
✅ **Yahoo Finance fills gaps (Price Returns, Dividend History)**  
✅ **Your spreadsheet data is PRIMARY source**  
✅ **Real-time API supplements when needed**  
✅ **Admin can re-upload anytime to update**  

**Next:** Upload your Excel file in Admin Panel!






