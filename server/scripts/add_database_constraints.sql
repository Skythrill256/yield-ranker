-- ============================================================================
-- ADD DATABASE CONSTRAINTS TO PREVENT CEF/ETF MIXING
-- ============================================================================
-- This adds safeguards to prevent CEFs and CC ETFs from being mixed
-- Run this AFTER fixing the data with fix_database_separation.sql
-- ============================================================================

-- OPTION 1: Add a CHECK constraint to ensure category is valid
-- This prevents invalid categories from being inserted
ALTER TABLE etf_static
ADD CONSTRAINT check_category_valid 
CHECK (category IS NULL OR category IN ('CEF', 'CCETF'));

-- OPTION 2: Create a function to auto-correct category on insert/update
-- This automatically sets the correct category based on nav_symbol and nav data
CREATE OR REPLACE FUNCTION auto_set_category()
RETURNS TRIGGER AS $$
BEGIN
    -- If it has nav_symbol AND nav data, it's a CEF
    IF NEW.nav IS NOT NULL 
       AND NEW.nav != 0 
       AND NEW.nav_symbol IS NOT NULL 
       AND NEW.nav_symbol != ''
       AND NEW.ticker != NEW.nav_symbol THEN
        NEW.category := 'CEF';
    -- If it has issuer but NOT nav_symbol + nav data, it's a CCETF
    ELSIF NOT (NEW.nav IS NOT NULL AND NEW.nav != 0 AND NEW.nav_symbol IS NOT NULL AND NEW.nav_symbol != '')
          AND NEW.issuer IS NOT NULL 
          AND NEW.issuer != ''
          AND (NEW.ticker != NEW.nav_symbol OR NEW.nav_symbol IS NULL OR NEW.nav_symbol = '') THEN
        NEW.category := 'CCETF';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-set category before insert or update
DROP TRIGGER IF EXISTS trigger_auto_set_category ON etf_static;
CREATE TRIGGER trigger_auto_set_category
    BEFORE INSERT OR UPDATE ON etf_static
    FOR EACH ROW
    EXECUTE FUNCTION auto_set_category();

-- ============================================================================
-- NOTES:
-- ============================================================================
-- 1. The CHECK constraint ensures only valid categories can be inserted
-- 2. The trigger automatically sets the correct category based on the data
-- 3. This prevents CEFs and CC ETFs from being mixed in the future
-- 4. If you need to manually set a category, the trigger will override it
--    based on the actual data (nav_symbol + nav for CEFs, issuer for CCETFs)
-- ============================================================================

