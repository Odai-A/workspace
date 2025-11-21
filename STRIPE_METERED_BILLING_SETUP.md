# Stripe Metered Billing Setup - Monthly + Overage Charges

## Overview

This guide shows you how to set up Stripe so customers are automatically charged:
1. **Monthly subscription fee** ($150/$300/$500)
2. **$0.11 per scan** beyond the included amount

## How It Works

- **Base Subscription**: Monthly recurring charge for the plan
- **Metered Usage**: Additional charge for scans beyond included amount
- **Automatic Billing**: Stripe automatically calculates and bills overages on the next invoice

## Step 1: Create Products with Metered Billing in Stripe

### For Each Plan (Basic, Pro, Entrepreneur):

1. Go to **Products** → **Add Product**

2. **Create the Base Subscription**:
   - **Name**: "Basic Plan - Monthly Subscription" (or Pro/Entrepreneur)
   - **Description**: "Monthly base subscription"
   - **Pricing**: 
     - Type: **Recurring**
     - Billing period: **Monthly**
     - Price: **$150.00** (or $300/$500)
   - Click **Save**
   - **Copy the Base Price ID** (starts with `price_`)

3. **Add Metered Usage Component**:
   - In the same product, click **Add another price**
   - **Name**: "Overage Scans"
   - **Description**: "Additional scans beyond included amount"
   - **Pricing**:
     - Type: **Recurring**
     - Billing period: **Monthly**
     - **Billing method**: Select **"Metered"** or **"Usage-based"**
     - **Price per unit**: **$0.11**
     - **Billing method**: **"Per unit"**
   - Click **Save**
   - **Copy the Usage Price ID** (starts with `price_`)

### Example Structure:

**Basic Plan Product:**
- Base Price: `price_base_basic` → $150/month
- Usage Price: `price_usage_basic` → $0.11 per scan

**Pro Plan Product:**
- Base Price: `price_base_pro` → $300/month
- Usage Price: `price_usage_pro` → $0.11 per scan

**Entrepreneur Plan Product:**
- Base Price: `price_base_entrepreneur` → $500/month
- Usage Price: `price_usage_entrepreneur` → $0.11 per scan

## Step 2: Checkout Session (Already Implemented)

✅ **The checkout session is already configured** to include both prices automatically!

When a customer subscribes:
- Base subscription price is added (monthly fee)
- Usage price is added if configured (starts at 0 units)
- Both are included in the subscription

The system automatically:
1. Detects the plan from the price ID
2. Finds the corresponding usage price ID
3. Adds both to the checkout session
4. Creates subscription with both items

## Step 3: Track Scans and Report Usage (Already Implemented)

✅ **Usage tracking and reporting is already implemented!**

The system automatically:
1. **Tracks all scans** in `scan_history` table (with `tenant_id`)
2. **Calculates overages** (scans beyond included amount)
3. **Reports usage to Stripe** using Usage Records API
4. **Stripe automatically bills** on next invoice

### Manual Usage Reporting

You can manually trigger usage reporting via API:

```bash
POST /api/report-usage/
Authorization: Bearer <token>
```

This endpoint:
- Calculates scans in current billing period
- Determines overage (scans beyond included)
- Reports usage to Stripe
- Returns overage count

### Automatic Usage Reporting

To set up automatic reporting, you can:
1. **Call the endpoint periodically** (daily/weekly via cron job)
2. **Report on each scan** (if you want real-time billing)
3. **Report at end of billing period** (before invoice generation)

## Step 4: Environment Variables

Add usage price IDs to your `.env` files:

### Backend (.env)
```env
# Base subscription prices
STRIPE_BASIC_PLAN_PRICE_ID=price_base_basic_xxxxx
STRIPE_PRO_PLAN_PRICE_ID=price_base_pro_xxxxx
STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_base_entrepreneur_xxxxx

# Usage-based prices (for overages)
STRIPE_BASIC_USAGE_PRICE_ID=price_usage_basic_xxxxx
STRIPE_PRO_USAGE_PRICE_ID=price_usage_pro_xxxxx
STRIPE_ENTREPRENEUR_USAGE_PRICE_ID=price_usage_entrepreneur_xxxxx
```

### Frontend (inventory_system/.env)
```env
# Base subscription prices (for display)
VITE_STRIPE_BASIC_PLAN_PRICE_ID=price_base_basic_xxxxx
VITE_STRIPE_PRO_PLAN_PRICE_ID=price_base_pro_xxxxx
VITE_STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_base_entrepreneur_xxxxx
```

## Step 5: How Usage Reporting Works

1. **Customer scans an item** → Recorded in `scan_history`
2. **System calculates overage** → Scans beyond included amount
3. **Report to Stripe** → Using `UsageRecord.create()` API
4. **Stripe bills automatically** → On next invoice cycle

### Example:
- Basic Plan: 1,000 scans included
- Customer scans 1,500 items this month
- Overage: 500 scans
- Charge: 500 × $0.11 = $55.00
- Total bill: $150 (base) + $55 (overage) = $205.00

## Important Notes

- **Usage is reported in real-time** or at the end of billing period
- **Stripe automatically calculates** the overage charge
- **Invoices include** both base subscription and usage charges
- **No manual invoicing needed** - Stripe handles everything

## Next Steps

See the implementation code in `app.py` for:
- Usage reporting functions
- Overage calculation logic
- Automatic usage record creation

