# Fix for Cache Save 400 Error

## Issue
The frontend is getting a 400 error when trying to save to `api_lookup_cache`. This is likely due to:
1. Missing `image_url` column in the table
2. Field name mismatches
3. Constraint violations

## Solution

### Step 1: Run this SQL in Supabase to add missing column
```sql
-- Add image_url column if it doesn't exist
ALTER TABLE api_lookup_cache 
ADD COLUMN IF NOT EXISTS image_url TEXT;
```

### Step 2: Verify table structure
Run this to check your table:
```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'api_lookup_cache'
ORDER BY ordinal_position;
```

### Step 3: Check for constraint issues
The `fnsku` column is NOT NULL, so make sure you're always providing it when inserting.

## Fixed Code
The frontend code has been updated to:
- Use `source` instead of `api_source`
- Use `last_accessed` instead of `last_check_time`
- Remove `is_processing` field (doesn't exist in table)
- Ensure `price` is always a number (defaults to 0)
- Better error logging

## Test
After running the SQL migration, try scanning again and check the browser console for detailed error messages.

