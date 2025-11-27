import { supabase } from '../config/supabaseClient';

// Get API URL from environment or detect from current origin for production
const getApiUrl = () => {
  let url = '';
  if (import.meta.env.VITE_API_URL) {
    url = import.meta.env.VITE_API_URL;
  } else if (import.meta.env.VITE_BACKEND_URL) {
    url = import.meta.env.VITE_BACKEND_URL;
  } else if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      url = origin.replace(/:\d+$/, ':5000');
    } else {
      url = 'http://localhost:5000';
    }
  } else {
    url = 'http://localhost:5000';
  }
  
  // Remove trailing slash and /api if present to avoid double /api/api/
  // Handle both /api and /api/ cases
  url = url.replace(/\/+$/, '').replace(/\/api\/?$/, '');
  return url;
};
const API_URL = getApiUrl();

/**
 * Get the current user's subscription status
 * @returns {Promise<{status: string, hasActiveSubscription: boolean, subscriptionInfo: object|null}>}
 */
export const getSubscriptionStatus = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { status: 'incomplete', hasActiveSubscription: false, subscriptionInfo: null };
    }

    // Build URL - ensure we don't have double /api/
    let baseUrl = API_URL;
    // Remove any trailing /api to avoid double /api/api/
    baseUrl = baseUrl.replace(/\/api\/?$/, '');
    const endpoint = `${baseUrl}/api/subscription-status`;
    
    console.log('🔍 [Subscription Service] Fetching from:', endpoint);
    console.log('🔍 [Subscription Service] Base URL was:', API_URL);

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch subscription status:', response.statusText);
      return { status: 'incomplete', hasActiveSubscription: false, subscriptionInfo: null };
    }

    const data = await response.json();
    const status = data.subscription_status || 'incomplete';
    const hasActiveSubscription = ['active', 'trialing'].includes(status);
    
    return {
      status,
      hasActiveSubscription,
      subscriptionInfo: data,
    };
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    return { status: 'incomplete', hasActiveSubscription: false, subscriptionInfo: null };
  }
};

