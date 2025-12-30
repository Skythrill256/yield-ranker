-- ============================================================================
-- VERIFY AND FIX CEF/ETF SEPARATION - FINAL CHECK
-- ============================================================================
-- Run this to verify everything is correct and fix any remaining issues
-- ============================================================================

-- CHECK 1: Count CEFs (should be 12)
SELECT 
    'CEFs' as type,
    COUNT(*) as count
FROM etf_static
WHERE category = 'CEF'
    AND nav IS NOT NULL 
    AND nav != 0 
    AND nav_symbol IS NOT NULL 
    AND nav_symbol != ''
    AND ticker != nav_symbol;

-- CHECK 2: Count CC ETFs (should be 117)
SELECT 
    'CC ETFs' as type,
    COUNT(*) as count
FROM etf_static
WHERE category = 'CCETF'
    AND NOT (nav IS NOT NULL AND nav != 0 AND nav_symbol IS NOT NULL AND nav_symbol != '')
    AND issuer IS NOT NULL 
    AND issuer != '';

-- CHECK 3: Find CEFs that are NOT category = 'CEF' (should be 0)
SELECT 
    'CEFs with wrong category' as issue,
    COUNT(*) as count
FROM etf_static
WHERE 
    nav IS NOT NULL 
    AND nav != 0 
    AND nav_symbol IS NOT NULL 
    AND nav_symbol != ''
    AND ticker != nav_symbol
    AND (category IS NULL OR category != 'CEF');

-- CHECK 4: Find CC ETFs that are NOT category = 'CCETF' (should be 0)
SELECT 
    'CC ETFs with wrong category' as issue,
    COUNT(*) as count
FROM etf_static
WHERE 
    NOT (nav IS NOT NULL AND nav != 0 AND nav_symbol IS NOT NULL AND nav_symbol != '')
    AND issuer IS NOT NULL 
    AND issuer != ''
    AND (ticker != nav_symbol OR nav_symbol IS NULL OR nav_symbol = '')
    AND (category IS NULL OR category != 'CCETF');

-- FIX: Set any CEFs with wrong category to 'CEF'
UPDATE etf_static
SET category = 'CEF'
WHERE 
    nav IS NOT NULL 
    AND nav != 0 
    AND nav_symbol IS NOT NULL 
    AND nav_symbol != ''
    AND ticker != nav_symbol
    AND (category IS NULL OR category != 'CEF');

-- FIX: Set any CC ETFs with wrong category to 'CCETF'
UPDATE etf_static
SET category = 'CCETF'
WHERE 
    NOT (nav IS NOT NULL AND nav != 0 AND nav_symbol IS NOT NULL AND nav_symbol != '')
    AND issuer IS NOT NULL 
    AND issuer != ''
    AND (ticker != nav_symbol OR nav_symbol IS NULL OR nav_symbol = '')
    AND (category IS NULL OR category != 'CCETF');

-- FINAL VERIFICATION: Show all records that don't match their category
SELECT 
    ticker,
    category,
    nav_symbol,
    nav,
    issuer,
    CASE 
        WHEN nav IS NOT NULL AND nav != 0 AND nav_symbol IS NOT NULL AND nav_symbol != '' THEN 'SHOULD BE CEF'
        WHEN issuer IS NOT NULL AND issuer != '' THEN 'SHOULD BE CCETF'
        ELSE 'UNKNOWN'
    END AS should_be
FROM etf_static
WHERE 
    (
        -- CEFs that are not category = 'CEF'
        (nav IS NOT NULL AND nav != 0 AND nav_symbol IS NOT NULL AND nav_symbol != '' AND ticker != nav_symbol AND (category IS NULL OR category != 'CEF'))
        OR
        -- CC ETFs that are not category = 'CCETF'
        (NOT (nav IS NOT NULL AND nav != 0 AND nav_symbol IS NOT NULL AND nav_symbol != '') 
         AND issuer IS NOT NULL AND issuer != '' 
         AND (ticker != nav_symbol OR nav_symbol IS NULL OR nav_symbol = '')
         AND (category IS NULL OR category != 'CCETF'))
    )
ORDER BY ticker;

