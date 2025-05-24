import { supabase } from '../config/supabaseClient';

// The name of your Supabase tables
const PRODUCT_TABLE = 'manifest_data';
const API_CACHE_TABLE = 'api_lookup_cache'; // New table for external API cache

// Streamlined Column mapping for essential fields (original table)
const columnMap = {
  id: 'id',                 // Keep for Supabase internal ID
  lpn: 'X-Z ASIN',        // Your LPN
  fnsku: 'Fn Sku',        // Your FNSKU
  asin: 'B00 Asin',       // Your ASIN
  name: 'Description',     // Product Name/Title (maps to Supabase 'Description' column)
  description: 'Description', // Full Description (can be same as name)
  sku: 'Fn Sku',          // Using FNSKU as the primary SKU for display/generic use
  category: 'Category',     // Product Category
  price: 'MSRP',            // Product Price
  upc: 'UPC',             // Product UPC
  quantity: 'Quantity',     // Product Quantity
  // Removed other non-essential mappings like sub_category, ext_msrp, pallet_id etc. for now
};

// API Cache service for external lookup caching
export const apiCacheService = {
  /**
   * Gets a product from the API cache by FNSKU
   * @param {string} fnsku - The FNSKU to search for
   * @returns {Promise<Object|null>} - The cached API result or null if not found
   */
  async getCachedLookup(fnsku) {
    try {
      const { data, error } = await supabase
        .from(API_CACHE_TABLE)
        .select('*')
        .eq('fnsku', fnsku)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found - this is expected for new lookups
          return null;
        }
        console.error('Error fetching from API cache:', error);
        return null;
      }

      console.log('✅ Found in API cache:', data);
      return data;
    } catch (error) {
      console.error('Exception in getCachedLookup:', error);
      return null;
    }
  },

  /**
   * Saves an external API result to the cache
   * @param {Object} apiResult - The result from external API
   * @returns {Promise<Object|null>} - The saved cache entry or null on error
   */
  async saveLookup(apiResult) {
    try {
      const cacheData = {
        fnsku: apiResult.fnsku,
        asin: apiResult.asin || null,
        product_name: apiResult.name || apiResult.description || `Product ${apiResult.fnsku}`,
        description: apiResult.description || apiResult.name || '',
        price: apiResult.price || 0,
        category: apiResult.category || 'External API',
        upc: apiResult.upc || null,
        source: apiResult.source || 'fnskutoasin.com',
        scan_task_id: apiResult.scan_task_id || null,
        task_state: apiResult.task_state || null,
        asin_found: !!apiResult.asin,
        original_lookup_code: apiResult.original_lookup_code || apiResult.fnsku,
      };

      console.log('💾 Saving to API cache:', cacheData);

      // First check if it already exists
      const existing = await this.getCachedLookup(apiResult.fnsku);
      
      if (existing) {
        // Update existing cache entry
        const { data, error } = await supabase
          .from(API_CACHE_TABLE)
          .update({
            ...cacheData,
            lookup_count: (existing.lookup_count || 0) + 1,
            last_accessed: new Date().toISOString()
          })
          .eq('fnsku', apiResult.fnsku)
          .select()
          .single();

        if (error) {
          console.error('Error updating API cache:', error);
          return null;
        }
        
        console.log('✅ Updated API cache entry:', data);
        return data;
      } else {
        // Insert new cache entry
        const { data, error } = await supabase
          .from(API_CACHE_TABLE)
          .insert(cacheData)
          .select()
          .single();

        if (error) {
          console.error('Error inserting to API cache:', error);
          return null;
        }
        
        console.log('✅ Created new API cache entry:', data);
        return data;
      }
    } catch (error) {
      console.error('Exception in saveLookup:', error);
      return null;
    }
  },

  /**
   * Maps API cache data to display format
   * @param {Object} cacheData - Data from API cache table
   * @returns {Object} - Mapped display data
   */
  mapCacheToDisplay(cacheData) {
    return {
      id: cacheData.id,
      fnsku: cacheData.fnsku,
      asin: cacheData.asin,
      name: cacheData.product_name,
      description: cacheData.description,
      price: cacheData.price,
      category: cacheData.category,
      upc: cacheData.upc,
      sku: cacheData.fnsku, // Use FNSKU as SKU
      lpn: '', // API cache doesn't have LPN
      quantity: 0, // API cache doesn't track quantity
      source: 'api_cache',
      cost_status: 'no_charge',
      // Keep raw cache data for reference
      rawCache: cacheData,
    };
  }
};

