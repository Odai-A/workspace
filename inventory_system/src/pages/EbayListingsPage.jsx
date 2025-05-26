import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext'; // Adjust path if necessary
import { productLookupService } from '../services/databaseService'; // Added for local manifest lookup
import { PlusIcon, TrashIcon, XMarkIcon as HeroXMarkIcon, ArrowPathIcon, ChevronDownIcon } from '@heroicons/react/24/outline'; // For icons

const EbayListingsTable = ({ listings, onRefreshOffer, onEdit, onEnd, onRelist }) => {
  if (!listings || listings.length === 0) {
    return <p>No eBay listings found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white shadow-md rounded-lg">
        <thead className="bg-gray-200 text-gray-700">
          <tr>
            <th className="py-3 px-4 text-left">SKU</th>
            <th className="py-3 px-4 text-left">Title</th>
            <th className="py-3 px-4 text-left">Offer ID</th>
            <th className="py-3 px-4 text-left">Listing ID</th>
            <th className="py-3 px-4 text-left">Price</th>
            <th className="py-3 px-4 text-left">Qty</th>
            <th className="py-3 px-4 text-left">Status</th>
            <th className="py-3 px-4 text-left">Listed At</th>n            <th className="py-3 px-4 text-left">Actions</th>
          </tr>
        </thead>
        <tbody className="text-gray-600">
          {listings.map((listing) => (
            <tr key={listing.id || listing.ebay_offer_id} className="border-b border-gray-200 hover:bg-gray-100">
              <td className="py-3 px-4">{listing.internal_sku}</td>
              <td className="py-3 px-4">{listing.product_title}</td>
              <td className="py-3 px-4">{listing.ebay_offer_id}</td>
              <td className="py-3 px-4">{listing.ebay_listing_id || 'N/A'}</td>
              <td className="py-3 px-4">{listing.price ? `${listing.price} ${listing.currency}` : 'N/A'}</td>
              <td className="py-3 px-4">{listing.quantity}</td>
              <td className="py-3 px-4">{listing.ebay_listing_status}</td>
              <td className="py-3 px-4">{listing.listed_at ? new Date(listing.listed_at).toLocaleDateString() : 'N/A'}</td>
              <td className="py-3 px-4 whitespace-nowrap">
                <button 
                  onClick={() => onRefreshOffer(listing.ebay_offer_id)}
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded text-xs mr-1"
                  title="Refresh from eBay"
                >
                  Refresh
                </button>
                <button 
                  onClick={() => onEdit(listing)} 
                  className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-1 px-2 rounded text-xs mr-1"
                  title="Edit (Not Implemented)"
                >
                  Edit
                </button>
                {listing.ebay_listing_status === 'PUBLISHED' && (
                  <button 
                    onClick={() => onEnd(listing.ebay_offer_id)} 
                    className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-xs mr-1"
                    title="End Listing (Not Implemented)"
                  >
                    End
                  </button>
                )}
                {(listing.ebay_listing_status === 'ENDED' || listing.ebay_listing_status === 'UNPUBLISHED') && (
                  <button 
                    onClick={() => onRelist(listing.ebay_offer_id)} 
                    className="bg-green-500 hover:bg-green-700 text-white font-bold py-1 px-2 rounded text-xs"
                    title="Relist (Not Implemented)"
                  >
                    Relist
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Helper function to map manifest data to eBay single item form data
const mapManifestToEbayFormFields = (manifestItem) => {
  if (!manifestItem) return {};
  return {
    sku: manifestItem['Fn Sku'] || manifestItem['X-Z ASIN'] || manifestItem['B00 Asin'] || '', // Prioritize FNSKU, then LPN, then ASIN as SKU
    title: manifestItem['Description'] || '',
    description: manifestItem['Description'] || '', // Or a more detailed field if you have one
    price: manifestItem['MSRP'] != null ? parseFloat(manifestItem['MSRP']).toFixed(2) : '',
    quantity: manifestItem['Quantity'] != null ? parseInt(manifestItem['Quantity'], 10) : 1,
    image_url: manifestItem['Image URL'] || '', // Assuming you have an 'Image URL' column
    // ebay_category_id: '', // This will likely need manual input or a separate lookup
    // Business policy IDs will default to environment variables or require manual input
  };
};

const EbayListingsPage = () => {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { session, isAuthenticated, loading: authLoading } = useAuth(); // Get session from AuthContext
  const [skuInput, setSkuInput] = useState('');
  const [singleItemFormData, setSingleItemFormData] = useState({
    sku: '',
    title: '',
    description: '',
    price: '',
    quantity: 1,
    image_url: '',
    ebay_category_id: '',
    fulfillmentPolicyId: '', 
    paymentPolicyId: '',
    returnPolicyId: '',
    merchantLocationKey: ''
  });
  const [batchItems, setBatchItems] = useState([]);
  const [isFetchingItemDetails, setIsFetchingItemDetails] = useState(false);
  const [isSubmittingSingle, setIsSubmittingSingle] = useState(false);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [notification, setNotification] = useState({ message: '', type: '' }); // success, error, info

  const [categorySuggestions, setCategorySuggestions] = useState([]);
  const [isFetchingCategories, setIsFetchingCategories] = useState(false);
  const [selectedCategoryName, setSelectedCategoryName] = useState(''); // For display purposes

  const getAuthTokenForApi = useCallback(() => {
    if (session && session.access_token) {
      return session.access_token;
    }
    return null;
  }, [session]);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = getAuthTokenForApi();

    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    if (!backendUrl) {
      console.error("VITE_BACKEND_URL is not defined in your .env file.");
      setError("Frontend configuration error: VITE_BACKEND_URL is missing.");
      setLoading(false);
      return;
    }

    console.log("Auth Token being sent to /api/ebay/listings:", token); // Log the token

    if (!token) {
      if (!authLoading && !isAuthenticated) { // Only show error if auth has loaded and user is not authenticated
        setError('User is not authenticated. Please log in.');
      } else if (!authLoading && isAuthenticated) {
        setError('Authentication token not available. Please try again.');
      } else {
        setError('Authenticating...'); // Or just let the loading state handle this
      }
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/ebay/listings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorPayload = `HTTP error! status: ${response.status}`;
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const errorData = await response.json();
          errorPayload = errorData.error || errorData.message || JSON.stringify(errorData);
        } else {
          const errorText = await response.text();
          console.error("Failed to fetch eBay listings. Server response (HTML/Text):", errorText);
          errorPayload = `Server returned non-JSON response (status ${response.status}). Check console for details.`;
        }
        throw new Error(errorPayload);
      }
      const data = await response.json();
      setListings(data);
    } catch (e) {
      console.error("Failed to fetch eBay listings (catch block):", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthTokenForApi, authLoading, isAuthenticated]);

  useEffect(() => {
    if (!authLoading) {
        fetchListings();
    }
  }, [fetchListings, authLoading, refreshKey]);

  const handleRefreshOffer = async (offerId) => {
    console.log(`Refreshing offer: ${offerId}`);
    const token = getAuthTokenForApi();
    const backendUrl = import.meta.env.VITE_BACKEND_URL;

    if (!backendUrl) {
      alert("Frontend configuration error: VITE_BACKEND_URL is missing.");
      return;
    }
    if (!token) {
        alert('Authentication token not available. Please log in again.');
        return;
    }
    console.log(`Auth Token being sent to /api/ebay/offer/${offerId}:`, token); // Log the token
    try {
        const response = await fetch(`${backendUrl}/api/ebay/offer/${offerId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            let errorPayload = `Failed to refresh offer ${offerId}. Status: ${response.status}`;
            if (contentType && contentType.indexOf("application/json") !== -1) {
              const errorData = await response.json();
              errorPayload = errorData.error || errorData.message || JSON.stringify(errorData);
            } else {
              const errorText = await response.text();
              console.error(`Error refreshing offer ${offerId}. Server response (HTML/Text):`, errorText);
              errorPayload = `Server returned non-JSON response for offer ${offerId} (status ${response.status}). Check console.`;
            }
            throw new Error(errorPayload);
        }
        const updatedOffer = await response.json();
        alert(`Offer ${offerId} refreshed. Listing ID: ${updatedOffer.listing?.listingId}, Status: ${updatedOffer.status}`);
        setRefreshKey(prevKey => prevKey + 1);
    } catch (e) {
        console.error("Error refreshing offer:", e);
        alert(`Error refreshing offer: ${e.message}`);
    }
  };

  const handleEdit = (listing) => {
    alert(`Edit action for ${listing.ebay_offer_id} (not implemented yet).`);
  };

  const handleEnd = async (offerId) => {
    if (!window.confirm(`Are you sure you want to end the eBay listing for offer ID: ${offerId}? This action cannot be undone on eBay easily.`)) {
      return;
    }
    console.log(`Ending offer: ${offerId}`);
    const token = getAuthTokenForApi();
    const backendUrl = import.meta.env.VITE_BACKEND_URL;

    if (!backendUrl) {
      alert("Frontend configuration error: VITE_BACKEND_URL is missing.");
      return;
    }
    if (!token) {
        alert('Authentication token not available. Please log in again.');
        return;
    }
    console.log(`Auth Token being sent to /api/ebay/listings/${offerId}/end:`, token); // Log the token
    try {
        const response = await fetch(`${backendUrl}/api/ebay/listings/${offerId}/end`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
        });
        // For POST that might return JSON success or error:
        const responseData = await response.json().catch(async (jsonParseError) => {
            // If .json() fails, it means the response wasn't valid JSON.
            // This could be an HTML error page from a server crash or unexpected non-JSON success.
            const textResponse = await response.text(); // Try to get text
            console.error(`Ending offer ${offerId} - Non-JSON response from server (status ${response.status}):`, textResponse);
            // We'll throw an error based on !response.ok check next, but this logs the body.
            // Return a temporary object so the next check doesn't fail on responseData.error
            return { _raw_text: textResponse, _is_error_object: true }; 
        });

        if (!response.ok) {
            let errorMsg = `Failed to end offer ${offerId}. Status: ${response.status}`;
            if (responseData && responseData._is_error_object) {
                errorMsg = responseData._raw_text.substring(0, 200) + "... (Check console for full non-JSON error)";
            } else if (responseData) {
                errorMsg = responseData.error || responseData.message || JSON.stringify(responseData);
            }
            throw new Error(errorMsg);
        }
        alert(responseData.message || `Offer ${offerId} ended successfully.`);
        setRefreshKey(prevKey => prevKey + 1);
    } catch (e) {
        console.error("Error ending offer:", e);
        alert(`Error ending offer: ${e.message}`);
    }
  };

  const handleRelist = async (offerId) => {
    alert(`Relist action for ${offerId} (not implemented yet).`);
  };

  const clearMessages = () => {
    setError(null);
    setNotification({ message: '', type: '' });
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 5000); // Auto-hide after 5 seconds
  };

  const fetchCategorySuggestions = async (productTitle, internalCategory) => {
    if (!productTitle) return;
    setIsFetchingCategories(true);
    setCategorySuggestions([]); // Clear previous suggestions
    setSelectedCategoryName('');
    const token = getAuthTokenForApi();
    const backendUrl = import.meta.env.VITE_BACKEND_URL;

    let queryString = productTitle;
    if (internalCategory) {
        // Refine query based on internal category e.g., gl_kitchen -> kitchen
        const cleanInternalCategory = internalCategory.replace(/^gl_/, '').replace(/_/g, ' ');
        queryString += ` ${cleanInternalCategory}`;
    }
    
    console.log(`[EbayListingsPage] Fetching category suggestions for query: "${queryString}"`);

    try {
      const response = await fetch(`${backendUrl}/api/ebay/suggest_categories?q=${encodeURIComponent(queryString)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({error: "Failed to parse error from category suggestions"}));
        throw new Error(errData.error || `Failed to fetch category suggestions. Status: ${response.status}`);
      }
      const suggestions = await response.json();
      if (suggestions && suggestions.length > 0) {
        setCategorySuggestions(suggestions);
        // Pre-select the first category and update the form
        setSingleItemFormData(prev => ({ ...prev, ebay_category_id: suggestions[0].category.categoryId }));
        setSelectedCategoryName(suggestions[0].category.categoryName);
        showNotification(`Categories suggested. First suggestion '${suggestions[0].category.categoryName}' selected.`, 'info');
      } else {
        showNotification('No eBay category suggestions found for this item. Please enter manually.', 'info');
        setSingleItemFormData(prev => ({ ...prev, ebay_category_id: '' })); // Clear if no suggestions
      }
    } catch (err) {
      console.error("Error fetching category suggestions:", err);
      showNotification(`Error fetching eBay categories: ${err.message}`, 'error');
      setSingleItemFormData(prev => ({ ...prev, ebay_category_id: '' })); // Clear on error
    } finally {
      setIsFetchingCategories(false);
    }
  };

  const handleFetchItemDetails = async () => {
    if (!skuInput.trim()) {
      showNotification('Please enter an SKU, LPN, or ASIN to fetch.', 'error');
      return;
    }
    clearMessages();
    setIsFetchingItemDetails(true);
    setCategorySuggestions([]); // Clear old suggestions
    setSelectedCategoryName('');
    setSingleItemFormData(prev => ({ ...prev, sku: skuInput.trim(), title: '', description: '', price: '', quantity: 1, image_url: '', ebay_category_id: '' })); // Clear form but keep sku

    try {
      let foundItemRaw = null;
      let productData = await productLookupService.getProductByFnsku(skuInput.trim());
      if (productData && productData.rawSupabase) foundItemRaw = productData.rawSupabase;
      else if (productData) foundItemRaw = productData;

      if (!foundItemRaw) {
        productData = await productLookupService.getProductByLpn(skuInput.trim());
        if (productData && productData.rawSupabase) foundItemRaw = productData.rawSupabase;
        else if (productData) foundItemRaw = productData;
      }

      if (foundItemRaw) {
        const mappedFields = mapManifestToEbayFormFields(foundItemRaw);
        setSingleItemFormData(prevData => ({ ...prevData, ...mappedFields }));
        showNotification('Item details fetched! Now fetching eBay category suggestions...', 'success');
        // After fetching item details, fetch category suggestions
        // Assuming manifestItem has 'Description' and 'Category' (internal)
        const itemTitle = foundItemRaw['Description'] || '';
        const internalCategory = foundItemRaw['Category'] || ''; 
        if (itemTitle) {
            await fetchCategorySuggestions(itemTitle, internalCategory);
        } else {
            showNotification('Product title is missing, cannot fetch category suggestions.', 'info');
        }
      } else {
        showNotification(`No details found in local manifest for: ${skuInput.trim()}. Fill form manually.`, 'info');
      }
    } catch (err) {
      showNotification(`Error fetching item details: ${err.message}`, 'error');
    } finally {
      setIsFetchingItemDetails(false);
    }
  };

  const handleSingleItemFormChange = (e) => {
    const { name, value } = e.target;
    setSingleItemFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'ebay_category_id') {
        const selectedSuggestion = categorySuggestions.find(s => s.category.categoryId === value);
        setSelectedCategoryName(selectedSuggestion ? selectedSuggestion.category.categoryName : '');
    }
  };

  const handleCategorySuggestionChange = (e) => {
    const categoryId = e.target.value;
    const selectedSuggestion = categorySuggestions.find(s => s.category.categoryId === categoryId);
    setSingleItemFormData(prev => ({ ...prev, ebay_category_id: categoryId }));
    setSelectedCategoryName(selectedSuggestion ? selectedSuggestion.category.categoryName : 'No suggestion selected');
  };

  const handleAddSingleItemToEbay = async (e) => {
    e.preventDefault();
    clearMessages();
    setIsSubmittingSingle(true);
    const token = getAuthTokenForApi();
    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    if (!backendUrl || !token) {
      showNotification('Configuration or authentication error.', 'error');
      setIsSubmittingSingle(false);
      return;
    }

    // Basic validation
    if (!singleItemFormData.sku || !singleItemFormData.title || !singleItemFormData.price || !singleItemFormData.quantity || !singleItemFormData.ebay_category_id) {
        showNotification('Please fill all required fields for the single item (SKU, Title, Price, Quantity, eBay Category ID).', 'error');
        setIsSubmittingSingle(false);
        return;
    }

    const payload = { ...singleItemFormData };

    try {
      const response = await fetch(`${backendUrl}/api/ebay/listing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || `Failed to create listing. Status: ${response.status}`);
      }

      showNotification(`eBay listing created/updated successfully! Offer ID: ${responseData.offerId}, Listing ID: ${responseData.listingId || 'Pending'}`, 'success');
      setSingleItemFormData({ sku: '', title: '', description: '', price: '', quantity: 1, image_url: '', ebay_category_id: '', fulfillmentPolicyId: '', paymentPolicyId: '', returnPolicyId: '', merchantLocationKey: '' });
      setSkuInput(''); // Clear the SKU input field as well
      setRefreshKey(k => k + 1); // Refresh the listings table
    } catch (err) {
      console.error("Error adding single item to eBay:", err);
      showNotification(`Error: ${err.message}`, 'error');
    } finally {
      setIsSubmittingSingle(false);
    }
  };

  // Show auth loading state if auth is still loading
  if (authLoading) return <p className="text-center mt-8">Authenticating...</p>;
  
  // Show API loading state (distinct from auth loading)
  if (loading && !authLoading) return <p className="text-center mt-8">Loading eBay listings...</p>;
  
  if (error) return <p className="text-center mt-8 text-red-500">Error: {error}</p>;

  return (
    <div className="container mx-auto p-4 space-y-8">
      {/* Notification Area */}
      {notification.message && (
        <div className={`p-4 rounded-md ${notification.type === 'error' ? 'bg-red-100 text-red-700' : notification.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          {notification.message}
        </div>
      )}

      {/* Section 1: Add Single Item to eBay */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Add Single Item to eBay</h2>
        
        {/* SKU Input and Fetch Button */}
        <div className="mb-4">
          <label htmlFor="skuInput" className="block text-sm font-medium text-gray-700 mb-1">Scan/Enter SKU, LPN, or ASIN</label>
          <div className="flex space-x-2">
            <input
              type="text"
              id="skuInput"
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              placeholder="e.g., X00ABCD123 or LPN... or B00..."
              className="flex-grow shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2"
              disabled={isFetchingItemDetails}
            />
            <button
              onClick={handleFetchItemDetails}
              disabled={isFetchingItemDetails || !skuInput.trim()}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isFetchingItemDetails ? 'Fetching...' : 'Fetch Item Details'}
            </button>
          </div>
        </div>

        {/* Single Item Form */}
        <form onSubmit={handleAddSingleItemToEbay} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sku" className="block text-sm font-medium text-gray-700">SKU (Internal/eBay) *</label>
              <input type="text" name="sku" id="sku" value={singleItemFormData.sku} onChange={handleSingleItemFormChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm p-2" required />
            </div>
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700">Product Title *</label>
              <input type="text" name="title" id="title" value={singleItemFormData.title} onChange={handleSingleItemFormChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm p-2" required />
            </div>
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
            <textarea name="description" id="description" rows="3" value={singleItemFormData.description} onChange={handleSingleItemFormChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm p-2"></textarea>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="price" className="block text-sm font-medium text-gray-700">Price (USD) *</label>
              <input type="number" name="price" id="price" step="0.01" value={singleItemFormData.price} onChange={handleSingleItemFormChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm p-2" required />
            </div>
            <div>
              <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">Quantity *</label>
              <input type="number" name="quantity" id="quantity" step="1" value={singleItemFormData.quantity} onChange={handleSingleItemFormChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm p-2" required />
            </div>
            <div className="col-span-1 md:col-span-3">
              <label htmlFor="ebay_category_id_dropdown" className="block text-sm font-medium text-gray-700">eBay Category *</label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <select
                  id="ebay_category_id_dropdown"
                  name="ebay_category_id_dropdown"
                  value={singleItemFormData.ebay_category_id} // Controlled component
                  onChange={handleCategorySuggestionChange}
                  className="focus:ring-indigo-500 focus:border-indigo-500 flex-1 block w-full rounded-none rounded-l-md sm:text-sm border-gray-300 p-2 disabled:bg-gray-100"
                  disabled={isFetchingCategories || categorySuggestions.length === 0}
                >
                  {isFetchingCategories && <option value="">Loading suggestions...</option>}
                  {!isFetchingCategories && categorySuggestions.length === 0 && <option value="">No suggestions found. Enter ID below.</option>}
                  {categorySuggestions.map((suggestion) => (
                    <option key={suggestion.category.categoryId} value={suggestion.category.categoryId}>
                      {suggestion.category.categoryName} (ID: {suggestion.category.categoryId})
                    </option>
                  ))}
                </select>
                <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                  <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                </span>
              </div>
              {selectedCategoryName && <p className="mt-1 text-xs text-gray-500">Selected: {selectedCategoryName}</p>}
              <input 
                  type="text" 
                  name="ebay_category_id" 
                  id="ebay_category_id_manual" 
                  value={singleItemFormData.ebay_category_id} // Also controlled by this field
                  onChange={handleSingleItemFormChange} 
                  placeholder="Or enter Category ID manually"
                  className="mt-2 focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 shadow-sm"
              />
            </div>
          </div>
           <div>
              <label htmlFor="image_url" className="block text-sm font-medium text-gray-700">Image URL (comma-separated for multiple)</label>
              <input type="text" name="image_url" id="image_url" value={singleItemFormData.image_url} onChange={handleSingleItemFormChange} placeholder="https://.../image1.jpg,https://.../image2.jpg" className="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm p-2" />
            </div>
          <h3 className="text-md font-medium text-gray-800 pt-2">Business Policies (Optional - uses defaults if blank)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="fulfillmentPolicyId" className="block text-sm font-medium text-gray-700">Fulfillment Policy ID</label>
              <input type="text" name="fulfillmentPolicyId" id="fulfillmentPolicyId" value={singleItemFormData.fulfillmentPolicyId} onChange={handleSingleItemFormChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm p-2" />
            </div>
            <div>
              <label htmlFor="paymentPolicyId" className="block text-sm font-medium text-gray-700">Payment Policy ID</label>
              <input type="text" name="paymentPolicyId" id="paymentPolicyId" value={singleItemFormData.paymentPolicyId} onChange={handleSingleItemFormChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm p-2" />
            </div>
            <div>
              <label htmlFor="returnPolicyId" className="block text-sm font-medium text-gray-700">Return Policy ID</label>
              <input type="text" name="returnPolicyId" id="returnPolicyId" value={singleItemFormData.returnPolicyId} onChange={handleSingleItemFormChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm p-2" />
            </div>
            <div>
              <label htmlFor="merchantLocationKey" className="block text-sm font-medium text-gray-700">Merchant Location Key</label>
              <input type="text" name="merchantLocationKey" id="merchantLocationKey" value={singleItemFormData.merchantLocationKey} onChange={handleSingleItemFormChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm p-2" />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmittingSingle || isFetchingItemDetails}
              className="inline-flex items-center justify-center px-6 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              <PlusIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
              {isSubmittingSingle ? 'Adding to eBay...' : 'Add to eBay'}
            </button>
          </div>
        </form>
      </div>

      {/* Section 2: My eBay Listings Table */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-700">My Existing eBay Listings</h2>
            <button 
                onClick={() => setRefreshKey(prevKey => prevKey + 1)} 
                className="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded text-sm"
                disabled={loading || authLoading}
            >
                Refresh List
            </button>
        </div>
        {error && <p className="text-center text-red-500 py-4">Error fetching listings: {error}</p>}
        {loading && !error && <p className="text-center text-gray-500 py-4">Loading eBay listings...</p>}
        {!loading && !error && isAuthenticated && listings.length === 0 && <p className="text-center text-gray-500 py-4">No eBay listings found.</p>}
        {!loading && !error && isAuthenticated && listings.length > 0 && (
            <EbayListingsTable 
            listings={listings} 
            onRefreshOffer={handleRefreshOffer}
            onEdit={handleEdit}
            onEnd={handleEnd}
            onRelist={handleRelist}
            />
        )}
        {!isAuthenticated && !authLoading && (
            <p className="text-center text-orange-500 py-4">Please log in to view and manage eBay listings.</p>
        )}
      </div>
    </div>
  );
};

export default EbayListingsPage; 