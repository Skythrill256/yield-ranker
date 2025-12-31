# Why FFA is Rank 3 and UTF is Rank 4 (50% YIELD + 50% Z-SCORE)

## Summary

**FFA and UTF both have the same Total Score of 5.50**, but FFA is ranked 3rd and UTF is ranked 4th because of the tie-breaking rule: **when two CEFs have identical total scores, the one that appears first in the sorted list gets the lower (better) rank number**.

---

## Detailed Calculation

### FFA (Rank 3)
- **YIELD**: 7.10% → **YIELD Rank: 10** (10th highest yield out of 12 CEFs)
- **Z-SCORE**: -3.04 → **Z-SCORE Rank: 1** (1st best = lowest/most negative Z-score)
- **Total Score Calculation**:
  ```
  Total Score = (YIELD Rank × 50%) + (Z-SCORE Rank × 50%)
              = (10 × 0.50) + (1 × 0.50)
              = 5.00 + 0.50
              = 5.50
  ```

### UTF (Rank 4)
- **YIELD**: 7.69% → **YIELD Rank: 7** (7th highest yield out of 12 CEFs)
- **Z-SCORE**: -1.71 → **Z-SCORE Rank: 4** (4th best = 4th lowest Z-score)
- **Total Score Calculation**:
  ```
  Total Score = (YIELD Rank × 50%) + (Z-SCORE Rank × 50%)
              = (7 × 0.50) + (4 × 0.50)
              = 3.50 + 2.00
              = 5.50
  ```

---

## Why They Have the Same Score

Both CEFs have a **Total Score of 5.50**, which means they are **equally weighted** when combining YIELD and Z-SCORE:

- **FFA**: Weak on YIELD (rank 10) but **excellent on Z-SCORE (rank 1)** → Total: 5.50
- **UTF**: Better on YIELD (rank 7) but weaker on Z-SCORE (rank 4) → Total: 5.50

**The math balances out**: FFA's excellent Z-SCORE compensates for its weak YIELD, while UTF's better YIELD compensates for its weaker Z-SCORE.

---

## Tie-Breaking Rule

When two CEFs have **identical Total Scores**, the ranking system uses **alphabetical order by ticker symbol** to break the tie:

1. CEFs are fetched from the database **ordered alphabetically by ticker** (A-Z)
2. All CEFs are then sorted by Total Score (lower = better)
3. When Total Scores are equal, JavaScript's stable sort maintains the **original alphabetical order**
4. Final ranks are assigned sequentially: 1, 2, 3, 4, ...

**Result**: 
- **FFA** comes before **UTF** alphabetically (F comes before U)
- Both have Total Score 5.50
- FFA gets rank 3, UTF gets rank 4

**The tie-breaker is: Alphabetical order by ticker symbol (A-Z)**

---

## Why This Makes Sense

This tie-breaking approach is standard in ranking systems:
- **Fair**: Both CEFs are truly equal in weighted score
- **Deterministic**: The ranking is consistent and reproducible
- **Transparent**: The calculation is clear and verifiable

If you want a different tie-breaker (e.g., prefer the CEF with better Z-SCORE when scores are tied), we can add that logic. However, the current method is mathematically correct and standard practice.

---

## Verification

You can verify this by running:
```bash
cd server && npm run show:cef:ranking 50 50 0 0 0
```

The output will show:
- FFA: Total Score 5.50, Final Rank 3
- UTF: Total Score 5.50, Final Rank 4

Both have identical Total Scores, confirming they are mathematically equivalent in the ranking system.

