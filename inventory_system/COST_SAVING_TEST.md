# 🔍 Cost-Saving Scanner Test Guide

## Overview
This guide helps you verify that the cost-saving feature is working correctly - ensuring external API results are saved to your database so future scans are **FREE**!

## Test Steps

### 1. First Scan (Should be Charged) 💰
1. Open the Scanner page
2. Scan or manually enter an FNSKU (e.g., `X001-ABC123-DEFG`)
3. **Expected behavior:**
   - 📱 Toast: "💰 Checking external API (this will be charged)..."
   - ⚡ Toast: "⚡ Found via external API and saved for future use!"
   - 💾 Toast: "💾 API result saved to database! Future scans of this item will be FREE! 🎉"
   - 🟡 Yellow banner: "Retrieved from fnskutoasin.com API - Charged lookup"

### 2. Second Scan (Should be FREE) 💚
1. Clear the product info (click Reset)
2. Scan or enter the **SAME FNSKU** again
3. **Expected behavior:**
   - ✅ Toast: "✅ Found in local database - No API charge!"
   - 🟢 Green banner: "Found in local database - No API charge"
   - **NO** external API call should be made

### 3. Check Console Logs 🔍
Open browser DevTools (F12) and check the Console tab:

**First scan logs should show:**
```
🔍 Looking up product by code: X001-ABC123-DEFG
📦 Step 1: Checking local database...
❌ Not found in local database
💰 Step 2: Trying external API (this will be charged)...
✅ Found via external API - charged lookup
💾 Attempting to save external API result to database for future cost savings...
✅ Successfully saved external API result to database
```

**Second scan logs should show:**
```
🔍 Looking up product by code: X001-ABC123-DEFG
✅ Found in local database - no API charge!
```

## Visual Indicators

### Cost Status Banners:
- 🟢 **Green**: "Found in local database - No API charge" (FREE)
- 🟡 **Yellow**: "Retrieved from fnskutoasin.com API - Charged lookup" (CHARGED)
- 🔵 **Blue**: "Mock data - No charge" (FREE testing data)

### Toast Messages:
- 💚 **Green checkmark**: Database lookup (free)
- 💛 **Yellow lightning**: External API lookup (charged)
- 🔵 **Blue circle**: Mock data (free)

## Troubleshooting

### If saving fails:
- Check console for database errors
- Verify Supabase connection
- Check the toast message for specific error details

### If local lookup fails:
- Verify the FNSKU was saved correctly in the database
- Check if the database query is working properly
- Look for console logs indicating database connection issues

### Database Schema
The external API results are saved to your `manifest_data` table with these mappings:
- `Fn Sku` → FNSKU from API
- `B00 Asin` → ASIN from API
- `Description` → Product name/description
- `MSRP` → Price (usually 0 from this API)
- `Category` → Set to "External API"

## Success Metrics
✅ **Working correctly if:**
1. First scan shows yellow "charged" banner
2. Second scan shows green "free" banner
3. Console logs show database save/load operations
4. Toast messages indicate proper flow

❌ **Needs fixing if:**
1. Every scan shows "charged" (not saving to database)
2. External API called multiple times for same FNSKU
3. Console shows database save errors
4. Toast messages don't indicate cost status

## Cost Savings Impact
- **First lookup**: ~$0.02-0.05 per FNSKU (estimated API cost)
- **Future lookups**: $0.00 (retrieved from your database)
- **ROI**: Break-even after 1 re-scan, 100% savings thereafter! 