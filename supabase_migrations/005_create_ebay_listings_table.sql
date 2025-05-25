-- supabase_migrations/005_create_ebay_listings_table.sql

CREATE TABLE public.ebay_listings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    tenant_id UUID NOT NULL, -- Will be linked via RLS / app logic, FK to tenants if direct FK is desired later
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- User who initiated
    internal_sku TEXT NOT NULL,
    ebay_offer_id TEXT NOT NULL,
    ebay_listing_id TEXT, -- Can be populated later
    ebay_marketplace_id TEXT NOT NULL,
    ebay_listing_url TEXT,
    ebay_listing_status TEXT DEFAULT 'PUBLISHED' NOT NULL, -- e.g., PUBLISHED, UNPUBLISHED, ENDED, AWAITING_PAYMENT
    product_title TEXT,
    price NUMERIC(10, 2),
    currency VARCHAR(3),
    quantity INTEGER,
    listed_at TIMESTAMPTZ DEFAULT now(), -- When we listed it through our system
    ended_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    raw_ebay_offer_data JSONB, -- Store the raw offer creation response for reference
    raw_ebay_listing_data JSONB, -- Store raw data if fetched from GetItem or similar
    CONSTRAINT uq_ebay_listing_tenant_sku_marketplace UNIQUE (tenant_id, internal_sku, ebay_marketplace_id)
);

-- Enable RLS
ALTER TABLE public.ebay_listings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow users to manage listings associated with their tenant_id from app_metadata
CREATE POLICY "Tenant can manage their own ebay listings" 
ON public.ebay_listings
FOR ALL
USING ((SELECT raw_app_meta_data->>'tenant_id' FROM auth.users WHERE id = auth.uid())::uuid = tenant_id)
WITH CHECK ((SELECT raw_app_meta_data->>'tenant_id' FROM auth.users WHERE id = auth.uid())::uuid = tenant_id);

-- Allow authenticated users to read listings (adjust if too permissive)
-- CREATE POLICY "Authenticated users can read ebay listings" 
-- ON public.ebay_listings 
-- FOR SELECT 
-- USING (auth.role() = 'authenticated');

-- Indexes for common query patterns
CREATE INDEX idx_ebay_listings_tenant_id ON public.ebay_listings(tenant_id);
CREATE INDEX idx_ebay_listings_internal_sku ON public.ebay_listings(internal_sku);
CREATE INDEX idx_ebay_listings_offer_id ON public.ebay_listings(ebay_offer_id);
CREATE INDEX idx_ebay_listings_listing_id ON public.ebay_listings(ebay_listing_id);
CREATE INDEX idx_ebay_listings_tenant_status ON public.ebay_listings(tenant_id, ebay_listing_status);

COMMENT ON TABLE public.ebay_listings IS 'Stores information about items listed on eBay, linked to tenants.';
COMMENT ON COLUMN public.ebay_listings.internal_sku IS 'Internal SKU, typically links to manifest_data.Fn Sku or similar unique product identifier.';
COMMENT ON COLUMN public.ebay_listings.ebay_listing_status IS 'Status of the listing on eBay (e.g., PUBLISHED, UNPUBLISHED, ENDED, SOLD).';
COMMENT ON COLUMN public.ebay_listings.raw_ebay_offer_data IS 'Raw JSON response from eBay offer creation.';
COMMENT ON COLUMN public.ebay_listings.raw_ebay_listing_data IS 'Raw JSON from eBay GetItem or GetOffer if fetched.';

-- Note: If your tenants table is public.tenants with an id column:
-- You might want to add a foreign key constraint explicitly if not handled by RLS alone for integrity:
-- ALTER TABLE public.ebay_listings 
-- ADD CONSTRAINT fk_ebay_listings_tenant_id 
-- FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
-- Ensure this matches your actual tenants table structure and RLS strategy. 