-- 🚀 QUICK API CACHE TABLE SETUP FOR SUPABASE
-- Run this in your Supabase SQL Editor to fix the 406 errors

-- Drop table if it exists (clean start)
DROP TABLE IF EXISTS api_lookup_cache CASCADE;

-- Create the API cache table
CREATE TABLE api_lookup_cache (
  id BIGSERIAL PRIMARY KEY,
  fnsku TEXT NOT NULL UNIQUE,
  asin TEXT,
  product_name TEXT,
  description TEXT,
  price DECIMAL(10,2) DEFAULT 0,
  category TEXT DEFAULT 'External API',
  upc TEXT,
  source TEXT DEFAULT 'fnskutoasin.com',
  scan_task_id TEXT,
  task_state TEXT,
  asin_found BOOLEAN DEFAULT false,
  original_lookup_code TEXT,
  external_lookup_date TIMESTAMPTZ DEFAULT NOW(),
  lookup_count INTEGER DEFAULT 1,
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX idx_api_cache_fnsku ON api_lookup_cache(fnsku);
CREATE INDEX idx_api_cache_asin ON api_lookup_cache(asin);
CREATE INDEX idx_api_cache_created_at ON api_lookup_cache(created_at);

-- Enable Row Level Security
ALTER TABLE api_lookup_cache ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all operations on api_lookup_cache" ON api_lookup_cache;
DROP POLICY IF EXISTS "Allow public access to api_lookup_cache" ON api_lookup_cache;

-- Create permissive policies to avoid 406 errors
CREATE POLICY "Allow all authenticated users" 
ON api_lookup_cache FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all anonymous users" 
ON api_lookup_cache FOR ALL 
TO anon
USING (true)
WITH CHECK (true);

-- Grant permissions to authenticated and anonymous users
GRANT ALL ON api_lookup_cache TO authenticated;
GRANT ALL ON api_lookup_cache TO anon;
GRANT USAGE ON SEQUENCE api_lookup_cache_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE api_lookup_cache_id_seq TO anon;

-- Create update trigger function
CREATE OR REPLACE FUNCTION update_api_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_accessed = NOW();
  IF NEW.lookup_count IS NULL THEN
    NEW.lookup_count = 1;
  ELSE
    NEW.lookup_count = NEW.lookup_count + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating timestamps
DROP TRIGGER IF EXISTS update_api_cache_updated_at_trigger ON api_lookup_cache;
CREATE TRIGGER update_api_cache_updated_at_trigger
  BEFORE UPDATE ON api_lookup_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_api_cache_updated_at();

-- Add helpful comments
COMMENT ON TABLE api_lookup_cache IS 'Cache table for external API lookups to avoid repeated charges';
COMMENT ON COLUMN api_lookup_cache.fnsku IS 'Amazon FNSKU - primary lookup key';
COMMENT ON COLUMN api_lookup_cache.asin IS 'Amazon ASIN returned from API (may be null)';
COMMENT ON COLUMN api_lookup_cache.asin_found IS 'Whether the API found an ASIN for this FNSKU';

-- Test the table by inserting a sample record
INSERT INTO api_lookup_cache (fnsku, asin, product_name, asin_found) 
VALUES ('TEST123', 'B00TEST123', 'Test Product', true)
ON CONFLICT (fnsku) DO NOTHING;

-- Verify the table works
SELECT COUNT(*) as record_count FROM api_lookup_cache; 