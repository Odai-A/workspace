import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const DebugInfo = () => {
  const [expanded, setExpanded] = useState(false);
  const { user, isAuthenticated, loading } = useAuth();

  if (!expanded) {
    return (
      <button 
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-lg opacity-70 hover:opacity-100 z-50"
      >
        Debug Info
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 text-white p-4 rounded-lg shadow-lg max-w-sm z-50">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold">Debug Information</h3>
        <button 
          onClick={() => setExpanded(false)}
          className="text-gray-400 hover:text-white"
        >
          Close
        </button>
      </div>
      
      <div className="text-sm">
        <p className="mb-1">
          <span className="font-semibold">Auth State:</span> {isAuthenticated ? 'Authenticated' : 'Not authenticated'}
        </p>
        <p className="mb-1">
          <span className="font-semibold">Loading:</span> {loading ? 'True' : 'False'}
        </p>
        <p className="mb-1">
          <span className="font-semibold">User ID:</span> {user?.id || 'None'}
        </p>
        <p className="mb-1">
          <span className="font-semibold">Email:</span> {user?.email || 'None'}
        </p>
        <p className="mb-1">
          <span className="font-semibold">Last Updated:</span> {new Date().toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
};

export default DebugInfo; 