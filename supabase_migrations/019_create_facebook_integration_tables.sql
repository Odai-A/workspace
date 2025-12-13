-- Facebook Integration Tables for Multi-Tenant SaaS
-- Each customer can connect their own Facebook account and post to their own Business Page

-- Table: facebook_integrations
-- Stores per-customer Facebook OAuth connection data
CREATE TABLE IF NOT EXISTS facebook_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Facebook OAuth data
  facebook_user_id TEXT NOT NULL,
  user_access_token_encrypted TEXT NOT NULL, -- Encrypted user access token
  page_access_token_encrypted TEXT, -- Encrypted page access token (for selected page)
  selected_page_id TEXT, -- The Facebook Page ID the user selected
  
  -- Facebook Shop/Catalog
  catalog_id TEXT, -- Facebook Commerce Manager Catalog ID
  
  -- Token metadata
  token_expires_at TIMESTAMPTZ, -- When the access token expires
  refresh_token_encrypted TEXT, -- Encrypted refresh token if available
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one integration per user
  UNIQUE(user_id)
);

-- Table: facebook_pages
-- Stores list of Facebook Pages the user manages (for selection)
CREATE TABLE IF NOT EXISTS facebook_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES facebook_integrations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Facebook Page data
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_category TEXT,
  page_access_token_encrypted TEXT, -- Encrypted page access token
  
  -- Selection status
  is_selected BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one entry per page per integration
  UNIQUE(integration_id, page_id)
);

-- Table: facebook_catalog_products
-- Maps scanned products to Facebook Catalog products
CREATE TABLE IF NOT EXISTS facebook_catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES facebook_integrations(id) ON DELETE CASCADE,
  
  -- Product mapping
  product_id UUID, -- Reference to products table (if exists)
  api_cache_id UUID, -- Reference to api_lookup_cache table (if exists)
  manifest_data_id UUID, -- Reference to manifest_data table (if exists)
  
  -- Facebook Catalog data
  facebook_retailer_id TEXT NOT NULL, -- Our internal product identifier (ASIN, FNSKU, etc.)
  facebook_catalog_product_id TEXT, -- Facebook's catalog product ID (after creation)
  
  -- Product details (snapshot at time of catalog creation)
  product_name TEXT NOT NULL,
  product_description TEXT,
  product_price DECIMAL(10, 2),
  product_currency TEXT DEFAULT 'USD',
  product_image_url TEXT,
  product_availability TEXT DEFAULT 'in stock', -- 'in stock', 'out of stock', 'preorder'
  product_condition TEXT DEFAULT 'new', -- 'new', 'refurbished', 'used'
  product_link TEXT, -- Optional link to product page
  
  -- Status
  is_published BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one catalog product per retailer_id per integration
  UNIQUE(integration_id, facebook_retailer_id)
);

-- Table: product_posts
-- Tracks Facebook Page posts created for products
CREATE TABLE IF NOT EXISTS product_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES facebook_integrations(id) ON DELETE CASCADE,
  catalog_product_id UUID REFERENCES facebook_catalog_products(id) ON DELETE SET NULL,
  
  -- Facebook Post data
  post_id TEXT NOT NULL, -- Facebook Post ID
  page_id TEXT NOT NULL, -- Facebook Page ID where post was created
  
  -- Product reference
  product_id UUID, -- Reference to products table
  api_cache_id UUID, -- Reference to api_lookup_cache table
  manifest_data_id UUID, -- Reference to manifest_data table
  
  -- Post content (snapshot)
  post_message TEXT,
  post_image_urls TEXT[], -- Array of image URLs
  
  -- Status
  is_published BOOLEAN DEFAULT true,
  post_url TEXT, -- Link to the Facebook post
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one post per catalog product per page (can be updated)
  UNIQUE(integration_id, catalog_product_id, page_id)
);

-- Enable RLS on all tables
ALTER TABLE facebook_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for facebook_integrations
-- Users can only see their own integrations
CREATE POLICY "Users can view own facebook integrations" ON facebook_integrations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own integrations
CREATE POLICY "Users can insert own facebook integrations" ON facebook_integrations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own integrations
CREATE POLICY "Users can update own facebook integrations" ON facebook_integrations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own integrations
CREATE POLICY "Users can delete own facebook integrations" ON facebook_integrations
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for facebook_pages
-- Users can only see pages for their own integrations
CREATE POLICY "Users can view own facebook pages" ON facebook_pages
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert pages for their own integrations
CREATE POLICY "Users can insert own facebook pages" ON facebook_pages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own pages
CREATE POLICY "Users can update own facebook pages" ON facebook_pages
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own pages
CREATE POLICY "Users can delete own facebook pages" ON facebook_pages
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for facebook_catalog_products
-- Users can only see catalog products for their own integrations
CREATE POLICY "Users can view own facebook catalog products" ON facebook_catalog_products
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert catalog products for their own integrations
CREATE POLICY "Users can insert own facebook catalog products" ON facebook_catalog_products
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own catalog products
CREATE POLICY "Users can update own facebook catalog products" ON facebook_catalog_products
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own catalog products
CREATE POLICY "Users can delete own facebook catalog products" ON facebook_catalog_products
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for product_posts
-- Users can only see posts for their own integrations
CREATE POLICY "Users can view own product posts" ON product_posts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert posts for their own integrations
CREATE POLICY "Users can insert own product posts" ON product_posts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own posts
CREATE POLICY "Users can update own product posts" ON product_posts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own posts
CREATE POLICY "Users can delete own product posts" ON product_posts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_facebook_integrations_user_id ON facebook_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_facebook_integrations_tenant_id ON facebook_integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_facebook_pages_integration_id ON facebook_pages(integration_id);
CREATE INDEX IF NOT EXISTS idx_facebook_pages_user_id ON facebook_pages(user_id);
CREATE INDEX IF NOT EXISTS idx_facebook_catalog_products_integration_id ON facebook_catalog_products(integration_id);
CREATE INDEX IF NOT EXISTS idx_facebook_catalog_products_user_id ON facebook_catalog_products(user_id);
CREATE INDEX IF NOT EXISTS idx_facebook_catalog_products_retailer_id ON facebook_catalog_products(facebook_retailer_id);
CREATE INDEX IF NOT EXISTS idx_product_posts_integration_id ON product_posts(integration_id);
CREATE INDEX IF NOT EXISTS idx_product_posts_user_id ON product_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_product_posts_catalog_product_id ON product_posts(catalog_product_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_facebook_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to update updated_at
CREATE TRIGGER update_facebook_integrations_updated_at
  BEFORE UPDATE ON facebook_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_facebook_updated_at();

CREATE TRIGGER update_facebook_pages_updated_at
  BEFORE UPDATE ON facebook_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_facebook_updated_at();

CREATE TRIGGER update_facebook_catalog_products_updated_at
  BEFORE UPDATE ON facebook_catalog_products
  FOR EACH ROW
  EXECUTE FUNCTION update_facebook_updated_at();

CREATE TRIGGER update_product_posts_updated_at
  BEFORE UPDATE ON product_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_facebook_updated_at();

