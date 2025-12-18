# Tiingo API Data Availability for CEFs

## What Tiingo Provides for CEFs

### ✅ Available from Tiingo EOD API:

1. **Market Price Data** (via `/tiingo/daily/{ticker}/prices`):
   - `open`, `high`, `low`, `close` - Market prices (what shares trade for)
   - `volume` - Trading volume
   - `adjClose` - Adjusted close (for total return calculations)
   - Historical price data for charts

2. **Dividend Data** (via `/tiingo/daily/{ticker}/prices`):
   - `divCash` - Dividend payments on ex-dividend dates
   - `adjDividend` - Split-adjusted dividend amounts
   - Dividend history for DVI calculations

3. **NAV Symbol Prices** (if NAV symbol exists as a ticker):
   - Some NAV symbols (like XDNPX) may be available as separate tickers
   - Can fetch price history for NAV symbols if they're valid Tiingo tickers
   - **Note**: Not all NAV symbols are available in Tiingo

### ❌ NOT Available from Tiingo:

1. **NAV Values** - Tiingo does NOT provide Net Asset Value data for CEFs
2. **Premium/Discount %** - Must be calculated manually: `(Market Price - NAV) / NAV × 100`
3. **5 Year Z-Score** - Requires historical NAV data (not available from Tiingo)
4. **6M NAV Trend** - Requires NAV history (not available from Tiingo)
5. **12M NAV Return** - Requires NAV history (not available from Tiingo)
6. **Value/Health Score** - Calculated from Z-Score and NAV trends (not available)
7. **CEF-Specific Metadata**:
   - NAV Symbol (must be provided manually)
   - Open Date (must be provided manually)
   - Description (must be provided manually)
   - IPO Price (must be provided manually)

## How to Fill CEF Data

### Option 1: Manual Upload (Current Method)
Upload Excel spreadsheet with all CEF data including:
- NAV Symbol (e.g., XDNPX)
- NAV Value
- Premium/Discount
- 5Y Z-Score
- 6M NAV Trend
- 12M NAV Return
- Value/Health Score
- Description
- Open Date
- IPO Price
- Returns (10YR, 5YR, 3YR, 12Mo, 6Mo, 3Mo, 1Mo, 1Wk)

### Option 2: External Data Sources (Future Enhancement)
- **CEF Connect** (cefconnect.com) - Free, comprehensive NAV data
- **Morningstar** - Paid API with excellent CEF coverage
- **Nasdaq CEF Universe Report** - Institutional data
- **Yahoo Finance** - Sometimes has NAV via modified tickers (inconsistent)

### Option 3: Calculate from Available Data
- **Premium/Discount**: Calculate from uploaded NAV and Tiingo market price
- **Returns**: Calculate from Tiingo price history (already done)
- **DVI**: Calculate from Tiingo dividend history (already done)

## Current Implementation

The system currently:
1. ✅ Fetches market prices from Tiingo (via `refresh_all` script)
2. ✅ Fetches dividends from Tiingo (via `refresh_all` script)
3. ✅ Calculates returns from Tiingo price data
4. ✅ Calculates DVI from Tiingo dividend data
5. ❌ Requires manual upload for NAV, Premium/Discount, Z-Score, NAV Trends, Value/Health Score

## Recommendation

**For now**: Continue using manual Excel uploads for CEF-specific data (NAV, Premium/Discount, Z-Score, etc.)

**Future enhancement**: Integrate CEF Connect or another NAV data source to automatically fetch NAV values and calculate Premium/Discount, Z-Score, and NAV trends.

