-- ============================================
-- Backend Function to Save Ranking Weights
-- This is a backup method if direct updates don't work
-- ============================================

-- Function to save user ranking preferences
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION save_user_ranking_weights(uuid, integer, integer, integer, text) TO authenticated;

-- Add comment
COMMENT ON FUNCTION save_user_ranking_weights IS 'Saves user ranking weights to preferences. Used as backup if direct updates fail.';

-- ============================================
-- Test the function (optional - remove after testing)
-- ============================================
-- SELECT save_user_ranking_weights(
--   auth.uid(),  -- Your user ID
--   40,          -- yield weight
--   30,          -- std dev weight
--   30,          -- total return weight
--   '3mo'        -- timeframe
-- );


