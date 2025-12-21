# Complete Data Sources Documentation
## Answering All Questions from "12/20: STARTING OVER"

---

## 1. CEF and CC ETFs are Separate Pages ✅

**Status:** ✅ **CONFIRMED**
- **CEF Route:** `/api/cefs` - Returns only records with `nav_symbol` set
- **ETF Route:** `/api/etfs` - Returns only records without `nav_symbol` (null/empty)
- **Frontend:** Separate pages (`/cefs` and `/etfs`)
- **Filter Logic:** Simple rule - `has nav_symbol? → CEF table` | `no nav_symbol? → ETF table`

---

## 2. On CEF Site, Only Show Search CEFs ✅

**Status:** ✅ **CONFIRMED**
- CEF page (`/cefs`) only shows CEF search functionality
- ETF page (`/etfs`) only shows ETF search functionality
- No cross-contamination between pages

---

## 3. On CEF Site, Have "Closed End Fund" in NAV Bar ✅

**Status:** ✅ **CONFIRMED**
- Navigation bar includes "Closed End Fund" link
- Links to `/cefs` page (Closed End Funds page)

---

## 4-7. Complete Field Documentation Table

### CEF (Closed-End Fund) Fields

| Field Name | Source | Tiingo Field Name | Calculation/Formula | Script Location | Database or Direct |
|------------|--------|-------------------|---------------------|-----------------|-------------------|
| **Symbol** | Rich | N/A | N/A | `server/src/routes/cefs.ts` (upload handler) | Database (`etf_static.ticker`) |
| **NAV Symbol** | Rich | N/A | N/A | `server/src/routes/cefs.ts` (upload handler) | Database (`etf_static.nav_symbol`) |
| **Description** | Rich | N/A | N/A | `server/src/routes/cefs.ts` (upload handler) | Database (`etf_static.description`) |
| **Open Date** | Rich | N/A | N/A | `server/src/routes/cefs.ts` (upload handler) | Database (`etf_static.open_date`) |
| **IPO Price** | Rich | N/A | N/A | `server/src/routes/cefs.ts` (upload handler) | Database (`etf_static.ipo_price`) |
| **# Payments** | Rich | N/A | N/A | `server/src/routes/cefs.ts` (upload handler) | Database (`etf_static.payments_per_year`) |
| **Market Price (MP)** | API | `close` (from `prices_daily` table) | N/A | `server/scripts/refresh_cefs.ts` | Database (`etf_static.price`) |
| **NAV** | API | `close` (from `prices_daily` table, using NAV Symbol) | N/A | `server/scripts/refresh_cefs.ts` | Database (`etf_static.nav`) |
| **Premium/Discount** | Formula | N/A | `(Market Price / NAV - 1) * 100` | `server/scripts/refresh_cefs.ts` (line 276) | Database (`etf_static.premium_discount`) |
| **5 Yr Z-Score** | Formula | N/A | See formula below | `server/src/routes/cefs.ts` (calculateCEFZScore, line 44) | Database (`etf_static.five_year_z_score`) |
| **6 Mo NAV Trend** | Formula | N/A | `((Current NAV / NAV 126 days ago) - 1) * 100` | `server/src/routes/cefs.ts` (calculateNAVTrend6M, line 141) | Database (`etf_static.nav_trend_6m`) |
| **12 Mo NAV Trend** | Formula | N/A | `((Current NAV / NAV 252 days ago) - 1) * 100` | `server/src/routes/cefs.ts` (calculateNAVReturn12M, line 212) | Database (`etf_static.nav_trend_12m`) |
| **Signal** | Formula | N/A | See formula below | `server/src/routes/cefs.ts` (calculateSignal, line 454) | Database (`etf_static.signal`) |
| **Last Dividend** | API | `divCash` (from `dividends_detail` table) | Most recent dividend from database | `server/scripts/refresh_cefs.ts` | Database (`etf_static.last_dividend`) |
| **Annual Dividend** | Calc | N/A | `Sum of all adjusted dividends in last 365 days` | `server/src/services/metrics.ts` (calculateDividendVolatility, line 145) | Database (`etf_static.annual_dividend`) |
| **Forward Yield** | Formula | N/A | `(Annual Dividend / Market Price) * 100` | `server/src/services/metrics.ts` (calculateMetrics, line 864) | Database (`etf_static.forward_yield`) |
| **DVI (Dividend Volatility Index)** | Formula | N/A | See formula below | `server/src/services/metrics.ts` (calculateDividendVolatility, line 145) | Database (`etf_static.dividend_volatility_index`) |
| **Dividend SD** | Formula | N/A | Sample standard deviation of annualized dividends | `server/src/services/metrics.ts` (calculateDividendVolatility, line 145) | Database (`etf_static.dividend_sd`) |
| **Dividend CV** | Formula | N/A | `SD / Median` (coefficient of variation) | `server/src/services/metrics.ts` (calculateDividendVolatility, line 145) | Database (`etf_static.dividend_cv`) |
| **Dividend CV %** | Formula | N/A | `(SD / Median) * 100` | `server/src/services/metrics.ts` (calculateDividendVolatility, line 145) | Database (`etf_static.dividend_cv_percent`) |
| **Return 3Y** | Formula | N/A | `((NAV_adj_end / NAV_adj_start) - 1) * 100` (annualized) | `server/src/routes/cefs.ts` (calculateNAVReturns, line 285) | Database (`etf_static.return_3yr`) |
| **Return 5Y** | Formula | N/A | `((NAV_adj_end / NAV_adj_start) - 1) * 100` (annualized) | `server/src/routes/cefs.ts` (calculateNAVReturns, line 285) | Database (`etf_static.return_5yr`) |
| **Return 10Y** | Formula | N/A | `((NAV_adj_end / NAV_adj_start) - 1) * 100` (annualized) | `server/src/routes/cefs.ts` (calculateNAVReturns, line 285) | Database (`etf_static.return_10yr`) |
| **Return 15Y** | Formula | N/A | `((NAV_adj_end / NAV_adj_start) - 1) * 100` (annualized) | `server/src/routes/cefs.ts` (calculateNAVReturns, line 285) | Database (`etf_static.return_15yr`) |
| **52W High** | Calc | N/A | `Math.max(...closes)` from 1 year of price data | `server/src/services/metrics.ts` (calculateMetrics) | Database (`etf_static.week_52_high`) |
| **52W Low** | Calc | N/A | `Math.min(...closes)` from 1 year of price data | `server/src/services/metrics.ts` (calculateMetrics) | Database (`etf_static.week_52_low`) |
| **Dividend History** | Calc | N/A | Format: "5+ 3-" (5 increases, 3 decreases) | `server/src/routes/cefs.ts` (calculateDividendHistory, line 594) | Database (`etf_static.dividend_history`) |

