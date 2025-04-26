import { createClient } from '@supabase/supabase-js';

// Supabase client setup
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Better logging of configuration
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ CRITICAL: Missing Supabase credentials!');
  console.error('Make sure to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
  // Don't throw an error here to allow the app to load, but log a warning
} else {
  console.log('✅ Supabase configuration found:');
  console.log('- URL:', supabaseUrl);
  console.log('- Key available:', !!supabaseAnonKey);
}

// Safety check - print first few characters of the URL to debug without exposing full URL
console.log('URL starts with:', supabaseUrl?.substring(0, 15) + '...');

// Define supabase client variable
let supabaseClient;

// Check if we're in development or production mode
const isDevelopment = import.meta.env.DEV;

// Initialize the Supabase client with proper configuration and error handling
try {
  console.log('Creating Supabase client...');
  
  if (isDevelopment && (!supabaseUrl.includes('supabase.co') || supabaseUrl.includes('example'))) {
    console.log('⚠️ Using mock Supabase client for development');
    
    // Create a dummy/mock client for development that doesn't make real network requests
    const mockUser = {
      id: 'mock-user-id-123',
      email: 'test@example.com',
      user_metadata: { 
        full_name: 'Test User',
        avatar_url: 'https://via.placeholder.com/150'
      },
      app_metadata: { 
        role: 'admin'
      },
      aud: 'authenticated'
    };
    
    const mockSession = {
      user: mockUser,
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_at: Date.now() + 3600,
    };
    
    // Mock storage
    const mockStorage = {
      data: {},
      getItem: (key) => mockStorage.data[key] || null,
      setItem: (key, value) => { mockStorage.data[key] = value; },
      removeItem: (key) => { delete mockStorage.data[key]; }
    };
    
    // Set user in mock storage
    mockStorage.setItem('supabase.auth.token', JSON.stringify({
      currentSession: mockSession,
      expiresAt: mockSession.expires_at
    }));
    
    // Create a mock implementation of supabase client
    supabaseClient = {
      auth: {
        getUser: () => Promise.resolve({ data: { user: mockUser }, error: null }),
        getSession: () => Promise.resolve({ data: { session: mockSession }, error: null }),
        signInWithPassword: ({ email, password }) => {
          console.log('Mock auth: Signing in with', email);
          return Promise.resolve({ data: { user: mockUser, session: mockSession }, error: null });
        },
        signUp: ({ email, password }) => {
          console.log('Mock auth: Signing up with', email);
          return Promise.resolve({ data: { user: mockUser, session: mockSession }, error: null });
        },
        signOut: () => {
          console.log('Mock auth: Signing out');
          return Promise.resolve({ error: null });
        },
        onAuthStateChange: (callback) => {
          // Simulate auth state change immediately to set up the app
          setTimeout(() => {
            callback('SIGNED_IN', { user: mockUser, session: mockSession });
          }, 100);
          
          return {
            subscription: { unsubscribe: () => {} }
          };
        }
      },
      from: (table) => ({
        select: (columns = '*') => ({
          eq: (column, value) => ({
            single: () => Promise.resolve({ data: null, error: null }),
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            limit: (limit) => ({
              order: (column, { ascending }) => Promise.resolve({ data: [], error: null }),
              maybeSingle: () => Promise.resolve({ data: null, error: null })
            })
          }),
          or: (conditions) => ({
            limit: (limit) => Promise.resolve({ data: [], error: null }),
            maybeSingle: () => Promise.resolve({ data: null, error: null })
          }),
          limit: (limit) => Promise.resolve({ data: [], error: null }),
          order: (column, { ascending }) => Promise.resolve({ data: [], error: null })
        }),
        insert: (data) => Promise.resolve({ data, error: null }),
        upsert: (data, options) => Promise.resolve({ data, error: null }),
        update: (data) => ({
          eq: (column, value) => Promise.resolve({ data, error: null }),
          match: (conditions) => Promise.resolve({ data, error: null })
        }),
        delete: () => ({
          eq: (column, value) => Promise.resolve({ data: null, error: null }),
          match: (conditions) => Promise.resolve({ data: null, error: null })
        })
      })
    };
    
    console.log('✅ Mock Supabase client created successfully');
  } else {
    // Initialize the real Supabase client for production
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { 
    persistSession: true, 
    autoRefreshToken: true,
    storageKey: 'inventory-system-auth-storage',
        detectSessionInUrl: false,
        debug: true // Enable auth debugging
      }
    });
    
    console.log('✅ Supabase client created successfully');
  }
  
  // Test the client immediately
  supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log('Auth state changed event:', event);
    console.log('User authenticated:', !!session?.user);
  });
} catch (error) {
  console.error('❌ Failed to create Supabase client:', error);
  // Create a dummy client to prevent app crashes
  supabaseClient = {
    auth: {
      signInWithPassword: () => Promise.resolve({ error: { message: 'Supabase client failed to initialize' } }),
      signUp: () => Promise.resolve({ error: { message: 'Supabase client failed to initialize' } }),
      signOut: () => Promise.resolve({ error: { message: 'Supabase client failed to initialize' } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ subscription: { unsubscribe: () => {} } })
    },
    from: () => ({
      select: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ error: { message: 'Supabase client failed to initialize' } }) }) })
    })
  };
}

// Export the client
export const supabase = supabaseClient;

