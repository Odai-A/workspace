# 🛍️ Shopify Integration Setup Guide

## Overview
This guide will help you set up automated Shopify listing creation from your scanner. When you scan a product, you'll be able to create a Shopify listing with:
- ✅ **Product description**
- ✅ **Pricing with markup**
- ✅ **Amazon "View on Amazon" button**
- ✅ **Product metadata (ASIN, FNSKU)**

## 🔧 **Step 1: Create Shopify Private App**

### 1.1 Access Shopify Admin
1. Go to your Shopify admin: `https://your-store.myshopify.com/admin`
2. Navigate to **Settings** → **Apps and sales channels**
3. Click **Develop apps** → **Create an app**

### 1.2 Configure App Permissions
Give your app these API permissions:
- ✅ **Products**: `write_products` (to create listings)
- ✅ **Inventory**: `write_inventory` (to manage stock)
- ✅ **Orders**: `read_orders` (optional, for order tracking)

### 1.3 Get API Credentials
After creating the app, you'll get:
- **API Key** (starts with something like `shpat_`)
- **API Secret Key**
- **Access Token** (use this as the password)

## 🔧 **Step 2: Environment Configuration**

### 2.1 Add to `.env` file
Create/update your `.env` file with:

```env
# Shopify Configuration
REACT_APP_SHOPIFY_STORE=your-store-name
REACT_APP_SHOPIFY_API_KEY=your_api_key
REACT_APP_SHOPIFY_PASSWORD=your_access_token
```

### 2.2 Example Configuration
```env
# Example (replace with your actual values)
REACT_APP_SHOPIFY_STORE=myamazingstore
REACT_APP_SHOPIFY_API_KEY=shpat_a1b2c3d4e5f6g7h8i9j0
REACT_APP_SHOPIFY_PASSWORD=shpat_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

**⚠️ Security Note:** Never commit your `.env` file to version control!

## 🧪 **Step 3: Test the Integration**

### 3.1 Test Connection
1. Scan any product in your scanner
2. Click the green **"🛍️ Create Shopify Listing"** button
3. In the modal, click **"Test Shopify Connection"**
4. You should see: ✅ "Shopify connection successful!"

### 3.2 Create Test Listing
1. Scan product: `B0CHBJXG7G` (an ASIN)
2. Click **"🛍️ Create Shopify Listing"**
3. Adjust settings:
   - **Markup**: 1.5 (50% markup)
   - **Status**: Draft (for testing)
4. Click **"Create Listing"**
5. Check your Shopify admin for the new product

## 🎯 **Features Included**

### 📝 **Auto-Generated Description**
```html
<div class="product-description">
  <p>Direct ASIN lookup for B0CHBJXG7G</p>
  
  <div class="product-details">
    <h4>Product Details:</h4>
    <ul>
      <li><strong>Category:</strong> Amazon Product</li>
      <li><strong>ASIN:</strong> B0CHBJXG7G</li>
    </ul>
  </div>
  
  <div class="amazon-section" style="...">
    <h4>🛒 View Original Product</h4>
    <p>See this product on Amazon for additional details...</p>
    <a href="https://www.amazon.com/dp/B0CHBJXG7G" ...>
      📱 View on Amazon
    </a>
  </div>
</div>
```

### 💰 **Smart Pricing**
- **Base Price**: From your scanned data
- **Markup**: Customizable (default 50%)
- **Fallback**: If no price found, uses default ($29.99)

### 📊 **Product Metadata**
Saves these as Shopify metafields:
- `amazon.asin`: Product ASIN
- `amazon.fnsku`: Product FNSKU  
- `amazon.original_price`: Original price
- `scanner.scan_date`: When scanned

## 🛠️ **Customization Options**

### Available Settings:
- **Product Title**: Auto-generated or custom
- **Markup Multiplier**: Price markup (1.5 = 50% markup)
- **Inventory Quantity**: Starting stock level
- **Product Status**: Draft, Active, or Archived
- **Vendor**: Product source label
- **Weight**: For shipping calculations
- **Tags**: Auto-generated + custom tags

### Example Tags Generated:
`amazon-arbitrage, scanned-product, has-asin, electronics`

## 🔍 **Troubleshooting**

### Common Issues:

**❌ "Shopify connection failed"**
- Check your store name (no `.myshopify.com`)
- Verify API credentials
- Ensure app has correct permissions

**❌ "Product creation failed"**
- Check product title isn't too long
- Verify price format (numbers only)
- Check if product already exists

**❌ "Access denied"**
- App needs `write_products` permission
- Access token might be expired

### Debug Mode:
Open browser console to see detailed logs:
```
🛍️ Creating Shopify listing for: {product data}
📦 Shopify product payload: {request data}
✅ Shopify product created successfully: 12345
```

## 🚀 **Usage Workflow**

1. **Scan Product**: Use camera or manual entry
2. **Review Data**: Verify product info is correct
3. **Create Listing**: Click "🛍️ Create Shopify Listing"
4. **Customize**: Adjust title, price, settings
5. **Preview**: Review description with Amazon link
6. **Create**: Click "Create Listing"
7. **Success**: Auto-opens Shopify admin for final review

## 🎉 **Success Indicators**

When everything works:
- ✅ Green toast: "Shopify listing created!"
- ✅ Shopify admin opens automatically
- ✅ Product appears in your Shopify products
- ✅ Amazon link works in product description

**You're now ready to automate your Shopify arbitrage listings!** 🛍️

## 📞 **Need Help?**

If you encounter issues:
1. Check the browser console for error details
2. Verify your Shopify app permissions
3. Test with a simple ASIN like `B0CHBJXG7G`
4. Ensure your `.env` file is properly configured 