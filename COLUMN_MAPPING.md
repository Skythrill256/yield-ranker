# Excel Column Mapping Guide

## Your Spreadsheet Structure

Based on your 4 images showing ~108 ETF symbols, here are ALL the columns your Excel file has:

### Row 1 - Header Row

**ETF DETAILS:**
1. Favorites (checkbox column - unused)
2. **SYMBOL** ⭐ (Required, unique identifier)
3. **Issuer** (e.g., ROUNDHILL, YIELDMAX, GRANITE, etc.)
4. **DESC** (Description like AAPL, AMD, BITCOIN, etc.)
5. **Pay Day** (TU, FRI, THU, WED, Monthly, etc.)
6. **IPO PRICE** (Initial offering price)
7. **Price** ⭐ (Current price - YOUR most current data)
8. **Price Change** ⭐ (Daily change - YOUR data)
9. **Dividend** ⭐ (Latest dividend per payment)
10. **# Pmts** (Number of payments: 52 for weekly, 12 for monthly)
11. **Annual Div** ⭐ (Total annual dividend)
12. **Forward Yield** (Calculated: Annual Div / Price * 100)
13. **Dividend Volatility Index** (Standard deviation)
14. **Weighted Rank** (Your custom ranking, can be null/blank)

**TOTAL RETURNS (Price + Dividends):**
15. **3 YR Annlzd** (3-year annualized total return %)
16. **12 Month** (12-month total return %)
17. **6 Month** (6-month total return %)
18. **3 Month** (3-month total return %)
19. **1 Month** (1-month total return %)
20. **1 Week** (1-week total return %)

**PRICE RETURNS (Price change only, no dividends):**

Looking at your images, the Price Returns columns appear AFTER the Total Returns section. The system will automatically detect columns with "price" or "PRICE" in the header along with timeframe.

Common patterns detected:
- Headers containing "3 Yr" or "3 YR" + "price" or "PRICE"
- Headers containing "12" + "price" + "month"
- Headers containing "6" + "price" + "month"
- Headers containing "3" + "price" + "month"
- Headers containing "1" + "price" + "month"
- Headers containing "1" + "price" + "week" or "wk"

## How Backend Handles Your Data

### Smart Column Detection

The backend uses **flexible matching** to find columns:

1. **Exact Match First:** Looks for exact header names
2. **Pattern Match:** If not found, looks for keywords
3. **Case Insensitive:** Works with "PRICE" or "price"
4. **Space Tolerant:** Handles extra spaces

### Examples of Detected Headers

These will ALL be detected correctly:

**Total Returns:**
- "12 Month" ✅
- "12 MONTH" ✅
- "12-Month" ✅
- "12 Mo" ✅

**Price Returns:**
- "12 Month PRICE" ✅
- "PRICE 12 Month" ✅
- "12 Mo Price Return" ✅
- "Price Return 12M" ✅

### What Gets Saved

For EACH row (ETF symbol), these fields are saved to database:

```javascript
{
  symbol: "AAPW",                    // From "SYMBOL"
  issuer: "ROUNDHILL",               // From "Issuer"
  description: "AAPL",               // From "DESC"
  pay_day: "TU",                     // From "Pay Day"
  ipo_price: 50,                     // From "IPO PRICE"
  price: 42.61,                      // From "Price" ⭐ YOUR DATA
  price_change: 0.11,                // From "Price Change" ⭐ YOUR DATA
  dividend: 0.23638,                 // From "Dividend" ⭐ YOUR DATA
  payments_per_year: 52,             // From "# Pmts"
  annual_div: 12.40,                 // From "Annual Div"
  forward_yield: 29.1,               // Calculated or from column
  dividend_volatility_index: 0.4629, // From "Dividend Volatility Index"
  weighted_rank: null,               // From "Weighted Rank" (can be null)
  
  // TOTAL RETURNS (your spreadsheet data)
  three_year_annualized: null,       // From "3 YR Annlzd"
  total_return_12m: null,            // From "12 Month"
  total_return_6m: 31.06,            // From "6 Month"
  total_return_3m: 18.27,            // From "3 Month"
  total_return_1m: 10.51,            // From "1 Month"
  total_return_1w: 1.27,             // From "1 Week"
  
  // PRICE RETURNS (your spreadsheet data)
  price_return_3y: null,             // From price return column
  price_return_12m: null,            // From price return column
  price_return_6m: 23.57,            // From price return column
  price_return_3m: 9.40,             // From price return column
  price_return_1m: 1.28,             // From price return column
  price_return_1w: -5.63,            // From price return column
}
```

