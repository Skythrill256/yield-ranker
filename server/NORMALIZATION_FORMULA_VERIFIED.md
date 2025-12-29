# Dividend Normalization Formula - Verified Correct ✅

## Formula (Matches Spreadsheet Exactly)

1. **Annualized**: `Amount × Frequency`
   - Stored/displayed rounded to 2 decimals
   - Example: 0.694 × 12 = 8.328 → stored as 8.33

2. **Normalized**: `(Amount × Frequency) / 52`
   - **IMPORTANT**: Uses the **UNROUNDED** annualized value
   - Formula: `(adjDiv × frequency) / 52`
   - Example: 0.694 × 12 = 8.328 → 8.328 / 52 = 0.1601538462 ✅

## Test Cases (All Match Spreadsheet)

| ADJ DIV | FREQ | ANNLZD (Rounded) | NORMALZD | Match |
|---------|------|------------------|----------|-------|
| 0.694 | 12 | 8.33 | 0.1601538462 | ✅ |
| 0.164 | 52 | 8.53 | 0.164 | ✅ |
| 0.0869 | 52 | 4.52 | 0.0869 | ✅ |
| 0.0917 | 52 | 4.77 | 0.0917 | ✅ |
| 0.1084 | 52 | 5.64 | 0.1084 | ✅ |
| 0.2508 | 52 | 13.04 | 0.2508 | ✅ |

## Implementation

**Location**: `server/src/services/dividendNormalization.ts`

```typescript
// Calculate annualized: Amount × Frequency
const annualizedRaw = amount * frequencyNum;
// Round annualized to 2 decimals for storage/display
annualized = Number(annualizedRaw.toFixed(2));

// Normalized value: convert to weekly equivalent rate for line chart
// IMPORTANT: Calculate from the UNROUNDED annualized value
// Formula: normalizedDiv = (amount × frequency) / 52
normalizedDiv = annualizedRaw / 52;
```

## Applied to All Symbols

- ✅ `refresh_all.ts` recalculates normalized values for all tickers
- ✅ `calculate_normalized_dividends.ts` can recalculate individual tickers
- ✅ API route uses database normalized values
- ✅ Frontend uses `normalizedDiv` from API for line chart

## Chart Usage

- **Bar Chart**: Uses `div.amount` (unadjusted dividend cash)
- **Line Chart**: Uses `div.normalizedDiv` (normalized weekly equivalent) when frequency changes
- **Requirement**: "USE ADJ PRICE FOR LINE AND UNADJ PRICE FOR BAR"
- **Normalized line only shows when frequency changes**

## Verification Script

Run `npm run verify:gooy` to verify GOOY calculations match spreadsheet.

