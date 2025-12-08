# Current DVI Formula Implementation (As of Latest Code)

## Exact Formula Currently Implemented

### Time Period
- **Method**: Rolling window from today
- **Default Period**: 365 days backwards from today
- **Calculation**: `periodStartDate = Today - 365 days`
- **NOT**: Fixed date range (e.g., 1/1/25 - 12/7/25)

### Step 1: Collect Dividends
- Filter to regular dividends only (exclude special dividends)
- Use **adjusted amounts** (`adj_amount`) - accounts for stock splits
- Only dividends with `ex_date >= periodStartDate`
- Exclude zero or null amounts

### Step 2: Annualize Each Payment
For each dividend payment:

1. **Detect Frequency** based on days between consecutive payments:
   - Days ≤ 10 → Frequency = 52 (Weekly)
   - 10 < Days ≤ 35 → Frequency = 12 (Monthly)
   - 35 < Days ≤ 95 → Frequency = 4 (Quarterly)
   - 95 < Days ≤ 185 → Frequency = 2 (Semi-annual)
   - Days > 185 → Frequency = 1 (Annual)

2. **Annualize**: `Annualized = adj_amount × Frequency`

### Step 3: Select Payments for Calculation
- **Rule**: If `n ≥ 12` payments → Use **most recent 12** annualized payments
- **Rule**: If `n < 12` payments → Use **ALL** annualized payments
- **Minimum**: At least 2 payments required

### Step 4: Calculate Statistics

**Mean** (for SD calculation):
```
μ = Σ(Annualized_i) / n
```

**Standard Deviation** (Population SD):
```
σ² = Σ(Annualized_i - μ)² / n
σ = √σ²
```

**Median**:
- Sort annualized amounts ascending
- If n is odd: `Median = Annualized[(n-1)/2]`
- If n is even: `Median = (Annualized[n/2-1] + Annualized[n/2]) / 2`

### Step 5: Calculate DVI
```
DVI = (σ / Median) × 100
DVI = Round(DVI, 1 decimal place)
```

## Key Differences from CEO's Spreadsheet

### 1. Time Period
- **CEO**: Fixed range 1/1/25 - 12/7/25 (340 days)
- **Website**: Rolling 365 days from today (changes daily)

### 2. Payment Selection
- **CEO**: Uses ALL payments in the date range
- **Website**: Uses most recent 12 if available, otherwise all

### 3. Frequency Detection
- **CEO**: Based on spreadsheet logic (may differ)
- **Website**: Based on days between consecutive payments

## Current Implementation Details

**File**: `server/src/services/metrics.ts`
**Function**: `calculateDividendVolatility()`

**Line 177-179**: Time period calculation
```typescript
const periodDays = periodInMonths === 6 ? 180 : 365;
const periodStartDate = new Date();
periodStartDate.setDate(periodStartDate.getDate() - periodDays);
```

**Line 239-243**: Payment selection
```typescript
const n = normalizedAnnualAmounts.length;
const finalNormalizedAmounts =
  n >= 12 ? normalizedAnnualAmounts.slice(-12) : normalizedAnnualAmounts;
```

**Line 248-253**: Median calculation
```typescript
const sortedAmounts = [...finalNormalizedAmounts].sort((a, b) => a - b);
const median = sortedAmounts.length % 2 === 0
  ? (sortedAmounts[sortedAmounts.length / 2 - 1] + sortedAmounts[sortedAmounts.length / 2]) / 2
  : sortedAmounts[Math.floor(sortedAmounts.length / 2)];
```

**Line 261-268**: Standard Deviation (Population SD)
```typescript
const mean = calculateMean(finalNormalizedAmounts);
let varianceSum = 0;
for (const val of finalNormalizedAmounts) {
  const diff = val - mean;
  varianceSum += diff * diff;
}
const variance = varianceSum / finalNormalizedAmounts.length;
const standardDeviation = Math.sqrt(variance);
```

**Line 282-284**: CV Calculation
```typescript
const cvPercentRaw = (standardDeviation / median) * 100;
const roundedCVPercent = Math.round(cvPercentRaw * 10) / 10;
```

## Summary

**Formula**: `DVI = (SD / MEDIAN) × 100` where:
- SD = Population standard deviation of annualized amounts
- MEDIAN = Median of annualized amounts
- All calculations use annualized amounts (not raw)

**Time Period**: Rolling 365 days from today (not fixed date range)

**Payment Selection**: Most recent 12 if available, otherwise all

