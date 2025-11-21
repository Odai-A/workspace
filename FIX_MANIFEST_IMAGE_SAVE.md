# Fix: Save Rainforest Images to manifest_data

## Problem
When scanning items from inventory (manifest_data), Rainforest API images were fetched but not saved back to the database, causing repeated charges.

## Solution
Now when Rainforest API data is fetched, it saves to **BOTH**:
1. ✅ `api_lookup_cache` - For future lookups (prevents API charges)
2. ✅ `manifest_data` - Updates the actual product record with image_url

## Changes Made

### Scanner.jsx
- ✅ Updated both Rainforest save locations
- ✅ After saving to `api_lookup_cache`, also updates `manifest_data`
- ✅ Finds product in `manifest_data` by FNSKU
- ✅ Updates `image_url` and `Description` columns

## Database Setup

### Step 1: Add image_url column to manifest_data
Run this in Supabase SQL Editor:

```sql
-- See: supabase_migrations/009_add_image_url_to_manifest_data.sql
```

Or manually:
```sql
ALTER TABLE manifest_data 
ADD COLUMN IF NOT EXISTS image_url TEXT;
```

## How It Works Now

### When Scanning from Inventory:
1. Product found in `manifest_data` (no charge)
2. Missing image → Fetches from Rainforest API (charged once)
3. Saves to `api_lookup_cache` ✅
4. **Also updates `manifest_data.image_url`** ✅
5. Next scan: Image found in `manifest_data` → No API call!

## Benefits

✅ **Images persist in manifest_data** - Once fetched, always available  
✅ **No duplicate charges** - Image saved to both tables  
✅ **Inventory shows images** - Images appear in inventory tab  
✅ **Future-proof** - Works for all products in manifest  

## Testing

1. **Scan an item from inventory** that doesn't have an image
2. **Check console** - Should see:
   - `💾 [1/2] Saving Rainforest data to api_lookup_cache`
   - `💾 [2/2] Found product in manifest_data, updating with image_url...`
   - `✅ Updated manifest_data with image_url`
3. **Check Supabase** - Run:
   ```sql
   SELECT "Fn Sku", "B00 Asin", image_url 
   FROM manifest_data 
   WHERE image_url IS NOT NULL 
   LIMIT 5;
   ```
4. **Scan same item again** - Should see image immediately (no API call)

## Verify It's Working

After scanning, check:
- `api_lookup_cache` table has the entry with `image_url`
- `manifest_data` table has `image_url` updated for that FNSKU
- Next scan shows image without API call

The image is now saved in both places! 🎉

