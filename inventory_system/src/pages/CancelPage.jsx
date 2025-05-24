import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

const CancelPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    toast.info('Subscription process was canceled.');
  }, []);

  return (
    <div className="container mx-auto px-4 py-12 text-center">
      <h1 className="text-3xl font-bold mb-4">Subscription Canceled</h1>
      <p className="mb-6">Your subscription process was canceled. You can try again whenever you're ready.</p>
      <div className="flex justify-center space-x-4">
        <button
          onClick={() => navigate('/pricing')}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          View Plans
        </button>
        <button
          onClick={() => navigate('/')}
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
        >
          Go Home
        </button>
      </div>
    </div>
  );
};

export default CancelPage; 