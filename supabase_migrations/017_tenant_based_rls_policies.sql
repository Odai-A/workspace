-- Update RLS policies to support tenant-based access (shared business account)
-- Users in the same tenant can see shared inventory, scans, and manifest data

-- Helper function to get tenant_id from current user's app_metadata
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
DECLARE
  user_tenant_id UUID;
BEGIN
  -- Get tenant_id from JWT app_metadata
  user_tenant_id := (auth.jwt() ->> 'app_metadata')::jsonb->>'tenant_id';
  
  -- If not in app_metadata, try to get from auth.users
  IF user_tenant_id IS NULL THEN
    SELECT (raw_app_meta_data->>'tenant_id')::UUID INTO user_tenant_id
    FROM auth.users
    WHERE id = auth.uid();
  END IF;
  
  RETURN user_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- SCAN_HISTORY TABLE - Tenant-based access
-- ============================================

-- Drop existing user-only policies
DROP POLICY IF EXISTS "Users can view their own scan_history" ON scan_history;
DROP POLICY IF EXISTS "Users can view tenant scan_history" ON scan_history;

-- Policy: Users can view scans from their tenant (shared business account)
CREATE POLICY "Users can view tenant scan_history" ON scan_history
FOR SELECT
USING (
  -- Allow if user_id matches (backward compatibility)
  auth.uid() = user_id
  OR
  -- Allow if tenant_id matches (shared tenant access)
  (tenant_id IS NOT NULL AND tenant_id = get_user_tenant_id())
);

-- Keep existing insert/update/delete policies (users can only modify their own scans)
-- These remain user-specific for data integrity

-- ============================================
-- INVENTORY TABLE - Tenant-based access
-- ============================================

-- Drop existing user-only policies
DROP POLICY IF EXISTS "Users can view their own inventory" ON inventory;
DROP POLICY IF EXISTS "Users can view tenant inventory" ON inventory;

-- Add tenant_id column to inventory if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE inventory
    ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    
    CREATE INDEX IF NOT EXISTS idx_inventory_tenant_id ON inventory(tenant_id);
  END IF;
END $$;

-- Policy: Users can view inventory from their tenant (shared business account)
CREATE POLICY "Users can view tenant inventory" ON inventory
FOR SELECT
USING (
  -- Allow if user_id matches (backward compatibility)
  auth.uid() = user_id
  OR
  -- Allow if tenant_id matches (shared tenant access)
  (tenant_id IS NOT NULL AND tenant_id = get_user_tenant_id())
);

-- Policy: Users can insert inventory for their tenant
CREATE POLICY "Users can insert tenant inventory" ON inventory
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    tenant_id IS NULL 
    OR tenant_id = get_user_tenant_id()
  )
);

-- Policy: Users can update inventory for their tenant
CREATE POLICY "Users can update tenant inventory" ON inventory
FOR UPDATE
USING (
  auth.uid() = user_id
  AND (
    tenant_id IS NULL 
    OR tenant_id = get_user_tenant_id()
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND (
    tenant_id IS NULL 
    OR tenant_id = get_user_tenant_id()
  )
);

-- Policy: Users can delete inventory for their tenant
CREATE POLICY "Users can delete tenant inventory" ON inventory
FOR DELETE
USING (
  auth.uid() = user_id
  AND (
    tenant_id IS NULL 
    OR tenant_id = get_user_tenant_id()
  )
);

-- ============================================
-- MANIFEST_DATA TABLE - Tenant-based access
-- ============================================

-- Drop existing user-only policies
DROP POLICY IF EXISTS "Users can view their own manifest_data" ON manifest_data;
DROP POLICY IF EXISTS "Users can view tenant manifest_data" ON manifest_data;

-- Policy: Users can view manifest_data from their tenant (shared business account)
CREATE POLICY "Users can view tenant manifest_data" ON manifest_data
FOR SELECT
USING (
  -- Allow if user_id matches (backward compatibility)
  auth.uid() = user_id
  OR
  -- Allow if tenant_id matches (shared tenant access)
  (tenant_id IS NOT NULL AND tenant_id = get_user_tenant_id())
);

-- Keep existing insert/update/delete policies (users can only modify their own data)
-- These remain user-specific for data integrity

-- ============================================
-- UPDATE EXISTING DATA
-- ============================================

-- Update existing inventory records to set tenant_id based on user's tenant_id
-- This ensures existing data is accessible to the tenant
DO $$
DECLARE
  inv_record RECORD;
  user_tenant_id UUID;
BEGIN
  FOR inv_record IN SELECT id, user_id FROM inventory WHERE tenant_id IS NULL LOOP
    -- Get tenant_id from user's app_metadata
    SELECT (raw_app_meta_data->>'tenant_id')::UUID INTO user_tenant_id
    FROM auth.users
    WHERE id = inv_record.user_id;
    
    -- Update inventory with tenant_id
    IF user_tenant_id IS NOT NULL THEN
      UPDATE inventory
      SET tenant_id = user_tenant_id
      WHERE id = inv_record.id;
    END IF;
  END LOOP;
END $$;

COMMENT ON FUNCTION get_user_tenant_id() IS 'Helper function to get tenant_id from current user JWT or auth.users table';

