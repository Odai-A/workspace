-- Migration: Add tenant_id column to products table
-- This enables multi-tenancy support for the products table

-- Add tenant_id column to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS tenant_id UUID,
ADD CONSTRAINT fk_products_tenant
    FOREIGN KEY(tenant_id)
    REFERENCES tenants(id)
    ON DELETE CASCADE;

-- Create index for faster tenant-based queries
CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id) WHERE tenant_id IS NOT NULL;

-- Update RLS policies to include tenant_id filtering
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "products_select_policy" ON products;

-- Create new RLS policy that filters by tenant_id
CREATE POLICY "products_select_policy" ON products
    FOR SELECT
    TO authenticated
    USING (
        tenant_id IS NULL OR  -- Allow access to products without tenant (legacy data)
        tenant_id IN (
            SELECT tenant_id FROM auth.users 
            WHERE id = auth.uid() 
            AND (raw_app_meta_data->>'tenant_id')::uuid = products.tenant_id
        )
    );

-- Allow inserts with tenant_id
CREATE POLICY "products_insert_policy" ON products
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Allow updates for products in the same tenant
CREATE POLICY "products_update_policy" ON products
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id IS NULL OR
        tenant_id IN (
            SELECT tenant_id FROM auth.users 
            WHERE id = auth.uid() 
            AND (raw_app_meta_data->>'tenant_id')::uuid = products.tenant_id
        )
    );
