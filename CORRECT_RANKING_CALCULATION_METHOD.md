# Correct Ranking Calculation Method - For CEO Review

## Overview

This document shows the **exact correct method** for calculating CEF rankings using the rank-based system with 50% Yield + 50% Z-Score weights.

---

## Step 1: Rank Each Metric (1 to N, where 1 = Best)

### YIELD Ranking (Higher is Better)

| Ticker | YIELD | Rank   | Notes                     |
| ------ | ----- | ------ | ------------------------- |
| GOF    | 17.3% | **1**  | Highest yield = best rank |
| IGR    | 16.6% | **2**  | 2nd highest               |
| PCN    | 10.7% | **3**  | 3rd highest               |
| GAB    | 9.8%  | **4**  | 4th highest               |
| FOF    | 7.9%  | **5**  | 5th highest               |
| DNP    | 7.8%  | **6**  | 6th highest               |
| UTF    | 7.7%  | **7**  | 7th highest               |
| BME    | 7.6%  | **8**  | 8th highest               |
| BTO    | 7.3%  | **9**  | 9th highest               |
| FFA    | 7.1%  | **10** | 10th highest              |
| UTG    | 6.5%  | **11** | 11th highest              |
| CSQ    | 6.3%  | **12** | Lowest yield = worst rank |

**Rule**: Higher yield = Better rank (rank 1 = highest yield)

---

### Z-SCORE Ranking (Lower is Better - Most Negative = Best)

**IMPORTANT**: Z-scores must be sorted from **LOWEST (most negative) to HIGHEST**, and CEFs with the same Z-score get the same rank.

| Ticker  | Z-Score   | Rank   | Notes                                        |
| ------- | --------- | ------ | -------------------------------------------- |
| FFA     | -3.04     | **1**  | Lowest (most negative) = best rank           |
| CSQ     | -2.12     | **2**  | 2nd lowest                                   |
| GOF     | -1.97     | **3**  | 3rd lowest                                   |
| UTF     | -1.65     | **4**  | 4th lowest                                   |
| **FOF** | **-1.62** | **5**  | 5th lowest (between UTF -1.65 and PCN -1.57) |
| PCN     | -1.57     | **6**  | 6th lowest (after FOF -1.62)                 |
| BTO     | -1.31     | **7**  | 7th lowest                                   |
| UTG     | -0.82     | **8**  | 8th lowest                                   |
| BME     | -0.36     | **9**  | 9th lowest                                   |
| DNP     | -0.31     | **10** | 10th lowest                                  |
| IGR     | -0.13     | **11** | 11th lowest                                  |
| GAB     | 0.95      | **12** | Highest (positive) = worst rank              |

**Rule**: Lower (more negative) Z-score = Better rank (rank 1 = most negative)

**Key Point**: When sorted from lowest to highest:

- UTF: -1.65 (rank 4)
- **FOF: -1.62 (rank 5)** ← This is correct
- PCN: -1.57 (rank 6)

---

## Step 2: Calculate TOTAL SCORE for Each CEF

**Formula**: `TOTAL SCORE = (YIELD Rank × 50%) + (Z-SCORE Rank × 50%)`

### Detailed Calculations:

| Ticker  | YIELD Rank | Z-SCORE Rank | Calculation                          | TOTAL SCORE |
| ------- | ---------- | ------------ | ------------------------------------ | ----------- |
| **GOF** | 1          | 3            | (1 × 50%) + (3 × 50%) = 0.50 + 1.50  | **2.00**    |
| **PCN** | 3          | 6            | (3 × 50%) + (6 × 50%) = 1.50 + 3.00  | **4.50**    |
| **FOF** | 5          | 5            | (5 × 50%) + (5 × 50%) = 2.50 + 2.50  | **5.00**    |
| **FFA** | 10         | 1            | (10 × 50%) + (1 × 50%) = 5.00 + 0.50 | **5.50**    |
| **UTF** | 7          | 4            | (7 × 50%) + (4 × 50%) = 3.50 + 2.00  | **5.50**    |
| **IGR** | 2          | 11           | (2 × 50%) + (11 × 50%) = 1.00 + 5.50 | **6.50**    |
| **CSQ** | 12         | 2            | (12 × 50%) + (2 × 50%) = 6.00 + 1.00 | **7.00**    |
| **DNP** | 6          | 10           | (6 × 50%) + (10 × 50%) = 3.00 + 5.00 | **8.00**    |
| **BTO** | 9          | 7            | (9 × 50%) + (7 × 50%) = 4.50 + 3.50  | **8.00**    |
| **GAB** | 4          | 12           | (4 × 50%) + (12 × 50%) = 2.00 + 6.00 | **8.00**    |
| **BME** | 8          | 9            | (8 × 50%) + (9 × 50%) = 4.00 + 4.50  | **8.50**    |
| **UTG** | 11         | 8            | (11 × 50%) + (8 × 50%) = 5.50 + 4.00 | **9.50**    |

---

## Step 3: Sort by TOTAL SCORE (Lower = Better)

**Rule**: Lower TOTAL SCORE = Better Final Rank (rank 1 = best)

