-- Add dividend_history column to etf_static table
-- Run this in your Supabase SQL Editor

-- First, check if the table exists
-- If you get an error, the table might be in a different schema or have a different name
-- Try: SELECT * FROM information_schema.tables WHERE table_name = 'etf_static';

-- Add the dividend_history column if it doesn't exist
ALTER TABLE public.etf_static 
ADD COLUMN IF NOT EXISTS dividend_history VARCHAR(50);

-- Verify the column was added
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'etf_static' 
  AND column_name = 'dividend_history';

