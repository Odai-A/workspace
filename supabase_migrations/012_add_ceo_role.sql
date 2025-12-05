-- Add 'ceo' role to the users table role constraint
-- This allows CEO accounts to have unlimited scanning without pricing restrictions

-- Drop the existing constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Add the new constraint with 'ceo' role included
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('employee', 'manager', 'admin', 'ceo'));

-- Update the is_admin function to also check for CEO role
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check role from JWT app_metadata first (fastest, no recursion)
  -- CEO and admin both have admin privileges
  IF (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'ceo') THEN
    RETURN TRUE;
  END IF;
  
  -- Fallback: check from auth.users metadata (also no recursion)
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND (raw_app_meta_data->>'role' IN ('admin', 'ceo') OR raw_user_meta_data->>'role' IN ('admin', 'ceo'))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create a function to check if user is CEO (for unlimited scanning)
CREATE OR REPLACE FUNCTION is_ceo()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check role from JWT app_metadata first (fastest, no recursion)
  IF (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'ceo' THEN
    RETURN TRUE;
  END IF;
  
  -- Fallback: check from auth.users metadata (also no recursion)
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND (raw_app_meta_data->>'role' = 'ceo' OR raw_user_meta_data->>'role' = 'ceo')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

