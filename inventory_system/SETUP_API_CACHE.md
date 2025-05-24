# 🚀 API Cache Setup Guide

## Overview
This guide helps you set up a **separate API cache table** to avoid RLS policy conflicts and save money on external API calls.

## 📋 **Step 1: Create the API Cache Table in Supabase**

1. **Open Supabase Dashboard**
   - Go to your Supabase project dashboard
   - Navigate to **SQL Editor**

2. **Run the Table Creation Script**
   - Copy the contents of `database/create_api_cache_table.sql`
   - Paste it into the SQL Editor
   - Click **Run** to execute

3. **Verify Table Creation**
   - Go to **Table Editor**
   - You should see a new table called `api_lookup_cache`
   - It should have columns: `id`, `fnsku`, `asin`, `product_name`, etc.

## 🔧 **Step 2: How the Dual-Table System Works**

### **Lookup Priority:**
1. 🚀 **API Cache Table** (`api_lookup_cache`) - Checked first
   - Stores external API results
   - No RLS conflicts (permissive policies)
   - Lightning fast lookups

2. 📦 **Original Table** (`manifest_data`) - Checked second  
   - Your existing product data
   - LPN lookups, imported data
   - Maintains your current workflow

### **Cost-Saving Flow:**
```
First Scan (NEW FNSKU)
├── Check API cache ❌ (not found)
├── Check manifest_data ❌ (not found) 
├── Call external API 💰 ($0.02-0.05)
└── Save to API cache ✅ (for future)

Second Scan (SAME FNSKU)  
├── Check API cache ✅ (FOUND!)
└── Return cached result 🆓 (FREE!)
```

## 🎯 **Step 3: Test the Feature**

### **Test 1: New FNSKU (Should be charged)**
1. Scan an FNSKU you've never scanned before
2. **Expected:**
   - 🟡 Yellow banner: "Retrieved from fnskutoasin.com API - Charged lookup"
   - 💾 Toast: "API result saved to cache! Future scans will be FREE!"

### **Test 2: Repeat FNSKU (Should be free)**
1. Scan the SAME FNSKU again
2. **Expected:**
   - 🟢 Green banner: "Found in API cache - No API charge (previously saved)"
   - ✅ Toast: "Found in local database - No API charge!"

### **Test 3: Check Database**
1. Go to Supabase Table Editor
2. Open `api_lookup_cache` table
3. You should see your scanned FNSKU saved there

## 📊 **Visual Indicators**

### **Cost Status Banners:**
- 🟢 **Green**: "Found in local database" (original manifest_data)
- 🟢 **Green**: "Found in API cache" (previously saved API results)  
- 🟡 **Yellow**: "Retrieved from external API" (charged lookup)
- 🔵 **Blue**: "Mock data" (testing data)

### **Data Sources:**
- **`local_database`**: From your original `manifest_data` table
- **`api_cache`**: From the new `api_lookup_cache` table (previously saved API results)
- **`external_api`**: Fresh call to fnskutoasin.com (charged)
- **`mock_data`**: Testing/fallback data

## 🔍 **Troubleshooting**

### **If table creation fails:**
```sql
-- Check if table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'api_lookup_cache';
```

### **If RLS policies are too restrictive:**
```sql
-- Temporarily disable RLS (development only)
ALTER TABLE api_lookup_cache DISABLE ROW LEVEL SECURITY;
```

### **If lookups aren't working:**
1. Check browser console for errors
2. Verify table permissions in Supabase
3. Check if API cache service is imported correctly

## 💰 **Cost Savings Analysis**

### **Before (No Caching):**
- Every scan = API call = $0.02-0.05 per FNSKU
- 100 repeat scans = $2-5 in API costs

### **After (With API Cache):**
- First scan = API call = $0.02-0.05 per FNSKU
- All repeat scans = FREE (from cache)
- 100 repeat scans = $0.02-0.05 total (98-99% savings!)

## ✅ **Success Checklist**

- [ ] API cache table created successfully
- [ ] First scan shows yellow "charged" banner
- [ ] Second scan shows green "cached" banner  
- [ ] Console logs show table switching
- [ ] Database contains cached results
- [ ] Toast messages indicate proper flow

## 🎉 **Benefits**

✅ **No more RLS conflicts** - API cache has permissive policies
✅ **Massive cost savings** - 98%+ reduction in API charges  
✅ **Faster lookups** - Cached results load instantly
✅ **Organized data** - Separate tables for different purposes
✅ **Backwards compatible** - Original table still works normally

Your scanner now has **intelligent dual-table lookup** with automatic cost optimization! 🚀 