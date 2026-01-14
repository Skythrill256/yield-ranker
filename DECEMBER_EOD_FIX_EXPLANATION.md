# December Dividend EOD Fix - Explanation for CEO

## The Problem

For EOD (End of Day) processing, **ALL December dividends were being incorrectly marked as "Special"** when they should be "Regular". This was causing:

1. **Incorrect yield calculations** - Regular December payments were being excluded from annualized calculations
2. **Wrong frequency assignments** - Monthly/quarterly December payments were getting frequency_num = 1 instead of 12 or 4
3. **Data quality issues** - Regular dividend streams were being broken up incorrectly

## Why This Was Happening

The code had **two overly aggressive rules** that marked December dividends as special:

### Rule 1: Automatic December Special Detection (Line 166)
```typescript
// OLD CODE - TOO AGGRESSIVE
const dt = new Date(currentExDate);
if (!isNaN(dt.getTime()) && dt.getMonth() === 11) return true; // December
```
**Problem:** This automatically marked ANY December dividend as special if it was "too soon" for the dominant cadence. This caught regular monthly/quarterly payments that happened to fall in December.

### Rule 2: December Amount Deviation (Line 541)
```typescript
// OLD CODE - TOO SENSITIVE
if (!isNormalAmount) {
  pmtType = "Special"; // Any difference marked as special
}
```
**Problem:** This marked December dividends as special if the amount was even slightly different from the median (using 2% tolerance). Regular December payments with minor variations were being marked special.

## The Fix

### Fix 1: Removed Automatic December Detection
**Removed** the automatic December special detection. December dividends are now treated like any other month - they're only marked special if there's a clear signal (like being a second December payment or having an extreme amount difference).

### Fix 2: Made Amount-Based Rule More Conservative
**Changed** the December amount deviation rule to only mark as special if the amount is **>= 30% different** from the median (instead of any difference). This ensures:
- Regular December payments with minor variations stay as Regular
- Only truly unusual December payments (like year-end cap gains) are marked Special

## What Still Works (Kept These Rules)

1. **Second December Payment Rule** - If there are 2+ December dividends in the same year, the second one is still marked Special (this catches year-end special distributions)
2. **Extreme Spike Rule** - December dividends that are 300%+ of the median are still marked Special
3. **Clustered Payment Rule** - December dividends paid 1-4 days after another dividend are still marked Special

## Result

✅ **Regular December dividends are now correctly marked as Regular**
✅ **Year-end special distributions are still correctly identified**
✅ **EOD processing will have accurate data**
✅ **Yield calculations will be correct**

## Technical Details

- **File:** `server/src/services/dividendNormalization.ts`
- **Lines changed:** 163-168, 530-546
- **Impact:** Affects all CEF and ETF dividend normalization during EOD processing

