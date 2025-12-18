-- Add CEF-specific columns to etf_static table
ALTER TABLE etf_static ADD COLUMN IF NOT EXISTS nav_symbol VARCHAR(20);
ALTER TABLE etf_static ADD COLUMN IF NOT EXISTS open_date TEXT;
ALTER TABLE etf_static ADD COLUMN IF NOT EXISTS nav DECIMAL(12, 4);
ALTER TABLE etf_static ADD COLUMN IF NOT EXISTS premium_discount DECIMAL(12, 6);
ALTER TABLE etf_static ADD COLUMN IF NOT EXISTS five_year_z_score DECIMAL(12, 6);
ALTER TABLE etf_static ADD COLUMN IF NOT EXISTS nav_trend_6m DECIMAL(12, 6);
ALTER TABLE etf_static ADD COLUMN IF NOT EXISTS nav_trend_12m DECIMAL(12, 6);
ALTER TABLE etf_static ADD COLUMN IF NOT EXISTS value_health_score DECIMAL(12, 6);

-- Create index on nav_symbol for faster CEF filtering
CREATE INDEX IF NOT EXISTS idx_etf_static_nav_symbol ON etf_static(nav_symbol) WHERE nav_symbol IS NOT NULL;

