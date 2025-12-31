# Why 100% Single Metric Matches But Combined Metrics Don't Match

## The Problem

**CEO Observation:**
- ✅ **100% YIELD**: Website ranking matches manual calculation
- ✅ **100% Z-SCORE**: Website ranking matches manual calculation  
- ❌ **50% YIELD + 50% Z-SCORE**: Website ranking does NOT match manual calculation

## Root Cause Analysis

### Why 100% Single Metric Works

When you set **100% for a single metric**, both methods produce the same result:

**Rank-Based Method:**
- Total Score = (YIELD Rank × 100%) = YIELD Rank
- Sorting by Total Score = Sorting by YIELD Rank
- **Result**: Same as ranking by YIELD alone ✅

**Normalized Score Method:**
- Total Score = (Normalized Yield × 100%) = Normalized Yield
- Sorting by Total Score = Sorting by Normalized Yield
- Since normalized scores preserve order, this = Sorting by YIELD
- **Result**: Same as ranking by YIELD alone ✅

**Conclusion**: Both methods give identical results for single metrics because they're just sorting by that one metric.

### Why Combined Metrics Don't Match

When you combine **50% YIELD + 50% Z-SCORE**, the two methods produce different results:

**Rank-Based Method (CEO's Manual Calculation):**
```
FOF: Total Score = (5 × 0.50) + (8 × 0.50) = 2.5 + 4.0 = 6.5
DNP: Total Score = (6 × 0.50) + (9 × 0.50) = 3.0 + 4.5 = 7.5
BME: Total Score = (8 × 0.50) + (10 × 0.50) = 4.0 + 5.0 = 9.0
IGR: Total Score = (2 × 0.50) + (11 × 0.50) = 1.0 + 5.5 = 6.5
GAB: Total Score = (4 × 0.50) + (12 × 0.50) = 2.0 + 6.0 = 8.0
```

**Normalized Score Method (Website - if still using old method):**
```
FOF: Total Score = (Normalized Yield × 0.50) + (Normalized Z-Score × 0.50)
DNP: Total Score = (Normalized Yield × 0.50) + (Normalized Z-Score × 0.50)
...
```

The normalized scores are on a 0-1 scale, so the relative differences matter differently than ranks.

**Example:**
- **IGR**: YIELD rank 2 (very high yield), Z-SCORE rank 11 (bad Z-score)
  - Rank-based: (2 × 0.5) + (11 × 0.5) = 6.5
  - Normalized: Might give different result because normalized scores don't preserve the same relative weighting

## The Issue

The website code shows it's using **rank-based method** (after our fix), but if the CEO is still seeing mismatches, there are a few possibilities:

1. **Browser Cache**: The old JavaScript code might be cached
2. **Build Not Updated**: The website might not have been rebuilt with the new code
3. **Different Data Set**: The website might be filtering CEFs differently than the script
4. **Code Revert**: The rank-based code might have been reverted (we did revert it earlier)

## Solution

### Verify Current Website Method

Check if the website is using:
- **Rank-Based** (should match CEO's calculation)
- **Normalized Scores** (won't match when combining metrics)

### If Website Uses Normalized Scores

The website needs to be updated to use **rank-based method** to match CEO's manual calculation.

### If Website Uses Rank-Based But Still Doesn't Match

Check:
1. **Data Filtering**: Are the same CEFs included in both calculations?
2. **Missing Data Handling**: How are CEFs with missing data handled?
3. **Tie Breaking**: How are ties handled (same total score)?

## CEO's Data Analysis

Looking at CEO's data:
- **FOF**: YIELD rank 5, Z-SCORE rank 8, Total Score 6.5, Final Rank 5
- **DNP**: YIELD rank 6, Z-SCORE rank 9, Total Score 7.5, Final Rank 8
- **BME**: YIELD rank 8, Z-SCORE rank 10, Total Score 9.0, Final Rank 12
- **IGR**: YIELD rank 2, Z-SCORE rank 11, Total Score 6.5, Final Rank 5 (tie with FOF)
- **GAB**: YIELD rank 4, Z-SCORE rank 12, Total Score 8.0, Final Rank 9

**Tie Breaking Issue**: FOF and IGR both have Total Score 6.5. The final rank depends on tie-breaking logic:
- If sorted by Total Score first, then by another metric
- Or if the order matters when scores are equal

## Recommendation

1. **Verify** which method the website is actually using (check browser console or source code)
2. **Ensure** the website uses rank-based method (not normalized scores)
3. **Check** that the same CEFs are included in both calculations
4. **Verify** tie-breaking logic matches expectations

The script we created uses rank-based method and should match CEO's manual calculation exactly.