---

### Covered Call Options ETF Fields

| Field Name | Source | Tiingo Field Name | Calculation/Formula | Script Location | Database or Direct |
|------------|--------|-------------------|---------------------|-----------------|-------------------|
| **Symbol** | Rich | N/A | N/A | `server/src/routes/etfs.ts` (upload handler) | Database (`etf_static.ticker`) |
| **Description** | Rich | N/A | N/A | `server/src/routes/etfs.ts` (upload handler) | Database (`etf_static.description`) |
| **Price** | API | `close` (from `prices_daily` table) | N/A | `server/scripts/refresh_all.ts` | Database (`etf_static.price`) |
| **Last Dividend** | API | `divCash` (from `dividends_detail` table) | Most recent dividend from database | `server/scripts/refresh_all.ts` | Database (`etf_static.last_dividend`) |
| **# Payments** | Rich/Calc | N/A | Detected from dividend intervals or manual upload | `server/src/services/metrics.ts` (calculateMetrics, line 828) | Database (`etf_static.payments_per_year`) |
| **Annual Dividend** | Calc | N/A | `Sum of all adjusted dividends in last 365 days` | `server/src/services/metrics.ts` (calculateDividendVolatility, line 145) | Database (`etf_static.annual_dividend`) |
| **Forward Yield** | Formula | N/A | `(Annual Dividend / Price) * 100` | `server/src/services/metrics.ts` (calculateMetrics, line 864) | Database (`etf_static.forward_yield`) |
| **DVI (Dividend Volatility Index)** | Formula | N/A | See formula below | `server/src/services/metrics.ts` (calculateDividendVolatility, line 145) | Database (`etf_static.dividend_volatility_index`) |
| **Dividend SD** | Formula | N/A | Sample standard deviation of annualized dividends | `server/src/services/metrics.ts` (calculateDividendVolatility, line 145) | Database (`etf_static.dividend_sd`) |
| **Dividend CV** | Formula | N/A | `SD / Median` (coefficient of variation) | `server/src/services/metrics.ts` (calculateDividendVolatility, line 145) | Database (`etf_static.dividend_cv`) |
| **Dividend CV %** | Formula | N/A | `(SD / Median) * 100` | `server/src/services/metrics.ts` (calculateDividendVolatility, line 145) | Database (`etf_static.dividend_cv_percent`) |
| **Return 3Y** | Formula | N/A | `((Price_adj_end / Price_adj_start) - 1) * 100` (annualized) | `server/src/services/metrics.ts` (calculateTotalReturnDrip) | Database (`etf_static.return_3yr`) |
| **Return 5Y** | Formula | N/A | `((Price_adj_end / Price_adj_start) - 1) * 100` (annualized) | `server/src/services/metrics.ts` (calculateTotalReturnDrip) | Database (`etf_static.return_5yr`) |
| **Return 10Y** | Formula | N/A | `((Price_adj_end / Price_adj_start) - 1) * 100` (annualized) | `server/src/services/metrics.ts` (calculateTotalReturnDrip) | Database (`etf_static.return_10yr`) |
| **Return 15Y** | Formula | N/A | `((Price_adj_end / Price_adj_start) - 1) * 100` (annualized) | `server/src/services/metrics.ts` (calculateTotalReturnDrip) | Database (`etf_static.return_15yr`) |
| **52W High** | Calc | N/A | `Math.max(...closes)` from 1 year of price data | `server/src/services/metrics.ts` (calculateMetrics) | Database (`etf_static.week_52_high`) |
| **52W Low** | Calc | N/A | `Math.min(...closes)` from 1 year of price data | `server/src/services/metrics.ts` (calculateMetrics) | Database (`etf_static.week_52_low`) |
| **Dividend History** | Calc | N/A | Format: "5+ 3-" (5 increases, 3 decreases) | `server/src/routes/etfs.ts` (calculateDividendHistory) | Database (`etf_static.dividend_history`) |

