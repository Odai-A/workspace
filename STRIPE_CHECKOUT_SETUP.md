# Complete Stripe Checkout Setup Guide

## How It Works

1. **Customer clicks "Choose Plan"** → Frontend sends price_id to backend
2. **Backend creates Stripe Checkout Session** → Returns secure checkout URL
3. **Customer redirected to Stripe Checkout** → Enters card info on Stripe's secure page
4. **After payment** → Stripe redirects to success/cancel page
5. **Webhook updates subscription** → Backend receives payment confirmation

## Step 1: Create Stripe Account & Products

### 1.1 Create Stripe Account
- Go to [stripe.com](https://stripe.com) and create an account
- Start in **Test Mode** for testing

### 1.2 Create Products in Stripe Dashboard

Go to **Products** → **Add Product** and create:

#### Basic Plan
- **Name**: Basic Plan
- **Description**: 1,000 scans/month included, $0.11 per additional scan
- **Pricing**: 
  - Type: Recurring
  - Billing period: Monthly
  - Price: **$150.00 USD**
- Click **Save**
- **Copy the Price ID** (starts with `price_`)

#### Pro Plan
- **Name**: Pro Plan  
- **Description**: 5,000 scans/month included, $0.11 per additional scan
- **Pricing**: Monthly, **$300.00 USD**
- **Copy the Price ID**

#### Entrepreneur Plan
- **Name**: Entrepreneur Plan
- **Description**: 20,000 scans/month included, $0.11 per additional scan
- **Pricing**: Monthly, **$500.00 USD**
- **Copy the Price ID**

## Step 2: Get Stripe API Keys

1. In Stripe Dashboard, go to **Developers** → **API keys**
2. Copy:
   - **Publishable key** (starts with `pk_test_` or `pk_live_`)
   - **Secret key** (starts with `sk_test_` or `sk_live_`)

## Step 3: Set Up Webhook

1. Go to **Developers** → **Webhooks** → **Add Endpoint**
2. **Endpoint URL**: `https://yourdomain.com/api/stripe/webhook/`
   - For local testing: Use [Stripe CLI](https://stripe.com/docs/stripe-cli) or ngrok
3. **Events to listen for**:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. **Copy the Webhook Signing Secret** (starts with `whsec_`)

## Step 4: Configure Environment Variables

### Backend (.env in project root)

Create/update `.env` file:

```env
# Stripe API Keys
STRIPE_API_KEY=sk_test_xxxxxxxxxxxxx  # Use sk_live_ for production
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx  # Use pk_live_ for production

# Stripe Price IDs (from Step 1.2)
STRIPE_BASIC_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_PRO_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_xxxxxxxxxxxxx

# Frontend URL (for redirects after payment)
FRONTEND_BASE_URL=http://localhost:5173  # Change to your production URL
```

### Frontend (inventory_system/.env)

Create `.env` file in `inventory_system` folder:

```env
# Stripe Price IDs (same as backend)
VITE_STRIPE_BASIC_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
VITE_STRIPE_PRO_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
VITE_STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_xxxxxxxxxxxxx

# Optional: API URL (defaults to localhost:5000 for dev)
# VITE_API_URL=http://localhost:5000
# VITE_BACKEND_URL=http://localhost:5000
```

## Step 5: Restart Services

After adding environment variables:

```bash
# Stop both services (Ctrl+C)

# Restart backend
python app.py

# Restart frontend (in inventory_system folder)
cd inventory_system
npm run dev
```

## Step 6: Test the Checkout Flow

### Test Mode Testing

1. **Use Test Mode** in Stripe Dashboard
2. **Test Card**: `4242 4242 4242 4242`
   - Any future expiry date (e.g., 12/34)
   - Any 3-digit CVC (e.g., 123)
   - Any ZIP code
3. **Click "Choose Plan"** on pricing page
4. **Should redirect to Stripe Checkout** (Stripe's secure payment page)
5. **Enter test card details**
6. **Complete payment** → Redirects to success page

### Verify It Works

✅ Customer can click "Choose Plan"  
✅ Redirects to Stripe Checkout page  
✅ Can enter card information  
✅ Payment processes successfully  
✅ Redirects back to your app  

## Step 7: Go Live

1. **Switch to Live Mode** in Stripe Dashboard
2. **Create products again** in Live Mode
3. **Update all environment variables** with live keys and price IDs
4. **Update webhook endpoint** to production URL
5. **Test with real card** (you can refund immediately)

## Troubleshooting

### "Invalid Stripe price ID" Error
- ✅ Check that `.env` file exists in `inventory_system` folder
- ✅ Verify price IDs start with `price_`
- ✅ Restart dev server after adding .env
- ✅ Check for typos in variable names

### "Cannot connect to payment server"
- ✅ Make sure backend is running (`python app.py`)
- ✅ Check API_URL is correct
- ✅ Verify backend has Stripe API key configured

### Checkout page doesn't load
- ✅ Verify price ID exists in Stripe Dashboard
- ✅ Check Stripe API key is valid
- ✅ Ensure webhook is configured (for post-payment processing)

## How Customers Buy

1. Customer navigates to **Pricing** page
2. Clicks **"Choose [Plan]"** button
3. **Redirected to Stripe Checkout** (Stripe's secure hosted page)
4. Enters **card number, expiry, CVC, ZIP**
5. Clicks **"Subscribe"** on Stripe's page
6. **Payment processes** securely through Stripe
7. **Redirected back** to your app's success page
8. **Subscription activated** via webhook

The entire payment process is handled securely by Stripe - you never see or store card information!

