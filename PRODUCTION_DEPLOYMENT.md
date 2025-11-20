# Production Deployment Guide

## Environment Variables Setup

### Frontend (inventory_system/.env)
```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Backend API (REQUIRED for production)
VITE_BACKEND_URL=https://your-backend-domain.com
# OR
VITE_API_URL=https://your-backend-domain.com

# Optional APIs
VITE_FNSKU_API_KEY=your-fnsku-api-key
VITE_RAINFOREST_API_KEY=your-rainforest-api-key
VITE_F2A_BARCODE_API_KEY=your-f2a-api-key

# Stripe (if using)
VITE_STRIPE_STARTER_PLAN_PRICE_ID=price_xxx
VITE_STRIPE_PRO_PLAN_PRICE_ID=price_xxx
VITE_STRIPE_ENTERPRISE_PLAN_PRICE_ID=price_xxx
```

### Backend (.env in root)
```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-key
SUPABASE_SERVICE_KEY=your-service-key

# FNSKU API (REQUIRED - use backend to avoid frontend API limits)
FNSKU_API_KEY=your-fnsku-api-key

# Stripe
STRIPE_API_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_STARTER_PLAN_PRICE_ID=price_xxx
STRIPE_PRO_PLAN_PRICE_ID=price_xxx
STRIPE_ENTERPRISE_PLAN_PRICE_ID=price_xxx

# CORS (Production - comma-separated list)
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Server
FLASK_RUN_PORT=5000
FLASK_DEBUG=False
```

## Key Production Fixes

### 1. API Limit Issues
- **Problem**: FNSKU API has monthly limits
- **Solution**: Always use the backend server for FNSKU lookups
- **Why**: Backend can handle rate limiting and caching better

### 2. Hardcoded localhost URLs
- **Fixed**: All localhost URLs now use environment variables
- **Auto-detection**: Frontend automatically detects backend URL from current origin in production

### 3. CORS Configuration
- **Development**: Allows all origins (`*`)
- **Production**: Set `ALLOWED_ORIGINS` environment variable with your domain(s)

### 4. Error Handling
- **API Limits**: Now shows user-friendly error messages
- **Backend Connection**: Better error messages when backend is unavailable

## Deployment Checklist

### Frontend
- [ ] Set `VITE_BACKEND_URL` or `VITE_API_URL` to your production backend URL
- [ ] Set all Supabase environment variables
- [ ] Set optional API keys (Rainforest, etc.)
- [ ] Build: `npm run build` in `inventory_system/` directory
- [ ] Deploy `dist/` folder to your hosting (Vercel, Netlify, etc.)

### Backend
- [ ] Set `FNSKU_API_KEY` in backend `.env`
- [ ] Set `ALLOWED_ORIGINS` with your frontend domain(s)
- [ ] Set `FLASK_DEBUG=False` for production
- [ ] Deploy to hosting service (Heroku, Railway, Render, etc.)
- [ ] Ensure backend is always running (use process manager like PM2)

## Important Notes

1. **Always use backend for FNSKU API**: The frontend will try backend first, then fall back to direct API calls. For production, ensure backend is always available.

2. **API Key Security**: Never commit `.env` files. Use environment variables in your hosting platform.

3. **CORS**: In production, restrict CORS to only your frontend domain(s) for security.

4. **HTTPS**: Always use HTTPS in production for both frontend and backend.

5. **Rate Limiting**: The FNSKU API has monthly limits. Using the backend helps manage this better.

## Troubleshooting

### "API Monthly Limit Reached"
- **Solution**: Use the backend server for all FNSKU lookups
- **Why**: Backend can implement caching and rate limiting

### "Backend server is not running"
- **Solution**: Ensure backend is deployed and running
- **Check**: Verify `VITE_BACKEND_URL` points to your backend

### CORS Errors
- **Solution**: Set `ALLOWED_ORIGINS` in backend `.env` with your frontend domain

### Environment Variables Not Loading
- **Solution**: Restart your hosting service after setting environment variables
- **Check**: Verify variable names start with `VITE_` for frontend

