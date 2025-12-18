-- Test script to check if NAV symbols are in database
-- Run this to see which CEFs have nav_symbol set

SELECT 
  ticker,
  nav_symbol,
  nav,
  description,
  price as market_price,
  CASE 
    WHEN nav_symbol IS NOT NULL AND nav_symbol != '' THEN 'Has NAV Symbol'
    WHEN nav IS NOT NULL THEN 'Has NAV Value'
    ELSE 'Missing NAV Data'
  END as nav_status
FROM etf_static
WHERE nav_symbol IS NOT NULL 
   OR nav IS NOT NULL
ORDER BY ticker;

