# Z-Score Ranking Fix - Explanation

## Problem Identified

The CEO correctly identified that Z-scores were being ranked incorrectly in the CEF ranking program. The system was treating **higher Z-scores as better**, when it should treat **lower (more negative) Z-scores as better**.

### Example
- **FFA** with 3 Yr Z-score of **-3.04** should be ranked as **best** (most attractive buying opportunity)
- But the old system would rank it as worst because it's the most negative number

## Why Lower Z-Scores Are Better

According to CEF analysis standards (Fidelity, Morningstar, CEF Connect):

1. **Z-Score Definition**: Measures how far the current premium/discount deviates from the fund's historical average, expressed in standard deviations.

2. **Negative Z-Score** = Current discount is **wider** (more negative) than the fund's typical discount → the fund looks relatively **"cheap"** → **BUYING OPPORTUNITY**

3. **Positive Z-Score** = Current discount is narrower (or it's at a premium relative to history) → the fund looks relatively **"expensive"** → **AVOID or SELL**

4. **Z-Score Ranges**:
   - **Below -2**: Particularly attractive (unusually wide discount)
   - **-2 to -1**: Good buying opportunity
   - **-1 to +1**: Neutral (trading within normal range)
   - **Above +2**: Expensive (tight discount or premium) → sell signal

5. **Mean Reversion**: CEF discounts tend to mean-revert over time, so a wide discount (negative Z-score) is likely to narrow, providing potential price appreciation.

## What Was Fixed

### Files Changed
- `yield-ranker/src/utils/cefRanking.ts`
- `src/utils/cefRanking.ts`

### The Fix

**Before (INCORRECT):**
```typescript
const normalizeZScore = (value: number | null) => {
  // This gave higher Z-scores higher normalized values (WRONG)
  return (zScoreValue - minZScore) / (maxZScore - minZScore);
  // Result: minZScore (-3.04) → 0.0, maxZScore (+2.0) → 1.0
};
```

**After (CORRECT):**
```typescript
const normalizeZScore = (value: number | null) => {
  // Invert: lower (more negative) Z-scores are better
  return (maxZScore - zScoreValue) / (maxZScore - minZScore);
  // Result: minZScore (-3.04) → 1.0 (best), maxZScore (+2.0) → 0.0 (worst)
};
```

### How It Works Now

1. **Normalization**: Lower Z-scores now get **higher normalized scores** (0.0 to 1.0 scale)
   - Z-score of **-3.04** → normalized score of **~1.0** (best)
   - Z-score of **+2.0** → normalized score of **~0.0** (worst)

2. **Weighted Ranking**: The normalized Z-score is multiplied by the volatility weight and added to the total score

3. **Final Ranking**: Funds with lower (more negative) Z-scores will now rank higher in the weighted ranking system

## Verification

- ✅ **Documentation confirms**: `server/RANKING_EXPLANATION.md` states "Rank 1 = lowest DVI or lowest Z-Score (best)"
- ✅ **Other ranking code**: `server/src/routes/cefs.ts` already had correct Z-score ranking (ascending sort)
- ✅ **Fix applied**: Both `cefRanking.ts` files now correctly invert Z-score normalization

## Result

Now when ranking CEFs:
- **FFA with Z-score -3.04** will be ranked as **best** (most attractive)
- Funds with positive Z-scores will be ranked lower (less attractive)
- The ranking system now correctly identifies buying opportunities based on wide discounts

