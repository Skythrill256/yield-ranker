# NAV Trend Calculation - Detailed Explanation for CEO

## Summary

**We ARE using ADJUSTED prices** (adj_close from Tiingo), which is correct. The discrepancy is caused by **different date selection**, not wrong prices or formula.

---

## What We're Using

### ✅ Price Type: ADJUSTED (adj_close)

- **Confirmed**: Code uses `adj_close ?? close` (line 334 in cefs.ts)
- **Data Source**: Tiingo API (same as CEO)
- **Formula**: `(Current - Past) / Past × 100` (same as CEO)

### ❌ Date Selection: Different from CEO

**CEO's Method:**

- Uses specific calendar dates: 12/29/25, 6/29/25, 12/30/24
- These appear to be end-of-month dates

**Our Method:**

- Uses **last available data date** in database (12/24/25)
- Calculates 6/12 months **backward from that date** (6/24/25, 12/24/24)

---

## CSQ (XCSQX) - Exact Comparison

### CEO's Calculation

| Date     | Adjusted Price | Source |
| -------- | -------------- | ------ |
| 12/29/25 | $20.85         | Tiingo |
| 6/29/25  | $18.65         | Tiingo |
| 12/30/24 | $17.46         | Tiingo |

**6M NAV Trend:**

```
(20.85 - 18.65) / 18.65 × 100 = 11.80%
```

**12M NAV Trend:**

```
(20.85 - 17.46) / 17.46 × 100 = 19.42%
```

### Our Calculation

| Date     | Adjusted Price | Source          |
| -------- | -------------- | --------------- |
| 12/24/25 | $20.97         | Database/Tiingo |
| 6/24/25  | $18.21         | Database/Tiingo |
| 12/24/24 | $17.89         | Database/Tiingo |

**6M NAV Trend:**

```
(20.97 - 18.21) / 18.21 × 100 = 15.15%
```

**12M NAV Trend:**

```
(20.97 - 17.89) / 17.89 × 100 = 17.20%
```

---

## Why the Difference?

### 1. Different Current Date

- **CEO**: 12/29/25 (specific date)
- **Us**: 12/24/25 (last available in database)
- **Difference**: 5 days

**Why**: Our database may not have been updated with 12/29 data yet, or we're using the last available trading day.

### 2. Different 6-Month Date

- **CEO**: 6/29/25 (exactly 6 months from 12/29/25)
- **Us**: 6/24/25 (exactly 6 months from 12/24/25)
- **Difference**: 5 days, and different prices

**Price Impact**:

- CEO's 6/29/25: $18.65
- Our 6/24/25: $18.21
- **$0.44 difference** (2.4% lower)

### 3. Different 12-Month Date

- **CEO**: 12/30/24 (exactly 12 months from 12/29/25)
- **Us**: 12/24/24 (exactly 12 months from 12/24/25)
- **Difference**: 6 days, and different prices

**Price Impact**:

- CEO's 12/30/24: $17.46
- Our 12/24/24: $17.89
- **$0.43 difference** (2.5% higher)

---

## Verification: What Our Code Actually Does

### Code Location: `server/src/routes/cefs.ts`

**Line 333-335:**

```typescript
// Use adjusted close price (adj_close) for NAV trends to account for distributions
const currentNav = currentRecord.adj_close ?? currentRecord.close;
const past6MNav = past6MRecord.adj_close ?? past6MRecord.close;
```

**✅ CONFIRMED: We ARE using ADJUSTED prices (adj_close)**

**Line 290-292:**

```typescript
// Use the current record's date (not today) to calculate 6 months ago
const currentDate = new Date(currentRecord.date + "T00:00:00");
const sixMonthsAgo = new Date(currentDate);
sixMonthsAgo.setMonth(currentDate.getMonth() - 6);
```

**✅ CONFIRMED: We calculate dates backward from last available date**

**Line 347:**

```typescript
// Calculate percentage change: ((Current NAV - NAV 6 months ago) / NAV 6 months ago) * 100
const trend = ((currentNav - past6MNav) / past6MNav) * 100;
```

**✅ CONFIRMED: Formula is correct**

---

## The Root Cause

**The discrepancy is NOT caused by:**

- ❌ Using unadjusted prices (we ARE using adjusted)
- ❌ Wrong formula (formula is correct)
- ❌ Wrong data source (we use Tiingo, same as CEO)

**The discrepancy IS caused by:**

- ✅ **Different date selection**: CEO uses specific dates (12/29, 6/29, 12/30), we use last available date (12/24) and calculate backward
- ✅ **Different adjusted prices** on those different dates

---

## Nearby Dates for Reference

From our database, here are the adjusted prices on dates near CEO's dates:

| Date       | Close (Unadjusted) | Adj Close (Adjusted) | Notes                                 |
| ---------- | ------------------ | -------------------- | ------------------------------------- |
| 2024-12-24 | $18.64             | $17.89               | **We use this**                       |
| 2024-12-30 | $18.09             | $17.46               | **CEO uses this** ✓                   |
| 2025-06-24 | $18.31             | $18.21               | **We use this**                       |
| 2025-06-30 | $18.75             | $18.65               | **CEO uses this** ✓                   |
| 2025-12-24 | $20.97             | $20.97               | **We use this**                       |
| 2025-12-29 | ?                  | ?                    | **CEO uses this** (not in our DB yet) |

**Note**: Our database has the same adjusted prices as CEO's Tiingo data on the same dates (12/30/24 = $17.46, 6/30/25 = $18.65), confirming we're using the same data source.

---

## Solution

To match CEO's calculation exactly, we need to:

1. **Use specific calendar dates** (end-of-month: 12/29, 6/29, 12/30) instead of last available date
2. **Find closest available date** if exact date not found (within ±2 days)
3. **Update code** to use these specific dates

This will ensure:

- Same dates as CEO
- Same adjusted prices
- Same calculation results

---

## Current Status

| Item           | Status       | Notes                                  |
| -------------- | ------------ | -------------------------------------- |
| Price Type     | ✅ Correct   | Using adjusted (adj_close)             |
| Formula        | ✅ Correct   | (Current - Past) / Past × 100          |
| Data Source    | ✅ Correct   | Tiingo (same as CEO)                   |
| Date Selection | ❌ Different | Using last available vs specific dates |

---

## Next Steps

1. Update code to use specific calendar dates (end-of-month) instead of last available date
2. Add fallback logic to find closest available date if exact date not found
3. Re-run calculation and verify it matches CEO's results
4. Test with multiple CEFs to ensure consistency

---

## Conclusion

**We are using the correct prices (adjusted) and formula.** The discrepancy is solely due to different date selection. Once we update the code to use the same dates as CEO (12/29, 6/29, 12/30), the calculations will match exactly.
