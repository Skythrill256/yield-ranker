# Adjusted vs Unadjusted Price Reference

**Last Updated:** December 23, 2025  
**Purpose:** This document defines which metrics use ADJUSTED (adj_close) vs UNADJUSTED (close) prices as specified by the CEO.

## Summary Table

| Metric | Type | Price Field Used | Notes |
|--------|------|------------------|-------|
| MARKET PRICE (HOME PAGE TABLE) | UNADJUSTED | `close` | Market price displayed in tables |
| NAV (HOME PAGE) | UNADJUSTED | `close` | NAV value displayed in tables |
| PRICE (CHART) | UNADJUSTED | `close` | Price data for charts |
| NAV (CHART) | UNADJUSTED | `close` | NAV data for charts |
| PRICE (CHART) AND TABLE | UNADJUSTED | `close` | Price data used in both charts and tables |
| TOTAL RETURNS | ADJUSTED | `adj_close` | All total return calculations |
| 6 MO NAV TREND | ADJUSTED | `adj_close` | 6-month NAV trend calculation |
| 12 MO NAV TREND | ADJUSTED | `adj_close` | 12-month NAV trend calculation |

## Detailed Specifications

### UNADJUSTED Metrics (Use `close`)

These metrics use the **unadjusted close price** (`close`) from Tiingo:

1. **MARKET PRICE (HOME PAGE TABLE)**
   - Location: CEF table, ETF table
   - Field: `price` or `marketPrice`
   - Source: `prices_daily.close`
   - Purpose: Display current market price to users

2. **NAV (HOME PAGE)**
   - Location: CEF table
   - Field: `nav`
   - Source: `prices_daily.close` from NAV symbol
   - Purpose: Display current NAV value to users

3. **PRICE (CHART)**
   - Location: Price return charts, detail pages
   - Source: `prices_daily.close`
   - Purpose: Display price movements over time

4. **NAV (CHART)**
   - Location: NAV charts, CEF detail pages
   - Source: `prices_daily.close` from NAV symbol
   - Purpose: Display NAV movements over time

5. **PRICE (CHART) AND TABLE**
   - Location: Both charts and tables
   - Source: `prices_daily.close`
   - Purpose: Consistent unadjusted price across views

### ADJUSTED Metrics (Use `adj_close`)

These metrics use the **adjusted close price** (`adj_close`) from Tiingo:

1. **TOTAL RETURNS**
   - Location: All return calculations (3Y, 5Y, 10Y, 15Y, 12M, 6M, 3M, 1M, 1W)
   - Field: `trDrip*`, `return*`, `totalReturn*`
   - Source: `prices_daily.adj_close`
   - Purpose: Calculate returns that account for dividends and distributions
   - Formula: `((end_adj_close / start_adj_close) - 1) * 100`

2. **6 MO NAV TREND**
   - Location: CEF metrics, CEF table
   - Field: `nav_trend_6m`
   - Source: `prices_daily.adj_close` from NAV symbol
   - Purpose: Calculate 6-month NAV trend accounting for distributions
   - Formula: `((current_adj_close - past6m_adj_close) / past6m_adj_close) * 100`
   - Period: Exactly 6 calendar months

3. **12 MO NAV TREND**
   - Location: CEF metrics, CEF table
   - Field: `nav_trend_12m`
   - Source: `prices_daily.adj_close` from NAV symbol
   - Purpose: Calculate 12-month NAV trend accounting for distributions
   - Formula: `((current_adj_close - past12m_adj_close) / past12m_adj_close) * 100`
   - Period: Exactly 12 calendar months

## Implementation Notes

### Code Locations

1. **Market Price & NAV (Unadjusted)**
   - `server/scripts/refresh_cef.ts`: Lines ~650-690
   - `server/src/routes/cefs.ts`: API route for fetching CEF data
   - Should use: `priceRecord.close` (NOT `adj_close`)

2. **Total Returns (Adjusted)**
   - `server/src/services/metrics.ts`: `calculateTotalReturnDrip()` function
   - `server/src/routes/cefs.ts`: `calculateNAVReturns()` function
   - Should use: `priceRecord.adj_close`

3. **NAV Trends (Adjusted)**
   - `server/src/routes/cefs.ts`: `calculateNAVTrend6M()` and `calculateNAVReturn12M()`
   - `server/scripts/refresh_cef.ts`: NAV trend calculation functions
   - Should use: `priceRecord.adj_close` (NOT `close`)

### Common Mistakes to Avoid

❌ **WRONG**: `close ?? adj_close` for NAV trends (this prioritizes unadjusted)  
✅ **CORRECT**: `adj_close ?? close` for NAV trends (prioritizes adjusted)

❌ **WRONG**: `adj_close` for market price display  
✅ **CORRECT**: `close` for market price display

❌ **WRONG**: `close` for total return calculations  
✅ **CORRECT**: `adj_close` for total return calculations

## Verification Checklist

When making changes to price calculations, verify:

- [ ] Market price in tables uses `close` (unadjusted)
- [ ] NAV in tables uses `close` (unadjusted)
- [ ] Charts showing price use `close` (unadjusted)
- [ ] Charts showing NAV use `close` (unadjusted)
- [ ] Total returns use `adj_close` (adjusted)
- [ ] 6 MO NAV trend uses `adj_close` (adjusted)
- [ ] 12 MO NAV trend uses `adj_close` (adjusted)

## Rationale

- **Unadjusted prices** (`close`) show the actual trading price and are appropriate for:
  - Displaying current market values
  - Showing price movements in charts
  - Calculating premium/discount ratios

- **Adjusted prices** (`adj_close`) account for dividends and distributions and are appropriate for:
  - Calculating total returns (includes reinvested dividends)
  - Calculating NAV trends (accounts for distributions)
  - Comparing performance over time

---

**This document should be kept in the admin area and referenced whenever making changes to price calculations.**