export const productLookupService = {
  /**
   * Searches products in the Supabase table based on a query and specified fields.
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
        const columnName = columnMap[fieldKey];
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
      console.error('Error searching products in Supabase:', error);
      return [];
    }
    return data || [];
  },

  /**
   * Gets a product by its FNSKU or ASIN from both API cache and manifest data tables
   * Priority: API cache first (faster, no RLS issues), then manifest data
   * @param {string} code - The FNSKU or ASIN to search for.
   * @returns {Promise<Object|null>} - A promise that resolves to the product or null if not found.
   */
  async getProductByFnsku(code) {
    try {
      console.log(`🔍 Searching for code: ${code} in both tables...`);
      
      // STEP 1: Check API cache first (supports both FNSKU and ASIN)
      console.log('📱 Step 1: Checking API cache table...');
      
      // Try by FNSKU first
      let cachedResult = await apiCacheService.getCachedLookup(code);
      
      // If not found by FNSKU, try by ASIN in cache
      if (!cachedResult) {
        try {
          const { data, error } = await supabase
            .from(API_CACHE_TABLE)
            .select('*')
            .eq('asin', code)
            .single();

          if (!error && data) {
            console.log('✅ Found by ASIN in API cache');
            cachedResult = data;
          }
        } catch (error) {
          // Continue to next step
        }
      }
      
      if (cachedResult) {
        console.log('✅ Found in API cache - no charge!');
        return apiCacheService.mapCacheToDisplay(cachedResult);
      }
      
      // STEP 2: Check original manifest data table (by FNSKU and ASIN)
      console.log('📦 Step 2: Checking manifest_data table...');
      
      // Try by FNSKU first
      let { data, error } = await supabase
        .from('manifest_data')
        .select('*')
        .eq('Fn Sku', code)
        .limit(1);

      // If not found by FNSKU, try by ASIN
      if ((!data || data.length === 0) && !error) {
        const asinResult = await supabase
          .from('manifest_data')
          .select('*')
          .eq('B00 Asin', code)
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

      // Return the first item from the array, or null if no results
      if (data && data.length > 0) {
        console.log('✅ Found in manifest_data table');
        return data[0];
      }
      
      console.log('❌ Not found in either table');
      return null;
    } catch (error) {
      console.error('Error in getProductByFnsku:', error);
      return null;
    }
  },

  async getProductByLpn(lpnValue) {
    const lpnColumn = columnMap['lpn'];
    if (!lpnColumn) {
      console.error('getProductByLpn: LPN column name is not mapped correctly.');
      return null;
    }
    const { data, error } = await supabase
      .from(PRODUCT_TABLE)
      .select('*')
      .eq(lpnColumn, lpnValue)
      .maybeSingle();
    if (error) {
      console.error('Error fetching product by LPN from Supabase:', error);
      return null;
    }
    return data;
  },

  /**
   * Saves or updates product lookup data in Supabase.
   * It uses 'Fn Sku' for conflict resolution by default.
   * Adjust `onConflict` if you have a different primary key or unique constraint.
   * @param {Object} productData - The product data to save.
   * @param {Object} options - Options for conflict resolution.
   * @param {string} options.conflictKey - The key to use for conflict resolution.
   * @returns {Promise<Object|null>} - A promise that resolves to the saved product or null on error.
   */
  async saveProductLookup(productData, options = {}) {
    const mappedData = {};
    const conflictKey = options.conflictKey || 'fnsku'; 
    const conflictColumnSupabase = columnMap[conflictKey];

    if (!conflictColumnSupabase) {
      console.error(`saveProductLookup: Invalid or unmapped conflictKey provided: "${conflictKey}". Cannot determine conflict column.`);
      return null;
    }

    // Only map fields that are defined in our streamlined columnMap
    for (const genericKey in columnMap) {
      if (productData.hasOwnProperty(genericKey) && productData[genericKey] !== undefined) {
        const supabaseColumn = columnMap[genericKey];
        // Ensure we don't try to map 'id' if it wasn't part of productData, 
        // or if it was but it's for conflict on another key (Supabase handles PK generation)
        if (supabaseColumn && (genericKey !== 'id' || productData.id !== undefined)) {
             mappedData[supabaseColumn] = productData[genericKey];
        }
      }
    }
        
    if (Object.keys(mappedData).length === 0) {
        console.error('saveProductLookup: No data to save after mapping. Original productData:', productData);
        return null;
    }
    
    if (!mappedData[conflictColumnSupabase] && conflictKey !== 'id') { // if conflict is on id, id might be auto-generated
        console.error(`saveProductLookup: Value for conflict column "${conflictColumnSupabase}" (derived from key "${conflictKey}") is missing or null. Data for save:`, mappedData);
        return null; 
    }

    console.log(`Attempting to save external API result to database:`, mappedData);

    try {
      // First check if this FNSKU already exists
      const existingProduct = await this.getProductByFnsku(mappedData[conflictColumnSupabase]);
      
      if (existingProduct) {
        console.log(`Product with FNSKU ${mappedData[conflictColumnSupabase]} already exists, updating...`);
        // Update existing product
        const { data, error } = await supabase
          .from(PRODUCT_TABLE)
          .update(mappedData)
          .eq(conflictColumnSupabase, mappedData[conflictColumnSupabase])
          .select()
          .single();
        
        if (error) {
          console.error('Error updating existing product in Supabase:', error);
          console.error('Attempted to update:', mappedData);
          return null;
        }
        console.log('✅ Successfully updated existing product:', data);
        return data;
      } else {
        console.log(`Product with FNSKU ${mappedData[conflictColumnSupabase]} is new, inserting...`);
        // Insert new product
        const { data, error } = await supabase
          .from(PRODUCT_TABLE)
          .insert(mappedData)
          .select()
          .single();

        if (error) {
          console.error('Error inserting new product to Supabase:', error);
          console.error('Attempted to insert:', mappedData);
          return null;
        }
        console.log('✅ Successfully inserted new product:', data);
        return data;
      }
    } catch (error) {
      console.error('Exception in saveProductLookup:', error);
      return null;
    }
  },
  
  /**
   * Gets a number of recent product lookups. 
   * This is an example function that was used in DatabaseCheck.jsx
   * You might want to adjust the ordering column (e.g., 'created_at', 'last_updated')
   */
  async getRecentLookups(count = 10) {
    const idColumn = columnMap['id'];
    if (!idColumn) {
        console.error('getRecentLookups: ID column not mapped for ordering.');
        return [];
    }
    const { data, error } = await supabase
      .from(PRODUCT_TABLE)
      .select('*')
      .order(idColumn, { ascending: false })
      .limit(count);
    if (error) {
      console.error('Error fetching recent lookups from Supabase:', error);
      return [];
    }
    return data || [];
  },

  /**
   * Fetches a paginated list of products with optional search.
   * @param {object} options - Options for fetching.
   * @param {number} options.page - The current page number (1-indexed).
   * @param {number} options.limit - The number of items per page.
   * @param {string} options.searchQuery - Optional search term.
   * @returns {Promise<{data: Array, totalCount: number}>}
   */
  async getProducts({ page = 1, limit = 25, searchQuery = '' }) {
    const offset = (page - 1) * limit;
    let query = supabase.from(PRODUCT_TABLE);
    let countQuery = supabase.from(PRODUCT_TABLE);

    // Base select for both data and count
    // For count, we need to specify a column, Supabase client requires it for .select with { count: 'exact' }
    // Using 'id' as it's indexed and always present.
    query = query.select('*', { count: 'exact' }); 
    // countQuery = countQuery.select('id', { count: 'exact', head: true }); // More efficient count

    if (searchQuery) {
      const searchTerm = `%${searchQuery}%`;
      // Apply search filter to both data query and count query
      const searchOrConditions = [
        `${columnMap.lpn}.ilike.${searchTerm}`,
        `${columnMap.fnsku}.ilike.${searchTerm}`,
        `${columnMap.asin}.ilike.${searchTerm}`,
        `${columnMap.name}.ilike.${searchTerm}`, // 'name' maps to 'Description'
      ].join(',');
      
      query = query.or(searchOrConditions);
      // countQuery = countQuery.or(searchOrConditions); // Count needs the same filters
    }

    // Apply ordering and pagination to the data query
    query = query.order(columnMap.id, { ascending: true }); // Or order by name, etc.
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching products for inventory:', error);
      return { data: [], totalCount: 0 };
    }
    
    // The 'count' returned by PostgREST with { count: 'exact' } is the total matching rows
    // before pagination is applied by range().
    return { data: data || [], totalCount: count || 0 };
  },

  /**
   * Fetches dashboard statistics.
   * @returns {Promise<{totalProducts: number, sumOfQuantities: number}>}
   */
  async getDashboardStats() {
    try {
      // Get total number of products
      const { count: totalProducts, error: countError } = await supabase
        .from(PRODUCT_TABLE)
        .select('id', { count: 'exact', head: true }); // Efficient way to count

      if (countError) {
        console.error('Error fetching total product count:', countError);
        // Allow partial stats if one part fails
      }

      // Get sum of all quantities
      // This requires a custom RPC or a more direct way if RLS allows,
      // or fetching all and summing (not ideal for large datasets).
      // For now, let's assume a simple count for demonstration or if quantity sum is complex with RLS.
      // A proper sum would be:
      // const { data: sumData, error: sumError } = await supabase.rpc('sum_quantities');
      // For a client-side accessible sum (less efficient but works without specific RPC):
      // This will fetch ALL quantities, then sum. Can be slow.
      // Consider creating a DB view or function for this if performance is an issue.
      const { data: allProducts, error: allProductsError } = await supabase
        .from(PRODUCT_TABLE)
        .select(columnMap.quantity); // Select only the quantity column

      let sumOfQuantities = 0;
      if (allProductsError) {
        console.error('Error fetching quantities for sum:', allProductsError);
      } else if (allProducts) {
        sumOfQuantities = allProducts.reduce((acc, item) => acc + (item[columnMap.quantity] || 0), 0);
      }
      
      return {
        totalProducts: totalProducts || 0,
        sumOfQuantities: sumOfQuantities,
      };

    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      return { totalProducts: 0, sumOfQuantities: 0 };
    }
  },

  async logScanEvent(scannedCode, productDetails = null) {
    if (!scannedCode) return null;
    try {
      // Handle different data sources properly
      let manifestDataId = null;
      let productDescription = null;
      
      if (productDetails) {
        // If this came from API cache, don't try to link to manifest_data
        if (productDetails.source === 'api_cache' || productDetails.source === 'fnsku_cache' || productDetails.rawCache) {
          manifestDataId = null; // Don't link to manifest_data for API cache entries
          productDescription = productDetails.name || productDetails.description;
        } else if (productDetails.rawSupabase && productDetails.rawSupabase.id) {
          // This came from manifest_data table, safe to reference
          manifestDataId = productDetails.rawSupabase.id;
          productDescription = productDetails.name;
        } else if (productDetails.id && productDetails.source === 'local_database') {
          // This came from manifest_data table via mapping
          manifestDataId = productDetails.id;
          productDescription = productDetails.name;
        } else {
          // External API or other sources - no manifest_data reference
          manifestDataId = null;
          productDescription = productDetails.name || productDetails.description;
        }
      }
      
      const eventData = {
        scanned_code: scannedCode,
        scanned_at: new Date().toISOString(),
        manifest_data_id: manifestDataId, // Only set if from manifest_data table
        product_description: productDescription,
      };
      
      console.log('🔍 Attempting to log scan event:', eventData);
      
      const { data, error } = await supabase
        .from('scan_history') 
        .insert(eventData)
        .select(); // Added select() to get the inserted row back, useful for confirmation

      if (error) {
        console.error('Error logging scan event to Supabase:', error);
        return null;
      }
      // Supabase insert().select() by default returns an array, even for single insert
      console.log('✅ Scan event logged successfully:', data ? data[0] : 'No data returned from insert');
      return data ? data[0] : null;
    } catch (error) {
      console.error('Exception logging scan event:', error);
      return null;
    }
  },

  async getRecentScanEvents(limit = 5) {
    try {
      const { data, error } = await supabase
        .from('scan_history as sh') 
        .select(`
          id, scanned_code, scanned_at, manifest_data_id, 
          manifest_data:manifest_data_id ( Description, "X-Z ASIN", "B00 Asin", MSRP )
        `)
        .order('scanned_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[DB Service] Error fetching recent scan events with product details:', error);
        return [];
      }
      console.log("[DB Service] Raw data from scan_history join:", data);

      const mappedData = (data || []).map(scan => ({
        id: scan.id,
        scanned_code: scan.scanned_code,
        scanned_at: scan.scanned_at,
        description: scan.manifest_data ? scan.manifest_data.Description : scan.scanned_code,
        lpn: scan.manifest_data ? scan.manifest_data['X-Z ASIN'] : 'N/A',
        asin: scan.manifest_data ? scan.manifest_data['B00 Asin'] : 'N/A',
        price: scan.manifest_data ? scan.manifest_data.MSRP : null,
      }));
      console.log("[DB Service] Mapped scan_history data:", mappedData);
      return mappedData;

    } catch (error) {
      console.error('[DB Service] Exception fetching recent scan events:', error);
      return [];
    }
  }
};

// Export the service for use in other parts of the application
export default productLookupService; 