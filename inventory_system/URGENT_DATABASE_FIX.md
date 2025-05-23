# 🚨 URGENT: Fix 406 Database Errors

## ⚡ **Quick Fix (5 minutes)**

Your console shows `406 (Not Acceptable)` errors because the `api_lookup_cache` table doesn't exist in your Supabase database.

### **Step 1: Open Supabase Dashboard**
1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar

### **Step 2: Run This SQL**
Copy and paste this entire SQL script and click **Run**:

```sql
-- 🚀 EMERGENCY FIX FOR 406 ERRORS
-- This creates the missing api_lookup_cache table

CREATE TABLE IF NOT EXISTS api_lookup_cache (
  id BIGSERIAL PRIMARY KEY,
  fnsku TEXT NOT NULL UNIQUE,
  asin TEXT,
  product_name TEXT,
  description TEXT,
  price DECIMAL(10,2) DEFAULT 0,
  category TEXT DEFAULT 'External API',
  upc TEXT,
  source TEXT DEFAULT 'fnskutoasin.com',
  scan_task_id TEXT,
  task_state TEXT,
  asin_found BOOLEAN DEFAULT false,
  original_lookup_code TEXT,
  external_lookup_date TIMESTAMPTZ DEFAULT NOW(),
  lookup_count INTEGER DEFAULT 1,
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_api_cache_fnsku ON api_lookup_cache(fnsku);
CREATE INDEX IF NOT EXISTS idx_api_cache_asin ON api_lookup_cache(asin);

-- Enable Row Level Security
ALTER TABLE api_lookup_cache ENABLE ROW LEVEL SECURITY;

-- Create permissive policies (no permission issues)
CREATE POLICY IF NOT EXISTS "Allow all authenticated users" 
ON api_lookup_cache FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow all anonymous users" 
ON api_lookup_cache FOR ALL 
TO anon
USING (true)
WITH CHECK (true);

-- Grant full permissions
GRANT ALL ON api_lookup_cache TO authenticated;
GRANT ALL ON api_lookup_cache TO anon;
GRANT ALL ON SEQUENCE api_lookup_cache_id_seq TO authenticated;
GRANT ALL ON SEQUENCE api_lookup_cache_id_seq TO anon;

-- Test it works
INSERT INTO api_lookup_cache (fnsku, asin, product_name, asin_found) 
VALUES ('TEST123', 'B00TEST123', 'Test Product', true)
ON CONFLICT (fnsku) DO NOTHING;
```

### **Step 3: Verify It Worked**
After running the SQL, you should see:
- ✅ "Success. No rows returned" message
- No error messages

### **Step 4: Test Your App**
1. Refresh your app page
2. Try scanning an FNSKU again
3. **No more 406 errors** should appear in console

## 🎯 **What This Fixes**

- ❌ **Before**: `406 (Not Acceptable)` errors
- ✅ **After**: Cache lookups work properly
- ✅ **After**: Previously scanned FNSKUs load instantly
- ✅ **After**: System can save/retrieve ASIN data

## 🚀 **Updated Workflow**

With the new "Check for Updates" button:

1. **Scan FNSKU** → API starts processing (shows processing indicator)
2. **Wait 2-3 minutes** → API works in background
3. **Click "🔄 Check for Updates"** → System checks if ASIN is ready
4. **ASIN appears** → "View on Amazon" button works!

## ⚠️ **If SQL Fails**

If you get any errors running the SQL:
1. Try running it in smaller pieces
2. Check if the table already exists: `SELECT * FROM api_lookup_cache LIMIT 1;`
3. Contact me with the specific error message

This should fix the 406 errors immediately! 🎉 