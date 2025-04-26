import axios from 'axios';
import { supabase } from '../config/supabaseClient';
import { productLookupService as dbProductLookupService } from './databaseService';

// Axios instance for API calls
const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Set up response interceptor for error handling
apiClient.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error.message);
    return Promise.reject(error);
  }
);

// Add this near the top of the file, after the other imports
const FNSKU_TO_ASIN_API_KEY = '20a98a6a-437e-497c-b64c-ec97ec2fbc19'; // TEMPORARY - Move to .env file in production
const FNSKU_API_ENDPOINT = 'https://ato.fnskutoasin.com/api/v1/ScanTask/GetMyByBarCode';

// Scan task service for managing scan tasks
export const scanTaskService = {
  /**
   * Get all scan tasks for the current user
   * @param {Object} options - Query options
   * @param {string} options.searchString - Optional search string
   * @param {number} options.pageSize - Page size (default: 10)
   * @param {number} options.pageNumber - Page number (default: 1)
   * @returns {Promise<Object>} - Paginated list of scan tasks
   */
  async getMyTasks(options = {}) {
    try {
      const { searchString = '', pageSize = 10, pageNumber = 1 } = options;
      const apiKey = import.meta.env.VITE_F2A_BARCODE_API_KEY;
      const apiUrl = import.meta.env.VITE_API_URL;
      
      // Construct query parameters
      const params = new URLSearchParams();
      if (searchString) params.append('SearchString', searchString);
      params.append('PageSize', pageSize);
      params.append('PageNumber', pageNumber);
      
      const response = await axios.get(`${apiUrl}/ScanTask/GetMy`, {
        params,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error fetching scan tasks:', error);
      return {
        succeeded: false,
        messages: [error.message || 'Failed to fetch scan tasks'],
        data: [],
        totalCount: 0,
        pageSize: options.pageSize || 10,
        currentPage: options.pageNumber || 1,
        totalPages: 0
      };
    }
  },
  
  /**
   * Get a specific scan task by barcode
   * @param {string} barCode - The barcode to look up
   * @returns {Promise<Object>} - The scan task data
   */
  async getTaskByBarcode(barCode) {
    try {
      if (!barCode) {
        throw new Error('Barcode is required');
      }
      
      const apiKey = import.meta.env.VITE_F2A_BARCODE_API_KEY;
      const apiUrl = import.meta.env.VITE_API_URL;
      
      const response = await axios.get(`${apiUrl}/ScanTask/GetMyByBarCode`, {
        params: { barCode },
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error fetching scan task for barcode ${barCode}:`, error);
      return {
        succeeded: false,
        messages: [error.message || `Failed to fetch scan task for barcode ${barCode}`],
        data: null
      };
    }
  },
  
  /**
   * Add a new scan task or get an existing one
   * @param {string} barCode - The barcode to add or get
   * @returns {Promise<Object>} - The scan task data
   */
  async addOrGetTask(barCode) {
    try {
      if (!barCode) {
        throw new Error('Barcode is required');
      }
      
      const apiKey = import.meta.env.VITE_F2A_BARCODE_API_KEY;
      const apiUrl = import.meta.env.VITE_API_URL;
      
      const response = await axios.post(`${apiUrl}/ScanTask/AddOrGet`, 
        { barCode },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error(`Error adding/getting scan task for barcode ${barCode}:`, error);
      return {
        succeeded: false,
        messages: [error.message || `Failed to add/get scan task for barcode ${barCode}`],
        data: null
      };
    }
  },
  
  /**
   * Get a specific scan task by ID
   * @param {number} id - The task ID
   * @returns {Promise<Object>} - The scan task data
   */
  async getTaskById(id) {
    try {
      if (!id) {
        throw new Error('Task ID is required');
      }
      
      const apiKey = import.meta.env.VITE_F2A_BARCODE_API_KEY;
      const apiUrl = import.meta.env.VITE_API_URL;
      
      const response = await axios.get(`${apiUrl}/ScanTask/GetMyById`, {
        params: { id },
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error fetching scan task with ID ${id}:`, error);
      return {
        succeeded: false,
        messages: [error.message || `Failed to fetch scan task with ID ${id}`],
        data: null
      };
    }
  }
};

// Mock product data for testing when API is unavailable
const mockProductData = {
  // Some example products
  'X00001': {
    fnsku: 'X00001',
    asin: 'B00X00001',
    sku: 'SKU-X00001',
    name: 'Premium Wireless Headphones',
    description: 'High-quality wireless headphones with noise cancellation',
    price: 79.99,
    category: 'Electronics',
    image_url: 'https://placeholder.pics/svg/300/DEDEDE/555555/Product%20X001',
    condition: 'New'
  },
  'X00002': {
    fnsku: 'X00002',
    asin: 'B00X00002',
    sku: 'SKU-X00002',
    name: 'Deluxe Kitchen Knife Set',
    description: 'Professional 5-piece kitchen knife set with block',
    price: 49.99,
    category: 'Home & Kitchen',
    image_url: 'https://placeholder.pics/svg/300/DEDEDE/555555/Product%20X002',
    condition: 'New'
  }
};

// Mock API service for inventory management
const apiService = {
  async getInventory() {
    // In a real app with Supabase:
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching inventory:', error);
      throw error;
    }
    
    return data || [];
  },
  
  async getInventoryItem(id) {
    // In a real app with Supabase:
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error(`Error fetching inventory item ${id}:`, error);
      throw error;
    }
    
    return data;
  },
  
  async updateInventoryItem(id, itemData) {
    // In a real app with Supabase:
    const { data, error } = await supabase
      .from('inventory')
      .update(itemData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error(`Error updating inventory item ${id}:`, error);
      throw error;
    }
    
    return data;
  },
  
  async addInventoryItem(itemData) {
    // In a real app with Supabase:
    const { data, error } = await supabase
      .from('inventory')
      .insert(itemData)
      .select()
      .single();
    
    if (error) {
      console.error('Error adding inventory item:', error);
      throw error;
    }
    
    return data;
  },
  
  async deleteInventoryItem(id) {
    // In a real app with Supabase:
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error(`Error deleting inventory item ${id}:`, error);
      throw error;
    }
    
    return true;
  },
  
  async getProducts() {
    // In a real app with Supabase:
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
    
    return data || [];
  },
  
  // Get all available product categories
  async getProductCategories() {
    return [
      'All Categories',
      'Electronics',
      'Books',
      'Clothing',
      'Home & Kitchen',
      'Toys & Games',
      'Beauty & Personal Care',
      'Sports & Outdoors',
      'Grocery',
      'Tools & Home Improvement',
      'Health & Household'
    ];
  }
};

