import React, { createContext, useContext, useState, useEffect } from 'react';

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
    
    // Check for stored user data
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        logAuthState('init-success', { userId: parsedUser.id });
      } catch (err) {
        console.error('Error parsing stored user data:', err);
        localStorage.removeItem('user');
      }
    } else {
      logAuthState('init-no-session');
    }
    setLoading(false);
  }, []);

  // Sign in with email and password
  const signIn = async (email, password) => {
    console.log('SignIn attempt with email:', email);
    try {
      setLoading(true);
      
      // For demo purposes, accept any email/password combination
      // In a real app, you would validate against your backend
      const userData = {
        id: '1',
        email: email,
        name: email.split('@')[0],
        role: 'admin'
      };
      
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      
      logAuthState('signin-success', { userId: userData.id });
      return { success: true, data: userData };
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
      
      // For demo purposes, create a new user
      // In a real app, you would create the user in your backend
      const userData = {
        id: Date.now().toString(),
        email: email,
        name: email.split('@')[0],
        role: 'user'
      };
      
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      
      logAuthState('signup-success', { userId: userData.id });
      return { success: true, data: userData };
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
      setUser(null);
      localStorage.removeItem('user');
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
    console.log('Permission check:', permission);
    return true;
  };

  // Check if user has a specific role
  const hasRole = (role) => {
    // For now, just return true for any role check
    console.log('Role check:', role);
    return true;
  };

  // Value object to be provided to consumers
  const value = {
    user,
    loading,
    isAuthenticated: !!user,
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

export default AuthContext; 