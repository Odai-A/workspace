import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { XMarkIcon, ShoppingBagIcon, ExclamationTriangleIcon, CheckCircleIcon, CogIcon } from '@heroicons/react/24/outline';
import { shopifyService } from '../services/shopifyService';

/**
 * Shopify Listing Modal Component
 * Creates automated Shopify listings from scanned product data
 */
const ShopifyListing = ({ 
  productData, 
  isVisible, 
  onClose, 
  onSuccess 
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [existingProduct, setExistingProduct] = useState(null);
  const [formData, setFormData] = useState({
    customTitle: '',
    markup: 1.5,
    defaultPrice: '29.99',
    quantity: 1,
    weight: 1,
    vendor: 'Amazon Arbitrage',
    productType: 'General',
    status: 'draft',
    customTags: ''
  });
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [previewDescription, setPreviewDescription] = useState('');

  // Update form when product data changes
  useEffect(() => {
    if (productData && isVisible) {
      // Set default title from product data
      setFormData(prev => ({
        ...prev,
        customTitle: productData.name || `Amazon Product ${productData.asin || productData.fnsku}`,
        productType: productData.category || 'General'
      }));

      // Generate preview description
      const preview = shopifyService.generateProductDescription(productData, formData);
      setPreviewDescription(preview);

      // Check for existing product
      checkExistingProduct();
    }
  }, [productData, isVisible]);

  // Update preview when form changes
  useEffect(() => {
    if (productData) {
      const preview = shopifyService.generateProductDescription(productData, formData);
      setPreviewDescription(preview);
    }
  }, [formData, productData]);

  const checkExistingProduct = async () => {
    if (!productData) return;
    
    try {
      const existing = await shopifyService.findExistingProduct(productData);
      setExistingProduct(existing);
      
      if (existing) {
        toast.warning(`Product already exists on Shopify: ${existing.title}`);
      }
    } catch (error) {
      console.error('Error checking existing product:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

  const calculatePrice = () => {
    const basePrice = productData?.price || 0;
    if (basePrice > 0) {
      return (basePrice * formData.markup).toFixed(2);
    }
    return formData.defaultPrice;
  };

  const handleCreateListing = async () => {
    if (!productData) {
      toast.error('No product data available');
      return;
    }

    setIsCreating(true);
    
    try {
      // Prepare options
      const options = {
        ...formData,
        customTags: formData.customTags ? formData.customTags.split(',').map(tag => tag.trim()) : []
      };

      console.log('🛍️ Creating Shopify listing with options:', options);

      const result = await shopifyService.createProductListing(productData, options);

      if (result.success) {
        toast.success(`✅ Shopify listing created! Product ID: ${result.product.id}`, {
          autoClose: 5000
        });
        
        if (onSuccess) {
          onSuccess(result);
        }
        
        onClose();
      } else {
        toast.error(`❌ Failed to create listing: ${result.message}`);
        console.error('Shopify creation error:', result.error);
      }
    } catch (error) {
      console.error('Error creating Shopify listing:', error);
      toast.error('❌ Error creating Shopify listing');
    } finally {
      setIsCreating(false);
    }
  };

  const testShopifyConnection = async () => {
    try {
      const isConnected = await shopifyService.testConnection();
      if (isConnected) {
        toast.success('✅ Shopify connection successful!');
      } else {
        toast.error('❌ Shopify connection failed. Check your credentials.');
      }
    } catch (error) {
      toast.error('❌ Error testing Shopify connection');
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center">
            <ShoppingBagIcon className="h-8 w-8 text-green-600 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Create Shopify Listing</h2>
              <p className="text-sm text-gray-500">
                {productData?.asin || productData?.fnsku} • {productData?.code_type || 'Product'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Existing Product Warning */}
        {existingProduct && (
          <div className="mx-6 mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mr-2" />
              <span className="text-sm font-medium text-yellow-800">
                Product already exists: {existingProduct.title}
              </span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Form */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Listing Details</h3>
            
            {/* Product Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Title
              </label>
              <input
                type="text"
                name="customTitle"
                value={formData.customTitle}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Enter product title"
              />
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Markup Multiplier
                </label>
                <input
                  type="number"
                  name="markup"
                  value={formData.markup}
                  onChange={handleInputChange}
                  step="0.1"
                  min="1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Original: ${productData?.price || 0} → Selling: ${calculatePrice()}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Price (if no original)
                </label>
                <input
                  type="text"
                  name="defaultPrice"
                  value={formData.defaultPrice}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Basic Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Initial Quantity
                </label>
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleInputChange}
                  min="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center text-sm text-gray-600 hover:text-gray-800"
            >
              <CogIcon className="h-4 w-4 mr-2" />
              {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
            </button>

            {/* Advanced Settings */}
            {showAdvanced && (
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vendor
                    </label>
                    <input
                      type="text"
                      name="vendor"
                      value={formData.vendor}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Product Type
                    </label>
                    <input
                      type="text"
                      name="productType"
                      value={formData.productType}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Weight (lbs)
                  </label>
                  <input
                    type="number"
                    name="weight"
                    value={formData.weight}
                    onChange={handleInputChange}
                    step="0.1"
                    min="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Additional Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    name="customTags"
                    value={formData.customTags}
                    onChange={handleInputChange}
                    placeholder="electronics, gadgets, trending"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Preview */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Description Preview</h3>
            
            {/* Amazon Link Preview */}
            {productData?.asin && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-center text-orange-800 mb-2">
                  <CheckCircleIcon className="h-4 w-4 mr-2" />
                  <span className="text-sm font-medium">Amazon Link Included</span>
                </div>
                <a
                  href={`https://www.amazon.com/dp/${productData.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-orange-500 text-white px-3 py-1 rounded text-sm font-medium hover:bg-orange-600 transition-colors"
                >
                  📱 View on Amazon
                </a>
              </div>
            )}

            {/* Description Preview */}
            <div className="border border-gray-300 rounded-lg p-4 max-h-96 overflow-y-auto">
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: previewDescription }}
              />
            </div>

            {/* Product Info Summary */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Product Summary</h4>
              <div className="space-y-1 text-sm text-gray-600">
                <div><strong>ASIN:</strong> {productData?.asin || 'N/A'}</div>
                <div><strong>FNSKU:</strong> {productData?.fnsku || 'N/A'}</div>
                <div><strong>Category:</strong> {productData?.category || 'N/A'}</div>
                <div><strong>Selling Price:</strong> ${calculatePrice()}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <button
            onClick={testShopifyConnection}
            className="text-sm text-gray-600 hover:text-gray-800 underline"
          >
            Test Shopify Connection
          </button>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateListing}
              disabled={isCreating || !productData}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center"
            >
              {isCreating ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent mr-2"></div>
                  Creating...
                </>
              ) : (
                <>
                  <ShoppingBagIcon className="h-4 w-4 mr-2" />
                  Create Listing
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopifyListing; 