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

// External fnskutoasin.com API service
export const externalApiService = {
  /**
   * Test the API connection with a simple request
   * @returns {Promise<boolean>} - True if API is accessible, false otherwise
   */
  async testConnection() {
    try {
      const BASE_URL = 'https://ato.fnskutoasin.com';
      const API_KEY = '20a98a6a-437e-497c-b64c-ec97ec2fbc19';
      
      console.log('🧪 Testing API connection...');
      
      // Try with api-key header first
      const headers1 = {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      
      try {
        const response = await axios.get(`${BASE_URL}/api/v1/ScanTask/GetByBarCode`, {
          params: { BarCode: 'TEST123' },
          headers: headers1,
          timeout: 10000
        });
        console.log('✅ API test successful with api-key header');
        return true;
      } catch (error) {
        if (error.response?.status === 401) {
          console.log('🔄 Testing with Authorization header...');
          
          // Try with Authorization header
          const headers2 = {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          };
          
          try {
            const response = await axios.get(`${BASE_URL}/api/v1/ScanTask/GetByBarCode`, {
              params: { BarCode: 'TEST123' },
              headers: headers2,
              timeout: 10000
            });
            console.log('✅ API test successful with Authorization header');
            return true;
          } catch (error2) {
            console.log('❌ Both header formats failed:', error2.response?.status, error2.response?.data);
            return false;
          }
        } else {
          console.log('❌ API test failed:', error.response?.status, error.response?.data);
          return false;
        }
      }
    } catch (error) {
      console.log('❌ API test error:', error.message);
      return false;
    }
  },

  /**
   * Lookup FNSKU using the fnskutoasin.com API
   * @param {string} fnsku - The FNSKU to lookup
   * @returns {Promise<Object|null>} - Product data with ASIN or null if not found
   */
  async lookupFnsku(fnsku) {
    try {
      if (!fnsku) {
        throw new Error('FNSKU is required');
      }

      console.log(`🔍 Looking up FNSKU: ${fnsku} using fnskutoasin.com API`);
      
      // Base URL and API key from user's requirements
      const BASE_URL = 'https://ato.fnskutoasin.com';
      const API_KEY = '20a98a6a-437e-497c-b64c-ec97ec2fbc19';
      
      console.log(`🔑 Using API Key: ${API_KEY.substring(0, 8)}...`);
      console.log(`🌐 Using Base URL: ${BASE_URL}`);
      
      // First, try to get existing scan task by barcode
      const lookupUrl = `${BASE_URL}/api/v1/ScanTask/GetByBarCode`;
      
      const headers = {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      
      console.log(`📡 Calling: ${lookupUrl}`);
      console.log(`📋 Headers:`, { ...headers, 'api-key': `${headers['api-key'].substring(0, 8)}...` });
      
      // Try to lookup existing scan for this barcode
      const params = { BarCode: fnsku };
      
      let response;
      try {
        response = await axios.get(lookupUrl, { 
          headers, 
          params, 
          timeout: 30000 
        });
      } catch (error) {
        if (error.response?.status === 401) {
          console.log('🔄 First attempt failed with 401, trying alternative header format...');
          // Try alternative header format
          const altHeaders = {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          };
          
          console.log(`🔄 Retry with Authorization header...`);
          response = await axios.get(lookupUrl, { 
            headers: altHeaders, 
            params, 
            timeout: 30000 
          });
        } else {
          throw error;
        }
      }
      
      console.log(`✅ GET response status: ${response.status}`);
      console.log(`📄 GET response:`, response.data);
      
      let scanData = null;
      if (response.data?.succeeded && response.data?.data) {
        scanData = response.data.data;
        console.log('✅ Found existing scan data:', scanData);
      }
      
      // If no existing scan found, create a new scan task
      if (!scanData) {
        console.log('📝 No existing scan found, creating new scan task...');
        const addScanUrl = `${BASE_URL}/api/v1/ScanTask/AddOrGet`;
        
        const payload = {
          barCode: fnsku,
          callbackUrl: ""  // Optional callback URL
        };
        
        console.log(`📡 POST to: ${addScanUrl}`);
        console.log(`📦 POST payload:`, payload);
        
        try {
          response = await axios.post(addScanUrl, payload, { 
            headers, 
            timeout: 30000 
          });
        } catch (error) {
          if (error.response?.status === 401) {
            console.log('🔄 POST failed with 401, trying alternative header format...');
            // Try alternative header format
            const altHeaders = {
              'Authorization': `Bearer ${API_KEY}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            };
            
            console.log(`🔄 Retry POST with Authorization header...`);
            response = await axios.post(addScanUrl, payload, { 
              headers: altHeaders, 
              timeout: 30000 
            });
          } else {
            throw error;
          }
        }
        
        console.log(`✅ POST response status: ${response.status}`);
        console.log(`📄 POST response:`, response.data);
        
        if (response.data?.succeeded && response.data?.data) {
          scanData = response.data.data;
          console.log('✅ Created new scan task:', scanData);
        } else {
          throw new Error(`Failed to create scan task: ${response.data?.message || 'Unknown error'}`);
        }
      }
      
      // Extract ASIN and other data from the scan result
      if (scanData) {
        const asin = scanData.asin;
        
        console.log('🚀 [DEBUG] Raw scanData from API:', scanData);
        console.log('🚀 [DEBUG] Extracted ASIN from scanData.asin:', asin);
        console.log('🚀 [DEBUG] ASIN truthy check:', !!asin);
        
        // Create more descriptive product data based on what we received
        const productData = {
          fnsku: fnsku,
          asin: asin || '',
          name: asin ? `Amazon Product (ASIN: ${asin})` : `FNSKU: ${fnsku} (No ASIN found)`,
          description: asin ? `External API lookup found ASIN: ${asin} for FNSKU: ${fnsku}` : `External API processed FNSKU: ${fnsku} but no ASIN was found`,
          price: 0, // This API doesn't provide price data
          category: 'External API',
          condition: 'New',
          source: 'fnskutoasin.com',
          scan_task_id: scanData.id || '',
          task_state: scanData.taskState || '',
          assignment_date: scanData.assignmentDate || '',
          amazon_url: asin ? `https://www.amazon.com/dp/${asin}` : '',
          raw_data: scanData,
          image_url: '', // This API doesn't provide image URLs
          created_at: new Date().toISOString(),
          // Add a flag to indicate if ASIN was found
          asin_found: !!asin
        };
        
        console.log('🚀 [DEBUG] Final productData object:', productData);
        console.log('🚀 [DEBUG] Final productData.asin:', productData.asin);
        console.log('🎉 Successfully processed external API result:', productData);
        return productData;
      } else {
        console.log('❌ No data returned from external API');
        return null;
      }
      
    } catch (error) {
      console.error('❌ Error in external API lookup:', error);
      
      // Return more specific error information
      if (error.response) {
        console.error('API Response Error:', error.response.status, error.response.data);
      }
      
      throw error;
    }
  }
};

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
 * Now with smart code detection for ASINs vs FNSKUs and cost-effective lookups
 * @param {string} code - Barcode, ASIN, or FNSKU to look up
 * @returns {Promise<Object|null>} - Product data or null if not found
 */
export const getProductLookup = async (code) => {
  try {
    console.log(`🔍 Starting product lookup for code: ${code}`);
    
    // STEP 0: Detect what type of code this is
    const codeInfo = detectCodeType(code);
    console.log(`🏷️ Detected code type: ${codeInfo.type} (${codeInfo.description})`);
    
    // Handle ASINs directly - no need for external API
    if (codeInfo.type === 'ASIN') {
      console.log('📋 Code is an ASIN - creating direct product data (no API charge)');
      const asinData = generateAsinProductData(codeInfo.code);
      
      // Save ASIN data to local storage for consistency
      try {
        await mockService.createProduct(asinData);
        console.log('✅ ASIN data saved to local storage');
      } catch (saveError) {
        console.warn('⚠️ Could not save ASIN data to local storage:', saveError);
      }
      
      return asinData;
    }
    
    // For FNSKUs and other codes, continue with the original flow
    console.log(`📦 Processing as ${codeInfo.type}, checking local database first...`);
    
    // STEP 1: Check local mock data first (simulates your local database)
    console.log('📦 Step 1: Checking local database...');
    const { data: localData } = await mockService.getProduct(code);
    if (localData) {
      console.log('✅ Found in local database - no API charge!');
      return {
        ...localData,
        source: 'local_database',
        cost_status: 'no_charge',
        code_type: codeInfo.type
      };
    }
    
    console.log('❌ Not found in local database');
    
    // STEP 2: For FNSKUs, try external fnskutoasin.com API (this will cost money)
    if (codeInfo.type === 'FNSKU') {
      console.log('💰 Step 2: Trying external FNSKU API (this will be charged)...');
      try {
        const externalResult = await externalApiService.lookupFnsku(code);
        console.log('🚀 [DEBUG] externalApiService.lookupFnsku returned:', externalResult);
        console.log('🚀 [DEBUG] externalResult.asin:', externalResult?.asin);
        
        if (externalResult) {
          console.log('✅ Found via external API - charged lookup');
          
          // Prepare data for saving to local database
          const productToSave = {
            fnsku: externalResult.fnsku || code,
            asin: externalResult.asin || '',
            name: externalResult.name || `Product ${code}`,
            description: externalResult.description || externalResult.name || `External lookup for ${code}`,
            price: externalResult.price || 0,
            category: externalResult.category || 'External API',
            sku: externalResult.fnsku || code, // Use FNSKU as SKU for consistency
            lpn: externalResult.lpn || '', // LPN might not be available from external API
            upc: externalResult.upc || '',
            quantity: externalResult.quantity || 0,
            // Metadata
            source: 'external_api',
            external_lookup_date: new Date().toISOString(),
            original_lookup_code: code,
            scan_task_id: externalResult.scan_task_id || '',
            task_state: externalResult.task_state || '',
            asin_found: externalResult.asin_found || false,
            code_type: codeInfo.type
          };
          
          console.log('💾 Prepared data for saving:', productToSave);
          console.log('🚀 [DEBUG] productToSave.asin:', productToSave.asin);
          
          // STEP 3: Save external result to local database for future use
          console.log('💾 Step 3: Saving to local database for future cost savings...');
          try {
            await mockService.createProduct(productToSave);
            console.log('✅ Saved to local database - future lookups will be free!');
          } catch (saveError) {
            console.warn('⚠️ Could not save to local database:', saveError);
          }
          
          const finalResult = {
            ...externalResult,
            source: 'external_api',
            cost_status: 'charged',
            code_type: codeInfo.type
          };
          
          console.log('🚀 [DEBUG] Final result from getProductLookup:', finalResult);
          console.log('🚀 [DEBUG] Final result ASIN:', finalResult.asin);
          
          return finalResult;
        }
      } catch (apiError) {
        console.error('❌ External API failed:', apiError);
        console.log('🔄 Falling back to mock data generation...');
      }
    } else {
      console.log(`ℹ️ Skipping external API for ${codeInfo.type} (only supports FNSKUs)`);
    }
    
    // STEP 4: If external API fails and we're allowed to use mock data, generate it
    if (import.meta.env.VITE_USE_MOCK_DATA === 'true') {
      console.log('🎭 Step 4: Generating mock data as fallback...');
      const mockData = generateMockProductData(code);
      mockData.code_type = codeInfo.type;
      
      // Save mock data to local storage for consistency
      try {
        await mockService.createProduct(mockData);
      } catch (saveError) {
        console.warn('Could not save mock data:', saveError);
      }
      
      return {
        ...mockData,
        source: 'mock_data',
        cost_status: 'no_charge',
        code_type: codeInfo.type
      };
    }
    
    // STEP 5: Nothing found
    console.log('❌ Product not found anywhere');
    return null;
    
  } catch (error) {
    console.error('❌ Error in getProductLookup:', error);
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

// Helper function to detect what type of code was scanned
const detectCodeType = (code) => {
  const cleanCode = code.trim().toUpperCase();
  
  // ASIN patterns: Usually start with B0 and are 10 characters total
  // Examples: B08PNDD2XR, B0CHBJXG7G, B07ABC123D
  if (/^B0[0-9A-Z]{8}$/.test(cleanCode) || /^B[0-9]{2}[0-9A-Z]{7}$/.test(cleanCode)) {
    return {
      type: 'ASIN',
      code: cleanCode,
      description: 'Amazon Standard Identification Number'
    };
  }
  
  // UPC patterns: Usually 12 digits
  if (/^\d{12}$/.test(cleanCode)) {
    return {
      type: 'UPC',
      code: cleanCode,
      description: 'Universal Product Code'
    };
  }
  
  // EAN patterns: Usually 13 digits
  if (/^\d{13}$/.test(cleanCode)) {
    return {
      type: 'EAN',
      code: cleanCode,
      description: 'European Article Number'
    };
  }
  
  // Everything else is treated as FNSKU
  // FNSKUs are more variable in format: X001ABC123DEF, etc.
  return {
    type: 'FNSKU',
    code: cleanCode,
    description: 'Fulfillment Network Stock Keeping Unit'
  };
};

// Generate product data for ASINs without API call
const generateAsinProductData = (asin) => {
  return {
    fnsku: '', // ASINs don't have FNSKUs unless mapped
    asin: asin,
    name: `Amazon Product (ASIN: ${asin})`,
    description: `Direct ASIN lookup for ${asin}`,
    price: 0, // We don't have pricing data for direct ASINs
    category: 'Amazon Product',
    sku: asin, // Use ASIN as SKU
    lpn: '', // ASINs don't have LPNs
    upc: '',
    quantity: 0,
    source: 'asin_direct',
    cost_status: 'no_charge',
    amazon_url: `https://www.amazon.com/dp/${asin}`,
    created_at: new Date().toISOString(),
    code_type: 'ASIN'
  };
}; 