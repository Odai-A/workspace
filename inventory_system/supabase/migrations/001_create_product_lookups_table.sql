-- Create product_lookups table for storing product lookup data
CREATE TABLE IF NOT EXISTS product_lookups (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT UNIQUE,
  fnsku TEXT,
  asin TEXT,
  name TEXT NOT NULL,
  price DECIMAL(10, 2),
  category TEXT,
  description TEXT,
  image_url TEXT,
  condition TEXT,
  lookup_source TEXT,
  lookup_timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes to improve query performance
CREATE INDEX IF NOT EXISTS product_lookups_sku_idx ON product_lookups (sku);
CREATE INDEX IF NOT EXISTS product_lookups_fnsku_idx ON product_lookups (fnsku);
CREATE INDEX IF NOT EXISTS product_lookups_asin_idx ON product_lookups (asin);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW(); 
   RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Create a trigger to automatically update the updated_at timestamp
CREATE TRIGGER update_product_lookups_timestamp
BEFORE UPDATE ON product_lookups
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

-- Add RLS policy (Row Level Security)
ALTER TABLE product_lookups ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Allow full access to authenticated users" 
ON product_lookups 
FOR ALL 
TO authenticated 
USING (true); 