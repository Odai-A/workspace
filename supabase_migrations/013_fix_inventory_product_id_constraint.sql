-- Fix inventory product_id foreign key constraint issue
-- The constraint may be pointing to a non-existent table or the product_id should be nullable

-- First, check if the constraint exists and what it references
-- If product_id should reference manifest_data instead of product_lookups, we'll fix it

-- Make product_id nullable if it isn't already (allows inventory items without product_id)
DO $$ 
BEGIN
  -- Check if product_id column exists and is NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory' 
    AND column_name = 'product_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE inventory
    ALTER COLUMN product_id DROP NOT NULL;
    
    RAISE NOTICE 'Made product_id nullable in inventory table';
  END IF;
END $$;

-- Drop the existing foreign key constraint if it references a wrong table
DO $$
BEGIN
  -- Check if constraint exists and references product_lookups (which may not exist)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu 
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'inventory'
    AND tc.constraint_name = 'inventory_product_id_fkey'
    AND ccu.table_name = 'product_lookups'
  ) THEN
    ALTER TABLE inventory
    DROP CONSTRAINT IF EXISTS inventory_product_id_fkey;
    
    RAISE NOTICE 'Dropped incorrect foreign key constraint inventory_product_id_fkey';
  END IF;
END $$;

-- If manifest_data table exists, create a foreign key to it instead
-- This is optional - product_id can remain without a foreign key constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'manifest_data'
  ) THEN
    -- Only create the constraint if it doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_name = 'inventory'
      AND constraint_name = 'inventory_product_id_manifest_data_fkey'
    ) THEN
      ALTER TABLE inventory
      ADD CONSTRAINT inventory_product_id_manifest_data_fkey
      FOREIGN KEY (product_id)
      REFERENCES manifest_data(id)
      ON DELETE SET NULL; -- Set to NULL if manifest_data item is deleted
      
      RAISE NOTICE 'Created foreign key constraint from inventory.product_id to manifest_data.id';
    END IF;
  ELSE
    RAISE NOTICE 'manifest_data table does not exist, skipping foreign key creation';
  END IF;
END $$;

-- Add a comment explaining that product_id is optional
COMMENT ON COLUMN inventory.product_id IS 'Optional reference to manifest_data.id. Can be NULL if product is not in manifest_data.';



