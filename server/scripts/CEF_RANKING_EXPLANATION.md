# CEF Ranking Explanation for CEO

## How to Run the Ranking Breakdown Script

To see exactly how the website calculates CEF rankings, run:

```bash
cd server
npm run show:cef:exact [yieldWeight] [zScoreWeight] [tr12Weight] [tr6Weight] [tr3Weight]
```

### Example: 50% Yield + 50% Z-Score
```bash
npm run show:cef:exact 50 50 0 0 0
```

### Example: 100% Yield
```bash
npm run show:cef:exact 100 0 0 0 0
```

## How the Ranking System Works

### Step 1: Rank Each Metric (1 to N)
- **YIELD**: Rank 1 = highest yield, Rank N = lowest yield
- **Z-SCORE**: Rank 1 = lowest/most negative Z-score, Rank N = highest Z-score
- **TR 12MO/6MO/3MO**: Rank 1 = highest return, Rank N = lowest return

### Step 2: Calculate Weighted Total Score
```
TOTAL SCORE = (YIELD Rank × Yield Weight%) + (Z-SCORE Rank × Z-Score Weight%) + (TR Rank × TR Weight%) + ...
```

### Step 3: Assign Final Ranks
- Sort by TOTAL SCORE (lower = better)
- CEFs with identical TOTAL SCORE get the same FINAL RANK
- Next rank skips numbers (e.g., if two CEFs are rank 3, next is rank 5)

## Why Website Might Differ from Manual Calculation

If the website ranking doesn't match your manual calculation, check:

1. **Same CEFs Being Ranked?**
   - The website only ranks CEFs that have both yield AND z-score data
   - If a CEF is missing data, it's excluded from ranking
   - Run the script to see which 12 CEFs are being ranked

2. **Same Data Values?**
   - Check if yield, z-score, and return values match exactly
   - The script shows the exact values from the database

3. **Same Weights?**
   - Make sure weights sum to 100%
   - Check if you're using the same weight percentages

4. **Same Ranking Method?**
   - The website uses rank-based method (1-N ranking, then weighted)
   - Not normalized scores (0-1 range)
   - Each metric is ranked independently, then ranks are weighted

## Example Calculation

For **GOF** with **50% Yield + 50% Z-Score**:
- YIELD: 17.33% → Rank 1 (highest yield)
- Z-SCORE: -1.97 → Rank 3 (3rd lowest Z-score)
- TOTAL SCORE = (1 × 0.50) + (3 × 0.50) = 0.5 + 1.5 = **2.00**
- FINAL RANK = **1** (lowest total score)

For **FFA** with **50% Yield + 50% Z-Score**:
- YIELD: 7.10% → Rank 10 (10th highest yield)
- Z-SCORE: -3.04 → Rank 1 (lowest Z-score)
- TOTAL SCORE = (10 × 0.50) + (1 × 0.50) = 5.0 + 0.5 = **5.50**
- FINAL RANK = **4** (tied with UTF at 5.50)

For **UTF** with **50% Yield + 50% Z-Score**:
- YIELD: 7.69% → Rank 7 (7th highest yield)
- Z-SCORE: -1.65 → Rank 4 (4th lowest Z-score)
- TOTAL SCORE = (7 × 0.50) + (4 × 0.50) = 3.5 + 2.0 = **5.50**
- FINAL RANK = **4** (tied with FFA at 5.50)

## Notes

- **1 = BEST**, higher numbers = WORSE
- Lower TOTAL SCORE = Better Final Rank
- CEFs with same TOTAL SCORE get the same FINAL RANK
- The script shows the exact calculation the website uses

