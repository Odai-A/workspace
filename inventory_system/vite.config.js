import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env variables based on mode (development, production)
  // Third parameter '' loads all env vars, not just VITE_ prefixed ones if needed
  const env = loadEnv(mode, process.cwd(), ''); 

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: env.VITE_BACKEND_URL || 'http://localhost:5000', // Fallback if not set
          changeOrigin: true,
          secure: false,
          // Removed rewrite rule: path => path.replace(/^\/api/, '') 
          // Now, a request to /api/ebay/listings will be forwarded as /api/ebay/listings to the target
        }
      }
    }
  }
})

// Confirmation Comment:
// With this Vite proxy config, and assuming VITE_BACKEND_URL is http://localhost:8000 (or 5000),
// a relative fetch call like fetch('/api/ebay/listings') from the frontend
// will be forwarded by the Vite dev server to http://<VITE_BACKEND_URL>/api/ebay/listings.
// Fetch calls that are already absolute, like fetch(`${import.meta.env.VITE_BACKEND_URL}/api/ebay/listings`),
// will bypass this proxy and go directly to the specified URL.
