# CEF Data Sources Documentation

## Required Fields (Manual Upload from Rich Only)

These fields MUST be uploaded via Excel spreadsheet:

- **Symbol** - CEF ticker symbol
- **NAV Symbol** - Ticker symbol for NAV data (e.g., XPDI for PDI)
- **Description** - Fund description
- **Open Date** - Fund inception date
- **IPO Price** - Initial public offering price
- **# Payments** - Number of dividend payments per year (12 = monthly, 4 = quarterly, etc.)

---

## Fields from Tiingo API

### Price Data

- **Price (MP)** - Market Price from main ticker's `close` price
- **NAV** - Net Asset Value from NAV Symbol ticker's `close` price
- **52W High/Low** - **COMPUTED** from price history (not directly from Tiingo)
  - Calculated from 1 year of price data: `Math.max(...closes)` and `Math.min(...closes)`

### Dividend Data

- **Dividend (divCash)** - **PULLED FROM TIINGO** via `divCash` field in price data
- **Adjusted Dividend (adjDividend)** - **COMPUTED** from Tiingo's `divCash` with split adjustments
  - Formula: Adjusts `divCash` for stock splits that occurred after the dividend date
- **Last Dividend** - Most recent dividend from Tiingo dividend history
- **Annual Dividend** - **COMPUTED** from rolling 365-day sum of adjusted dividends

---

## Calculated Fields (Automatic - No Manual Input Required)

### Premium/Discount

- **Formula**: `(Price / NAV - 1) * 100`
- **Source**: Calculated automatically when both Price and NAV are available
- **Example**: Price $9.00, NAV $10.00 → (9/10 - 1) \* 100 = -10% (discount)

### Forward Yield

- **Formula**: `(Annual Dividend / Price) * 100`
- **Source**: Calculated from Annual Dividend and current Price

### Annual Dividend

- **Formula**: Sum of all adjusted dividends in the last 365 days
- **Source**: Computed from Tiingo dividend history

### Last Dividend

- **Source**: Most recent dividend from Tiingo API (via `getDividendHistory`)
- **Note**: We ARE pulling this from Tiingo, not computing it

---

## Computed Metrics (Formulas - No Manual Upload Needed)

### Total Returns

- **Source**: **COMPUTED** from price and dividend history
- **Method**: Uses adjusted close prices (`adjClose`) to calculate total return with DRIP
- **Periods**: 1W, 1M, 3M, 6M, 1Y, 3Y, 5Y, 10Y, 15Y
- **Formula**: `(End AdjClose / Start AdjClose - 1) * 100`
- **Note**: Tiingo does NOT provide total returns directly - we compute them

### DVI (Dividend Volatility Index)

- **Source**: **COMPUTED** (NOT from Tiingo)
- **Method**:
  1. Get all adjusted dividends in last 12 months
  2. Annualize each payment (multiply by frequency: 52 for weekly, 12 for monthly, etc.)
  3. Calculate Standard Deviation of annualized amounts
  4. Calculate Coefficient of Variation: `(SD / Median) * 100`
  5. Map to rating: A+ (0-5%), A (5-10%), B+ (10-15%), B (15-20%), C (20-30%), D (30-50%), F (50%+)
- **Function**: `calculateDividendVolatility()` in `server/src/services/metrics.ts`

### 5Y Z-Score

- **Source**: **COMPUTED** (Formula-based, no manual upload)
- **Method**:
  1. Fetch 5+ years of Price and NAV data
  2. Calculate daily discount: `(Price / NAV) - 1`
  3. Use flexible lookback: 2Y minimum, 5Y maximum
  4. Calculate mean and standard deviation of discount history
  5. Z-Score = `(Current Discount - Mean Discount) / StdDev`
- **Function**: `calculateCEFZScore()` in `server/src/routes/cefs.ts`
- **Returns**: `null` if less than 2 years of data available

### 6M NAV Trend %

- **Source**: **COMPUTED** (Formula-based, no manual upload)
- **Formula**: `((Current NAV - NAV 6 Months Ago) / NAV 6 Months Ago) * 100`
- **Function**: `calculateNAVTrend6M()` in `server/src/routes/cefs.ts`

### 12M NAV Return %

- **Source**: **COMPUTED** (Formula-based, no manual upload)
- **Formula**: `((Current NAV - NAV 12 Months Ago) / NAV 12 Months Ago) * 100`
- **Function**: `calculateNAVReturn12M()` in `server/src/routes/cefs.ts`

### Value/Health Score

- **Source**: **COMPUTED** (Formula-based, requires Z-Score, NAV Trend, NAV Return)
- **Status**: Currently returns database value if available, otherwise `null`
- **Note**: Full formula implementation pending

---

## Summary Table

| Field              | Source     | Manual Upload? | Notes                                       |
| ------------------ | ---------- | -------------- | ------------------------------------------- |
| Symbol             | Manual     | ✅ Yes         | Excel upload                                |
| NAV Symbol         | Manual     | ✅ Yes         | Excel upload                                |
| Description        | Manual     | ✅ Yes         | Excel upload                                |
| Open Date          | Manual     | ✅ Yes         | Excel upload                                |
| IPO Price          | Manual     | ✅ Yes         | Excel upload                                |
| # Payments         | Manual     | ✅ Yes         | Excel upload                                |
| Price (MP)         | Tiingo API | ❌ No          | From main ticker                            |
| NAV                | Tiingo API | ❌ No          | From NAV Symbol ticker                      |
| Dividend           | Tiingo API | ❌ No          | From `divCash` field                        |
| Adjusted Dividend  | Computed   | ❌ No          | Split-adjusted from Tiingo data             |
| Last Dividend      | Tiingo API | ❌ No          | Most recent from history                    |
| Annual Dividend    | Computed   | ❌ No          | 365-day sum                                 |
| Forward Yield      | Computed   | ❌ No          | Annual Div / Price                          |
| Premium/Discount   | Computed   | ❌ No          | (Price/NAV - 1) \* 100                      |
| Total Returns      | Computed   | ❌ No          | From price/dividend history                 |
| 52W High/Low       | Computed   | ❌ No          | From 1-year price history                   |
| DVI                | Computed   | ❌ No          | From dividend volatility calculation        |
| 5Y Z-Score         | Computed   | ❌ No          | Formula-based (2Y min, 5Y max)              |
| 6M NAV Trend       | Computed   | ❌ No          | Formula-based                               |
| 12M NAV Return     | Computed   | ❌ No          | Formula-based                               |
| Value/Health Score | Computed   | ❌ No          | Formula-based (pending full implementation) |

---

## Key Clarifications

1. **Dividends ARE pulled from Tiingo**: We fetch `divCash` from Tiingo's price data and compute `adjDividend` with split adjustments.

2. **DVI IS computed**: We calculate Dividend Volatility Index using our own formula, not from Tiingo.

3. **Total Returns ARE computed**: Tiingo does not provide total returns - we calculate them from price and dividend history.

4. **Z-Score, NAV Trend, NAV Return ARE formulas**: These are all computed automatically using formulas we implemented. No manual upload needed.

5. **52W High/Low IS computed**: We calculate this from 1 year of price history, not directly from Tiingo.
