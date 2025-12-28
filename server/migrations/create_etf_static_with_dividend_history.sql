-- Create etf_static table with all required fields including dividend_history
-- Run this in your Supabase SQL Editor
-- This is a complete table creation script if the table doesn't exist

-- ============================================================================
-- Create etf_static table (if it doesn't exist)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.etf_static (
    ticker VARCHAR(20) PRIMARY KEY,
    issuer VARCHAR(255),
    description TEXT,
    pay_day_text VARCHAR(100),
    payments_per_year INTEGER,
    ipo_price DECIMAL(12, 4),
    default_rank_weights JSONB DEFAULT '{}',
    
    -- Live price fields (from Tiingo EOD)
    price DECIMAL(12, 4),
    price_change DECIMAL(12, 4),
    price_change_pct DECIMAL(12, 4),
    
    -- Dividend + frequency fields
    last_dividend DECIMAL(12, 6),
    annual_dividend DECIMAL(12, 6),
    forward_yield DECIMAL(12, 6),
    
    -- Volatility metrics
    dividend_sd DECIMAL(12, 6),
    dividend_cv DECIMAL(12, 6),
    dividend_cv_percent DECIMAL(12, 4),
    dividend_volatility_index VARCHAR(20),
    
    -- Ranking
    weighted_rank DECIMAL(12, 4),
    
    -- Total Return WITH DRIP
    tr_drip_3y DECIMAL(12, 6),
    tr_drip_12m DECIMAL(12, 6),
    tr_drip_6m DECIMAL(12, 6),
    tr_drip_3m DECIMAL(12, 6),
    tr_drip_1m DECIMAL(12, 6),
    tr_drip_1w DECIMAL(12, 6),
    
    -- Price Return (non-DRIP)
    price_return_3y DECIMAL(12, 6),
    price_return_12m DECIMAL(12, 6),
    price_return_6m DECIMAL(12, 6),
    price_return_3m DECIMAL(12, 6),
    price_return_1m DECIMAL(12, 6),
    price_return_1w DECIMAL(12, 6),
    
    -- Total Return WITHOUT DRIP
    tr_nodrip_3y DECIMAL(12, 6),
    tr_nodrip_12m DECIMAL(12, 6),
    tr_nodrip_6m DECIMAL(12, 6),
    tr_nodrip_3m DECIMAL(12, 6),
    tr_nodrip_1m DECIMAL(12, 6),
    tr_nodrip_1w DECIMAL(12, 6),
    
    -- 52-week range
    week_52_high DECIMAL(12, 4),
    week_52_low DECIMAL(12, 4),
    
    -- CEF-specific fields
    nav_symbol VARCHAR(50),
    nav DECIMAL(12, 4),
    premium_discount DECIMAL(12, 6),
    five_year_z_score DECIMAL(12, 6),
    nav_trend_6m DECIMAL(12, 6),
    nav_trend_12m DECIMAL(12, 6),
    signal INTEGER,
    return_3yr DECIMAL(12, 6),
    return_5yr DECIMAL(12, 6),
    return_10yr DECIMAL(12, 6),
    return_15yr DECIMAL(12, 6),
    value_health_score DECIMAL(12, 6),
    open_date TEXT,
    dividend_history VARCHAR(50),  -- Dividend history format: "X+ Y-"
    
    -- Metadata
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    data_source VARCHAR(50) DEFAULT 'Tiingo',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_etf_static_issuer ON public.etf_static(issuer);
CREATE INDEX IF NOT EXISTS idx_etf_static_weighted_rank ON public.etf_static(weighted_rank);
CREATE INDEX IF NOT EXISTS idx_etf_static_forward_yield ON public.etf_static(forward_yield);
CREATE INDEX IF NOT EXISTS idx_etf_static_last_updated ON public.etf_static(last_updated);
CREATE INDEX IF NOT EXISTS idx_etf_static_tr_drip_12m ON public.etf_static(tr_drip_12m);
CREATE INDEX IF NOT EXISTS idx_etf_static_dividend_cv ON public.etf_static(dividend_cv_percent);
CREATE INDEX IF NOT EXISTS idx_etf_static_nav_symbol ON public.etf_static(nav_symbol);

-- Verify table was created
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'etf_static')
        THEN '✓ Table etf_static created successfully'
        ELSE '✗ Table etf_static was NOT created'
    END as table_status;

-- Verify dividend_history column exists
SELECT 
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'etf_static' 
  AND column_name = 'dividend_history';

