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
    console.warn(`Invalid Stripe price ID for ${envVar}: "${priceId}"`);
    return fallback;
  }
  return priceId;
};

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$10',
    price_id: getValidPriceId('VITE_STRIPE_STARTER_PLAN_PRICE_ID'),
    features: ['Feature A', 'Feature B', 'Feature C'],
    cta: 'Choose Starter',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$25',
    price_id: getValidPriceId('VITE_STRIPE_PRO_PLAN_PRICE_ID'),
    features: ['All Starter Features', 'Feature D', 'Feature E'],
    cta: 'Choose Pro',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$50',
    price_id: getValidPriceId('VITE_STRIPE_ENTERPRISE_PLAN_PRICE_ID'),
    features: ['All Pro Features', 'Feature F', 'Dedicated Support'],
    cta: 'Choose Enterprise',
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
      toast.error('Subscription plans are not properly configured. Please contact the administrator.');
    }

    // Check if the current user is an admin
    const checkIfAdmin = async () => {
      if (!user) return;
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { user } = session;
          const appMetadata = user?.app_metadata || {};
          setIsAdmin(appMetadata.roles?.includes('admin') || false);
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
        
      console.log(`Sending request to ${apiPath} with price ID: ${priceId}`);
      const response = await fetch(apiPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ price_id: priceId }),
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (response.ok && data.checkout_url) {
        window.location.href = data.checkout_url; // Redirect to Stripe Checkout
      } else {
        const errorMsg = data.error || 'Failed to create checkout session.';
        console.error('Checkout error:', errorMsg);
        
        // Special handling for price ID errors
        if (errorMsg.includes('No such price')) {
          toast.error(`Invalid price configuration for ${planName} plan. Please contact the administrator.`);
          console.error(`The price ID "${priceId}" does not exist in your Stripe account.`);
        } else {
          toast.error(errorMsg);
        }
      }
    } catch (error) {
      console.error('Subscription error:', error);
      toast.error('An error occurred while setting up your subscription.');
    } finally {
      setIsLoading(false);
    }
  };

  // Price ID information for admin warning
  const priceIdInfo = [
    { id: 'starter', name: 'Starter Plan', value: import.meta.env.VITE_STRIPE_STARTER_PLAN_PRICE_ID },
    { id: 'pro', name: 'Pro Plan', value: import.meta.env.VITE_STRIPE_PRO_PLAN_PRICE_ID },
    { id: 'enterprise', name: 'Enterprise Plan', value: import.meta.env.VITE_STRIPE_ENTERPRISE_PLAN_PRICE_ID }
  ];

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-center mb-4">Choose Your Plan</h1>
      <p className="text-xl text-gray-600 text-center mb-10">
        Start with a plan that suits your needs.
      </p>
      
      {/* Show the detailed warning only to admins */}
      {isAdmin && <PriceIdWarning priceIds={priceIdInfo} />}
      
      {/* Show simplified error to all users */}
      {configError && !isAdmin && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6" role="alert">
          <p className="font-bold">Configuration Error</p>
          <p>Subscription plans are not properly configured. Please contact the administrator.</p>
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
            <p className="text-sm text-gray-500 mb-6">Billed monthly.</p>
            <ul className="space-y-2 mb-8 flex-grow">
              {plan.features.map((feature, index) => (
                <li key={index} className="flex items-center">
                  <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {feature}
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