# Subscription Setup – Customer Payments Ready

This checklist ensures customers can start a subscription with no errors.

## Required environment variables

### Backend (root `.env`)

| Variable | Purpose |
|----------|---------|
| `STRIPE_API_KEY` | Stripe secret key (e.g. `sk_test_...` or `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret from Stripe Dashboard |
| `STRIPE_PUBLISHABLE_KEY` | Publishable key (optional for backend; frontend can use for Stripe.js) |
| `STRIPE_BASIC_PLAN_PRICE_ID` | Stripe Price ID for Basic plan |
| `STRIPE_PRO_PLAN_PRICE_ID` | Stripe Price ID for Pro plan |
| `STRIPE_ENTREPRENEUR_PLAN_PRICE_ID` | Stripe Price ID for Entrepreneur plan |
| `FRONTEND_BASE_URL` | Base URL of your frontend (e.g. `http://localhost:5173` or `https://yourapp.com`) – Stripe redirects here after payment/cancel |
| `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY` | Supabase config (tenant and user updates after payment) |

### Frontend (`inventory_system/.env`)

| Variable | Purpose |
|----------|---------|
| `VITE_STRIPE_BASIC_PLAN_PRICE_ID` | Same value as backend Basic plan price ID |
| `VITE_STRIPE_PRO_PLAN_PRICE_ID` | Same value as backend Pro plan price ID |
| `VITE_STRIPE_ENTREPRENEUR_PLAN_PRICE_ID` | Same value as backend Entrepreneur plan price ID |
| `VITE_API_URL` or `VITE_BACKEND_URL` | Backend API base (e.g. `http://localhost:5000` or `http://localhost:5000/api`) |

## Stripe Dashboard

1. **Products & Prices**  
   Create products and recurring prices for Basic, Pro, and Entrepreneur. Copy each **Price ID** (e.g. `price_1xxx`) into the env vars above.

2. **Webhook** (required for subscription activation)  
   - **Developers → Webhooks → Add endpoint**  
   - **Endpoint URL**: `https://your-backend-domain.com/api/stripe/webhook/`  
   - **Events**: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`  
   - Copy the **Signing secret** (starts with `whsec_`) into `STRIPE_WEBHOOK_SECRET` in your backend `.env`.

3. **Local development**  
   Use [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward webhooks to your machine:
   ```bash
   stripe listen --forward-to localhost:5000/api/stripe/webhook/
   ```
   Use the printed webhook signing secret as `STRIPE_WEBHOOK_SECRET` in `.env`.

## Flow check

- Customer clicks a plan on **Pricing** → frontend calls `POST /api/create-checkout-session/` with `price_id` and `Authorization: Bearer <token>`.
- Backend creates (or reuses) tenant and Stripe Checkout session, returns `checkout_url`.
- Frontend redirects to `checkout_url`; customer pays on Stripe.
- Stripe redirects to `FRONTEND_BASE_URL/checkout-success` or `.../checkout-cancel`.
- Stripe sends `checkout.session.completed` to your webhook; backend updates `tenants` (subscription status) and user `app_metadata` (tenant_id, role). After that, the customer has an active subscription and can use scans according to their plan.

## Optional: usage-based overage

If you use metered billing for overage scans, set in backend `.env`:

- `STRIPE_BASIC_USAGE_PRICE_ID`
- `STRIPE_PRO_USAGE_PRICE_ID`
- `STRIPE_ENTREPRENEUR_USAGE_PRICE_ID`

Leave them unset if you only use fixed monthly plans.
