# Fund Ranking Formulas

This document describes the ranking formulas used to rank both Covered Call Option ETFs (CC ETFs) and Closed-End Funds (CEFs) in the Yield Ranker application.

## Overview

Both ranking systems use a **weighted scoring approach** where multiple factors are normalized to a 0-1 scale, weighted by user-defined percentages, and then summed to produce a final ranking score. Funds are then sorted by this score in descending order.

---

## Covered Call Option ETFs (CC ETFs) Ranking

**File:** `src/utils/ranking.ts`

### Formula Components

The ranking score is calculated as:

```
Final Score = (Yield Score × Yield Weight) + (Volatility Score × Volatility Weight) + (Return Score × Return Weight)
```

Where:
- **Yield Score** = Normalized forward yield (0-1 scale)
- **Volatility Score** = Normalized dividend volatility (0-1 scale, inverted - lower volatility = higher score)
- **Return Score** = Normalized total return (0-1 scale)

### Input Fields

1. **Yield**: `forwardYield` (Forward Dividend Yield %)
2. **Volatility**: `dividendCVPercent` (Dividend Coefficient of Variation %) or `standardDeviation` (fallback)
3. **Return**: Timeframe-dependent:
   - 3 months: `trDrip3Mo` or `totalReturn3Mo` (fallback)
   - 6 months: `trDrip6Mo` or `totalReturn6Mo` (fallback)
   - 12 months: `trDrip12Mo` or `totalReturn12Mo` (fallback)

### Normalization Functions

#### 1. Yield Normalization
```typescript
normalizeYield(value) = {
  if (value === null || value <= 0) return 0;
  if (maxYield === minYield) return 0.5;
  return (value - minYield) / (maxYield - minYield);
}
```
- **Range**: 0 to 1
- **Higher yield = Higher score**
- Uses min/max across all ETFs in the dataset

#### 2. Volatility Normalization (Inverted)
```typescript
normalizeVolatility(value) = {
  if (value === null || value < 0) return 0.5;
  if (maxVol === minVol) return 0.5;
  return (maxVol - value) / (maxVol - minVol);
}
```
- **Range**: 0 to 1
- **Lower volatility = Higher score** (inverted)
- Uses min/max across all ETFs in the dataset
- Defaults to 0.5 if value is null or negative

#### 3. Return Normalization
```typescript
normalizeReturn(value) = {
  if (value === null) return 0;
  if (maxReturn === minReturn) return 0.5;
  return (value - minReturn) / (maxReturn - minReturn);
}
```
- **Range**: 0 to 1
- **Higher return = Higher score**
- Uses min/max across all ETFs in the dataset

### Default Weights

The weights are user-configurable but typically sum to 100%:
- **Yield Weight**: User-defined percentage (e.g., 40%)
- **Volatility Weight**: User-defined percentage (e.g., 30%)
- **Return Weight**: User-defined percentage (e.g., 30%)

### Example Calculation

Given an ETF with:
- Forward Yield: 12%
- Dividend CV: 8%
- 12-Month Return: 15%

And dataset ranges:
- Yields: 5% to 15% (min=5%, max=15%)
- Volatilities: 2% to 20% (min=2%, max=20%)
- Returns: -5% to 25% (min=-5%, max=25%)

With weights: Yield=40%, Volatility=30%, Return=30%

```
Yield Score = (12 - 5) / (15 - 5) = 7/10 = 0.70
Volatility Score = (20 - 8) / (20 - 2) = 12/18 = 0.67
Return Score = (15 - (-5)) / (25 - (-5)) = 20/30 = 0.67

Final Score = (0.70 × 0.40) + (0.67 × 0.30) + (0.67 × 0.30)
            = 0.28 + 0.201 + 0.201
            = 0.682
```

---

## Closed-End Funds (CEFs) Ranking

**File:** `src/utils/cefRanking.ts`

### Formula Components

The ranking score is calculated as:

```
Final Score = (Yield Score × Yield Weight) + (Z-Score Score × Volatility Weight) + (Return Score × Return Weight)
```

Where:
- **Yield Score** = Normalized forward yield (0-1 scale)
- **Z-Score Score** = Normalized 5-year Z-Score (0-1 scale)
- **Return Score** = Normalized total return (0-1 scale)

### Input Fields

1. **Yield**: `forwardYield` (Forward Dividend Yield %)
2. **Z-Score**: `fiveYearZScore` (5-Year Premium/Discount Z-Score)
3. **Return**: Timeframe-dependent:
   - 3 months: `return3Mo`
   - 6 months: `return6Mo`
   - 12 months: `return12Mo`

### Normalization Functions

