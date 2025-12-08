# DVI Formula Fixes - Summary

## Changes Made (Per CEO's Requirements)

### ✅ Fixed Issues:

1. **Payment Selection**: 
   - **BEFORE**: Used most recent 12 payments if available, otherwise all
   - **AFTER**: Uses **ALL payments** within the 365-day period (no "12-or-all" rule)

2. **Time Period**:
   - **BEFORE**: Rolling 365 days from today (changes daily)
   - **AFTER**: Fixed 365 days from today (consistent calculation)
   - Note: CEO will change spreadsheet to 365 days to match

3. **Standard Deviation**:
   - **CONFIRMED**: Using **Population SD (P)**, not Sample SD (SDEV.S)
   - Formula: `σ = √(Σ(Annualized_i - μ)² / n)`
   - Divides by `n` (not `n-1`)

### ✅ Formula Confirmed:

```
DVI = (SD / MEDIAN) × 100
```

Where:
- **SD** = Population Standard Deviation of annualized amounts
- **MEDIAN** = Median of annualized amounts
- Both calculated on **annualized amounts** (not raw)

## Current Implementation

### Step-by-Step Process:

1. **Collect adjusted dividends** within 365-day period
2. **Annualize each payment**: `Annualized = adj_amount × Frequency`
   - Frequency detection based on days between payments
3. **Use ALL annualized payments** (no selection rule)
4. **Calculate Population SD**: `σ = √(Σ(Annualized_i - μ)² / n)`
5. **Calculate MEDIAN** of annualized amounts
6. **Calculate CV**: `DVI = (σ / MEDIAN) × 100`
7. **Round** to 1 decimal place

## Verification Script

Created `server/scripts/dvi_verification.ts` to output detailed calculation breakdown:

```bash
npx tsx server/scripts/dvi_verification.ts GOOY TSLY QQQI
```

This will output:
- Period dates
- All payments with RAW, FREQ, and ANNUALIZED columns
- Summary statistics (Mean, Median, Variance, SD, CV)
- Final DVI value

## Next Steps

1. Run verification script to compare with CEO's spreadsheet
2. Verify calculations match after CEO updates spreadsheet to 365 days
3. Ensure all three tickers (GOOY, TSLY, QQQI) produce matching results

