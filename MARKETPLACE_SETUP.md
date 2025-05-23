# Marketplace Integration Setup Guide

This guide explains how to set up eBay and Shopify integrations for automatic listing creation from your inventory system.

## Prerequisites

1. **eBay Developer Account**: Sign up at [https://developer.ebay.com](https://developer.ebay.com)
2. **Shopify Store**: You need a Shopify store with admin access
3. **Python Environment**: Make sure you have Python 3.8+ installed

## Environment Variables Setup

Create a `.env` file in your project root with the following variables:

```env
# eBay API Configuration
# Get these from https://developer.ebay.com/my/keys
EBAY_CLIENT_ID=your_ebay_client_id_here
EBAY_CLIENT_SECRET=your_ebay_client_secret_here
EBAY_SANDBOX=true
EBAY_REDIRECT_URI=https://yourdomain.com/auth/ebay/callback

# Shopify API Configuration  
# Get these from your Shopify store admin > Apps > Private apps
SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_shopify_access_token_here

# Database Configuration (if different from default)
DATABASE_URL=postgresql://username:password@host:port/database

# Flask Configuration
FLASK_ENV=development
SECRET_KEY=your_secret_key_here
```

## eBay API Setup

### 1. Create eBay Developer Account
1. Go to [https://developer.ebay.com](https://developer.ebay.com)
2. Sign up for a developer account
3. Create a new application

### 2. Get API Credentials
1. Navigate to "My Keys" in the developer dashboard
2. Copy your **Client ID** and **Client Secret**
3. Add these to your `.env` file

### 3. Configure OAuth Scopes
Make sure your eBay app has the following scopes:
- `https://api.ebay.com/oauth/api_scope/sell.inventory`
- `https://api.ebay.com/oauth/api_scope/sell.inventory.readonly`
- `https://api.ebay.com/oauth/api_scope/sell.marketing`
- `https://api.ebay.com/oauth/api_scope/sell.marketing.readonly`

### 4. Set Up Merchant Location
1. In eBay Developer Console, set up a default merchant location
2. This is required for inventory management

## Shopify API Setup

### 1. Create Private App
1. Log into your Shopify admin
2. Go to **Apps** > **App and sales channel settings**
3. Click **Develop apps for your store**
4. Click **Create an app**

### 2. Configure Permissions
Enable the following permissions for your private app:
- **Products**: Read and write
- **Inventory**: Read and write
- **Files**: Read and write (for image uploads)

### 3. Get Access Token
1. After creating the app, install it to your store
2. Copy the **Access Token**
3. Add it to your `.env` file along with your shop domain

## Installation & Running

### 1. Install Dependencies
```bash
# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies for the React frontend
cd inventory_system
npm install
```

### 2. Start the Applications
```bash
# Start Flask backend
python app.py

# Start React frontend (in another terminal)
cd inventory_system
npm run dev
```

### 3. Test the Integration
1. Scan a product in your inventory system
2. Click "Create eBay & Shopify Listings"
3. Fill out the listing details
4. Click "Create Listings"

## Features

### eBay Integration
- **Automatic listing creation** with product details
- **Category suggestions** based on product data
- **Pricing recommendations** (15% below MSRP by default)
- **Inventory management** integration
- **Image support** (placeholder for now)

### Shopify Integration
- **Product creation** with full details
- **Variant management** with SKU and barcode
- **Tag support** for organization
- **Collection assignment** capability
- **SEO optimization** fields
- **Inventory tracking** integration

### Combined Features
- **Dual marketplace listing** from a single scan
- **Pricing suggestions** for each marketplace
- **Success/error handling** with detailed feedback
- **Form validation** to ensure complete listings

## Troubleshooting

### Common Issues

1. **eBay Authentication Errors**
   - Check your Client ID and Client Secret
   - Ensure you're using the correct sandbox/production URLs
   - Verify your OAuth scopes

2. **Shopify Connection Issues**
   - Verify your shop domain format (include .myshopify.com)
   - Check your access token permissions
   - Ensure your private app is installed

3. **CORS Errors**
   - Make sure Flask-CORS is installed
   - Check that your frontend and backend ports match

4. **Missing Product Data**
   - Ensure your scanned products have all required fields
   - Check that price information is available

### Debug Mode
Set `FLASK_ENV=development` in your `.env` file to enable debug mode and get detailed error messages.

## Production Deployment

### Security Considerations
1. **Never commit `.env` files** to version control
2. **Use environment variables** in production
3. **Enable HTTPS** for all API calls
4. **Regularly rotate** API keys and tokens

### eBay Production
1. Change `EBAY_SANDBOX=false` in production
2. Update API endpoints to production URLs
3. Complete eBay's production approval process

### Shopify Production
1. Shopify APIs work the same in production
2. Consider rate limiting for high-volume operations
3. Implement proper error handling and retry logic

## API Rate Limits

### eBay
- **Sandbox**: 5,000 calls per day
- **Production**: Varies by API type and seller level

### Shopify
- **REST API**: 40 calls per app per store per minute
- **GraphQL**: Calculated based on query complexity

## Support

For issues with this integration:
1. Check the troubleshooting section above
2. Review eBay and Shopify API documentation
3. Check your `.env` configuration
4. Enable debug mode for detailed error messages

For eBay API issues: [https://developer.ebay.com/support](https://developer.ebay.com/support)
For Shopify API issues: [https://shopify.dev/docs](https://shopify.dev/docs) 