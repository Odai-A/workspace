import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabaseClient';
import PriceIdWarning from '../components/PriceIdWarning';

// Get API URL from environment or detect from current origin for production
const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      return origin.replace(/:\d+$/, ':5000');
    }
  }
  return 'http://localhost:5000'; // Fallback for local development
};
const API_URL = getApiUrl();

// Price IDs from environment variables with validation
const getValidPriceId = (envVar, fallback = null) => {
  const priceId = import.meta.env[envVar];
  // Allow test price IDs (price_50, price_100, price_250) that match our .env values
  if (!priceId || priceId === 'undefined' || priceId.includes('your_')) {
    // Only log warning in development mode to reduce console noise
    if (import.meta.env.DEV) {
      console.warn(`Invalid Stripe price ID for ${envVar}: "${priceId}"`);
    }
    return fallback;
  }
  return priceId;
};

const plans = [
  {
    id: 'basic',
    name: 'Basic',
    price: '$150',
    price_id: getValidPriceId('VITE_STRIPE_BASIC_PLAN_PRICE_ID'),
    monthlyScans: 1000,
    overageRate: 0.11,
    features: [
      '1,000 scans per month included',
      '$0.11 per additional scan',
      'Full inventory management',
      'Product scanning & lookup',
      'Basic reporting',
      'Email support',
    ],
    cta: 'Choose Basic',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$300',
    price_id: getValidPriceId('VITE_STRIPE_PRO_PLAN_PRICE_ID'),
    monthlyScans: 5000,
    overageRate: 0.11,
    features: [
      '5,000 scans per month included',
      '$0.11 per additional scan',
      'All Basic features',
      'Advanced reporting & analytics',
      'API access',
      'Priority email support',
      'Custom integrations',
    ],
    cta: 'Choose Pro',
    popular: true,
  },
  {
    id: 'entrepreneur',
    name: 'Entrepreneur',
    price: '$500',
    price_id: getValidPriceId('VITE_STRIPE_ENTREPRENEUR_PLAN_PRICE_ID'),
    monthlyScans: 20000,
    overageRate: 0.11,
    features: [
      '20,000 scans per month included',
      '$0.11 per additional scan',
      'All Pro features',
      'Unlimited team members',
      'Dedicated account manager',
      '24/7 priority support',
      'Custom features & integrations',
      'SLA guarantee',
    ],
    cta: 'Choose Entrepreneur',
  },
];

const PricingPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [configError, setConfigError] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    // Check if any plans have valid price IDs
    const hasValidPrices = plans.some(plan => !!plan.price_id);
    if (!hasValidPrices) {
      setConfigError(true);
      // Only show error toast to admins, regular users see the config error message
      if (import.meta.env.DEV) {
        console.warn('⚠️ Stripe Price IDs not configured. Add them to inventory_system/.env file');
      }
    }

    // Check if the current user is an admin
    const checkIfAdmin = async () => {
      if (!user) return;
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { user } = session;
          const appMetadata = user?.app_metadata || {};
          // Check both app_metadata and user table for admin role
          const isAdminFromMetadata = appMetadata.roles?.includes('admin') || appMetadata.role === 'admin';
          
          if (!isAdminFromMetadata) {
            // Also check users table
            const { data: userProfile } = await supabase
              .from('users')
              .select('role')
              .eq('id', user.id)
              .maybeSingle();
            
            setIsAdmin(userProfile?.role === 'admin' || false);
          } else {
            setIsAdmin(true);
          }
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };
    
    checkIfAdmin();
  }, [user]);

  const handleChoosePlan = async (priceId, planName) => {
    if (!priceId) {
      toast.error(`The ${planName} plan is not properly configured. Please contact the administrator.`);
      return;
    }

    setIsLoading(true);
    toast.info(`Processing ${planName} plan...`);

    // Check if user is authenticated
    if (!user) {
      toast.error('Please log in to choose a plan.');
      navigate('/login');
      setIsLoading(false);
      return;
    }

    // Get the current session from Supabase
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      toast.error('Your session has expired. Please log in again.');
      navigate('/login');
      setIsLoading(false);
      return;
    }

    try {
      // Check if API_URL already ends with /api to avoid duplicate /api in the path
      const apiPath = API_URL.endsWith('/api') 
        ? `${API_URL}/create-checkout-session/`
        : `${API_URL}/api/create-checkout-session/`;
        
      console.log(`🔄 Creating Stripe checkout session for ${planName}...`);
      console.log(`📍 API Endpoint: ${apiPath}`);
      console.log(`💰 Price ID: ${priceId}`);
      
      const response = await fetch(apiPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ price_id: priceId }),
      });

      console.log('📡 Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMsg = errorData.error || `Server error: ${response.status}`;
        console.error('❌ Checkout error:', errorMsg);
        
        // Special handling for price ID errors
        if (errorMsg.includes('No such price') || errorMsg.includes('Invalid price')) {
          toast.error(`Invalid price configuration for ${planName} plan. Please contact the administrator.`);
          console.error(`The price ID "${priceId}" does not exist in your Stripe account.`);
        } else if (errorMsg.includes('Stripe not configured') || errorMsg.includes('Server configuration error')) {
          toast.error('Payment system is not configured. Please contact support.');
        } else {
          toast.error(`Failed to start checkout: ${errorMsg}`);
        }
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      console.log('✅ Checkout session created:', data);

      if (data.checkout_url) {
        console.log('🔗 Redirecting to Stripe Checkout...');
        // Redirect to Stripe Checkout where customer enters card info
        window.location.href = data.checkout_url;
        // Note: setIsLoading(false) won't run because page is redirecting
      } else {
        console.error('❌ No checkout URL in response:', data);
        toast.error('Failed to create checkout session. Please try again.');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('❌ Subscription error:', error);
      
      // Handle network errors
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        toast.error('Cannot connect to payment server. Please check your connection and try again.');
      } else {
        toast.error(`An error occurred: ${error.message}`);
      }
      setIsLoading(false);
    }
  };

  // Price ID information for admin warning
  const priceIdInfo = [
    { id: 'basic', name: 'Basic Plan', value: import.meta.env.VITE_STRIPE_BASIC_PLAN_PRICE_ID },
    { id: 'pro', name: 'Pro Plan', value: import.meta.env.VITE_STRIPE_PRO_PLAN_PRICE_ID },
    { id: 'entrepreneur', name: 'Entrepreneur Plan', value: import.meta.env.VITE_STRIPE_ENTREPRENEUR_PLAN_PRICE_ID }
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-center mb-4">Choose Your Plan</h1>
      <p className="text-xl text-gray-600 text-center mb-10">
        Start with a plan that suits your needs.
      </p>
      
      {/* Show the detailed warning only to admins */}
      {isAdmin && <PriceIdWarning priceIds={priceIdInfo} />}
      
      {/* Show simplified error to all users */}
      {configError && !isAdmin && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-6" role="alert">
          <p className="font-bold">⚠️ Plans Coming Soon</p>
          <p>Subscription plans are being set up. Please check back soon or contact support for early access.</p>
        </div>
      )}
      
      {/* Show admin configuration message */}
      {configError && isAdmin && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded mb-6" role="alert">
          <p className="font-bold">🔧 Admin: Stripe Configuration Required</p>
          <p className="text-sm mt-1">
            To enable subscriptions, add Stripe Price IDs to <code className="bg-blue-100 px-1 rounded">inventory_system/.env</code>
          </p>
          <p className="text-sm mt-2">
            See <code className="bg-blue-100 px-1 rounded">STRIPE_PRICING_SETUP.md</code> for instructions.
          </p>
        </div>
      )}
      
      <div className="grid md:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`border rounded-lg p-6 shadow-lg flex flex-col ${
              plan.popular ? 'border-blue-500 ring-2 ring-blue-500' : 'border-gray-300'
            }`}
          >
            {plan.popular && (
              <div className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full self-start mb-3 font-semibold">
                POPULAR
              </div>
            )}
            <h2 className="text-2xl font-semibold mb-2">{plan.name}</h2>
            <p className="text-4xl font-bold mb-1">{plan.price}<span className="text-lg font-normal">/mo</span></p>
            <p className="text-sm text-gray-500 mb-2">Billed monthly.</p>
            {plan.monthlyScans && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-semibold text-blue-900">
                  {plan.monthlyScans.toLocaleString()} scans/month included
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  ${plan.overageRate} per additional scan
                </p>
              </div>
            )}
            <ul className="space-y-2 mb-8 flex-grow">
              {plan.features.map((feature, index) => (
                <li key={index} className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleChoosePlan(plan.price_id, plan.name)}
              disabled={isLoading || !plan.price_id}
              className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors ${
                isLoading || !plan.price_id
                  ? 'bg-gray-400 cursor-not-allowed'
                  : plan.popular
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-700 hover:bg-gray-800'
              }`}
            >
              {isLoading ? 'Processing...' : plan.cta}
            </button>
            {!plan.price_id && (
              <p className="text-xs text-red-500 mt-2 text-center">
                Price ID not configured. Please contact the administrator.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PricingPage; 