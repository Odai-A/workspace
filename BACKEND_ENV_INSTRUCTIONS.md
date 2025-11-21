# Backend .env File Setup

## ✅ I've Created the Backend .env File For You!

The file is located at: `C:\Users\odaia\LiqAmz\workspace\.env`

## What You Need to Do:

### Step 1: Replace the Placeholder Values

Open the `.env` file and replace `xxxxxxxxxxxxx` with your actual values:

1. **Stripe API Keys** (if you don't have them yet):
   - Go to [Stripe Dashboard](https://dashboard.stripe.com) → Developers → API keys
   - Copy your **Secret key** (starts with `sk_test_` or `sk_live_`)
   - Copy your **Publishable key** (starts with `pk_test_` or `pk_live_`)

2. **Stripe Price IDs** (from your frontend .env):
   - Copy the Price IDs from `inventory_system/.env`
   - Remove the `VITE_` prefix
   - Add them to the backend `.env`

### Step 2: Example

If your frontend `.env` has:
```env
VITE_STRIPE_BASIC_PLAN_PRICE_ID=price_1ABC123xyz
```

Then your backend `.env` should have:
```env
STRIPE_BASIC_PLAN_PRICE_ID=price_1ABC123xyz
```

**Same Price ID, just without the `VITE_` prefix!**

## Why You Need It in the Backend:

✅ **YES, you absolutely need it in the backend!**

The backend:
- Creates the Stripe Checkout Session
- Validates the Price ID
- Handles webhook events
- Reports usage for metered billing

The frontend:
- Just displays the pricing page
- Sends the Price ID to the backend
- Redirects to Stripe Checkout

## After Updating:

1. **Restart your backend server**:
   ```bash
   # Stop (Ctrl+C)
   python app.py
   ```

2. **Test it**:
   - Go to Pricing page
   - Click "Choose Plan"
   - Should redirect to Stripe Checkout

## Quick Copy-Paste Template

If you already have the Price IDs in your frontend `.env`, just copy them and remove `VITE_`:

```env
# From frontend .env (inventory_system/.env):
VITE_STRIPE_BASIC_PLAN_PRICE_ID=price_1ABC123xyz

# To backend .env (.env in project root):
STRIPE_BASIC_PLAN_PRICE_ID=price_1ABC123xyz
```

Same for Pro and Entrepreneur plans!

