-- Add category column with default value 'etf' for existing records
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'etf';

-- Update any NULL categories to 'etf' (shouldn't be needed but safety check)
UPDATE favorites SET category = 'etf' WHERE category IS NULL;

-- Create index on category for faster queries
CREATE INDEX IF NOT EXISTS idx_favorites_category ON favorites(category);

-- Drop the old primary key constraint
ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_pkey;

-- Add new primary key that includes category
ALTER TABLE favorites ADD PRIMARY KEY (user_id, symbol, category);
