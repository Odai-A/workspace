# 🐛 FNSKU ASIN Debug Test Guide - UPDATED

## 🎯 **Issue Description**
Based on your console logs, the main issues are:
1. **API Timing Issue**: External API returns HTML first, then proper JSON after several attempts
2. **Supabase 406 Errors**: Database permission/RLS issues preventing cache lookups
3. **Race Condition**: System saves null ASIN before API fully processes

## 🧪 **Debug Test Steps**

### **Step 1: Check if API Cache Table Exists**
1. Go to your Supabase Dashboard
2. Navigate to **Table Editor**
3. Look for a table called `api_lookup_cache`
4. If it doesn't exist, you need to create it first!

**🚨 If Missing: Run this SQL in Supabase SQL Editor:**
```sql
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

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_api_cache_fnsku ON api_lookup_cache(fnsku);

-- Enable RLS with permissive policy
ALTER TABLE api_lookup_cache ENABLE ROW LEVEL SECURITY;

-- Allow all operations (no permission issues)
CREATE POLICY IF NOT EXISTS "Allow all operations on api_lookup_cache" 
ON api_lookup_cache FOR ALL 
TO authenticated, anon
USING (true)
WITH CHECK (true);
```

### **Step 2: Test New FNSKU with Updated System**
1. Use a **completely new FNSKU** you've never tested before
2. Open browser console (F12 → Console tab)
3. Clear the console
4. Scan the FNSKU

### **Step 3: Expected Console Output (New System)**

**🔍 Look for these new debug messages:**
```
⏳ Polling for ASIN results...
🔄 Polling attempt 1/8...
📊 Attempt 1 response type: string
⏳ Attempt 1: API still processing (HTML response)
🔄 Polling attempt 2/8...
📊 Attempt 2 response type: object
🎯 Attempt 2: Got scan data: {object}
✅ Success! Found ASIN: B0BVB7NRYX on attempt 2
```

## 🚨 **Common Issues & Solutions**

### **Issue 1: 406 Errors (Database Permission)**
**Symptoms:**
```
Failed to load resource: the server responded with a status of 406
```

**Solution:** 
1. Check if `api_lookup_cache` table exists
2. If not, create it using the SQL above
3. Verify RLS policies are permissive

### **Issue 2: API Returns HTML Multiple Times**
**Symptoms:**
```
📊 Attempt 1 response type: string
⏳ Attempt 1: API still processing (HTML response)
```

**Expected:** This is normal! The new system waits for the API to finish processing.

### **Issue 3: Timeout After 8 Attempts**
**Symptoms:**
```
⏰ Polling timed out - no ASIN found within time limit
```

**Possible Causes:**
- API is having issues
- FNSKU doesn't exist in Amazon's system
- Network connectivity problems

## 🎯 **Expected UI Behavior**

### **First Scan (New FNSKU):**
1. **Yellow Banner**: "Retrieved from fnskutoasin.com API - Charged lookup"
2. **Success Toast**: "API result saved to cache! Future scans will be FREE!"
3. **ASIN Displayed**: Should show the actual ASIN (like `B0BVB7NRYX`)
4. **View on Amazon Button**: Should be clickable

### **Second Scan (Same FNSKU):**
1. **Green Banner**: "Found in API cache - No API charge (previously saved)"
2. **No charge**: Should be instant and free
3. **ASIN Still There**: Should show the same ASIN

## 🔧 **Quick Fixes to Try**

### **Fix 1: Reset and Try Fresh FNSKU**
Use a different FNSKU that you've never scanned before.

### **Fix 2: Create API Cache Table**
Run the SQL provided in Step 1 if the table doesn't exist.

### **Fix 3: Check Network Tab**
1. Open DevTools → Network tab
2. Look for requests to `ato.fnskutoasin.com`
3. Check if they're returning proper responses

### **Fix 4: Clear Browser Cache**
Sometimes cached requests can interfere. Hard refresh (Ctrl+F5).

## 📋 **What Your Console Shows**

From your logs, I can see:
1. ✅ **API calls are working** (eventually)
2. ❌ **Supabase cache has 406 errors**
3. ✅ **ASIN is found** (`B0BVB7NRYX`) on later attempts
4. ❌ **First attempts return HTML** (timing issue)

The new system I've implemented should:
- ⏳ **Wait properly** for API to process
- 🔄 **Retry with delays** instead of failing immediately
- 💾 **Save to cache correctly** once ASIN is found

## 🎯 **Test This Specific FNSKU Again**

Try `X0047NY1YN` again with the updated system. You should see:
1. Proper polling attempts
2. ASIN found (`B0BVB7NRYX`)
3. Successful cache save
4. Working "View on Amazon" button

## 🚀 **Report Back**

Please test with the updated system and let me know:
1. Do you see the new polling messages?
2. Does the ASIN appear correctly in the UI?
3. Are there still 406 errors?
4. Does the "View on Amazon" button work? 