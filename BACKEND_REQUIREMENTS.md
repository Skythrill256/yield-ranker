# Backend Requirements for Saved Ranking Weights

## ⚠️ IMPORTANT: You're Using Supabase

Since you're using **Supabase**, you **DON'T need a separate backend**! Supabase IS your backend. However, if you have a custom backend API, here's what they need:

---

## Database Requirements

### 1. Add Preferences Column

```sql
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_profiles_preferences 
ON profiles USING gin(preferences);
```

### 2. RLS Policy (Already Should Exist)

```sql
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
```

This allows users to update their own profile, including the `preferences` column.

---

## API Endpoint (If Custom Backend)

### Endpoint: `PATCH /api/profiles/:userId`

**Request:**
```json
{
  "preferences": {
    "ranking_weights": {
      "yield": 40,
      "stdDev": 30,
      "totalReturn": 30,
      "timeframe": "3mo"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "preferences": {
      "ranking_weights": {
        "yield": 40,
        "stdDev": 30,
        "totalReturn": 30,
        "timeframe": "3mo"
      }
    }
  }
}
```

**Authentication:** Bearer token (JWT from Supabase)

**Authorization:** User can only update their own profile (`userId` must match authenticated user)

---

## Database Function (Backup Method)

If direct updates don't work, use this function:

```sql
CREATE OR REPLACE FUNCTION save_user_ranking_weights(
  p_user_id uuid,
  p_yield_weight integer,
  p_std_dev_weight integer,
  p_total_return_weight integer,
  p_timeframe text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_prefs jsonb;
  new_prefs jsonb;
BEGIN
  SELECT COALESCE(preferences, '{}'::jsonb) INTO current_prefs
  FROM profiles WHERE id = p_user_id;

  new_prefs := jsonb_set(
    current_prefs,
    '{ranking_weights}',
    jsonb_build_object(
      'yield', p_yield_weight,
      'stdDev', p_std_dev_weight,
      'totalReturn', p_total_return_weight,
      'timeframe', p_timeframe
    )
  );

  UPDATE profiles
  SET preferences = new_prefs, updated_at = now()
  WHERE id = p_user_id;

  RETURN new_prefs;
END;
$$;

GRANT EXECUTE ON FUNCTION save_user_ranking_weights(uuid, integer, integer, integer, text) TO authenticated;
```

---

## What the Frontend Does

The frontend uses Supabase client directly:

```typescript
// Save
await supabase
  .from('profiles')
  .update({ preferences: { ranking_weights: {...} } })
  .eq('id', userId);

// Load
const { data } = await supabase
  .from('profiles')
  .select('preferences')
  .eq('id', userId)
  .single();
```

This works **automatically** with Supabase - no custom backend needed!

---

## Testing

### Test Direct Update:
```sql
UPDATE profiles
SET preferences = jsonb_set(
  COALESCE(preferences, '{}'::jsonb),
  '{ranking_weights}',
  '{"yield": 40, "stdDev": 30, "totalReturn": 30, "timeframe": "3mo"}'::jsonb
)
WHERE id = auth.uid();
```

### Test Function:
```sql
SELECT save_user_ranking_weights(
  auth.uid(),
  40, 30, 30, '3mo'
);
```

### Verify:
```sql
SELECT preferences FROM profiles WHERE id = auth.uid();
```

---

## Summary

**If using Supabase (which you are):**
- ✅ Just run `COMPLETE_RANKING_SETUP.sql`
- ✅ Frontend works automatically
- ✅ No custom backend needed

**If you have a custom backend:**
- Implement `PATCH /api/profiles/:userId` endpoint
- Update `preferences` JSONB column
- Ensure user can only update their own profile
- Return updated preferences in response

---

## Files to Run

1. **`COMPLETE_RANKING_SETUP.sql`** - Complete setup (run this!)
2. **`SAVE_RANKING_WEIGHTS_BACKEND.sql`** - Backup function (optional)
3. **`DEBUG_RANKING_SAVE.md`** - Debugging guide

---

## Quick Answer

**Q: Do I need backend changes?**  
**A: NO!** Just run `COMPLETE_RANKING_SETUP.sql` in Supabase SQL Editor. That's it!

The frontend code already handles everything through Supabase's auto-generated API.


