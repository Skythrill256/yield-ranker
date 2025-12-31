# CEF Ranking Breakdown Script

## Purpose

This script shows the detailed ranking calculation breakdown for CEFs, exactly as the CEO requested. It displays:
- Each CEF with its raw values (YIELD, Z-SCORE, TR 12MO, TR 6MO, TR 3MO)
- The rank for each metric (1 = best, higher = worse)
- The weighted total score calculation
- The final rank

This helps verify that the ranking system matches manual calculations.

## Usage

### Default (50% YIELD, 50% Z-SCORE)
```bash
cd server
npm run show:cef:ranking
```

### Custom Weights
```bash
cd server
npm run show:cef:ranking [yieldWeight] [zScoreWeight] [tr12Weight] [tr6Weight] [tr3Weight]
```

### Examples

**50% YIELD, 50% Z-SCORE:**
```bash
npm run show:cef:ranking 50 50 0 0 0
```

**25% YIELD, 50% Z-SCORE, 25% TR 6MO:**
```bash
npm run show:cef:ranking 25 50 0 25 0
```

**100% YIELD (to test single metric):**
```bash
npm run show:cef:ranking 100 0 0 0 0
```

## Output Format

The script displays a table with the following columns:

| Column | Description |
|--------|-------------|
| CEF | Ticker symbol |
| YIELD | Forward yield percentage |
| Y SCORE | Yield rank (1 = highest yield) |
| Z-SCORE | 3-Year Z-Score value |
| Z SCORE | Z-Score rank (1 = lowest/most negative) |
| TR 12MO | 12-Month Total Return |
| 12 SCORE | 12-Month Return rank (1 = highest return) |
| TR 6MO | 6-Month Total Return |
| 6 SCORE | 6-Month Return rank (1 = highest return) |
| TR 3MO | 3-Month Total Return |
| 3 SCORE | 3-Month Return rank (1 = highest return) |
| TOTAL SCORE | Weighted total (lower = better) |
| FINAL RANK | Final ranking (1 = best) |

## How Ranking Works

1. **Rank Each Metric Separately** (1 = best, N = worst):
   - **YIELD**: Rank 1 = highest yield
   - **Z-SCORE**: Rank 1 = lowest (most negative) Z-score
   - **TR 12MO/6MO/3MO**: Rank 1 = highest return

2. **Calculate Weighted Total Score**:
   ```
   TOTAL SCORE = (YIELD Rank × Yield Weight%) + (Z-SCORE Rank × Z-Score Weight%) + ...
   ```

3. **Sort by Total Score** (lower = better):
   - Fund with lowest total score = Rank 1 (best)
   - Fund with highest total score = Rank N (worst)

## Example Output

```
======================================================================================
CEF RANKING BREAKDOWN - TESTING RANKING PROGRAM
======================================================================================
Weights: YIELD=50%, Z-SCORE=50%, TR 12MO=0%, TR 6MO=0%, TR 3MO=0%
======================================================================================

CEF      YIELD     Y SCORE   Z-SCORE    Z SCORE   TR 12MO    12 SCORE  TR 6MO     6 SCORE   TR 3MO     3 SCORE   TOTAL SCORE  FINAL RANK
--------------------------------------------------------------------------------------------------------------------------------------------------
FFA      7.10%     10        -3.04      1         3.28       10       9.95       4         3.73       3         5.50         3
CSQ      6.30%     12        -2.12      2         12.45      6        11.04      3         3.19       4         7.00         7
GOF      17.40%    1         -2.07      3         17.40      3        -8.80      11        -12.42     11        2.00         1
...
```

## Notes

- **1 = BEST**, higher numbers = WORSE
- Weights must sum to 100% (script will warn if they don't)
- Missing data gets worst rank (N) for that metric
- Lower TOTAL SCORE = Better Final Rank

## Troubleshooting

If the script doesn't match the website ranking:
1. Check that you're using the same weights
2. Verify the data in the database matches what's shown on the website
3. Ensure you're looking at the same set of CEFs (some may be filtered out if missing data)


