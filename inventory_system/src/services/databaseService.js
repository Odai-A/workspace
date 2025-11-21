import { supabase } from '../config/supabaseClient';

// The name of your Supabase tables
const PRODUCT_TABLE = 'manifest_data';
const API_LOOKUP_CACHE_TABLE = 'api_lookup_cache'; // Target table for API caching

// Column mapping for original manifest_data table (PRODUCT_TABLE)
const columnMap = {
  id: 'id',
  lpn: 'X-Z ASIN',
  fnsku: 'Fn Sku',
  asin: 'B00 Asin',
  name: 'Description',
  description: 'Description',
  sku: 'Fn Sku',
  category: 'Category',
  price: 'MSRP',
  upc: 'UPC',
  quantity: 'Quantity',
};

// API Cache service for external lookup caching in 'api_lookup_cache'
export const apiCacheService = {
  /**
   * Gets a product from the api_lookup_cache by FNSKU or ASIN
   * @param {string} code - The FNSKU or ASIN to search for
   * @returns {Promise<Object|null>} - The cached API result or null if not found
   */
  async getCachedLookup(code) {
    try {
      // Try searching by FNSKU first
      let { data, error } = await supabase
        .from(API_LOOKUP_CACHE_TABLE)
        .select('*')
        .eq('fnsku', code)
        .maybeSingle(); // Use maybeSingle to avoid error if not found

      if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found, which is okay here
        console.error('Error fetching from API cache by FNSKU:', error);
      }
      if (data) {
        console.log('✅ Found in API cache by FNSKU:', data);
        return data;
      }

      // If not found by FNSKU, try by ASIN
      ({ data, error } = await supabase
        .from(API_LOOKUP_CACHE_TABLE)
        .select('*')
        .eq('asin', code)
        .maybeSingle());
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching from API cache by ASIN:', error);
      }
      if (data) {
        console.log('✅ Found in API cache by ASIN:', data);
        return data;
      }
      
      return null; // Not found by either
    } catch (error) {
      console.error('Exception in getCachedLookup:', error);
      return null;
    }
  },

  /**
   * Saves an external API result (or direct ASIN lookup) to the api_lookup_cache table.
   * This function now expects apiResult to be the object processed by externalApiService.processApiResponse.
   * @param {Object} apiResult - The processed result from the external API or generated ASIN data.
   * @returns {Promise<Object|null>} - The saved cache entry or null on error
   */
  async saveLookup(apiResult) {
    console.log('🔍 [saveLookup] Called with:', apiResult);
    
    if (!apiResult || (!apiResult.fnsku && !apiResult.asin)) {
      console.error('❌ saveLookup: apiResult is missing or does not contain FNSKU or ASIN.', apiResult);
      return null;
    }

    try {
      const lookupKey = apiResult.fnsku || apiResult.asin; // Prioritize FNSKU if available
      console.log(`💾 [saveLookup] Attempting to save/update in api_lookup_cache for key: ${lookupKey}`);
      console.log('💾 [saveLookup] Full apiResult:', JSON.stringify(apiResult, null, 2));

      const existingEntry = await this.getCachedLookup(lookupKey);
      console.log('💾 [saveLookup] Existing entry found:', existingEntry ? `ID: ${existingEntry.id}` : 'None');
      
      const now = new Date().toISOString();

      // Ensure we have a fnsku (required by table constraint)
      if (!apiResult.fnsku && !apiResult.asin) {
        console.error('❌ Cannot save: Both fnsku and asin are missing');
        return null;
      }
      
      // If we only have ASIN but no FNSKU, we can't save (fnsku is NOT NULL)
      // In this case, use ASIN as a fallback for fnsku (not ideal but works)
      const fnskuValue = apiResult.fnsku || apiResult.asin || null;
      
      // Determine asin_found - check if asin exists and is valid
      const hasValidAsin = apiResult.asin && apiResult.asin.trim() !== '' && apiResult.asin.length >= 10;
      const asinFound = apiResult.asin_found !== undefined ? !!apiResult.asin_found : hasValidAsin;
      
      const dataToUpsert = {
        fnsku: fnskuValue, // Required - use ASIN as fallback if FNSKU not available
        asin: apiResult.asin || null,
        product_name: apiResult.name || `Product ${lookupKey}`,
        description: apiResult.description || apiResult.name || '',
        price: apiResult.price != null ? parseFloat(apiResult.price) : 0,
        category: apiResult.category || 'External API',
        upc: apiResult.upc || null,
        image_url: apiResult.image_url || null,
        source: apiResult.source || 'fnskutoasin.com',
        task_state: apiResult.task_state || (hasValidAsin ? 'completed' : 'processing'),
        scan_task_id: apiResult.scan_task_id || null,
        asin_found: asinFound,
        lookup_count: existingEntry ? (existingEntry.lookup_count || 0) + 1 : 1,
        last_accessed: now,
      };
      
      // Ensure price is a valid number
      if (dataToUpsert.price === null || isNaN(dataToUpsert.price)) {
        dataToUpsert.price = 0;
      }
      
      // Clean up empty strings to null for optional fields
      if (dataToUpsert.upc === '') dataToUpsert.upc = null;
      if (dataToUpsert.image_url === '') dataToUpsert.image_url = null;
      if (dataToUpsert.scan_task_id === '') dataToUpsert.scan_task_id = null;
      
      console.log('💾 [saveLookup] Data to upsert:', JSON.stringify(dataToUpsert, null, 2));

      let result;
      if (existingEntry) {
        console.log('🔄 [saveLookup] Updating existing entry in api_lookup_cache with ID:', existingEntry.id);
        dataToUpsert.updated_at = now;
        const { data, error } = await supabase
          .from(API_LOOKUP_CACHE_TABLE)
          .update(dataToUpsert)
          .eq('id', existingEntry.id) // Update by primary key 'id'
          .select()
          .single();
        
        if (error) {
          console.error('❌ [saveLookup] Update error:', error);
          console.error('❌ [saveLookup] Error code:', error.code);
          console.error('❌ [saveLookup] Error message:', error.message);
          console.error('❌ [saveLookup] Error details:', error.details);
          console.error('❌ [saveLookup] Error hint:', error.hint);
          throw error;
        }
        
        console.log('✅ [saveLookup] Update successful, result:', data);
        result = data;
      } else {
        console.log('➕ [saveLookup] Creating new entry in api_lookup_cache.');
        dataToUpsert.created_at = now; // Set created_at for new entries
        dataToUpsert.updated_at = now;
        const { data, error } = await supabase
          .from(API_LOOKUP_CACHE_TABLE)
          .insert(dataToUpsert)
          .select()
          .single();
        
        if (error) {
          console.error('❌ [saveLookup] Insert error:', error);
          console.error('❌ [saveLookup] Error code:', error.code);
          console.error('❌ [saveLookup] Error message:', error.message);
          console.error('❌ [saveLookup] Error details:', error.details);
          console.error('❌ [saveLookup] Error hint:', error.hint);
          console.error('❌ [saveLookup] Attempted to insert:', JSON.stringify(dataToUpsert, null, 2));
          throw error;
        }
        
        console.log('✅ [saveLookup] Insert successful, result:', data);
        result = data;
      }

      console.log('✅ [saveLookup] Cache operation successful for api_lookup_cache:', result);
      console.log('✅ [saveLookup] Saved data includes image_url:', result?.image_url ? 'YES' : 'NO');
      return result;
    } catch (error) {
      console.error('❌ [saveLookup] Exception in saveLookup to api_lookup_cache:', error);
      console.error('❌ [saveLookup] Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        fullError: error
      });
      console.error('❌ [saveLookup] Attempted to save apiResult:', apiResult);
      console.error('❌ [saveLookup] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      
      // Try to get more details from Supabase error
      if (error.code) {
        console.error('❌ [saveLookup] Supabase error code:', error.code);
        if (error.code === '23505') {
          console.error('❌ [saveLookup] UNIQUE constraint violation - fnsku already exists');
        } else if (error.code === '23502') {
          console.error('❌ [saveLookup] NOT NULL constraint violation - required field is missing');
        } else if (error.code === '42703') {
          console.error('❌ [saveLookup] Column does not exist - check table schema');
        }
      }
      
      return null;
    }
  },

  /**
   * Maps data from api_lookup_cache to a consistent display format.
   * @param {Object} cacheData - Data from api_lookup_cache table
   * @returns {Object} - Mapped display data
   */
  mapCacheToDisplay(cacheData) {
    if (!cacheData) return null;
    return {
      id: cacheData.id, // Or whatever primary key is used
      fnsku: cacheData.fnsku,
      asin: cacheData.asin,
      name: cacheData.product_name || `Product ${cacheData.fnsku || cacheData.asin}`,
      description: cacheData.description,
      price: cacheData.price != null ? parseFloat(cacheData.price).toFixed(2) : '0.00',
      category: cacheData.category || 'Cached Data',
      upc: cacheData.upc || 'N/A',
      sku: cacheData.fnsku || cacheData.asin, // Prioritize FNSKU as display SKU
      lpn: '', // api_lookup_cache likely doesn't have LPN from manifest
      quantity: 0, // api_lookup_cache doesn't track live quantity
      image_url: cacheData.image_url || '',
      source: 'api_lookup_cache', // Indicate it came from our cache
      cost_status: 'no_charge', // Data from cache is effectively no charge for this lookup
      asin_found: !!cacheData.asin_found,
      processing_status: cacheData.is_processing ? 'pending_manual_check' : (cacheData.asin_found ? 'completed' : 'unknown'),
      task_state: cacheData.task_state,
      scan_task_id: cacheData.scan_task_id,
      code_type: cacheData.fnsku ? 'FNSKU' : (cacheData.asin ? 'ASIN' : 'Unknown'), // Infer code_type
      // Include timestamps if useful for display
      last_checked: cacheData.last_check_time ? new Date(cacheData.last_check_time).toLocaleString() : 'N/A',
      rawCacheData: cacheData, // For debugging or more detailed views
    };
  },
  
  // updateCacheWithFreshData might need to be adapted or removed if the main saveLookup handles updates well.
  // For now, commenting out as saveLookup will perform an update if entry exists.
  /*
  async updateCacheWithFreshData(fnsku, freshApiData) {
    try {
      console.log('🔄 Updating api_lookup_cache entry with fresh API data:', fnsku);
      // This would be similar to saveLookup but specifically for updates after an initial processing state.
      // It might need to find the record by fnsku and then update it.
      // For simplicity, ensure saveLookup can handle this scenario by checking for existing record.
      return await this.saveLookup(freshApiData); // Re-route to saveLookup which handles upsert logic
    } catch (error) {
      console.error('Exception updating cache entry:', error);
      return null;
    }
  },
  */
};

