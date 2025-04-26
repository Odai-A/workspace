-- Create inventory table for tracking inventory items
CREATE TABLE IF NOT EXISTS inventory (
  id BIGSERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES product_lookups(id),
  sku TEXT,
  fnsku TEXT,
  asin TEXT,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  location TEXT,
  price DECIMAL(10, 2),
  cost DECIMAL(10, 2),
  condition TEXT,
  status TEXT DEFAULT 'Active',
  notes TEXT,
  last_updated_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS inventory_sku_idx ON inventory (sku);
CREATE INDEX IF NOT EXISTS inventory_fnsku_idx ON inventory (fnsku);
CREATE INDEX IF NOT EXISTS inventory_asin_idx ON inventory (asin);
CREATE INDEX IF NOT EXISTS inventory_location_idx ON inventory (location);
CREATE INDEX IF NOT EXISTS inventory_status_idx ON inventory (status);

-- Create a trigger to automatically update the updated_at timestamp
CREATE TRIGGER update_inventory_timestamp
BEFORE UPDATE ON inventory
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

-- Add RLS policy (Row Level Security)
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Allow full access to authenticated users" 
ON inventory 
FOR ALL 
TO authenticated 
USING (true); 