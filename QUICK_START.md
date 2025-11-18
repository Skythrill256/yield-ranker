# Quick Start Guide - DTR Integration

## Why "No Data Available"?

The app now fetches data from a backend server (which needs to be started) instead of Yahoo Finance. Without the backend running, it shows an error.

**Good news:** I've added a fallback to show sample data until you start the backend!

## Option 1: Quick Fix (Use Sample Data - Already Working)

The app will now automatically show sample data if the backend isn't running. You should see data on screen now! 

However, to use YOUR real DTR spreadsheet data, follow Option 2.

## Option 2: Full Setup (Use Real DTR Data)

### Step 1: Install Backend Dependencies

```powershell
cd server
npm install
```

### Step 2: Configure Backend

Create `server/.env` file:

```
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PORT=4000
```

**Where to get Supabase credentials:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to Settings → API
4. Copy "Project URL" → use as SUPABASE_URL
5. Copy "service_role" key (secret) → use as SUPABASE_SERVICE_ROLE_KEY

### Step 3: Create Database Table

1. Go to Supabase dashboard → SQL Editor
2. Copy contents of `SUPABASE_ETF_TABLE.sql`
3. Paste and click "Run"

### Step 4: Start Backend Server

```powershell
cd server
npm start
```

You should see: `Server running on port 4000`

### Step 5: Update Frontend Config

Edit `yield-ranker/.env.local`:

```
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### Step 6: Restart Frontend

Stop the frontend (Ctrl+C) and restart:

```powershell
npm run dev
```

### Step 7: Upload DTR Spreadsheet

1. Log in as admin
2. Go to Admin Panel
3. Click "ETF Data Management" tab
4. Select your DTR Excel file
5. Click "Upload & Process"

Done! Your app now uses YOUR real DTR data.

## How It Works

```
Backend NOT Running:
  → Shows sample mock data (15+ ETFs)
  → Everything works, but data is static

Backend Running:
  → Connects to database
  → Shows real DTR data
  → Updates when you upload new spreadsheet
```

## Current Status

✅ Frontend working (showing sample data)  
⏳ Backend needs setup (follow steps above)  
⏳ Database needs table creation  
⏳ DTR spreadsheet needs upload  

## Charts Explanation

### Performance Summary Tab (Default)
- Uses spreadsheet data only
- Bar chart with 1W, 1M, 3M, 6M, 12M returns
- Works immediately, no backend needed

### Live Price Chart Tab
- Uses Yahoo Finance for historical prices
- Loads only when you click the tab
- Comparison features available
- Requires backend for stock comparison

## Troubleshooting

**Still seeing "No Data Available"?**
```powershell
# Hard refresh browser
Ctrl + Shift + R

# Or clear cache and reload
```

**Backend won't start?**
```powershell
# Check if port 4000 is in use
netstat -ano | findstr :4000

# Install dependencies again
cd server
rm -r node_modules
npm install
```

**"Module not found" errors?**
```powershell
# Frontend
cd yield-ranker
npm install

# Backend
cd server
npm install
```

## Production Deployment

When ready to deploy:

1. Deploy backend to Railway/Render
2. Update frontend VITE_API_URL to production URL
3. Rebuild frontend: `npm run build`
4. Deploy frontend to Vercel/Netlify

See `DTR_INTEGRATION_GUIDE.md` for full details.

