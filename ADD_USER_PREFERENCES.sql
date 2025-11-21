-- ============================================
-- Add User Preferences to Profiles Table
-- This enables users to save custom ranking weights
-- ============================================

-- Step 1: Add preferences column as JSONB
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- Step 2: Create GIN index for faster JSON queries
CREATE INDEX IF NOT EXISTS idx_profiles_preferences ON profiles USING gin(preferences);

-- Step 3: Add descriptive comment
COMMENT ON COLUMN profiles.preferences IS 'User preferences including custom ranking weights, saved screeners, etc.';

-- ============================================
-- Example Preference Structure:
-- ============================================
-- {
--   "ranking_weights": {
--     "yield": 30,
--     "stdDev": 30,
--     "totalReturn": 40,
--     "timeframe": "12mo"
--   },
--   "return_view": "total"
-- }

-- ============================================
-- Verification Queries
-- ============================================

-- Verify column exists
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
  AND column_name = 'preferences';

-- Verify index exists
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'profiles'
  AND indexname = 'idx_profiles_preferences';

-- Show current profile count
SELECT COUNT(*) as total_profiles FROM profiles;

-- ============================================
-- Success Message
-- ============================================
-- If you see the preferences column and index listed above,
-- the migration was successful! ✓
-- 
-- All user profiles now support saving custom ranking weights.
-- Users can customize their rankings and they will persist
-- across sessions and devices.
-- ============================================

