# Fix for December 25 Normalized Value (0.0201 → 0.0869)

## Problem
The normalized line chart was showing 0.0201 instead of 0.0869 for December 25/26 dividend.

## Root Cause
Date matching bug in the API route (`server/src/routes/tiingo.ts`):
- The `dividendsByDateMap` was keyed by dates without time component (e.g., "2025-12-26")
- But the lookup was using `d.exDate` which might include time component (e.g., "2025-12-26T00:00:00")
- This caused the lookup to fail, falling back to frequency 12 instead of 52
- Result: 0.0869 × 12 / 52 = 0.0201 ❌ (wrong!)

## Fix Applied
**File**: `server/src/routes/tiingo.ts` (line 404)

Added date normalization when looking up normalized values:
```typescript
// Before (BROKEN):
const dbDiv = dividendsByDateMap.get(d.exDate);

// After (FIXED):
const normalizedExDate = d.exDate.split('T')[0];  // Remove time component
const dbDiv = dividendsByDateMap.get(normalizedExDate);
```

This ensures the lookup key matches the map key format.

## Expected Result
- December 25/26 dividend should now show normalizedDiv = 0.0869 ✅
- Frequency = 52 (weekly) ✅
- Calculation: 0.0869 × 52 / 52 = 0.0869 ✅

## Action Required
1. **Restart the server** to pick up the code changes
2. **Hard refresh the browser** (Ctrl+Shift+R or Cmd+Shift+R) to clear cached API responses
3. Verify the normalized line chart now shows 0.0869

## Verification
Run: `npm run verify:gooy` to verify database values are correct (should show 0.0869 for 2025-12-26)

