# What to Give Your Backend Team

## Excel File Format

Your backend developer needs to know EXACTLY what to expect from your Excel file.

### File Structure

**File Name:** `DTR 11-16-25.xlsx` (or any .xlsx file)  
**Sheet Name:** `Sheet1` (MUST be named Sheet1)  
**Format:**
- **Row 1:** Headers (column names)
- **Rows 2+:** Data (one ETF per row)

### Exact Column Headers (Row 1)

Tell your backend developer the Excel file has these EXACT headers in Row 1:

```
1.  Favorites (checkbox - ignore this)
2.  SYMBOL
3.  Issuer
4.  DESC
5.  Pay Day
6.  IPO PRICE
7.  Price
8.  Price Change
9.  Dividend
10. # Pmts
11. Annual Div
12. Forward Yield
13. Dividend Volatility Index
14. Weighted Rank
15. 3 YR Annlzd
16. 12 Month
17. 6 Month
18. 3 Month
19. 1 Month
20. 1 Week
```

### Data Types Per Column

| Header | Type | Example | Notes |
|--------|------|---------|-------|
| Favorites | Boolean | TRUE/FALSE | Ignore this column |
| **SYMBOL** | Text | `AAPW` | ⭐ REQUIRED, unique key |
| Issuer | Text | `ROUNDHILL` | Can be blank |
| DESC | Text | `AAPL` | Description/underlying |
| Pay Day | Text | `TU`, `FRI`, `Monthly` | Payment schedule |
| IPO PRICE | Number | `50` | Initial price, can be blank |
| **Price** | Number | `42.61` | Current price from YOUR data |
| **Price Change** | Number | `0.11`, `-0.05` | Daily change |
| **Dividend** | Number | `0.23638` | Latest dividend payment |
| # Pmts | Integer | `52`, `12` | Payments per year |
| Annual Div | Number | `12.40` | Total annual dividend |
| Forward Yield | Number | `29.1` | Can be blank (auto-calc) |
| Dividend Volatility Index | Number | `0.4629` | Standard deviation |
| Weighted Rank | Number | `1`, `2`, `3` or blank | Your custom ranking |
| 3 YR Annlzd | Number | blank or `25.5` | 3-year total return % |
| **12 Month** | Number | blank or `31.06` | 12-month total return % |
| **6 Month** | Number | blank or `31.06` | 6-month total return % |
| **3 Month** | Number | blank or `18.27` | 3-month total return % |
| **1 Month** | Number | blank or `10.51` | 1-month total return % |
| **1 Week** | Number | blank or `1.27` | 1-week total return % |

### Special Values Backend Must Handle

```javascript
// N/A values in Excel:
N/A        → save as null
#N/A       → save as null
#DIV/0!    → save as null
#VALUE!    → save as null
(empty cell) → save as null

// Currency values:
$42.61     → parse as 42.61
$1,234.56  → parse as 1234.56

// Percentages:
29.1%      → parse as 29.1 (not 0.291)
29.1       → parse as 29.1

// Negative numbers:
-5.63      → parse as -5.63
(5.63)     → parse as -5.63
```

### Example Rows (What They'll See)

```
Row 1 (Headers):
SYMBOL | Issuer     | DESC   | Pay Day | IPO PRICE | Price | Price Change | Dividend | # Pmts | Annual Div | Forward Yield | ...

Row 2 (Example ETF):
AAPW   | ROUNDHILL  | AAPL   | TU      | 50        | 42.61 | 0.11         | 0.23638  | 52     | 12.40      | 29.1          | ...

Row 3 (Example with N/A):
APLY   | YIELDMAX   | AAPL   | FRI     | 20        | 13.81 | 0.04         | 0.0647   | 52     | 3.3644     | 24.3621       | ...
```

## Database Schema

Tell your backend developer to create this table:

### Supabase SQL

