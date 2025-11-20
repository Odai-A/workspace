import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if Supabase is properly configured
const isSupabaseConfigured = supabaseUrl && 
                             supabaseAnonKey && 
                             supabaseUrl !== 'https://placeholder.supabase.co' && 
                             supabaseAnonKey !== 'placeholder-key' &&
                             !supabaseUrl.includes('your-project') &&
                             !supabaseAnonKey.includes('your-anon-key');

if (!isSupabaseConfigured) {
  console.warn("⚠️ Supabase URL or Anon Key is missing or using placeholder values.");
  console.warn("⚠️ Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.");
  console.warn("⚠️ Get your credentials from: https://app.supabase.com/project/_/settings/api");
  console.warn("⚠️ App will run in limited mode without Supabase authentication.");
}

// Use placeholder values only if not configured (prevents crashes)
const finalSupabaseUrl = isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co';
const finalSupabaseAnonKey = isSupabaseConfigured ? supabaseAnonKey : 'placeholder-key';

// Create client with placeholder values if not configured (prevents crashes)
export const supabase = createClient(finalSupabaseUrl, finalSupabaseAnonKey);

export const inventoryService = {
  // We will add product and inventory related functions here,
  // such as getInventoryBySku, addOrUpdateInventory, etc.
  
  /**
   * Get all items from the inventory table with optional search and pagination
   */
  async getInventory(options = {}) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase client not initialized.");
      return { data: [], totalCount: 0 };
    }
    
    const { 
      page = 1, 
      limit = 25, 
      searchQuery = '' 
    } = options;
    
    const offset = (page - 1) * limit;
    let query = supabase.from('inventory').select('*', { count: 'exact' });
    
    // Add search functionality
    if (searchQuery && searchQuery.trim()) {
      const searchTerm = `%${searchQuery.trim()}%`;
      // Search in name, sku, asin, and other relevant fields
      // Build OR conditions for all searchable fields
      const searchConditions = [
        `name.ilike.${searchTerm}`,
        `sku.ilike.${searchTerm}`
      ];
      
      // Add ASIN search if the column exists (try-catch won't work here, so we'll include it)
      // If ASIN column doesn't exist, Supabase will ignore it or we can handle the error
      searchConditions.push(`asin.ilike.${searchTerm}`);
      
      query = query.or(searchConditions.join(','));
    }
    
    query = query.order('id', { ascending: false });
    query = query.range(offset, offset + limit - 1);
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('Error fetching inventory:', error);
      return { data: [], totalCount: 0 };
    }
    
    return { 
      data: data || [], 
      totalCount: count || 0 
    };
  },

  /**
   * Example: Get inventory item by SKU
   * Replace 'inventory' and 'sku' with your actual table and column names.
   */
  async getInventoryBySku(skuValue) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase client not initialized.");
      return null; 
    }
    const { data, error } = await supabase
      .from('inventory') // Replace 'inventory' with your actual table name
      .select('*')
      .eq('sku', skuValue) // Replace 'sku' with your actual SKU column name
      .single(); // Assumes SKU is unique

    if (error && error.code !== 'PGRST116') { // PGRST116: Row to singular not found
      console.error('Error fetching inventory by SKU:', error);
      return null;
    }
    return data;
  },
  
  /**
   * Add or update an inventory item.
   * Checks if item exists first, then updates or inserts accordingly.
   */
  async addOrUpdateInventory(item) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase client not initialized.");
      return null;
    }
    
    // Remove fields that don't exist in the inventory table
    // Only keep essential fields: sku, name, quantity, location, condition, price, cost
    const cleanItem = {
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      location: item.location,
      condition: item.condition,
      price: item.price,
      cost: item.cost
    };
    
    // Only add optional fields if they exist and are not null/undefined
    if (item.product_id !== undefined && item.product_id !== null) {
      cleanItem.product_id = item.product_id;
    }
    
    // Check if item exists by SKU
    const skuValue = cleanItem.sku;
    if (!skuValue) {
      console.error('addOrUpdateInventory: SKU is required');
      return null;
    }
    
    try {
      const { data: existingData, error: searchError } = await supabase
        .from('inventory')
        .select('*')
        .eq('sku', skuValue)
        .limit(1)
        .maybeSingle();
      
      if (searchError && searchError.code !== 'PGRST116') {
        console.error('Error checking for existing inventory:', searchError);
        return null;
      }

      let result;
      if (existingData) {
        // Update existing item - merge quantities if quantity field exists
        const updateData = { ...cleanItem };
        if (cleanItem.quantity !== undefined && existingData.quantity !== undefined) {
          // If both have quantity, add them together
          updateData.quantity = (existingData.quantity || 0) + (cleanItem.quantity || 0);
        }
        
        const { data, error } = await supabase
          .from('inventory')
          .update(updateData)
          .eq('sku', skuValue)
          .select()
          .single();
        
        if (error) {
          console.error('Error updating inventory:', error);
          return null;
        }
        result = data;
        console.log('✅ Successfully updated inventory item:', result);
      } else {
        // Insert new item
        const { data, error } = await supabase
          .from('inventory')
          .insert(cleanItem)
          .select()
          .single();
        
        if (error) {
          console.error('Error inserting inventory:', error);
          console.error('Attempted to insert:', cleanItem);
          return null;
        }
        result = data;
        console.log('✅ Successfully inserted inventory item:', result);
      }
      
      return result;
    } catch (error) {
      console.error('Exception in addOrUpdateInventory:', error);
      return null;
    }
  },

  /**
   * Delete an inventory item by ID
   */
  async deleteInventoryItem(id) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase client not initialized.");
      return null;
    }
    
    try {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Error deleting inventory item:', error);
        return { success: false, error };
      }
      
      return { success: true };
    } catch (error) {
      console.error('Exception in deleteInventoryItem:', error);
      return { success: false, error };
    }
  },

  /**
   * Delete multiple inventory items by IDs
   */
  async deleteInventoryItems(ids) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase client not initialized.");
      return { success: false, error: "Supabase not initialized" };
    }
    
    if (!ids || ids.length === 0) {
      return { success: false, error: "No IDs provided" };
    }
    
    try {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .in('id', ids);
      
      if (error) {
        console.error('Error deleting inventory items:', error);
        return { success: false, error };
      }
      
      return { success: true, deletedCount: ids.length };
    } catch (error) {
      console.error('Exception in deleteInventoryItems:', error);
      return { success: false, error };
    }
  }
};

// Function to check Supabase connection (used by DatabaseCheck.jsx)
export const checkSupabaseConnection = async () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { connected: false, error: "Supabase URL or Anon Key not configured.", details: "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env" };
  }
  try {
    // Perform a simple query to check the connection.
    // Fetching user session or a small, guaranteed table can work.
    // Using auth.getUser() is a common way.
    const { data, error } = await supabase.auth.getUser();
    
    // 'Auth session missing!' is not a critical connection error for anon key usage.
    // It just means no user is logged in.
    if (error && error.message !== 'Auth session missing!' && error.message !== 'invalid JWT') { 
      console.error("Supabase connection error:", error);
      return { connected: false, error: error.message, details: "Failed to connect to Supabase. Check console and .env variables." };
    }
    // If there's data (even if null for user) or only the 'Auth session missing!' error, 
    // it means we reached Supabase.
    return { connected: true, error: null };
  } catch (e) {
    console.error("Supabase connection exception:", e);
    return { connected: false, error: e.message, details: "An exception occurred while trying to connect." };
  }
}; 