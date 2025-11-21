-- QUICK FIX: Add missing image_url column to api_lookup_cache
-- Run this in Supabase SQL Editor

-- Add image_url column if it doesn't exist
ALTER TABLE api_lookup_cache 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'api_lookup_cache' 
AND column_name = 'image_url';

-- If the above returns a row, the column exists and you're good to go!

