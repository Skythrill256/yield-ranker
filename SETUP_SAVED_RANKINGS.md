# Setup Saved Rankings Feature

## Step 1: Run the Database Migration

Run this SQL in your Supabase SQL Editor:

```sql
-- Add preferences column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- Create index for faster JSON queries
CREATE INDEX IF NOT EXISTS idx_profiles_preferences ON profiles USING gin(preferences);

-- Add comment
COMMENT ON COLUMN profiles.preferences IS 'User preferences including custom ranking weights';

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'preferences';
```

## Step 2: Verify the Setup

After running the SQL, you should see output confirming the `preferences` column exists with type `jsonb`.

## Step 3: Test the Feature

1. **Login** to your account
2. **Open the Customize Rankings panel**
3. **Adjust the sliders** to your preferences (e.g., Yield: 40%, DVI: 30%, Total Return: 30%)
4. **Click "Apply Rankings"** - You should see a success toast
5. **Refresh the page** - Your custom weights should still be there!
6. **Logout and login again** - Weights should persist
7. **Click "Reset to Defaults"** - Should reset to 30/30/40 and save

## How It Works

### Automatic Save
- When you click **"Apply Rankings"**, weights are immediately saved to the database
- You'll see a success toast: "Rankings saved ✓"

### Automatic Load
- When you login, your saved weights are automatically loaded
- Both the main dashboard rankings AND individual ETF charts use the same weights
- Weights persist across sessions, devices, and browsers

### Data Structure
Your preferences are stored in the `profiles` table as JSON:

```json
{
  "ranking_weights": {
    "yield": 40,
    "stdDev": 30,
    "totalReturn": 30,
    "timeframe": "12mo"
  }
}
```

## Troubleshooting

### If weights don't save:
1. Check browser console for errors (press F12)
2. Verify the `preferences` column exists in Supabase
3. Check that the user is authenticated (profile should be loaded)

### If weights don't load:
1. Check browser console - should see "Loading saved weights: {...}"
2. Verify `AuthContext` includes preferences in the profile query
3. Check that preferences column has data in Supabase Table Editor

### Debug Commands

Open browser console (F12) and check for:
- `"Loading saved weights:"` - Shows when weights are loaded on mount
- `"Saved weights successfully:"` - Shows when weights are saved
- Any error messages

## Features

✅ **Persistent Rankings** - Saved to database, not just browser  
✅ **Cross-Device Sync** - Access your weights from any device  
✅ **Instant Apply** - Rankings update immediately  
✅ **Reset Option** - Easy reset to defaults (30/30/40/12mo)  
✅ **Both Charts** - Main dashboard and ETF detail view use same weights  
✅ **Timeframe Support** - Choose 3 Mo, 6 Mo, or 12 Mo  

## What Gets Saved

- Yield Weight (0-100%)
- Dividend Volatility Index Weight (0-100%)
- Total Return Weight (0-100%)
- Timeframe (3mo, 6mo, or 12mo)

Total must equal 100% to be valid and saveable.