// API service for product lookup data persistence and caching
export const apiProductLookupService = {
  // Save product lookup data to database
  async saveProductLookup(productData, userId) {
    try {
      return await dbProductLookupService.saveProductLookup(productData, userId);
    } catch (error) {
      console.error('Error saving product lookup:', error);
      return null;
    }
  },

  // Check if product lookup data exists in database
  async getProductLookup(fnsku, userId) {
    try {
      return await dbProductLookupService.getProductByFnsku(fnsku, userId);
    } catch (error) {
      console.error('Error getting product lookup:', error);
      return null;
    }
  },
  
  // Search for products by any field (name, description, ASIN, SKU, etc.)
  async searchProducts(query, options = {}) {
    try {
      // Get recent lookups from the user
      const { userId } = options;
      if (!query && userId) {
        return await dbProductLookupService.getRecentLookups(userId, options.limit || 10);
      }
      
      // In the future, implement a more sophisticated search
      // For now, return recent lookups
      return await dbProductLookupService.getRecentLookups(userId, options.limit || 10);
    } catch (error) {
      console.error('Error searching products:', error);
      return [];
    }
  }
};

/**
 * Direct API call to get product lookup information
 * @param {string} code - Barcode or FNSKU to look up
 * @returns {Promise<Object|null>} - Product data or null if not found
 */
