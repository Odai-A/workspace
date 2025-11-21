# How to View Your Cached Data in Supabase

## Quick Steps

1. **Go to your Supabase Dashboard**
   - Visit: https://supabase.com/dashboard
   - Select your project

2. **Open the Table Editor**
   - Click on **"Table Editor"** in the left sidebar
   - Look for the table named **`api_lookup_cache`**
   - Click on it to view all your cached entries

3. **Or Use SQL Editor** (Recommended for better view)
   - Click on **"SQL Editor"** in the left sidebar
   - Click **"New query"**
   - Copy and paste this query:

```sql
SELECT 
  id,
  fnsku,
  asin,
  product_name,
  description,
  price,
  category,
  image_url,
  source,
  asin_found,
  lookup_count,
  created_at,
  updated_at,
  last_accessed
FROM api_lookup_cache
ORDER BY created_at DESC;
```

4. **Click "Run"** to see all your cached data

## What You Should See

Each row represents a scanned item that was cached:
- **fnsku**: The FNSKU that was scanned
- **asin**: The Amazon ASIN (if found)
- **product_name**: Product title/name
- **image_url**: Product image URL (if fetched from Rainforest API)
- **price**: Product price
- **source**: Where the data came from (`fnskutoasin.com` or `rainforest_api`)
- **lookup_count**: How many times this item has been scanned
- **created_at**: When it was first cached
- **last_accessed**: Last time it was looked up

## Verify It's Working

After scanning an item:
1. Run the query above
2. You should see your scanned FNSKU in the list
3. The `lookup_count` will increase each time you scan the same item
4. The `last_accessed` timestamp will update

## If You Don't See the Table

If the `api_lookup_cache` table doesn't exist, run this in SQL Editor:

```sql
-- Check if table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'api_lookup_cache';
```

If it returns no rows, you need to create the table. Run the SQL from `inventory_system/QUICK_TABLE_SETUP.sql` in your Supabase SQL Editor.

