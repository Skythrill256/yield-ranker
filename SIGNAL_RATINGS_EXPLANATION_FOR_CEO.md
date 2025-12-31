# Signal Ratings Explanation (-2 to +3)

## Overview

The Signal rating is a composite score that combines **Z-Score** (premium/discount valuation) and **NAV Trends** (asset health) to provide a quick investment signal for Closed-End Funds (CEFs).

---

## Rating Scale

| Signal | Health Rating | Meaning    | Simple Interpretation                                |
| ------ | ------------- | ---------- | ---------------------------------------------------- |
| **+3** | **High**      | Optimal    | The fund is historically cheap and growing strongly. |
| **+2** | **Good**      | Good Value | The fund is healthy, but one metric is slightly off. |
| **+1** | **Weak**      | Healthy    | Only one of the three metrics shows positive health. |
| **0**  | **Low**       | Neutral    | None of the health or value metrics are currently met. |
| **-1** | **Low**       | Value Trap | Warning: Looks cheap but assets shrinking            |
| **-2** | **Low**       | Overvalued | Avoid: Statistically expensive                       |

---

## Required Inputs

1. **Z-Score** (3-Year): How cheap/expensive the CEF is relative to its historical average

   - Negative = Cheap (below average premium/discount)
   - Positive = Expensive (above average premium/discount)
   - Threshold: **-1.5** (1.5 standard deviations)

2. **6-Month NAV Trend**: Percentage change in Net Asset Value over last 6 months

   - Positive = Assets growing
   - Negative = Assets shrinking
   - Uses **adjusted NAV prices** (accounts for distributions)

3. **12-Month NAV Trend**: Percentage change in Net Asset Value over last 12 months
   - Positive = Assets growing
   - Negative = Assets shrinking
   - Uses **adjusted NAV prices** (accounts for distributions)

---

## Calculation Logic (Decision Tree)

The system uses a simple decision tree to assign ratings:

### Step 1: Check if Optimal (+3)

**Condition:** `Z-Score < -1.5` AND `6M NAV Trend > 0` AND `12M NAV Trend > 0`

- **Meaning:** Cheap price + Both short-term and long-term asset growth
- **Signal:** Best opportunity - buy when undervalued with strong asset health

### Step 2: Check if Good Value (+2) - Health Rating: Good

**Condition:** `Z-Score < -1.5` AND `6M NAV Trend > 0` (12M can be anything)

- **Health Rating:** Good
- **Meaning:** Cheap price + Recent asset growth (6 months)
- **Simple Interpretation:** The fund is healthy, but one metric is slightly off.

### Step 3: Check if Healthy (+1) - Health Rating: Weak

**Condition:** `Z-Score > -1.5` AND `6M NAV Trend > 0`

- **Health Rating:** Weak
- **Meaning:** Not cheap, but assets are growing
- **Simple Interpretation:** Only one of the three metrics shows positive health.

### Step 4: Check if Value Trap (-1) - Health Rating: Low

**Condition:** `Z-Score < -1.5` AND `6M NAV Trend < 0`

- **Health Rating:** Low
- **Meaning:** Looks cheap, but assets are shrinking
- **Simple Interpretation:** Warning - don't be fooled by low price if assets declining

### Step 5: Check if Overvalued (-2) - Health Rating: Low

**Condition:** `Z-Score > 1.5`

- **Health Rating:** Low
- **Meaning:** Statistically expensive (more than 1.5 standard deviations above average)
- **Simple Interpretation:** Avoid - paying too much relative to historical average

### Step 6: Default to Neutral (0) - Health Rating: Low

**Condition:** None of the above conditions met

- **Health Rating:** Low
- **Meaning:** No clear signal from the data
- **Simple Interpretation:** None of the health or value metrics are currently met.

---

## Examples

### Example 1: Rating +3 (Optimal)

- **Z-Score:** -2.0 (cheap)
- **6M NAV Trend:** +5.2% (growing)
- **12M NAV Trend:** +8.1% (growing)
- **Result:** +3 (Optimal - cheap with strong asset growth)

### Example 2: Rating +2 (Good Value) - Health Rating: Good

- **Z-Score:** -1.8 (cheap)
- **6M NAV Trend:** +3.5% (growing)
- **12M NAV Trend:** -2.1% (declining)
- **Result:** +2 (Good Value - Health Rating: Good)
- **Interpretation:** The fund is healthy, but one metric is slightly off.

### Example 3: Rating +1 (Healthy) - Health Rating: Weak

- **Z-Score:** -0.5 (slightly cheap, but not significantly)
- **6M NAV Trend:** +4.2% (growing)
- **12M NAV Trend:** +6.3% (growing)
- **Result:** +1 (Healthy - Health Rating: Weak)
- **Interpretation:** Only one of the three metrics shows positive health.

### Example 4: Rating -1 (Value Trap) - Health Rating: Low

- **Z-Score:** -2.1 (cheap)
- **6M NAV Trend:** -3.8% (shrinking)
- **12M NAV Trend:** -5.2% (shrinking)
- **Result:** -1 (Value Trap - Health Rating: Low)
- **Interpretation:** Warning - looks cheap but assets declining

### Example 5: Rating -2 (Overvalued) - Health Rating: Low

- **Z-Score:** +2.3 (expensive)
- **6M NAV Trend:** +2.1% (growing)
- **12M NAV Trend:** +4.5% (growing)
- **Result:** -2 (Overvalued - Health Rating: Low)
- **Interpretation:** Avoid - paying too much relative to historical average

### Example 6: Rating 0 (Neutral) - Health Rating: Low

- **Z-Score:** -0.8 (slightly cheap)
- **6M NAV Trend:** -1.2% (slightly shrinking)
- **12M NAV Trend:** +1.5% (slightly growing)
- **Result:** 0 (Neutral - Health Rating: Low)
- **Interpretation:** None of the health or value metrics are currently met.

---

## Important Notes

1. **Minimum History Required:** CEF must have at least **504 trading days** (2 years) of NAV history to calculate Signal rating. Otherwise, Signal = `null`.

2. **Adjusted NAV Prices:** Both 6M and 12M NAV trends use **adjusted NAV prices** (accounts for distributions) to ensure accurate trend calculations.

3. **Z-Score Threshold:** The threshold of **±1.5** standard deviations represents a statistically significant deviation from the historical average premium/discount.

4. **Priority Order:** The decision tree checks conditions in order (Optimal → Good Value → Healthy → Value Trap → Overvalued → Neutral). The first matching condition determines the rating.

---

## Summary

The Signal rating provides a quick, actionable investment signal by combining:

- **Valuation** (Z-Score: cheap vs. expensive)
- **Asset Health** (NAV Trends: growing vs. shrinking)

**Best Opportunities:** +3 and +2 ratings (cheap with growth)
**Avoid:** -2 and -1 ratings (expensive or value traps)
**Neutral:** 0 and +1 ratings (no clear signal or healthy but not a bargain)