| Rank | Ticker | TOTAL SCORE | Notes                          |
| ---- | ------ | ----------- | ------------------------------ |
| 1    | GOF    | 2.00        | Lowest total = best            |
| 2    | PCN    | 4.50        | 2nd lowest                     |
| 3    | FOF    | 5.00        | 3rd lowest                     |
| 4    | FFA    | 5.50        | 4th lowest (tied with UTF)     |
| 4    | UTF    | 5.50        | 4th lowest (tied with FFA)     |
| 6    | IGR    | 6.50        | 6th lowest                     |
| 7    | CSQ    | 7.00        | 7th lowest                     |
| 8    | DNP    | 8.00        | 8th lowest (tied with BTO/GAB) |
| 8    | BTO    | 8.00        | 8th lowest (tied with DNP/GAB) |
| 8    | GAB    | 8.00        | 8th lowest (tied with DNP/BTO) |
| 11   | BME    | 8.50        | 11th lowest                    |
| 12   | UTG    | 9.50        | Highest total = worst          |

---

## Step 4: Assign FINAL RANK (Handle Ties)

**Rule**: CEFs with the same TOTAL SCORE get the same FINAL RANK, and the next rank skips numbers.

| FINAL RANK | Ticker | TOTAL SCORE | Notes                                                    |
| ---------- | ------ | ----------- | -------------------------------------------------------- |
| **1**      | GOF    | 2.00        | Best total score                                         |
| **2**      | PCN    | 4.50        | 2nd best                                                 |
| **3**      | FOF    | 5.00        | 3rd best                                                 |
| **4**      | FFA    | 5.50        | 4th best (tied with UTF)                                 |
| **4**      | UTF    | 5.50        | 4th best (tied with FFA)                                 |
| **6**      | IGR    | 6.50        | 6th best (skips 5 because FFA/UTF tied at 4)             |
| **7**      | CSQ    | 7.00        | 7th best                                                 |
| **8**      | DNP    | 8.00        | 8th best (tied with BTO/GAB)                             |
| **8**      | BTO    | 8.00        | 8th best (tied with DNP/GAB)                             |
| **8**      | GAB    | 8.00        | 8th best (tied with DNP/BTO)                             |
| **11**     | BME    | 8.50        | 11th best (skips 9 and 10 because DNP/BTO/GAB tied at 8) |
| **12**     | UTG    | 9.50        | Worst total score                                        |

---

## Complete Correct Calculation Table

| CEF | YIELD | Y RANK | Z-SCORE | Z RANK | TOTAL SCORE | FINAL RANK |
| --- | ----- | ------ | ------- | ------ | ----------- | ---------- |
| GOF | 17.3% | 1      | -1.97   | 3      | 2.00        | **1**      |
| PCN | 10.7% | 3      | -1.57   | 6      | 4.50        | **2**      |
| FOF | 7.9%  | 5      | -1.62   | 5      | 5.00        | **3**      |
| FFA | 7.1%  | 10     | -3.04   | 1      | 5.50        | **4**      |
| UTF | 7.7%  | 7      | -1.65   | 4      | 5.50        | **4**      |
| IGR | 16.6% | 2      | -0.13   | 11     | 6.50        | **6**      |
| CSQ | 6.3%  | 12     | -2.12   | 2      | 7.00        | **7**      |
| DNP | 7.8%  | 6      | -0.31   | 10     | 8.00        | **8**      |
| BTO | 7.3%  | 9      | -1.31   | 7      | 8.00        | **8**      |
| GAB | 9.8%  | 4      | 0.95    | 12     | 8.00        | **8**      |
| BME | 7.6%  | 8      | -0.36   | 9      | 8.50        | **11**     |
| UTG | 6.5%  | 11     | -0.82   | 8      | 9.50        | **12**     |

---

## Key Points

1. **Z-Score Ranking**: Must be sorted from lowest (most negative) to highest

   - FOF (-1.62) comes between UTF (-1.65) and PCN (-1.57)
   - Therefore: FOF = Rank 5, PCN = Rank 6

2. **Total Score**: Lower is better

   - FOF: 5.00 (better)
   - FFA/UTF: 5.50 (worse)
   - Therefore: FOF ranks before FFA/UTF

3. **Tie-Breaking**: Same total score = same rank

   - FFA and UTF both have 5.50 → both get rank 4
   - DNP, BTO, GAB all have 8.00 → all get rank 8
   - Next rank skips numbers (IGR gets rank 6, BME gets rank 11)

4. **Final Rank**: Based on total score, not individual metrics
   - Even though FFA has the best Z-score (rank 1), its total score (5.50) is worse than FOF's (5.00)
   - Therefore: FOF ranks higher (rank 3) than FFA (rank 4)

---

## Summary

This is the **correct calculation method** that the website uses. The key is:

1. Rank each metric correctly (YIELD: higher is better, Z-SCORE: lower is better)
2. Calculate total score using weighted ranks
3. Sort by total score (lower = better)
4. Assign final ranks with tie-breaking (same score = same rank)

The website's ranking matches this method exactly.
