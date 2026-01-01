-- Migration: Add category column to etf_static table
-- Run this in your Supabase SQL Editor
-- 
-- This adds a category column to properly separate CEF, CCETF, and future categories

-- ============================================================================
-- STEP 1: Add category column (if it doesn't exist)
-- ============================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'etf_static' 
        AND column_name = 'category'
    ) THEN
        ALTER TABLE public.etf_static 
        ADD COLUMN category VARCHAR(20);
        
        RAISE NOTICE 'Category column added successfully';
    ELSE
        RAISE NOTICE 'Category column already exists';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Backfill existing data based on nav_symbol
-- ============================================================================
-- Set category based on whether nav_symbol exists
-- CEFs have nav_symbol, CCETFs don't
UPDATE public.etf_static
SET category = CASE 
    WHEN nav_symbol IS NOT NULL AND nav_symbol != '' AND nav IS NOT NULL AND nav != 0 
    THEN 'CEF'
    WHEN nav_symbol IS NULL OR nav_symbol = '' OR nav IS NULL OR nav = 0
    THEN 'CCETF'
    ELSE NULL
END
WHERE category IS NULL;

-- ============================================================================
-- STEP 3: Create index for fast filtering
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_etf_static_category 
ON public.etf_static(category);

-- ============================================================================
-- STEP 4: Verify the changes
-- ============================================================================
SELECT 
    'Category column added' as status,
    COUNT(*) FILTER (WHERE category = 'CEF') as cef_count,
    COUNT(*) FILTER (WHERE category = 'CCETF') as ccetf_count,
    COUNT(*) FILTER (WHERE category IS NULL) as null_count
FROM public.etf_static;







