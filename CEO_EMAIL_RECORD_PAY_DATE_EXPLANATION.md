# Record Date & Pay Date Estimation - For CEO

## How We Estimate Dates

**Tiingo API provides**: Only ex-dividend dates (when dividend is paid)

**Tiingo API does NOT provide**: Record dates or pay dates

**Our solution**: We estimate both dates from the ex-dividend date

---

## Record Date Estimation

**Rule**: Record date = Same as ex-dividend date

**Reason**: With T+1 settlement (since May 2024), the record date and ex-dividend date are the same day.

**Example**: 
- Ex-date: October 16, 2025
- Record date: October 16, 2025 (same date)

---

## Pay Date Estimation

**Rule**: Pay date = Ex-date + X business days (based on dividend frequency)

**Frequency-based timing**:
- **Weekly** dividends: 4 business days after ex-date
- **Monthly** dividends: 7 business days after ex-date  
- **Quarterly** dividends: 14 business days after ex-date
- **Semi-Annual** dividends: 21 business days after ex-date
- **Annual** dividends: 28 business days after ex-date

**Example** (Monthly dividend):
- Ex-date: October 16, 2025
- Pay date: October 23, 2025 (7 business days later)

---

## Important Notes

✅ **Ex-dividend date**: Actual data from Tiingo API (100% accurate)

⚠️ **Record date & Pay date**: Estimated by us (for display purposes only)

✅ **No impact on calculations**: All dividend calculations (days, frequency, normalization) use only the ex-dividend date. Record and pay dates are purely for display.

---

**Bottom line**: We show estimated record and pay dates to help users, but all our calculations rely solely on the ex-dividend date from Tiingo.

