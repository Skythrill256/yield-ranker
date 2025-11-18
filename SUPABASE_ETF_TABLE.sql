CREATE TABLE IF NOT EXISTS etfs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT UNIQUE NOT NULL,
  issuer TEXT,
  description TEXT,
  pay_day TEXT,
  ipo_price NUMERIC,
  price NUMERIC,
  price_change NUMERIC,
  dividend NUMERIC,
  payments_per_year INTEGER,
  annual_div NUMERIC,
  forward_yield NUMERIC,
  dividend_volatility_index NUMERIC,
  weighted_rank NUMERIC,
  three_year_annualized NUMERIC,
  total_return_12m NUMERIC,
  total_return_6m NUMERIC,
  total_return_3m NUMERIC,
  total_return_1m NUMERIC,
  total_return_1w NUMERIC,
  price_return_3y NUMERIC,
  price_return_12m NUMERIC,
  price_return_6m NUMERIC,
  price_return_3m NUMERIC,
  price_return_1m NUMERIC,
  price_return_1w NUMERIC,
  favorites BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_etfs_symbol ON etfs(symbol);
CREATE INDEX IF NOT EXISTS idx_etfs_weighted_rank ON etfs(weighted_rank);
CREATE INDEX IF NOT EXISTS idx_etfs_forward_yield ON etfs(forward_yield);

CREATE OR REPLACE FUNCTION update_etfs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_etfs_updated_at
  BEFORE UPDATE ON etfs
  FOR EACH ROW
  EXECUTE FUNCTION update_etfs_updated_at();

ALTER TABLE etfs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to etfs"
  ON etfs FOR SELECT
  USING (true);

CREATE POLICY "Allow authenticated users to insert/update etfs"
  ON etfs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update etfs"
  ON etfs FOR UPDATE
  USING (auth.role() = 'authenticated');

