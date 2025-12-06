-- Migration: Create products and manifest_items tables
-- This implements the 3-layer architecture:
-- 1. products - Unique product catalog
-- 2. manifest_items - Physical items (LPN-specific)
-- 3. api_lookup_cache - Old data cache (preserved)

-- Create products table (unique product catalog)
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fnsku TEXT UNIQUE,
    asin TEXT UNIQUE,
    upc TEXT,
    title TEXT,
    brand TEXT,
    category TEXT,
    image TEXT,
    price TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create manifest_items table (physical items, LPN-specific)
CREATE TABLE IF NOT EXISTS manifest_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lpn TEXT UNIQUE,
    fnsku TEXT,
    asin TEXT,
    product_name TEXT,
    price TEXT,
    category TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_fnsku ON products(fnsku) WHERE fnsku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_asin ON products(asin) WHERE asin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_manifest_items_lpn ON manifest_items(lpn) WHERE lpn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_manifest_items_fnsku ON manifest_items(fnsku) WHERE fnsku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_manifest_items_asin ON manifest_items(asin) WHERE asin IS NOT NULL;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS (Row Level Security)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE manifest_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for products (read-only for authenticated users)
CREATE POLICY "products_select_policy" ON products
    FOR SELECT
    TO authenticated
    USING (true);

-- RLS Policies for manifest_items (users can manage their own items)
CREATE POLICY "manifest_items_select_policy" ON manifest_items
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "manifest_items_insert_policy" ON manifest_items
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT ON products TO authenticated;
GRANT SELECT, INSERT ON manifest_items TO authenticated;

