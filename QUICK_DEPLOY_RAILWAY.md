# Quick Deploy to Railway (5 Minutes)

## Why Railway?
- ✅ Free tier (enough for starting)
- ✅ Auto-deploys from GitHub
- ✅ Easy environment variable setup
- ✅ Automatic HTTPS
- ✅ No credit card needed (for free tier)

## Step 1: Prepare Your Code

Make sure you have:
- ✅ `requirements.txt` (for Python dependencies)
- ✅ `Procfile` (tells Railway how to run your app)
- ✅ All code committed to GitHub

## Step 2: Deploy to Railway

### 2.1 Sign Up
1. Go to [railway.app](https://railway.app)
2. Click "Start a New Project"
3. Sign up with GitHub

### 2.2 Create Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your repository
4. Railway will auto-detect Python

### 2.3 Add Environment Variables
Click "Variables" tab and add:

**Required:**
```
STRIPE_API_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_BASIC_PLAN_PRICE_ID=price_xxxxx
STRIPE_PRO_PLAN_PRICE_ID=price_xxxxx
STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_xxxxx
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
```

**Optional but Recommended:**
```
FRONTEND_BASE_URL=https://your-frontend.vercel.app
ALLOWED_ORIGINS=https://your-frontend.vercel.app
FLASK_DEBUG=False
```

### 2.4 Deploy
- Railway will automatically:
  - Install dependencies from `requirements.txt`
  - Run your app using `Procfile`
  - Give you a URL like: `https://your-app.railway.app`

### 2.5 Get Your Backend URL
- Copy the URL Railway gives you
- This is your backend API URL
- You'll need it for the frontend

## Step 3: Update Stripe Webhook

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Go to **Developers** → **Webhooks**
3. Click on your webhook (or create new)
4. Update URL to: `https://your-app.railway.app/api/stripe/webhook/`
5. Save

## Step 4: Update Frontend

In your frontend environment variables (Vercel/Netlify), set:

```
VITE_BACKEND_URL=https://your-app.railway.app
```

Or if using `VITE_API_URL`:
```
VITE_API_URL=https://your-app.railway.app
```

## Step 5: Test

1. Visit your frontend URL
2. Go to Pricing page
3. Click "Choose Plan"
4. Should redirect to Stripe Checkout!

## Railway Dashboard Features

- **Logs**: See real-time server logs
- **Metrics**: Monitor CPU, memory usage
- **Deployments**: See deployment history
- **Variables**: Manage environment variables
- **Settings**: Configure domain, scaling, etc.

## Troubleshooting

### App won't start
- Check **Logs** tab in Railway
- Verify all environment variables are set
- Check `Procfile` is correct: `web: gunicorn app:app`

### 502 Bad Gateway
- Check logs for errors
- Verify `requirements.txt` has all dependencies
- Make sure port is set correctly (Railway auto-sets PORT)

### Environment variables not working
- Make sure variable names match exactly
- Restart the service after adding variables
- Check for typos

## That's It!

Your backend is now online and accessible from anywhere! 🎉

Next: Deploy your frontend to Vercel or Netlify.

