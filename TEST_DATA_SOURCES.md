# Data Source Test Results

## Current Issue: 141 Records Showing on Closed-End Funds

### Root Cause Analysis

**Problem:** The frontend is showing 141 records on the Closed-End Funds table when it should only show CEFs with NAV data.

**Data Flow:**
1. **Website Load:** Frontend calls `/api/cefs` → Backend queries database → Returns filtered CEFs
2. **Chart/Dividend History:** Frontend calls `/api/cefs/:symbol/price-nav` or `/api/cefs/:symbol/dividends` → Backend queries database (NOT Tiingo API)

**Current Filter Logic:**
- **CEFs Route:** Only shows records with:
  - `nav_symbol` set (not null/empty)
  - `ticker !== nav_symbol` (exclude NAV symbol records)
  - **AND `nav` is not null** (has actual NAV data, not N/A)

- **ETFs Route:** Shows records with:
  - No `nav_symbol` (traditional ETFs), OR
  - `nav_symbol` but no NAV data (these were incorrectly showing as CEFs)

**Why 141 Records Still Showing:**

1. **Frontend Cache:** The frontend caches CEF data in `localStorage` for 24 hours. Old cached data with 141 records may still be served.

2. **Server Cache:** Redis cache may still have old data (though we disabled it, it may have been re-enabled or old data persists).

3. **Filter Not Applied:** The filter may not be working correctly if:
   - Records have `nav_symbol` set but `nav` is 0 (not null)
   - Records have `nav_symbol` set but `nav` is an empty string

**Solution:**
- Clear frontend cache (localStorage)
- Verify filter is checking for `nav !== null && nav !== undefined && nav !== 0`
- Check server logs to see actual counts being returned

### Expected Results After Fix:

- **Closed-End Funds Table:** Only CEFs with `nav_symbol` AND actual NAV data (~12 records)
- **Covered Call Options ETFs Table:** All ETFs + records with `nav_symbol` but no NAV data (~129 records)

### Data Sources (For CEO):

**When visiting website:**
- Data comes from **database** (Supabase), NOT Tiingo API
- Data is pre-calculated and stored at EOD (End of Day)
- Should be very fast (database query, not API calls)

**When accessing Chart or Dividend History:**
- Data comes from **database** (prices_daily, dividends_detail tables)
- NOT from Tiingo API in real-time
- All data is pre-fetched and stored

**Loading Issues:**
- If slow: Database query performance issue or network latency
- If not loading: Database connection issue or server error
- NOT caused by Tiingo API calls (all data is in database)

