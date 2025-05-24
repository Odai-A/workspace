-- Create a dedicated table for external API lookup cache
-- This table stores results from fnskutoasin.com API to avoid future charges

CREATE TABLE IF NOT EXISTS api_lookup_cache (
  id BIGSERIAL PRIMARY KEY,
  
  -- Core identifiers
  fnsku TEXT NOT NULL UNIQUE, -- FNSKU from the lookup
  asin TEXT, -- ASIN returned from API (might be null)
  
  -- Product information
  product_name TEXT,
  description TEXT,
  price DECIMAL(10,2) DEFAULT 0,
  category TEXT DEFAULT 'External API',
  upc TEXT,
  
  -- API metadata
  source TEXT DEFAULT 'fnskutoasin.com',
  scan_task_id TEXT, -- From the external API response
  task_state TEXT, -- From the external API response
  asin_found BOOLEAN DEFAULT false,
  
  -- Lookup tracking
  original_lookup_code TEXT, -- The code that was originally scanned
  external_lookup_date TIMESTAMPTZ DEFAULT NOW(),
  lookup_count INTEGER DEFAULT 1, -- How many times this has been looked up
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  
  -- Standard timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_api_cache_fnsku ON api_lookup_cache(fnsku);
CREATE INDEX IF NOT EXISTS idx_api_cache_asin ON api_lookup_cache(asin);
CREATE INDEX IF NOT EXISTS idx_api_cache_lookup_code ON api_lookup_cache(original_lookup_code);
CREATE INDEX IF NOT EXISTS idx_api_cache_created_at ON api_lookup_cache(created_at);

-- Enable Row Level Security (but with permissive policies)
ALTER TABLE api_lookup_cache ENABLE ROW LEVEL SECURITY;

-- Create policies that allow all operations for now (you can restrict later)
CREATE POLICY "Allow all operations on api_lookup_cache" 
ON api_lookup_cache FOR ALL 
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- Create a function to update the updated_at timestamp
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
CREATE TRIGGER update_api_cache_updated_at_trigger
  BEFORE UPDATE ON api_lookup_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_api_cache_updated_at();

-- Add some helpful comments
COMMENT ON TABLE api_lookup_cache IS 'Cache table for external API lookups to avoid repeated charges';
COMMENT ON COLUMN api_lookup_cache.fnsku IS 'Amazon FNSKU - primary lookup key';
COMMENT ON COLUMN api_lookup_cache.asin IS 'Amazon ASIN returned from API (may be null)';
COMMENT ON COLUMN api_lookup_cache.scan_task_id IS 'External API scan task ID for reference';
COMMENT ON COLUMN api_lookup_cache.lookup_count IS 'Number of times this item has been looked up (for analytics)';
COMMENT ON COLUMN api_lookup_cache.asin_found IS 'Whether the API found an ASIN for this FNSKU'; 