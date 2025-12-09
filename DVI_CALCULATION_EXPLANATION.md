# DVI Calculation Explanation

## Overview

The Dividend Volatility Index (DVI) is calculated using the Coefficient of Variation (CV) method, which measures the consistency of dividend payments. This document explains exactly how we arrive at the DVI percentage for any ETF.

## How We Calculate DVI: Step-by-Step Process

### Step 1: Collect Adjusted Dividends (Last 12 Months)

We gather all adjusted dividend payments from the last 365 days. Adjusted dividends account for stock splits, ensuring accurate historical comparisons.

**Example for TSLY:**
- Period: December 9, 2024 to December 9, 2025
- Total dividends collected: 19 payments

### Step 2: Automatically Detect Frequency & Annualize Each Payment

For each dividend payment, we automatically detect its frequency based on:
1. **Database frequency field** (if available)
2. **Payment intervals** (days between consecutive payments)

**Frequency Multipliers:**
- Weekly payments: Multiply by **52**
- Monthly payments: Multiply by **12**
- Quarterly payments: Multiply by **4**

**Annualization Formula:** `Annualized Amount = Adjusted Dividend × Frequency`

**Example for TSLY:**
- Payment on 2024-12-27: $6.43 (monthly) → $6.43 × 12 = **$77.16**
- Payment on 2025-10-16: $0.969 (weekly) → $0.969 × 52 = **$50.39**
- Payment on 2025-12-04: $0.935 (weekly) → $0.935 × 52 = **$48.62**

**Example for GOOY:**
- Payment on 2024-12-27: $0.6332 (monthly) → $0.6332 × 12 = **$7.60**
- Payment on 2025-10-16: $0.1635 (weekly) → $0.1635 × 52 = **$8.50**
- Payment on 2025-12-04: $0.2508 (weekly) → $0.2508 × 52 = **$13.04**

### Step 3: Calculate Statistics on Annualized Amounts

We calculate two key statistics on the **annualized amounts** (not the raw payments):

**Mean (Average):** Sum of all annualized amounts ÷ Number of payments

**Standard Deviation (SD):** Measures how spread out the annualized amounts are
- Formula: √[Σ(x - mean)² / (n-1)]
- Uses sample standard deviation (divide by n-1, not n)

**Example for TSLY:**
- Mean: **$36.19**
- Standard Deviation: **$14.37**
- Variance: 206.60

**Example for GOOY:**
- Mean: **$7.13**
- Standard Deviation: **$3.36**
- Variance: 11.28

### Step 4: Calculate Coefficient of Variation (CV) = DVI

**Formula:** `CV = (Standard Deviation / Mean) × 100`

This gives us the DVI as a percentage.

**Example for TSLY:**
- CV = ($14.37 / $36.19) × 100
- CV = **39.70%**

**Example for GOOY:**
- CV = ($3.36 / $7.13) × 100
- CV = **47.10%**

## Why This Method Works

1. **Frequency Normalization:** By annualizing each payment first, we can compare ETFs with different payment frequencies (weekly vs. monthly vs. quarterly) on an equal basis.

2. **Accurate Volatility Measurement:** Calculating SD on annualized amounts (rather than raw payments) prevents frequency changes from artificially inflating volatility.

3. **Automatic Detection:** The system automatically detects frequency for each payment, handling transitions (e.g., monthly to weekly) correctly.

## Verification Results

### TSLY
- **Calculated DVI:** 39.70%
- **Expected DVI:** 39.70%
- **Status:** ✅ **MATCHES**

### GOOY
- **Calculated DVI:** 47.10%
- **Expected DVI:** 47.1%
- **Status:** ✅ **MATCHES**

## Key Points

1. **Same Process for All ETFs:** The calculation method is identical for every ETF - just enter the symbol and time period.

2. **Automatic Frequency Detection:** No manual input needed - the system detects whether each payment is weekly (52x), monthly (12x), or quarterly (4x).

3. **Uses Adjusted Dividends:** All calculations use split-adjusted amounts for accuracy.

4. **12-Month Period:** Uses the last 365 days of dividend history.

5. **Sample Standard Deviation:** Uses (n-1) in the denominator for statistical accuracy.

## How to Run the Calculation

The calculation runs automatically when:
- Metrics are recalculated: `npm run recalc:metrics`
- Data is refreshed: `npm run refresh:all`
- Individual ticker is updated: `npm run refresh:ticker TSLY`

To see a detailed breakdown for any ticker:
```bash
cd server
npm run breakdown:dvi
```

This will show the complete step-by-step calculation for both TSLY and GOOY.

## Summary

The DVI calculation is **fully automated** and works the same way for all ETFs:
1. Collect adjusted dividends (12 months)
2. Detect frequency automatically
3. Annualize each payment
4. Calculate Mean and SD on annualized amounts
5. Calculate CV = (SD / Mean) × 100

**Result:** Accurate DVI percentage that matches spreadsheet calculations.

