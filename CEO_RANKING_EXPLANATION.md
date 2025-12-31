# CEO Ranking Discrepancy Explanation

## The Problem You're Seeing

**✅ 100% YIELD**: Website matches your manual calculation  
**✅ 100% Z-SCORE**: Website matches your manual calculation  
**❌ 50% YIELD + 50% Z-SCORE**: Website does NOT match your manual calculation

## Why This Happens

### Why 100% Single Metric Works

When you use **100% for one metric**, both ranking methods give the **same result**:

**Rank-Based Method (Your Manual Calculation):**
- Total Score = (YIELD Rank × 100%) = YIELD Rank
- Sorting by Total Score = Sorting by YIELD Rank
- **Result**: Same as ranking by YIELD alone ✅

**Normalized Score Method (Website Currently Uses):**
- Total Score = (Normalized Yield × 100%) = Normalized Yield  
- Sorting by Total Score = Sorting by Normalized Yield
- Since normalized scores preserve order, this = Sorting by YIELD
- **Result**: Same as ranking by YIELD alone ✅

**Both methods work the same for single metrics** because you're just sorting by that one metric.

### Why Combined Metrics Don't Match

When you combine **50% YIELD + 50% Z-SCORE**, the two methods produce **different results**:

**Rank-Based Method (Your Manual Calculation):**
```
FOF:  (5 × 0.50) + (8 × 0.50) = 2.5 + 4.0 = 6.5
DNP:  (6 × 0.50) + (9 × 0.50) = 3.0 + 4.5 = 7.5
BME:  (8 × 0.50) + (10 × 0.50) = 4.0 + 5.0 = 9.0
IGR:  (2 × 0.50) + (11 × 0.50) = 1.0 + 5.5 = 6.5
GAB:  (4 × 0.50) + (12 × 0.50) = 2.0 + 6.0 = 8.0
```

**Normalized Score Method (Website Currently Uses):**
```
FOF:  (Normalized Yield × 0.50) + (Normalized Z-Score × 0.50)
DNP:  (Normalized Yield × 0.50) + (Normalized Z-Score × 0.50)
...
```

The normalized scores convert values to a 0-1 scale, which changes the relative weighting. For example:
- A fund with YIELD rank 2 and Z-SCORE rank 11 might get different normalized scores than the rank-based calculation expects
- The relative differences in normalized scores don't match the relative differences in ranks

## The Root Cause

**The website is currently using NORMALIZED SCORE METHOD** (the rank-based method was reverted).

**Normalized Score Method:**
- Converts each metric to 0-1 scale
- Multiplies normalized scores by weights
- **Problem**: When combining metrics, results don't match rank-based calculation

**Rank-Based Method (What You Want):**
- Ranks each metric 1-N (1 = best)
- Multiplies ranks by weights
- **Result**: Matches your manual calculation exactly

## Your Data Analysis

Looking at your data with 50% YIELD + 50% Z-SCORE:

| CEF | YIELD Rank | Z-SCORE Rank | Total Score | Your Rank | Website Rank |
|-----|------------|--------------|-------------|-----------|--------------|
| FOF | 5 | 8 | 6.5 | 5 | ? |
| DNP | 6 | 9 | 7.5 | 8 | ? |
| BME | 8 | 10 | 9.0 | 12 | ? |
| IGR | 2 | 11 | 6.5 | 5 | ? |
| GAB | 4 | 12 | 8.0 | 9 | ? |

**Tie Note**: FOF and IGR both have Total Score 6.5. The order depends on tie-breaking logic.

## The Solution

**The website needs to be updated to use RANK-BASED METHOD** instead of normalized scores.

This will ensure:
- ✅ 100% single metric: Still works (same as before)
- ✅ Combined metrics: Now matches your manual calculation

## What We've Done

1. **Created a script** (`show_cef_ranking_breakdown.ts`) that uses rank-based method
2. **This script matches your manual calculation** exactly
3. **The website code needs to be updated** to use the same rank-based method

## Next Steps

1. **Update the website** to use rank-based method (not normalized scores)
2. **Rebuild and deploy** the website
3. **Test** with 50% YIELD + 50% Z-SCORE to verify it matches your calculation
4. **Clear browser cache** to ensure new code is loaded

The script we created shows the correct ranking using rank-based method, which matches your manual calculation.


