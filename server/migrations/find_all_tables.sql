-- Find all tables in the public schema to see what exists
-- Run this in your Supabase SQL Editor

SELECT 
    table_schema,
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

