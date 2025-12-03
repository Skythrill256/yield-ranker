# Data Update Schedule

## Current Update Mechanism

### Daily Automated Updates
- **Schedule**: Runs once daily at **8:00 PM EST** (after market close)
- **Script**: `server/scripts/daily_update.ts`
- **Process**:
  1. Fetches incremental price data from Tiingo (only new data since last sync)
  2. Checks last 30 days for new dividends
  3. Recalculates all metrics (annualized dividend, volatility, returns)
  4. Updates database with latest information

### Data Flow
1. **Tiingo API** → Daily update script fetches latest data
2. **Database** → Data stored in Supabase (prices_daily, dividends_detail, etf_static)
3. **Frontend** → Fetches from database (cached for 10 seconds)

### Update Frequency
- **Prices**: Incremental updates (only fetches new data since last sync)
- **Dividends**: Checks last 30 days for new announcements
- **Metrics**: Recalculated after each update

### Manual Updates
To manually trigger an update:
```bash
# Update all tickers
npx tsx server/scripts/daily_update.ts

# Update specific ticker
npx tsx server/scripts/daily_update.ts --ticker GOOP

# Force full resync (last 60 days)
npx tsx server/scripts/daily_update.ts --force
```

### Frontend Cache
- Frontend caches ETF data for **10 seconds** to reduce API calls
- Cache is automatically cleared when data is refreshed
- Users see data from database, which is updated daily from Tiingo

### Notes
- Data is **END OF DAY (EOD)** - not real-time
- Updates occur after market close (8:00 PM EST)
- Weekend updates may not show new data if market was closed
- Latest data available depends on when Tiingo processes EOD data (typically same day after close)

