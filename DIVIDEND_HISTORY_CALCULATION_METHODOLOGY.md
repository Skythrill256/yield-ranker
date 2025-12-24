# Dividend History Calculation Methodology

## Document Purpose
This document provides a comprehensive explanation of how dividend history is calculated, displayed, and normalized in our system. It includes exact formulas, step-by-step calculations, and real examples for verification by Gemini or other reviewers.

---

## Table of Contents
1. [Data Sources](#data-sources)
2. [Dividend Amount Types](#dividend-amount-types)
3. [Frequency Detection](#frequency-detection)
4. [Normalized Rate Calculation](#normalized-rate-calculation)
5. [Annual Dividend Totals](#annual-dividend-totals)
6. [Complete Example Calculation](#complete-example-calculation)
7. [Code Locations](#code-locations)

---

## Data Sources

### Primary Source: Tiingo API
- **Endpoint**: Tiingo Dividend History API
- **Data Retrieved**: Up to 50 years of dividend history
- **Fields Used**:
  - `exDate`: Ex-dividend date
  - `amount`: Original dividend amount (per share)
  - `adjAmount`: Split-adjusted dividend amount (per share)
  - `scaledAmount`: Price-scaled dividend amount
  - `frequency`: Payment frequency (weekly, monthly, quarterly, etc.)
  - `type`: Dividend type (Regular, Special)
  - `payDate`: Payment date
  - `recordDate`: Record date

### Data Processing
1. Fetch all dividends from Tiingo (up to 50 years)
2. Filter by time range selected by user (1W, 1M, 3M, 6M, 1Y, 3Y, 5Y, 10Y, 20Y)
3. Sort chronologically (oldest to newest for calculations, newest to oldest for display)

---

## Dividend Amount Types

### 1. Original Amount (`amount`)
- **Definition**: The actual cash dividend paid per share on the ex-dividend date
- **Source**: Tiingo API `divCash` field
- **Usage**: Displayed in table as "Amount" column
- **Example**: $0.30 per share

### 2. Adjusted Amount (`adjAmount`)
- **Definition**: Split-adjusted dividend amount
- **Calculation**: Original amount adjusted for stock splits that occurred AFTER the dividend date
- **Formula**:
  ```
  For each split that occurred AFTER dividend date:
    If forward split (splitFactor > 1):
      adjustmentFactor = adjustmentFactor × (1 / splitFactor)
    If reverse split (splitFactor < 1):
      adjustmentFactor = adjustmentFactor × splitFactor
  
  adjAmount = amount × adjustmentFactor
  ```
- **Purpose**: Makes historical dividends comparable across split events
- **Usage**: **PRIMARY VALUE** used in all charts and calculations
- **Example**: 
  - Original: $0.30
  - 2-for-1 split occurred after: $0.30 × (1/2) = $0.15 adjusted

### 3. Scaled Amount (`scaledAmount`)
- **Definition**: Price-scaled dividend amount
- **Formula**: `scaledAmount = amount × (adjClose / close)`
- **Purpose**: Scales dividends to match adjusted price series scale
- **Usage**: Fallback when adjusted amount unavailable

### Selection Priority in Code
```typescript
// Priority order:
1. adjAmount (if valid number > 0)
2. scaledAmount (if adjAmount unavailable)
3. amount (if both unavailable)
```

---

## Frequency Detection

### Method 1: API Frequency Field
- **Source**: Tiingo API `frequency` field
- **Values**: "weekly", "monthly", "quarterly", "semi-annual", "annual"
- **Normalization**: Convert to lowercase and check for keywords
  - "week" or "weekly" → weekly
  - "month" or "monthly" or "mo" → monthly
  - "quarter" or "quarterly" or "qtr" → quarterly
  - "semi" or "semi-annual" → semi-annual
  - "annual" or "yearly" → annual

### Method 2: Interval-Based Detection
- **Calculation**: Days between consecutive dividend payments
- **Logic**:
  ```typescript
  daysBetween = (nextExDate - currentExDate) / (1000 * 60 * 60 * 24)
  
  if daysBetween <= 10:      paymentsPerYear = 52  (weekly)
  else if daysBetween <= 35: paymentsPerYear = 12  (monthly)
  else if daysBetween <= 95: paymentsPerYear = 4   (quarterly)
  else if daysBetween <= 185: paymentsPerYear = 2   (semi-annual)
  else:                      paymentsPerYear = 1   (annual)
  ```

### Method 3: numPayments Prop (for CEFs)
- **Source**: Database field `numPayments` or prop passed to component
- **Usage**: Direct value (e.g., 12 = monthly, 4 = quarterly, 52 = weekly)
- **Priority**: Highest priority when available

### Frequency Change Detection
A frequency change is detected when:
1. **API Frequency Field**: Multiple unique frequency values exist in the dataset
2. **Interval Consistency Check**: Payment intervals vary by more than 20% from average
3. **Both Conditions**: Must have different frequency labels AND inconsistent intervals

**Code Logic**:
```typescript
// Check frequency field
uniqueFrequencies = Set of all frequency values in dataset
frequencyChanged = uniqueFrequencies.size > 1

// Verify with intervals
if (dividends.length >= 3) {
  intervals = days between consecutive payments
  avgInterval = mean(intervals)
  isConsistent = all intervals within 20% of avgInterval
  
  // Only show frequency change if intervals are NOT consistent
  frequencyChanged = !isConsistent && uniqueFrequencies.size > 1
}
```

---

## Normalized Rate Calculation

### Purpose
When dividend payment frequency changes (e.g., monthly to weekly), the normalized rate shows what the dividend would be if paid at the current frequency, allowing comparison across frequency changes.

### Formula
```typescript
// Step 1: Determine payments per year
if (numPayments provided):
  paymentsPerYear = numPayments
else:
  paymentsPerYear = detect from days between payments (see Frequency Detection)

// Step 2: Calculate annualized dividend from this payment
annualizedFromPayment = adjAmount × paymentsPerYear

// Step 3: Normalize to the payment frequency
normalizedRate = annualizedFromPayment / paymentsPerYear
```

**Wait - this simplifies to:**
```typescript
normalizedRate = adjAmount
```

### Correction: Actual Normalization Logic
The normalized rate should show what the payment would be if converted to a different frequency. However, the current implementation appears to just return the adjusted amount. Let me verify the actual calculation:

**Current Code (Line 238-245)**:
```typescript
if (paymentsPerYear) {
  const annualizedFromPayment = amount * paymentsPerYear;
  normalizedRate = annualizedFromPayment / paymentsPerYear;
}
```

**This simplifies to**: `normalizedRate = amount`

### Intended Behavior (Per Comments)
The normalized rate should show the equivalent payment at a standard frequency. However, the current implementation appears to be a placeholder that needs correction.

**Expected Formula** (if normalizing to monthly):
```typescript
// If current payment is quarterly ($0.30) and we want monthly equivalent:
annualized = $0.30 × 4 = $1.20/year
normalizedToMonthly = $1.20 / 12 = $0.10/month
```

**Current Implementation Issue**: The code divides by the same `paymentsPerYear` it multiplies by, resulting in no actual normalization.

---

## Annual Dividend Totals

### Calculation
For each calendar year:
```typescript
yearTotal = sum of all adjAmount values for dividends in that year

// Filter criteria:
- Only dividends where adjAmount is a valid number > 0
- Only dividends within the selected time range
- All dividend types included (Regular + Special)
```

### Example
**2024 Dividends**:
- Jan 15: $0.25 (adjAmount)
- Feb 15: $0.25 (adjAmount)
- Mar 15: $0.30 (adjAmount)
- ... (12 payments total)

**2024 Total**: $0.25 + $0.25 + $0.30 + ... = $3.20

---

## Complete Example Calculation

### Example: ETF "XYZ" with Frequency Change

#### Input Data (from Tiingo API)
```
Date       | amount | adjAmount | frequency | type
-----------|--------|-----------|-----------|--------
2024-01-15 | 0.30   | 0.30      | monthly   | Regular
2024-02-15 | 0.30   | 0.30      | monthly   | Regular
2024-03-15 | 0.30   | 0.30      | monthly   | Regular
2024-04-15 | 0.10   | 0.10      | weekly    | Regular
2024-04-22 | 0.10   | 0.10      | weekly    | Regular
2024-04-29 | 0.10   | 0.10      | weekly    | Regular
```

#### Step 1: Frequency Detection
```typescript
frequencies = ["monthly", "monthly", "monthly", "weekly", "weekly", "weekly"]
uniqueFrequencies = Set(["monthly", "weekly"])
frequencyChanged = true (2 unique frequencies)
```

#### Step 2: Interval Check
```typescript
Intervals (days between payments):
- Jan 15 to Feb 15: 31 days
- Feb 15 to Mar 15: 29 days
- Mar 15 to Apr 15: 31 days
- Apr 15 to Apr 22: 7 days
- Apr 22 to Apr 29: 7 days

Average interval = (31 + 29 + 31 + 7 + 7) / 5 = 21 days
Consistency check:
- 31 days: |31 - 21| / 21 = 0.48 (48% deviation) > 20% ❌
- 7 days: |7 - 21| / 21 = 0.67 (67% deviation) > 20% ❌

isConsistent = false
frequencyChanged = !false && 2 > 1 = true ✅
```

#### Step 3: Normalized Rate Calculation (Current Implementation)
```typescript
For each dividend:

Jan 15: $0.30
  paymentsPerYear = 12 (monthly)
  annualizedFromPayment = $0.30 × 12 = $3.60
  normalizedRate = $3.60 / 12 = $0.30 ✅ (same as adjAmount)

Apr 15: $0.10
  paymentsPerYear = 52 (weekly)
  annualizedFromPayment = $0.10 × 52 = $5.20
  normalizedRate = $5.20 / 52 = $0.10 ✅ (same as adjAmount)
```

**Issue**: Normalized rate equals adjAmount, providing no normalization benefit.

#### Step 4: Chart Display
- **Bar Chart**: Shows `adjAmount` for each payment
- **Line Chart** (when frequency changed): Shows `normalizedRate` (currently same as adjAmount)
- **Annual Totals**: Sum of all `adjAmount` values per year

---

## Code Locations

### Frontend Component
- **File**: `src/components/DividendHistory.tsx`
- **Key Functions**:
  - `individualChartData` (lines 127-283): Calculates chart data and normalized rates
  - `yearlyDividends` (lines 85-124): Calculates annual totals
  - Frequency detection (lines 132-183)
  - Normalized rate calculation (lines 196-247)

### Backend Services
- **File**: `server/src/services/metrics.ts`
- **Function**: `calculateDividendVolatility` (lines 145-385)
  - Calculates dividend volatility with frequency normalization
  - Uses annualized amounts for SD/CV calculation

### API Data Fetching
- **File**: `server/src/services/tiingo.ts`
- **Function**: `fetchDividendHistory` (lines 284-379)
  - Fetches dividend data from Tiingo
  - Calculates split adjustments
  - Calculates scaled amounts

---

## Verification Checklist for Gemini

### Questions to Verify:
1. **Normalized Rate Calculation**: 
   - Current: `normalizedRate = adjAmount` (no actual normalization)
   - Should it normalize to a standard frequency (e.g., monthly)?
   - If so, what should the formula be?

2. **Frequency Detection**:
   - Is the 20% interval consistency threshold appropriate?
   - Should we prioritize API frequency field or interval detection?

3. **Annual Totals**:
   - Should special dividends be included in annual totals?
   - Should we use `adjAmount` or `amount` for totals?

4. **Split Adjustments**:
   - Is the split adjustment logic correct?
   - Should we adjust for splits that occurred BEFORE the dividend date?

5. **Data Display**:
   - Should charts show `adjAmount` or `amount`?
   - Should the normalization line be shown even when frequency hasn't changed?

---

## Example Output for Verification

### Sample Calculation Request
**Ticker**: JEPI
**Time Range**: 1Y
**Expected Output**:
- List of all dividends with exDate, adjAmount, frequency
- Annual totals for each year
- Normalized rates (if frequency changed)
- Frequency change detection result

**Please verify**:
1. Are the adjusted amounts correct?
2. Is the frequency detection accurate?
3. Are the normalized rates meaningful?
4. Are the annual totals correct?

---

## Summary

### What We Calculate:
1. ✅ **Adjusted Amounts**: Split-adjusted dividend amounts
2. ✅ **Annual Totals**: Sum of adjusted amounts per year
3. ✅ **Frequency Detection**: Based on API field and intervals
4. ⚠️ **Normalized Rates**: Currently equals adjAmount (needs review)

### What We Display:
1. ✅ **Individual Payments Chart**: Bar chart of adjAmount
2. ✅ **Normalized Rate Line**: Line chart of normalizedRate (when frequency changed)
3. ✅ **Annual Totals Chart**: Bar chart of yearly sums
4. ✅ **Detailed Table**: All dividend records with dates and amounts

### Key Formulas:
- **adjAmount**: `amount × splitAdjustmentFactor`
- **Annual Total**: `sum(adjAmount for year)`
- **Normalized Rate**: `(adjAmount × paymentsPerYear) / paymentsPerYear = adjAmount` ⚠️

---

**Last Updated**: 2025-01-XX
**Version**: 1.0
**Status**: Ready for Gemini Review

