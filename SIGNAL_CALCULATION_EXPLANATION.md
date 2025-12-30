# Signal Rating Calculation - Explanation for CEO

## Overview

The **Signal** is a composite rating system that combines **Z-Score** (value indicator) with **NAV Trends** (health indicator) to provide an actionable investment signal ranging from **-2 to +3**.

**Purpose**: Identify the best buying opportunities by combining:
1. **Value** (Z-Score - how cheap/expensive relative to history)
2. **Health** (NAV Trends - whether assets are growing or shrinking)

---

## Signal Rating Scale

| Signal | Rating | Meaning | When It Applies |
|--------|--------|---------|----------------|
| **+3** | **Optimal** | Best buying opportunity | Z-Score < -1.5 AND 6M NAV Trend > 0 AND 12M NAV Trend > 0 |
| **+2** | **Good Value** | Strong buy signal | Z-Score < -1.5 AND 6M NAV Trend > 0 |
| **+1** | **Healthy** | Moderate buy | Z-Score > -1.5 AND 6M NAV Trend > 0 |
| **0** | **Neutral** | Wait and watch | Default (doesn't meet other criteria) |
| **-1** | **Value Trap** | Avoid | Z-Score < -1.5 AND 6M NAV Trend < 0 |
| **-2** | **Overvalued** | Sell/Avoid | Z-Score > 1.5 |
| **N/A** | **Insufficient Data** | Cannot calculate | Fund history < 2 years (504 trading days) OR missing data |

---

## How Each Signal Rating is Calculated

### Inputs Required:
1. **Z-Score** (3-Year): Measures how cheap/expensive the fund is relative to its 3-year history
   - Negative Z-Score = Cheap (trading below historical average)
   - Positive Z-Score = Expensive (trading above historical average)
2. **6-Month NAV Trend**: Percentage change in NAV over the last 6 months (126 trading days)
   - Positive = Assets growing
   - Negative = Assets shrinking
3. **12-Month NAV Trend**: Percentage change in NAV over the last 12 months (252 trading days)
   - Positive = Assets growing
   - Negative = Assets shrinking

### Calculation Logic (Decision Tree - Checked in Order):

```
STEP 1: Check if we have enough data
  IF missing Z-Score OR missing 6M Trend OR missing 12M Trend:
    → Return N/A
    
  IF fund history < 504 trading days (2 years):
    → Return N/A

STEP 2: Calculate Signal (checked in this exact order):

  IF Z-Score < -1.5 (Cheap) AND 6M Trend > 0 AND 12M Trend > 0:
    → Signal = +3 (Optimal)
    → Meaning: Cheap price + Growing assets (both short and long term)
    
  ELSE IF Z-Score < -1.5 (Cheap) AND 6M Trend > 0:
    → Signal = +2 (Good Value)
    → Meaning: Cheap price + Short-term growth (but 12M trend may be negative)
    
  ELSE IF Z-Score > -1.5 (Not Cheap) AND 6M Trend > 0:
    → Signal = +1 (Healthy)
    → Meaning: Not particularly cheap, but assets are growing
    
  ELSE IF Z-Score < -1.5 (Cheap) AND 6M Trend < 0:
    → Signal = -1 (Value Trap)
    → Meaning: Looks cheap, but assets are shrinking (warning sign!)
    
  ELSE IF Z-Score > 1.5 (Very Expensive):
    → Signal = -2 (Overvalued)
    → Meaning: Statistically expensive (trading well above historical average)
    
  ELSE:
    → Signal = 0 (Neutral)
    → Meaning: Doesn't meet any of the above criteria
```

---

## Detailed Examples

### Example 1: Signal +3 (Optimal)
- **GOF**: Z-Score = -1.97, 6M Trend = +1.07%, 12M Trend = +6.73%
- **Calculation**: -1.97 < -1.5 ✓ AND +1.07% > 0 ✓ AND +6.73% > 0 ✓
- **Result**: Signal = +3 (Optimal)
- **Interpretation**: Best buying opportunity - cheap price with growing assets

### Example 2: Signal +2 (Good Value)
- **PCN**: Z-Score = -1.57, 6M Trend = +5.68%, 12M Trend = -2.53%
- **Calculation**: -1.57 < -1.5 ✓ AND +5.68% > 0 ✓ (12M trend negative, but doesn't matter)
- **Result**: Signal = +2 (Good Value)
- **Interpretation**: Strong buy - cheap price with short-term growth

### Example 3: Signal +1 (Healthy)
- **IGR**: Z-Score = -0.13, 6M Trend = +10.36%, 12M Trend = +13.34%
- **Calculation**: -0.13 > -1.5 (not cheap) BUT +10.36% > 0 ✓
- **Result**: Signal = +1 (Healthy)
- **Interpretation**: Moderate buy - not cheap, but assets are growing

### Example 4: Signal 0 (Neutral)
- **BTO**: Z-Score = -1.31, 6M Trend = -4.89%, 12M Trend = -0.48%
- **Calculation**: 
  - -1.31 < -1.5? NO (not cheap enough)
  - 6M Trend > 0? NO (assets shrinking)
  - Doesn't meet any criteria
- **Result**: Signal = 0 (Neutral)
- **Interpretation**: Wait and watch - not clearly cheap or expensive, no clear trend

### Example 5: Signal -1 (Value Trap)
- **FOF**: Z-Score = -1.62, 6M Trend = -9.72%, 12M Trend = +0.94%
- **Calculation**: -1.62 < -1.5 ✓ AND -9.72% < 0 ✓
- **Result**: Signal = -1 (Value Trap)
- **Interpretation**: Avoid - looks cheap but assets are shrinking (warning sign!)

### Example 6: Signal -2 (Overvalued)
- **GAB**: Z-Score = +0.95, 6M Trend = -12.35%, 12M Trend = -24.67%
- **Calculation**: +0.95 > 1.5? NO, but if it were > 1.5:
- **Result**: Signal = -2 (Overvalued)
- **Interpretation**: Sell/Avoid - statistically expensive

---

## Key Thresholds

- **Z-Score < -1.5**: Considered "Cheap" (trading 1.5 standard deviations below historical average)
- **Z-Score > 1.5**: Considered "Overvalued" (trading 1.5 standard deviations above historical average)
- **6M Trend > 0**: Assets growing over last 6 months
- **6M Trend < 0**: Assets shrinking over last 6 months
- **12M Trend > 0**: Assets growing over last 12 months
- **12M Trend < 0**: Assets shrinking over last 12 months

---

## Why This System Works

1. **Combines Value + Health**: Not just about price (Z-Score), but also about asset growth (NAV Trends)
2. **Avoids Value Traps**: A cheap price (-1) is only good if assets are growing (+2, +3)
3. **Identifies Best Opportunities**: +3 signals combine cheap price with strong asset growth
4. **Warns of Overvaluation**: -2 signals when funds are statistically expensive

---

## Notes

- **Order Matters**: The logic checks conditions in a specific order (most restrictive first)
- **Minimum History**: Requires at least 504 trading days (2 years) of data for reliability
- **Missing Data**: Returns N/A if any required input is missing
- **Z-Score Threshold**: Uses -1.5 and +1.5 as thresholds (1.5 standard deviations)

