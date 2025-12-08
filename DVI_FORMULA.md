# Dividend Volatility Index (DVI) - Exact Formula

## Overview
The Dividend Volatility Index (DVI) measures the stability of dividend payments by calculating the Coefficient of Variation (CV) on annualized dividend amounts.

## Formula

### Step 1: Define the Dividend Period
- **Default Period**: 12 months (365 days) from today
- **Alternative Period**: 6 months (180 days) for closed-end funds
- **Period Start Date**: `Today - periodDays`

### Step 2: Collect Adjusted Dividends
Filter dividends to include only:
- Regular dividends (exclude special dividends)
- Dividends with `ex_date` (actual ex-date payments)
- Use **adjusted amounts** (`adj_amount`) to account for stock splits
- Exclude zero or null amounts
- Only dividends within the period: `ex_date >= periodStartDate`

### Step 3: Annualize Each Payment
For each dividend payment `i`:

1. **Detect Frequency** based on days between consecutive payments:
   - If `daysBetween ≤ 10` → Frequency = 52 (Weekly)
   - If `10 < daysBetween ≤ 35` → Frequency = 12 (Monthly)
   - If `35 < daysBetween ≤ 95` → Frequency = 4 (Quarterly)
   - If `95 < daysBetween ≤ 185` → Frequency = 2 (Semi-annual)
   - If `daysBetween > 185` → Frequency = 1 (Annual)

2. **Calculate Annualized Amount**:
   ```
   Annualized_i = Adjusted_Dividend_i × Frequency_i
   ```

### Step 4: Select Payments for Calculation
- If `n ≥ 12` payments: Use the **most recent 12** annualized payments
- If `n < 12` payments: Use **ALL** available annualized payments
- Minimum requirement: At least 2 payments

### Step 5: Calculate Standard Deviation (SD)
Using **Population Standard Deviation** (not sample):

1. Calculate **Mean** of annualized amounts:
   ```
   μ = (Σ Annualized_i) / n
   ```

2. Calculate **Variance**:
   ```
   σ² = Σ(Annualized_i - μ)² / n
   ```

3. Calculate **Standard Deviation**:
   ```
   σ = √σ²
   ```

### Step 6: Calculate Median
Sort annualized amounts in ascending order, then:
- If `n` is **odd**: `Median = Annualized[(n-1)/2]`
- If `n` is **even**: `Median = (Annualized[n/2-1] + Annualized[n/2]) / 2`

### Step 7: Calculate Coefficient of Variation (CV)
```
CV (%) = (σ / Median) × 100
```

**Key Point**: CV uses **MEDIAN**, not mean, as the denominator.

### Step 8: Round Result
```
DVI = Round(CV, 1 decimal place)
```

### Step 9: Categorize Volatility Index
- `DVI < 5%` → "Very Low"
- `5% ≤ DVI < 10%` → "Low"
- `10% ≤ DVI < 20%` → "Moderate"
- `20% ≤ DVI < 30%` → "High"
- `DVI ≥ 30%` → "Very High"

## Complete Formula Summary

```
Given:
  - Period: 12 months (365 days) from today
  - Dividends: {D₁, D₂, ..., Dₙ} where each Dᵢ = (adj_amount, ex_date)
  - Frequency detection: Based on days between consecutive payments

Step 1: Annualize each payment
  Annualized_i = adj_amount_i × Frequency_i

Step 2: Select payments
  If n ≥ 12: Use last 12 annualized payments
  If n < 12: Use all annualized payments

Step 3: Calculate statistics
  μ = Mean(Annualized) = Σ Annualized_i / n
  σ = √(Σ(Annualized_i - μ)² / n)  [Population SD]
  Median = Median(Annualized)

Step 4: Calculate DVI
  DVI = (σ / Median) × 100
  DVI = Round(DVI, 1 decimal)
```

## Example Calculation

**Scenario**: ETF pays $0.30 quarterly, then switches to $0.10 monthly

**Raw Payments**: [$0.30, $0.30, $0.30, $0.10, $0.10, $0.10]

**Step 1: Annualize**
- $0.30 quarterly → $0.30 × 4 = $1.20 annual
- $0.10 monthly → $0.10 × 12 = $1.20 annual

**Annualized**: [$1.20, $1.20, $1.20, $1.20, $1.20, $1.20]

**Step 2: Calculate**
- Mean (μ) = $1.20
- SD (σ) = 0 (all values identical)
- Median = $1.20

**Step 3: DVI**
- DVI = (0 / $1.20) × 100 = 0.0%

**Result**: DVI = 0.0% (Very Low volatility) - correctly shows stability despite frequency change

## Key Principles

1. **Always use adjusted amounts** (`adj_amount`) to account for stock splits
2. **Annualize FIRST**, then calculate statistics on annualized values
3. **Use MEDIAN** (not mean) for CV calculation
4. **Use Population SD** (divide by n, not n-1)
5. **Frequency detection** is per-payment based on actual payment intervals

## Implementation Notes

- Time Period: Configurable (default 12 months, supports 6 months)
- Minimum Payments: 2 required for calculation
- Payment Selection: Most recent 12 if available, otherwise all
- Rounding: 1 decimal place
- Frequency Detection: Based on days between consecutive payments (prefers interval TO payment)

