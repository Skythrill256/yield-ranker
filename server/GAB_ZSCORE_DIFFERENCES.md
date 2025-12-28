# GAB Z-Score Calculation - Verified Formula

## Summary

The Z-Score calculation formula is **100% correct** and matches Excel's calculation method.

## Key Differences Identified

## Calculation Formula (Verified Correct)

The Z-Score calculation uses the following formula, which matches Excel exactly:

1. **Premium/Discount Calculation**: `(Price / NAV - 1) * 100` (as percentage)
   - Example: GAB=6.13, XGABX=5.67 → (6.13/5.67 - 1) * 100 = 8.112875%

2. **Data Range**: Uses exactly **5 years** of historical data (most recent 5 years)
   - Code uses: `DAYS_5Y = 5 * 252 = 1260 trading days`
   - Note: The code fetches 6 years of data to ensure full coverage, but only uses the most recent 5 years for calculation

3. **Average**: Mean of all P/D values in the 5-year period (includes current value)

4. **STDEV.P**: Population standard deviation (not sample)
   - Formula: `√(Σ(x - mean)² / n)` where n = number of data points
   - This matches Excel's STDEV.P function

5. **Z-Score**: `(Current P/D - Average) / STDEV.P`
   - Example: (8.112875% - 7.259255074%) / 6.391055166% = 0.133564788

## Data Range Clarification

**Question: Is this 5 or 6 years of data?**

**Answer: The calculation uses exactly 5 years of data.**

- The code fetches 6 years of historical data from the API/database to ensure we have full coverage
- But the actual calculation uses only the **most recent 5 years** (DAYS_5Y = 1260 trading days)
- This matches Excel's approach: using the most recent 5 years for the z-score calculation

Example from GAB data:
- Data range: 12/28/2020 to 12/26/2025 = 5 years
- Calculation uses all data points in this 5-year window

## Implementation Details

The `calculateCEFZScore` function:
1. Fetches 6 years of price data (to ensure coverage)
2. Calculates daily premium/discount: `(price / nav - 1.0)`
3. Takes the most recent 5 years: `discounts.slice(-DAYS_5Y)` where `DAYS_5Y = 1260`
4. Calculates average using all values in the 5-year window
5. Calculates STDEV.P (population standard deviation) using all values
6. Calculates z-score: `(currentDiscount - avgDiscount) / stdDev`

## Conclusion

✅ **Formula/Methodology:** 100% Correct - matches Excel exactly
✅ **Data Range:** Uses exactly 5 years (most recent)
✅ **Standard Deviation:** Uses STDEV.P (population, not sample)
✅ **Implementation:** Code is correct and matches the specified formula