---

## Detailed Formulas (Too Large for Table)

### 5-Year Z-Score Formula
**Location:** `server/src/routes/cefs.ts` - `calculateCEFZScore()` (line 44)

**Formula:**
```
1. Fetch 5 years of price and NAV data (1260 trading days max, 504 minimum)
2. Calculate daily discount: (Price / NAV) - 1 for each day
3. Calculate mean discount: average of all discounts
4. Calculate standard deviation: sqrt(variance) where variance = Σ(discount - mean)² / n
5. Z-Score = (Current Discount - Mean Discount) / Standard Deviation
```

**Script:** `server/src/routes/cefs.ts:44-139`  
**Database:** ✅ Saved to `etf_static.five_year_z_score`  
**Refresh Script:** `server/scripts/refresh_cefs.ts` (line 132)

---

### Signal Formula
**Location:** `server/src/routes/cefs.ts` - `calculateSignal()` (line 454)

**Formula:**
```
Requires: Z-Score, 6M NAV Trend, 12M NAV Trend, and 504+ trading days of history

Logic Gates:
- +3: Optimal - Z < -1.5 AND 6M Trend > 0 AND 12M Trend > 0
- +2: Good Value - Z < -1.5 AND 6M Trend > 0
- +1: Healthy - Z > -1.5 AND 6M Trend > 0
-  0: Neutral - Default
- -1: Value Trap - Z < -1.5 AND 6M Trend < 0
- -2: Overvalued - Z > 1.5
```

**Script:** `server/src/routes/cefs.ts:454-531`  
**Database:** ✅ Saved to `etf_static.signal`  
**Refresh Script:** `server/scripts/refresh_cefs.ts` (line 155)

---

### DVI (Dividend Volatility Index) Formula
**Location:** `server/src/services/metrics.ts` - `calculateDividendVolatility()` (line 145)

**Formula:**
```
1. Get all adjusted dividends (adj_amount) in last 365 days
2. For each dividend, determine frequency (weekly=52, monthly=12, quarterly=4, etc.)
3. Annualize each payment: raw_amount × frequency
4. Calculate Sample Standard Deviation: sqrt(Σ(x - mean)² / (n-1))
5. Calculate Median of annualized payments
6. CV = SD / Median
7. CV % = (SD / Median) * 100
8. DVI = CV % rounded to 1 decimal place
```

**Script:** `server/src/services/metrics.ts:145-385`  
**Database:** ✅ Saved to `etf_static.dividend_volatility_index`, `dividend_sd`, `dividend_cv`, `dividend_cv_percent`  
**Refresh Script:** `server/scripts/refresh_cefs.ts` (line 200) and `server/scripts/refresh_all.ts`

---

### Annual Dividend Calculation
**Location:** `server/src/services/metrics.ts` - `calculateDividendVolatility()` (line 145)

**Formula:**
```
Annual Dividend = Sum of all adjusted dividends (adj_amount) in the last 365 days
```

**Script:** `server/src/services/metrics.ts:145-385`  
**Database:** ✅ Saved to `etf_static.annual_dividend`  
**Refresh Script:** `server/scripts/refresh_cefs.ts` and `server/scripts/refresh_all.ts`

---

### NAV-Based Total Returns (CEFs Only)
**Location:** `server/src/routes/cefs.ts` - `calculateNAVReturns()` (line 285)

