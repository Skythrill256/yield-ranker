# Adjusted Dividend Calculation Verification

## Formula Confirmation

**Formula:** `adj_amount = div_cash / cumulative_split_factor`

Where `cumulative_split_factor` is the product of all split factors for splits that occurred AFTER the dividend date.

## YieldMax Reverse Splits (December 2025)

### Split Factors
- **1-for-10 reverse splits**: `splitFactor = 0.1` (10 shares → 1 share)
- **1-for-5 reverse splits**: `splitFactor = 0.2` (5 shares → 1 share)

### Funds with 1-for-10 splits (splitFactor = 0.1)
- MRNY, ULTY (Dec 1, 2025)
- FIAT, AIYY, CRSH, DIPS, CONY (Dec 2, 2025)

### Funds with 1-for-5 splits (splitFactor = 0.2)
- TSLY, XYZY, YBIT (Dec 1, 2025)
- OARK, ABNY (Dec 2, 2025)
- AMDY, MSTY (Dec 8, 2025)

## Calculation Examples

### Example 1: CONY (1-for-10 reverse split on Dec 2, 2025)
**Scenario:** Dividend paid on Nov 26, 2025 (before split)

- Raw dividend: `$0.0594`
- Split factor: `0.1` (split happened AFTER dividend)
- Cumulative factor: `0.1`
- **Adjusted dividend:** `0.0594 / 0.1 = $0.594` ✓

**Rationale:** 
- Before split: 10 shares × $0.0594 = $0.594 total dividend
- After split: 1 share × $0.594 = $0.594 total dividend (same)
- Therefore, adjusted dividend per share after split = $0.594 ✓

### Example 2: CONY (1-for-10 reverse split on Dec 2, 2025)
**Scenario:** Dividend paid on Dec 5, 2025 (after split)

- Raw dividend: `$0.05`
- Split factor: `0.1` (split happened BEFORE dividend)
- Cumulative factor: `1.0` (no applicable splits)
- **Adjusted dividend:** `0.05 / 1.0 = $0.05` ✓

**Rationale:** 
- Split already happened, so dividend is already in post-split terms
- No adjustment needed ✓

### Example 3: TSLY (1-for-5 reverse split on Dec 1, 2025)
**Scenario:** Dividend paid on Nov 20, 2025 (before split)

- Raw dividend: `$0.25`
- Split factor: `0.2` (split happened AFTER dividend)
- Cumulative factor: `0.2`
- **Adjusted dividend:** `0.25 / 0.2 = $1.25` ✓

**Rationale:**
- Before split: 5 shares × $0.25 = $1.25 total dividend
- After split: 1 share × $1.25 = $1.25 total dividend (same)
- Therefore, adjusted dividend per share after split = $1.25 ✓

## Code Implementation

### Location: `server/src/services/tiingo.ts`

```typescript
// Find all splits that occurred AFTER this dividend date
const applicableSplits = splitEvents.filter(split => split.date > exDate);

// Calculate cumulative split factor (product of all applicable splits)
let cumulativeSplitFactor = 1.0;
if (applicableSplits.length > 0) {
    cumulativeSplitFactor = applicableSplits.reduce(
        (factor, split) => factor * split.splitFactor,
        1.0
    );
}

// ALWAYS divide raw dividend by cumulative split factor
const adjDividend = cumulativeSplitFactor > 0 ? divCash / cumulativeSplitFactor : divCash;
```

### Key Logic Points
1. ✅ Splits are identified by `splitFactor !== 1.0`
2. ✅ Only splits AFTER the dividend date are considered
3. ✅ Multiple splits are multiplied together (cumulative)
4. ✅ Formula: `adj = raw / cumulative_factor` (always divide)
5. ✅ Works for both forward splits (splitFactor > 1) and reverse splits (splitFactor < 1)

## Verification Status

✅ **CONFIRMED:** The calculation logic is correct and consistent across all refresh scripts:
- `refresh:all` - Uses `fetchDividendHistory` → correctly calculates `adjDividend`
- `refresh:cef` - Uses `fetchDividendHistory` → correctly calculates `adjDividend`
- `daily:update` - Uses `fetchDividendHistory` → correctly calculates `adjDividend`
- `hourly:sync` - Uses `fetchDividendHistory` → correctly calculates `adjDividend`

## Expected Behavior for YieldMax Funds

For all YieldMax funds with December 2025 reverse splits:

1. **Dividends BEFORE split date:**
   - 1-for-10 splits: Adjusted = Raw ÷ 0.1 (10x increase)
   - 1-for-5 splits: Adjusted = Raw ÷ 0.2 (5x increase)

2. **Dividends AFTER split date:**
   - Adjusted = Raw (no change, already in post-split terms)

## Testing

To verify calculations for a specific ticker:

```bash
npm run find-splits:ticker CONY
```

This will show:
- Split dates and factors
- Raw vs adjusted dividends around the split date
- Verification that adjusted dividends match expected values

