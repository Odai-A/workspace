-- Quick setup for API cache table
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
  asin_found BOOLEAN DEFAULT false,
  original_lookup_code TEXT,
  external_lookup_date TIMESTAMPTZ DEFAULT NOW(),
  lookup_count INTEGER DEFAULT 1,
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_api_cache_fnsku ON api_lookup_cache(fnsku);

-- Enable RLS with permissive policy
ALTER TABLE api_lookup_cache ENABLE ROW LEVEL SECURITY;

-- Allow all operations (no permission issues)
CREATE POLICY IF NOT EXISTS "Allow all operations on api_lookup_cache" 
ON api_lookup_cache FOR ALL 
TO authenticated, anon
USING (true)
WITH CHECK (true); 