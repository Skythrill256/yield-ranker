# Server Logs Guide - Checking Signal and NAV Returns

## How to Check Server Logs

When the server is running, you'll see log messages in the console. The logs now use `INFO` level so they'll be visible.

## What to Look For

### Signal Calculation Logs

You'll see messages like:

**If Signal is N/A:**
```
[INFO] [CEF Metrics] Signal N/A for BTO: missing inputs (zScore=null, navTrend6M=5.23, navTrend12M=8.45)
```
or
```
[INFO] [CEF Metrics] Signal N/A for BTO: insufficient history (250 < 504 trading days)
```

**If Signal is calculated:**
```
[INFO] [CEF Metrics] Signal +3 (Optimal) for BTO: z=-2.15, t6=5.23%, t12=8.45%
[INFO] [CEF Metrics] Signal +2 (Good Value) for BTO: z=-1.8, t6=3.45%
[INFO] [CEF Metrics] Signal +1 (Healthy) for BTO: z=-0.5, t6=2.10%
[INFO] [CEF Metrics] Signal 0 (Neutral) for BTO: z=0.2, t6=-1.5%
[INFO] [CEF Metrics] Signal -1 (Value Trap) for BTO: z=-2.0, t6=-3.2%
[INFO] [CEF Metrics] Signal -2 (Overvalued) for BTO: z=2.1
```

### NAV Trend Logs

**If 6M Trend is N/A:**
```
[INFO] [CEF Metrics] 6M NAV Trend N/A for XDNPX: insufficient data (100 < 127 records)
```

**If 12M Trend is N/A:**
```
[INFO] [CEF Metrics] 12M NAV Trend N/A for XDNPX: insufficient data (200 < 253 records)
```

### NAV Returns Logs (3Y, 5Y, 10Y, 15Y)

**If returns are N/A:**
```
[INFO] [CEF Metrics] 5Y Return N/A for XDNPX: insufficient data (500 < 2 records)
[INFO] [CEF Metrics] 5Y Return N/A for XDNPX: no data on/after start date 2019-01-15
[INFO] [CEF Metrics] 5Y Return N/A for XDNPX: invalid prices (start=null, end=25.50)
```

**If returns are calculated:**
```
[INFO] [CEF Metrics] ✅ Calculated 5Y NAV return for XDNPX: 45.23% (1250 records, 2019-01-15 to 2024-01-15)
[INFO] [CEF Metrics] ✅ Calculated 10Y NAV return for XDNPX: 120.50% (2500 records, 2014-01-15 to 2024-01-15)
```

## Common Issues and Solutions

### Signal Shows N/A

1. **Missing inputs**: Check if Z-Score, 6M Trend, or 12M Trend are null
   - Solution: Ensure NAV symbol is correct and has enough historical data

2. **Insufficient history**: Less than 504 trading days (2 years)
   - Solution: Fund needs at least 2 years of trading history

### 3/5/10/15 Year Returns Show N/A

1. **Insufficient data**: Not enough historical records
   - Solution: Tiingo may not have enough historical data for that NAV symbol

2. **Missing NAV symbol**: NAV symbol is null or incorrect
   - Solution: Verify NAV symbol in database is correct

3. **Invalid prices**: Start or end NAV price is null or invalid
   - Solution: Check if NAV data exists for that date range

## Testing

To test a specific CEF, make an API call:
```
GET http://localhost:8080/api/cefs/BTO
```

Check the response for:
- `signal`: Should be a number (-2 to +3) or null
- `return15Yr`, `return10Yr`, `return5Yr`, `return3Yr`: Should be percentages or null

## Next Steps

1. Start the server: `npm run dev` in the `server` directory
2. Load the CEF page in your browser
3. Watch the server console for log messages
4. Check which CEFs have Signal/returns calculated and which don't
5. Use the log messages to identify why some are N/A

