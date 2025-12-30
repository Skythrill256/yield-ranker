# Ranking Comparison: Correct vs CEO's Version

## Complete Side-by-Side Comparison

### Z-SCORE RANKING (The Root Cause)

| Ticker | Z-Score Value | CORRECT Z Rank | CEO's Z Rank | Error? | Explanation |
|--------|--------------|---------------|-------------|--------|-------------|
| FFA    | -3.04        | **1**         | **1**       | ✓      | Lowest (best) - matches |
| CSQ    | -2.12        | **2**         | **2**       | ✓      | 2nd lowest - matches |
| GOF    | -1.97        | **3**         | **3**       | ✓      | 3rd lowest - matches |
| UTF    | -1.65        | **4**         | **4**       | ✓      | 4th lowest - matches |
| **FOF**| **-1.62**    | **5**         | **8**       | ✗ **ERROR** | Should be 5th (between UTF -1.65 and PCN -1.57) |
| **PCN**| **-1.57**    | **6**         | **5**       | ✗ **ERROR** | Should be 6th (after FOF -1.62) |
| BTO    | -1.31        | **7**         | **7**       | ✓      | 7th lowest - matches |
| **UTG**| **-0.82**    | **8**         | **6**       | ✗ **ERROR** | Should be 8th (after BTO -1.31) |
| **BME**| **-0.36**    | **9**         | **10**      | ✗ **ERROR** | Should be 9th (before DNP -0.31) |
| **DNP**| **-0.31**    | **10**        | **9**       | ✗ **ERROR** | Should be 10th (after BME -0.36) |
| IGR    | -0.13        | **11**        | **11**      | ✓      | 11th lowest - matches |
| GAB    | 0.95         | **12**        | **12**      | ✓      | Highest (worst) - matches |

**Summary**: CEO has **5 errors** in Z-score ranking.

---

### FINAL RANKING (50% Yield + 50% Z-Score)

| Rank | Ticker | YIELD | Y Rank | Z-Score | CORRECT Z Rank | CEO's Z Rank | CORRECT Total | CEO's Total | CORRECT Final | CEO's Final | Match? |
|------|--------|-------|--------|---------|----------------|--------------|---------------|-------------|---------------|-------------|--------|
| 1    | GOF    | 17.3% | 1      | -1.97   | 3              | 3            | **2.00**      | **2.00**    | **1**         | **1**       | ✓      |
| 2    | PCN    | 10.7% | 3      | -1.57   | 6              | 5            | **4.50**      | **4.00**    | **2**         | **2**       | ✓      |
| 3    | **FOF**| 7.9%  | 5      | -1.62   | **5**          | **8**        | **5.00**      | **6.50**    | **3**         | **5**       | ✗ **ERROR** |
| 4    | FFA    | 7.1%  | 10     | -3.04   | 1              | 1            | **5.50**      | **5.50**    | **4**         | **3**       | ✗ **ERROR** |
| 4    | UTF    | 7.7%  | 7      | -1.65   | 4              | 4            | **5.50**      | **5.50**    | **4**         | **3**       | ✗ **ERROR** |
| 6    | IGR    | 16.6% | 2      | -0.13   | 11             | 11           | **6.50**      | **6.50**    | **6**         | **5**       | ✗ **ERROR** |
| 7    | CSQ    | 6.3%  | 12     | -2.12   | 2              | 2            | **7.00**      | **7.00**    | **7**         | **7**       | ✓      |
| 8    | DNP    | 7.8%  | 6      | -0.31   | 10             | 9            | **8.00**      | **7.50**    | **8**         | **8**       | ✓      |
| 8    | BTO    | 7.3%  | 9      | -1.31   | 7              | 7            | **8.00**      | **8.00**    | **8**         | **9**       | ✗ **ERROR** |
| 8    | GAB    | 9.8%  | 4      | 0.95    | 12             | 12           | **8.00**      | **8.00**    | **8**         | **9**       | ✗ **ERROR** |
| 11   | BME    | 7.6%  | 8      | -0.36   | 9              | 10           | **8.50**      | **9.00**    | **11**        | **12**      | ✗ **ERROR** |
| 12   | UTG    | 6.5%  | 11     | -0.82   | 8              | 6            | **9.50**      | **8.50**    | **12**        | **11**      | ✗ **ERROR** |

**Summary**: CEO has **7 errors** in final ranking (caused by the 5 Z-score ranking errors).

