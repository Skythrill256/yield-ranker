# Ex-Dividend Date, Record Date, and Pay Date - How We Get Them

## Summary

**Ex-Dividend Date**: Comes directly from Tiingo API (from price data where `divCash > 0`)
**Record Date**: Tiingo doesn't provide it, so we ESTIMATE it from the ex-date
**Pay Date**: Tiingo doesn't provide it, so we ESTIMATE it from the ex-date based on frequency

## Detailed Flow

### 1. Ex-Dividend Date (from Tiingo)
- **Source**: Tiingo EOD (End-of-Day) price API
- **Field**: `p.date` where `p.divCash > 0`
- **Format**: `"2025-10-16"` or `"2025-10-16T00:00:00.000Z"`
- **What we do**: Extract date string, store as `ex_date` in database
- **Example**: Tiingo returns `date: "2025-10-16"` → We store `ex_date: "2025-10-16"`

### 2. Record Date (ESTIMATED, not from Tiingo)
- **Source**: Tiingo EOD API does NOT provide record dates
- **What Tiingo returns**: `recordDate: null` (line 396 in tiingo.ts)
- **What we do**: Estimate it using `estimateDividendDates()` function
- **Estimation logic**: 
  - **Current (T+1 settlement)**: Record date = Same as ex-date
  - **Historical (T+2 settlement)**: Would be 1 business day after ex-date, but we use same date for simplicity

### 3. Pay Date (ESTIMATED, not from Tiingo)
- **Source**: Tiingo EOD API does NOT provide pay dates
- **What Tiingo returns**: `paymentDate: null` (line 397 in tiingo.ts)
- **What we do**: Estimate it using `estimateDividendDates()` function
- **Estimation logic**: Based on dividend frequency (business days after ex-date):
  - **Weekly** (52 payments/year): 4 business days after ex-date
  - **Monthly** (12 payments/year): 7 business days after ex-date
  - **Quarterly** (4 payments/year): 14 business days after ex-date
  - **Semi-Annual** (2 payments/year): 21 business days after ex-date
  - **Annual** (1 payment/year): 28 business days after ex-date

### 4. Code Flow

```
Tiingo API (EOD prices)
  ↓
fetchDividendHistory() in tiingo.ts
  ↓
Returns: { date: "2025-10-16", recordDate: null, paymentDate: null }
  ↓
tiingo.ts route handler (line 373-380)
  ↓
If recordDate or payDate is null → estimateDividendDates(exDate, paymentsPerYear)
  ↓
Estimate:
  - recordDate = exDate (same date, T+1 settlement)
  - payDate = exDate + X business days (based on frequency)
  ↓
Store in database:
  - ex_date = "2025-10-16" (from Tiingo)
  - record_date = "2025-10-16" (estimated)
  - pay_date = "2025-10-23" (estimated, example for monthly = +7 business days)
```

## Key Points

1. **Different fields**: 
   - `ex_date` = from Tiingo API (actual data)
   - `record_date` = estimated by us (not from Tiingo)
   - `pay_date` = estimated by us (not from Tiingo)

2. **Same value for record date**: 
   - With T+1 settlement, record date = ex-date
   - So they end up being the same date

3. **Tiingo doesn't provide record or pay dates**:
   - Tiingo EOD API only provides ex-dividend dates (when divCash > 0)
   - We must estimate record dates and pay dates ourselves

4. **Pay date estimation**:
   - Based on dividend frequency (payments per year)
   - Calculated as business days after ex-date
   - Example: Monthly dividend (12/year) = ex-date + 7 business days

5. **No impact on calculations**:
   - All dividend calculations use `ex_date` only
   - `record_date` and `pay_date` are only for display
   - Changing date estimation doesn't affect days, frequency, or normalization

## Database Fields

- `ex_date`: From Tiingo API (actual ex-dividend date)
- `record_date`: Estimated by us (currently same as ex-date for T+1 settlement)
- `pay_date`: Estimated by us (varies by frequency: weekly=+4 days, monthly=+7 days, etc.)

