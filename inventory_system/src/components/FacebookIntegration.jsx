import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FiFacebook, FiCheck, FiX, FiRefreshCw, FiExternalLink, FiInfo } from 'react-icons/fi';
import { supabase } from '../config/supabaseClient';
import { getApiEndpoint } from '../utils/apiConfig';

const FacebookIntegration = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [catalogId, setCatalogId] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);

  // Load integration status
  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(getApiEndpoint('/facebook/integration/status'), {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setStatus(data);
        if (data.selected_page) {
          setSelectedPageId(data.selected_page.page_id);
        }
        if (data.catalog_id) {
          setCatalogId(data.catalog_id);
        }
      }
    } catch (error) {
      console.error('Error loading Facebook status:', error);
    }
  };

  const loadPages = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in');
        return;
      }

      const response = await fetch(getApiEndpoint('/facebook/pages'), {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setPages(data.pages || []);
        const selected = data.pages.find(p => p.is_selected);
        if (selected) {
          setSelectedPageId(selected.page_id);
        }
      }
    } catch (error) {
      console.error('Error loading pages:', error);
      toast.error('Failed to load Facebook pages');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in');
        return;
      }

      const response = await fetch(getApiEndpoint('/facebook/oauth/initiate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const data = await response.json();
      if (data.success && data.oauth_url) {
        // Store state for verification
        localStorage.setItem('facebook_oauth_state', data.state);
        // Redirect to Facebook OAuth
        window.location.href = data.oauth_url;
      } else {
        toast.error(data.error || 'Failed to initiate Facebook connection');
      }
    } catch (error) {
      console.error('Error connecting Facebook:', error);
      toast.error('Failed to connect Facebook account');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPage = async (pageId) => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in');
        return;
      }

      const response = await fetch(getApiEndpoint('/facebook/pages/select'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ page_id: pageId })
      });

      const data = await response.json();
      if (data.success) {
        setSelectedPageId(pageId);
        toast.success('Page selected successfully');
        loadStatus();
      } else {
        toast.error(data.error || 'Failed to select page');
      }
    } catch (error) {
      console.error('Error selecting page:', error);
      toast.error('Failed to select page');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCatalog = async () => {
    if (!catalogId.trim()) {
      toast.error('Please enter a Catalog ID');
      return;
    }

    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in');
        return;
      }

      const response = await fetch(getApiEndpoint('/facebook/catalog/set'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ catalog_id: catalogId.trim() })
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Catalog ID saved successfully');
        loadStatus();
      } else {
        toast.error(data.error || 'Failed to save Catalog ID');
      }
    } catch (error) {
      console.error('Error saving catalog:', error);
      toast.error('Failed to save Catalog ID');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect your Facebook account?')) {
      return;
    }

    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in');
        return;
      }

      const response = await fetch(getApiEndpoint('/facebook/disconnect'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Facebook account disconnected');
        setStatus(null);
        setPages([]);
        setSelectedPageId(null);
        setCatalogId('');
      } else {
        toast.error(data.error || 'Failed to disconnect');
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
      toast.error('Failed to disconnect Facebook account');
    } finally {
      setLoading(false);
    }
  };

  // Check for OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    if (error) {
      toast.error(`Facebook authorization failed: ${error}`);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (code && state) {
      handleOAuthCallback(code, state);
    }
  }, []);

  const handleOAuthCallback = async (code, state) => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in');
        return;
      }

      // Verify state matches stored state
      const storedState = localStorage.getItem('facebook_oauth_state');
      if (state !== storedState) {
        toast.error('Invalid OAuth state. Please try again.');
        localStorage.removeItem('facebook_oauth_state');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      const response = await fetch(getApiEndpoint('/facebook/oauth/callback'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ code, state })
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Facebook account connected successfully!');
        localStorage.removeItem('facebook_oauth_state');
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
        // Reload status and pages
        await loadStatus();
        await loadPages();
      } else {
        toast.error(data.error || 'Failed to connect Facebook account');
      }
    } catch (error) {
      console.error('Error in OAuth callback:', error);
      toast.error('Failed to complete Facebook connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
            <FiFacebook className="mr-2 text-blue-600" />
            Facebook Integration
          </h2>
          {status?.connected && (
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              Disconnect
            </button>
          )}
        </div>

        {/* Connection Status */}
        {!status?.connected ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Connect your Facebook account to automatically post scanned products to your Facebook Business Page.
            </p>
            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <FiRefreshCw className="mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <FiFacebook className="mr-2" />
                  Connect Facebook
                </>
              )}
            </button>
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center"
            >
              <FiInfo className="mr-1" />
              How to Enable Facebook Selling
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Status Indicators */}
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                {status.connected ? (
                  <FiCheck className="text-green-600" />
                ) : (
                  <FiX className="text-red-600" />
                )}
                <span className="text-sm text-gray-700 dark:text-gray-300">Connected</span>
              </div>
              <div className="flex items-center space-x-2">
                {status.has_page ? (
                  <FiCheck className="text-green-600" />
                ) : (
                  <FiX className="text-red-600" />
                )}
                <span className="text-sm text-gray-700 dark:text-gray-300">Page Selected</span>
              </div>
              <div className="flex items-center space-x-2">
                {status.has_catalog ? (
                  <FiCheck className="text-green-600" />
                ) : (
                  <FiX className="text-red-600" />
                )}
                <span className="text-sm text-gray-700 dark:text-gray-300">Catalog Set</span>
              </div>
            </div>

            {/* Page Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Facebook Business Page
              </label>
              {pages.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    No pages found. Click "Refresh Pages" to load your pages.
                  </p>
                  <button
                    onClick={loadPages}
                    disabled={loading}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-400 flex items-center"
                  >
                    <FiRefreshCw className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh Pages
                  </button>
                </div>
              ) : (
                <select
                  value={selectedPageId || ''}
                  onChange={(e) => handleSelectPage(e.target.value)}
                  disabled={loading}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">Select a page...</option>
                  {pages.map((page) => (
                    <option key={page.id} value={page.page_id}>
                      {page.page_name} {page.is_selected && '(Selected)'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Catalog ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Facebook Catalog ID
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={catalogId}
                  onChange={(e) => setCatalogId(e.target.value)}
                  placeholder="Enter your Facebook Catalog ID"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                />
                <button
                  onClick={handleSaveCatalog}
                  disabled={loading || !catalogId.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Get your Catalog ID from Facebook Commerce Manager
              </p>
            </div>

            {/* Instructions Button */}
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center"
            >
              <FiInfo className="mr-1" />
              How to Enable Facebook Selling
            </button>
          </div>
        )}

        {/* Setup Instructions */}
        {showInstructions && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">
              How to Enable Facebook Selling
            </h3>
            <div className="space-y-3 text-sm text-blue-800 dark:text-blue-200">
              <div>
                <strong>STEP 1: Connect Facebook</strong>
                <p className="mt-1">Click "Connect Facebook" and approve the required permissions.</p>
              </div>
              <div>
                <strong>STEP 2: Select Business Page</strong>
                <p className="mt-1">Choose the Facebook Page where products will be posted.</p>
              </div>
              <div>
                <strong>STEP 3: Connect Facebook Shop</strong>
                <ol className="list-decimal list-inside mt-1 ml-2 space-y-1">
                  <li>Go to <a href="https://business.facebook.com/commerce" target="_blank" rel="noopener noreferrer" className="underline">Facebook Commerce Manager</a></li>
                  <li>Create a Shop & Catalog (if you don't have one)</li>
                  <li>Copy your Catalog ID</li>
                  <li>Paste it in the "Facebook Catalog ID" field above</li>
                </ol>
              </div>
              <div>
                <strong>STEP 4: Post Products</strong>
                <p className="mt-1">When you scan a product, it will automatically be posted to your selected Facebook Page with a "Shop Now" button.</p>
              </div>
              <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                <p className="font-semibold text-yellow-900 dark:text-yellow-100">⚠️ Important Notes:</p>
                <ul className="list-disc list-inside mt-1 space-y-1 text-yellow-800 dark:text-yellow-200">
                  <li>Marketplace posting is manual only (not automated)</li>
                  <li>Personal Facebook accounts are NOT automated</li>
                  <li>Business Pages + Shops are required</li>
                  <li>You must have admin access to the Page</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FacebookIntegration;

