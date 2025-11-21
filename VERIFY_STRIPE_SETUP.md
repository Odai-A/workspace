# Verify Your Stripe Setup is Complete

## ✅ Checklist After Adding Price IDs

### Step 1: Backend .env File (Project Root)

Make sure your `.env` file in `C:\Users\odaia\LiqAmz\workspace\.env` has:

```env
# Stripe API Keys (required)
STRIPE_API_KEY=sk_test_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Base subscription prices (at least one)
STRIPE_BASIC_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_PRO_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_xxxxxxxxxxxxx

# Usage prices (optional for now, but needed for overage billing)
STRIPE_BASIC_USAGE_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_PRO_USAGE_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_ENTREPRENEUR_USAGE_PRICE_ID=price_xxxxxxxxxxxxx
```

### Step 2: Frontend .env File (Optional but Recommended)

Create/update `inventory_system/.env`:

```env
# Frontend needs these for the Pricing page to work
VITE_STRIPE_BASIC_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
VITE_STRIPE_PRO_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
VITE_STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
```

**Note:** These should be the SAME price IDs as in your backend .env

### Step 3: Restart Your Servers

**IMPORTANT:** You must restart both servers after adding environment variables!

1. **Stop backend** (Ctrl+C in terminal running `python app.py`)
2. **Restart backend**: `python app.py`
3. **Stop frontend** (Ctrl+C in terminal running `npm run dev`)
4. **Restart frontend**: `cd inventory_system && npm run dev`

### Step 4: Test It Works

1. Go to your Pricing page in the app
2. You should **NOT** see the "Configuration Error" message anymore
3. Click "Choose Plan" on any plan
4. Should redirect to Stripe Checkout page
5. Use test card: `4242 4242 4242 4242`

## Common Issues

### ❌ Still seeing "Invalid Stripe price ID" error?
- ✅ Check you restarted the frontend server
- ✅ Verify the price ID starts with `price_` (not `prod_`)
- ✅ Make sure there are no extra spaces in the .env file
- ✅ Check the variable name matches exactly (case-sensitive)

### ❌ Checkout not working?
- ✅ Check you restarted the backend server
- ✅ Verify `STRIPE_API_KEY` is set in backend .env
- ✅ Make sure the price ID exists in your Stripe account
- ✅ Check you're using Test Mode keys with Test Mode prices

### ❌ "Cannot connect to payment server"?
- ✅ Make sure backend is running (`python app.py`)
- ✅ Check backend is on port 5000
- ✅ Verify no firewall blocking the connection

## Next Steps

Once everything is working:
1. ✅ Test the checkout flow with a test card
2. ✅ Verify subscription is created in Stripe Dashboard
3. ✅ Check webhook is receiving events (if configured)
4. ✅ Set up usage prices for overage billing (optional for now)

## Need Help?

If something's not working:
- Check the browser console for errors
- Check the backend terminal for error messages
- Verify all environment variables are set correctly
- Make sure you're using Test Mode for testing

