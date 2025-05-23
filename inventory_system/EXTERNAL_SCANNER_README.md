# External Scanner Setup - fnskutoasin.com Integration

## Overview

Your React inventory system now includes external scanner functionality that integrates with the fnskutoasin.com API. This feature provides cost-effective product lookups by:

1. **First checking your local database** - No API charges
2. **Using external API only when needed** - Charged lookups
3. **Auto-saving external results** - Future lookups are free

## How It Works

### Cost-Saving Strategy
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ 1. Scan FNSKU   │ -> │ Check Local DB   │ -> │ Found? Return   │
│                 │    │ (FREE)           │    │ (NO CHARGE)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                 │
                                 v No
                       ┌──────────────────┐    ┌─────────────────┐
                       │ Call External    │ -> │ Save to Local   │
                       │ API (CHARGED)    │    │ for Future      │
                       └──────────────────┘    └─────────────────┘
```

### Visual Indicators
- 🟢 **Green Banner**: Found in local database - No charge
- 🟡 **Yellow Banner**: Retrieved from external API - Charged
- 🔵 **Blue Banner**: Mock data - No charge

## Setup Instructions

### 1. Environment Configuration
Create a `.env` file in the `inventory_system` directory:

```bash
# External API Configuration
VITE_FNSKU_API_BASE_URL=https://ato.fnskutoasin.com
VITE_FNSKU_API_KEY=20a98a6a-437e-497c-b64c-ec97ec2fbc19

# Development Settings
VITE_USE_MOCK_DATA=false
VITE_NODE_ENV=development
```

### 2. Start Your React App
```bash
cd inventory_system
npm run dev
```

### 3. Access Your Local Scanner
Open your browser to: `http://localhost:3000` (or whatever port Vite shows)

## Testing the External Scanner

### Test Scenario 1: Local Database Hit (No Charge)
1. Scan or manually enter an FNSKU that exists in your local database
2. You should see: 🟢 "Found in local database - No API charge"

### Test Scenario 2: External API Call (Charged)
1. Scan or manually enter a new FNSKU that doesn't exist locally
2. You should see: 💰 "Checking external API (this will be charged)..."
3. Then: 🟡 "Retrieved from fnskutoasin.com API - Charged lookup"
4. Future scans of the same FNSKU will be free!

### Test Scenario 3: Future Lookup (No Charge)
1. Scan the same FNSKU from Test Scenario 2 again
2. You should see: 🟢 "Found in local database - No API charge"
3. This proves the cost-saving feature is working!

## Features

### Scanner Capabilities
- **Camera scanning** - Use device camera to scan barcodes
- **Manual input** - Type FNSKU manually for testing
- **Multi-camera support** - Switch between available cameras
- **Scan history** - Track recent scans

### Cost Tracking
- **Visual indicators** - See if lookup was charged or free
- **Smart caching** - External results saved for future use
- **Source tracking** - Know where data came from
- **Toast notifications** - Real-time feedback on charges

### Product Information Display
- **ASIN lookup** - Get Amazon ASIN from FNSKU
- **Amazon links** - Direct links to product pages
- **Product details** - Display available product information
- **Cost status** - Clear indication of charges

## API Details

### Endpoints Used
- `GET /api/v1/ScanTask/GetByBarCode` - Check existing scans
- `POST /api/v1/ScanTask/AddOrGet` - Create new scan tasks

### API Key
The API key `20a98a6a-437e-497c-b64c-ec97ec2fbc19` is currently hardcoded but can be moved to environment variables for production.

## Troubleshooting

### "External API lookup failed"
- Check your internet connection
- Verify API key is correct
- Check fnskutoasin.com service status

### "Could not save to local database"
- Check Supabase connection
- Verify database permissions
- Check console for detailed errors

### Mock Data Appearing
- Set `VITE_USE_MOCK_DATA=false` in your .env file
- Restart your development server

## Cost Management

### Monitoring Usage
- Watch for yellow banners indicating charged lookups
- Check browser console for detailed API call logs
- Track which FNSKUs are being looked up externally

### Best Practices
- Build up your local database over time
- Avoid repeated external lookups of the same FNSKU
- Use mock data for testing when possible

## Production Deployment

When deploying to production:
1. Move API keys to secure environment variables
2. Set `VITE_USE_MOCK_DATA=false`
3. Configure proper error handling
4. Set up monitoring for API usage costs

---

**Need Help?** Check the browser console for detailed logs of the lookup process. 