# Complete Stripe Product Setup Guide - Metered Billing

## Quick Summary

You need to create **TWO prices per plan**:
1. **Base Price**: Monthly subscription ($150/$300/$500)
2. **Usage Price**: Metered billing for overages ($0.11 per scan)

## Step-by-Step: Creating Products in Stripe

### For Each Plan (Basic, Pro, Entrepreneur):

#### 1. Create the Product

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Click **Products** → **Add Product**

#### 2. Add Base Subscription Price

**Basic Plan Example:**
- **Name**: "Basic Plan - Monthly Subscription"
- **Description**: "Monthly base subscription for Basic Plan"
- **Pricing**:
  - Type: **Recurring**
  - Billing period: **Monthly**
  - Price: **$150.00 USD**
- Click **Save**
- **Copy the Price ID** (starts with `price_`)
  - This goes in: `STRIPE_BASIC_PLAN_PRICE_ID`

#### 3. Add Usage Price (Metered Billing)

**Still in the same product:**

1. Click **"Add another price"** (or "Add price" button)
2. **Name**: "Overage Scans"
3. **Description**: "Additional scans beyond 1,000 included scans"
4. **Pricing**:
   - Type: **Recurring**
   - Billing period: **Monthly**
   - **Billing method**: Click the dropdown and select **"Metered"** or **"Usage-based"**
   - **Price per unit**: **$0.11**
   - **Billing method**: **"Per unit"** (should be default)
5. Click **Save**
6. **Copy the Usage Price ID** (starts with `price_`)
   - This goes in: `STRIPE_BASIC_USAGE_PRICE_ID`

### Repeat for Pro and Entrepreneur Plans

**Pro Plan:**
- Base: $300/month → `STRIPE_PRO_PLAN_PRICE_ID`
- Usage: $0.11/scan → `STRIPE_PRO_USAGE_PRICE_ID`

**Entrepreneur Plan:**
- Base: $500/month → `STRIPE_ENTREPRENEUR_PLAN_PRICE_ID`
- Usage: $0.11/scan → `STRIPE_ENTREPRENEUR_USAGE_PRICE_ID`

## Environment Variables

Add to your `.env` file (project root):

```env
# Base subscription prices
STRIPE_BASIC_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_PRO_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_xxxxxxxxxxxxx

# Usage-based prices (for overages)
STRIPE_BASIC_USAGE_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_PRO_USAGE_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_ENTREPRENEUR_USAGE_PRICE_ID=price_xxxxxxxxxxxxx
```

## How It Works

1. **Customer subscribes** → Gets both base + usage prices
2. **Scans are tracked** → Recorded in `scan_history` table
3. **System calculates overage** → Scans beyond included amount
4. **Usage reported to Stripe** → Via Usage Records API
5. **Stripe bills automatically** → On next invoice

## Example Billing

**Basic Plan Customer:**
- Included: 1,000 scans/month
- Actual scans: 1,500
- Overage: 500 scans
- Overage charge: 500 × $0.11 = $55.00
- **Total bill**: $150 (base) + $55 (overage) = **$205.00**

## Important Notes

- ✅ **Both prices must be in the same product** (or you can create separate products)
- ✅ **Usage price must be "Metered"** billing type
- ✅ **Usage starts at 0** and increments as scans exceed included amount
- ✅ **Stripe automatically calculates** the overage charge
- ✅ **No manual invoicing needed**

## Testing

1. Create products in **Test Mode**
2. Use test card: `4242 4242 4242 4242`
3. Subscribe to a plan
4. Check Stripe Dashboard → Subscriptions → Your subscription
5. Verify both prices are included
6. Make scans beyond included amount
7. Report usage via `/api/report-usage/` endpoint
8. Check Stripe Dashboard → Usage to see reported usage

## Troubleshooting

### "Metered" option not showing
- Make sure you're creating a **Recurring** price
- The "Metered" option appears in the billing method dropdown
- If not available, your Stripe account may need to be upgraded

### Usage not being billed
- ✅ Check both prices are in the subscription
- ✅ Verify usage price is "Metered" type
- ✅ Check usage records are being created (Stripe Dashboard)
- ✅ Verify scans are being tracked with correct `tenant_id`

### Wrong overage calculation
- ✅ Check plan configuration in code (`PLAN_CONFIG`)
- ✅ Verify included scan limits match your plan
- ✅ Ensure `scan_history` has correct `tenant_id` for all scans

