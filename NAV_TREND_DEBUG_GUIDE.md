# NAV Trend Debug Guide

## Quick Start

### Option 1: PowerShell Script (Recommended - Works from any directory)
```powershell
.\debug-nav.ps1 UTG
```

### Option 2: Batch Script (Windows - Works from any directory)
```cmd
debug-nav.bat UTG
```

### Option 3: npm script (From server directory)
```bash
cd server
npm run debug:nav UTG
```

### Option 4: Direct tsx (From project root)
```bash
cd C:\Users\March\Documents\yield-ranker
npx tsx server/scripts/debug_nav_trend.ts UTG
```

## What the Script Shows

The debug script displays:

1. **CEO's Expected Calculation** (Calendar Months + Close Price)
   - 6 months: Uses NAV from exactly 6 calendar months ago
   - 12 months: Uses NAV from exactly 12 calendar months ago
   - Uses `close` price (not `adj_close`)
   - Matches CEO's manual calculation

2. **Current Code Calculation** (What the code was doing before fix)
   - Old method used 126/252 trading days (not calendar months)
   - Old method used `adj_close` (not `close`)

3. **Data Points** - Shows actual NAV values and dates being used

## Code Fix Summary

The calculation functions have been updated to match CEO's method:

**File:** `server/src/routes/cefs.ts`
- `calculateNAVTrend6M()` - Now uses exactly 6 calendar months ago with `close` price
- `calculateNAVReturn12M()` - Now uses exactly 12 calendar months ago with `close` price

**Formula (Unchanged):**
```
((Current NAV - Past NAV) / Past NAV) × 100
```

**Changes:**
- ✅ Uses calendar months (not trading days)
- ✅ Uses `close` price (not `adj_close`)

## Testing

After running the fix, refresh CEF data:
```bash
cd server
npm run refresh:cefs -- --ticker UTG
```

Then verify the database values match CEO's expected values.

