-- Remove CEFs from ETF list
-- This will clear nav_symbol and nav fields so they appear as regular ETFs
-- OR completely delete them

-- FIRST: Check which CEFs are currently in the database
SELECT 
  ticker,
  nav_symbol,
  nav,
  description,
  'CEF' as type
FROM etf_static
WHERE nav_symbol IS NOT NULL 
   OR nav IS NOT NULL
ORDER BY ticker;

-- OPTION 1: Clear CEF fields to convert them back to ETFs
-- (Keeps the data but removes CEF classification)
UPDATE etf_static 
SET nav_symbol = NULL, 
    nav = NULL,
    premium_discount = NULL,
    five_year_z_score = NULL,
    nav_trend_6m = NULL,
    nav_trend_12m = NULL,
    value_health_score = NULL,
    open_date = NULL
WHERE nav_symbol IS NOT NULL 
   OR nav IS NOT NULL;

-- OPTION 2: Completely delete CEFs
-- (Uncomment to use - removes them entirely)
-- DELETE FROM etf_static 
-- WHERE nav_symbol IS NOT NULL 
--    OR nav IS NOT NULL;

-- Verify: Check ETF count (should be 117 after removing 12 CEFs)
SELECT COUNT(*) as etf_count
FROM etf_static
WHERE (nav_symbol IS NULL OR nav_symbol = '')
  AND (nav IS NULL OR nav = '');

-- Verify: Check CEF count (should be 0 after clearing, or 12 if you kept them)
SELECT COUNT(*) as cef_count
FROM etf_static
WHERE nav_symbol IS NOT NULL 
   OR nav IS NOT NULL;

