import React, { useState, useEffect } from 'react';
import { checkSupabaseConnection, inventoryService } from '../../config/supabaseClient';
import { productLookupService } from '../../services/databaseService';
import { XCircleIcon, CheckCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

/**
 * Component for checking and debugging database connection
 */
const DatabaseCheck = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [productCount, setProductCount] = useState(null);
  const [inventoryCount, setInventoryCount] = useState(null);
  
  const checkConnection = async () => {
    setLoading(true);
    try {
      // Check Supabase connection
      const result = await checkSupabaseConnection();
      setStatus(result);
      
      // If connected, check data counts
      if (result.connected) {
        const products = await productLookupService.getRecentLookups(1000);
        setProductCount(products.length);
        
        const inventory = await inventoryService.getInventory();
        setInventoryCount(inventory.length);
      }
    } catch (error) {
      setStatus({
        connected: false,
        error: error.message,
        details: 'Error occurred while checking connection'
      });
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    checkConnection();
  }, []);
  
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Database Connection Status</h2>
        <button 
          onClick={checkConnection}
          className="flex items-center text-sm text-blue-600 hover:text-blue-800"
          disabled={loading}
        >
          <ArrowPathIcon className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Checking...' : 'Refresh'}
        </button>
      </div>
      
      {status && (
        <div className="space-y-4">
          <div className={`p-3 rounded-md ${status.connected ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex">
              <div className="flex-shrink-0">
                {status.connected ? (
                  <CheckCircleIcon className="h-5 w-5 text-green-400" />
                ) : (
                  <XCircleIcon className="h-5 w-5 text-red-400" />
                )}
              </div>
              <div className="ml-3">
                <h3 className={`text-sm font-medium ${status.connected ? 'text-green-800' : 'text-red-800'}`}>
                  {status.connected ? 'Connected to Supabase' : 'Connection Failed'}
                </h3>
                {!status.connected && (
                  <div className="mt-2 text-sm text-red-700">
                    <p>{status.error}</p>
                    <p className="mt-1">{status.details}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {status.connected && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-3 rounded-md">
                <h3 className="text-sm font-medium text-blue-800">Product Lookups</h3>
                <p className="mt-1 text-xl font-semibold">{productCount !== null ? productCount : '...'}</p>
              </div>
              <div className="bg-purple-50 p-3 rounded-md">
                <h3 className="text-sm font-medium text-purple-800">Inventory Items</h3>
                <p className="mt-1 text-xl font-semibold">{inventoryCount !== null ? inventoryCount : '...'}</p>
              </div>
            </div>
          )}
          
          {status.connected && (
            <div className="text-sm text-gray-600">
              <p>Your database is configured correctly. If you're having issues with products not being found:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Make sure you've imported products with correct SKU, FNSKU, or ASIN values</li>
                <li>Check that the product lookup and inventory tables exist in your Supabase database</li>
                <li>Ensure your CSV formats match the expected column names</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DatabaseCheck; 