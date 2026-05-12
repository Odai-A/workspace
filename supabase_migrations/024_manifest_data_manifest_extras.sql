-- Optional JSON for truckload / manifest columns not mapped to core manifest_data fields
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'manifest_data'
          AND column_name = 'manifest_extras'
    ) THEN
        ALTER TABLE manifest_data
        ADD COLUMN manifest_extras JSONB DEFAULT '{}'::jsonb;

        COMMENT ON COLUMN manifest_data.manifest_extras IS
          'Additional CSV/truckload fields (Seller, Task ID, Listing ID, Pallet ID, Warehouse, EXT MSRP, etc.) preserved on import.';

        CREATE INDEX IF NOT EXISTS idx_manifest_data_manifest_extras
        ON manifest_data USING gin (manifest_extras)
        WHERE manifest_extras IS NOT NULL AND manifest_extras <> '{}'::jsonb;
    END IF;
END $$;
