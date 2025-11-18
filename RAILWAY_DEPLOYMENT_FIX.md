# Railway Deployment Fix

## Error: 404 on `/api/etfs`

Your backend is deployed on Railway but returning 404 errors:
```
stunning-adaptation-production-8960.up.railway.app/api/etfs
```

## Quick Diagnosis

### 1. Check if Backend is Running

Open in browser:
```
https://stunning-adaptation-production-8960.up.railway.app/health
```

**Expected Response:**
```json
{
  "server": "ok",
  "supabase": "connected",
  "database": "ok"
}
```

**If you get 404 or nothing:** Backend isn't running

### 2. Check Railway Logs

1. Go to Railway dashboard: https://railway.app
2. Click your project
3. Click "Deployments"
4. Click latest deployment
5. View logs

**Look for:**
- ❌ Errors during startup
- ❌ Missing environment variables
- ❌ Port binding issues
- ✅ "Server running on port..."

## Common Issues & Fixes

### Issue 1: Environment Variables Not Set

**Fix in Railway Dashboard:**

1. Go to your project
2. Click "Variables" tab
3. Add these variables:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
PORT=4000
```

**Get Supabase credentials:**
1. Go to your Supabase project
2. Settings → API
3. Copy "Project URL" → `SUPABASE_URL`
4. Copy "service_role" key (NOT anon key) → `SUPABASE_SERVICE_ROLE_KEY`

### Issue 2: `etfs` Table Doesn't Exist

**Fix:**

1. Go to Supabase SQL Editor
2. Run this SQL:

```sql
CREATE TABLE IF NOT EXISTS etfs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT UNIQUE NOT NULL,
  issuer TEXT,
  description TEXT,
  pay_day TEXT,
  ipo_price NUMERIC,
  price NUMERIC,
  price_change NUMERIC,
  dividend NUMERIC,
  payments_per_year INTEGER,
  annual_div NUMERIC,
  forward_yield NUMERIC,
  dividend_volatility_index NUMERIC,
  weighted_rank NUMERIC,
  three_year_annualized NUMERIC,
  total_return_12m NUMERIC,
  total_return_6m NUMERIC,
  total_return_3m NUMERIC,
  total_return_1m NUMERIC,
  total_return_1w NUMERIC,
  favorites BOOLEAN DEFAULT false,
  spreadsheet_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_etfs_symbol ON etfs(symbol);
CREATE INDEX IF NOT EXISTS idx_etfs_weighted_rank ON etfs(weighted_rank);
CREATE INDEX IF NOT EXISTS idx_etfs_forward_yield ON etfs(forward_yield);

ALTER TABLE etfs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to etfs"
  ON etfs FOR SELECT
  USING (true);

CREATE POLICY "Allow authenticated users to insert/update etfs"
  ON etfs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update etfs"
  ON etfs FOR UPDATE
  USING (auth.role() = 'authenticated');
```

### Issue 3: Server Not Starting

**Check Railway Deployment Settings:**

1. Railway dashboard → Your project
2. Settings → Deploy
3. **Root Directory:** Should be `server`
4. **Start Command:** Should be `npm start` or `node index.js`
5. **Build Command:** Should be `npm install`

**If settings are wrong:**
- Update them
- Click "Deploy" → "Redeploy"

### Issue 4: `dotenv` Not Loading

**Fix in `server/index.js`:**

Add at the very top (line 1):

```javascript
import 'dotenv/config';
import express from 'express';
// ... rest of imports
```

Then redeploy.

### Issue 5: Wrong Package Type

**Check `server/package.json`:**

Should have:
```json
{
  "type": "module",
  "main": "index.js"
}
```

If missing, add it and redeploy.

## Step-by-Step Fix

### Step 1: Add Health Check (Already Done)

I've added two new endpoints:
- `GET /` - API info
- `GET /health` - Health check with Supabase connection test

### Step 2: Test Locally First

```powershell
cd server
npm install
npm start
```

Then test:
```
http://localhost:4000/health
http://localhost:4000/api/etfs
```

If working locally, issue is with Railway deployment.

### Step 3: Commit and Push

```powershell
git add .
git commit -m "Add health check endpoints"
git push
```

Railway will auto-deploy.

### Step 4: Test on Railway

```
https://stunning-adaptation-production-8960.up.railway.app/health
```

Should return health status.

### Step 5: Check `/api/etfs`

```
https://stunning-adaptation-production-8960.up.railway.app/api/etfs
```

Should return:
```json
{
  "data": []
}
```

(Empty array if no data uploaded yet, which is OK)

### Step 6: Upload Data

1. Go to your app: https://your-frontend.vercel.app
2. Login as admin
3. Admin Panel → ETF Data Management
4. Upload your Excel file

### Step 7: Verify Data

```
https://stunning-adaptation-production-8960.up.railway.app/api/etfs
```

Should now return your ETF data.

## Alternative: Redeploy from Scratch

If nothing works, redeploy:

### 1. Railway Dashboard

1. Create new project
2. "Deploy from GitHub"
3. Select your repo
4. **Root directory:** `server`
5. Add environment variables (see above)

### 2. Update Frontend

In your frontend `.env.local` or Vercel environment variables:

```
VITE_API_URL=https://your-new-railway-url.up.railway.app
```

Redeploy frontend on Vercel.

## Quick Test Commands

Test all endpoints:

```bash
# Health check
curl https://stunning-adaptation-production-8960.up.railway.app/health

# Root endpoint
curl https://stunning-adaptation-production-8960.up.railway.app/

# Get all ETFs
curl https://stunning-adaptation-production-8960.up.railway.app/api/etfs

# Get single ETF (if data exists)
curl https://stunning-adaptation-production-8960.up.railway.app/api/etfs/AAPW
```

## Most Likely Issue

Based on the 404 error, **the backend isn't running at all** on Railway. This usually means:

1. ❌ Environment variables not set (most common)
2. ❌ Wrong root directory in Railway settings
3. ❌ Build/start command incorrect
4. ❌ Dependencies failed to install

**Fix:**
1. Go to Railway dashboard
2. Check "Variables" - ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
3. Check "Settings" - ensure root directory is `server`
4. Click "Deployments" → View latest logs for errors

## Need Help?

If still not working, check:
1. Railway deployment logs (most important)
2. Supabase project is active
3. Service role key is correct (not anon key)
4. Table exists in Supabase

The health check endpoint will tell you exactly what's wrong!


