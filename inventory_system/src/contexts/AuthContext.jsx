import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient'; // Import your Supabase client
import { toast } from 'react-toastify'; // Using react-toastify for consistency

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
        if (error) throw error;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        logAuthState('init-success', { userId: currentSession?.user?.id });
      } catch (error) {
        console.error('AuthProvider: Error fetching initial session:', error);
        logAuthState('init-no-session');
      } finally {
        setLoading(false);
      }
    };

    fetchSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        console.log('AuthProvider: onAuthStateChange event:', _event);
        setSession(newSession);
        setUser(newSession?.user ?? null);
        logAuthState('auth-state-change', { newSession });
        setLoading(false); // Ensure loading is false after auth state changes
      }
    );

    return () => {
      if (authListener && authListener.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

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
      toast.error(errorMsg + ' Check the browser console for details.');
      return { success: false, error: errorMsg };
    }
    
    console.log('✅ Supabase configured, attempting sign in...');
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        console.error('❌ Supabase sign in error:', error);
        throw error;
      }
      
      console.log('✅ Sign in successful!', { userId: data.user?.id, email: data.user?.email });
      // setUser and setSession will be handled by onAuthStateChange
      toast.success('Signed in successfully!');
      return { success: true, user: data.user, session: data.session };
    } catch (error) {
      console.error('❌ Error signing in:', error);
      const errorMessage = error.message || 'Failed to sign in. Please check your credentials.';
      toast.error(errorMessage);
      logAuthState('signin-exception', { error });
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  // Sign up with email and password
  const signUp = async (email, password, additionalData = {}) => {
    console.log('SignUp attempt with email:', email);
    setLoading(true);
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
        toast.info('Sign up successful! Please check your email to confirm your account.');
      } else if (data.user && data.session) {
        toast.success('Sign up successful and signed in!');
      }
      return { success: true, user: data.user, session: data.session };
    } catch (error) {
      console.error('Error signing up:', error.message);
      toast.error(error.message || 'Failed to sign up.');
      logAuthState('signup-exception', { error });
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
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
    // console.log('Role check:', role, 'User:', user);
    // TODO: Implement actual role logic (e.g., based on user.app_metadata.roles)
    // Example: return user?.app_metadata?.roles?.includes(role);
    return true; // Defaulting to true for now
  };

  // Value object to be provided to consumers
  const value = {
    user,
    session, // Expose session if needed
    loading,
    isAuthenticated: !!user && !!session, // Let's make this dependent on session too
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