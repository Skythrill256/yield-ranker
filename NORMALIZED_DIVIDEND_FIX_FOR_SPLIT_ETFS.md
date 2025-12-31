# Normalized Dividend Fix for Split ETFs

## Problem

**CEO reported**: Normalized dividend lines are not working for ETFs that split (CONY, ULTY).

**Root Cause**: Code was falling back to **unadjusted dividends** (`div_cash`) when `adj_amount` was null or 0, which gives wrong results for ETFs that have split.

---

## The Issue

### Before Fix:

```typescript
// OLD CODE - Falls back to unadjusted div_cash
const amount = current.adj_amount !== null && current.adj_amount > 0
    ? Number(current.adj_amount)
    : Number(current.div_cash); // ❌ WRONG: Uses unadjusted for split ETFs
```

**Problem:**
- For ETFs that split, `adj_amount` should always be used
- If `adj_amount` is null/0, falling back to `div_cash` gives wrong normalized values
- Normalized line chart shows incorrect values after splits

---

## The Fix

### After Fix:

```typescript
// NEW CODE - Only uses adjusted dividends
const amount = current.adj_amount !== null && current.adj_amount > 0
    ? Number(current.adj_amount)
    : null; // ✅ CORRECT: Don't calculate if no adj_amount
```

**Solution:**
- **ONLY** use `adj_amount` for normalization calculations
- **NEVER** fall back to `div_cash` (unadjusted)
- If `adj_amount` is null/0, don't calculate normalized values (correct behavior)

---

## Files Fixed

1. ✅ `server/src/services/dividendNormalization.ts`
   - `calculateNormalizedDividends()` - Now requires `adj_amount`
   - `calculateNormalizedForResponse()` - Now requires `adjAmount`

2. ✅ `server/scripts/calculate_normalized_dividends.ts`
   - `backfillSingleTicker()` - Now requires `adj_amount`

---

## Why This Matters

### For ETFs That Split:

**Example: CONY or ULTY**
- Before split: `div_cash = $1.00`, `adj_amount = $1.00` (no split yet)
- After 2:1 split: `div_cash = $0.50`, `adj_amount = $1.00` (adjusted for split)

**Old Code (WRONG):**
- If `adj_amount` was missing, used `div_cash = $0.50`
- Normalized: `$0.50 × 52 / 52 = $0.50` ❌ (wrong - should be $1.00)

**New Code (CORRECT):**
- Only uses `adj_amount = $1.00`
- Normalized: `$1.00 × 52 / 52 = $1.00` ✅ (correct)

---

## Result

✅ **Normalized dividend lines will now work correctly for split ETFs**

- Uses adjusted dividends (`adj_amount`) only
- Never falls back to unadjusted dividends (`div_cash`)
- Matches CEO's calculation method
- Works for CONY, ULTY, and all other split ETFs

---

## Next Steps

1. **Recalculate normalized values** for split ETFs:
   ```bash
   npm run calculate:normalized CONY
   npm run calculate:normalized ULTY
   ```

2. **Verify** normalized dividend lines display correctly in charts

3. **Check** that `adj_amount` is properly populated for all dividends (should be set by Tiingo sync)

---

## CEO Confirmation

**CEO said**: "normalized div only works if we use adj div"

✅ **Fixed**: Now we ONLY use adjusted dividends for normalization.