// productLookupService remains largely the same for interacting with manifest_data
// but its getProductByFnsku will now prioritize apiCacheService for lookups.
export const productLookupService = {
  /**
   * Searches products in the manifest_data table based on a query and specified fields.
   * @param {string} query - The search term.
   * @param {object} options - Search options.
   * @param {string[]} options.fields - Fields to search in (e.g., ['lpn', 'fnsku', 'name']).
   * @param {boolean} options.exactMatch - Whether to perform an exact match.
   * @param {number} options.limit - Maximum number of results to return.
   * @returns {Promise<Array>} - A promise that resolves to an array of products.
   */
  async searchProducts(query, { fields = [], exactMatch = false, limit = 10 }) {
    if (!query || fields.length === 0) {
      return [];
    }
    let supabaseQuery = supabase.from(PRODUCT_TABLE).select('*');
    const searchTerm = exactMatch ? query : `%${query}%`;
    const orConditions = fields
      .map(fieldKey => {
        const columnName = columnMap[fieldKey]; // Uses the original columnMap for PRODUCT_TABLE
        if (!columnName) {
          console.warn(`searchProducts: Unknown field key or unmapped column for '${fieldKey}'.`);
          return null;
        }
        return exactMatch 
          ? `${columnName}.eq.${query}` 
          : `${columnName}.ilike.${searchTerm}`;
      })
      .filter(condition => condition !== null)
      .join(',');
    if (orConditions) {
      supabaseQuery = supabaseQuery.or(orConditions);
    } else {
      console.warn('searchProducts: No valid search conditions built.');
      return [];
    }
    supabaseQuery = supabaseQuery.limit(limit);
    const { data, error } = await supabaseQuery;
    if (error) {
      console.error('Error searching products in manifest_data:', error);
      return [];
    }
    // Map results from manifest_data to a display format if necessary, or ensure Scanner component can handle its structure
    return (data || []).map(item => ({ 
        ...item, 
        name: item[columnMap.name], 
        sku: item[columnMap.sku], 
        asin: item[columnMap.asin],
        fnsku: item[columnMap.fnsku],
        lpn: item[columnMap.lpn],
        description: item[columnMap.description],
        price: item[columnMap.price],
        category: item[columnMap.category],
        upc: item[columnMap.upc],
        quantity: item[columnMap.quantity],
        source: 'local_database', // manifest_data is considered local_database
        cost_status: 'no_charge',
    }));
  },

  /**
   * Gets a product by its FNSKU or ASIN. 
   * This function now first consults apiCacheService (api_lookup_cache).
   * If not found there, it falls back to checking manifest_data.
   * @param {string} code - The FNSKU or ASIN to search for.
   * @returns {Promise<Object|null>} - A promise that resolves to the product or null if not found.
   */
  async getProductByFnsku(code) {
    // STEP 1: Check API cache first (api_lookup_cache table)
    // This is handled by getProductLookup in api.js which calls apiCacheService.getCachedLookup
    // This specific function might become redundant if getProductLookup in api.js is the primary entry point.
    // For now, keeping its original intent to check manifest_data as a fallback if explicitly called.

    console.log(`📦 [DB Service] Checking manifest_data table for code: ${code}...`);
    
    // Try by FNSKU in manifest_data
    let { data, error } = await supabase
      .from(PRODUCT_TABLE) // PRODUCT_TABLE is 'manifest_data'
      .select('*')
      .eq(columnMap.fnsku, code) // Use mapped column name for FNSKU
      .limit(1);

    // If not found by FNSKU, try by ASIN in manifest_data
    if ((!data || data.length === 0) && !error) {
      const asinResult = await supabase
        .from(PRODUCT_TABLE)
        .select('*')
        .eq(columnMap.asin, code) // Use mapped column name for ASIN
        .limit(1);
        
      data = asinResult.data;
      error = asinResult.error;
      
      if (data && data.length > 0) {
        console.log('✅ Found by ASIN in manifest_data table');
      }
    }

    if (error) {
      console.error('Error fetching product from manifest_data:', error);
      return null;
    }

    if (data && data.length > 0) {
      console.log('✅ Found in manifest_data table, mapping to display format...');
      const item = data[0];
      // Map manifest_data to a consistent display format
      return {
        id: item.id,
        fnsku: item[columnMap.fnsku],
        asin: item[columnMap.asin],
        name: item[columnMap.name],
        description: item[columnMap.description],
        price: item[columnMap.price] != null ? parseFloat(item[columnMap.price]).toFixed(2) : '0.00',
        category: item[columnMap.category],
        upc: item[columnMap.upc],
        sku: item[columnMap.fnsku], // Use FNSKU as primary display SKU from manifest
        lpn: item[columnMap.lpn],
        quantity: item[columnMap.quantity],
        source: 'local_database', // Clearly mark as from local manifest
        cost_status: 'no_charge',
        asin_found: !!item[columnMap.asin], // Indicate if ASIN was present in manifest
        rawSupabase: item, // Keep original manifest data if needed
        code_type: item[columnMap.fnsku] ? 'FNSKU' : (item[columnMap.asin] ? 'ASIN' : 'Unknown'),
      };
    }
    
    console.log('❌ [DB Service] Not found in manifest_data table for code:', code);
    return null;
  },

  // getProductByLpn remains similar, searching manifest_data
  async getProductByLpn(lpnValue) {
    const lpnColumn = columnMap['lpn'];
    if (!lpnColumn) {
      console.error('getProductByLpn: LPN column name is not mapped correctly.');
      return null;
    }
    const { data, error } = await supabase
      .from(PRODUCT_TABLE) // PRODUCT_TABLE is 'manifest_data'
      .select('*')
      .eq(lpnColumn, lpnValue)
      .maybeSingle();
    if (error) {
      console.error('Error fetching product by LPN from manifest_data:', error);
      return null;
    }
    if (data) {
        console.log('✅ Found by LPN in manifest_data, mapping to display format...');
        const item = data;
        return {
            id: item.id,
            fnsku: item[columnMap.fnsku],
            asin: item[columnMap.asin],
            name: item[columnMap.name],
            description: item[columnMap.description],
            price: item[columnMap.price] != null ? parseFloat(item[columnMap.price]).toFixed(2) : '0.00',
            category: item[columnMap.category],
            upc: item[columnMap.upc],
            sku: item[columnMap.lpn], // For LPN lookups, LPN itself is the primary identifier
            lpn: item[columnMap.lpn],
            quantity: item[columnMap.quantity],
            source: 'local_database', // Clearly mark as from local manifest
            cost_status: 'no_charge',
            asin_found: !!item[columnMap.asin],
            rawSupabase: item,
            code_type: 'LPN',
        };
    }
    return null;
  },

  // saveProductLookup now specifically refers to saving to the main PRODUCT_TABLE (manifest_data)
  // It should NOT be used for caching API results. apiCacheService.saveLookup is for that.
  async saveProductToManifest(productData, options = {}) {
    const mappedData = {};
    // This function is for saving to manifest_data, ensure conflict key uses manifest_data columns via columnMap
    const conflictKey = options.conflictKey || 'fnsku'; 
    const conflictColumnSupabase = columnMap[conflictKey];

    if (!conflictColumnSupabase) {
      console.error(`saveProductToManifest: Invalid or unmapped conflictKey provided: "${conflictKey}".`);
      return null;
    }

    for (const genericKey in columnMap) {
      if (productData.hasOwnProperty(genericKey) && productData[genericKey] !== undefined) {
        const supabaseColumn = columnMap[genericKey];
        if (supabaseColumn && (genericKey !== 'id' || productData.id !== undefined)) {
             mappedData[supabaseColumn] = productData[genericKey];
        }
      }
    }
        
    if (Object.keys(mappedData).length === 0) {
        console.error('saveProductToManifest: No data to save after mapping. Original productData:', productData);
        return null;
    }
    
    if (!mappedData[conflictColumnSupabase] && conflictKey !== 'id') {
        console.error(`saveProductToManifest: Value for conflict column "${conflictColumnSupabase}" is missing. Data:`, mappedData);
        return null; 
    }

    console.log(`Attempting to save to manifest_data:`, mappedData);

    try {
      // Check if record exists first (since there may not be a unique constraint)
      const searchValue = mappedData[conflictColumnSupabase];
      const { data: existingData, error: searchError } = await supabase
        .from(PRODUCT_TABLE)
        .select('*')
        .eq(conflictColumnSupabase, searchValue)
        .limit(1)
        .maybeSingle();
      
      if (searchError && searchError.code !== 'PGRST116') {
        console.error('Error checking for existing product:', searchError);
        return null;
      }

      let result;
      if (existingData) {
        // Update existing record
        const { data, error } = await supabase
          .from(PRODUCT_TABLE)
          .update(mappedData)
          .eq(conflictColumnSupabase, searchValue)
          .select()
          .single();
        
        if (error) {
          console.error('Error updating product in manifest_data:', error);
          return null;
        }
        result = data;
        console.log('✅ Successfully updated product in manifest_data:', result);
      } else {
        // Insert new record
        const { data, error } = await supabase
          .from(PRODUCT_TABLE)
          .insert(mappedData)
          .select()
          .single();
        
        if (error) {
          console.error('Error inserting product to manifest_data:', error);
          console.error('Attempted to save:', mappedData);
          return null;
        }
        result = data;
        console.log('✅ Successfully inserted product in manifest_data:', result);
      }
      
      return result;
    } catch (error) {
      console.error('Exception in saveProductToManifest:', error);
      return null;
    }
  },
  
  async getRecentLookups(count = 10) {
    // This function's purpose might need re-evaluation. 
    // If it's for recent *API lookups*, it should query 'api_lookup_cache' ordered by 'last_check_time'.
    // If it's for recent *manifest entries*, it queries 'manifest_data' by 'id' or a date column.
    // Assuming for now it means recent manifest_data entries:
    const idColumn = columnMap['id'];
    if (!idColumn) {
        console.error('getRecentLookups: ID column not mapped for ordering manifest_data.');
        return [];
    }
    const { data, error } = await supabase
      .from(PRODUCT_TABLE) // manifest_data
      .select('*')
      .order(idColumn, { ascending: false })
      .limit(count);
    if (error) {
      console.error('Error fetching recent manifest_data entries:', error);
      return [];
    }
    return (data || []).map(item => ({ ...item, source: 'local_database', name: item[columnMap.name] })); // basic mapping
  },

  async getProducts({ page = 1, limit = 25, searchQuery = '' }) {
    // This fetches from manifest_data
    const offset = (page - 1) * limit;
    let query = supabase.from(PRODUCT_TABLE);

    query = query.select('*', { count: 'exact' }); 

    if (searchQuery) {
      const searchTerm = `%${searchQuery}%`;
      const searchOrConditions = [
        `${columnMap.lpn}.ilike.${searchTerm}`,
        `${columnMap.fnsku}.ilike.${searchTerm}`,
        `${columnMap.asin}.ilike.${searchTerm}`,
        `${columnMap.name}.ilike.${searchTerm}`,
      ].join(',');
      query = query.or(searchOrConditions);
    }

    query = query.order(columnMap.id, { ascending: true });
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching products from manifest_data:', error);
      return { data: [], totalCount: 0 };
    }
    return { data: (data || []).map(item => ({...item, source: 'local_database', name: item[columnMap.name]})), totalCount: count || 0 };
  },

  async getDashboardStats() {
    try {
      const { count: totalProducts, error: countError } = await supabase
        .from(PRODUCT_TABLE) // manifest_data
        .select('id', { count: 'exact', head: true });

      if (countError) console.error('Error fetching total product count from manifest_data:', countError);

      const { data: allProducts, error: allProductsError } = await supabase
        .from(PRODUCT_TABLE) // manifest_data
        .select(columnMap.quantity);

      let sumOfQuantities = 0;
      if (allProductsError) {
        console.error('Error fetching quantities for sum from manifest_data:', allProductsError);
      } else if (allProducts) {
        sumOfQuantities = allProducts.reduce((acc, item) => acc + (item[columnMap.quantity] || 0), 0);
      }
      
      return {
        totalProducts: totalProducts || 0,
        sumOfQuantities: sumOfQuantities,
      };

    } catch (error) {
      console.error('Error fetching dashboard stats from manifest_data:', error);
      return { totalProducts: 0, sumOfQuantities: 0 };
    }
  },

  async logScanEvent(scannedCode, productDetails = null, userId = null) {
    if (!scannedCode) return null;
    try {
      // Get current user ID if not provided
      if (!userId) {
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id || null;
      }

      let manifestDataId = null;
      let productDescription = productDetails?.name || productDetails?.description || 'N/A';
      let apiCacheId = null;

      if (productDetails) {
        if (productDetails.source === 'api_lookup_cache' && productDetails.id) {
            apiCacheId = productDetails.id;
            // manifestDataId remains null
        } else if ((productDetails.source === 'local_database' || productDetails.rawSupabase) && productDetails.id) {
            // This came from manifest_data table (either directly or via rawSupabase)
            manifestDataId = productDetails.id; 
        } 
        // If from other sources like 'asin_direct' or 'external_api' before caching, these IDs would be null.
      }
      
      const eventData = {
        scanned_code: scannedCode,
        scanned_at: new Date().toISOString(),
        user_id: userId, // Add user_id to track who scanned
        manifest_data_id: manifestDataId,
        api_lookup_cache_id: apiCacheId, // New field to link to api_lookup_cache
        product_description: productDescription,
        // You might want to add more fields here, like 'scan_source_type' (e.g., 'camera', 'manual')
      };
      
      console.log('🔍 Attempting to log scan event:', eventData);
      
      const { data, error } = await supabase
        .from('scan_history') 
        .insert(eventData)
        .select()
        .single(); // Expecting a single row back

      if (error) {
        console.error('Error logging scan event to Supabase:', error);
        return null;
      }
      console.log('✅ Scan event logged successfully:', data);
      return data;
    } catch (error) {
      console.error('Exception logging scan event:', error);
      return null;
    }
  },

  async getRecentScanEvents(limit = 5) {
    try {
      const { data, error } = await supabase
        .from('scan_history') 
        .select(`
          id, scanned_code, scanned_at, product_description,
          manifest_entry:manifest_data_id ( ${columnMap.name}, ${columnMap.lpn}, ${columnMap.asin}, ${columnMap.price} ),
          cached_lookup:api_lookup_cache_id ( product_name, asin, price, image_url, api_source )
        `)
        .order('scanned_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[DB Service] Error fetching recent scan events:', error);
        return [];
      }
      console.log("[DB Service] Raw data from scan_history with joins:", data);

      // Transform data to a more usable format for the UI
      const mappedData = (data || []).map(scan => {
        const details = scan.cached_lookup || scan.manifest_entry;
        return {
            id: scan.id,
            scanned_code: scan.scanned_code,
            scanned_at: scan.scanned_at,
            description: scan.product_description || details?.product_name || details?.[columnMap.name] || scan.scanned_code,
            lpn: details?.[columnMap.lpn] || 'N/A',
            asin: details?.asin || details?.[columnMap.asin] || 'N/A',
            price: details?.price != null ? parseFloat(details.price).toFixed(2) : (details?.[columnMap.price] != null ? parseFloat(details[columnMap.price]).toFixed(2) : 'N/A'),
            image_url: details?.image_url || '',
            source: scan.cached_lookup ? `Cache (${scan.cached_lookup.api_source || 'fnskutoasin.com'})` : (scan.manifest_entry ? 'Local DB' : 'Scan Event')
        };
      });
      console.log("[DB Service] Mapped scan_history data:", mappedData);
      return mappedData;

    } catch (error) {
      console.error('[DB Service] Exception fetching recent scan events:', error);
      return [];
    }
  }
};

