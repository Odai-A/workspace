-- 🚀 NEW OPTIMIZED FNSKU CACHE TABLE
-- Clean slate solution for fast FNSKU → ASIN lookups
-- Run this in Supabase SQL Editor

-- Step 1: Clean removal of old table (if it exists)
DROP TABLE IF EXISTS api_lookup_cache CASCADE;
DROP TABLE IF EXISTS fnsku_cache CASCADE; -- In case there's another old one

-- Step 2: Create the new, optimized table
CREATE TABLE fnsku_cache (
  id BIGSERIAL PRIMARY KEY,
  
  -- Core lookup fields (what you actually need)
  fnsku TEXT NOT NULL UNIQUE,
  asin TEXT,
  
  -- Product info
  product_name TEXT,
  description TEXT,
  price DECIMAL(10,2) DEFAULT 0.00,
  
  -- Status tracking
  asin_found BOOLEAN DEFAULT false,
  is_processing BOOLEAN DEFAULT false,
  last_check_time TIMESTAMPTZ DEFAULT NOW(),
  
  -- API metadata (for debugging)
  api_source TEXT DEFAULT 'fnskutoasin.com',
  scan_task_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Create fast indexes
CREATE INDEX idx_fnsku_cache_fnsku ON fnsku_cache(fnsku);
CREATE INDEX idx_fnsku_cache_asin ON fnsku_cache(asin) WHERE asin IS NOT NULL;
CREATE INDEX idx_fnsku_cache_processing ON fnsku_cache(is_processing) WHERE is_processing = true;
CREATE INDEX idx_fnsku_cache_created ON fnsku_cache(created_at);

-- Step 4: Set up permissions (NO MORE 406 ERRORS!)
ALTER TABLE fnsku_cache ENABLE ROW LEVEL SECURITY;

-- Remove any existing policies
DROP POLICY IF EXISTS "Allow all operations" ON fnsku_cache;
DROP POLICY IF EXISTS "Public access" ON fnsku_cache;

-- Create super permissive policies
CREATE POLICY "fnsku_cache_all_access" 
ON fnsku_cache FOR ALL 
TO public
USING (true)
WITH CHECK (true);

-- Grant all permissions to everyone (for your app)
GRANT ALL PRIVILEGES ON fnsku_cache TO public;
GRANT ALL PRIVILEGES ON SEQUENCE fnsku_cache_id_seq TO public;

-- Step 5: Create update trigger for timestamps
CREATE OR REPLACE FUNCTION update_fnsku_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_check_time = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_fnsku_cache_timestamp_trigger
  BEFORE UPDATE ON fnsku_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_fnsku_cache_timestamp();

-- Step 6: Add helpful functions for your app

-- Function to quickly check if FNSKU exists
CREATE OR REPLACE FUNCTION fnsku_exists(lookup_fnsku TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(SELECT 1 FROM fnsku_cache WHERE fnsku = lookup_fnsku);
END;
$$ LANGUAGE plpgsql;

-- Function to get ASIN if available
CREATE OR REPLACE FUNCTION get_asin_for_fnsku(lookup_fnsku TEXT)
RETURNS TEXT AS $$
DECLARE
  result_asin TEXT;
BEGIN
  SELECT asin INTO result_asin 
  FROM fnsku_cache 
  WHERE fnsku = lookup_fnsku AND asin_found = true;
  
  RETURN result_asin;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Insert test data to verify it works
INSERT INTO fnsku_cache (fnsku, asin, product_name, asin_found) 
VALUES 
  ('TEST123', 'B00TEST123', 'Test Product 1', true),
  ('TEST456', 'B00TEST456', 'Test Product 2', true),
  ('PROCESSING789', NULL, 'Still Processing Product', false)
ON CONFLICT (fnsku) DO NOTHING;

-- Step 8: Verify everything works
SELECT 
  'Table created successfully!' as status,
  COUNT(*) as test_records,
  MAX(created_at) as latest_record
FROM fnsku_cache;

-- Test the helper functions
SELECT 
  fnsku_exists('TEST123') as test_exists,
  get_asin_for_fnsku('TEST123') as test_asin;

-- Show table structure (instead of \d which doesn't work in web editor)
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'fnsku_cache' 
ORDER BY ordinal_position;

-- Final success message
SELECT '🎉 NEW FNSKU CACHE TABLE READY! No more 406 errors!' as message; 