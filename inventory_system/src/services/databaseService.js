import { supabase } from '../config/supabaseClient';

// The name of your Supabase table
const PRODUCT_TABLE = 'manifest_data';

// Streamlined Column mapping for essential fields
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
   * Gets a product by its FNSKU.
   * @param {string} fnskuValue - The FNSKU to search for.
   * @returns {Promise<Object|null>} - A promise that resolves to the product or null if not found.
   */
  async getProductByFnsku(fnskuValue) {
    const fnskuColumn = columnMap['fnsku'];
    if (!fnskuColumn) {
      console.error('getProductByFnsku: FNSKU column name is not mapped correctly.');
      return null;
    }
    const { data, error } = await supabase
      .from(PRODUCT_TABLE)
      .select('*')
      .eq(fnskuColumn, fnskuValue)
      .maybeSingle();
    if (error) {
      console.error('Error fetching product by FNSKU from Supabase:', error);
      return null;
    }
    return data;
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

    console.log(`Attempting to save/update with conflict on: ${conflictColumnSupabase}`, mappedData);

    const { data, error } = await supabase
      .from(PRODUCT_TABLE)
      .upsert(mappedData, { onConflict: conflictColumnSupabase })
      .select()
      .single();

    if (error) {
      console.error('Error saving product lookup to Supabase:', error);
      console.error('Attempted to save:', mappedData);
      return null;
    }
    return data;
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
      const eventData = {
        scanned_code: scannedCode,
        scanned_at: new Date().toISOString(),
        // Assuming productDetails contains an 'id' field from manifest_data after mapping
        manifest_data_id: productDetails ? productDetails.id : null, 
        // productDetails.name is already the mapped Description
        product_description: productDetails ? productDetails.name : null, 
      };
      const { data, error } = await supabase
        .from('scan_history') 
        .insert(eventData)
        .select(); // Added select() to get the inserted row back, useful for confirmation

      if (error) {
        console.error('Error logging scan event to Supabase:', error);
        return null;
      }
      // Supabase insert().select() by default returns an array, even for single insert
      console.log('Scan event logged:', data ? data[0] : 'No data returned from insert');
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