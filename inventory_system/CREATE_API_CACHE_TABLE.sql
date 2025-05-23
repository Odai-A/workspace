-- Create the missing api_lookup_cache table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS api_lookup_cache (
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

-- Enable Row Level Security (RLS)
ALTER TABLE api_lookup_cache ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for authenticated users
CREATE POLICY IF NOT EXISTS "Users can read api_lookup_cache" ON api_lookup_cache
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "Users can insert api_lookup_cache" ON api_lookup_cache  
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "Users can update api_lookup_cache" ON api_lookup_cache
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON api_lookup_cache TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE api_lookup_cache_id_seq TO authenticated; 