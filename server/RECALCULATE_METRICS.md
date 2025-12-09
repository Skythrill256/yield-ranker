# How to Recalculate All Metrics with Improved DVI

## Overview

The DVI (Dividend Volatility Index) calculation has been improved to match spreadsheet calculations exactly. It now:
- Automatically detects frequency (52 for weekly, 12 for monthly, 4 for quarterly)
- Uses adjusted dividends
- Annualizes each payment correctly
- Calculates SD and Average on annualized amounts
- Produces accurate CV (DVI) percentages

## Two Options for Recalculation

### Option 1: Recalculate Only (Fast - Uses Existing Data)

If you already have the latest dividend data in the database, use this to recalculate metrics:

```bash
cd server
npm run recalc:metrics
```

**What it does:**
- Uses existing price and dividend data from database
- Recalculates all metrics including DVI using the improved calculation
- Updates all ETFs in the database
- **No API calls** - very fast

**When to use:** When you just want to update metrics with the new DVI calculation logic.

### Option 2: Full Refresh (Complete - Pulls Latest Data)

If you want to ensure you have the absolute latest data from Tiingo AND recalculate:

```bash
cd server
npm run refresh:all
```

**What it does:**
1. Pulls latest prices (last 365 days) from Tiingo API
2. Pulls latest dividends (last 365 days) from Tiingo API
3. Updates database with fresh data
4. Recalculates all metrics including DVI using the improved calculation
5. Updates all ETFs in the database

**When to use:** When you want to ensure you have the latest data AND update metrics.

### Option 3: Refresh Single Ticker

To refresh and recalculate just one ticker (useful for testing):

```bash
cd server
npm run refresh:ticker TSLY
```

## Verification

After recalculating, you can verify the DVI calculation for a specific ticker:

```bash
cd server
npm run test:dvi
```

This will test TSLY and show:
- Standard Deviation
- Average
- CV (DVI) percentage
- Comparison with expected spreadsheet values

## What Gets Updated

Both scripts update these metrics in the database:
- `dividend_sd` - Standard deviation of annualized dividends
- `dividend_cv` - Coefficient of variation (decimal)
- `dividend_cv_percent` - DVI percentage (e.g., 39.70%)
- `dividend_volatility_index` - Rating (A+, A, B+, B, C, D, F)
- `annual_dividend` - Annualized dividend estimate
- `forward_yield` - Forward yield percentage
- All total return metrics (with and without DRIP)
- All price return metrics

## Expected Results

After recalculation, DVI values should match spreadsheet calculations:
- TSLY: 39.70% (verified)
- All other ETFs will have accurate DVI based on their dividend history

## Notes

- The improved DVI calculation uses the same method as your spreadsheet
- Frequency is automatically detected from payment intervals
- All calculations use adjusted dividends for accuracy
- The calculation handles frequency changes (e.g., monthly to weekly transitions)

