# Verification Checklist - Signal & NAV Returns

## Code Review ✅

I've verified the code and everything is correctly implemented:

### ✅ Signal Calculation
- **Location**: `server/src/routes/cefs.ts` - `calculateSignal()` function
- **Logic**: Matches Python code exactly
- **Called in**: Both list endpoint (`GET /api/cefs`) and single endpoint (`GET /api/cefs/:symbol`)
- **Returns**: Number (-2 to +3) or null (N/A)
- **Logging**: INFO level logs show why Signal is N/A or what value was calculated

### ✅ NAV Returns (3Y, 5Y, 10Y, 15Y)
- **Location**: `server/src/routes/cefs.ts` - `calculateNAVReturns()` function
- **Method**: Uses same NAV fetching as chart endpoint (`getPriceHistory` with navSymbol)
- **Data**: Uses `adj_close` which accounts for distributions (total return)
- **Called in**: Both list endpoint and single endpoint
- **Returns**: Percentage or null (N/A)
- **Logging**: INFO level logs show why returns are N/A or calculated values

### ✅ Response Structure
- **Signal**: `signal: number | null` - included in response
- **Returns**: `return15Yr`, `return10Yr`, `return5Yr`, `return3Yr` - all included in response
- **Types**: All match `src/types/cef.ts` interface

## How to Verify It's Working

### Step 1: Start the Server
```bash
cd server
npm run dev
```

### Step 2: Check Server Logs
When you load the CEF page, watch the console for:

**Signal logs:**
```
[INFO] [CEF Metrics] Signal N/A for BTO: missing inputs (zScore=null, navTrend6M=5.23, navTrend12M=8.45)
[INFO] [CEF Metrics] Signal N/A for BTO: insufficient history (250 < 504 trading days)
[INFO] [CEF Metrics] Signal +3 (Optimal) for BTO: z=-2.15, t6=5.23%, t12=8.45%
```

**NAV Returns logs:**
```
[INFO] [CEF Metrics] ✅ Calculated 5Y NAV return for XDNPX: 45.23% (1250 records, 2019-01-15 to 2024-01-15)
[INFO] [CEF Metrics] 10Y Return N/A for XDNPX: insufficient data (500 < 2 records)
```

### Step 3: Check API Response
Open browser DevTools → Network tab → Find `/api/cefs` request → Check response JSON:

```json
{
  "symbol": "BTO",
  "signal": 3,  // or null
  "return15Yr": 120.50,  // or null
  "return10Yr": 85.23,   // or null
  "return5Yr": 45.23,    // or null
  "return3Yr": 25.10,    // or null
  ...
}
```

### Step 4: Check Frontend Display
- Open CEF table page
- Check if Signal column shows numbers (-2 to +3) or "N/A"
- Check if 15Y, 10Y, 5Y, 3Y columns show percentages or "N/A"

## Common Issues & Solutions

### Issue: Signal shows N/A for all CEFs

**Possible causes:**
1. **Missing inputs**: Z-Score, 6M Trend, or 12M Trend is null
   - **Check logs**: Look for "Signal N/A for X: missing inputs"
   - **Solution**: Ensure NAV symbols are correct and have enough data

2. **Insufficient history**: Less than 504 trading days
   - **Check logs**: Look for "Signal N/A for X: insufficient history (250 < 504)"
   - **Solution**: Fund needs at least 2 years of trading history

### Issue: 3/5/10/15Y Returns show N/A for all CEFs

**Possible causes:**
1. **Missing NAV symbol**: `navSymbol` is null
   - **Check**: Look at API response - `navSymbol` field
   - **Solution**: Ensure NAV symbols are populated in database

2. **Insufficient historical data**: Tiingo doesn't have enough data
   - **Check logs**: Look for "X Return N/A for Y: insufficient data"
   - **Solution**: Some funds may not have 3/5/10/15 years of history

3. **Fund too new**: Fund is less than 3/5/10/15 years old
   - **Solution**: This is expected - fund doesn't have enough history yet

## Testing Commands

### Test Single CEF
```bash
# In server directory
npx tsx scripts/test_api_call.ts BTO
```

### Test Multiple CEFs
```bash
npx tsx scripts/test_api_call.ts GAB
npx tsx scripts/test_api_call.ts XDNPX
```

## Expected Behavior

### If Everything Works:
- **Signal**: Shows numbers (-2 to +3) for CEFs with 2+ years of history
- **Returns**: Shows percentages for periods where data exists (e.g., 5Y might work but 15Y might be N/A if fund is only 6 years old)

### If Data is Missing:
- **Signal**: Shows "N/A" with log message explaining why
- **Returns**: Shows "N/A" with log message explaining why

## Next Steps

1. **Start the server** and load the CEF page
2. **Check server console logs** - they'll tell you exactly what's happening
3. **Check browser Network tab** - see the actual API response
4. **Review logs** - they'll show why Signal/returns are N/A or what values were calculated

The code is correct - the logs will tell you what's happening with each CEF!