---

## Detailed Breakdown of Errors

### ERROR #1: FOF (Most Critical)

**CORRECT Calculation:**
- YIELD: 7.9% → Rank 5
- Z-SCORE: -1.62 → **Rank 5** (correct)
- TOTAL = (5 × 50%) + (5 × 50%) = **5.00**
- **Final Rank: 3** ✓

**CEO's Calculation:**
- YIELD: 7.9% → Rank 5
- Z-SCORE: -1.62 → **Rank 8** (WRONG - should be 5)
- TOTAL = (5 × 50%) + (8 × 50%) = **6.50**
- **Final Rank: 5** ✗

**Why CEO is Wrong:**
- FOF's Z-score (-1.62) is between UTF (-1.65) and PCN (-1.57)
- When sorted: UTF (-1.65), FOF (-1.62), PCN (-1.57)
- So FOF should be rank 5, not rank 8

---

### ERROR #2: PCN

**CORRECT Calculation:**
- YIELD: 10.7% → Rank 3
- Z-SCORE: -1.57 → **Rank 6** (correct)
- TOTAL = (3 × 50%) + (6 × 50%) = **4.50**
- **Final Rank: 2** ✓

**CEO's Calculation:**
- YIELD: 10.7% → Rank 3
- Z-SCORE: -1.57 → **Rank 5** (WRONG - should be 6)
- TOTAL = (3 × 50%) + (5 × 50%) = **4.00**
- **Final Rank: 2** ✓ (coincidentally correct due to other errors)

**Why CEO is Wrong:**
- PCN's Z-score (-1.57) comes after FOF (-1.62) when sorted
- So PCN should be rank 6, not rank 5

---

### ERROR #3: FFA vs FOF (Ranking Order)

**CORRECT:**
- FOF: Total 5.00 → Rank 3
- FFA: Total 5.50 → Rank 4

**CEO:**
- FFA: Total 5.50 → Rank 3
- FOF: Total 6.50 → Rank 5

**Why CEO is Wrong:**
- FOF's total (5.00) is better (lower) than FFA's total (5.50)
- Lower total = better rank
- So FOF should rank before FFA

---

### ERROR #4: UTG

**CORRECT Calculation:**
- YIELD: 6.5% → Rank 11
- Z-SCORE: -0.82 → **Rank 8** (correct)
- TOTAL = (11 × 50%) + (8 × 50%) = **9.50**
- **Final Rank: 12** ✓

**CEO's Calculation:**
- YIELD: 6.5% → Rank 11
- Z-SCORE: -0.82 → **Rank 6** (WRONG - should be 8)
- TOTAL = (11 × 50%) + (6 × 50%) = **8.50**
- **Final Rank: 11** ✗

**Why CEO is Wrong:**
- UTG's Z-score (-0.82) comes after BTO (-1.31) when sorted
- So UTG should be rank 8, not rank 6

---

### ERROR #5: BME vs DNP

**CORRECT:**
- BME: -0.36 → Rank 9
- DNP: -0.31 → Rank 10

**CEO:**
- BME: -0.36 → Rank 10 (WRONG)
- DNP: -0.31 → Rank 9 (WRONG)

**Why CEO is Wrong:**
- BME's Z-score (-0.36) is more negative (better) than DNP's (-0.31)
- So BME should rank before DNP (rank 9 vs 10)

---

## Visual Comparison: Z-Score Ranking

### CORRECT Order (Sorted Low to High):
```
Rank 1:  FFA  -3.04  ← Lowest (best)
Rank 2:  CSQ  -2.12
Rank 3:  GOF  -1.97
Rank 4:  UTF  -1.65
Rank 5:  FOF  -1.62  ← CEO shows rank 8 (WRONG)
Rank 6:  PCN  -1.57  ← CEO shows rank 5 (WRONG)
Rank 7:  BTO  -1.31
Rank 8:  UTG  -0.82  ← CEO shows rank 6 (WRONG)
Rank 9:  BME  -0.36  ← CEO shows rank 10 (WRONG)
Rank 10: DNP  -0.31  ← CEO shows rank 9 (WRONG)
Rank 11: IGR  -0.13
Rank 12: GAB   0.95  ← Highest (worst)
```

