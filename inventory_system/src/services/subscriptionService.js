import { supabase } from '../config/supabaseClient';
import { getApiEndpoint } from '../utils/apiConfig';

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

    // Use centralized API endpoint helper
    const endpoint = getApiEndpoint('/subscription-status');
    
    // Only log in development
    if (import.meta.env.DEV) {
      console.log('🔍 [Subscription Service] Fetching from:', endpoint);
    }

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      // Only log non-404 errors (404 is expected when backend isn't available)
      if (response.status !== 404 && import.meta.env.DEV) {
        console.warn('Failed to fetch subscription status:', response.status, response.statusText);
      }
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
    // Only log network errors in development (expected when backend is unavailable)
    if (import.meta.env.DEV && error.name !== 'TypeError') {
      console.warn('Error fetching subscription status:', error.message);
    }
    return { status: 'incomplete', hasActiveSubscription: false, subscriptionInfo: null };
  }
};