export const API_SCAN_LOGS_TABLE = 'api_scan_logs';

export const apiScanLogService = {
  async logEvent({ 
    userId, 
    fnskuScanned, 
    asinRetrieved, 
    apiSource, 
    isChargedCall = true, 
    costIncurred, 
    apiLookupCacheId,
    notes 
  }) {
    if (!userId || !fnskuScanned) {
      console.error('❌ logApiScanEvent: userId and fnskuScanned are required.');
      return null;
    }

    const logData = {
      user_id: userId,
      fnsku_scanned: fnskuScanned,
      asin_retrieved: asinRetrieved,
      api_source: apiSource,
      is_charged_call: isChargedCall,
      cost_incurred: costIncurred,
      api_lookup_cache_id: apiLookupCacheId,
      notes: notes,
      // lookup_timestamp is handled by DB default
    };

    try {
      console.log('✍️ Logging API scan event:', logData);
      const { data, error } = await supabase
        .from(API_SCAN_LOGS_TABLE)
        .insert(logData)
        .select()
        .single();

      if (error) {
        console.error('❌ Error logging API scan event to Supabase:', error);
        throw error;
      }
      console.log('✅ API scan event logged successfully:', data);
      return data;
    } catch (error) {
      console.error('💥 Exception logging API scan event:', error);
      // Do not rethrow here to prevent breaking the main flow if logging fails,
      // but ensure it's logged for debugging.
      return null; 
    }
  },

  async hasBeenChargedBefore(userId, fnskuScanned) {
    if (!userId || !fnskuScanned) {
      console.warn('⚠️ hasBeenChargedBefore: userId and fnskuScanned are required.');
      return false; // Or throw an error, but returning false might be safer to not break flow
    }

    try {
      const { data, error, count } = await supabase
        .from(API_SCAN_LOGS_TABLE)
        .select('*', { count: 'exact', head: true }) // Only need to know if any exist
        .eq('user_id', userId)
        .eq('fnsku_scanned', fnskuScanned)
        .eq('is_charged_call', true); // Specifically check for charged calls

      if (error) {
        console.error('❌ Error checking for previous charged scan:', error);
        return false; // Assume not charged if there's an error, to be safe
      }
      
      return count > 0;
    } catch (error) {
      console.error('💥 Exception in hasBeenChargedBefore:', error);
      return false;
    }
  }
}; 