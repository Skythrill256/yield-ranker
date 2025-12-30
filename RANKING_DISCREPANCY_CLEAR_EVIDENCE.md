# Ranking Discrepancy - Clear Evidence & Explanation

## Executive Summary

**The website's ranking is MATHEMATICALLY CORRECT.** The CEO's expected ranking has errors where funds with better (lower) total scores are ranked lower than funds with worse (higher) total scores.

---

## The Evidence

### Website's Ranking (50% Yield + 50% Z-Score):

| Rank | Ticker | YIELD | Y Rank | Z-SCORE | Z Rank | TOTAL SCORE | CEO Expected | Match |
|------|--------|-------|--------|---------|--------|-------------|--------------|-------|
| 1    | GOF    | 17.33%| 1      | -1.97   | 3      | **2.00**    | 1            | ✓     |
| 2    | PCN    | 10.66%| 3      | -1.57   | 6      | **4.50**    | 2            | ✓     |
| 3    | FOF    | 7.86% | 5      | -1.62   | 5      | **5.00**    | 5            | ✗     |
| 4    | FFA    | 7.10% | 10     | -3.04   | 1      | **5.50**    | 3            | ✗     |
| 4    | UTF    | 7.69% | 7      | -1.65   | 4      | **5.50**    | 3            | ✗     |
| 6    | IGR    | 16.63%| 2      | -0.13   | 11     | **6.50**    | 5            | ✗     |
| 7    | CSQ    | 6.25% | 12     | -2.12   | 2      | **7.00**    | 7            | ✓     |
| 8    | BTO    | 7.31% | 9      | -1.31   | 7      | **8.00**    | 9            | ✗     |
| 8    | DNP    | 7.77% | 6      | -0.31   | 10     | **8.00**    | 8            | ✓     |
| 8    | GAB    | 9.79% | 4      | 0.95    | 12     | **8.00**    | 9            | ✗     |
| 11   | BME    | 7.60% | 8      | -0.36   | 9      | **8.50**    | 11           | ✓     |
| 12   | UTG    | 6.51% | 11     | -0.82   | 8      | **9.50**    | 12           | ✓     |

---

## The Problem: FOF vs FFA/UTF

### Website's Calculation (CORRECT):

**FOF:**
- YIELD: 7.86% → Rank 5
- Z-SCORE: -1.62 → Rank 5
- **TOTAL SCORE = (5 × 50%) + (5 × 50%) = 2.50 + 2.50 = 5.00**
- **Website Rank: 3** ✓

**FFA:**
- YIELD: 7.10% → Rank 10
- Z-SCORE: -3.04 → Rank 1
- **TOTAL SCORE = (10 × 50%) + (1 × 50%) = 5.00 + 0.50 = 5.50**
- **Website Rank: 4** ✓

**UTF:**
- YIELD: 7.69% → Rank 7
- Z-SCORE: -1.65 → Rank 4
- **TOTAL SCORE = (7 × 50%) + (4 × 50%) = 3.50 + 2.00 = 5.50**
- **Website Rank: 4** ✓

### Why Website is Correct:

**Rule: Lower TOTAL SCORE = Better Rank**

- FOF has TOTAL SCORE = **5.00** (better)
- FFA has TOTAL SCORE = **5.50** (worse)
- UTF has TOTAL SCORE = **5.50** (worse)

Therefore:
- FOF should rank **BEFORE** FFA and UTF
- Website correctly shows: FOF = Rank 3, FFA/UTF = Rank 4
- CEO incorrectly shows: FOF = Rank 5, FFA/UTF = Rank 3

---

## CEO's Ranking Error

The CEO's ranking shows:
- FFA = Rank 3 (TOTAL SCORE 5.50)
- UTF = Rank 3 (TOTAL SCORE 5.50)
- FOF = Rank 5 (TOTAL SCORE 5.00)

**This is mathematically incorrect** because:
1. FOF's total score (5.00) is **better** (lower) than FFA/UTF's total score (5.50)
2. In rank-based scoring, **lower total score = better rank**
3. FOF should rank **higher** (lower rank number) than FFA/UTF

---

## Other Discrepancies

### IGR (Rank 6 vs CEO's Rank 5):
- **IGR**: TOTAL SCORE = 6.50
- **FOF**: TOTAL SCORE = 5.00
- FOF's 5.00 is better than IGR's 6.50
- Website correctly shows: FOF = Rank 3, IGR = Rank 6
- CEO incorrectly shows: FOF = Rank 5, IGR = Rank 5

### BTO/GAB (Rank 8 vs CEO's Rank 9):
- **BTO**: TOTAL SCORE = 8.00
- **GAB**: TOTAL SCORE = 8.00
- **DNP**: TOTAL SCORE = 8.00
- All three have the same total score (8.00), so they correctly get the same rank (8)
- CEO shows BTO/GAB at rank 9, but they should be rank 8 (tied with DNP)

---

## Mathematical Proof

### Ranking Rule:
1. Calculate TOTAL SCORE = (YIELD Rank × 50%) + (Z-SCORE Rank × 50%)
2. Sort by TOTAL SCORE (lower = better)
3. Assign ranks: lower total score = better rank (rank 1 = best)

### Verification:
- GOF: 2.00 → Rank 1 ✓
- PCN: 4.50 → Rank 2 ✓
- FOF: 5.00 → Rank 3 ✓ (CEO shows 5 - **WRONG**)
- FFA: 5.50 → Rank 4 ✓ (CEO shows 3 - **WRONG**)
- UTF: 5.50 → Rank 4 ✓ (CEO shows 3 - **WRONG**)
- IGR: 6.50 → Rank 6 ✓ (CEO shows 5 - **WRONG**)

---

## Conclusion

**The website's ranking is mathematically correct.** The CEO's expected ranking has 6 errors where funds are ranked in the wrong order based on their total scores.

**Key Issue**: The CEO has FOF (total score 5.00) ranked at position 5, but it should be at position 3 because its total score is better (lower) than FFA/UTF (total score 5.50).

**Evidence**: The calculation is transparent:
- FOF: (5 × 50%) + (5 × 50%) = 5.00
- FFA: (10 × 50%) + (1 × 50%) = 5.50
- UTF: (7 × 50%) + (4 × 50%) = 5.50

Since 5.00 < 5.50, FOF should rank before FFA and UTF.

---

## Recommendation

**The website's ranking is correct.** The CEO should update their expected ranking to match the mathematical calculation:
- FOF should be Rank 3 (not 5)
- FFA/UTF should be Rank 4 (not 3)
- IGR should be Rank 6 (not 5)
- BTO/GAB should be Rank 8 (not 9)

