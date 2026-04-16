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

// Helper function to get current user ID
const getCurrentUserId = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

// Helper function to get current user's tenant_id
const getCurrentTenantId = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const appMetadata = session.user.app_metadata || session.user.raw_app_meta_data || {};
      return appMetadata.tenant_id || null;
    }
    return null;
  } catch (error) {
    console.error('Error getting tenant_id:', error);
    return null;
  }
};

/**
 * Inventory rows use user_id unless you migrated `inventory.tenant_id` and set
 * VITE_INVENTORY_USE_TENANT_ID=true. If the JWT has tenant_id but the column
 * does not exist, filtering by tenant_id causes PostgREST "column does not exist".
 */
async function getInventoryTenantScope() {
  const enabled = import.meta.env.VITE_INVENTORY_USE_TENANT_ID === 'true';
  if (!enabled) {
    return { useTenantColumn: false, tenantId: null };
  }
  const tenantId = await getCurrentTenantId();
  return { useTenantColumn: !!tenantId, tenantId };
}

/** Readable message from Supabase / PostgREST errors (avoid [object Object] in UI). */
export function formatSupabaseError(error) {
  if (error == null) return 'Unknown error';
  if (typeof error === 'string') return error;
  const msg = error.message || error.details || error.hint || error.description;
  if (msg) {
    const code = error.code ? ` (${error.code})` : '';
    return `${msg}${code}`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export const inventoryService = {
  lastInventoryError: null,

  /**
   * Get all items from the inventory table with optional search and pagination
   * Automatically filters by current user's ID
   */
  async getInventory(options = {}) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase client not initialized.");
      return { data: [], totalCount: 0 };
    }
    
    // Get current user ID
    const userId = await getCurrentUserId();
    if (!userId) {
      console.warn("No user ID found - cannot fetch inventory");
      return { data: [], totalCount: 0 };
    }
    const tenantIdForDebug = await getCurrentTenantId();
    const inventoryRunId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // #region agent log
    fetch('http://127.0.0.1:7401/ingest/d9ae4633-7ca7-4e61-9841-2769087dbd8c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bff232'},body:JSON.stringify({sessionId:'bff232',runId:inventoryRunId,hypothesisId:'H3',location:'supabaseClient.js:getInventory:start',message:'Inventory fetch started',data:{userId,tenantId:tenantIdForDebug,page:options.page||1,limit:options.limit||25},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    
    const { 
      page = 1, 
      limit = 25, 
      searchQuery = '' 
    } = options;
    
    const offset = (page - 1) * limit;

    // RLS restricts rows to the current user (and optionally tenant when policies support it).
    let query = supabase.from('inventory').select('*', { count: 'exact' });

    // Omit rows the user removed from the list (soft-hide; row still exists in DB)
    query = query.eq('hidden_from_inventory_list', false);
    // Always scope inventory reads to the current user to prevent cross-account leakage
    // even if RLS/policies are temporarily misconfigured.
    query = query.eq('user_id', userId);
    // #region agent log
    fetch('http://127.0.0.1:7401/ingest/d9ae4633-7ca7-4e61-9841-2769087dbd8c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bff232'},body:JSON.stringify({sessionId:'bff232',runId:inventoryRunId,hypothesisId:'H8',location:'supabaseClient.js:getInventory:scope',message:'Inventory query scope before execution',data:{scopeMode:'explicit_user_id_filter',expectsRlsIsolation:true,userId},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

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
      // #region agent log
      fetch('http://127.0.0.1:7401/ingest/d9ae4633-7ca7-4e61-9841-2769087dbd8c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bff232'},body:JSON.stringify({sessionId:'bff232',runId:inventoryRunId,hypothesisId:'H4',location:'supabaseClient.js:getInventory:error',message:'Inventory fetch failed',data:{message:(error?.message||'').slice(0,180),code:error?.code||''},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return { data: [], totalCount: 0 };
    }
    const ownerSample = [...new Set((data || []).map((row) => row?.user_id || 'null'))].slice(0, 5);
    const tenantSample = [...new Set((data || []).map((row) => row?.tenant_id || 'null'))].slice(0, 5);
    // #region agent log
    fetch('http://127.0.0.1:7401/ingest/d9ae4633-7ca7-4e61-9841-2769087dbd8c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bff232'},body:JSON.stringify({sessionId:'bff232',runId:inventoryRunId,hypothesisId:'H5',location:'supabaseClient.js:getInventory:result',message:'Inventory fetch completed',data:{returnedRows:(data||[]).length,totalCount:count||0,ownerSample,tenantSample},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    
    return { 
      data: data || [], 
      totalCount: count || 0 
    };
  },

  /**
   * Get inventory item by SKU for the current user
   * Automatically filters by current user's ID
   */
  async getInventoryBySku(skuValue) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase client not initialized.");
      return null; 
    }
    
    // Get current user ID
    const userId = await getCurrentUserId();
    if (!userId) {
      console.warn("No user ID found - cannot fetch inventory by SKU");
      return null;
    }
    
    // RLS policies will automatically filter by tenant_id if available
    // This allows shared inventory access within the tenant
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('sku', skuValue)
      .maybeSingle(); // Use maybeSingle instead of single to avoid errors if not found

    if (error && error.code !== 'PGRST116') { // PGRST116: Row to singular not found
      console.error('Error fetching inventory by SKU:', error);
      return null;
    }
    return data;
  },
  
  /**
   * Add or update an inventory item.
   * Checks if item exists first, then updates or inserts accordingly.
   * Automatically associates with current user's ID
   */
  async addOrUpdateInventory(item) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase client not initialized.");
      return null;
    }
    
    // Get current user ID
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('addOrUpdateInventory: User must be logged in');
      return null;
    }
    
    const { useTenantColumn, tenantId } = await getInventoryTenantScope();

    // Remove fields that don't exist in the inventory table; ensure numbers are valid
    const numPrice = (item.price != null && !Number.isNaN(Number(item.price))) ? Number(item.price) : 0;
    const numCost = (item.cost != null && !Number.isNaN(Number(item.cost))) ? Number(item.cost) : 0;
    const quantity = (item.quantity != null && !Number.isNaN(Number(item.quantity))) ? Number(item.quantity) : 1;
    const cleanItem = {
      sku: item.sku,
      name: item.name || 'Unknown Product',
      quantity,
      location: item.location || 'Default',
      condition: item.condition || 'New',
      price: numPrice,
      cost: numCost,
      image_url: item.image_url ?? null,
      user_id: userId,
      hidden_from_inventory_list: false,
    };
    if (item.item_number) {
      cleanItem.item_number = item.item_number;
    }
    if (useTenantColumn && tenantId != null) cleanItem.tenant_id = tenantId;
    
    // Only add product_id if it exists and is valid
    // We'll verify it exists in manifest_data before including it
    // If it doesn't exist or can't be verified, we'll skip it (product_id is optional)
    if (item.product_id !== undefined && item.product_id !== null) {
      try {
        // Verify the product_id exists in manifest_data (for current user)
        const { data: productCheck, error: checkError } = await supabase
          .from('manifest_data')
          .select('id')
          .eq('id', item.product_id)
          .eq('user_id', userId) // Only check current user's manifest data
          .maybeSingle();
        
        if (!checkError && productCheck) {
          // Product exists, safe to include product_id
          cleanItem.product_id = item.product_id;
        } else {
          // Product doesn't exist or error checking, skip product_id
          console.warn(`Product ID ${item.product_id} not found in manifest_data for user ${userId}, skipping product_id`);
        }
      } catch (error) {
        // If verification fails, skip product_id (it's optional)
        console.warn('Error verifying product_id, skipping:', error);
      }
    }
    
    // Check if item exists by SKU in the tenant (shared inventory)
    const skuValue = cleanItem.sku;
    if (!skuValue) {
      console.error('addOrUpdateInventory: SKU is required');
      return null;
    }
    
    try {
      // Check for existing item with same SKU in the tenant
      // If tenant_id exists, check by tenant_id; otherwise check by user_id
      let query = supabase
        .from('inventory')
        .select('*')
        .eq('sku', skuValue);
      
      if (useTenantColumn && tenantId) {
        query = query.eq('tenant_id', tenantId);
      } else {
        query = query.eq('user_id', userId);
      }
      
      const { data: existingData, error: searchError } = await query
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
        if (!updateData.item_number && existingData.item_number) {
          updateData.item_number = existingData.item_number;
        }
        // Show again in inventory list if it was previously soft-removed
        updateData.hidden_from_inventory_list = false;
        
        // Update query - use tenant_id if available, otherwise user_id
        let updateQuery = supabase
          .from('inventory')
          .update(updateData)
          .eq('sku', skuValue);
        
        if (useTenantColumn && tenantId) {
          updateQuery = updateQuery.eq('tenant_id', tenantId);
        } else {
          updateQuery = updateQuery.eq('user_id', userId);
        }
        
        let { data, error } = await updateQuery
          .select()
          .single();
        if (error && updateData.item_number && /item_number/i.test(error.message || '')) {
          const fallbackData = { ...updateData };
          delete fallbackData.item_number;
          let retryQuery = supabase
            .from('inventory')
            .update(fallbackData)
            .eq('sku', skuValue);
          if (useTenantColumn && tenantId) retryQuery = retryQuery.eq('tenant_id', tenantId);
          else retryQuery = retryQuery.eq('user_id', userId);
          ({ data, error } = await retryQuery.select().single());
        }
        
        if (error) {
          this.lastInventoryError = error.message || 'Update failed';
          console.error('Error updating inventory:', error);
          return null;
        }
        this.lastInventoryError = null;
        result = data;
        console.log('✅ Successfully updated inventory item:', result);
      } else {
        // Insert new item (user_id is already set in cleanItem)
        let { data, error } = await supabase
          .from('inventory')
          .insert(cleanItem)
          .select()
          .single();
        if (error && cleanItem.item_number && /item_number/i.test(error.message || '')) {
          const fallbackItem = { ...cleanItem };
          delete fallbackItem.item_number;
          ({ data, error } = await supabase
            .from('inventory')
            .insert(fallbackItem)
            .select()
            .single());
        }
        
        if (error) {
          this.lastInventoryError = error.message || 'Insert failed';
          console.error('Error inserting inventory:', error);
          console.error('Attempted to insert:', cleanItem);
          return null;
        }
        this.lastInventoryError = null;
        result = data;
        console.log('✅ Successfully inserted inventory item:', result);
      }
      
      return result;
    } catch (error) {
      this.lastInventoryError = error.message || 'Unexpected error';
      console.error('Exception in addOrUpdateInventory:', error);
      return null;
    }
  },

  /**
   * Soft-remove an inventory row from the UI (does not DELETE the row in Supabase).
   */
  async hideInventoryItem(id) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase client not initialized.");
      return { success: false, error: 'Not initialized' };
    }

    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'User must be logged in' };
    }

    let rowId = id != null ? String(id).trim() : '';
    if (!rowId) {
      return { success: false, error: 'Invalid inventory id' };
    }
    // UUID strings should match Postgres uuid type (case-insensitive; normalize for .eq)
    if (rowId.length === 36 && rowId.includes('-')) {
      rowId = rowId.toLowerCase();
    }

    const normalizeRows = (d) => {
      if (d == null) return [];
      return Array.isArray(d) ? d : [d];
    };

    try {
      // Do not filter by user_id here: RLS already restricts UPDATE to auth.uid() = user_id.
      // Extra .eq('user_id', userId) can fail if the row's user_id ever differs from getUser().id formatting,
      // and some PostgREST setups return an empty body on UPDATE+RETURNING even when the row updated.
      let { data, error } = await supabase
        .from('inventory')
        .update({ hidden_from_inventory_list: true })
        .eq('id', rowId)
        .select('id');

      if (error) {
        console.error('Error hiding inventory item:', error);
        return { success: false, error: formatSupabaseError(error) };
      }

      if (normalizeRows(data).length > 0) {
        return { success: true };
      }

      // Retry with explicit user_id (helps if RLS is misconfigured and row matched only via legacy paths)
      ({ data, error } = await supabase
        .from('inventory')
        .update({ hidden_from_inventory_list: true })
        .eq('id', rowId)
        .eq('user_id', userId)
        .select('id'));

      if (error) {
        console.error('Error hiding inventory item (retry):', error);
        return { success: false, error: formatSupabaseError(error) };
      }
      if (normalizeRows(data).length > 0) {
        return { success: true };
      }

      // Confirm whether the row is already hidden or the update actually applied
      const { data: row, error: readErr } = await supabase
        .from('inventory')
        .select('id, hidden_from_inventory_list')
        .eq('id', rowId)
        .maybeSingle();

      if (readErr) {
        return { success: false, error: formatSupabaseError(readErr) };
      }
      if (row?.hidden_from_inventory_list === true) {
        return { success: true };
      }

      return {
        success: false,
        error:
          'Could not update this inventory row. It may belong to another account, or the database is missing column hidden_from_inventory_list — run migration 022_inventory_soft_remove.sql.',
      };
    } catch (error) {
      console.error('Exception in hideInventoryItem:', error);
      return { success: false, error: formatSupabaseError(error) };
    }
  },

  /**
   * Soft-remove multiple inventory rows (does not DELETE rows in Supabase).
   */
  async hideInventoryItems(ids) {
    if (!supabaseUrl || !supabaseAnonKey) {
      return { success: false, error: 'Supabase not initialized' };
    }

    if (!ids || ids.length === 0) {
      return { success: false, error: 'No IDs provided' };
    }

    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'User must be logged in' };
    }

    const idList = [...new Set(ids.map((x) => (x != null ? String(x).trim() : '')).filter(Boolean))];
    if (idList.length === 0) {
      return { success: false, error: 'No valid IDs provided' };
    }

    const normalizeUuid = (s) => {
      const t = String(s).trim();
      if (t.length === 36 && t.includes('-')) return t.toLowerCase();
      return t;
    };
    const normalizedIds = idList.map(normalizeUuid);

    try {
      const BATCH = 200;
      let hiddenCount = 0;
      for (let i = 0; i < normalizedIds.length; i += BATCH) {
        const chunk = normalizedIds.slice(i, i + BATCH);
        let { data, error } = await supabase
          .from('inventory')
          .update({ hidden_from_inventory_list: true })
          .in('id', chunk)
          .select('id');

        if (error) {
          console.error('Error hiding inventory items:', error);
          return { success: false, error: formatSupabaseError(error) };
        }
        let n = Array.isArray(data) ? data.length : data ? 1 : 0;
        if (n === 0) {
          ({ data, error } = await supabase
            .from('inventory')
            .update({ hidden_from_inventory_list: true })
            .in('id', chunk)
            .eq('user_id', userId)
            .select('id'));
          if (error) {
            console.error('Error hiding inventory items (retry):', error);
            return { success: false, error: formatSupabaseError(error) };
          }
          n = Array.isArray(data) ? data.length : data ? 1 : 0;
        }
        hiddenCount += n;
      }
      return { success: true, hiddenCount };
    } catch (error) {
      console.error('Exception in hideInventoryItems:', error);
      return { success: false, error: formatSupabaseError(error) };
    }
  },

  /** @deprecated Use hideInventoryItem — kept for callers; does not DELETE from DB. */
  async deleteInventoryItem(id) {
    return this.hideInventoryItem(id);
  },

  /** @deprecated Use hideInventoryItems — kept for callers; does not DELETE from DB. */
  async deleteInventoryItems(ids) {
    const r = await this.hideInventoryItems(ids);
    if (r.success) return { success: true, deletedCount: r.hiddenCount };
    return r;
  },

  /**
   * Manifest IDs the user hid from the combined inventory list (manifest_data rows are untouched).
   */
  async getHiddenManifestIds() {
    if (!supabaseUrl || !supabaseAnonKey) return [];

    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('inventory_hidden_manifest')
      .select('manifest_id')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching hidden manifest ids:', error);
      return [];
    }
    return (data || []).map((row) => String(row.manifest_id));
  },

  /**
   * Hide a manifest_data row from the inventory UI only (does not DELETE manifest_data).
   */
  async hideManifestFromInventoryList(manifestId) {
    if (!supabaseUrl || !supabaseAnonKey) {
      return { success: false, error: 'Not initialized' };
    }
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'User must be logged in' };
    }
    if (manifestId == null || manifestId === '') {
      return { success: false, error: 'manifest_id required' };
    }

    const { error } = await supabase.from('inventory_hidden_manifest').upsert(
      { user_id: userId, manifest_id: String(manifestId) },
      { onConflict: 'user_id,manifest_id' }
    );

    if (error) {
      console.error('Error hiding manifest from inventory list:', error);
      return { success: false, error: formatSupabaseError(error) };
    }
    return { success: true };
  },

  /**
   * Bulk hide manifest rows from inventory UI only.
   */
  async hideManifestFromInventoryListBulk(manifestIds) {
    if (!manifestIds || manifestIds.length === 0) {
      return { success: true, hiddenCount: 0 };
    }
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'User must be logged in' };
    }
    const rows = [...new Set(manifestIds.map((id) => String(id)))].map((manifest_id) => ({
      user_id: userId,
      manifest_id,
    }));
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error } = await supabase
        .from('inventory_hidden_manifest')
        .upsert(chunk, { onConflict: 'user_id,manifest_id' });
      if (error) {
        console.error('Error bulk-hiding manifest rows:', error);
        return { success: false, error: formatSupabaseError(error) };
      }
    }
    return { success: true, hiddenCount: rows.length };
  },
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