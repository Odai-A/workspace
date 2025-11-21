# Environment Variables Setup

## Quick Setup for Stripe Pricing

1. **Create a `.env` file** in the `inventory_system` folder (same level as `package.json`)

2. **Add these variables** (replace with your actual Stripe Price IDs):

```env
# Stripe Price IDs - Get these from Stripe Dashboard
# Go to: https://dashboard.stripe.com/products
# Create products for each plan, then copy the Price ID (starts with price_)

VITE_STRIPE_BASIC_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
VITE_STRIPE_PRO_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
VITE_STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
```

3. **Restart your dev server** after adding the .env file:
   ```bash
   # Stop the current server (Ctrl+C)
   # Then restart:
   npm run dev
   ```

## How to Get Stripe Price IDs

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Click **Products** → **Add Product**
3. For each plan:
   - **Name**: Basic Plan (or Pro, Entrepreneur)
   - **Pricing**: 
     - Recurring: Monthly
     - Price: $150 (or $300, $500)
   - Click **Save**
   - Copy the **Price ID** (looks like `price_1ABC123...`)
4. Add each Price ID to your `.env` file

## Testing with Stripe Test Mode

1. Use **Test Mode** in Stripe Dashboard
2. Create test products with test price IDs
3. Use test card: `4242 4242 4242 4242`
4. Any future expiry date and CVC

## Production Setup

1. Switch to **Live Mode** in Stripe
2. Create the same products in Live Mode
3. Update `.env` with live price IDs
4. Deploy with the updated environment variables

