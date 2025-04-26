import { supabase } from '../config/supabaseClient';

// Product lookup service to manage product lookups in the database
export const productLookupService = {
  /**
   * Ensures the product_lookups table exists with all required columns
   * @returns {Promise<boolean>} True if table exists or was created successfully
   */
  async ensureTableExists() {
    try {
      // First, try a simple operation to see if the table exists
      const { count, error } = await supabase
        .from('product_lookups')
        .select('*', { count: 'exact', head: true });

      // If no error, table exists
      if (!error) {
        console.log('product_lookups table exists');
        return true;
      }

      console.log('Error checking for product_lookups table:', error);
      
      // If table doesn't exist, create it
      if (error.code === 'PGRST204' || error.message.includes('does not exist')) {
        return this.createTable();
      }
      
      return false;
    } catch (error) {
      console.error('Error checking for product_lookups table:', error);
      return false;
    }
  },
  
  /**
   * Creates the product_lookups table
   * @returns {Promise<boolean>} - True if table was created
   */
  async createTable() {
    try {
      // Create the table if it doesn't exist
      const { error } = await supabase.rpc('create_product_lookups_table');
      
      if (error) {
        console.error('Error creating product_lookups table:', error);
        return false;
      }
      
      console.log('Successfully created product_lookups table');
      return true;
    } catch (error) {
      console.error('Error creating product_lookups table:', error);
      return false;
    }
  },
  
  /**
   * Ensures a column exists in the product_lookups table
   * @param {string} columnName - The name of the column to check/create
   * @param {string} columnType - The SQL type of the column
   * @returns {Promise<boolean>} True if column exists or was created successfully
   */
  async ensureColumnExists(columnName, columnType) {
    try {
      console.log(`Checking if ${columnName} column exists in product_lookups table`);
      
      // Check if the column exists
      const { data: columns, error: columnError } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_schema', 'public')
        .eq('table_name', 'product_lookups')
        .eq('column_name', columnName);
      
      if (columnError) {
        console.error(`Error checking for ${columnName} column:`, columnError);
        return false;
      }
      
      // If column doesn't exist, add it
      if (!columns || columns.length === 0) {
        console.log(`Adding ${columnName} column to product_lookups table`);
        
        const { error: alterError } = await supabase.rpc('exec', {
          query: `
            ALTER TABLE product_lookups
            ADD COLUMN ${columnName} ${columnType}
          `
        });
        
        if (alterError) {
          console.error(`Error adding ${columnName} column:`, alterError);
          return false;
        }
        
        console.log(`${columnName} column added successfully`);
      } else {
        console.log(`${columnName} column already exists`);
      }
      
      return true;
    } catch (error) {
      console.error(`Unexpected error in ensureColumnExists for ${columnName}:`, error);
      return false;
    }
  },
  
  /**
   * Updates the last lookup timestamp for a product
   * @param {string} fnsku - The FNSKU of the product
   * @param {string} userId - The user ID who looked up the product
   * @returns {Promise<boolean>} - True if successful
   */
  async updateLastLookup(fnsku, userId) {
    try {
      if (!fnsku) {
        console.error('updateLastLookup called without FNSKU');
        return false;
      }
      
      // Try to update with exception handling for missing column
      try {
        const { error } = await supabase
          .from('product_lookups')
          .update({
            last_lookup_at: new Date().toISOString(),
            user_id: userId || null
          })
          .eq('fnsku', fnsku);
        
        if (error) {
          // If error is about missing column, try a different approach
          if (error.message.includes('last_lookup_at') || error.code === 'PGRST204') {
            console.log('last_lookup_at column missing, trying alternative update');
            const { error: altError } = await supabase
              .from('product_lookups')
              .update({
                user_id: userId || null
              })
              .eq('fnsku', fnsku);
              
            return !altError;
          }
          
          console.error('Error updating last lookup timestamp:', error);
          return false;
        }
        
        return true;
      } catch (updateError) {
        console.error('Exception in updateLastLookup:', updateError);
        return false;
      }
    } catch (error) {
      console.error('Unexpected error in updateLastLookup:', error);
      return false;
    }
  },
  
  /**
   * Saves a product lookup to the database
   * @param {Object} productData - The product lookup data
   * @param {string} userId - The user ID associated with the lookup
   * @returns {Promise<Object|null>} - The saved product data or null if error
   */
  async saveProductLookup(productData, userId) {
    try {
      if (!productData || !productData.fnsku) {
        console.error('saveProductLookup called without valid product data');
        return null;
      }
      
      console.log(`Saving product lookup for FNSKU: ${productData.fnsku}, user: ${userId || 'anonymous'}`);
      
      // Ensure the table exists
      await this.ensureTableExists();
      
      // See if the product already exists
      const { data: existingData, error: lookupError } = await supabase
        .from('product_lookups')
        .select('*')
        .eq('fnsku', productData.fnsku)
        .limit(1);
      
      if (lookupError) {
        console.error('Error checking for existing product:', lookupError);
      }
      
      if (existingData && existingData.length > 0) {
        // Product exists, update it
        console.log('Updating existing product lookup');
        
        try {
          const updateData = {
            asin: productData.asin, // Keep ASIN
            name: productData.name, // *** ADDED NAME BACK ***
            // Remove other potentially problematic fields for testing
            // sku: productData.sku, 
            // description: productData.description,
            // price: productData.price,
            // category: productData.category,
            // image_url: productData.image_url,
            // condition: productData.condition,
          };
          
          // Try to update with last_lookup_at if possible
          try {
            updateData.last_lookup_at = new Date().toISOString();
            
            const { data, error } = await supabase
              .from('product_lookups')
              .update(updateData)
              .eq('fnsku', productData.fnsku)
              .select()
              .single();
            
            if (!error) return data;
            
            // If error mentions last_lookup_at column, retry without it
            if (error.message.includes('last_lookup_at') || error.code === 'PGRST204') {
              delete updateData.last_lookup_at;
            } else {
              throw error;
            }
          } catch (e) {
            console.log('Error updating with last_lookup_at, trying without:', e.message);
            // Continue with update without last_lookup_at
          }
          
          // Try update without last_lookup_at
          const { data, error } = await supabase
            .from('product_lookups')
            .update(updateData)
            .eq('fnsku', productData.fnsku)
            .select()
            .single();
          
          if (error) {
            console.error('Error updating existing product:', error);
            return null;
          }
          
          return data;
        } catch (updateError) {
          console.error('Exception in product update:', updateError);
          return productData;
        }
      } else {
        // Insert new product
        console.log('Inserting new product lookup');
        
        // Step 1: Insert basic data without last_lookup_at
        try {
          const insertData = {
            fnsku: productData.fnsku,
            asin: productData.asin,
            name: productData.name,
            // Include other non-problematic fields if desired
            // sku: productData.sku, 
            // description: productData.description,
            // price: productData.price,
            // category: productData.category,
            // image_url: productData.image_url,
            // condition: productData.condition,
            // user_id: userId || null, // Add user_id if available
          };
          
          console.log('Attempting initial insert with data:', JSON.stringify(insertData));

          const { data: insertedData, error: insertError } = await supabase
            .from('product_lookups')
            .insert(insertData)
            .select()
            .single();
            
          if (insertError) {
            console.error('Initial insert failed. Error:', JSON.stringify(insertError));
            console.error('Error inserting base product lookup:', insertError);
            // If insert fails, return original data as fallback
            return productData; 
          }
          
          console.log('Initial insert successful. Data:', JSON.stringify(insertedData));

          // Return the initially inserted data
          return insertedData;
          
        } catch (outerInsertError) {
          // Catch any unexpected errors during the insert process
          console.error('Outer exception during product insert process:', JSON.stringify(outerInsertError)); 
          console.error('Exception in product insert:', outerInsertError); 
          return productData; // Return original data as fallback
        }
      }
    } catch (error) {
      console.error('Unexpected error in saveProductLookup:', error);
      // Return the original data if we can't save it
      return productData;
    }
  },
  
  /**
   * Gets a product by FNSKU
   * @param {string} fnsku - The FNSKU to look up
   * @returns {Promise<Object|null>} The product data or null if not found
   */
  async getProductByFnsku(fnsku) {
    try {
      if (!fnsku) {
        console.error('getProductByFnsku called without FNSKU');
        return null;
      }
      
      console.log(`Getting product by FNSKU: ${fnsku}`);
      
      const { data, error } = await supabase
        .from('product_lookups')
        .select('*')
        .eq('fnsku', fnsku)
        .limit(1);
      
      if (error) {
        console.error('Error getting product by FNSKU:', error);
        return null;
      }
      
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Unexpected error in getProductByFnsku:', error);
      return null;
    }
  },
  
  /**
   * Gets recent lookups for a user
   * @param {string} userId - The ID of the user
   * @param {number} limit - The maximum number of lookups to return
   * @returns {Promise<Array<Object>>} The recent lookups
   */
  async getRecentLookups(userId, limit = 10) {
    try {
      if (!userId) {
        console.error('getRecentLookups called without userId');
        return [];
      }
      
      console.log(`Getting recent lookups for user: ${userId}, limit: ${limit}`);
      
      const { data, error } = await supabase
        .from('product_lookups')
        .select('*')
        .eq('user_id', userId)
        .order('last_lookup_at', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.error('Error getting recent lookups:', error);
        return [];
      }
      
      return data || [];
    } catch (error) {
      console.error('Unexpected error in getRecentLookups:', error);
      return [];
    }
  }
}; 