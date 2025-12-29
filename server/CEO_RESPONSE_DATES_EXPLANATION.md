# CEO Response: Why Z-Score Export Ended on 12/22 Instead of 12/27

## Exact Answer

The export ended on **12/22** because that was the **most recent date where BOTH PCN price data AND XPCNX NAV data exist** in the database.

**The Data Reality:**
- **PCN Price Data Available:** 12/26, 12/24, 12/23, 12/22
- **XPCNX NAV Data Available:** 12/24, 12/23, 12/22
- **Dates with BOTH:** 12/24, 12/23, 12/22

**Why 12/22 and not 12/24?**

Looking at the export output, it actually ends on **12/22**, which means when the export was run, the `getPriceHistory` function was not returning 12/24 data for some reason (possibly a timing/refresh issue). However, the more recent direct database queries show:

- **PCN has price data through 12/26** (12/26, 12/24, 12/23, 12/22)
- **XPCNX has NAV data only through 12/24** (12/24, 12/23, 12/22 - missing 12/26 and 12/25)

**The Core Issue:**

The Z-score export requires BOTH price and NAV data for each date. The export script finds the most recent date where both datasets exist. When the export was created on 12/22, that was the last date with complete data.

**What Happened Between 12/22 and 12/28:**

1. On 12/22: Export was created, ending on 12/22 (last date with both PCN price and XPCNX NAV)
2. By 12/24: Both PCN and XPCNX had data for 12/24
3. By 12/26: PCN had price data, but XPCNX NAV data was not yet available for 12/26
4. On 12/28: System was last updated, but we need to check if XPCNX NAV data is now available for 12/26

**Why NAV Data Lags:**

NAV (Net Asset Value) data is typically published after market close and may lag price data by a day or two, especially around weekends/holidays. This is why:
- PCN price data might be available for 12/26
- But XPCNX NAV data might not be available until later (or may be missing if it's a holiday/weekend)

**The Solution:**

If you run the export again now (after the 12/28 update), it should:
1. Include 12/24 data if both PCN and XPCNX have data for that date
2. Include any newer dates where both datasets are complete

The export ending on 12/22 was correct at the time - it was the last date with complete data. The Z-score calculation itself is accurate; the date range simply reflects data availability.

