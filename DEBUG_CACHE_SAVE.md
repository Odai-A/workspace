# Debug Cache Save Issues

## Enhanced Logging Added

I've added comprehensive logging to help debug why saves aren't working. When you scan an item now, check the browser console for:

### Look for these log messages:

1. **When save is called:**
   - `🔍 [saveLookup] Called with:` - Shows what data is being passed
   - `💾 [saveLookup] Attempting to save/update` - Shows the lookup key
   - `💾 [saveLookup] Full apiResult:` - Shows complete data structure

2. **When checking for existing entry:**
   - `💾 [saveLookup] Existing entry found:` - Shows if entry exists

3. **When preparing data:**
   - `💾 [saveLookup] Data to upsert:` - Shows exactly what will be saved

4. **On success:**
   - `✅ [saveLookup] Insert/Update successful` - Confirms save worked
   - `✅ [saveLookup] Saved data includes image_url:` - Confirms image was saved

5. **On error:**
   - `❌ [saveLookup] Insert/Update error:` - Shows the error
   - `❌ [saveLookup] Error code:` - Shows Supabase error code
   - `❌ [saveLookup] Error message:` - Shows error message
   - `❌ [saveLookup] Error details:` - Shows detailed error info

## Common Error Codes

- **23505**: UNIQUE constraint violation (fnsku already exists - this is OK, it should update)
- **23502**: NOT NULL constraint violation (required field missing)
- **42703**: Column does not exist (table schema mismatch)

## Next Steps

1. **Scan an item** and watch the browser console
2. **Copy all the `[saveLookup]` log messages**
3. **Check if you see any error messages**
4. **Verify the table exists** in Supabase:
   ```sql
   SELECT * FROM api_lookup_cache LIMIT 5;
   ```

## If Still Not Working

Run this in Supabase SQL Editor to verify table structure:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'api_lookup_cache'
ORDER BY ordinal_position;
```

Make sure you see:
- `fnsku` (TEXT, NOT NULL)
- `asin` (TEXT, nullable)
- `product_name` (TEXT, nullable)
- `image_url` (TEXT, nullable) ← **This must exist!**
- `source` (TEXT, nullable)
- `asin_found` (BOOLEAN, nullable)

