# fnskutoasin.com Scanner Setup

This document explains the fnskutoasin.com external API scanner functionality that has been integrated into your inventory system.

## Overview

The external scanner allows you to scan FNSKU barcodes and lookup ASIN information using the fnskutoasin.com API service. This is separate from your internal inventory database and is designed to fetch ASIN data to help you research products on Amazon.

**Cost Optimization**: The system first checks your local database for the FNSKU before making any external API calls. This saves money on API charges for products you've already looked up.

## How It Works

1. **Scan or input FNSKU** - Use camera scanner or manual input
2. **Local database check** - System first searches your existing inventory for the FNSKU
3. **If found locally** - Returns data immediately without API charge
4. **If not found locally** - Makes fnskutoasin.com API call (charged)
5. **Auto-save** - External API results are optionally saved to local database for future use

## API Configuration

The API is pre-configured with:
- **Base URL**: `https://ato.fnskutoasin.com`
- **API Key**: `20a98a6a-437e-497c-b64c-ec97ec2fbc19`
- **Authentication**: Uses `apiKey` header

## API Workflow

The system uses a two-step approach:

1. **First**: Try to get existing scan data using `GET /api/v1/ScanTask/GetByBarCode`
2. **If not found**: Create new scan task using `POST /api/v1/ScanTask/AddOrGet`

This ensures you don't get charged multiple times for the same FNSKU lookup.

## Response Data

The fnskutoasin.com API provides:
- **ASIN** - Amazon Standard Identification Number
- **Scan Task ID** - Unique identifier for the scan task
- **Task State** - Current processing state
- **Assignment Date** - When the task was assigned/processed

## Features

### Cost Optimization Features
- **Local database first** - Checks existing inventory before API calls
- **Auto-save results** - External API results are saved locally for future use
- **Source indicators** - Shows whether data came from local database or external API
- **No duplicate charges** - Once looked up, FNSKU data is cached locally

### Scanner Features
- **Camera scanning** - Uses device camera to scan FNSKU barcodes
- **Manual input** - Allows manual entry of FNSKU for testing
- **Multi-camera support** - Can switch between available cameras

### Display Features
- **Product information** - Shows ASIN, title, price, image
- **Amazon link** - Direct link to Amazon product page
- **Source tracking** - Clear indication of data source (local vs external)
- **Cost indicators** - Visual feedback about whether API was charged
- **Error handling** - Clear error messages for API failures
- **Loading indicators** - Shows progress during API calls

## Auto-Save Behavior

When the external API returns product data, the system automatically saves it to your local database with:
- **Generated LPN**: Uses format `EXT-{FNSKU}` to indicate external source
- **Product details**: ASIN, title, price from external API
- **Future lookups**: Subsequent scans of the same FNSKU will use local data

This means you only pay for the first lookup of each unique FNSKU!

## Testing

1. Set up a test API endpoint or use a mock service
2. Configure the environment variables
3. Navigate to "External Scan" in the application
4. Test with both camera scanning and manual input

## Troubleshooting

### Common Issues

1. **"External API configuration missing"**
   - Make sure `EXTERNAL_API_URL` and `EXTERNAL_API_KEY` are set in your `.env` file

2. **"External API request failed"**
   - Check if your API endpoint is accessible
   - Verify your API key is correct
   - Check the API request format matches what your API expects

3. **"External API request timed out"**
   - Your API took longer than 30 seconds to respond
   - Check your API performance or increase timeout in the code

4. **Camera not working**
   - Ensure you're using HTTPS (required for camera access)
   - Grant camera permissions in your browser
   - Try different browsers if issues persist

### Debug Information

The application includes the raw API response in the `raw_data` field for debugging. Check the browser console for detailed error information.

## Security Notes

- Keep your API keys secure and never commit them to version control
- Use environment variables for sensitive configuration
- Consider implementing rate limiting if your API has usage limits
- Validate and sanitize FNSKU inputs to prevent injection attacks 