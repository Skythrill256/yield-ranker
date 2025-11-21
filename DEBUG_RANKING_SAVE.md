# 🔍 Debug Guide: Ranking Weights Not Saving

## Step 1: Verify Database Setup

Run this in Supabase SQL Editor to check if everything is set up:

```sql
-- Check if preferences column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'preferences';

-- Check if you have any saved preferences
SELECT id, email, preferences 
FROM profiles 
WHERE id = auth.uid();
```

**Expected Result**: Should show the `preferences` column and your user's preferences (might be `{}` if nothing saved yet).

## Step 2: Check Browser Console

1. Open your app
2. Press **F12** to open DevTools
3. Go to **Console** tab
4. Open "Customize Rankings"
5. Change the weights (e.g., 40/30/30)
6. Select "3 Mo" timeframe
7. Click "Apply Rankings"

**Look for these console messages:**

✅ **Good signs:**
- `🎯 Applying rankings with weights: {...}`
- `💾 Attempting to save weights to database...`
- `💾 Saving ranking weights: {...}`
- `✅ Successfully saved preferences: {...}`
- `✅ Saved weights successfully: {...}`

❌ **Bad signs:**
- `❌ Cannot save: user ID is missing`
- `❌ Error saving preferences: ...`
- `❌ Failed to save weights: ...`

## Step 3: Test Direct Database Update

Run this in Supabase SQL Editor (replace with your actual user ID):

```sql
-- Get your user ID first
SELECT id, email FROM profiles WHERE email = 'your-email@example.com';

-- Then test updating preferences directly
UPDATE profiles
SET preferences = jsonb_set(
  COALESCE(preferences, '{}'::jsonb),
  '{ranking_weights}',
  '{"yield": 40, "stdDev": 30, "totalReturn": 30, "timeframe": "3mo"}'::jsonb
)
WHERE id = 'YOUR-USER-ID-HERE';

-- Verify it was saved
SELECT preferences FROM profiles WHERE id = 'YOUR-USER-ID-HERE';
```

If this works, the database is fine and the issue is in the frontend.

## Step 4: Check RLS Policies

```sql
-- Check if you can update your own profile
SELECT * FROM pg_policies 
WHERE tablename = 'profiles' 
AND policyname = 'Users can update own profile';
```

Should show a policy that allows `auth.uid() = id`.

## Step 5: Test the Backend Function

If direct updates don't work, try the backup function:

```sql
-- Test the function (replace with your user ID)
SELECT save_user_ranking_weights(
  'YOUR-USER-ID-HERE',
  40,  -- yield
  30,  -- std dev
  30,  -- total return
  '3mo' -- timeframe
);
```

## Step 6: Check Network Tab

1. Open DevTools → **Network** tab
2. Filter by "profiles"
3. Click "Apply Rankings"
4. Look for a PATCH/PUT request to `/rest/v1/profiles`
5. Check:
   - **Status**: Should be 200 or 204
   - **Request Payload**: Should include `preferences`
   - **Response**: Should show updated data

## Common Issues & Fixes

### Issue 1: "user ID is missing"
**Fix**: Make sure you're logged in. Check `user?.id` in console.

### Issue 2: "Failed to save preferences: permission denied"
**Fix**: RLS policy issue. Run the RLS check in Step 4.

### Issue 3: Preferences column doesn't exist
**Fix**: Run `COMPLETE_RANKING_SETUP.sql` in Supabase.

### Issue 4: Saves but doesn't load
**Fix**: Check if AuthContext is loading preferences. Look for `🔍 Profile preferences:` in console.

### Issue 5: Weights save but timeframe doesn't
**Fix**: Check that timeframe is included in the weights object being saved.

## Quick Test Script

Run this in browser console after clicking "Apply Rankings":

```javascript
// Check if weights were saved
const { data, error } = await supabase
  .from('profiles')
  .select('preferences')
  .eq('id', 'YOUR-USER-ID')
  .single();

console.log('Saved preferences:', data?.preferences);
console.log('Error:', error);
```

## Still Not Working?

1. **Check Supabase logs**: Dashboard → Logs → API Logs
2. **Check browser console**: Look for any red errors
3. **Check network requests**: See what's actually being sent
4. **Verify user is authenticated**: `auth.uid()` should return your user ID

## What to Give Backend Team

If you have a separate backend, give them:

1. **Database schema**: The `preferences` JSONB column
2. **API endpoint**: `PATCH /profiles/:id` with `{ preferences: {...} }`
3. **RLS policy**: Users can update their own profile
4. **Function**: `save_user_ranking_weights()` as backup

But since you're using Supabase, you shouldn't need a separate backend! The frontend should work directly with Supabase.


