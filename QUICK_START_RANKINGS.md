# ⚡ Quick Start: Saved Rankings

## 1️⃣ Run This SQL (Supabase SQL Editor)

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_profiles_preferences ON profiles USING gin(preferences);
```

## 2️⃣ Test It

1. **Login** to your app
2. **Open** "Customize Rankings" 
3. **Adjust** sliders (try 40/30/30)
4. **Click** "Apply Rankings" → See success toast ✅
5. **Refresh** page → Rankings still there! ✓
6. **Logout & Login** → Still there! ✓

## 3️⃣ Verify (Press F12)

Look in Console for:
- ✅ `"Loading saved weights: {...}"` on page load
- ✅ `"Saved weights successfully: {...}"` after clicking Apply

## ✨ Features

- **Persistent** - Saved to database forever
- **Cross-device** - Works on any device you login from
- **Both charts** - Main dashboard + ETF detail view stay in sync
- **Auto-load** - No need to set rankings again
- **Reset option** - Easy return to defaults (30/30/40/12mo)

## 🔍 What Gets Saved

- Yield Weight (%)
- Dividend Volatility Weight (%)
- Total Return Weight (%)
- Timeframe (3mo/6mo/12mo)

## 💡 Key Fix

The **critical fix** was adding `preferences` to the AuthContext query. Without this, preferences would never load from the database!

```typescript
// BEFORE (didn't work):
.select('id,email,role,is_premium,display_name,created_at,updated_at')

// AFTER (works!):
.select('id,email,role,is_premium,display_name,created_at,updated_at,preferences')
```

That's it! Rankings now persist across sessions. 🚀

