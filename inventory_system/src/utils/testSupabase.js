import { supabase } from '../config/supabaseClient';

/**
 * Tests the connection to Supabase and logs diagnostic information
 */
export const testSupabaseConnection = async () => {
  console.log('Testing Supabase connection...');
  
  try {
    // Check Supabase URL and key presence
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('⛔ Supabase configuration missing!');
      return {
        success: false,
        error: 'Supabase configuration is missing. Check your .env file.'
      };
    }
    
    console.log('Supabase configuration found');
    console.log('URL:', supabaseUrl);
    console.log('Key present:', !!supabaseKey);
    
    // Try a simple health check query
    const startTime = performance.now();
    const { data, error } = await supabase.from('healthcheck').select('*').limit(1).maybeSingle();
    const endTime = performance.now();
    
    if (error) {
      if (error.code === '42P01') {
        // This is expected if the healthcheck table doesn't exist
        console.log('✅ Connection successful (healthcheck table not found, but connection works)');
        return { 
          success: true, 
          message: 'Connection successful',
          responseTime: endTime - startTime
        };
      }
      
      console.error('⚠️ Error connecting to Supabase:', error);
      return {
        success: false,
        error: error.message || 'Unknown error connecting to Supabase',
        details: error,
        responseTime: endTime - startTime
      };
    }
    
    console.log('✅ Connection successful:', data);
    return { 
      success: true, 
      message: 'Connection successful',
      data,
      responseTime: endTime - startTime
    };
  } catch (err) {
    console.error('⛔ Exception when testing Supabase connection:', err);
    return {
      success: false,
      error: err.message || 'Unknown error',
      details: err
    };
  }
};

/**
 * Creates a test user in Supabase for debugging
 */
export const createTestUser = async (email = 'test@example.com', password = 'password123') => {
  console.log(`Creating test user: ${email}`);
  
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });
    
    if (error) {
      console.error('Error creating test user:', error);
      return {
        success: false,
        error: error.message
      };
    }
    
    console.log('Test user created successfully:', data);
    return {
      success: true,
      data
    };
  } catch (err) {
    console.error('Exception creating test user:', err);
    return {
      success: false,
      error: err.message
    };
  }
};

/**
 * Tests login with a test user
 */
export const testLogin = async (email = 'test@example.com', password = 'password123') => {
  console.log(`Testing login with: ${email}`);
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      console.error('Login test failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
    
    console.log('Login test successful:', data.user.id);
    return {
      success: true,
      data
    };
  } catch (err) {
    console.error('Exception during login test:', err);
    return {
      success: false,
      error: err.message
    };
  }
}; 