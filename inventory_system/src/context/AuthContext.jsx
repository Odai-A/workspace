import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

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
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Debug function to log auth state changes
  const logAuthState = (label, data = {}) => {
    console.log(`AUTH STATE [${label}]:`, {
      isAuthenticated: !!user,
      hasSession: !!session,
      userData: user ? { id: user.id, email: user.email } : null,
      ...data
    });
  };

  // Initialize auth state
  useEffect(() => {
    console.log('AuthProvider initialized, checking for session...');
    
    // Get the initial session
    const initSession = async () => {
      try {
        console.log('Requesting session from Supabase...');
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
          setUser(null);
          setSession(null);
          logAuthState('init-error', { error });
        } else {
          if (data?.session) {
            console.log('Session found:', data.session.user.id);
            setSession(data.session);
            setUser(data.session.user);
            logAuthState('init-success', { userId: data.session.user.id });
          } else {
            console.log('No active session found');
            logAuthState('init-no-session');
          }
        }
      } catch (err) {
        console.error('Unexpected error during auth initialization:', err);
        logAuthState('init-exception', { error: err });
      } finally {
        setLoading(false);
        console.log('Auth initialization complete');
      }
    };

    initSession();

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        console.log('Auth state changed:', event, newSession?.user?.id);
        setSession(newSession);
        setUser(newSession?.user || null);
        setLoading(false);
        logAuthState('state-change', { event, userId: newSession?.user?.id });
      }
    );

    // Cleanup listener on unmount
    return () => {
      console.log('Cleaning up auth listener');
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Sign in with email and password
  const signIn = async (email, password) => {
    console.log('SignIn attempt with email:', email);
    try {
      setLoading(true);
      console.log('Calling Supabase signInWithPassword...');
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });
      
      if (error) {
        console.error('Supabase login error:', error);
        logAuthState('signin-error', { error });
        return { success: false, error: error.message, data: null };
      }
      
      console.log('Sign in successful for user:', data?.user?.id);
      logAuthState('signin-success', { userId: data?.user?.id });
      return { success: true, data };
    } catch (error) {
      console.error('Login exception:', error);
      logAuthState('signin-exception', { error });
      return { success: false, error: error.message, data: null };
    } finally {
      setLoading(false);
    }
  };

  // Sign up with email and password
  const signUp = async (email, password) => {
    console.log('SignUp attempt with email:', email);
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password 
      });
      
      if (error) {
        console.error('Signup error:', error);
        logAuthState('signup-error', { error });
        return { success: false, error: error.message };
      }
      
      console.log('Sign up result:', data);
      logAuthState('signup-success', { userId: data?.user?.id });
      
      // With Supabase, signUp might not immediately authenticate the user
      // if email confirmation is required
      if (data?.user?.identities?.length === 0) {
        console.log('Email confirmation required');
        return { 
          success: true, 
          requiresEmailConfirmation: true,
          data 
        };
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('Signup exception:', error);
      logAuthState('signup-exception', { error });
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Sign out
  const signOut = async () => {
    console.log('SignOut attempt');
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('Signout error:', error);
        logAuthState('signout-error', { error });
        return { success: false, error: error.message };
      }
      
      console.log('Sign out successful');
      logAuthState('signout-success');
      return { success: true };
    } catch (error) {
      console.error('Signout exception:', error);
      logAuthState('signout-exception', { error });
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Check if user has a specific permission
  const hasPermission = (permission) => {
    // For now, just return true for any permission check
    // This will be implemented properly once permission system is in place
    console.log('Permission check:', permission);
    return true;
  };

  // Check if user has a specific role
  const hasRole = (role) => {
    // For now, just return true for any role check
    // This will be implemented properly once role system is in place
    console.log('Role check:', role);
    return true;
  };

  // Value object to be provided to consumers
  const value = {
    user,
    session,
    loading,
    isAuthenticated: !!user,
    signIn,
    signUp,
    signOut,
    hasPermission,
    hasRole,
    currentUser: user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext; 