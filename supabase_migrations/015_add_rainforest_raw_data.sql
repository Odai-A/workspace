-- Migration: Add column to store COMPLETE Rainforest API response
-- This saves EVERYTHING from Rainforest API since you're paying for each scan
-- Store all data for future sale/analysis

-- Add rainforest_raw_data column to api_lookup_cache
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'api_lookup_cache' 
        AND column_name = 'rainforest_raw_data'
    ) THEN
        ALTER TABLE api_lookup_cache 
        ADD COLUMN rainforest_raw_data JSONB;
        
        COMMENT ON COLUMN api_lookup_cache.rainforest_raw_data IS 'COMPLETE Rainforest API response stored as JSONB. Includes EVERYTHING: request_info (credits, overage), request_parameters, request_metadata, product (all fields), brand_store, newer_model, similar_to_consider, etc. Stored for future data sales/analysis.';
        
        -- Create GIN index for efficient JSON queries
        CREATE INDEX IF NOT EXISTS idx_api_cache_rainforest_raw_data 
        ON api_lookup_cache USING GIN (rainforest_raw_data);
        
        RAISE NOTICE '✅ Added rainforest_raw_data column to api_lookup_cache';
    ELSE
        RAISE NOTICE '⚠️ Column rainforest_raw_data already exists';
    END IF;
END $$;

-- Verify the column was created
SELECT 
    column_name, 
    data_type,
    udt_name
FROM information_schema.columns 
WHERE table_name = 'api_lookup_cache' 
AND column_name = 'rainforest_raw_data';

-- Example queries to access the complete data:
-- 
-- Request info:
-- SELECT rainforest_raw_data->'request_info'->>'credits_used' FROM api_lookup_cache;
-- 
-- Product basic info:
-- SELECT rainforest_raw_data->'product'->>'title' FROM api_lookup_cache;
-- SELECT rainforest_raw_data->'product'->>'model_number' FROM api_lookup_cache;
-- SELECT rainforest_raw_data->'product'->>'weight' FROM api_lookup_cache;
-- SELECT rainforest_raw_data->'product'->>'color' FROM api_lookup_cache;
-- SELECT rainforest_raw_data->'product'->>'manufacturer' FROM api_lookup_cache;
-- 
-- Images:
-- SELECT jsonb_array_length(rainforest_raw_data->'product'->'images') FROM api_lookup_cache;
-- SELECT jsonb_array_elements_text(rainforest_raw_data->'product'->'images'->'link') FROM api_lookup_cache;
-- 
-- VIDEOS (NO API CALL NEEDED - Already saved!):
-- Get all videos for a product:
-- SELECT rainforest_raw_data->'product'->'videos_additional' FROM api_lookup_cache WHERE asin = 'B0DCYY83CH';
-- 
-- Get video count:
-- SELECT jsonb_array_length(rainforest_raw_data->'product'->'videos_additional') as video_count FROM api_lookup_cache;
-- 
-- Get individual video details:
-- SELECT 
--   video->>'title' as title,
--   video->>'duration' as duration,
--   video->>'video_url' as video_url,
--   video->>'video_image_url' as thumbnail
-- FROM api_lookup_cache,
--   jsonb_array_elements(rainforest_raw_data->'product'->'videos_additional') as video
-- WHERE asin = 'B0DCYY83CH';
-- 
-- Get all products with videos:
-- SELECT 
--   fnsku, asin, product_name,
--   jsonb_array_length(rainforest_raw_data->'product'->'videos_additional') as video_count
-- FROM api_lookup_cache
-- WHERE rainforest_raw_data->'product'->'videos_additional' IS NOT NULL;
