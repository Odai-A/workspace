import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient'; // Import your Supabase client
import { toast } from 'react-toastify'; // Using react-toastify for consistency
import { getApiEndpoint } from '../utils/apiConfig';

// Create the context
const AuthContext = createContext(null);

// Export the hook for using the context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Provider component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null); // Optional: store session if needed elsewhere

  // Debug function to log auth state changes
  const logAuthState = (label, data = {}) => {
    console.log(`AUTH STATE [${label}]:`, {
      isAuthenticated: !!user,
      userData: user ? { id: user.id, email: user.email } : null,
      ...data
    });
  };

  // Initialize auth state
  useEffect(() => {
    console.log('AuthProvider initialized, checking for session...');
    
    // Check if Supabase is properly configured
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const isSupabaseConfigured = supabaseUrl && 
                                 supabaseAnonKey && 
                                 supabaseUrl !== 'https://placeholder.supabase.co' && 
                                 supabaseAnonKey !== 'placeholder-key' &&
                                 !supabaseUrl.includes('your-project') &&
                                 !supabaseAnonKey.includes('your-anon-key');
    
    if (!isSupabaseConfigured) {
      console.warn('⚠️ Supabase not configured. Running in unauthenticated mode.');
      console.warn('⚠️ Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
      setLoading(false);
      return; // Exit early if Supabase is not configured
    }
    
    console.log('✅ Supabase configured. Authentication enabled.');
    setLoading(true);
    const fetchSession = async () => {
      try {
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        
        // Handle refresh token errors gracefully - these are common when tokens are expired/invalid
        if (error) {
          // If it's a refresh token error, clear the invalid session silently
          if (error.message?.includes('Refresh Token') || error.message?.includes('refresh_token')) {
            console.log('🔄 Invalid refresh token detected, clearing session...');
            // Clear invalid session from storage
            try {
              await supabase.auth.signOut({ scope: 'local' });
            } catch (signOutError) {
              // Ignore sign out errors - we're just cleaning up
            }
            setSession(null);
            setUser(null);
            logAuthState('init-no-session', { reason: 'invalid_refresh_token' });
          } else {
            // For other errors, log them but don't throw
            console.warn('AuthProvider: Session fetch warning:', error.message);
            setSession(null);
            setUser(null);
            logAuthState('init-no-session', { error: error.message });
          }
        } else {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          logAuthState('init-success', { userId: currentSession?.user?.id });
        }
      } catch (error) {
        // Catch any unexpected errors
        console.warn('AuthProvider: Error fetching initial session:', error.message);
        setSession(null);
        setUser(null);
        logAuthState('init-no-session', { error: error.message });
      } finally {
        setLoading(false);
      }
    };

    fetchSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        console.log('AuthProvider: onAuthStateChange event:', _event);
        
        // Suppress refresh token errors in the console - they're handled gracefully
        if (_event === 'SIGNED_OUT' && !newSession) {
          // This is expected when clearing invalid sessions
          console.log('🔄 Session cleared (this is normal if refresh token was invalid)');
        }
        
        setSession(newSession);
        setUser(newSession?.user ?? null);
        logAuthState('auth-state-change', { event: _event, hasSession: !!newSession });
        setLoading(false); // Ensure loading is false after auth state changes
      }
    );

    return () => {
      if (authListener && authListener.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  // When the creator logs in, ensure they have CEO role (so free trial never shows for them)
  useEffect(() => {
    if (!user || !session?.access_token) return;
    const ensureCreatorIsCEO = async () => {
      try {
        const res = await fetch(getApiEndpoint('/creator/ensure-ceo'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
        const data = await res.json().catch(() => ({}));
        if (data.updated) {
          console.log('Creator ensured CEO role.');
        }
      } catch (e) {
        // Non-fatal: creator can still use app; they may need to upgrade via settings
      }
    };
    ensureCreatorIsCEO();
  }, [user?.id, session?.access_token]);

  // Sign in with email and password
  const signIn = async (email, password) => {
    console.log('🔐 SignIn attempt with email:', email);
    
    // Check if Supabase is properly configured
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const isSupabaseConfigured = supabaseUrl && 
                                 supabaseAnonKey && 
                                 supabaseUrl !== 'https://placeholder.supabase.co' && 
                                 supabaseAnonKey !== 'placeholder-key' &&
                                 !supabaseUrl.includes('your-project') &&
                                 !supabaseAnonKey.includes('your-anon-key');
    
    if (!isSupabaseConfigured) {
      const errorMsg = 'Supabase is not configured. Please add your Supabase credentials to the .env file.';
      console.error('❌', errorMsg);
      console.error('Current URL:', supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'MISSING');
      console.error('Current Key:', supabaseAnonKey ? supabaseAnonKey.substring(0, 20) + '...' : 'MISSING');
      toast.error('Supabase is not configured. Please add your Supabase credentials to the environment configuration file. Check the browser console for additional details.');
      return { success: false, error: errorMsg };
    }
    
    console.log('✅ Supabase configured, attempting sign in...');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        throw error;
      }
      
      console.log('✅ Sign in successful!', { userId: data.user?.id, email: data.user?.email });
      // Update state immediately so navigate("/dashboard") in Login sees isAuthenticated true
      // (onAuthStateChange may fire later; without this we'd redirect back to /login)
      setSession(data.session);
      setUser(data.user ?? null);
      const appMeta = data.user?.app_metadata || data.user?.raw_app_meta_data || {};
      const hasTenant = !!appMeta.tenant_id;
      if (!hasTenant) {
        toast.info('Your account is not fully set up yet. Go to Pricing to choose a plan and complete your business setup.', { autoClose: 8000 });
      } else {
        toast.success('You have been signed in.');
      }
      return { success: true, user: data.user, session: data.session };
    } catch (error) {
      const msg = (error && error.message) ? String(error.message).toLowerCase() : '';
      const code = error?.code || error?.status;
      let userMessage;
      if (code === 'email_not_confirmed' || msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
        userMessage = 'Please verify your email address. Check your inbox for the confirmation link, then try signing in again.';
      } else if (code === 'invalid_login_credentials' || msg.includes('invalid login credentials') || msg.includes('invalid_login_credentials')) {
        userMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else if (msg.includes('user not found') || msg.includes('invalid credentials')) {
        userMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else {
        userMessage = error?.message || 'Sign-in failed. Please check your email and password and try again.';
        console.error('Sign-in error:', error);
      }
      if (import.meta.env.DEV) {
        console.warn('Sign-in error (shown to user):', userMessage);
      }
      logAuthState('signin-exception', { error });
      return { success: false, error: userMessage };
    }
  };

  // Sign up with email and password
  const signUp = async (email, password, additionalData = {}) => {
    console.log('SignUp attempt with email:', email);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: additionalData, // e.g., { display_name: 'John Doe' }
        },
      });
      if (error) throw error;
      // If email confirmation is required (default), data.user will have the user info,
      // but data.session will be null until confirmation.
      // onAuthStateChange will update user state upon confirmation and login.
      if (data.user && !data.session) {
        toast.info('Registration completed successfully. Please check your email to confirm your account.');
      } else if (data.user && data.session) {
        toast.success('Registration completed successfully. You have been signed in.');
      }
      return { success: true, user: data.user, session: data.session };
    } catch (error) {
      console.error('Error signing up:', error.message);
      const msg = (error && error.message) ? String(error.message).toLowerCase() : '';
      let userMessage;
      if (msg.includes('user already registered') || msg.includes('already been registered') || msg.includes('already exists')) {
        userMessage = 'An account with this email already exists. Sign in instead, or use "Forgot password" if you don\'t remember it.';
      } else if (msg.includes('email not confirmed') || msg.includes('confirm your email')) {
        userMessage = 'Please confirm your email using the link we sent you, then try signing in.';
      } else if (msg.includes('password') && (msg.includes('least') || msg.includes('6 character'))) {
        userMessage = 'Password must be at least 6 characters. Please choose a longer password.';
      } else if (msg.includes('invalid email') || msg.includes('valid email')) {
        userMessage = 'Please enter a valid email address.';
      } else {
        userMessage = error?.message || 'Registration failed. Please check your information and try again.';
      }
      toast.error(userMessage);
      logAuthState('signup-exception', { error });
      return { success: false, error: userMessage };
    }
  };

  // Sign out
  const signOut = async () => {
    console.log('SignOut attempt');
    setLoading(true);
    try {
      // Try to sign out - if it fails, we'll still clear local state
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      
      // Even if there's an error, clear local state and redirect
      // This handles cases where the session is already expired or invalid
      if (error) {
        console.warn('Sign out API error (clearing local state anyway):', error.message);
        // Clear local storage manually
        try {
          localStorage.removeItem('sb-' + supabase.supabaseUrl.split('//')[1].split('.')[0] + '-auth-token');
          // Clear all Supabase-related localStorage items
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('sb-')) {
              localStorage.removeItem(key);
            }
          });
        } catch (clearError) {
          console.warn('Error clearing localStorage:', clearError);
        }
      }
      
      // Clear user and session state immediately
      setUser(null);
      setSession(null);
      
      // setUser and setSession to null will be handled by onAuthStateChange
      toast.success('Signed out successfully.');
      return { success: true };
    } catch (error) {
      console.error('Error signing out:', error.message);
      
      // Even on error, try to clear local state
      try {
        setUser(null);
        setSession(null);
        // Clear localStorage
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-')) {
            localStorage.removeItem(key);
          }
        });
      } catch (clearError) {
        console.warn('Error clearing state:', clearError);
      }
      
      // Don't show error toast if we successfully cleared local state
      // The user is effectively signed out even if the API call failed
      logAuthState('signout-exception', { error });
      return { success: true }; // Return success since we cleared local state
    } finally {
      setLoading(false);
    }
  };

  // Check if user has a specific permission
  const hasPermission = (permission) => {
    // console.log('Permission check:', permission, 'User:', user);
    // TODO: Implement actual permission logic (e.g., based on user.app_metadata.permissions)
    return true; // Defaulting to true for now
  };

  // Check if user has a specific role
  const hasRole = (role) => {
    if (!user || !session) return false;
    
    // Get user role from session or user object
    const sessionUser = session?.user || user;
    const appMetadata = sessionUser.app_metadata || sessionUser.raw_app_meta_data || {};
    const userMetadata = sessionUser.user_metadata || sessionUser.raw_user_meta_data || {};
    const userRole = appMetadata.role || userMetadata.role;
    
    // CEO has all roles (full access)
    if (userRole === 'ceo') {
      return true;
    }
    
    // Check if user has the requested role
    return userRole === role;
  };

  // Helper to get tenant_id from user's app_metadata
  const getTenantId = () => {
    if (!user || !session) return null;
    // Check app_metadata from session or user object
    // Supabase stores it in different places depending on how it's accessed
    const appMetadata = 
      session?.user?.app_metadata || 
      session?.user?.raw_app_meta_data ||
      user?.app_metadata || 
      user?.raw_app_meta_data ||
      user?.user_metadata?.app_metadata;
    
    // tenant_id might be a string UUID, so handle both string and object access
    const tenantId = appMetadata?.tenant_id;
    return tenantId || null;
  };

  // Value object to be provided to consumers
  const value = {
    user,
    session, // Expose session if needed
    loading,
    isAuthenticated: !!user && !!session, // Let's make this dependent on session too
    tenantId: getTenantId(), // Expose tenant_id for multi-tenant support
    signIn,
    signUp,
    signOut,
    hasPermission,
    hasRole
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};