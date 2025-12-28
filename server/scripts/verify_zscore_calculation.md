# Z-Score Calculation Verification

## Summary

The z-score calculation has been verified to match the CEO's Excel formula exactly.

## Formula (Verified Correct)

1. **Premium/Discount Calculation**: `(Price / NAV - 1)` (as decimal)
   - Example: GAB=6.13, XGABX=5.67 → (6.13/5.67 - 1) = 0.08112875 = 8.112875%

2. **Data Range**: Exactly **5 years** of historical data (most recent)
   - Uses: `DAYS_5Y = 5 * 252 = 1260 trading days`
   - Takes the most recent 5 years: `discounts.slice(-DAYS_5Y)`

3. **Average**: Mean of all P/D values in the 5-year window (includes current value)

4. **STDEV.P**: Population standard deviation (not sample)
   - Formula: `√(Σ(x - mean)² / n)` where n = number of data points
   - Divides by `n` (NOT `n-1`)

5. **Z-Score**: `(Current P/D - Average) / STDEV.P`
   - Example: (0.08112875 - 0.07259255074) / 0.06391055166 = 0.133564788

## Implementation Details

### Code Location
- **Function**: `calculateCEFZScore(ticker, navSymbol)` in `server/src/routes/cefs.ts`
- **Lines**: 44-218

### Key Implementation Points

1. ✅ Uses **unadjusted prices** only (`p.close`, NOT `p.adj_close`)
2. ✅ Fetches 6 years of data to ensure full 5-year coverage
3. ✅ Uses exactly 5 years (most recent) for calculation
4. ✅ Uses **STDEV.P** (population standard deviation, divides by n)
5. ✅ Includes current value in average and standard deviation calculations
6. ✅ Handles stale data by fetching from API when database data is >7 days old

### Refresh Script
- **Location**: `server/scripts/refresh_cef.ts`
- **Usage**: `npm run refresh:cef [--ticker SYMBOL]`
- Calls `calculateCEFZScore()` for each CEF and stores result in `five_year_z_score` field

## Test Verification

### Test File
- **Location**: `server/scripts/test_gab_zscore.ts`
- **Expected Values** (from CEO's Excel):
  - Current P/D: 8.112875%
  - Average P/D: 7.259255074%
  - STDEV.P: 6.391055166%
  - Z-Score: 0.133564788

### Running Tests

```bash
# Test GAB z-score calculation
cd server
npx tsx scripts/test_gab_zscore.ts

# Run refresh script for a single CEF
npm run refresh:cef --ticker GAB

# Run refresh script for all CEFs
npm run refresh:cef
```

## Verification Status

✅ **Formula/Methodology**: 100% Correct - matches Excel exactly  
✅ **Data Range**: Uses exactly 5 years (most recent)  
✅ **Standard Deviation**: Uses STDEV.P (population, not sample)  
✅ **Implementation**: Code is correct and matches the specified formula  
✅ **API Fallback**: Fetches fresh data when database is stale  
✅ **Test Alignment**: Test file uses correct expected values

## Result

When you run `npm run refresh:cef`, it will:
1. Fetch fresh price data for both CEF ticker and NAV symbol
2. Calculate z-score using the correct formula (matches CEO's Excel)
3. Store the result in the `five_year_z_score` field in the database
4. Work correctly for all CEF symbols with sufficient data

