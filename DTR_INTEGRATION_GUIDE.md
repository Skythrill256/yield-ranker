# DTR Spreadsheet Integration Guide

## Overview

The application now uses DTR spreadsheet as the single source of truth for ETF data, tables, and rankings. Yahoo Finance is only used for interactive historical charts.

## What Changed

### 1. Database Schema

Created `etfs` table in Supabase with columns matching the DTR spreadsheet:

- `symbol` - Primary key
- `issuer`, `description`, `pay_day` - Text fields
- `ipo_price`, `price`, `price_change` - Price data
- `dividend`, `payments_per_year`, `annual_div`, `forward_yield` - Dividend metrics
- `dividend_volatility_index`, `weighted_rank` - Ranking metrics
- `three_year_annualized`, `total_return_12m`, `total_return_6m`, `total_return_3m`, `total_return_1m`, `total_return_1w` - Performance metrics

**Setup:** Run the SQL in `SUPABASE_ETF_TABLE.sql` in your Supabase SQL editor.

### 2. Backend Server

Created Express server (`server/index.js`) with endpoints:

- `POST /api/admin/upload-dtr` - Upload Excel file
- `GET /api/etfs` - Get all ETFs
- `GET /api/etfs/:symbol` - Get single ETF

**Setup:**
```powershell
cd server
npm install
npm start
```

**Environment Variables:**
Create `server/.env`:
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PORT=4000
```

### 3. Admin Panel Upload UI

Added "ETF Data Management" tab in Admin Panel with Excel upload functionality.

**Access:** Log in as admin → Admin Panel → ETF Data Management tab

**File Format:** Excel file with Sheet1 containing headers as specified in the upload UI.

### 4. Frontend Data Flow

Updated `src/services/etfData.ts`:
- `fetchETFData()` now calls `/api/etfs` (database) instead of Yahoo Finance
- `fetchSingleETF()` calls `/api/etfs/:symbol`
- Added automatic yield calculation: `forwardYield = (annual_div / price) * 100`
- Fixed dividend history sorting (newest to oldest)

### 5. Charts

**ETF Detail Page** now has two tabs:

**Performance Summary Tab (Default)**
- Uses data from spreadsheet only
- Bar chart showing returns: 1W, 1M, 3M, 6M, 12M, 3Y
- No API calls, instant loading

**Live Price Chart Tab (Lazy Loaded)**
- Yahoo Finance data
- Only loads when user clicks the tab
- Full comparison and timeframe features
- Cached for 30 seconds

**Dividend History**
- Still uses Yahoo Finance
- Only loaded when user clicks to view
- Sorted newest to oldest

## How to Use

### Initial Setup

1. **Database Setup**
   ```sql
   -- Run in Supabase SQL Editor
   -- Paste contents of SUPABASE_ETF_TABLE.sql
   ```

2. **Backend Setup**
   ```powershell
   cd server
   npm install
   
   # Create .env file with Supabase credentials
   echo "SUPABASE_URL=your_url" > .env
   echo "SUPABASE_SERVICE_ROLE_KEY=your_key" >> .env
   echo "PORT=4000" >> .env
   
   npm start
   ```

3. **Frontend Setup**
   ```powershell
   cd yield-ranker
   
   # Update .env.local
   echo "VITE_API_URL=http://localhost:4000" > .env.local
   
   npm install
   npm run dev
   ```

### Uploading DTR Spreadsheet

1. Log in as admin user
2. Navigate to Admin Panel
3. Click "ETF Data Management" tab
4. Select your DTR Excel file (e.g., DTR 11-16-25.xlsx)
5. Click "Upload & Process"
6. Wait for success confirmation

The spreadsheet will be parsed and all ETFs will be upserted into the database. Existing ETFs are updated, new ones are added.

### What Happens After Upload

- All table data throughout the app updates immediately
- Rankings recalculate using spreadsheet values
- Performance charts show spreadsheet data
- Yahoo Finance charts remain available for historical price data

## Data Flow Diagram

```
DTR Spreadsheet (Excel)
        ↓
Admin Panel Upload
        ↓
Backend Parser (server/index.js)
        ↓
Supabase Database (etfs table)
        ↓
Frontend Service (etfData.ts)
        ↓
React Components (Tables, Rankings, Charts)

Yahoo Finance (separate, lazy-loaded)
        ↓
Historical Price Charts (when tab clicked)
Dividend History Charts (when viewed)
```

## Key Features

✅ **Single Source of Truth:** DTR spreadsheet controls all table data  
✅ **Automatic Yield Calculation:** If missing, calculated as annual_div / price  
✅ **Deduplication:** Duplicate symbols are automatically filtered out  
✅ **Performance Optimized:** 30-second caching, lazy-loaded charts  
✅ **No Duplicates in UI:** React keys use symbol+index to prevent warnings  
✅ **Sorted Dividend History:** Newest to oldest automatically  
✅ **Admin-Only Upload:** Only admin users can upload new data

## Troubleshooting

**"Supabase credentials not configured"**
- Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in `yield-ranker/.env.local`

**"Cannot connect to backend"**
- Ensure backend server is running on port 4000
- Check VITE_API_URL in `.env.local`

**"Upload failed"**
- Check Excel file has Sheet1
- Verify SYMBOL column exists
- Check backend logs for parsing errors

**"White screen"**
- Check browser console for errors
- Verify Supabase credentials are set
- Ensure backend is running

## API Endpoints

### Backend (Port 4000)

- `POST /api/admin/upload-dtr` - Upload DTR Excel file (FormData with 'file' field)
- `GET /api/etfs` - Get all ETFs from database
- `GET /api/etfs/:symbol` - Get single ETF by symbol
- `POST /api/yahoo-finance` - Yahoo Finance comparison data (lazy-loaded)
- `GET /api/yahoo-finance/dividends?symbol=SYMBOL` - Dividend history (lazy-loaded)

## Environment Variables

**Backend (`server/.env`):**
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PORT=4000
```

**Frontend (`yield-ranker/.env.local`):**
```
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## Production Deployment

1. Deploy backend to Railway/Render/Vercel
2. Set environment variables on hosting platform
3. Update VITE_API_URL to production backend URL
4. Build and deploy frontend

**Example:**
```powershell
# Backend on Railway: https://your-backend.railway.app
# Update frontend .env.local:
VITE_API_URL=https://your-backend.railway.app
```

Then rebuild frontend:
```powershell
npm run build
```

## Notes

- Weighted rank can be null (admin can choose not to provide)
- Missing performance metrics show as N/A
- Yield is auto-calculated if missing but annual_div and price are present
- All percentage values in database are stored as numbers (e.g., 12.5 for 12.5%)
- Database stores NULL for missing values, frontend handles gracefully

