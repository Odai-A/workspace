# How to Get Price ID from Product ID

## The Difference

- **Product ID** (`prod_xxxxx`) ❌ - This is the product container
- **Price ID** (`price_xxxxx`) ✅ - This is what you need for subscriptions

A Product can have multiple Prices (e.g., monthly, yearly, different tiers).

## Step-by-Step: Get Price ID from Your Product

### Method 1: Stripe Dashboard (Easiest)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Click **Products** in the left menu
3. Find your product (you can search by the Product ID: `prod_xxxxx`)
4. Click on the product name
5. You'll see a **"Pricing"** section with prices listed
6. Click on the price you want (the one that matches your plan)
7. You'll see the **Price ID** at the top (starts with `price_`)
8. **Copy that Price ID** ✅

### Method 2: Stripe API (If you have access)

If you have the Product ID, you can list its prices:

```python
import stripe
stripe.api_key = "sk_test_..."

product = stripe.Product.retrieve("prod_xxxxx")
prices = stripe.Price.list(product="prod_xxxxx")

for price in prices.data:
    print(f"Price ID: {price.id}")
    print(f"Amount: ${price.unit_amount/100}")
    print(f"Recurring: {price.recurring}")
```

## What to Look For

When you see the prices, look for:
- **Type**: Recurring
- **Billing period**: Monthly
- **Amount**: $150 (Basic), $300 (Pro), or $500 (Entrepreneur)

That's the Price ID you need!

## After You Get the Price ID

Once you have the Price ID (starts with `price_`), add it to your `.env` file:

```env
# For Basic Plan ($150/month)
STRIPE_BASIC_PLAN_PRICE_ID=price_xxxxxxxxxxxxx

# For Pro Plan ($300/month)
STRIPE_PRO_PLAN_PRICE_ID=price_xxxxxxxxxxxxx

# For Entrepreneur Plan ($500/month)
STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
```

## Quick Visual Guide

```
Stripe Dashboard Structure:
└── Products
    └── Your Product (prod_xxxxx) ← You have this
        └── Prices
            ├── Price 1 (price_xxxxx) ← You need this!
            ├── Price 2 (price_yyyyy)
            └── Price 3 (price_zzzzz)
```

## Still Need Help?

If you can't find the Price ID:
1. Make sure you're in the correct Stripe account (Test vs Live mode)
2. Check that the product actually has prices created
3. If no prices exist, you need to create them first (see STRIPE_PRODUCT_SETUP_GUIDE.md)

