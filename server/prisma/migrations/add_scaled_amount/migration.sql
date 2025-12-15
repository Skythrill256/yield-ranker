-- Add scaled_amount column to dividends_detail table
-- Scaled dividend: divCash × (adjClose/close)
-- This scales dividends to match the adjusted price series scale

ALTER TABLE public.dividends_detail
ADD COLUMN IF NOT EXISTS scaled_amount DECIMAL(12, 6);

COMMENT ON COLUMN public.dividends_detail.scaled_amount IS 'Scaled dividend: divCash × (adjClose/close). Scales dividends to match adjusted price series scale for accurate total return calculations.';





