# Quick Start: Running the Backend for Fast Scans

## 🚀 Quick Start (Windows)

### Option 1: Using the Batch File (Easiest)
```bash
# Double-click or run:
start_backend.bat
```

### Option 2: Using Command Line
```bash
# Open PowerShell or Command Prompt in the workspace directory
python app.py
```

### Option 3: Using Flask CLI
```bash
flask run
# OR with specific port:
flask run --port 5000
```

## 📋 Prerequisites

### 1. Install Python Dependencies
Make sure you have all required packages:
```bash
pip install -r requirements.txt
```

### 2. Set Up Environment Variables
Create or update `.env` file in the root directory with:

```env
# REQUIRED for scanning
FNSKU_API_KEY=your-fnsku-api-key-here
RAINFOREST_API_KEY=your-rainforest-api-key-here

# REQUIRED for database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-role-key-here

# Optional: Flask settings
FLASK_RUN_PORT=5000
FLASK_DEBUG=True
```

## ✅ Verify Backend is Running

1. **Check the console output:**
   ```
   Starting Flask app on port 5000 with debug mode: True
   * Running on http://0.0.0.0:5000
   ```

2. **Test the endpoint:**
   Open browser: `http://localhost:5000/api/scan`
   (Should return an error about missing code, which is expected)

3. **Or test with curl:**
   ```bash
   curl -X POST http://localhost:5000/api/scan \
     -H "Content-Type: application/json" \
     -d '{"code":"TEST123","user_id":"test-user"}'
   ```

## 🔧 Troubleshooting

### Port Already in Use
If port 5000 is busy:
```bash
# Option 1: Change port in .env
FLASK_RUN_PORT=5001

# Option 2: Kill process using port 5000 (Windows)
netstat -ano | findstr :5000
taskkill /PID <PID_NUMBER> /F
```

### Missing Dependencies
```bash
pip install Flask Flask-CORS requests python-dotenv supabase stripe pandas
```

### Environment Variables Not Loading
- Make sure `.env` file is in the root directory (same folder as `app.py`)
- Check that variable names match exactly (case-sensitive)
- Restart the backend after changing `.env`

### API Key Errors
- Verify `FNSKU_API_KEY` and `RAINFOREST_API_KEY` are set in `.env`
- Check that keys are valid and not expired
- Backend will log errors if keys are missing

## 🎯 Testing the Fast Scan

1. **Start Backend:**
   ```bash
   python app.py
   ```

2. **Start Frontend** (in another terminal):
   ```bash
   cd inventory_system
   npm run dev
   ```

3. **Test Scan:**
   - Open frontend in browser (usually `http://localhost:5173`)
   - Scan an FNSKU
   - Should get complete product data in ONE scan!

## 📊 Expected Backend Logs

When scanning, you should see:
```
💰 FNSKU X003FVMFXR not in cache - calling FNSKU API (will be charged)
✅ Created scan task 1516290 for FNSKU X003FVMFXR
⏳ ASIN not immediately available. Polling for task 1516290...
🔄 Retrying AddOrGet to trigger processing (attempt 2)...
🎉 ASIN found after 3 polls: B0BF5S44Z3
📦 Fetching product data from Rainforest API for ASIN B0BF5S44Z3...
✅ Rainforest API data retrieved for ASIN B0BF5S44Z3
✅ Saved new cache entry for FNSKU X003FVMFXR
```

## 🛑 Stopping the Backend

Press `Ctrl+C` in the terminal where the backend is running.

