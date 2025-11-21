# Stripe Metered Billing Implementation Guide

## Overview

This implementation automatically charges customers:
1. **Monthly subscription fee** ($150/$300/$500)
2. **$0.11 per scan** beyond the included amount

## How It Works

### 1. Product Setup in Stripe

Each plan needs **TWO prices**:

#### Base Subscription Price
- **Type**: Recurring, Monthly
- **Amount**: $150 (Basic), $300 (Pro), $500 (Entrepreneur)
- **Billing**: Fixed monthly charge

#### Usage Price (Metered)
- **Type**: Recurring, Monthly
- **Billing method**: **Metered** or **Usage-based**
- **Price per unit**: $0.11
- **Billing method**: **Per unit**

### 2. Checkout Flow

When a customer subscribes:
1. Checkout session includes **both** base price and usage price
2. Usage price starts at **0 units**
3. Subscription is created with both items

### 3. Usage Reporting

The system tracks scans and reports overages to Stripe:

1. **Scans are logged** in `scan_history` table
2. **System calculates overage** (scans beyond included amount)
3. **Usage reported to Stripe** via Usage Records API
4. **Stripe automatically bills** on next invoice

## Setup Steps

### Step 1: Create Products in Stripe

For each plan (Basic, Pro, Entrepreneur):

1. **Create Base Price**:
   - Products → Add Product
   - Name: "Basic Plan - Monthly"
   - Recurring: Monthly
   - Price: $150.00
   - Copy Price ID → `STRIPE_BASIC_PLAN_PRICE_ID`

2. **Add Usage Price** (in same product):
   - Click "Add another price"
   - Name: "Overage Scans"
   - Recurring: Monthly
   - **Billing method**: Select **"Metered"** or **"Usage-based"**
   - **Price per unit**: $0.11
   - Copy Price ID → `STRIPE_BASIC_USAGE_PRICE_ID`

### Step 2: Environment Variables

Add to your `.env` file:

```env
# Base subscription prices
STRIPE_BASIC_PLAN_PRICE_ID=price_base_xxxxx
STRIPE_PRO_PLAN_PRICE_ID=price_base_xxxxx
STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_base_xxxxx

# Usage-based prices (for overages)
STRIPE_BASIC_USAGE_PRICE_ID=price_usage_xxxxx
STRIPE_PRO_USAGE_PRICE_ID=price_usage_xxxxx
STRIPE_ENTREPRENEUR_USAGE_PRICE_ID=price_usage_xxxxx
```

### Step 3: Usage Reporting

Usage can be reported in two ways:

#### Option A: Real-time Reporting (Recommended)
Report usage immediately when scans exceed the included amount.

#### Option B: Periodic Reporting
Run a scheduled job (daily/weekly) to calculate and report overages.

### Step 4: Test the Flow

1. **Subscribe to a plan** → Checkout includes both prices
2. **Make scans** → Tracked in `scan_history`
3. **Exceed included scans** → System calculates overage
4. **Report to Stripe** → Usage recorded
5. **Next invoice** → Stripe automatically bills overage

## API Endpoints

### Report Usage Manually
```bash
POST /api/report-usage/
Authorization: Bearer <token>
```

This endpoint:
- Calculates current billing period scans
- Determines overage (scans beyond included)
- Reports usage to Stripe
- Returns overage count

## Example Calculation

**Basic Plan Customer:**
- Included: 1,000 scans/month
- Actual scans: 1,500
- Overage: 500 scans
- Overage charge: 500 × $0.11 = $55.00
- **Total bill**: $150 (base) + $55 (overage) = **$205.00**

## Important Notes

- **Usage is cumulative** within the billing period
- **Stripe bills automatically** on the next invoice
- **No manual invoicing needed**
- **Usage can be reported multiple times** (Stripe sums it up)
- **Use `action='increment'`** to add to existing usage

## Troubleshooting

### Usage not being billed
- ✅ Check usage price is added to subscription
- ✅ Verify usage records are being created
- ✅ Check Stripe Dashboard → Subscriptions → Usage

### Wrong overage calculation
- ✅ Verify plan configuration in `PLAN_CONFIG`
- ✅ Check scan_history has correct `tenant_id`
- ✅ Ensure billing period dates are correct

### Subscription missing usage price
- ✅ Check checkout session includes both prices
- ✅ Verify usage price IDs in environment variables
- ✅ Check Stripe subscription has both items

