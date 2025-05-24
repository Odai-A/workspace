import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

const SuccessPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    toast.success('Subscription successful! Your account is being set up.');
    // Redirect to dashboard after a delay
    const timer = setTimeout(() => {
      navigate('/dashboard');
    }, 5000); // 5 second delay
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="container mx-auto px-4 py-12 text-center">
      <h1 className="text-3xl font-bold mb-4">Subscription Successful!</h1>
      <p className="mb-6">Your account is now being set up. You'll be redirected to your dashboard shortly.</p>
      <div className="animate-pulse mb-8">
        <div className="h-3 bg-blue-200 rounded w-32 mx-auto mb-2"></div>
        <div className="h-3 bg-blue-100 rounded w-24 mx-auto"></div>
      </div>
      <button
        onClick={() => navigate('/dashboard')}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Go to Dashboard
      </button>
    </div>
  );
};

export default SuccessPage; 