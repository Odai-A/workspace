# Backend Connection Fixes - Complete Summary

This document summarizes all the fixes made to ensure proper backend connection for both local development and Render deployment.

## ✅ Changes Completed

### 1. Centralized API URL Configuration

**Created:** `inventory_system/src/utils/apiConfig.js`

This utility provides a consistent way to get the backend API URL across the entire frontend application.

**Priority Order:**
1. `VITE_API_URL` environment variable (preferred)
2. `VITE_BACKEND_URL` environment variable (fallback)
3. Auto-detect from current origin in production
4. Default to `http://localhost:5000` for local development

**Functions:**
- `getApiUrl()` - Returns the base API URL
- `getApiEndpoint(endpoint)` - Returns the full URL for a specific endpoint

### 2. Frontend Files Updated

All frontend files now use the centralized API configuration:

- ✅ `inventory_system/src/services/subscriptionService.js`
- ✅ `inventory_system/src/services/api.js`
- ✅ `inventory_system/src/pages/Settings.jsx`
- ✅ `inventory_system/src/pages/PricingPage.jsx`
- ✅ `inventory_system/src/pages/CustomerDashboardPage.jsx`
- ✅ `inventory_system/src/components/Scanner.jsx`

**Changes:**
- Removed all hardcoded `http://localhost:5000` references
- Replaced with `getApiUrl()` and `getApiEndpoint()` from centralized config
- All `fetch()` calls now use the proper API endpoints

### 3. Flask Backend Updates

**File:** `app.py`

#### Port Configuration (Render Compatibility)
```python
# Before:
port = int(os.environ.get("FLASK_RUN_PORT", 5000))

# After:
port = int(os.environ.get("PORT", os.environ.get("FLASK_RUN_PORT", 5000)))
```

**Why:** Render uses the `PORT` environment variable, while local development can use `FLASK_RUN_PORT`.

#### CORS Configuration
```python
# Enhanced CORS configuration
allowed_origins_str = os.environ.get('ALLOWED_ORIGINS', '*')
frontend_base_url = os.environ.get('FRONTEND_BASE_URL', '')

# Build list of allowed origins
if allowed_origins_str == '*':
    allowed_origins = ['*']
else:
    allowed_origins = [origin.strip() for origin in allowed_origins_str.split(',') if origin.strip()]
    # Add FRONTEND_BASE_URL if it's set and not already in the list
    if frontend_base_url and frontend_base_url not in allowed_origins:
        allowed_origins.append(frontend_base_url.rstrip('/'))
```

**Features:**
- Supports `ALLOWED_ORIGINS` environment variable (comma-separated)
- Automatically includes `FRONTEND_BASE_URL` if set
- Development: allows all origins (`*`)
- Production: allows specific origins from environment variables

### 4. Vite Configuration

**File:** `inventory_system/vite.config.js`

Updated proxy configuration to prioritize `VITE_API_URL`:
```javascript
proxy: {
  '/api': {
    target: process.env.VITE_API_URL || process.env.VITE_BACKEND_URL || 'http://localhost:5000',
    changeOrigin: true,
    secure: false,
  }
}
```

### 5. Verified API Routes

All backend routes match frontend requests:

- ✅ `/api/scan` - Product scanning
- ✅ `/api/subscription-status` - Subscription status
- ✅ `/api/create-checkout-session/` - Stripe checkout
- ✅ `/api/create-customer-portal-session/` - Customer portal
- ✅ `/api/scan-count` - Scan count tracking
- ✅ `/api/external-lookup` - External API lookup
- ✅ `/api/contact-support` - Support messages

## 🚀 Deployment Configuration

### Render Backend Setup

**Environment Variables Required:**

```env
# Server (Render sets PORT automatically)
PORT=10000  # Render will override this, but good to have
FLASK_DEBUG=False

# CORS - Add your frontend URL
ALLOWED_ORIGINS=https://your-frontend.onrender.com
FRONTEND_BASE_URL=https://your-frontend.onrender.com

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# External APIs
FNSKU_API_KEY=your-fnsku-api-key
RAINFOREST_API_KEY=your-rainforest-api-key

# Stripe
STRIPE_API_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_STARTER_PLAN_PRICE_ID=price_xxx
STRIPE_PRO_PLAN_PRICE_ID=price_xxx
STRIPE_ENTERPRISE_PLAN_PRICE_ID=price_xxx
```

**Procfile:**
```
web: gunicorn app:app
```

### Render Frontend Setup

**Environment Variables Required:**

```env
# Backend API URL (REQUIRED)
VITE_API_URL=https://your-backend.onrender.com

# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Stripe (if using)
VITE_STRIPE_STARTER_PLAN_PRICE_ID=price_xxx
VITE_STRIPE_PRO_PLAN_PRICE_ID=price_xxx
VITE_STRIPE_ENTERPRISE_PLAN_PRICE_ID=price_xxx
```

## 🔍 Testing

### Local Development

1. **Backend:**
   ```bash
   python app.py
   # Should start on http://0.0.0.0:5000
   ```

2. **Frontend:**
   ```bash
   cd inventory_system
   npm run dev
   # Should start on http://localhost:5174
   # Proxy will forward /api requests to backend
   ```

3. **Verify:**
   - Frontend can make API calls to backend
   - Check browser console for API URLs
   - Verify CORS headers in network tab

### Production Deployment

1. **Backend on Render:**
   - Set all environment variables
   - Deploy from repository
   - Verify backend URL (e.g., `https://your-backend.onrender.com`)

2. **Frontend on Render:**
   - Set `VITE_API_URL` to your backend URL
   - Set all other environment variables
   - Deploy from repository
   - Verify frontend can connect to backend

## 📝 Notes

- All `localhost:5000` references have been replaced with environment variable-based configuration
- The centralized API config automatically handles both development and production scenarios
- CORS is properly configured to allow the frontend URL in production
- Backend uses `PORT` environment variable for Render compatibility
- All API routes have been verified to match frontend requests

## 🐛 Troubleshooting

### Frontend can't connect to backend

1. Check `VITE_API_URL` is set correctly
2. Verify backend is running and accessible
3. Check CORS configuration in backend
4. Verify `ALLOWED_ORIGINS` includes your frontend URL

### CORS errors in production

1. Set `ALLOWED_ORIGINS` environment variable in backend
2. Include your frontend URL (comma-separated if multiple)
3. Or set `FRONTEND_BASE_URL` which will be automatically added
4. Restart backend after changing environment variables

### Backend not starting on Render

1. Verify `PORT` environment variable is set (Render sets this automatically)
2. Check `Procfile` contains: `web: gunicorn app:app`
3. Verify `gunicorn` is in `requirements.txt`
4. Check Render logs for errors

