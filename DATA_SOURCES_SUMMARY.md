# Data Sources Summary

## 📊 **FROM EXCEL SHEET (DTR Upload)**

These 6 fields come from the Excel spreadsheet uploaded via Admin Panel:

1. **SYMBOL** (Ticker) - Required
2. **Issuer** - Company name (e.g., "YieldMax")
3. **Description** - ETF name/description
4. **Pay Day** - Payment frequency text (e.g., "Monthly", "Weekly")
5. **# Payments** - Number of payments per year (e.g., 12, 52)
6. **IPO Price** - Initial public offering price

---

## 🔌 **FROM TIINGO API**

These fields are automatically fetched from Tiingo API:

### Price Data:
- **Current Price** - Latest trading price
- **Price Change** - Daily price change ($)
- **Price Change %** - Daily price change (%)
- **52-Week High** - Highest price in past year
- **52-Week Low** - Lowest price in past year
- **Historical Prices** - All daily prices for return calculations

### Dividend Data:
- **Dividend History** - All dividend payments with:
  - Ex-Date
  - Payment Date
  - Record Date
  - Dividend Amount
  - Split-Adjusted Amount
  - Dividend Type (Regular/Special)

---

## 🧮 **CALCULATED BY SYSTEM** (Not from Excel or API)

These metrics are calculated automatically using the data above:

### Dividend Metrics:
- **Annual Dividend** - Calculated from last dividend × payments per year
- **Forward Yield** - Annual dividend ÷ current price
- **Dividend Volatility (DVI)** - Coefficient of variation of dividend payments

### Return Metrics:
- **Total Returns (with DRIP)** - 1W, 1M, 3M, 6M, 1Y, 3Y
- **Price Returns** - 1W, 1M, 3M, 6M, 1Y, 3Y
- **Total Returns (without DRIP)** - 1W, 1M, 3M, 6M, 1Y, 3Y

### Ranking:
- **Weighted Rank** - Custom ranking based on yield, volatility, and returns

---

## 📝 **SUMMARY**

- **Excel provides:** Basic ETF identity and payment schedule (6 fields)
- **API provides:** All live price and dividend data (automatically updated)
- **System calculates:** All performance metrics and rankings

**Total Fields Displayed:** ~30+ fields per ETF
**Manual Entry Required:** Only 6 fields via Excel upload
**Automatic Updates:** Prices and dividends update daily via Tiingo API

