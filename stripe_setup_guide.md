# Stripe Integration Setup Guide

This guide explains how to properly set up Stripe subscription plans for the multi-tenant inventory system.

## Step 1: Create a Stripe Account

If you don't already have a Stripe account, create one at [https://stripe.com](https://stripe.com).

## Step 2: Get Your API Keys

1. Log in to your Stripe Dashboard
2. Go to Developers → API keys
3. Note down your:
   - **Publishable key** (starts with `pk_test_` or `pk_live_`)
   - **Secret key** (starts with `sk_test_` or `sk_live_`)

## Step 3: Create Subscription Products and Prices

1. In your Stripe Dashboard, go to Products → Add Product
2. Create products for each subscription tier (e.g., Starter, Pro, Enterprise)
3. For each product:
   - Add a name, description, and images
   - Under Pricing, set up recurring pricing (monthly/yearly)
   - Note the **Price ID** for each product (starts with `price_`)

Example:
- Starter Plan: price_123abc...
- Pro Plan: price_456def...
- Enterprise Plan: price_789ghi...

## Step 4: Set Up Webhook

1. Go to Developers → Webhooks → Add Endpoint
2. Add your webhook URL: `https://yourdomain.com/api/stripe/webhook/`
3. Select events to listen for:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Note down the Webhook Signing Secret

## Step 5: Configure Environment Variables

### Backend (.env file in project root)

Create a `.env` file in your project root with:

```
# Stripe Configuration
STRIPE_API_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs
STRIPE_STARTER_PLAN_PRICE_ID=price_...
STRIPE_PRO_PLAN_PRICE_ID=price_...
STRIPE_ENTERPRISE_PLAN_PRICE_ID=price_...
```

### Frontend (inventory_system/.env)

Create a `.env` file in the `inventory_system` directory with:

```
VITE_STRIPE_STARTER_PLAN_PRICE_ID=price_...
VITE_STRIPE_PRO_PLAN_PRICE_ID=price_...
VITE_STRIPE_ENTERPRISE_PLAN_PRICE_ID=price_...
VITE_API_URL=http://localhost:5000
```

### Using Test Price IDs for Development

During development, you can use special test price IDs that will be recognized by our application:

```
# For backend (.env)
STRIPE_STARTER_PLAN_PRICE_ID=price_50
STRIPE_PRO_PLAN_PRICE_ID=price_100
STRIPE_ENTERPRISE_PLAN_PRICE_ID=price_250

# For frontend (inventory_system/.env)
VITE_STRIPE_STARTER_PLAN_PRICE_ID=price_50
VITE_STRIPE_PRO_PLAN_PRICE_ID=price_100
VITE_STRIPE_ENTERPRISE_PLAN_PRICE_ID=price_250
```

These test IDs won't work with actual Stripe checkout but allow you to develop and test the UI without valid Stripe price IDs.

## Step 6: Testing Your Setup

1. Start your application
2. Navigate to the Pricing page
3. Verify all plans show correctly with no error messages
4. Test the subscription flow with Stripe's test credit card:
   - Card number: 4242 4242 4242 4242
   - Expiry: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits

## Troubleshooting

### "No such price" Error

If you see an error like "No such price: 'price_250'" it means:

1. The price ID in your environment variables doesn't exist in your Stripe account
2. Double-check your price IDs in the Stripe Dashboard against your .env files
3. Make sure the price IDs are correctly formatted (starts with "price_" followed by a string of characters)

### Other Common Issues

- **CORS errors**: Check that your CORS configuration allows requests from your frontend
- **Authentication errors**: Make sure your Stripe API keys are correct
- **Webhook failures**: Verify your webhook endpoint is accessible and the signing secret is correct

## Resources

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Subscriptions Guide](https://stripe.com/docs/billing/subscriptions/overview)
- [Stripe Testing Guide](https://stripe.com/docs/testing) 