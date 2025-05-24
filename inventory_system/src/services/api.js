import axios from 'axios';
import { mockService } from './mockData';
import { apiCacheService, apiScanLogService } from './databaseService.js';

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
      
      const BASE_URL = 'https://ato.fnskutoasin.com';
      const API_KEY = '20a98a6a-437e-497c-b64c-ec97ec2fbc19'; // Ensure this is the correct key being used
      
      console.log(`🔑 Using API Key: ${API_KEY.substring(0, 8)}...`);
      console.log(`🌐 Using Base URL: ${BASE_URL}`);
      
      const headers = {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      
      const isHtmlResponse = (data) => {
        return typeof data === 'string' && data.trim().startsWith('<!DOCTYPE html>');
      };
      
      const lookupUrl = `${BASE_URL}/api/v1/ScanTask/GetByBarCode`;
      let response;
      let scanData;

      // Step 1: Try to get existing scan task
      console.log(`📡 Step 1: Checking for existing scan task...`);
      try {
        response = await axios.get(lookupUrl, { 
          headers, 
          params: { BarCode: fnsku }, 
          timeout: 30000 
        });
        
        if (!isHtmlResponse(response.data) && response.data?.succeeded && response.data?.data?.asin) {
          console.log('✅ Found existing scan with ASIN:', response.data.data.asin);
          if (response.data.data.asin.length >= 10) {
            return this.processApiResponse(fnsku, response.data.data);
          }
        }
      } catch (error) {
        if (error.response?.status === 401) {
          console.log('🔄 Trying alternative header format for GET...');
          const altHeaders = {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          };
          try {
            response = await axios.get(lookupUrl, { 
              headers: altHeaders, 
              params: { BarCode: fnsku }, 
              timeout: 30000 
            });
            if (!isHtmlResponse(response.data) && response.data?.succeeded && response.data?.data?.asin) {
              console.log('✅ Found existing scan with ASIN (alt headers):', response.data.data.asin);
              if (response.data.data.asin.length >= 10) {
                return this.processApiResponse(fnsku, response.data.data);
              }
            }
          } catch (error2) {
            console.log('❌ Both header formats failed for GET:', error2.response?.status);
          }
        }
        // If error or no ASIN, proceed to create/POST
      }
      
      // Step 2: Create new scan task if no existing scan with ASIN found
      console.log('📝 Creating or getting scan task via POST...');
      const addScanUrl = `${BASE_URL}/api/v1/ScanTask/AddOrGet`;
      const payload = { barCode: fnsku, callbackUrl: "" };
      
      try {
        response = await axios.post(addScanUrl, payload, { headers, timeout: 30000 });
      } catch (error) {
        if (error.response?.status === 401) {
          console.log('🔄 POST failed with 401, trying alternative header format...');
          const altHeaders = {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          };
          response = await axios.post(addScanUrl, payload, { headers: altHeaders, timeout: 30000 });
        } else {
          throw error; // Rethrow if not a 401 error
        }
      }
      
      console.log(`✅ POST response status: ${response.status}`);
      console.log(`📄 POST response:`, response.data);
        
      if (response.data?.succeeded && response.data?.data) {
        scanData = response.data.data;
        console.log('✅ Created/Retrieved scan task:', scanData);
        
        if (scanData.asin && scanData.asin.trim() !== '' && scanData.asin.length >= 10) {
          console.log('🎉 ASIN found immediately in AddOrGet response!', scanData.asin);
          return this.processApiResponse(fnsku, scanData);
        } else {
          console.log('⏳ ASIN not immediately available in POST response or is invalid. API may need more time.');
        }
      } else {
        // If AddOrGet didn't succeed or data is missing, but no error was thrown
        console.warn(`AddOrGet call response indicates failure or missing data: ${response.data?.message || 'Unknown issue'}`);
      }
      
      // If we reach here, ASIN was not found immediately.
      // Return a processing status.
      console.log('⏳ ASIN not found immediately. Returning processing status.');
      return {
        fnsku: fnsku,
        asin: '', 
        name: `FNSKU: ${fnsku} (Processing...)`,
        description: `API is processing FNSKU: ${fnsku}. Use 'Check for Updates' button or try again later.`,
        price: 0,
        category: 'External API',
        condition: 'New',
        source: 'fnskutoasin.com',
        processing_status: 'pending_manual_check', // Indicates user should check later
        amazon_url: '',
        raw_data: scanData || null, // Include scanData if available from POST
        image_url: '',
        created_at: new Date().toISOString(),
        asin_found: false
      };
      
    } catch (error) {
      console.error('❌ Error in external API lookup (lookupFnsku):', error);
      if (error.response) {
        console.error('API Response Error Details:', error.response.status, error.response.data);
      }
      // Return a specific error structure or rethrow, based on how getProductLookup handles it.
      // For now, let's rethrow so the calling function can decide.
      throw error; 
    }
  },
  
  /**
   * Process API response data into standardized format
   * @param {string} fnsku - Original FNSKU
   * @param {Object} scanData - Raw scan data from API (this is response.data.data)
   * @returns {Object} - Processed product data
   */
  processApiResponse(fnsku, scanData) {
    const asin = scanData?.asin;
    
    console.log('🚀 [DEBUG] Processing API response...');
    console.log('🚀 [DEBUG] Raw scanData from external API:', scanData);
    console.log('🚀 [DEBUG] Extracted ASIN:', asin);
    
    // Attempt to extract richer data from scanData, with fallbacks
    const price = parseFloat(scanData?.price || scanData?.listPrice || scanData?.msrp || 0).toFixed(2);
    const category = scanData?.category || scanData?.categories?.[0]?.name || 'External API';
    const imageUrl = scanData?.imageUrl || scanData?.image || scanData?.mainImage?.url || scanData?.images?.[0]?.src || '';
    const upc = scanData?.upc || '';
    const productName = scanData?.productName || scanData?.name || scanData?.title || (asin ? `Amazon Product (ASIN: ${asin})` : `FNSKU: ${fnsku} (No ASIN found)`);
    const description = scanData?.description || productName;

    const productData = {
      fnsku: fnsku,
      asin: asin || '',
      name: productName,
      description: description,
      price: price,
      category: category,
      upc: upc,
      image_url: imageUrl,
      condition: scanData?.condition || 'New', // Condition might not be in cache table but useful for processing
      source: 'fnskutoasin.com', // Source of the data
      scan_task_id: scanData?.id || '', // Assuming 'id' from scanData is the task_id
      task_state: scanData?.taskState || (asin ? 'completed' : 'processing'),
      assignment_date: scanData?.assignmentDate || '',
      amazon_url: asin ? `https://www.amazon.com/dp/${asin}` : '',
      raw_data: scanData, // Keeping raw_data might be too verbose for cache, consider removing or minimizing
      created_at: new Date().toISOString(), // Informational, DB has its own
      asin_found: !!asin,
      processing_status: !asin && scanData?.taskState !== 'completed' ? 'pending_manual_check' : (asin ? 'completed' : 'unknown') // For UI logic
    };
    
    console.log('🚀 [DEBUG] Final processed product data for cache/display:', productData);
    return productData;
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
 * @param {string} userId - User ID for tracking lookups
 * @returns {Promise<Object|null>} - Product data or null if not found
 */
export const getProductLookup = async (code, userId) => {
  try {
    console.log(`🔍 Starting product lookup for code: ${code}, UserID: ${userId || 'N/A'}`);
    
    const codeInfo = detectCodeType(code);
    console.log(`🏷️ Detected code type: ${codeInfo.type} (${codeInfo.description})`);
    
    if (codeInfo.type === 'ASIN') {
      console.log('📋 Code is an ASIN - creating direct product data (no API charge)');
      const asinData = generateAsinProductData(codeInfo.code);
      
      try {
        // For ASINs, we might still want to cache them if they are frequently accessed
        // This uses apiCacheService which we will update to save to 'api_lookup_cache'
        await apiCacheService.saveLookup(asinData); 
        console.log('✅ ASIN data saved to api_lookup_cache');
      } catch (saveError) {
        console.warn('⚠️ Could not save ASIN data to api_lookup_cache:', saveError);
      }
      
      return asinData;
    }
    
    console.log(`📦 Processing as ${codeInfo.type}, checking local cache first...`);
    
    // STEP 1: Check local cache (Supabase 'api_lookup_cache' table)
    let cachedProduct = await apiCacheService.getCachedLookup(code); // This will use 'api_lookup_cache'
    
    if (cachedProduct) {
      console.log('✅ Found in api_lookup_cache - no API charge!');
      // Ensure the cached product has all necessary fields for display, potentially re-map if needed
      // For now, assume getCachedLookup returns it in a good displayable format or mapCacheToDisplay handles it.
      return apiCacheService.mapCacheToDisplay(cachedProduct); // Ensure this mapping is up-to-date
    }
    
    console.log('❌ Not found in api_lookup_cache');
    
    // STEP 2: For FNSKUs, try external fnskutoasin.com API
    if (codeInfo.type === 'FNSKU') {
      console.log('💰 Step 2: Trying external FNSKU API (this will be charged)...');
      try {
        const externalResult = await externalApiService.lookupFnsku(code);
        
        if (externalResult) {
          console.log('✅ Data received from external API:', externalResult);

          // Log the charged scan event if a user ID is provided and they haven't been charged before for this FNSKU
          if (userId && externalResult.source === 'fnskutoasin.com') {
            const alreadyCharged = await apiScanLogService.hasBeenChargedBefore(userId, code);
            if (!alreadyCharged) {
              try {
                await apiScanLogService.logEvent({
                  userId: userId,
                  fnskuScanned: code,
                  asinRetrieved: externalResult.asin,
                  apiSource: externalResult.source,
                  isChargedCall: true, // Explicitly true for this path
                  // costIncurred: externalResult.cost_incurred, // If you have cost per API call
                  apiLookupCacheId: null // This will be updated if/when caching happens
                });
                console.log(`💸 First time charge logged for user ${userId} on FNSKU ${code}`);
              } catch (logError) {
                console.warn('⚠️ Failed to log API scan event:', logError);
              }
            } else {
              console.log(`👍 User ${userId} already charged for FNSKU ${code}. No new charge logged.`);
            }
          }
          
          // STEP 3: Save external result to api_lookup_cache only if ASIN is found and valid
          if (externalResult.asin && externalResult.asin.trim() !== '' && externalResult.asin_found) {
            console.log('💾 Step 3: Saving to api_lookup_cache for future cost savings...');
            try {
              await apiCacheService.saveLookup(externalResult); // Pass the direct result
              console.log('✅ Saved to api_lookup_cache - future lookups will be free!');
            } catch (saveError) {
              console.warn('⚠️ Could not save to api_lookup_cache:', saveError);
            }
          } else {
            console.log('ℹ️ ASIN not found or not confirmed by external API. Skipping cache save for now.', externalResult);
          }
          
          // Return the result from the API, now including cost_status and source
          return {
            ...externalResult, // Contains all processed fields including price, category, etc.
            cost_status: externalResult.asin_found ? 'charged' : 'processing_fee', // Or based on API response
            // source is already 'fnskutoasin.com' from processApiResponse
            code_type: codeInfo.type
          };
        }
      } catch (apiError) {
        console.error('❌ External API lookup failed:', apiError);
        // Do not fall back to mock data automatically here, let it propagate or return null/error status
        // The lookupFnsku should return a specific status if it's just processing.
         if (apiError.processing_status) { // If lookupFnsku throws an error object with this status
            return apiError;
        }
      }
    } else {
      console.log(`ℹ️ Skipping external API for ${codeInfo.type} (API only used for FNSKUs)`);
    }
    
    // STEP 4: If not FNSKU or external API failed without a processing status.
    // If mock data is enabled and desired as a final fallback (currently not implemented here)
    // For now, if not found or not an FNSKU for API lookup, return null or minimal data.
    
    console.log('❌ Product not found or not lookupable via external API.');
    return { // Return a consistent "not found" or "not processed" structure
        fnsku: code,
        name: `Product ${code} (Not Found)`,
        source: 'local_system',
        cost_status: 'no_charge',
        asin_found: false,
        processing_status: 'not_found',
        code_type: codeInfo.type
    };
    
  } catch (error) {
    console.error('❌ Error in getProductLookup:', error);
    return { // Return a consistent error structure
        fnsku: code,
        name: `Error looking up ${code}`,
        source: 'local_system_error',
        cost_status: 'no_charge',
        asin_found: false,
        processing_status: 'error',
        error_message: error.message,
        code_type: detectCodeType(code).type
    };
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