// Use email password authentication instead of anonymous auth
export const signInWithEmail = async (email, password) => {
  if (!email || !password) {
    console.error('Missing email or password for signInWithEmail');
    return { success: false, error: { message: 'Email and password are required' } };
  }
  
  try {
    console.log(`Attempting to sign in user: ${email}`);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      console.error('Sign-in error:', error);
      return { success: false, error };
    }
    
    console.log('Sign-in successful for user:', data?.user?.id);
    return { success: true, session: data.session, user: data.user };
  } catch (err) {
    console.error('Authentication error during signInWithEmail:', err);
    return { success: false, error: err };
  }
};

// Sign up with email and password
export const signUpWithEmail = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });
    
    if (error) {
      console.error('Sign-up error:', error);
      return { success: false, error };
    }
    
    console.log('Sign-up successful, confirmation email sent');
    return { success: true, session: data.session, user: data.user };
  } catch (err) {
    console.error('Authentication error:', err);
    return { success: false, error: err };
  }
};

export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('Sign-out error:', error);
      return { success: false, error };
    }
    
    console.log('Sign-out successful');
    return { success: true };
  } catch (err) {
    console.error('Sign-out error:', err);
    return { success: false, error: err };
  }
};

// Initialize authentication - check for existing session
export const initAuth = async () => {
  try {
    // Check if we already have a session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Session check error:', sessionError);
      return { success: false, error: sessionError };
    }
    
    if (session) {
      console.log('Existing session found. User ID:', session.user.id);
      return { success: true, session, user: session.user };
    }
    
    console.log('No active session found. User needs to sign in.');
    return { success: false, requiresAuth: true };
  } catch (err) {
    console.error('Authentication initialization error:', err);
    return { success: false, error: err };
  }
};

// Try to initialize auth on module load
initAuth().then(({ success, user }) => {
  console.log(`Authentication initialization ${success ? 'successful' : 'failed'}`);
  if (success && user) {
    console.log(`User authenticated: ${user.id}`);
  }
}).catch(err => console.error('Auth init error:', err));

// Inventory service
export const inventoryService = {
  // Add or update an inventory item
  async addOrUpdateInventory(item) {
    if (!item) {
      console.error('No inventory item data provided');
      return null;
    }
    
    try {
      // Ensure we have an active session first
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('No active session. User must sign in to access the database.');
        return null;
      }
      
      // Add timestamps and user_id for RLS
      const itemWithMetadata = {
        ...item,
        updated_at: new Date().toISOString(),
        created_at: item.created_at || new Date().toISOString(),
        user_id: session.user.id  // Important for RLS policies
      };
      
      const { data, error } = await supabase
        .from('inventory')
        .upsert(itemWithMetadata, {
          onConflict: 'sku, user_id', // Include user_id in conflict resolution
          returning: 'minimal'
        });
      
      if (error) {
        if (error.code === '42501' || error.message?.includes('policy')) {
          console.error('Row Level Security policy violation when adding inventory - check your RLS policies:', error);
          console.error(`Make sure your RLS policies include this condition: auth.uid() = user_id`);
          return null;
        } else {
          console.error('Error adding/updating inventory:', error);
          return null;
        }
      }
      
      return itemWithMetadata;
    } catch (err) {
      console.error('Failed to add/update inventory:', err);
      return null;
    }
  },
  
  // Get all inventory items
  async getInventory() {
    try {
      // Ensure we have an active session first
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('No active session. User must sign in to access the database.');
        return [];
      }
      
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('user_id', session.user.id) // Filter by user_id to comply with RLS
        .order('updated_at', { ascending: false });
      
      if (error) {
        console.error('Error getting inventory:', error);
        return [];
      }
      
      return data || [];
    } catch (err) {
      console.error('Failed to get inventory:', err);
      return [];
    }
  },
  
  // Get inventory item by SKU
  async getInventoryBySku(sku) {
    if (!sku) return null;
    
    try {
      // Ensure we have an active session first
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('No active session. User must sign in to access the database.');
        return null;
      }
      
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('sku', sku)
        .eq('user_id', session.user.id) // Filter by user_id to comply with RLS
        .maybeSingle();
      
      if (error) {
        console.error(`Error getting inventory for SKU ${sku}:`, error);
        return null;
      }
      
      return data;
    } catch (err) {
      console.error(`Failed to get inventory for SKU ${sku}:`, err);
      return null;
    }
  },
  
  // Get inventory item by ID
  async getInventoryItemById(id) {
    if (!id) return null;
    
    try {
      // Ensure we have an active session first
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('No active session. User must sign in to access the database.');
        return null;
      }
      
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('id', id)
        .eq('user_id', session.user.id) // Filter by user_id to comply with RLS
        .maybeSingle();
      
      if (error) {
        console.error(`Error getting inventory item by ID ${id}:`, error);
        return null;
      }
      
      return data;
    } catch (err) {
      console.error(`Failed to get inventory item by ID ${id}:`, err);
      return null;
    }
  },
  
  // Update inventory quantity
  async updateInventoryQuantity(id, newQuantity) {
    if (!id) {
      console.error('No inventory ID provided');
      return false;
    }
    
    try {
      // Ensure we have an active session first
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('No active session. User must sign in to access the database.');
        return false;
      }
      
      const { data, error } = await supabase
        .from('inventory')
        .update({ 
          quantity: newQuantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', session.user.id); // Filter by user_id to comply with RLS
      
      if (error) {
        console.error('Error updating inventory quantity:', error);
        return false;
      }
      
      return true;
    } catch (err) {
      console.error('Failed to update inventory quantity:', err);
      return false;
    }
  }
};