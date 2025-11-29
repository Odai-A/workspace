-- Add user_id to inventory table for user isolation
-- This ensures each user has their own separate inventory

-- Add user_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE inventory
    ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    
    -- Create index for faster queries
    CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON inventory(user_id);
    
    -- Create index for user_id + sku combination (for faster lookups)
    CREATE INDEX IF NOT EXISTS idx_inventory_user_sku ON inventory(user_id, sku);
  END IF;
END $$;

-- Enable Row Level Security if not already enabled
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (we'll create new ones)
DROP POLICY IF EXISTS "Users can view their own inventory" ON inventory;
DROP POLICY IF EXISTS "Users can manage their own inventory" ON inventory;
DROP POLICY IF EXISTS "Service role full access on inventory" ON inventory;

-- Policy: Users can only view their own inventory
CREATE POLICY "Users can view their own inventory" ON inventory
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own inventory
CREATE POLICY "Users can insert their own inventory" ON inventory
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own inventory
CREATE POLICY "Users can update their own inventory" ON inventory
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own inventory
CREATE POLICY "Users can delete their own inventory" ON inventory
FOR DELETE
USING (auth.uid() = user_id);

-- Policy: Service role (admin) can do everything
CREATE POLICY "Service role full access on inventory" ON inventory
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Update existing inventory records to assign them to the first user (if any exist)
-- This is a one-time migration for existing data
-- You may want to review and manually assign these records
DO $$
DECLARE
  first_user_id UUID;
BEGIN
  -- Get the first user from auth.users
  SELECT id INTO first_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  
  -- If there are inventory items without user_id and we have a user, assign them
  IF first_user_id IS NOT NULL THEN
    UPDATE inventory 
    SET user_id = first_user_id 
    WHERE user_id IS NULL;
    
    RAISE NOTICE 'Assigned existing inventory items to user: %', first_user_id;
  END IF;
END $$;

