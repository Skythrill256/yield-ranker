-- Migration: Add is_manual column to dividends_detail table
-- This column provides reliable detection of manually uploaded dividends
-- to prevent them from being overwritten by API sync data

-- Step 1: Add the is_manual column with default FALSE
ALTER TABLE dividends_detail 
ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE;

-- Step 2: Update existing manual uploads to have is_manual = TRUE
-- This catches all legacy manual uploads that were only marked via description
UPDATE dividends_detail 
SET is_manual = TRUE 
WHERE (description LIKE '%Manual upload%' OR description LIKE '%Early announcement%')
  AND (is_manual IS NULL OR is_manual = FALSE);

-- Step 3: Create an index for faster lookups of manual uploads
CREATE INDEX IF NOT EXISTS idx_dividends_detail_is_manual 
ON dividends_detail (ticker, is_manual) 
WHERE is_manual = TRUE;

-- Verification query: Check how many manual uploads were marked
SELECT 
  COUNT(*) as total_manual_uploads,
  COUNT(DISTINCT ticker) as tickers_with_manual_uploads
FROM dividends_detail 
WHERE is_manual = TRUE;
