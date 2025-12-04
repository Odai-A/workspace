import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
// import { useAuth } from '../contexts/AuthContext'; // Your existing AuthContext
import { getApiEndpoint } from '../utils/apiConfig';

const CustomerDashboardPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState(null); 
  // const { user } = useAuth(); // Assuming this gives you the logged-in user
  const navigate = useNavigate();

  // TODO: Fetch current subscription details from your backend, which in turn gets it from Supabase `tenants` table
  // useEffect(() => {
  //   const fetchSubscriptionInfo = async () => {
  //     // ... get auth token ...
  //     // const response = await fetch(`${API_URL}/api/my-subscription`, { headers: { 'Authorization': ... } });
  //     // const data = await response.json();
  //     // setSubscriptionInfo(data);
  //   };
  //   if (user) fetchSubscriptionInfo();
  // }, [user]);

  const handleManageSubscription = async () => {
    setIsLoading(true);
    toast.info('Redirecting to customer portal...');
    
    const authToken = localStorage.getItem('supabase.auth.token'); // Or however you store your JWT
    if (!authToken) {
        toast.error('Authentication token not found. Please log in again.');
        setIsLoading(false);
        navigate('/login');
        return;
    }

    try {
      const response = await fetch(getApiEndpoint('/create-customer-portal-session/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${JSON.parse(authToken).access_token}`,
        },
      });
      const data = await response.json();
      if (response.ok && data.portal_url) {
        window.location.href = data.portal_url;
      } else {
        toast.error(data.error || 'Failed to open customer portal.');
      }
    } catch (error) {
      console.error('Portal error:', error);
      toast.error('An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  // Dummy data until backend endpoint for subscription info is ready
  useEffect(() => {
    setSubscriptionInfo({
        plan_name: 'Pro Plan (Example)',
        status: 'active',
        next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        // features: ['Feature 1', 'Feature 2']
    });
  }, []);


  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-6">Subscription Dashboard</h1>
      {subscriptionInfo ? (
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-2">Your Current Plan: {subscriptionInfo.plan_name}</h2>
          <p className="mb-1">Status: <span className={`font-semibold ${subscriptionInfo.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>{subscriptionInfo.status}</span></p>
          <p className="mb-4">Next Billing Date: {subscriptionInfo.next_billing_date}</p>
          
          {/* Feature list could be displayed here if available */}
          {/* <h3 className="text-lg font-medium mb-2">Features:</h3>
          <ul className="list-disc list-inside mb-6">
            {subscriptionInfo.features?.map(f => <li key={f}>{f}</li>)}
          </ul> */} 

          <button
            onClick={handleManageSubscription}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:bg-gray-400"
          >
            {isLoading ? 'Processing...' : 'Manage Subscription (Billing, Invoices, Cancel)'}
          </button>
          <p className="text-sm text-gray-500 mt-2">You will be redirected to Stripe to manage your subscription.</p>

        </div>
      ) : (
        <p>Loading subscription details...</p> // Or a proper loading spinner
      )}
    </div>
  );
};

export default CustomerDashboardPage; 