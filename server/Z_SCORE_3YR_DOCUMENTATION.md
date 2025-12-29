# 3-Year Z-Score Calculation Documentation

## Overview

This document explains the 3-Year Z-Score calculation for CEF (Closed End Fund) Premium/Discount analysis using a **flexible lookback logic** with **3-year maximum** and **1-year minimum** thresholds.

---

## What is a Z-Score?

A **Z-Score** (standard score) measures how many standard deviations a data point is from its historical mean. For CEFs, it identifies if the current Premium/Discount is an outlier compared to its recent history.

**Formula:**
```
Z = (Current P/D - Average P/D) / STDEV.P
```

Where:
- **Current P/D** = (Current Price / Current NAV) - 1 (as decimal)
- **Average P/D** = Mean of all P/D values in the lookback period
- **STDEV.P** = Population Standard Deviation (divide by n, not n-1)

---

## Flexible Lookback Logic (3-Year Max / 1-Year Min)

### 1. Minimum Threshold (1 Year = 252 Trading Days)

**Constraint:** If history < 252 trading days → Return N/A

**Logic Action:** Prevents "noisy" signals from insufficient data. Funds that have been trading for less than 1 year cannot generate reliable Z-Score signals.

### 2. Flexible Window (1-3 Years = 252-756 Trading Days)

**Constraint:** If history is between 252 and 756 trading days → Use ALL available data

**Logic Action:** Allows newer funds (1-3 years old) to still generate signals using all their available history, without penalizing them for not having a full 3 years of data.

### 3. Maximum Cap (3 Years = 756 Trading Days)

**Constraint:** If history > 756 trading days → Use only the most recent 756 days

**Logic Action:** Keeps the signal relevant to modern market conditions by ignoring data older than 3 years. Even if a fund has 10 years of history, only the most recent 3 years are used.

---

## Implementation Details

### Date Range Calculation

1. **Find Most Recent Date**: Locate the most recent trading day with both Price and NAV data
2. **Calculate 3-Year Start**: Go back exactly 3 calendar years from that most recent date
3. **Filter Data**: Include all trading days within that 3-year window (from 3 years ago to most recent date)

### Premium/Discount Calculation

For each trading day in the 3-year window:
```
P/D = (Price / NAV) - 1.0
```

This gives a decimal value (e.g., 0.08112875 = 8.112875%)

### Statistical Calculations

**Average P/D (Mean):**
```
Average = Σ(P/D values) / n
```
where n = total number of trading days in the 3-year window

**STDEV.P (Population Standard Deviation):**
```
Variance = Σ((P/D - Average)²) / n
STDEV.P = √Variance
```
**Important:** Uses population standard deviation (divide by n), NOT sample standard deviation (n-1). This matches Excel's `STDEV.P` function.

**Z-Score:**
```
Z = (Current P/D - Average P/D) / STDEV.P
```

---

## Statistical Interpretation

| Z-Score Range | Signal | Interpretation |
|---------------|--------|----------------|
| **Z > +2.0** | Expensive | Premium is more than 2 standard deviations above the 3-year mean |
| **-1.0 ≤ Z ≤ +1.0** | Neutral | Trading within the "normal" range (1 std dev from mean) |
| **Z < -2.0** | Cheap | Discount is more than 2 standard deviations below the 3-year mean |

---

## Example: GAB (Expected Values)

**Date Range:** 12/28/2022 to 12/26/2025 (3 years)

**Calculated Values:**
- Current P/D: 8.112875% (0.08112875 decimal)
- Average P/D: 4.512254594% (0.04512254594 decimal)
- STDEV.P: 3.897118818% (0.03897118818 decimal)
- **Z-Score: 0.92391856**

**Verification:**
```
Z = (0.08112875 - 0.04512254594) / 0.03897118818
Z = 0.03600620406 / 0.03897118818
Z = 0.92391856 ✅
```

---

## Why 3 Years Instead of 5 Years?

1. **More Responsive**: Better reflects recent market conditions
2. **Relevance**: Reduces influence of older, potentially irrelevant market data
3. **Statistical Reliability**: Still provides 756+ data points (sufficient for statistical significance)
4. **Signal Timing**: Generates signals sooner and more accurately for investment decisions
5. **Modern Conditions**: Market dynamics can change over 5 years; 3 years keeps signals current

---

## Code Implementation

The Z-Score calculation is implemented in:
- **TypeScript**: `server/src/routes/cefs.ts` → `calculateCEFZScore()`
- **Python**: `server/scripts/calculate_zscore_tiingo.py` → `calculate_z_score_3yr()`

Both implementations follow the same logic:
1. Fetch 4 years of data (to ensure 3-year coverage)
2. Find most recent date with both Price and NAV
3. Calculate exactly 3 calendar years back from that date
4. Filter data to the 3-year window
5. Check minimum threshold (252 trading days)
6. Calculate P/D for each day
7. Calculate mean and STDEV.P (population)
8. Calculate Z-Score

---

## Testing

Test scripts are available:
- **TypeScript**: `server/scripts/test_gab_zscore_exact.ts`
- **Python**: `server/scripts/test_gab_zscore_verification.py`

Both verify the calculation matches the expected GAB values above.

---

## Database Storage

The calculated Z-Score is stored in:
- **Table**: `etf_static`
- **Column**: `five_year_z_score` (name preserved for backward compatibility, but now contains 3-year Z-Score)
- **Update**: Calculated automatically when running `npm run refresh:cef`

---

## Summary

The 3-Year Z-Score provides a statistically sound measure of whether a CEF is trading at a premium or discount relative to its recent 3-year history, with built-in safeguards:
- ✅ Minimum 1-year threshold prevents unreliable signals
- ✅ Flexible window allows newer funds to participate
- ✅ 3-year cap keeps signals relevant to current market conditions
- ✅ Population standard deviation matches Excel calculations
- ✅ Exact 3-calendar-year window from most recent trading day


