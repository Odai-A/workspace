import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext'; // Adjust path if necessary

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

const EbayListingsPage = () => {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { session, isAuthenticated, loading: authLoading } = useAuth(); // Get session from AuthContext

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
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/ebay/listings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setListings(data);
    } catch (e) {
      console.error("Failed to fetch eBay listings:", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthTokenForApi, authLoading, isAuthenticated]);

  useEffect(() => {
    if (!authLoading) { // Only fetch listings once auth state is resolved
        fetchListings();
    }
  }, [fetchListings, authLoading, refreshKey]);

  const handleRefreshOffer = async (offerId) => {
    console.log(`Refreshing offer: ${offerId}`);
    const token = getAuthTokenForApi();
    if (!token) {
        alert('Authentication token not available. Please log in again.');
        return;
    }
    try {
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/ebay/offer/${offerId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to refresh offer ${offerId}`);
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
    if (!token) {
        alert('Authentication token not available. Please log in again.');
        return;
    }
    try {
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/ebay/listings/${offerId}/end`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
        });
        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(responseData.error || responseData.message || `Failed to end offer ${offerId}. Status: ${response.status}`);
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

  // Show auth loading state if auth is still loading
  if (authLoading) return <p className="text-center mt-8">Authenticating...</p>;
  
  // Show API loading state (distinct from auth loading)
  if (loading && !authLoading) return <p className="text-center mt-8">Loading eBay listings...</p>;
  
  if (error) return <p className="text-center mt-8 text-red-500">Error: {error}</p>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-6 text-gray-800">My eBay Listings</h1>
      <div className="mb-4">
        <button 
            onClick={() => setRefreshKey(prevKey => prevKey + 1)} 
            className="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded"
            disabled={loading || authLoading}
        >
            Refresh List
        </button>
      </div>
      {!isAuthenticated && !authLoading && (
        <p className="text-center text-orange-500">Please log in to view your eBay listings.</p>
      )}
      {isAuthenticated && (
        <EbayListingsTable 
          listings={listings} 
          onRefreshOffer={handleRefreshOffer}
          onEdit={handleEdit}
          onEnd={handleEnd}
          onRelist={handleRelist}
        />
      )}
    </div>
  );
};

export default EbayListingsPage; 