#### 1. Yield Normalization
```typescript
normalizeYield(value) = {
  if (value === null || value <= 0) return 0;
  if (maxYield === minYield) return 0.5;
  return (value - minYield) / (maxYield - minYield);
}
```
- **Range**: 0 to 1
- **Higher yield = Higher score**
- Uses min/max across all CEFs in the dataset

#### 2. Z-Score Normalization
```typescript
normalizeZScore(value) = {
  if (value === null) return 0.5;
  if (maxZScore === minZScore) return 0.5;
  return (value - minZScore) / (maxZScore - minZScore);
}
```
- **Range**: 0 to 1
- **Higher Z-Score = Higher score** (more negative Z-Score = better value, but normalization makes higher = better)
- Uses min/max across all CEFs in the dataset
- Default range: -3 to +3 (if no data, uses these bounds)
- Defaults to 0.5 if value is null

**Note on Z-Score**: A more negative Z-Score indicates the fund is trading at a larger discount to NAV (better value). However, the normalization formula `(value - min) / (max - min)` will convert this so that more negative values get lower normalized scores. If you want more negative Z-Scores to rank higher, you may need to invert this normalization.

#### 3. Return Normalization
```typescript
normalizeReturn(value) = {
  if (value === null) return 0;
  if (maxReturn === minReturn) return 0.5;
  return (value - minReturn) / (maxReturn - minReturn);
}
```
- **Range**: 0 to 1
- **Higher return = Higher score**
- Uses min/max across all CEFs in the dataset

### Default Weights

The weights are user-configurable but typically sum to 100%:
- **Yield Weight**: User-defined percentage (e.g., 40%)
- **Volatility Weight** (Z-Score): User-defined percentage (e.g., 30%)
- **Return Weight**: User-defined percentage (e.g., 30%)

### Example Calculation

Given a CEF with:
- Forward Yield: 10%
- 5-Year Z-Score: -1.5
- 12-Month Return: 12%

And dataset ranges:
- Yields: 3% to 15% (min=3%, max=15%)
- Z-Scores: -2.5 to +1.0 (min=-2.5, max=+1.0)
- Returns: -10% to 20% (min=-10%, max=+20%)

With weights: Yield=40%, Volatility=30%, Return=30%

```
Yield Score = (10 - 3) / (15 - 3) = 7/12 = 0.58
Z-Score Score = (-1.5 - (-2.5)) / (1.0 - (-2.5)) = 1.0 / 3.5 = 0.29
Return Score = (12 - (-10)) / (20 - (-10)) = 22/30 = 0.73

Final Score = (0.58 × 0.40) + (0.29 × 0.30) + (0.73 × 0.30)
            = 0.232 + 0.087 + 0.219
            = 0.538
```

---

## Key Differences Between ETF and CEF Ranking

| Aspect | CC ETFs | CEFs |
|--------|---------|------|
| **Volatility Metric** | Dividend CV % or Standard Deviation | 5-Year Premium/Discount Z-Score |
| **Volatility Interpretation** | Lower volatility = Better (inverted) | More negative Z-Score = Better value (but normalization may need adjustment) |
| **Return Field** | `trDrip*Mo` (DRIP-adjusted) with `totalReturn*Mo` fallback | `return*Mo` (direct field) |
| **Default Volatility** | 0.5 if null/negative | 0.5 if null |

---

## Implementation Notes

1. **Min/Max Calculation**: Both systems calculate min/max values across the entire dataset for normalization. This ensures relative ranking within the current dataset.

2. **Null Handling**: 
   - Missing values are handled gracefully (return 0 or 0.5 depending on the metric)
   - Funds with missing critical data may rank lower

3. **Edge Cases**:
   - If all funds have the same value for a metric, normalization returns 0.5 (neutral score)
   - Negative yields/returns are filtered out or handled as 0

4. **Sorting**: After calculating scores, funds are sorted in **descending order** (highest score = rank #1).

5. **User Customization**: Users can adjust the weights for each component, allowing them to prioritize yield, volatility, or returns based on their investment strategy.

---

## Potential Improvements for Gemini Review

1. **Z-Score Normalization**: The current CEF Z-Score normalization may not correctly handle the fact that more negative Z-Scores are better. Consider inverting: `(maxZScore - value) / (maxZScore - minZScore)`.

2. **Weighted Average vs. Sum**: Currently using a simple weighted sum. Consider if a weighted average (dividing by sum of weights) would be more appropriate.

3. **Outlier Handling**: Consider using percentile-based normalization (e.g., 5th-95th percentile) instead of min/max to reduce impact of outliers.

4. **Missing Data Penalty**: Currently missing data defaults to 0 or 0.5. Consider a more explicit penalty system.

5. **Timeframe Consistency**: Ensure the selected timeframe (3mo/6mo/12mo) is consistently applied across all metrics.

