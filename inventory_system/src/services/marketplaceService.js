// Marketplace service for eBay and Shopify integrations
import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * eBay API service for creating listings
 */
export const ebayService = {
  /**
   * Create a new eBay listing
   * @param {Object} productData - Product information from scanning
   * @param {Object} listingOptions - eBay-specific listing options
   * @returns {Promise<Object>} - eBay listing response
   */
  async createListing(productData, listingOptions) {
    try {
      const listingData = {
        title: listingOptions.title || productData.name || productData.description,
        description: listingOptions.description || productData.description,
        price: listingOptions.price || productData.price,
        condition: listingOptions.condition || 'New',
        category: listingOptions.category,
        sku: productData.sku || productData.fnsku,
        upc: productData.upc,
        quantity: listingOptions.quantity || 1,
        shippingOptions: listingOptions.shippingOptions || {
          type: 'Flat',
          cost: 0,
          freeShipping: true
        },
        returnPolicy: listingOptions.returnPolicy || {
          returnsAccepted: true,
          refundMethod: 'MoneyBack',
          returnPeriod: 'Days_30'
        },
        paymentMethods: listingOptions.paymentMethods || ['PayPal', 'CreditCard'],
        images: listingOptions.images || [],
        itemSpecifics: listingOptions.itemSpecifics || {}
      };

      const response = await apiClient.post('/ebay/create-listing', listingData);
      return response.data;
    } catch (error) {
      console.error('Error creating eBay listing:', error);
      throw new Error(`Failed to create eBay listing: ${error.message}`);
    }
  },

  /**
   * Get eBay categories for product categorization
   * @param {string} query - Search query for categories
   * @returns {Promise<Array>} - Array of eBay categories
   */
  async getCategories(query = '') {
    try {
      const response = await apiClient.get('/ebay/categories', {
        params: { query }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching eBay categories:', error);
      return [];
    }
  },

  /**
   * Get suggested eBay category based on product data
   * @param {Object} productData - Product information
   * @returns {Promise<Object>} - Suggested category
   */
  async getSuggestedCategory(productData) {
    try {
      const response = await apiClient.post('/ebay/suggest-category', {
        title: productData.name || productData.description,
        description: productData.description,
        upc: productData.upc
      });
      return response.data;
    } catch (error) {
      console.error('Error getting suggested eBay category:', error);
      return null;
    }
  }
};

/**
 * Shopify API service for creating products
 */
export const shopifyService = {
  /**
   * Create a new Shopify product
   * @param {Object} productData - Product information from scanning
   * @param {Object} productOptions - Shopify-specific product options
   * @returns {Promise<Object>} - Shopify product response
   */
  async createProduct(productData, productOptions) {
    try {
      const shopifyProduct = {
        title: productOptions.title || productData.name || productData.description,
        body_html: productOptions.description || productData.description,
        vendor: productOptions.vendor || 'Your Store',
        product_type: productOptions.productType || productData.category,
        tags: productOptions.tags || [],
        published: productOptions.published !== false, // Default to published
        template_suffix: productOptions.template,
        metafields_global_title_tag: productOptions.seoTitle,
        metafields_global_description_tag: productOptions.seoDescription,
        variants: [{
          price: productOptions.price || productData.price || '0.00',
          compare_at_price: productOptions.compareAtPrice,
          sku: productData.sku || productData.fnsku,
          barcode: productData.upc,
          inventory_quantity: productOptions.quantity || 1,
          inventory_management: 'shopify',
          inventory_policy: 'deny', // Don't allow overselling
          fulfillment_service: 'manual',
          weight: productOptions.weight || 0,
          weight_unit: productOptions.weightUnit || 'lb',
          requires_shipping: productOptions.requiresShipping !== false,
          taxable: productOptions.taxable !== false
        }],
        options: productOptions.options || [{
          name: 'Title',
          values: ['Default Title']
        }],
        images: productOptions.images || []
      };

      const response = await apiClient.post('/shopify/create-product', {
        product: shopifyProduct
      });
      return response.data;
    } catch (error) {
      console.error('Error creating Shopify product:', error);
      throw new Error(`Failed to create Shopify product: ${error.message}`);
    }
  },

  /**
   * Get Shopify collections for product organization
   * @returns {Promise<Array>} - Array of Shopify collections
   */
  async getCollections() {
    try {
      const response = await apiClient.get('/shopify/collections');
      return response.data;
    } catch (error) {
      console.error('Error fetching Shopify collections:', error);
      return [];
    }
  },

  /**
   * Upload image to Shopify
   * @param {File} imageFile - Image file to upload
   * @param {string} productId - Shopify product ID (optional, for existing products)
   * @returns {Promise<Object>} - Image upload response
   */
  async uploadImage(imageFile, productId = null) {
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      if (productId) {
        formData.append('product_id', productId);
      }

      const response = await apiClient.post('/shopify/upload-image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error uploading image to Shopify:', error);
      throw new Error(`Failed to upload image: ${error.message}`);
    }
  }
};

/**
 * Combined marketplace service for creating listings on multiple platforms
 */
export const marketplaceService = {
  /**
   * Create listings on multiple marketplaces simultaneously
   * @param {Object} productData - Product information from scanning
   * @param {Object} options - Listing options for each marketplace
   * @returns {Promise<Object>} - Results from all marketplaces
   */
  async createMultipleListings(productData, options) {
    const results = {
      ebay: null,
      shopify: null,
      errors: []
    };

    // Create eBay listing if requested
    if (options.ebay && options.ebay.enabled) {
      try {
        results.ebay = await ebayService.createListing(productData, options.ebay);
      } catch (error) {
        results.errors.push(`eBay: ${error.message}`);
      }
    }

    // Create Shopify product if requested
    if (options.shopify && options.shopify.enabled) {
      try {
        results.shopify = await shopifyService.createProduct(productData, options.shopify);
      } catch (error) {
        results.errors.push(`Shopify: ${error.message}`);
      }
    }

    return results;
  },

  /**
   * Get marketplace-specific pricing suggestions
   * @param {Object} productData - Product information
   * @returns {Promise<Object>} - Pricing suggestions for each marketplace
   */
  async getPricingSuggestions(productData) {
    try {
      const response = await apiClient.post('/marketplace/pricing-suggestions', {
        asin: productData.asin,
        upc: productData.upc,
        category: productData.category,
        msrp: productData.price
      });
      return response.data;
    } catch (error) {
      console.error('Error getting pricing suggestions:', error);
      return {
        ebay: { suggested: productData.price * 0.9 },
        shopify: { suggested: productData.price }
      };
    }
  }
};

export default marketplaceService; 