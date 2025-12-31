# CEF Signal System - CEO Explanation

## Overview

The **Signal** is a composite rating system (the "Brain") that combines **Z-Score** with **NAV Trends** to provide an actionable investment signal ranging from **-2 to +3**.

**Purpose**: Identify the best buying opportunities by combining:
1. **Value** (Z-Score - how cheap/expensive relative to history)
2. **Health** (NAV Trends - whether assets are growing or shrinking)

---

## Signal Rating Scale

| Signal | Rating | Meaning | Interpretation |
|--------|--------|---------|----------------|
| **+3** | **Optimal** | Best buying opportunity | Cheap (Z < -1.5) + Growing assets (6M & 12M trends both positive) |
| **+2** | **Good Value** | Strong buy signal | Cheap (Z < -1.5) + Short-term growth (6M trend positive) |
| **+1** | **Healthy** | Moderate buy | Not cheap, but assets growing (6M trend positive) |
| **0** | **Neutral** | Wait and watch | Neither particularly cheap nor expensive, no clear trend |
| **-1** | **Value Trap** | Avoid | Looks cheap but assets shrinking (warning sign) |
| **-2** | **Overvalued** | Sell/Avoid | Statistically expensive (Z > 1.5) |
| **N/A** | **Insufficient Data** | Cannot calculate | Fund history < 2 years (504 trading days) |

---

## How Signal is Calculated

### Inputs Required:
1. **Z-Score** (3-Year): Measures how cheap/expensive the fund is relative to its 3-year history
2. **6-Month NAV Trend**: Percentage change in NAV over the last 6 months (126 trading days)
3. **12-Month NAV Trend**: Percentage change in NAV over the last 12 months (252 trading days)

### Calculation Logic (Decision Tree):

```
IF Z-Score < -1.5 (Cheap) AND 6M Trend > 0 AND 12M Trend > 0:
    → Signal = +3 (Optimal)
    
ELSE IF Z-Score < -1.5 (Cheap) AND 6M Trend > 0:
    → Signal = +2 (Good Value)
    
ELSE IF Z-Score > -1.5 (Not Cheap) AND 6M Trend > 0:
    → Signal = +1 (Healthy)
    
ELSE IF Z-Score < -1.5 (Cheap) AND 6M Trend < 0:
    → Signal = -1 (Value Trap)
    
ELSE IF Z-Score > 1.5 (Expensive):
    → Signal = -2 (Overvalued)
    
ELSE:
    → Signal = 0 (Neutral)
```

### Requirements:
- **Minimum History**: Fund must have at least **504 trading days** (2 years) of NAV data
- **Missing Data**: If any input (Z-Score, 6M Trend, or 12M Trend) is missing, Signal = N/A

---

## What Each Signal Means in Practice

### **+3 (Optimal)** - Best Case Scenario
- **Z-Score < -1.5**: Fund is trading at a **wider discount** than usual (statistically cheap)
- **6M Trend > 0**: NAV has been **growing** over the last 6 months
- **12M Trend > 0**: NAV has been **growing** over the last 12 months
- **Action**: **Strong Buy** - Cheap price + healthy asset growth = best opportunity

**Example**: FFA might show +3 if:
- Z-Score = -3.04 (very cheap)
- 6M NAV Trend = +2.5% (assets growing)
- 12M NAV Trend = +5.0% (assets growing)

### **+2 (Good Value)** - Good Buying Opportunity
- **Z-Score < -1.5**: Fund is **cheap** relative to history
- **6M Trend > 0**: NAV is **growing** recently
- **12M Trend**: May be negative or positive (not checked)
- **Action**: **Buy** - Good value with recent positive momentum

### **+1 (Healthy)** - Moderate Opportunity
- **Z-Score > -1.5**: Not particularly cheap (trading near or above historical average)
- **6M Trend > 0**: But assets are **growing**
- **Action**: **Consider** - Not a bargain, but fund is healthy

### **0 (Neutral)** - Wait and Watch
- Fund is neither particularly cheap nor expensive
- No strong trend in either direction
- **Action**: **Monitor** - Not a priority, but not a red flag

### **-1 (Value Trap)** - Warning Sign
- **Z-Score < -1.5**: Fund looks **cheap** (wide discount)
- **6M Trend < 0**: But NAV is **shrinking** (assets declining)
- **Action**: **Avoid** - The discount might be justified by declining assets

**Why it's a trap**: A wide discount can look attractive, but if the underlying assets are shrinking, the discount may widen further or the fund may cut dividends.

### **-2 (Overvalued)** - Sell Signal
- **Z-Score > 1.5**: Fund is **statistically expensive** (trading at premium or tight discount)
- **Action**: **Sell/Avoid** - Overpriced relative to historical norms

---

## Why This System Works

### The Logic:
1. **Z-Score** tells you if the fund is cheap or expensive relative to its own history
2. **NAV Trends** tell you if the fund's underlying assets are healthy (growing) or unhealthy (shrinking)
3. **Combining both** prevents you from:
   - Buying "cheap" funds that are actually value traps (shrinking assets)
   - Missing good opportunities (cheap + growing assets)

### Real-World Example:
- **FFA**: Z-Score = -3.04 (very cheap), 6M Trend = +2.0%, 12M Trend = +3.5%
  - **Signal = +3 (Optimal)** ✅
  - This is the best scenario: cheap price + growing assets

- **Another Fund**: Z-Score = -2.5 (cheap), 6M Trend = -3.0% (shrinking)
  - **Signal = -1 (Value Trap)** ⚠️
  - Looks cheap, but assets are declining - avoid!

---

## Technical Details

### Data Requirements:
- **Z-Score**: Calculated using 3-year lookback (max 756 trading days, min 504 days)
- **6M NAV Trend**: Calculated over 126 trading days (approximately 6 months)
- **12M NAV Trend**: Calculated over 252 trading days (approximately 12 months)
- **Minimum History**: 504 trading days (2 years) required for Signal calculation

### When Signal = N/A:
1. Fund has less than 504 trading days of NAV history
2. Z-Score cannot be calculated (insufficient price/NAV data)
3. NAV Trend data is missing
4. NAV symbol is not available

### Calculation Frequency:
- Signal is recalculated whenever CEF data is refreshed
- Typically updated daily or when manual refresh is triggered

---

## Summary for CEO

**The Signal system is the "Brain" that combines:**
- **Value** (Z-Score) - Is it cheap?
- **Health** (NAV Trends) - Are assets growing?

**Best Signals:**
- **+3 (Optimal)**: Cheap + Growing = Best buying opportunity
- **+2 (Good Value)**: Cheap + Recent growth = Strong buy

**Warning Signals:**
- **-1 (Value Trap)**: Cheap but shrinking - avoid!
- **-2 (Overvalued)**: Expensive - sell/avoid

**The system automatically identifies the best opportunities by combining statistical value (Z-Score) with fundamental health (NAV trends).**