```sql
CREATE TABLE IF NOT EXISTS etfs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT UNIQUE NOT NULL,
  issuer TEXT,
  description TEXT,
  pay_day TEXT,
  ipo_price NUMERIC,
  price NUMERIC,
  price_change NUMERIC,
  dividend NUMERIC,
  payments_per_year INTEGER,
  annual_div NUMERIC,
  forward_yield NUMERIC,
  dividend_volatility_index NUMERIC,
  weighted_rank NUMERIC,
  three_year_annualized NUMERIC,
  total_return_12m NUMERIC,
  total_return_6m NUMERIC,
  total_return_3m NUMERIC,
  total_return_1m NUMERIC,
  total_return_1w NUMERIC,
  favorites BOOLEAN DEFAULT false,
  spreadsheet_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_etfs_symbol ON etfs(symbol);
CREATE INDEX IF NOT EXISTS idx_etfs_weighted_rank ON etfs(weighted_rank);
CREATE INDEX IF NOT EXISTS idx_etfs_forward_yield ON etfs(forward_yield);
```

## Excel → Database Mapping

Tell your backend developer this exact mapping:

| Excel Header | Database Column | Notes |
|--------------|-----------------|-------|
| Favorites | (skip) | Don't save this |
| SYMBOL | symbol | Convert to UPPERCASE |
| Issuer | issuer | As-is |
| DESC | description | As-is |
| Pay Day | pay_day | As-is |
| IPO PRICE | ipo_price | Parse as number |
| Price | price | Parse as number |
| Price Change | price_change | Parse as number (can be negative) |
| Dividend | dividend | Parse as number |
| # Pmts | payments_per_year | Parse as integer |
| Annual Div | annual_div | Parse as number |
| Forward Yield | forward_yield | Parse as number, or auto-calc if blank |
| Dividend Volatility Index | dividend_volatility_index | Parse as number |
| Weighted Rank | weighted_rank | Parse as number, can be null |
| 3 YR Annlzd | three_year_annualized | Parse as number, can be null |
| 12 Month | total_return_12m | Parse as number, can be null |
| 6 Month | total_return_6m | Parse as number, can be null |
| 3 Month | total_return_3m | Parse as number, can be null |
| 1 Month | total_return_1m | Parse as number, can be null |
| 1 Week | total_return_1w | Parse as number, can be null |

## Auto-Calculation

If `Forward Yield` is blank/N/A in Excel, calculate it:

```javascript
if (forward_yield is null && price > 0 && annual_div is not null) {
  forward_yield = (annual_div / price) * 100;
}
```

## Upload Behavior

When user uploads Excel file:

1. **Read Sheet1** (first sheet in workbook)
2. **Parse Row 1** to get column indices
3. **Loop Rows 2+** (skip row 1)
4. **For each row:**
   - Extract SYMBOL (must not be blank)
   - Extract all other columns using indices
   - Parse numbers (handle currency, percentages, N/A)
   - Calculate forward_yield if needed
   - UPSERT to database:
     - If symbol exists → UPDATE all columns
     - If symbol doesn't exist → INSERT new row
5. **Set spreadsheet_updated_at** to current timestamp
6. **Return success** with count of processed ETFs

### Upsert Logic (PostgreSQL/Supabase)

```sql
INSERT INTO etfs (symbol, issuer, description, ..., spreadsheet_updated_at)
VALUES ($1, $2, $3, ..., NOW())
ON CONFLICT (symbol)
DO UPDATE SET
  issuer = EXCLUDED.issuer,
  description = EXCLUDED.description,
  ...
  spreadsheet_updated_at = NOW(),
  updated_at = NOW();
```

## API Endpoints

Backend needs to implement these endpoints:

### 1. Upload Excel
```
POST /api/admin/upload-dtr
Content-Type: multipart/form-data
Body: file (Excel file)

Response:
{
  "message": "Successfully processed 108 ETFs",
  "count": 108
}
```

### 2. Get All ETFs
```
GET /api/etfs

Response:
{
  "data": [
    {
      "symbol": "AAPW",
      "issuer": "ROUNDHILL",
      "description": "AAPL",
      "pay_day": "TU",
      "ipo_price": 50,
      "price": 42.61,
      "price_change": 0.11,
      "dividend": 0.23638,
      "payments_per_year": 52,
      "annual_div": 12.40,
      "forward_yield": 29.1,
      "dividend_volatility_index": 0.4629,
      "weighted_rank": null,
      "three_year_annualized": null,
      "total_return_12m": null,
      "total_return_6m": 31.06,
      "total_return_3m": 18.27,
      "total_return_1m": 10.51,
      "total_return_1w": 1.27,
      "favorites": false,
      "spreadsheet_updated_at": "2024-11-18T10:30:00Z",
      "created_at": "2024-11-15T08:00:00Z",
      "updated_at": "2024-11-18T10:30:00Z"
    },
    ...
  ],
  "count": 108
}
```

