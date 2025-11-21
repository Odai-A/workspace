# Quick Guide: Where to Put Your Stripe Price ID

## Step 1: Find Your .env File

Your `.env` file should be in the **project root** (same folder as `app.py`):
```
C:\Users\odaia\LiqAmz\workspace\.env
```

If it doesn't exist, **create it** in that location.

## Step 2: Determine Which Price ID You Have

**Important:** You need **Price IDs** (starts with `price_`), not Product IDs.

In Stripe Dashboard:
- **Product ID** starts with `prod_` ❌ (not what you need)
- **Price ID** starts with `price_` ✅ (this is what you need)

## Step 3: Add to .env File

Open your `.env` file and add the price ID based on which plan it's for:

### If it's a BASE subscription price (monthly fee):

```env
# Basic Plan - $150/month
STRIPE_BASIC_PLAN_PRICE_ID=price_xxxxxxxxxxxxx

# Pro Plan - $300/month
STRIPE_PRO_PLAN_PRICE_ID=price_xxxxxxxxxxxxx

# Entrepreneur Plan - $500/month
STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
```

### If it's a USAGE price (for overages, $0.11/scan):

```env
# Basic Plan usage
STRIPE_BASIC_USAGE_PRICE_ID=price_xxxxxxxxxxxxx

# Pro Plan usage
STRIPE_PRO_USAGE_PRICE_ID=price_xxxxxxxxxxxxx

# Entrepreneur Plan usage
STRIPE_ENTREPRENEUR_USAGE_PRICE_ID=price_xxxxxxxxxxxxx
```

## Complete Example .env File

```env
# Stripe API Keys
STRIPE_API_KEY=sk_test_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Base subscription prices (monthly fees)
STRIPE_BASIC_PLAN_PRICE_ID=price_1ABC123...
STRIPE_PRO_PLAN_PRICE_ID=price_1DEF456...
STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_1GHI789...

# Usage prices (for overages - $0.11 per scan)
STRIPE_BASIC_USAGE_PRICE_ID=price_1JKL012...
STRIPE_PRO_USAGE_PRICE_ID=price_1MNO345...
STRIPE_ENTREPRENEUR_USAGE_PRICE_ID=price_1PQR678...
```

## Step 4: Restart Your Server

After saving the `.env` file:
1. **Stop** your backend server (Ctrl+C)
2. **Restart** it: `python app.py`

## How to Find Price ID in Stripe

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Click **Products**
3. Click on your product
4. You'll see **Prices** section
5. Click on a price
6. Copy the **Price ID** (starts with `price_`)

## Still Not Sure?

**Tell me:**
- Which plan? (Basic/Pro/Entrepreneur)
- Is it the monthly subscription price or the usage/overage price?
- What does the price ID start with? (`price_` or `prod_`?)

I'll tell you exactly which variable to use!

