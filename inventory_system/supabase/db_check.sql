-- Database connection check and table verification
-- Run this script in your Supabase SQL Editor

-- Check if product_lookups table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'product_lookups'
) AS product_lookups_table_exists;

-- Check if inventory table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'inventory'
) AS inventory_table_exists;

-- If tables don't exist, run the migration scripts in the SQL Editor
-- You can copy the contents of 001_create_product_lookups_table.sql and 002_create_inventory_table.sql

-- Insert a test product to verify writing works
INSERT INTO product_lookups (
  sku, 
  fnsku, 
  asin, 
  name, 
  price, 
  category, 
  description, 
  condition
) VALUES (
  'TEST001', 
  'X000TEST001', 
  'B0TEST001', 
  'Test Product', 
  19.99, 
  'Test Category', 
  'This is a test product', 
  'New'
) ON CONFLICT (sku) DO NOTHING;

-- Query for the test product to verify reading works
SELECT * FROM product_lookups WHERE sku = 'TEST001';

-- Get counts of both tables to see what's in the database
SELECT COUNT(*) AS product_count FROM product_lookups;
SELECT COUNT(*) AS inventory_count FROM inventory; 