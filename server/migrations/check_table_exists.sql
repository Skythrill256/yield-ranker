-- Check if etf_static table exists and show its structure
-- Run this in your Supabase SQL Editor to diagnose the issue

-- 1. Check if the table exists in the public schema
SELECT 
    table_schema,
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_name LIKE '%etf%' OR table_name LIKE '%static%'
ORDER BY table_schema, table_name;

-- 2. If etf_static exists, show all columns
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'etf_static'
ORDER BY ordinal_position;

-- 3. Check if dividend_history column exists
SELECT 
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'etf_static' 
  AND column_name = 'dividend_history';

