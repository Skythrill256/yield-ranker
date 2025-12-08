# Reverse Split Dividend Adjustment Issue

## Problem
GOOY and TSLY had reverse splits, and the dividend history data appears incorrect.

## Current Implementation
- **DVI Calculation**: Uses `adj_amount ?? div_cash`
- **adj_amount**: Calculated as `divCash / splitFactor` (legacy method)
- **Issue**: This calculation may not work correctly for reverse splits

## Better Approach
- **scaled_amount**: Calculated as `divCash × (adjClose/close)` 
- **Why Better**: Uses the actual adjusted close price ratio, which is more accurate for reverse splits
- **Tiingo's adjClose**: Already accounts for all splits (forward and reverse) correctly

## Change Made
Updated `calculateDividendVolatility` to use:
```typescript
const amount = d.scaled_amount ?? d.adj_amount ?? d.div_cash ?? 0;
```

This prioritizes `scaled_amount` (most accurate) over `adj_amount` (legacy).

## Next Steps
1. Verify `scaled_amount` is populated in database for GOOY and TSLY
2. If not, may need to re-sync dividend data from Tiingo
3. Compare results with CEO's spreadsheet after fix

## Note
If `scaled_amount` is null in database, we fall back to `adj_amount`, then `div_cash`. 
This ensures backward compatibility but may not be accurate for reverse splits.

