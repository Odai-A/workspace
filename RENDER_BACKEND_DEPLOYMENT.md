# 🚀 Complete Guide: Deploy Backend to Render

## ✅ Pre-Deployment Checklist

Before you start, make sure you have:
- [x] Your frontend already deployed on Render
- [x] Your frontend Render URL (e.g., `https://your-frontend.onrender.com`)
- [x] All your API keys ready (Supabase, FNSKU, Rainforest, Stripe)
- [x] Your repository pushed to GitHub/GitLab/Bitbucket

---

## 📋 Step-by-Step: Deploy Backend to Render

### Step 1: Create New Web Service on Render

1. **Go to Render Dashboard**
   - Visit: https://dashboard.render.com
   - Log in to your account

2. **Click "New +" button** (top right)
   - Select **"Web Service"**

3. **Connect Your Repository**
   - Choose your Git provider (GitHub/GitLab/Bitbucket)
   - Select your repository
   - Click **"Connect"**

---

### Step 2: Configure Basic Settings

Fill in the following:

**Name:**
```
your-app-backend
```
(Use a descriptive name like `inventory-backend` or `liqamz-backend`)

**Region:**
```
Oregon (US West)
```
(Choose the region closest to your users)

**Branch:**
```
master
```
(Or `main` if that's your default branch)

**Root Directory:**
```
(leave empty - your app.py is in the root)
```

**Runtime:**
```
Python 3
```

**Build Command:**
```
pip install -r requirements.txt
```

**Start Command:**
```
gunicorn app:app
```

---

### Step 3: Set Environment Variables

Click **"Advanced"** → **"Add Environment Variable"** and add each one:

#### 🔴 REQUIRED - Supabase (Must Have)
```
SUPABASE_URL=https://your-project.supabase.co
```
```
SUPABASE_KEY=your-anon-key-here
```
```
SUPABASE_SERVICE_KEY=your-service-role-key-here
```

#### 🔴 REQUIRED - External APIs (Must Have)
```
FNSKU_API_KEY=your-fnsku-api-key-here
```
```
RAINFOREST_API_KEY=your-rainforest-api-key-here
```

#### 🟡 REQUIRED - CORS (Must Have for Production)
```
ALLOWED_ORIGINS=https://your-frontend.onrender.com
```
**Replace `your-frontend.onrender.com` with your actual frontend URL!**

```
FRONTEND_BASE_URL=https://your-frontend.onrender.com
```
**Replace with your actual frontend URL!**

#### 🟢 OPTIONAL - Stripe (If Using Subscriptions)
```
STRIPE_API_KEY=sk_live_xxxxxxxxxxxxx
```
```
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```
```
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxx
```
```
STRIPE_STARTER_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
```
```
STRIPE_PRO_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
```
```
STRIPE_ENTERPRISE_PLAN_PRICE_ID=price_xxxxxxxxxxxxx
```

#### 🟢 OPTIONAL - Server Settings
```
FLASK_DEBUG=False
```
```
FLASK_RUN_PORT=5000
```
(Note: Render will override PORT automatically, but this is good to have)

---

### Step 4: Deploy

1. **Scroll down** and click **"Create Web Service"**

2. **Wait for Deployment**
   - Render will:
     - Clone your repository
     - Install dependencies from `requirements.txt`
     - Start the server with gunicorn
   - This takes 2-5 minutes

3. **Watch the Logs**
   - You'll see build progress in real-time
   - Look for: `✅ Build successful`
   - Then: `✅ Your service is live`

---

### Step 5: Get Your Backend URL

Once deployed, Render will show:
```
Your service is live at: https://your-backend.onrender.com
```

**Copy this URL!** You'll need it for the next step.

---

### Step 6: Update Frontend Environment Variables

Go back to your **Frontend service** on Render:

1. Click on your frontend service
2. Go to **"Environment"** tab
3. Add/Update this variable:

```
VITE_API_URL=https://your-backend.onrender.com
```

**Replace `your-backend.onrender.com` with your actual backend URL!**

4. Click **"Save Changes"**
5. Render will automatically redeploy your frontend

---

### Step 7: Test the Connection

1. **Wait for both services to finish deploying** (2-5 minutes)

2. **Visit your frontend URL**
   - Try scanning a product
   - Check browser console for errors
   - Should see successful API calls to your backend

3. **Check Backend Logs**
   - Go to your backend service on Render
   - Click **"Logs"** tab
   - You should see incoming requests when you scan

---

## 🔍 Troubleshooting

### Backend Won't Start

**Check the logs:**
- Look for error messages
- Common issues:
  - Missing environment variables
  - Import errors
  - Port conflicts

**Fix:**
- Make sure all REQUIRED environment variables are set
- Check that `requirements.txt` has all dependencies
- Verify `Procfile` exists and has: `web: gunicorn app:app`

### CORS Errors

**Error:** `Access to fetch at '...' from origin '...' has been blocked by CORS policy`

**Fix:**
- Make sure `ALLOWED_ORIGINS` includes your frontend URL
- Format: `ALLOWED_ORIGINS=https://your-frontend.onrender.com`
- No trailing slash!
- Restart backend after changing

### 404 Errors on API Endpoints

**Error:** `Failed to load resource: the server responded with a status of 404`

**Fix:**
- Check that `VITE_API_URL` is set correctly in frontend
- Make sure backend URL doesn't have trailing slash
- Verify backend is actually running (check logs)

### Connection Refused

**Error:** `ERR_CONNECTION_REFUSED` or `net::ERR_CONNECTION_REFUSED`

**Fix:**
- Backend might be sleeping (free tier)
- Wait 30 seconds for it to wake up
- Or upgrade to paid plan for always-on

---

## 📝 Environment Variables Quick Reference

### Backend (Render)
```
SUPABASE_URL=...
SUPABASE_KEY=...
SUPABASE_SERVICE_KEY=...
FNSKU_API_KEY=...
RAINFOREST_API_KEY=...
ALLOWED_ORIGINS=https://your-frontend.onrender.com
FRONTEND_BASE_URL=https://your-frontend.onrender.com
FLASK_DEBUG=False
```

### Frontend (Render)
```
VITE_API_URL=https://your-backend.onrender.com
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## ✅ Success Checklist

After deployment, verify:

- [ ] Backend service shows "Live" status
- [ ] Frontend service shows "Live" status
- [ ] `VITE_API_URL` is set in frontend to backend URL
- [ ] `ALLOWED_ORIGINS` includes frontend URL
- [ ] Can scan products without errors
- [ ] Backend logs show incoming requests
- [ ] No CORS errors in browser console

---

## 🎉 You're Done!

Your backend is now running on Render and your frontend can connect to it. Both services will run 24/7 (or sleep on free tier and wake up when needed).

**Remember:**
- Backend URL: `https://your-backend.onrender.com`
- Frontend URL: `https://your-frontend.onrender.com`
- They communicate over the internet - no need for your computer!

