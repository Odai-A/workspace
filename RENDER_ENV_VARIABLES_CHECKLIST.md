# 📋 Render Environment Variables Checklist

Use this checklist when setting up your backend on Render. Copy and paste each variable.

---

## 🔴 REQUIRED - Supabase (Must Have)

```
SUPABASE_URL=https://your-project.supabase.co
```
```
SUPABASE_KEY=your-anon-key-here
```
```
SUPABASE_SERVICE_KEY=your-service-role-key-here
```

**Where to find:**
- Go to Supabase Dashboard → Project Settings → API
- `SUPABASE_URL` = Project URL
- `SUPABASE_KEY` = anon/public key
- `SUPABASE_SERVICE_KEY` = service_role key (keep secret!)

---

## 🔴 REQUIRED - External APIs (Must Have for Scanning)

```
FNSKU_API_KEY=your-fnsku-api-key-here
```
```
RAINFOREST_API_KEY=your-rainforest-api-key-here
```

**Where to find:**
- Check your local `.env` file
- Or your API provider dashboard

---

## 🔴 REQUIRED - CORS (Must Have for Production)

```
ALLOWED_ORIGINS=https://your-frontend.onrender.com
```

**Important:** 
- Replace `your-frontend.onrender.com` with your actual frontend URL
- No trailing slash!
- If you have multiple frontend URLs, separate with commas:
  ```
  ALLOWED_ORIGINS=https://your-frontend.onrender.com,https://www.yourdomain.com
  ```

```
FRONTEND_BASE_URL=https://your-frontend.onrender.com
```

**Important:**
- Replace with your actual frontend URL
- No trailing slash!

---

## 🟡 OPTIONAL - Stripe (Only if Using Subscriptions)

If you're using Stripe for subscriptions, add these:

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

**Where to find:**
- Stripe Dashboard → Developers → API keys
- Stripe Dashboard → Products → Your Plans → Price IDs

**Note:** Use `sk_live_` and `pk_live_` for production, `sk_test_` and `pk_test_` for testing

---

## 🟢 OPTIONAL - Server Settings

```
FLASK_DEBUG=False
```
```
FLASK_RUN_PORT=5000
```

**Note:** Render automatically sets `PORT`, but `FLASK_RUN_PORT` is good to have as fallback.

---

## 📝 Quick Copy-Paste Template

Copy this entire block and fill in your values:

```
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_KEY=
FNSKU_API_KEY=
RAINFOREST_API_KEY=
ALLOWED_ORIGINS=https://your-frontend.onrender.com
FRONTEND_BASE_URL=https://your-frontend.onrender.com
FLASK_DEBUG=False
FLASK_RUN_PORT=5000
```

---

## ✅ After Adding Variables

1. Click **"Save Changes"** in Render
2. Render will automatically redeploy
3. Wait 2-5 minutes for deployment to complete
4. Check logs to verify everything started correctly

---

## 🔍 How to Verify Variables Are Set

1. Go to your backend service on Render
2. Click **"Environment"** tab
3. You should see all your variables listed
4. Check that values are correct (they'll be hidden for security)

---

## ⚠️ Important Notes

- **Never commit `.env` files to Git** - they contain secrets!
- **Use Render's Environment Variables** - they're secure and encrypted
- **Double-check URLs** - no trailing slashes, include `https://`
- **CORS must match exactly** - `ALLOWED_ORIGINS` must include your frontend URL

