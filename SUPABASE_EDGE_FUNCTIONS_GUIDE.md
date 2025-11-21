# Converting to Supabase Edge Functions (No Backend Server Needed!)

## Overview

Instead of running a Flask backend server, you can use **Supabase Edge Functions** - serverless functions that run in the cloud. No server to manage!

## What You Need to Convert

### 1. Checkout Session Creation
**Current:** Flask route `/api/create-checkout-session/`  
**New:** Edge Function `create-checkout-session`

### 2. Stripe Webhook Handler
**Current:** Flask route `/api/stripe/webhook/`  
**New:** Edge Function `stripe-webhook`

### 3. Usage Reporting
**Current:** Flask route `/api/report-usage/`  
**New:** Edge Function `report-usage`

## Benefits

✅ **No server to manage** - Supabase handles everything  
✅ **Free tier** - 500K invocations/month  
✅ **Automatic scaling** - Handles traffic spikes  
✅ **Built-in deployment** - Deploy with one command  
✅ **Direct database access** - No API calls needed  

## Setup Steps

### Step 1: Install Supabase CLI

```bash
npm install -g supabase
```

### Step 2: Initialize Edge Functions

```bash
supabase functions new create-checkout-session
supabase functions new stripe-webhook
supabase functions new report-usage
```

### Step 3: Write Edge Functions

Each function is a TypeScript/JavaScript file that:
- Receives HTTP requests
- Has direct access to Supabase
- Can call Stripe API
- Returns JSON responses

### Step 4: Deploy

```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
supabase functions deploy report-usage
```

## Example: Checkout Session Edge Function

```typescript
// supabase/functions/create-checkout-session/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
})

serve(async (req) => {
  try {
    const { price_id } = await req.json()
    
    // Get user from Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      // ... same logic as Flask backend
    })
    
    return new Response(
      JSON.stringify({ checkout_url: session.url }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400 },
    )
  }
})
```

## Frontend Changes

Instead of calling:
```javascript
fetch('http://localhost:5000/api/create-checkout-session/', ...)
```

You'd call:
```javascript
const { data, error } = await supabase.functions.invoke('create-checkout-session', {
  body: { price_id: priceId }
})
```

## Webhook Setup

In Stripe Dashboard, set webhook URL to:
```
https://your-project.supabase.co/functions/v1/stripe-webhook
```

## Cost Comparison

**Flask Backend:**
- Hosting: $5-20/month (Heroku, Railway, etc.)
- Database: Supabase (free tier)

**Supabase Edge Functions:**
- Functions: Free (500K/month)
- Database: Supabase (free tier)
- **Total: $0/month** (for small apps)

## Next Steps

Would you like me to:
1. ✅ Convert your Flask backend to Edge Functions?
2. ✅ Update the frontend to use Edge Functions?
3. ✅ Set up deployment instructions?

This way you can host online **without managing a server**!

