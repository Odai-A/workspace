-- Add user_id to manifest_data and scan_history tables for user isolation
-- This ensures each user has their own separate manifest data and scan history

-- ============================================
-- MANIFEST_DATA TABLE
-- ============================================

-- Add user_id column to manifest_data if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'manifest_data' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE manifest_data
    ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    
    -- Create index for faster queries
    CREATE INDEX IF NOT EXISTS idx_manifest_data_user_id ON manifest_data(user_id);
    
    -- Create index for user_id + "X-Z ASIN" combination (for faster lookups)
    CREATE INDEX IF NOT EXISTS idx_manifest_data_user_lpn ON manifest_data(user_id, "X-Z ASIN");
  END IF;
END $$;

-- Update RLS policies for manifest_data
-- Drop existing user-based policies if they exist
DROP POLICY IF EXISTS "Users can view their own manifest_data" ON manifest_data;
DROP POLICY IF EXISTS "Users can insert their own manifest_data" ON manifest_data;
DROP POLICY IF EXISTS "Users can update their own manifest_data" ON manifest_data;
DROP POLICY IF EXISTS "Users can delete their own manifest_data" ON manifest_data;

-- Policy: Users can only view their own manifest_data
CREATE POLICY "Users can view their own manifest_data" ON manifest_data
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own manifest_data
CREATE POLICY "Users can insert their own manifest_data" ON manifest_data
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own manifest_data
CREATE POLICY "Users can update their own manifest_data" ON manifest_data
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own manifest_data
CREATE POLICY "Users can delete their own manifest_data" ON manifest_data
FOR DELETE
USING (auth.uid() = user_id);

-- Keep service role policy (for admin access)
-- Note: The existing tenant-based policies will still work, but user_id takes precedence

-- ============================================
-- SCAN_HISTORY TABLE
-- ============================================

-- Add user_id column to scan_history if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scan_history' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE scan_history
    ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    
    -- Create index for faster queries
    CREATE INDEX IF NOT EXISTS idx_scan_history_user_id ON scan_history(user_id);
    
    -- Create index for user_id + scanned_at combination (for faster recent scans queries)
    CREATE INDEX IF NOT EXISTS idx_scan_history_user_scanned_at ON scan_history(user_id, scanned_at DESC);
  END IF;
END $$;

-- Update RLS policies for scan_history
-- Drop existing user-based policies if they exist
DROP POLICY IF EXISTS "Users can view their own scan_history" ON scan_history;
DROP POLICY IF EXISTS "Users can insert their own scan_history" ON scan_history;
DROP POLICY IF EXISTS "Users can update their own scan_history" ON scan_history;
DROP POLICY IF EXISTS "Users can delete their own scan_history" ON scan_history;

-- Policy: Users can only view their own scan_history
CREATE POLICY "Users can view their own scan_history" ON scan_history
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own scan_history
CREATE POLICY "Users can insert their own scan_history" ON scan_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own scan_history
CREATE POLICY "Users can update their own scan_history" ON scan_history
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own scan_history
CREATE POLICY "Users can delete their own scan_history" ON scan_history
FOR DELETE
USING (auth.uid() = user_id);

-- Keep service role policy (for admin access)
-- Note: The existing tenant-based policies will still work, but user_id takes precedence

-- ============================================
-- MIGRATE EXISTING DATA
-- ============================================

-- Update existing manifest_data records to assign them to the first user (if any exist)
-- This is a one-time migration for existing data
-- You may want to review and manually assign these records
DO $$
DECLARE
  first_user_id UUID;
BEGIN
  -- Get the first user from auth.users
  SELECT id INTO first_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  
  -- If there are manifest_data items without user_id and we have a user, assign them
  IF first_user_id IS NOT NULL THEN
    UPDATE manifest_data 
    SET user_id = first_user_id 
    WHERE user_id IS NULL;
    
    RAISE NOTICE 'Assigned existing manifest_data items to user: %', first_user_id;
  END IF;
END $$;

-- Update existing scan_history records to assign them to the first user (if any exist)
DO $$
DECLARE
  first_user_id UUID;
BEGIN
  -- Get the first user from auth.users
  SELECT id INTO first_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  
  -- If there are scan_history items without user_id and we have a user, assign them
  IF first_user_id IS NOT NULL THEN
    UPDATE scan_history 
    SET user_id = first_user_id 
    WHERE user_id IS NULL;
    
    RAISE NOTICE 'Assigned existing scan_history items to user: %', first_user_id;
  END IF;
END $$;