### CEO's Order (Has Errors):
```
Rank 1:  FFA  -3.04  ✓
Rank 2:  CSQ  -2.12  ✓
Rank 3:  GOF  -1.97  ✓
Rank 4:  UTF  -1.65  ✓
Rank 5:  PCN  -1.57  ✗ (Should be 6)
Rank 6:  UTG  -0.82  ✗ (Should be 8)
Rank 7:  BTO  -1.31  ✓
Rank 8:  FOF  -1.62  ✗ (Should be 5)
Rank 9:  DNP  -0.31  ✗ (Should be 10)
Rank 10: BME  -0.36  ✗ (Should be 9)
Rank 11: IGR  -0.13  ✓
Rank 12: GAB   0.95  ✓
```

---

## Visual Comparison: Final Ranking

### CORRECT Final Ranking:
```
Rank 1:  GOF  (Total: 2.00)  ✓
Rank 2:  PCN  (Total: 4.50)  ✓
Rank 3:  FOF  (Total: 5.00)  ← CEO shows rank 5 (WRONG)
Rank 4:  FFA  (Total: 5.50)  ← CEO shows rank 3 (WRONG)
Rank 4:  UTF  (Total: 5.50)  ← CEO shows rank 3 (WRONG)
Rank 6:  IGR  (Total: 6.50)  ← CEO shows rank 5 (WRONG)
Rank 7:  CSQ  (Total: 7.00)  ✓
Rank 8:  DNP  (Total: 8.00)  ✓
Rank 8:  BTO  (Total: 8.00)  ← CEO shows rank 9 (WRONG)
Rank 8:  GAB  (Total: 8.00)  ← CEO shows rank 9 (WRONG)
Rank 11: BME  (Total: 8.50)  ← CEO shows rank 12 (WRONG)
Rank 12: UTG  (Total: 9.50)  ← CEO shows rank 11 (WRONG)
```

### CEO's Final Ranking:
```
Rank 1:  GOF  (Total: 2.00)  ✓
Rank 2:  PCN  (Total: 4.00)  ✓ (coincidentally correct)
Rank 3:  FFA  (Total: 5.50)  ✗ (Should be 4)
Rank 3:  UTF  (Total: 5.50)  ✗ (Should be 4)
Rank 5:  FOF  (Total: 6.50)  ✗ (Should be 3)
Rank 5:  IGR  (Total: 6.50)  ✗ (Should be 6)
Rank 7:  CSQ  (Total: 7.00)  ✓
Rank 8:  DNP  (Total: 7.50)  ✓
Rank 9:  BTO  (Total: 8.00)  ✗ (Should be 8, tied with DNP/GAB)
Rank 9:  GAB  (Total: 8.00)  ✗ (Should be 8, tied with DNP/BTO)
Rank 11: UTG  (Total: 8.50)  ✗ (Should be 12)
Rank 12: BME  (Total: 9.00)  ✗ (Should be 11)
```

---

## Summary of Disconnects

### Z-Score Ranking Disconnects (5 errors):
1. **FOF**: CEO shows rank 8, should be rank 5
2. **PCN**: CEO shows rank 5, should be rank 6
3. **UTG**: CEO shows rank 6, should be rank 8
4. **BME**: CEO shows rank 10, should be rank 9
5. **DNP**: CEO shows rank 9, should be rank 10

### Final Ranking Disconnects (7 errors):
1. **FOF**: CEO shows rank 5, should be rank 3 (caused by Z-score error)
2. **FFA**: CEO shows rank 3, should be rank 4 (FOF should be before it)
3. **UTF**: CEO shows rank 3, should be rank 4 (FOF should be before it)
4. **IGR**: CEO shows rank 5, should be rank 6 (FOF moved up)
5. **BTO**: CEO shows rank 9, should be rank 8 (tied with DNP/GAB)
6. **GAB**: CEO shows rank 9, should be rank 8 (tied with DNP/BTO)
7. **BME/UTG**: CEO has them reversed (BME should be 11, UTG should be 12)

---

## Root Cause

**The CEO's Z-score ranking is incorrect**, which causes a cascade of errors in the final ranking:

1. FOF gets wrong Z-score rank (8 instead of 5)
2. This makes FOF's total score wrong (6.50 instead of 5.00)
3. This makes FOF's final rank wrong (5 instead of 3)
4. This pushes FFA/UTF to wrong ranks (3 instead of 4)
5. This affects all subsequent rankings

**The fix**: Correct the Z-score ranking first, then recalculate final ranks. Once Z-score ranks are correct, the final ranking will match the website.

