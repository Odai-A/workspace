import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { marketplaceService, ebayService, shopifyService } from '../services/marketplaceService';
import { 
  ShoppingBagIcon, 
  XMarkIcon, 
  PhotoIcon,
  CurrencyDollarIcon,
  TagIcon,
  ClipboardDocumentListIcon
} from '@heroicons/react/24/outline';

const MarketplaceListing = ({ productData, isVisible, onClose, onSuccess }) => {
  // Form states
  const [activeTab, setActiveTab] = useState('ebay');
  const [loading, setLoading] = useState(false);
  const [pricingSuggestions, setPricingSuggestions] = useState(null);
  
  // eBay listing state
  const [ebayListing, setEbayListing] = useState({
    enabled: true,
    title: '',
    description: '',
    price: '',
    condition: 'New',
    category: '',
    quantity: 1,
    shippingCost: 0,
    freeShipping: true,
    images: []
  });

  // Shopify listing state
  const [shopifyListing, setShopifyListing] = useState({
    enabled: true,
    title: '',
    description: '',
    price: '',
    compareAtPrice: '',
    vendor: 'Your Store',
    productType: '',
    tags: [],
    quantity: 1,
    weight: 0,
    published: true,
    images: []
  });

  // Other states
  const [ebayCategories, setEbayCategories] = useState([]);
  const [shopifyCollections, setShopifyCollections] = useState([]);
  const [newTag, setNewTag] = useState('');

  // Initialize form data when component becomes visible
  useEffect(() => {
    if (isVisible && productData) {
      initializeFormData();
      loadMarketplaceData();
    }
  }, [isVisible, productData]);

  const initializeFormData = () => {
    const defaultTitle = productData.name || productData.description || '';
    const defaultDescription = productData.description || '';
    const defaultPrice = productData.price || '';

    setEbayListing(prev => ({
      ...prev,
      title: defaultTitle,
      description: defaultDescription,
      price: defaultPrice
    }));

    setShopifyListing(prev => ({
      ...prev,
      title: defaultTitle,
      description: defaultDescription,
      price: defaultPrice,
      productType: productData.category || ''
    }));
  };

  const loadMarketplaceData = async () => {
    try {
      // Load pricing suggestions
      const pricing = await marketplaceService.getPricingSuggestions(productData);
      setPricingSuggestions(pricing);

      // Load eBay categories
      const categories = await ebayService.getCategories();
      setEbayCategories(categories);

      // Get suggested eBay category
      const suggestedCategory = await ebayService.getSuggestedCategory(productData);
      if (suggestedCategory) {
        setEbayListing(prev => ({
          ...prev,
          category: suggestedCategory.categoryId
        }));
      }

      // Load Shopify collections
      const collections = await shopifyService.getCollections();
      setShopifyCollections(collections);

    } catch (error) {
      console.error('Error loading marketplace data:', error);
    }
  };

  const handleCreateListings = async () => {
    if (!ebayListing.enabled && !shopifyListing.enabled) {
      toast.error('Please enable at least one marketplace');
      return;
    }

    setLoading(true);
    try {
      const options = {
        ebay: ebayListing.enabled ? ebayListing : null,
        shopify: shopifyListing.enabled ? shopifyListing : null
      };

      const results = await marketplaceService.createMultipleListings(productData, options);

      // Handle results
      let successCount = 0;
      if (results.ebay) {
        toast.success('eBay listing created successfully!');
        successCount++;
      }
      if (results.shopify) {
        toast.success('Shopify product created successfully!');
        successCount++;
      }

      if (results.errors.length > 0) {
        results.errors.forEach(error => toast.error(error));
      }

      if (successCount > 0) {
        onSuccess && onSuccess(results);
        onClose();
      }

    } catch (error) {
      console.error('Error creating listings:', error);
      toast.error(`Failed to create listings: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addTag = () => {
    if (newTag.trim() && !shopifyListing.tags.includes(newTag.trim())) {
      setShopifyListing(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove) => {
    setShopifyListing(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <div className="flex items-center space-x-3">
            <ShoppingBagIcon className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-bold">Create Marketplace Listings</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Product Summary */}
        <div className="p-6 bg-gray-50 border-b">
          <div className="flex items-start space-x-4">
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{productData.name || productData.description}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm text-gray-600">
                <div><span className="font-medium">SKU:</span> {productData.sku || productData.fnsku}</div>
                <div><span className="font-medium">ASIN:</span> {productData.asin}</div>
                <div><span className="font-medium">UPC:</span> {productData.upc}</div>
                <div><span className="font-medium">MSRP:</span> ${productData.price}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Marketplace Tabs */}
        <div className="border-b">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('ebay')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'ebay'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              eBay Listing
            </button>
            <button
              onClick={() => setActiveTab('shopify')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'shopify'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Shopify Product
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'summary'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Summary
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* eBay Tab */}
          {activeTab === 'ebay' && (
            <div className="space-y-6">
              {/* Enable/Disable */}
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="ebay-enabled"
                  checked={ebayListing.enabled}
                  onChange={(e) => setEbayListing(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <label htmlFor="ebay-enabled" className="font-medium">Create eBay listing</label>
                {pricingSuggestions?.ebay && (
                  <span className="text-sm text-gray-500">
                    (Suggested price: ${pricingSuggestions.ebay.suggested})
                  </span>
                )}
              </div>

              {ebayListing.enabled && (
                <div className="space-y-4">
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Title *
                    </label>
                    <input
                      type="text"
                      value={ebayListing.title}
                      onChange={(e) => setEbayListing(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full p-2 border rounded-md"
                      placeholder="Enter listing title"
                      maxLength="80"
                    />
                    <p className="text-xs text-gray-500 mt-1">{ebayListing.title.length}/80 characters</p>
                  </div>

                  {/* Price and Condition */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Price *
                      </label>
                      <div className="relative">
                        <CurrencyDollarIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <input
                          type="number"
                          step="0.01"
                          value={ebayListing.price}
                          onChange={(e) => setEbayListing(prev => ({ ...prev, price: e.target.value }))}
                          className="w-full pl-10 p-2 border rounded-md"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Condition *
                      </label>
                      <select
                        value={ebayListing.condition}
                        onChange={(e) => setEbayListing(prev => ({ ...prev, condition: e.target.value }))}
                        className="w-full p-2 border rounded-md"
                      >
                        <option value="New">New</option>
                        <option value="Used">Used</option>
                        <option value="Refurbished">Refurbished</option>
                      </select>
                    </div>
                  </div>

                  {/* Category and Quantity */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Category
                      </label>
                      <select
                        value={ebayListing.category}
                        onChange={(e) => setEbayListing(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full p-2 border rounded-md"
                      >
                        <option value="">Select category...</option>
                        {ebayCategories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Quantity
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={ebayListing.quantity}
                        onChange={(e) => setEbayListing(prev => ({ ...prev, quantity: parseInt(e.target.value) }))}
                        className="w-full p-2 border rounded-md"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={ebayListing.description}
                      onChange={(e) => setEbayListing(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full p-2 border rounded-md"
                      rows="4"
                      placeholder="Enter product description"
                    />
                  </div>

                  {/* Shipping */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Shipping</label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id="free-shipping"
                        checked={ebayListing.freeShipping}
                        onChange={(e) => setEbayListing(prev => ({ 
                          ...prev, 
                          freeShipping: e.target.checked,
                          shippingCost: e.target.checked ? 0 : prev.shippingCost
                        }))}
                        className="h-4 w-4 text-blue-600 rounded"
                      />
                      <label htmlFor="free-shipping" className="text-sm">Free shipping</label>
                    </div>
                    {!ebayListing.freeShipping && (
                      <input
                        type="number"
                        step="0.01"
                        value={ebayListing.shippingCost}
                        onChange={(e) => setEbayListing(prev => ({ ...prev, shippingCost: parseFloat(e.target.value) }))}
                        className="w-full p-2 border rounded-md"
                        placeholder="Shipping cost"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Shopify Tab */}
          {activeTab === 'shopify' && (
            <div className="space-y-6">
              {/* Enable/Disable */}
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="shopify-enabled"
                  checked={shopifyListing.enabled}
                  onChange={(e) => setShopifyListing(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <label htmlFor="shopify-enabled" className="font-medium">Create Shopify product</label>
                {pricingSuggestions?.shopify && (
                  <span className="text-sm text-gray-500">
                    (Suggested price: ${pricingSuggestions.shopify.suggested})
                  </span>
                )}
              </div>

              {shopifyListing.enabled && (
                <div className="space-y-4">
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Product Title *
                    </label>
                    <input
                      type="text"
                      value={shopifyListing.title}
                      onChange={(e) => setShopifyListing(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full p-2 border rounded-md"
                      placeholder="Enter product title"
                    />
                  </div>

                  {/* Price and Compare At Price */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Price *
                      </label>
                      <div className="relative">
                        <CurrencyDollarIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <input
                          type="number"
                          step="0.01"
                          value={shopifyListing.price}
                          onChange={(e) => setShopifyListing(prev => ({ ...prev, price: e.target.value }))}
                          className="w-full pl-10 p-2 border rounded-md"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Compare at Price
                      </label>
                      <div className="relative">
                        <CurrencyDollarIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <input
                          type="number"
                          step="0.01"
                          value={shopifyListing.compareAtPrice}
                          onChange={(e) => setShopifyListing(prev => ({ ...prev, compareAtPrice: e.target.value }))}
                          className="w-full pl-10 p-2 border rounded-md"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Vendor and Product Type */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Vendor
                      </label>
                      <input
                        type="text"
                        value={shopifyListing.vendor}
                        onChange={(e) => setShopifyListing(prev => ({ ...prev, vendor: e.target.value }))}
                        className="w-full p-2 border rounded-md"
                        placeholder="Your Store"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Product Type
                      </label>
                      <input
                        type="text"
                        value={shopifyListing.productType}
                        onChange={(e) => setShopifyListing(prev => ({ ...prev, productType: e.target.value }))}
                        className="w-full p-2 border rounded-md"
                        placeholder="e.g., Electronics, Clothing"
                      />
                    </div>
                  </div>

                  {/* Quantity and Weight */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Quantity
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={shopifyListing.quantity}
                        onChange={(e) => setShopifyListing(prev => ({ ...prev, quantity: parseInt(e.target.value) }))}
                        className="w-full p-2 border rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Weight (lbs)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={shopifyListing.weight}
                        onChange={(e) => setShopifyListing(prev => ({ ...prev, weight: parseFloat(e.target.value) }))}
                        className="w-full p-2 border rounded-md"
                        placeholder="0.0"
                      />
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tags
                    </label>
                    <div className="flex space-x-2 mb-2">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addTag()}
                        className="flex-1 p-2 border rounded-md"
                        placeholder="Add a tag"
                      />
                      <button
                        type="button"
                        onClick={addTag}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {shopifyListing.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                        >
                          <TagIcon className="h-3 w-3 mr-1" />
                          {tag}
                          <button
                            onClick={() => removeTag(tag)}
                            className="ml-2 text-blue-600 hover:text-blue-800"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={shopifyListing.description}
                      onChange={(e) => setShopifyListing(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full p-2 border rounded-md"
                      rows="4"
                      placeholder="Enter product description"
                    />
                  </div>

                  {/* Published */}
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="published"
                      checked={shopifyListing.published}
                      onChange={(e) => setShopifyListing(prev => ({ ...prev, published: e.target.checked }))}
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <label htmlFor="published" className="text-sm">Publish product immediately</label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Summary Tab */}
          {activeTab === 'summary' && (
            <div className="space-y-6">
              <div className="text-center text-gray-600 mb-6">
                <ClipboardDocumentListIcon className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p>Review your listings before creating them</p>
              </div>

              {/* eBay Summary */}
              {ebayListing.enabled && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold text-lg mb-3 text-blue-600">eBay Listing</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div><span className="font-medium">Title:</span> {ebayListing.title}</div>
                    <div><span className="font-medium">Price:</span> ${ebayListing.price}</div>
                    <div><span className="font-medium">Condition:</span> {ebayListing.condition}</div>
                    <div><span className="font-medium">Quantity:</span> {ebayListing.quantity}</div>
                    <div><span className="font-medium">Shipping:</span> {ebayListing.freeShipping ? 'Free' : `$${ebayListing.shippingCost}`}</div>
                  </div>
                </div>
              )}

              {/* Shopify Summary */}
              {shopifyListing.enabled && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold text-lg mb-3 text-green-600">Shopify Product</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div><span className="font-medium">Title:</span> {shopifyListing.title}</div>
                    <div><span className="font-medium">Price:</span> ${shopifyListing.price}</div>
                    <div><span className="font-medium">Vendor:</span> {shopifyListing.vendor}</div>
                    <div><span className="font-medium">Type:</span> {shopifyListing.productType}</div>
                    <div><span className="font-medium">Quantity:</span> {shopifyListing.quantity}</div>
                    <div><span className="font-medium">Published:</span> {shopifyListing.published ? 'Yes' : 'No'}</div>
                  </div>
                  {shopifyListing.tags.length > 0 && (
                    <div className="mt-2">
                      <span className="font-medium text-sm">Tags:</span>
                      <span className="ml-2 text-sm">{shopifyListing.tags.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}

              {!ebayListing.enabled && !shopifyListing.enabled && (
                <div className="text-center text-gray-500 py-8">
                  <p>No marketplaces selected. Please enable at least one marketplace to create listings.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <div className="flex space-x-3">
            {activeTab !== 'summary' && (
              <button
                onClick={() => setActiveTab('summary')}
                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-md"
              >
                Review
              </button>
            )}
            <button
              onClick={handleCreateListings}
              disabled={loading || (!ebayListing.enabled && !shopifyListing.enabled)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <ShoppingBagIcon className="h-4 w-4" />
                  <span>Create Listings</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketplaceListing; 