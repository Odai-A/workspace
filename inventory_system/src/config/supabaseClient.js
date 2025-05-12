import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL or Anon Key is missing. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.");
  // You might want to throw an error here or handle this case more gracefully
  // depending on your application's requirements.
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const inventoryService = {
  // We will add product and inventory related functions here,
  // such as getInventoryBySku, addOrUpdateInventory, etc.
  
  /**
   * Example: Get all items from an 'inventory' table
   * Replace 'inventory' with your actual table name.
   */
  async getInventory() {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase client not initialized.");
      return []; // Or handle error appropriately
    }
    const { data, error } = await supabase
      .from('inventory') // Replace 'inventory' with your actual table name
      .select('*');
    
    if (error) {
      console.error('Error fetching inventory:', error);
      return [];
    }
    return data || [];
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
   * Example: Add or update an inventory item.
   * This is a basic example and might need adjustment based on your table structure.
   */
  async addOrUpdateInventory(item) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase client not initialized.");
      return null;
    }
    // We need to know your primary key or how to identify existing items
    // For example, if 'sku' is unique and you want to update based on it:
    const { data, error } = await supabase
      .from('inventory') // Replace 'inventory' with your actual table name
      .upsert(item, { onConflict: 'sku' }) // Assumes 'sku' is a unique constraint
      .select()
      .single();

    if (error) {
      console.error('Error adding or updating inventory:', error);
      return null;
    }
    return data;
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