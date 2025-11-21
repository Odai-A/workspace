-- View your cached API lookup data in Supabase
-- Run this in Supabase SQL Editor to see all cached items

-- View all cached entries
SELECT 
  id,
  fnsku,
  asin,
  product_name,
  description,
  price,
  category,
  image_url,
  source,
  asin_found,
  lookup_count,
  created_at,
  updated_at,
  last_accessed
FROM api_lookup_cache
ORDER BY created_at DESC;

-- Count total cached entries
SELECT COUNT(*) as total_cached_items FROM api_lookup_cache;

-- View entries with images
SELECT 
  fnsku,
  asin,
  product_name,
  image_url,
  source,
  lookup_count
FROM api_lookup_cache
WHERE image_url IS NOT NULL AND image_url != ''
ORDER BY lookup_count DESC;

-- View most frequently looked up items
SELECT 
  fnsku,
  asin,
  product_name,
  lookup_count,
  last_accessed
FROM api_lookup_cache
ORDER BY lookup_count DESC
LIMIT 10;

