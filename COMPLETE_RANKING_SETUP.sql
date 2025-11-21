-- ============================================
-- COMPLETE SETUP FOR SAVED RANKING WEIGHTS
-- Run this entire script in Supabase SQL Editor
-- ============================================

-- Step 1: Add preferences column if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- Step 2: Create GIN index for fast JSON queries
CREATE INDEX IF NOT EXISTS idx_profiles_preferences ON profiles USING gin(preferences);

-- Step 3: Add comment
COMMENT ON COLUMN profiles.preferences IS 'User preferences including custom ranking weights';

-- Step 4: Verify RLS policy allows users to update their own profile
-- (This should already exist, but we'll check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' 
    AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON profiles FOR UPDATE
      USING (auth.uid() = id);
  END IF;
END $$;

-- Step 5: Create backup function to save ranking weights
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
  -- Get current preferences
  SELECT COALESCE(preferences, '{}'::jsonb) INTO current_prefs
  FROM profiles
  WHERE id = p_user_id;

  -- Update ranking_weights in preferences
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

  -- Update the profile
  UPDATE profiles
  SET preferences = new_prefs,
      updated_at = now()
  WHERE id = p_user_id;

  -- Return the updated preferences
  RETURN new_prefs;
END;
$$;

-- Step 6: Grant execute permission
GRANT EXECUTE ON FUNCTION save_user_ranking_weights(uuid, integer, integer, integer, text) TO authenticated;

-- Step 7: Verify everything was created
SELECT 
  'Column exists' as check_type,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'preferences'
  ) THEN '✅ YES' ELSE '❌ NO' END as status
UNION ALL
SELECT 
  'Index exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'profiles' AND indexname = 'idx_profiles_preferences'
  ) THEN '✅ YES' ELSE '❌ NO' END
UNION ALL
SELECT 
  'Function exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'save_user_ranking_weights'
  ) THEN '✅ YES' ELSE '❌ NO' END
UNION ALL
SELECT 
  'RLS Policy exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' 
    AND policyname = 'Users can update own profile'
  ) THEN '✅ YES' ELSE '❌ NO' END;

-- ============================================
-- SUCCESS! Everything should show ✅ YES
-- ============================================

