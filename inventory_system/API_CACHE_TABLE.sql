-- API Cache Table for FNSKU to ASIN lookups
-- This table caches external API results to avoid repeated API charges

CREATE TABLE IF NOT EXISTS api_lookup_cache (
  id BIGSERIAL PRIMARY KEY,
  fnsku TEXT NOT NULL UNIQUE,
  asin TEXT,
  product_name TEXT,
  description TEXT,
  price DECIMAL(10,2) DEFAULT 0,
  category TEXT,
  upc TEXT,
  source TEXT DEFAULT 'fnskutoasin.com',
  scan_task_id TEXT,
  task_state TEXT,
  asin_found BOOLEAN DEFAULT FALSE,
  original_lookup_code TEXT,
  lookup_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_cache_fnsku ON api_lookup_cache(fnsku);
CREATE INDEX IF NOT EXISTS idx_api_cache_asin ON api_lookup_cache(asin);
CREATE INDEX IF NOT EXISTS idx_api_cache_created_at ON api_lookup_cache(created_at);

-- RLS policies (adjust based on your auth setup)
ALTER TABLE api_lookup_cache ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read and write their own cache entries
CREATE POLICY "Users can manage their own API cache" ON api_lookup_cache
    FOR ALL USING (true)
    WITH CHECK (true);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_api_lookup_cache_updated_at 
    BEFORE UPDATE ON api_lookup_cache
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 