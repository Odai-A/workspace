import axios from 'axios';

// Shopify API configuration
// TODO: Move these to environment variables in production
const SHOPIFY_CONFIG = {
  store: import.meta.env.VITE_SHOPIFY_STORE || 'your-store-name', // e.g., 'mystore' for mystore.myshopify.com
  apiKey: import.meta.env.VITE_SHOPIFY_API_KEY || 'your-api-key',
  password: import.meta.env.VITE_SHOPIFY_PASSWORD || 'your-password', // API password/access token
  apiVersion: '2023-10' // Current Shopify API version
};

// Create axios instance for Shopify API
const shopifyApi = axios.create({
  baseURL: `https://${SHOPIFY_CONFIG.apiKey}:${SHOPIFY_CONFIG.password}@${SHOPIFY_CONFIG.store}.myshopify.com/admin/api/${SHOPIFY_CONFIG.apiVersion}`,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 30000 // 30 second timeout
});

// Shopify service for automated product listing
export const shopifyService = {
  /**
   * Test connection to Shopify store
   * @returns {Promise<boolean>} - True if connection successful
   */
  async testConnection() {
    try {
      console.log('🧪 Testing Shopify connection...');
      const response = await shopifyApi.get('/shop.json');
      console.log('✅ Shopify connection successful:', response.data.shop.name);
      return true;
    } catch (error) {
      console.error('❌ Shopify connection failed:', error.response?.data || error.message);
      return false;
    }
  },

  /**
   * Create a product listing on Shopify from scanned product data
   * @param {Object} productData - Product data from scanner
   * @param {Object} options - Listing options
   * @returns {Promise<Object>} - Shopify product creation result
   */
  async createProductListing(productData, options = {}) {
    try {
      console.log('🛍️ Creating Shopify listing for:', productData);

      // Generate product title
      const title = options.customTitle || productData.name || `Amazon Product ${productData.asin || productData.fnsku}`;
      
      // Generate product description with Amazon link
      const description = this.generateProductDescription(productData, options);
      
      // Calculate price (with markup if specified)
      const basePrice = productData.price || 0;
      const markup = options.markup || 1.5; // 50% markup by default
      const sellingPrice = basePrice > 0 ? (basePrice * markup).toFixed(2) : options.defaultPrice || '29.99';
      
      // Generate product handle (URL slug)
      const handle = this.generateHandle(title);
      
      // Prepare Shopify product data
      const shopifyProduct = {
        product: {
          title: title,
          body_html: description,
          vendor: options.vendor || 'Amazon Arbitrage',
          product_type: productData.category || options.productType || 'General',
          handle: handle,
          status: options.status || 'draft', // Start as draft for review
          tags: this.generateTags(productData, options),
          variants: [
            {
              title: 'Default Title',
              price: sellingPrice,
              sku: productData.sku || productData.fnsku || productData.asin,
              inventory_management: 'shopify',
              inventory_quantity: options.quantity || 1,
              weight: options.weight || 1,
              weight_unit: 'lb'
            }
          ],
          images: options.images ? options.images.map(img => ({ src: img })) : [],
          metafields: [
            {
              namespace: 'amazon',
              key: 'asin',
              value: productData.asin || '',
              type: 'single_line_text_field'
            },
            {
              namespace: 'amazon',
              key: 'fnsku',
              value: productData.fnsku || '',
              type: 'single_line_text_field'
            },
            {
              namespace: 'amazon',
              key: 'original_price',
              value: basePrice.toString(),
              type: 'single_line_text_field'
            },
            {
              namespace: 'scanner',
              key: 'scan_date',
              value: new Date().toISOString(),
              type: 'single_line_text_field'
            }
          ]
        }
      };

      console.log('📦 Shopify product payload:', shopifyProduct);

      // Create product on Shopify
      const response = await shopifyApi.post('/products.json', shopifyProduct);
      
      if (response.data && response.data.product) {
        const createdProduct = response.data.product;
        console.log('✅ Shopify product created successfully:', createdProduct.id);
        
        return {
          success: true,
          product: createdProduct,
          shopifyUrl: `https://${SHOPIFY_CONFIG.store}.myshopify.com/admin/products/${createdProduct.id}`,
          storeUrl: `https://${SHOPIFY_CONFIG.store}.myshopify.com/products/${createdProduct.handle}`,
          message: 'Product created successfully on Shopify!'
        };
      } else {
        throw new Error('No product data returned from Shopify');
      }

    } catch (error) {
      console.error('❌ Error creating Shopify product:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errors || error.message,
        message: 'Failed to create product on Shopify'
      };
    }
  },

  /**
   * Generate HTML description with Amazon link
   * @param {Object} productData - Product data
   * @param {Object} options - Description options
   * @returns {string} - HTML description
   */
  generateProductDescription(productData, options = {}) {
    const asin = productData.asin;
    const amazonUrl = asin ? `https://www.amazon.com/dp/${asin}` : null;
    
    let description = `<div class="product-description">`;
    
    // Main description
    if (productData.description) {
      description += `<p>${productData.description}</p>`;
    }
    
    // Product details
    description += `<div class="product-details">`;
    description += `<h4>Product Details:</h4>`;
    description += `<ul>`;
    
    if (productData.category) {
      description += `<li><strong>Category:</strong> ${productData.category}</li>`;
    }
    
    if (productData.fnsku) {
      description += `<li><strong>FNSKU:</strong> ${productData.fnsku}</li>`;
    }
    
    if (asin) {
      description += `<li><strong>ASIN:</strong> ${asin}</li>`;
    }
    
    if (productData.upc) {
      description += `<li><strong>UPC:</strong> ${productData.upc}</li>`;
    }
    
    description += `</ul>`;
    description += `</div>`;
    
    // Amazon link section
    if (amazonUrl) {
      description += `<div class="amazon-section" style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 8px;">`;
      description += `<h4>🛒 View Original Product</h4>`;
      description += `<p>See this product on Amazon for additional details, reviews, and specifications.</p>`;
      description += `<a href="${amazonUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #ff9900; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">`;
      description += `📱 View on Amazon`;
      description += `</a>`;
      description += `</div>`;
    }
    
    // Disclaimer
    description += `<div class="disclaimer" style="margin-top: 20px; font-size: 12px; color: #666;">`;
    description += `<p><em>This product is sourced from Amazon. Product details and availability may vary.</em></p>`;
    description += `</div>`;
    
    description += `</div>`;
    
    return description;
  },

  /**
   * Generate URL handle from product title
   * @param {string} title - Product title
   * @returns {string} - URL-friendly handle
   */
  generateHandle(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50); // Shopify handle limit
  },

  /**
   * Generate product tags
   * @param {Object} productData - Product data
   * @param {Object} options - Tag options
   * @returns {string} - Comma-separated tags
   */
  generateTags(productData, options = {}) {
    const tags = ['amazon-arbitrage', 'scanned-product'];
    
    if (productData.category) {
      tags.push(productData.category.toLowerCase().replace(/\s+/g, '-'));
    }
    
    if (productData.asin) {
      tags.push('has-asin');
    }
    
    if (productData.fnsku) {
      tags.push('has-fnsku');
    }
    
    if (options.customTags) {
      tags.push(...options.customTags);
    }
    
    return tags.join(', ');
  },

  /**
   * Get existing products from Shopify
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} - Array of products
   */
  async getProducts(filters = {}) {
    try {
      const params = new URLSearchParams();
      
      if (filters.limit) params.append('limit', filters.limit);
      if (filters.since_id) params.append('since_id', filters.since_id);
      if (filters.title) params.append('title', filters.title);
      if (filters.vendor) params.append('vendor', filters.vendor);
      if (filters.handle) params.append('handle', filters.handle);
      
      const response = await shopifyApi.get(`/products.json?${params}`);
      return response.data.products || [];
    } catch (error) {
      console.error('Error fetching Shopify products:', error);
      return [];
    }
  },

  /**
   * Check if product already exists on Shopify
   * @param {Object} productData - Product data to check
   * @returns {Promise<Object|null>} - Existing product or null
   */
  async findExistingProduct(productData) {
    try {
      // Check by ASIN first
      if (productData.asin) {
        const products = await this.getProducts({ limit: 250 });
        const existing = products.find(p => 
          p.metafields?.some(m => m.namespace === 'amazon' && m.key === 'asin' && m.value === productData.asin)
        );
        if (existing) return existing;
      }
      
      // Check by FNSKU
      if (productData.fnsku) {
        const products = await this.getProducts({ limit: 250 });
        const existing = products.find(p => 
          p.variants?.some(v => v.sku === productData.fnsku)
        );
        if (existing) return existing;
      }
      
      return null;
    } catch (error) {
      console.error('Error checking for existing product:', error);
      return null;
    }
  }
};

export default shopifyService; 