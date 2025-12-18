# CEF Upload Excel Format Guide

## Required Columns

Your Excel spreadsheet **MUST** have these columns:

### Minimum Required:
- **SYMBOL** (or TICKER) - The CEF ticker symbol (e.g., DNP, FOF, GOF)
- **Last Div** (or Last Dividend) - Last dividend amount per share

### Recommended for Complete Data:
- **NAV Symbol** - The NAV ticker (e.g., XDNPX, XFOFX) - Used to fetch NAV prices from Tiingo
- **MP** (or Market Price) - Current market price
- **NAV** (or Net Asset Value) - Current NAV value
- **Description** - CEF description
- **OPEN** (or Open Date) - Opening/inception date
- **IPO Price** - IPO price
- **#** (or Payments) - Number of payments per year (12 = monthly, 4 = quarterly, 52 = weekly)
- **Yrly Div** (or Annual Dividend) - Yearly dividend
- **F Yield** (or Forward Yield) - Forward yield percentage
- **Prem/Disc** (or Premium/Discount) - Premium/Discount percentage (will be calculated if MP and NAV provided)
- **5 Yr Z-Score** (or 5Y Z-Score) - 5-year Z-Score
- **6M NAV Trend** (or 6M NAV Trend %) - 6-month NAV trend percentage
- **12M NAV Return** (or 12M NAV Return %) - 12-month NAV return percentage
- **Value/Health Score** - Value/Health Score
- **DVI** - Dividend Volatility Index

### Returns (Optional - can come from Tiingo):
- **10 YR Annlzd** - 10-year annualized return
- **5 YR Annlzd** - 5-year annualized return
- **3 YR Annlzd** - 3-year annualized return
- **12 Month** - 12-month return
- **6 Month** - 6-month return
- **3 Month** - 3-month return
- **1 Month** - 1-month return
- **1 Week** - 1-week return

## Column Name Flexibility

The system accepts multiple column name variations. For example:
- "SYMBOL" or "TICKER" or "Ticker Symbol"
- "Last Div" or "Last Dividend" or "Last_Dividend"
- "NAV Symbol" or "NAV Symbol" or "NAVSym" or "Nav Ticker"
- "MP" or "Market Price" or "Price"
- "NAV" or "Net Asset Value" or "NAV Value"

## Example Spreadsheet Format

| SYMBOL | NAV Symbol | Description | OPEN | IPO Price | MP | NAV | Last Div | # | Yrly Div | F Yield | Prem/Disc | 5 Yr Z-Score | 6M NAV Trend | 12M NAV Return | Value/Health Score |
|--------|------------|------------|------|-----------|----|----|----------|---|----------|---------|-----------|--------------|--------------|----------------|-------------------|
| DNP    | XDNPX      | Elec, Renew | 1/87 | 10.00     | 10.02 | 9.09 | 0.0650 | 12 | 0.78 | 7.8% | 10.23% | 14.40 | 0.0000 | 8.94 | 7.45 |
| FOF    | XFOFX      | US stocks  | 11/06 | 20.00     | 13.05 | 12.99 | 0.0870 | 12 | 1.04 | 8.0% | 0.46% | 0.90 | 0.0000 | 10.71 | 14.31 |

## What Gets Calculated Automatically

After upload and running `npm run refresh:all`:

1. **Market Prices** - Fetched from Tiingo daily
2. **NAV Prices** - Fetched from Tiingo using NAV Symbol (if provided)
3. **Dividends** - Fetched from Tiingo, with manual "Last Div" preserved
4. **Forward Yield** - Calculated: `(Annual Dividend / Market Price) * 100`
5. **Premium/Discount** - Calculated: `(Market Price - NAV) / NAV * 100` (if MP and NAV provided)
6. **Total Returns** - Calculated from price history and dividends (same as CC ETFs)
7. **DVI** - Calculated from dividend history
8. **Ranking** - Calculated using Yield, DVI, and Total Returns (same system as CC ETFs)

## Important Notes

- **Last Div** is saved as a manual dividend and takes priority over Tiingo data
- **NAV Symbol** is critical - without it, NAV prices cannot be fetched from Tiingo
- **Premium/Discount** will be calculated automatically if you provide MP and NAV
- **Returns** can be uploaded or calculated from Tiingo price history
- All calculations use the same accurate system as Covered Call ETFs

