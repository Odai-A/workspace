-- Add image_url column to api_lookup_cache table
-- This allows storing product images from API responses to avoid re-fetching

-- Add image_url column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'api_lookup_cache' 
        AND column_name = 'image_url'
    ) THEN
        ALTER TABLE api_lookup_cache 
        ADD COLUMN image_url TEXT;
        
        COMMENT ON COLUMN api_lookup_cache.image_url IS 'Product image URL from external API';
    END IF;
END $$;

