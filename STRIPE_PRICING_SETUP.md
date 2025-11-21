# Stripe Pricing Setup Guide

## Overview

Your subscription plans are configured as follows:

1. **Basic Plan**: $150/month - 1,000 scans included, $0.11 per additional scan
2. **Pro Plan**: $300/month - 5,000 scans included, $0.11 per additional scan
3. **Entrepreneur Plan**: $500/month - 20,000 scans included, $0.11 per additional scan

## Step 1: Create Products in Stripe Dashboard

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com)
2. Go to **Products** → **Add Product**

### Create Basic Plan Product:
- **Name**: Basic Plan
- **Description**: 1,000 scans per month included, $0.11 per additional scan
- **Pricing**: 
  - Recurring: Monthly
  - Price: $150.00 USD
- **Copy the Price ID** (starts with `price_`)

### Create Pro Plan Product:
- **Name**: Pro Plan
- **Description**: 5,000 scans per month included, $0.11 per additional scan
- **Pricing**: 
  - Recurring: Monthly
  - Price: $300.00 USD
- **Copy the Price ID** (starts with `price_`)

### Create Entrepreneur Plan Product:
- **Name**: Entrepreneur Plan
- **Description**: 20,000 scans per month included, $0.11 per additional scan
- **Pricing**: 
  - Recurring: Monthly
  - Price: $500.00 USD
- **Copy the Price ID** (starts with `price_`)

## Step 2: Configure Environment Variables

### Backend (.env file in project root)

Add these to your `.env` file:

```env
# Stripe Configuration
STRIPE_API_KEY=sk_live_...  # Use sk_test_... for testing
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...  # Use pk_test_... for testing

# Stripe Price IDs (from Step 1)
STRIPE_BASIC_PLAN_PRICE_ID=price_...
STRIPE_PRO_PLAN_PRICE_ID=price_...
STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_...
```

### Frontend (inventory_system/.env)

Create or update `inventory_system/.env`:

```env
# Stripe Price IDs (same as backend)
VITE_STRIPE_BASIC_PLAN_PRICE_ID=price_...
VITE_STRIPE_PRO_PLAN_PRICE_ID=price_...
VITE_STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_...
```

## Step 3: Set Up Stripe Webhook

1. In Stripe Dashboard, go to **Developers** → **Webhooks** → **Add Endpoint**
2. **Endpoint URL**: `https://yourdomain.com/api/stripe/webhook/`
3. **Events to listen for**:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Webhook Signing Secret** (starts with `whsec_`)
5. Add it to your backend `.env` as `STRIPE_WEBHOOK_SECRET`

## Step 4: Test the Integration

1. **Test Mode**: Use `sk_test_...` and `pk_test_...` keys with test price IDs
2. **Test Cards**: Use Stripe's test card numbers (e.g., `4242 4242 4242 4242`)
3. **Verify**: Complete a test checkout to ensure everything works

## Step 5: Go Live

1. Switch to **Live Mode** in Stripe Dashboard
2. Update your `.env` files with live keys (`sk_live_...`, `pk_live_...`)
3. Create the products in **Live Mode** and update price IDs
4. Update webhook endpoint to use your production URL
5. Test with a real card (you can refund it immediately)

## Important Notes

- **Overage Charges**: The $0.11 per additional scan is not automatically handled by Stripe subscriptions. You'll need to:
  - Track scan usage in your database
  - Use Stripe's Usage Records API to report usage
  - Or create separate invoices for overages
  
- **Usage Tracking**: Consider implementing a system to:
  - Track monthly scan counts per tenant
  - Calculate overages at the end of each billing cycle
  - Create usage-based charges via Stripe Invoicing API

## Next Steps for Overage Billing

To implement automatic overage charges, you'll need to:

1. Track scan counts in your `scan_history` table
2. At the end of each billing cycle, calculate overages
3. Use Stripe's `SubscriptionItem.create_usage_record()` API to report usage
4. Or create separate invoice line items for overages

Would you like me to implement the overage tracking and billing system?

