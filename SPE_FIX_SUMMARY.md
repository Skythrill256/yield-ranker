# SPE $0.7000 Spike Detection - FIXED ✓

## Problem
SPE's $0.7000 dividend on 12/29/25 was showing as "Regular" instead of "Special" despite being a 6.4x spike vs the $0.1098 median.

## Root Cause
The extreme spike detection logic (>3x median) was already in the CEF normalization path, but the database needed to be recalculated with the latest code.

## Solution Applied

### 1. Verified CEF Classification
- SPE is correctly classified as `category='CEF'` in `etf_static` table
- This means it uses `calculateNormalizedDividendsForCEFs()` which has amount-based spike detection

### 2. Confirmed Logic is Correct
The CEF normalization already has extreme spike detection at line 375-378 in `dividendNormalization.ts`:

```typescript
// Rule 1 — Amount spike vs median (one-off OR extreme spike)
// CRITICAL: Extreme spikes (>3x median) are ALWAYS special
const extremeSpike = amount > 3.0 * medianAmount;
if ((extremeSpike || !repeatsNext) && amount > specialMultiplier * medianAmount) {
    pmtType = 'Special';
}
```

### 3. Recalculated Database
Ran: `npm run recalc:cef:frequency -- --ticker SPE`

### 4. Verified Database is Correct
```
Date       | Amount   | PMT_TYPE | Frequency
-----------|----------|----------|----------
2025-12-29 |   0.7000 | Special  | Other     ✓ CORRECT
2025-12-16 |   0.1098 | Regular  | Monthly
```

## Current Status: ✓ FIXED

**Database**: ✓ Correct (shows Special)
**API**: ✓ Correct (returns Special)
**Logic**: ✓ Correct (detects >3x spikes)

## If Frontend Still Shows "Regular"

This is a **BROWSER CACHE** issue. Solution:

1. **Hard Refresh**: Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
2. **Or**: Press `Ctrl+F5` (Windows) or `Cmd+F5` (Mac)
3. **Or**: Clear browser cache and reload

## How It Works in Daily Updates

### For CEFs (like SPE):
- `refresh:cef` script uses `calculateNormalizedDividendsForCEFs()`
- Detects spikes >3x median as Special automatically
- No manual intervention needed

### For ETFs/CCETFs:
- `refresh:all` script uses `calculateNormalizedDividends()`
- Now also has extreme spike detection (>3x median) added in this fix
- Both paths are consistent

## Commands Reference

### Recalculate Single Ticker
```bash
# For CEFs
npm run recalc:cef:frequency -- --ticker SPE

# For ETFs/CCETFs
npm run recalc:etf:frequency -- --ticker ULTY
```

### Verify Database
```sql
SELECT ex_date, adj_amount, pmt_type, frequency 
FROM dividends_detail 
WHERE ticker = 'SPE' 
AND ex_date >= '2025-12-15'
ORDER BY ex_date DESC;
```

## Test Results

✓ Logic test passed: $0.7000 detected as Special
✓ Database updated: pmt_type = 'Special'
✓ API returns correct data: pmtType = 'Special'
✓ Other CEFs (like SRV) still work correctly

## Conclusion

**SPE IS FIXED.** The $0.7000 spike is correctly classified as Special in the database and API. If the frontend shows "Regular", it's cached data - hard refresh will fix it.

