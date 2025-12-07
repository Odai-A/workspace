-- Add tenant_id to products table for multi-tenancy support
-- This ensures products are tenant-isolated like other tables

-- Add tenant_id column to products if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE products
    ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    
    CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id);
    
    -- Make fnsku and asin unique per tenant instead of globally unique
    -- First drop existing unique constraints if they exist
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_fnsku_key;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_asin_key;
    
    -- Add composite unique constraints (fnsku + tenant_id, asin + tenant_id)
    CREATE UNIQUE INDEX IF NOT EXISTS unique_products_fnsku_tenant 
      ON products(fnsku, tenant_id) WHERE fnsku IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS unique_products_asin_tenant 
      ON products(asin, tenant_id) WHERE asin IS NOT NULL;
    
    RAISE NOTICE 'Added tenant_id column to products table';
  END IF;
END $$;

-- Update RLS policies for products to be tenant-based
DROP POLICY IF EXISTS "products_select_policy" ON products;
DROP POLICY IF EXISTS "products_insert_policy" ON products;
DROP POLICY IF EXISTS "products_update_policy" ON products;
DROP POLICY IF EXISTS "products_delete_policy" ON products;

-- Policy: Users can view products from their tenant
CREATE POLICY "products_select_policy" ON products
FOR SELECT
TO authenticated
USING (
  tenant_id IS NULL 
  OR tenant_id = (auth.jwt() ->> 'app_metadata')::jsonb->>'tenant_id'::UUID
  OR tenant_id IN (
    SELECT (raw_app_meta_data->>'tenant_id')::UUID
    FROM auth.users
    WHERE id = auth.uid()
  )
);

-- Policy: Users can insert products for their tenant
CREATE POLICY "products_insert_policy" ON products
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IS NULL 
  OR tenant_id = (auth.jwt() ->> 'app_metadata')::jsonb->>'tenant_id'::UUID
  OR tenant_id IN (
    SELECT (raw_app_meta_data->>'tenant_id')::UUID
    FROM auth.users
    WHERE id = auth.uid()
  )
);

-- Policy: Users can update products for their tenant
CREATE POLICY "products_update_policy" ON products
FOR UPDATE
TO authenticated
USING (
  tenant_id IS NULL 
  OR tenant_id = (auth.jwt() ->> 'app_metadata')::jsonb->>'tenant_id'::UUID
  OR tenant_id IN (
    SELECT (raw_app_meta_data->>'tenant_id')::UUID
    FROM auth.users
    WHERE id = auth.uid()
  )
)
WITH CHECK (
  tenant_id IS NULL 
  OR tenant_id = (auth.jwt() ->> 'app_metadata')::jsonb->>'tenant_id'::UUID
  OR tenant_id IN (
    SELECT (raw_app_meta_data->>'tenant_id')::UUID
    FROM auth.users
    WHERE id = auth.uid()
  )
);

-- Policy: Users can delete products for their tenant
CREATE POLICY "products_delete_policy" ON products
FOR DELETE
TO authenticated
USING (
  tenant_id IS NULL 
  OR tenant_id = (auth.jwt() ->> 'app_metadata')::jsonb->>'tenant_id'::UUID
  OR tenant_id IN (
    SELECT (raw_app_meta_data->>'tenant_id')::UUID
    FROM auth.users
    WHERE id = auth.uid()
  )
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO authenticated;