export const getProductLookup = async (code) => {
  try {
    // First check if we have this in our local database
    const localData = await dbProductLookupService.getProductByFnsku(code);
    if (localData) {
      return localData;
    }
    
    // If not found locally, use the fetchProductByFnsku function without forcing mock data
    return await fetchProductByFnsku(code);
  } catch (error) {
    console.error('Error in getProductLookup:', error);
    // Always try to return something useful if environment allows mock data
    if (import.meta.env.VITE_USE_MOCK_DATA === 'true') {
      return generateMockProductData(code);
    }
    return null;
  }
};

/**
 * Fetches product details by FNSKU from database or external API
 * @param {string} fnsku - The FNSKU to look up
 * @param {Object} options - Options for the lookup
 * @param {boolean} options.useMock - Whether to use mock data if API fails
 * @param {string} options.userId - User ID for tracking lookups
 * @param {number} options.maxRetries - Maximum number of API retries (default: 3)
 * @returns {Promise<Object|null>} - Product data or null if not found
 */
export const fetchProductByFnsku = async (fnsku, options = {}) => {
  // Use mock data by default if USE_MOCK_DATA is set in env
  const defaultUseMock = import.meta.env.VITE_USE_MOCK_DATA === 'true';
  const { useMock = defaultUseMock, userId = 'anonymous', maxRetries = 3 } = options;
  
  if (!fnsku) {
    console.error('fetchProductByFnsku called without FNSKU');
    return null;
  }
  
  console.log(`Looking up product with FNSKU: ${fnsku}, userId: ${userId}, useMock: ${useMock}`);
  
  try {
    // First check if we have this product cached in our database
    const cachedProduct = await dbProductLookupService.getProductByFnsku(fnsku);
    
    if (cachedProduct) {
      console.log('Found cached product in database');
      // Update the last lookup timestamp in the background
      dbProductLookupService.updateLastLookup(fnsku, userId).catch(error => {
        console.error('Failed to update last lookup timestamp:', error);
      });
      return cachedProduct;
    }
    
    console.log('No cached product found, fetching from API');
    
    let product = null;
    let lastError = null;
    
    // Replace the fetchWithRetry function in fetchProductByFnsku with this implementation
    const fetchWithRetry = async (attempt = 0) => {
      if (attempt >= maxRetries) {
        throw new Error(`Maximum retries (${maxRetries}) exceeded`);
      }
      
      let response;
      let errorOccurred = null;
      
      try {
        console.log(`API attempt ${attempt + 1}/${maxRetries} for FNSKU: ${fnsku}`);
        
        // --- MODIFIED: Always attempt the real API call first --- 
        const apiUrl = `${FNSKU_API_ENDPOINT}?BarCode=${fnsku}`;
        console.log(`Calling FNSKU-to-ASIN API: ${apiUrl}`);
        
        response = await axios.get(apiUrl, {
          headers: {
            'accept': 'application/json',
            'api-key': FNSKU_TO_ASIN_API_KEY
          },
          timeout: 10000 // 10 second timeout
        });
        
        console.log('Raw API response:', response.data);
        
        // Check if response is successful and contains data
        if (response.status === 200 && response.data && response.data.succeeded && response.data.data) {
          const apiData = response.data.data;
          
          // Format the API response to match our internal structure
          return {
            fnsku: fnsku,
            asin: apiData.asin || `B${fnsku.slice(-9)}`,
            sku: `SKU-${fnsku.slice(-6)}`, 
            name: `Amazon Product (ASIN: ${apiData.asin})`,
            description: `Product details for FNSKU: ${fnsku}`,
            price: 0, 
            category: 'Amazon Products',
            image_url: `https://placeholder.pics/svg/300/DEDEDE/555555/ASIN${apiData.asin}`,
            condition: 'New'
          };
        } else if (response.status === 200 && response.data && !response.data.succeeded) {
          // API returned success status but with an error message inside
          const apiErrorMessage = response.data.messages?.join(', ') || 'API reported failure';
          console.error('API returned error message:', apiErrorMessage);
          throw new Error(`API error: ${apiErrorMessage}`); 
        } else {
          // Unexpected status code
          throw new Error(`API returned status ${response.status}`);
        }
        // --- END MODIFIED API Call Logic ---
        
      } catch (error) {
        console.error(`API call attempt ${attempt + 1} failed:`, error.message);
        errorOccurred = error; // Store the error
        
        // --- MODIFIED: Only use mock data here if API failed AND useMock is true ---
        if (useMock) {
          console.warn('API call failed, falling back to mock data as requested.');
          return mockProductData[fnsku] || generateMockProductData(fnsku);
        }
        // --- END MODIFIED Mock Data Fallback ---

        // If not using mock data, proceed to retry logic
        if (error.response) {
          // Handle specific response errors for retry logic
          if (error.response.status === 429 || error.response.status >= 500) {
              const waitTime = Math.pow(2, attempt + 1) * 1000;
              console.log(`API Error (${error.response.status}), waiting ${waitTime}ms before retry`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              return fetchWithRetry(attempt + 1);
          } else if (error.response.status === 404) {
              console.log('Product not found in API (404).');
              return null; // Don't retry on 404
          } else {
              // Other client errors (4xx) - don't retry, throw the original error
              throw errorOccurred;
          }
        } else if (error.request) {
          // Network error (no response)
          const waitTime = Math.pow(2, attempt + 1) * 1000;
          console.log(`No response from server, waiting ${waitTime}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return fetchWithRetry(attempt + 1);
        } else {
          // Other errors (e.g., setup issues) - don't retry
          throw errorOccurred;
        }
      }
    };
    
    try {
      // Try to fetch from API with retry logic
      product = await fetchWithRetry();
    } catch (error) {
      console.error('All API attempts failed:', error.message);
      lastError = error;
      
      // If all API attempts fail and useMock is true, use mock data
      if (useMock) {
        console.log('Falling back to mock data after API failure');
        product = mockProductData[fnsku] || generateMockProductData(fnsku);
      } else {
        // If not using mock data and API failed, return null
        return null;
      }
    }
    
    if (product) {
      // Save the product lookup in the background
      dbProductLookupService.saveProductLookup(product, userId).catch(error => {
        console.error('Failed to save product lookup:', error);
      });
    }
    
    return product;
  } catch (error) {
    console.error('Error in fetchProductByFnsku:', error);
    return null;
  }
};

/**
 * Generates mock product data when API fails
 * @param {string} fnsku - The FNSKU to use in the mock data
 * @returns {Object} - Mock product data
 */
const generateMockProductData = (fnsku) => {
  // Generate a somewhat realistic product name based on the FNSKU
  const categories = ['Electronics', 'Home & Kitchen', 'Toys & Games', 'Books', 'Clothing', 'Beauty & Personal Care', 'Sports & Outdoors'];
  const adjectives = ['Premium', 'Deluxe', 'Essential', 'Professional', 'Classic', 'Modern', 'Innovative'];
  const products = ['Gadget', 'Device', 'Widget', 'Tool', 'Accessory', 'Component', 'Set', 'Kit', 'System', 'Package'];
  
  // Use parts of the FNSKU to seed the mock data
  const numPart = fnsku.replace(/\D/g, '') || '12345';
  const hash = parseInt(numPart) % 100;
  
  const adjIndex = hash % adjectives.length;
  const prodIndex = (hash + 3) % products.length;
  const catIndex = (hash + 7) % categories.length;
  
  const productName = `${adjectives[adjIndex]} ${products[prodIndex]} ${fnsku.slice(-4)}`;
  const category = categories[catIndex];
  const price = 9.99 + (hash % 90);
  
  return {
    fnsku: fnsku,
    asin: `B${fnsku.slice(-9)}`,
    sku: `SKU-${fnsku.slice(-6)}`,
    name: productName,
    description: `High-quality ${productName.toLowerCase()} for all your needs.`,
    price: price,
    category: category,
    image_url: `https://placeholder.pics/svg/300/DEDEDE/555555/Product%20${fnsku.slice(-4)}`,
    condition: 'New'
  };
};

export default apiClient; 