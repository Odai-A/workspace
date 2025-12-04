/**
 * Centralized API URL configuration
 * This utility provides a consistent way to get the backend API URL
 * across the entire frontend application.
 * 
 * Priority order:
 * 1. VITE_API_URL environment variable (preferred)
 * 2. VITE_BACKEND_URL environment variable (fallback)
 * 3. Auto-detect from current origin in production
 * 4. Default to localhost:5000 for local development
 */

/**
 * Get the backend API base URL
 * @returns {string} The base URL of the backend API (without trailing slash)
 */
export const getApiUrl = () => {
  // Priority 1: VITE_API_URL (preferred)
  if (import.meta.env.VITE_API_URL) {
    const url = import.meta.env.VITE_API_URL.trim();
    return url.replace(/\/+$/, ''); // Remove trailing slashes
  }

  // Priority 2: VITE_BACKEND_URL (fallback)
  if (import.meta.env.VITE_BACKEND_URL) {
    const url = import.meta.env.VITE_BACKEND_URL.trim();
    return url.replace(/\/+$/, ''); // Remove trailing slashes
  }

  // Priority 3: Auto-detect from current origin in production
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    // If not localhost, try to detect backend URL
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      // For Render deployments, backend is typically on a different subdomain
      // Try common patterns: api.yourdomain.com or yourdomain.onrender.com
      // For now, we'll use the same origin and let the proxy handle it
      // Or if backend is on a different subdomain, user should set VITE_API_URL
      return origin; // Use same origin, proxy will handle /api routes
    }
  }

  // Priority 4: Default to localhost:5000 for local development
  return 'http://localhost:5000';
};

/**
 * Get the full API endpoint URL
 * @param {string} endpoint - The API endpoint path (e.g., '/api/scan')
 * @returns {string} The full URL to the API endpoint
 */
export const getApiEndpoint = (endpoint) => {
  const baseUrl = getApiUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // If baseUrl already contains /api, don't add it again
  if (baseUrl.includes('/api') && cleanEndpoint.startsWith('/api')) {
    return `${baseUrl}${cleanEndpoint}`;
  }
  
  // If endpoint doesn't start with /api, add it
  if (!cleanEndpoint.startsWith('/api')) {
    return `${baseUrl}/api${cleanEndpoint}`;
  }
  
  return `${baseUrl}${cleanEndpoint}`;
};

/**
 * Default API URL constant for convenience
 * Use this when you need the base URL without an endpoint
 */
export const API_URL = getApiUrl();

