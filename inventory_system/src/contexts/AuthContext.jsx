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
      }
      setLoading(false);
    };

    fetchSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        console.log('AuthProvider: onAuthStateChange event:', _event, newSession);
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
    console.log('SignIn attempt with email:', email);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      // setUser and setSession will be handled by onAuthStateChange
      toast.success('Signed in successfully!');
      return { success: true, user: data.user, session: data.session };
    } catch (error) {
      console.error('Error signing in:', error.message);
      toast.error(error.message || 'Failed to sign in.');
      logAuthState('signin-exception', { error });
      return { success: false, error: error.message };
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
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      // setUser and setSession to null will be handled by onAuthStateChange
      toast.success('Signed out successfully.');
      return { success: true };
    } catch (error) {
      console.error('Error signing out:', error.message);
      toast.error(error.message || 'Failed to sign out.');
      logAuthState('signout-exception', { error });
      return { success: false, error: error.message };
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
    isAuthenticated: !!user, // More robust: !!session && !!user
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