### 3. Get Single ETF
```
GET /api/etfs/:symbol
Example: GET /api/etfs/AAPW

Response:
{
  "data": { /* same structure as above */ }
}
```

### 4. Yahoo Finance Returns (for filling gaps)
```
GET /api/yahoo-finance/returns?symbol=AAPW

Response:
{
  "symbol": "AAPW",
  "currentPrice": 42.65,
  "priceChange": 0.15,
  "priceReturn1Wk": 1.27,
  "priceReturn1Mo": 10.51,
  "priceReturn3Mo": 18.27,
  "priceReturn6Mo": 31.06,
  "priceReturn12Mo": 45.20,
  "priceReturn3Yr": 87.50,
  "totalReturn1Wk": 1.50,
  "totalReturn1Mo": 11.20,
  "totalReturn3Mo": 19.80,
  "totalReturn6Mo": 33.40,
  "totalReturn12Mo": 48.90,
  "totalReturn3Yr": 95.30
}
```

### 5. Dividend History (5 years)
```
GET /api/yahoo-finance/dividends?symbol=AAPW

Response:
{
  "symbol": "AAPW",
  "dividends": [
    { "date": "2024-11-15", "amount": 0.23638 },
    { "date": "2024-11-08", "amount": 0.23638 },
    { "date": "2024-11-01", "amount": 0.23000 },
    ...
  ]
}
```

## Error Handling

Backend must handle these errors:

### 1. No SYMBOL column
```json
{
  "error": "SYMBOL column not found in Excel file"
}
```

### 2. Empty SYMBOL value
Skip row, don't error (just log warning)

### 3. Invalid Excel format
```json
{
  "error": "Invalid Excel file format"
}
```

### 4. Database error
```json
{
  "error": "Failed to save data to database",
  "details": "Connection timeout"
}
```

### 5. Yahoo Finance API error
```json
{
  "error": "Failed to fetch Yahoo Finance data",
  "symbol": "AAPW"
}
```

## Environment Variables

Backend needs these:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PORT=4000
```

## Dependencies (package.json)

```json
{
  "name": "yield-ranker-backend",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.1",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.21.2",
    "multer": "^1.4.5-lts.1",
    "xlsx": "^0.18.5",
    "yahoo-finance2": "^2.11.3"
  }
}
```

## Testing Checklist

Backend developer should test:

1. ✅ Upload Excel with 108 rows → Verify 108 ETFs in database
2. ✅ Upload same Excel again → Verify UPDATE (not duplicate)
3. ✅ Check SYMBOL "AAPW" → Verify all 19 columns saved correctly
4. ✅ Check N/A values → Verify saved as `null`
5. ✅ Check currency $42.61 → Verify saved as `42.61`
6. ✅ Check percentage 29.1% → Verify saved as `29.1`
7. ✅ GET /api/etfs → Verify returns all 108
8. ✅ GET /api/etfs/AAPW → Verify returns single ETF
9. ✅ GET /api/yahoo-finance/returns?symbol=AAPW → Verify returns real-time data
10. ✅ GET /api/yahoo-finance/dividends?symbol=AAPW → Verify returns 5 years history

## Summary for Backend Developer

**Input:** Excel file with 108 ETF rows, 20 columns  
**Process:** Parse Sheet1, extract all columns, handle N/A/currency/percentages  
**Output:** Upsert to Supabase `etfs` table  
**Additional:** Provide Yahoo Finance API endpoints for real-time data  
**Result:** Frontend gets spreadsheet data + real-time fills gaps  

✅ Spreadsheet = PRIMARY source (Price, Dividend, Total Returns)  
✅ Yahoo Finance = SUPPLEMENT (Price Returns, Dividend History, Fill N/A)


