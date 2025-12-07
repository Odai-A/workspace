import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabaseClient';
import PriceIdWarning from '../components/PriceIdWarning';
import { getApiEndpoint } from '../utils/apiConfig';

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
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  
  // Check if redirected from trial limit
  const isUpgradeRequired = searchParams.get('upgrade') === 'required';
  const upgradeMessage = location.state?.message || 'Your free trial has been used. Please upgrade to continue scanning.';
  const usedScans = location.state?.usedScans;
  const limit = location.state?.limit;

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

    // Check if the current user is CEO or admin (both have full access)
    const checkIfAdmin = async () => {
      if (!user) return;
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { user } = session;
          const appMetadata = user?.app_metadata || {};
          // Check both app_metadata and user table for CEO or admin role
          const userRole = appMetadata.role || appMetadata.roles?.[0];
          const isAdminFromMetadata = userRole === 'admin' || userRole === 'ceo';
          
          if (!isAdminFromMetadata) {
            // Also check users table
            const { data: userProfile } = await supabase
              .from('users')
              .select('role')
              .eq('id', user.id)
              .maybeSingle();
            
            const role = userProfile?.role;
            setIsAdmin(role === 'admin' || role === 'ceo' || false);
          } else {
            setIsAdmin(true);
          }
        }
      } catch (error) {
        console.error('Error checking admin/CEO status:', error);
      }
    };
    
    checkIfAdmin();
  }, [user]);

  const handleChoosePlan = async (priceId, planName) => {
    if (!priceId) {
      toast.error(`The ${planName} plan is not properly configured. Please contact the system administrator.`);
      return;
    }

    setIsLoading(true);
    toast.info(`Processing ${planName} plan subscription. Please wait...`);

    // Check if user is authenticated
    if (!user) {
      toast.error('Authentication required. Please log in to select a plan.');
      navigate('/login');
      setIsLoading(false);
      return;
    }

    // Get the current session from Supabase
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      toast.error('Your session has expired. Please log in again to continue.');
      navigate('/login');
      setIsLoading(false);
      return;
    }

    try {
      // Use centralized API endpoint helper
      const apiPath = getApiEndpoint('/create-checkout-session/');
        
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
          toast.error(`Invalid price configuration for ${planName} plan. Please contact the system administrator.`);
          console.error(`The price ID "${priceId}" does not exist in your Stripe account.`);
        } else if (errorMsg.includes('Stripe not configured') || errorMsg.includes('Server configuration error')) {
          toast.error('Payment system is not configured. Please contact support for assistance.');
        } else {
          toast.error(`Failed to initiate checkout process: ${errorMsg}`);
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
      
      {/* Show upgrade required message when redirected from trial limit */}
      {isUpgradeRequired && (
        <div className="mb-6 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg p-6 shadow-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-4 flex-1">
              <h3 className="text-xl font-bold text-red-800 dark:text-red-300 mb-2">
                Free Trial Limit Reached
              </h3>
              <p className="text-red-700 dark:text-red-400 mb-3">
                {upgradeMessage}
              </p>
              {usedScans !== undefined && limit !== undefined && (
                <p className="text-sm text-red-600 dark:text-red-500 font-semibold">
                  You've used {usedScans} out of {limit} free scans.
                </p>
              )}
              <p className="text-sm text-red-600 dark:text-red-500 mt-2">
                Choose a plan below to continue scanning and unlock unlimited access to all features.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Show the detailed warning only to admins */}
      {isAdmin && <PriceIdWarning priceIds={priceIdInfo} />}
      
      {/* Show simplified error to all users */}
      {configError && !isAdmin && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300 px-4 py-3 rounded mb-6" role="alert">
          <p className="font-bold">⚠️ Plans Coming Soon</p>
          <p>Subscription plans are being set up. Please check back soon or contact support for early access.</p>
        </div>
      )}
      
      {/* Show admin configuration message */}
      {configError && isAdmin && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 px-4 py-3 rounded mb-6" role="alert">
          <p className="font-bold">🔧 Admin: Stripe Configuration Required</p>
          <p className="text-sm mt-1">
            To enable subscriptions, add Stripe Price IDs to <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">inventory_system/.env</code>
          </p>
          <p className="text-sm mt-2">
            See <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">STRIPE_PRICING_SETUP.md</code> for instructions.
          </p>
        </div>
      )}
      
      <div className="grid md:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`border rounded-lg p-6 shadow-lg flex flex-col bg-white dark:bg-gray-800 ${
              plan.popular ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500 dark:ring-blue-400' : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            {plan.popular && (
              <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded-full self-start mb-3 font-semibold">
                POPULAR
              </div>
            )}
            <h2 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-white">{plan.name}</h2>
            <p className="text-4xl font-bold mb-1 text-gray-900 dark:text-white">{plan.price}<span className="text-lg font-normal">/mo</span></p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Billed monthly.</p>
            {plan.monthlyScans && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                  {plan.monthlyScans.toLocaleString()} scans/month included
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                  ${plan.overageRate} per additional scan
                </p>
              </div>
            )}
            <ul className="space-y-2 mb-8 flex-grow">
              {plan.features.map((feature, index) => (
                <li key={index} className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 dark:text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
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
              <p className="text-xs text-red-500 dark:text-red-400 mt-2 text-center">
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