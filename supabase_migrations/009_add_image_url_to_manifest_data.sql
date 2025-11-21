-- Add image_url column to manifest_data table
-- This allows storing product images from Rainforest API to avoid re-fetching

-- Add image_url column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'manifest_data' 
        AND column_name = 'image_url'
    ) THEN
        ALTER TABLE manifest_data 
        ADD COLUMN image_url TEXT;
        
        COMMENT ON COLUMN manifest_data.image_url IS 'Product image URL from Rainforest API or other sources';
        
        -- Create index for faster lookups
        CREATE INDEX IF NOT EXISTS idx_manifest_data_image_url ON manifest_data(image_url) WHERE image_url IS NOT NULL;
    END IF;
END $$;

