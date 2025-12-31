# Ranking System Explanation - For CEO

## ✅ YES - We Use 1, 2, 3, 4, ..., N System

**We rank each metric using whole numbers (integers): 1, 2, 3, 4, 5, ..., N**

- **Rank 1** = **BEST** (top performer)
- **Rank 2** = 2nd best
- **Rank 3** = 3rd best
- **Rank 4** = 4th best
- ...
- **Rank N** = **WORST** (where N = total number of CEFs/ETFs being ranked)

---

## How It Works - Step by Step

### Step 1: Rank Each Metric Separately (1 through N)

For each metric, we:

1. **Sort all CEFs** by that metric (best to worst)
2. **Assign Rank 1** to the best CEF
3. **Assign Rank 2** to the 2nd best CEF
4. **Assign Rank 3** to the 3rd best CEF
5. Continue until all CEFs are ranked

**Example with 12 CEFs ranked by YIELD:**

| CEF | Yield | YIELD Rank |
|-----|-------|------------|
| GOF | 17.33% | **1** (best = highest yield) |
| IGR | 16.63% | **2** |
| PCN | 10.66% | **3** |
| GAB | 9.79% | **4** |
| FOF | 7.86% | **5** |
| DNP | 7.77% | **6** |
| UTF | 7.69% | **7** |
| BME | 7.60% | **8** |
| BTO | 7.31% | **9** |
| FFA | 7.10% | **10** |
| UTG | 6.51% | **11** |
| CSQ | 6.25% | **12** (worst = lowest yield) |

**Ranks are: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12** (whole numbers only, no decimals)

---

### Step 2: Rank Each Metric by What "Best" Means

**YIELD:**
- **Rank 1** = Highest yield (best)
- **Rank N** = Lowest yield (worst)
- Sort: Highest to lowest

**Z-SCORE:**
- **Rank 1** = Lowest/most negative Z-score (best = widest discount)
- **Rank N** = Highest Z-score (worst = smallest discount or premium)
- Sort: Lowest to highest

**TOTAL RETURN (3MO/6MO/12MO):**
- **Rank 1** = Highest return (best)
- **Rank N** = Lowest return (worst)
- Sort: Highest to lowest

---

### Step 3: Calculate Weighted Total Score

After ranking each metric (1 through N), we calculate:

```
Total Score = (YIELD Rank × Yield Weight%) + 
              (Z-SCORE Rank × Z-Score Weight%) + 
              (TR 12MO Rank × TR 12MO Weight%) + 
              (TR 6MO Rank × TR 6MO Weight%) + 
              (TR 3MO Rank × TR 3MO Weight%)
```

**Example: 50% YIELD + 50% Z-SCORE**

| CEF | YIELD Rank | Z-SCORE Rank | Total Score Calculation | Total Score |
|-----|------------|--------------|-------------------------|-------------|
| GOF | 1 | 3 | (1 × 0.50) + (3 × 0.50) | **2.00** |
| PCN | 3 | 5 | (3 × 0.50) + (5 × 0.50) | **4.00** |
| FFA | 10 | 1 | (10 × 0.50) + (1 × 0.50) | **5.50** |
| UTF | 7 | 4 | (7 × 0.50) + (4 × 0.50) | **5.50** |

---

### Step 4: Final Ranking (1 through N)

Sort all CEFs by **Total Score** (lower = better), then assign final ranks:

| CEF | Total Score | Final Rank |
|-----|-------------|------------|
| GOF | 2.00 | **1** (best) |
| PCN | 4.00 | **2** |
| FFA | 5.50 | **3** |
| UTF | 5.50 | **4** |
| ... | ... | ... |
| BME | 9.00 | **12** (worst) |

**Final ranks are also: 1, 2, 3, 4, ..., N** (whole numbers only)

---

## Key Points

✅ **We use whole numbers: 1, 2, 3, 4, 5, ..., N**

✅ **Rank 1 = BEST** (top performer for that metric)

✅ **Rank N = WORST** (bottom performer, where N = total number of funds)

✅ **No decimals in ranks** - ranks are always integers

✅ **Each metric is ranked separately** from 1 to N

✅ **Total Score can have decimals** (e.g., 5.50), but **final ranks are whole numbers** (1, 2, 3, 4, ...)

---

## Verification

You can verify this by running:
```bash
cd server && npm run show:cef:ranking 50 50 0 0 0
```

The output shows:
- Each metric's rank (1, 2, 3, ..., N)
- Total Score (can have decimals)
- Final Rank (1, 2, 3, ..., N)

**This matches your manual calculation method exactly.**


