-- supabase_migrations/002_add_tenant_id_to_manifest_data.sql
ALTER TABLE manifest_data
ADD COLUMN tenant_id UUID,
ADD CONSTRAINT fk_manifest_data_tenant
    FOREIGN KEY(tenant_id)
    REFERENCES tenants(id)
    ON DELETE CASCADE; -- Or ON DELETE SET NULL, depending on desired behavior

-- Make "X-Z ASIN" unique *within* a tenant in manifest_data
-- First, drop the existing unique constraint if it exists globally on "X-Z ASIN" in manifest_data
-- You might need to check the exact constraint name in Supabase for manifest_data."X-Z ASIN"
-- ALTER TABLE manifest_data DROP CONSTRAINT IF EXISTS manifest_data_xz_asin_key; 

-- Then, add a unique constraint for the combination of "X-Z ASIN" and tenant_id in manifest_data
ALTER TABLE manifest_data
ADD CONSTRAINT unique_xz_asin_per_tenant_manifest_data UNIQUE ("X-Z ASIN", tenant_id);

-- Add tenant_id to any other relevant tables like scan_history
-- WAITING FOR USER TO CONFIRM ACTUAL TABLE NAME FOR SCAN HISTORY
-- The following lines assume the scan history table is still named 'scan_history'
-- If it's different, these lines will need to be adjusted.
ALTER TABLE scan_history
ADD COLUMN tenant_id UUID,
ADD CONSTRAINT fk_scan_history_tenant
    FOREIGN KEY(tenant_id)
    REFERENCES tenants(id)
    ON DELETE CASCADE; -- Or ON DELETE SET NULL 