## Data Types Handled

### Numbers
- Plain: `42.61`
- With currency: `$42.61`
- With commas: `1,234.56`
- Percentages: `29.1%` or `29.1`
- Negative: `-5.63` or `(5.63)`

### Special Values
- `N/A` → saved as `null`
- `#N/A` → saved as `null`
- `#DIV/0!` → saved as `null`
- Empty cell → saved as `null`
- `#VALUE!` → saved as `null`

### Text
- Trimmed (spaces removed)
- Uppercase for symbols
- Preserved as-is for other fields

## All 108 Symbols Captured

When you upload your Excel file with ~108 rows (ETF symbols), the backend:

1. ✅ Reads ALL 108 rows
2. ✅ Parses EVERY column (20+ columns)
3. ✅ Handles N/A, blanks, percentages, currencies
4. ✅ Calculates yield if missing
5. ✅ Upserts to database (updates existing, adds new)
6. ✅ Returns success with count

## Toggle Between Views

The frontend table has a toggle button:

**"TOTAL RETURNS" view:**
- Shows: 3 Yr, 12 Mo, 6 Mo, 3 Mo, 1 Mo, 1 Wk (total returns)
- Columns come from: `total_return_*` fields

**"PRICE RETURNS" view:**
- Shows: 3 Yr, 12 Mo, 6 Mo, 3 Mo, 1 Mo, 1 Wk (price returns)
- Columns come from: `price_return_*` fields

User can click toggle to switch between views!

## What Happens After Upload

1. **Immediate Update:** All tables refresh with your data
2. **Rankings Update:** If you provided Weighted Rank, that's used
3. **Charts Update:** Performance chart uses your total return data
4. **No Yahoo Finance:** Tables show YOUR prices, dividends, changes

## Verification

After upload, check:

1. **Admin Panel:** Should show "Success! Processed 108 ETFs" (or your count)
2. **Main Table:** Click "Total Returns" / "Price Returns" toggle
3. **Check Values:** Should match your Excel exactly
4. **Check Yield:** Should be Annual Div / Price * 100
5. **Check Rank:** Should show your Weighted Rank or "-"

## Common Issues & Fixes

### "Only processed 50 ETFs instead of 108"
- Check for empty rows in Excel
- Make sure SYMBOL column has values
- Backend skips rows with blank symbol

### "Some percentages are wrong"
- Check if Excel has them as decimals (0.29 = 29%)
- Backend handles both: `29.1%` and `29.1` correctly

### "N/A showing as 0"
- This is correct! Null values display as "N/A" in table
- Database stores them as `null`

### "Price returns not showing"
- Make sure your Excel has price return columns
- Headers should contain "price" or "PRICE" + timeframe
- Check exact column headers in your file

## Test Upload

To test with sample data:

1. Create Excel with just 3 rows
2. Row 1: Headers (exact names above)
3. Rows 2-3: Sample ETF data
4. Upload and verify it works
5. Then upload your full 108-row file

## Summary

✅ **Backend captures ALL columns from your Excel**  
✅ **Both Total Returns AND Price Returns saved**  
✅ **All 108 symbols processed**  
✅ **Smart column detection (flexible matching)**  
✅ **Handles all number formats, N/A, blanks**  
✅ **Toggle between Total/Price returns in UI**  
✅ **YOUR data is primary source (not Yahoo Finance)**  

Upload your Excel → Everything populates automatically! 🚀

