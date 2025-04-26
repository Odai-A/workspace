-- Create product_lookups table
CREATE TABLE IF NOT EXISTS public.product_lookups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  fnsku TEXT,
  asin TEXT,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2),
  category TEXT,
  image_url TEXT,
  condition TEXT,
  lookup_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source TEXT,
  last_lookup_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.product_lookups ENABLE ROW LEVEL SECURITY;

-- Create policy for product_lookups
CREATE POLICY "Users can only access their own product lookups"
  ON public.product_lookups
  FOR ALL
  USING (auth.uid() = user_id);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_lookups_user_id ON public.product_lookups(user_id);
CREATE INDEX IF NOT EXISTS idx_product_lookups_fnsku ON public.product_lookups(fnsku);
CREATE INDEX IF NOT EXISTS idx_product_lookups_asin ON public.product_lookups(asin);
CREATE INDEX IF NOT EXISTS idx_product_lookups_sku ON public.product_lookups(sku);

-- Add sample product lookup for testing (optional)
INSERT INTO public.product_lookups (
  user_id, 
  fnsku, 
  asin, 
  name, 
  description, 
  price, 
  category, 
  image_url, 
  condition, 
  source
) VALUES (
  '3f149067-8eb8-4da1-ab9e-545e53b1ac3c', -- Replace with the current user ID
  'X000SAMPLE', 
  'B0SAMPLE123', 
  'Sample Product', 
  'This is a sample product for testing purposes', 
  29.99, 
  'Test Category', 
  'https://via.placeholder.com/300', 
  'New', 
  'Sample Data'
) ON CONFLICT DO NOTHING; 