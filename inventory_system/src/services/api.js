import axios from 'axios';
import { mockService } from './mockData';

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
      
      // Use the same endpoint base and key as the GetMyByBarCode call
      const apiKey = FNSKU_TO_ASIN_API_KEY; // Use consistent key
      // Construct the AddOrGet URL from the known base endpoint
      const addOrGetUrl = FNSKU_API_ENDPOINT.replace('/GetMyByBarCode', '/AddOrGet'); 
      console.log(`Calling AddOrGet API: ${addOrGetUrl} for ${barCode}`); // Add log
      
      const response = await axios.post(addOrGetUrl, 
        { barCode },
        {
          headers: {
            'api-key': apiKey, // Use consistent header
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('AddOrGet API Response:', response.data); // Add log
      // We might not need the response data directly, just confirmation
      if (!response.data || !response.data.succeeded) {
        // Log a warning if AddOrGet didn't succeed but don't stop the process
        console.warn('AddOrGet call did not report success:', response.data?.messages?.join(', '));
      }
      
      return response.data; // Return the response anyway
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
    return await mockService.getInventory();
  },
  
  async getInventoryItem(id) {
    return await mockService.getInventoryItem(id);
  },
  
  async updateInventoryItem(id, itemData) {
    return await mockService.updateInventory(id, itemData);
  },
  
  async addInventoryItem(itemData) {
    return await mockService.createProduct(itemData);
  },
  
  async deleteInventoryItem(id) {
    return await mockService.deleteProduct(id);
  },
  
  async getProducts() {
    return await mockService.getProducts();
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
      return await mockService.createProduct(productData);
    } catch (error) {
      console.error('Error saving product lookup:', error);
      return null;
    }
  },

  // Check if product lookup data exists in database
  async getProductLookup(fnsku, userId) {
    try {
      return await mockService.getProduct(fnsku);
    } catch (error) {
      console.error('Error getting product lookup:', error);
      return null;
    }
  },
  
  // Search for products by any field (name, description, ASIN, SKU, etc.)
  async searchProducts(query, options = {}) {
    try {
      const { data } = await mockService.getProducts();
      if (!query) return data;
      
      // Simple search implementation
      return data.filter(product => 
        Object.values(product).some(value => 
          String(value).toLowerCase().includes(query.toLowerCase())
        )
      );
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
    // First check if we have this in our mock data
    const { data: localData } = await mockService.getProduct(code);
    if (localData) {
      return localData;
    }
    
    // If not found locally, use the fetchProductByFnsku function
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
    // First check if we have this product in our mock data
    const { data: cachedProduct } = await mockService.getProduct(fnsku);
    
    if (cachedProduct) {
      console.log('Found product in mock data:', cachedProduct);
      return cachedProduct;
    }
    
    console.log('No cached product found, proceeding to lookup...');
    
    // If not found in mock data and we're not using mock data, try the external API
    if (!useMock) {
      try {
        // Attempt to add/register the FNSKU with the external service first
        await scanTaskService.addOrGetTask(fnsku);
        
        // Poll for results
        let product = null;
        let apiData = null;
        const maxAttempts = 5;
        const pollInterval = 1000;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          console.log(`Polling attempt ${attempt}/${maxAttempts} for FNSKU: ${fnsku}`);
          const response = await axios.get(FNSKU_API_ENDPOINT, {
            params: { BarCode: fnsku },
            headers: { 
              'accept': 'application/json', 
              'api-key': FNSKU_TO_ASIN_API_KEY 
            },
            timeout: 5000
          });
          
          if (response.data?.succeeded && response.data?.data?.asin) {
            apiData = response.data.data;
            break;
          }
          
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }
        }

        if (apiData) {
          product = {
            fnsku: fnsku,
            asin: apiData.asin,
            sku: `SKU-${fnsku.slice(-6)}`,
            name: `Amazon Product (ASIN: ${apiData.asin})`,
            description: `Product details for FNSKU: ${fnsku}`,
            price: 0,
            category: 'Amazon Products',
            image_url: `https://placeholder.pics/svg/300/DEDEDE/555555/ASIN${apiData.asin}`,
            condition: 'New'
          };
          
          // Save to mock data
          await mockService.createProduct(product);
          return product;
        }
      } catch (error) {
        console.error('Error fetching from external API:', error);
      }
    }
    
    // If we get here, either we're using mock data or the API call failed
    return generateMockProductData(fnsku);
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

// Export the mock service as our API service
export const api = mockService;

export default api; 