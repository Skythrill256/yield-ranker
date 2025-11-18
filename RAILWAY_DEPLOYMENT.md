# Deploy Backend to Railway - Quick Guide

## Problem

Your backend URL `stunning-adaptation-production-8960.up.railway.app` is returning 404 errors because:
1. Backend server is not running on Railway
2. Or environment variables are not set
3. Or server code is not deployed

## Solution: Deploy Backend to Railway

### Step 1: Verify Your Backend Code Exists

Check that `server/` folder has:
- ✅ `index.js` (main server file)
- ✅ `package.json` (dependencies)
- ✅ `.env.example` (template for env vars)

### Step 2: Push Code to GitHub

```powershell
# From project root
git add .
git commit -m "Add backend server for Railway deployment"
git push
```

### Step 3: Deploy to Railway

**Option A: Railway Dashboard (Recommended)**

1. Go to https://railway.app
2. Login with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your repository
6. **IMPORTANT:** Set Root Directory to `server`
7. Railway will auto-detect Node.js

**Option B: Railway CLI**

```powershell
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy (from server directory)
cd server
railway init
railway up
```

### Step 4: Set Environment Variables in Railway

In Railway Dashboard → Your Project → Variables tab, add:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
PORT=${{PORT}}
```

**Get Supabase Credentials:**
1. Go to https://supabase.com
2. Select your project
3. Settings → API
4. Copy "Project URL" → `SUPABASE_URL`
5. Copy "service_role" secret key (NOT anon) → `SUPABASE_SERVICE_ROLE_KEY`

### Step 5: Verify Deployment

After Railway deploys:

1. **Check Railway Logs:**
   - Railway Dashboard → Your Project → Deployments
   - Click latest deployment
   - View logs
   - Should see: `Server running on port XXXX`

2. **Test Your Backend:**

Open these URLs in browser:

```
https://stunning-adaptation-production-8960.up.railway.app/api/etfs
```

Should return:
```json
{
  "data": [],
  "count": 0
}
```

(Empty because you haven't uploaded Excel yet)

### Step 6: Update Frontend Environment Variable

In your frontend `.env.local` or Vercel environment variables:

```
VITE_API_URL=https://stunning-adaptation-production-8960.up.railway.app
```

Then rebuild and redeploy your frontend.

## Common Issues & Fixes

### Issue 1: "Cannot find module"

**Problem:** Railway can't find dependencies

**Fix:** Make sure `server/package.json` exists and run:
```powershell
cd server
npm install
```

Then commit and push again.

### Issue 2: "SUPABASE_URL is not set"

**Problem:** Environment variables not configured

**Fix:** 
1. Railway Dashboard → Variables
2. Add all environment variables
3. Restart deployment

### Issue 3: "Port already in use"

**Problem:** Railway assigns dynamic port

**Fix:** In `server/index.js`, use:
```javascript
const PORT = process.env.PORT || 4000;
```

This is already in your code, so should work.

### Issue 4: "404 on all endpoints"

**Problem:** Root directory not set

**Fix:**
1. Railway Dashboard → Settings
2. Set "Root Directory" to `server`
3. Redeploy

### Issue 5: Backend works locally but not on Railway

**Problem:** Missing dependencies in package.json

**Fix:** Check `server/package.json` has all dependencies:
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.49.1",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.21.2",
    "multer": "^1.4.5-lts.1",
    "xlsx": "^0.18.5",
    "yahoo-finance2": "^2.11.3"
  }
}
```

## Verify Everything Works

### 1. Test Backend Health

```
GET https://stunning-adaptation-production-8960.up.railway.app/api/etfs
```

Expected: `{"data":[],"count":0}` (empty until you upload)

### 2. Upload Excel File

1. Go to your site → Admin Panel
2. ETF Data Management tab
3. Upload your Excel file
4. Should see: "Success! Processed 108 ETFs"

### 3. Check Frontend

1. Refresh homepage
2. Should see all 108 ETFs from your spreadsheet
3. No more "using mock data" messages in console

### 4. Test Live Charts

1. Click any ETF symbol
2. Click "Live Price Chart" tab
3. Chart should load from Yahoo Finance
4. Should show historical price data

## Railway Project Structure

Your Railway project should look like:

```
stunning-adaptation-production-8960.up.railway.app/
├── /api/etfs (GET all ETFs)
├── /api/etfs/:symbol (GET single ETF)
├── /api/admin/upload-dtr (POST Excel upload)
├── /api/yahoo-finance/returns?symbol=XXX (GET returns)
├── /api/yahoo-finance/dividends?symbol=XXX (GET dividend history)
└── /api/yahoo-finance/etf?symbol=XXX (GET historical data)
```

## Quick Test Commands

```powershell
# Test backend is running
curl https://stunning-adaptation-production-8960.up.railway.app/api/etfs

# Test after uploading data
curl https://stunning-adaptation-production-8960.up.railway.app/api/etfs/AAPW

# Test Yahoo Finance endpoint
curl "https://stunning-adaptation-production-8960.up.railway.app/api/yahoo-finance/returns?symbol=AAPW"
```

## If Still Not Working

### Check Railway Logs

1. Railway Dashboard → Your Project
2. Click "Deployments"
3. Click latest deployment
4. View logs
5. Look for errors

Common log errors:
- "Cannot find module" → Missing dependencies
- "SUPABASE_URL is not set" → Missing env vars
- "EADDRINUSE" → Port issue (shouldn't happen on Railway)
- "Connection refused" → Supabase credentials wrong

### Contact Me With:

If backend still not working, provide:
1. Railway deployment logs (last 50 lines)
2. `server/package.json` contents
3. Railway environment variables (hide actual keys)
4. Error message from Railway

## Summary

✅ **Deploy backend to Railway**  
✅ **Set environment variables (Supabase URL & Key)**  
✅ **Set root directory to `server`**  
✅ **Verify `/api/etfs` returns 200 OK**  
✅ **Update frontend `VITE_API_URL`**  
✅ **Upload Excel file in Admin Panel**  
✅ **Test live charts work**  

Your backend should now be working! 🚀