**Formula:**
```
For 3Y/5Y/10Y/15Y periods:
1. Get NAV data for the period (using NAV Symbol)
2. Use adjusted close (adj_close) which accounts for distributions
3. Total Return = ((NAV_adj_end / NAV_adj_start) - 1) * 100
4. Annualized Return = ((1 + total_return/100) ^ (1/years)) - 1) * 100
```

**Script:** `server/src/routes/cefs.ts:285-400`  
**Database:** ✅ Saved to `etf_static.return_3yr`, `return_5yr`, `return_10yr`, `return_15yr`  
**Refresh Script:** `server/scripts/refresh_cefs.ts` (line 220)

---

### Price-Based Total Returns (ETFs Only)
**Location:** `server/src/services/metrics.ts` - `calculateTotalReturnDrip()`

**Formula:**
```
For 3Y/5Y/10Y/15Y periods:
1. Get price data for the period
2. Use adjusted close (adj_close) which accounts for splits/dividends
3. Total Return = ((Price_adj_end / Price_adj_start) - 1) * 100
4. Annualized Return = ((1 + total_return/100) ^ (1/years)) - 1) * 100
```

**Script:** `server/src/services/metrics.ts`  
**Database:** ✅ Saved to `etf_static.return_3yr`, `return_5yr`, `return_10yr`, `return_15yr`  
**Refresh Script:** `server/scripts/refresh_all.ts`

---

## Tiingo API Field Names

### Price Data (from `prices_daily` table, populated by Tiingo API)
- **Field:** `close` - Closing price
- **Field:** `adj_close` - Adjusted closing price (accounts for splits/dividends)
- **Field:** `open`, `high`, `low` - OHLC data
- **Field:** `volume` - Trading volume
- **API Endpoint:** Tiingo EOD API `/tiingo/daily/{ticker}/prices`

### Dividend Data (from `dividends_detail` table, populated by Tiingo API)
- **Field:** `divCash` - Raw dividend amount
- **Field:** `adj_amount` - Adjusted dividend (accounts for splits)
- **Field:** `ex_date` - Ex-dividend date
- **Field:** `payment_date` - Payment date
- **Field:** `record_date` - Record date
- **API Endpoint:** Tiingo Dividend API `/tiingo/daily/{ticker}/dividends`

---

## Data Flow Summary

### CEFs
1. **Upload:** Excel file → `POST /api/cefs/upload` → Database (`etf_static`)
2. **Refresh:** `npm run refresh:cefs` → Fetches prices/NAV/dividends from Tiingo → Calculates metrics → Saves to Database
3. **Display:** Frontend calls `GET /api/cefs` → Returns data from Database

### ETFs
1. **Upload:** Excel file → `POST /api/etfs/upload-static` → Database (`etf_static`)
2. **Refresh:** `npm run refresh:all` → Fetches prices/dividends from Tiingo → Calculates metrics → Saves to Database
3. **Display:** Frontend calls `GET /api/etfs` → Returns data from Database

**All data goes to Database first, then to website.** No direct API-to-website flow.

---

## Script Locations Summary

| Script | Purpose | Location |
|--------|---------|----------|
| **refresh_cefs.ts** | Refresh CEF metrics (Z-Score, Signal, NAV Returns, Premium/Discount) | `server/scripts/refresh_cefs.ts` |
| **refresh_all.ts** | Refresh ETF metrics (Total Returns, DVI, Annual Dividend) | `server/scripts/refresh_all.ts` |
| **calculateCEFZScore** | Calculate 5-Year Z-Score | `server/src/routes/cefs.ts:44` |
| **calculateNAVTrend6M** | Calculate 6-Month NAV Trend | `server/src/routes/cefs.ts:141` |
| **calculateNAVReturn12M** | Calculate 12-Month NAV Return | `server/src/routes/cefs.ts:212` |
| **calculateSignal** | Calculate Signal rating | `server/src/routes/cefs.ts:454` |
| **calculateNAVReturns** | Calculate NAV-based Total Returns (3Y/5Y/10Y/15Y) | `server/src/routes/cefs.ts:285` |
| **calculateDividendVolatility** | Calculate DVI, SD, CV, Annual Dividend | `server/src/services/metrics.ts:145` |
| **calculateMetrics** | Calculate ETF metrics (Total Returns, Forward Yield) | `server/src/services/metrics.ts:756` |

---

## Database Storage

**All calculated and API-fetched data is stored in the `etf_static` table in Supabase.**

**Fields are saved during:**
- CEF Upload: Manual fields (Symbol, NAV Symbol, Description, etc.)
- `refresh_cefs.ts`: CEF metrics (Z-Score, Signal, NAV Returns, Premium/Discount, DVI, Annual Dividend)
- `refresh_all.ts`: ETF metrics (Total Returns, DVI, Annual Dividend, Forward Yield)

**Frontend reads from Database only** - no real-time calculations on the frontend.

