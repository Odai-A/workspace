# Online Hosting Deployment Guide

## Overview

You need to deploy **TWO parts** online:
1. **Frontend** (React app) → Vercel, Netlify, or similar
2. **Backend** (Flask API) → Railway, Render, or Heroku

## Quick Deployment Options

### Option 1: Railway (Easiest - Recommended)
- **Backend**: Railway.app (free tier available)
- **Frontend**: Vercel (free)
- **Cost**: Free for small apps

### Option 2: Render
- **Backend**: Render.com (free tier)
- **Frontend**: Render.com (free tier)
- **Cost**: Free for small apps

### Option 3: Heroku
- **Backend**: Heroku (paid, ~$7/month)
- **Frontend**: Vercel (free)
- **Cost**: ~$7/month

## Step-by-Step: Deploy Backend to Railway (Recommended)

### 1. Sign Up for Railway
- Go to [railway.app](https://railway.app)
- Sign up with GitHub

### 2. Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your repository
4. Railway will detect it's a Python app

### 3. Set Environment Variables
In Railway dashboard, go to "Variables" and add:

```env
STRIPE_API_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_BASIC_PLAN_PRICE_ID=price_xxxxx
STRIPE_PRO_PLAN_PRICE_ID=price_xxxxx
STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_xxxxx
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
FRONTEND_BASE_URL=https://your-frontend-domain.com
ALLOWED_ORIGINS=https://your-frontend-domain.com
```

### 4. Railway Auto-Deploys
- Railway will automatically deploy your backend
- You'll get a URL like: `https://your-app.railway.app`
- **Copy this URL** - you'll need it for the frontend

### 5. Update Stripe Webhook
In Stripe Dashboard:
- Go to Webhooks
- Update webhook URL to: `https://your-app.railway.app/api/stripe/webhook/`

## Step-by-Step: Deploy Frontend to Vercel

### 1. Sign Up for Vercel
- Go to [vercel.com](https://vercel.com)
- Sign up with GitHub

### 2. Import Project
1. Click "Add New Project"
2. Import your GitHub repository
3. **Root Directory**: Set to `inventory_system`
4. **Framework Preset**: Vite

### 3. Set Environment Variables
In Vercel dashboard, go to "Environment Variables" and add:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_BACKEND_URL=https://your-app.railway.app
VITE_STRIPE_BASIC_PLAN_PRICE_ID=price_xxxxx
VITE_STRIPE_PRO_PLAN_PRICE_ID=price_xxxxx
VITE_STRIPE_ENTREPRENEUR_PLAN_PRICE_ID=price_xxxxx
```

### 4. Deploy
- Click "Deploy"
- Vercel will build and deploy your frontend
- You'll get a URL like: `https://your-app.vercel.app`

## Alternative: Deploy Both to Render

### Backend on Render

1. Go to [render.com](https://render.com)
2. Click "New" → "Web Service"
3. Connect your GitHub repo
4. Settings:
   - **Name**: `your-app-backend`
   - **Environment**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`
5. Add environment variables (same as Railway)
6. Deploy

### Frontend on Render

1. Click "New" → "Static Site"
2. Connect your GitHub repo
3. Settings:
   - **Root Directory**: `inventory_system`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. Add environment variables
5. Deploy

## After Deployment

### 1. Update Frontend Environment
Make sure `VITE_BACKEND_URL` points to your deployed backend URL.

### 2. Update Stripe Webhook
Point Stripe webhook to: `https://your-backend-url.com/api/stripe/webhook/`

### 3. Test
- Visit your frontend URL
- Try the Pricing page
- Test checkout flow

## Cost Comparison

| Service | Backend | Frontend | Total/Month |
|---------|---------|----------|-------------|
| Railway + Vercel | Free* | Free | **$0** |
| Render | Free* | Free | **$0** |
| Heroku + Vercel | $7 | Free | **$7** |

*Free tiers have limits but are fine for starting out

## Quick Start Commands

### For Railway (Backend):
```bash
# Install Railway CLI (optional)
npm i -g @railway/cli

# Login
railway login

# Link project
railway link

# Deploy
railway up
```

### For Vercel (Frontend):
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
cd inventory_system
vercel
```

## Troubleshooting

### Backend not accessible
- Check Railway/Render logs
- Verify environment variables are set
- Check CORS settings

### Frontend can't connect to backend
- Verify `VITE_BACKEND_URL` is set correctly
- Check backend is running
- Verify CORS allows your frontend domain

### Stripe webhook not working
- Check webhook URL is correct
- Verify `STRIPE_WEBHOOK_SECRET` is set
- Check Railway/Render logs for errors

## Next Steps

1. **Choose a hosting service** (Railway recommended)
2. **Deploy backend first** (get the URL)
3. **Deploy frontend** (use backend URL)
4. **Update Stripe webhook** (point to backend)
5. **Test everything**

Need help with a specific hosting service? Let me know!

