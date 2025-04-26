import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import supabase from '../utils/supabase';

// Create the auth context
const AuthContext = createContext();

// Hook for using the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Auth provider component
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  // Create an API client instance
  const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Add auth token to requests
  apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Handle 401 responses
  apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response && error.response.status === 401) {
        // Clear auth state on unauthorized
        logout();
      }
      return Promise.reject(error);
    }
  );

  // Check if user is authenticated on app load
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem('auth_token');
        if (token) {
          // In a real app with Supabase, we would use:
          // const { data: { user }, error } = await supabase.auth.getUser();
          // if (error) throw error;
          // if (user) {
          //   setCurrentUser({
          //     id: user.id,
          //     username: user.email,
          //     name: user.user_metadata?.name || 'User',
          //     email: user.email,
          //     role: user.user_metadata?.role || 'user',
          //     permissions: user.user_metadata?.permissions || [],
          //   });
          // }

          // For demo purposes, we'll use a mock user
          setCurrentUser({
            id: 1,
            username: 'demo_user',
            name: 'Demo User',
            email: 'demo@example.com',
            role: 'admin',
            permissions: [
              'view_inventory',
              'edit_inventory', 
              'view_products',
              'edit_products',
              'use_scanner',
              'view_transactions',
              'view_shipments',
              'view_reports',
              'view_locations',
            ],
          });
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        localStorage.removeItem('auth_token');
        setCurrentUser(null);
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
      }
    };

    initAuth();
  }, []);

  // Login function
  const login = async (username, password) => {
    setIsLoading(true);
    setError(null);
    try {
      // In a real app with Supabase, we would use:
      // const { data, error } = await supabase.auth.signInWithPassword({
      //   email: username,
      //   password: password,
      // });
      // if (error) throw error;
      // localStorage.setItem('auth_token', data.session.access_token);
      // setCurrentUser({
      //   id: data.user.id,
      //   username: data.user.email,
      //   name: data.user.user_metadata?.name || 'User',
      //   email: data.user.email,
      //   role: data.user.user_metadata?.role || 'user',
      //   permissions: data.user.user_metadata?.permissions || [],
      // });

      // For demo purposes, accept any username/password
      if (username && password) {
        const mockToken = 'mock_jwt_token_12345';
        localStorage.setItem('auth_token', mockToken);
        
        const mockUser = {
          id: 1,
          username: username,
          name: 'Demo User',
          email: 'demo@example.com',
          role: 'admin',
          permissions: [
            'view_inventory',
            'edit_inventory', 
            'view_products',
            'edit_products',
            'use_scanner',
            'view_transactions',
            'view_shipments',
            'view_reports',
            'view_locations',
          ],
        };
        
        setCurrentUser(mockUser);
        setIsLoading(false);
        return true;
      } else {
        throw new Error('Username and password are required');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.message || err.message || 'Login failed');
      setIsLoading(false);
      return false;
    }
  };

  // Logout function
  const logout = async () => {
    setIsLoading(true);
    try {
      // In a real app with Supabase, we would use:
      // const { error } = await supabase.auth.signOut();
      // if (error) throw error;
      
      localStorage.removeItem('auth_token');
      setCurrentUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Register function (for a real app)
  const register = async (userData) => {
    setIsLoading(true);
    setError(null);
    try {
      // In a real app with Supabase, we would use:
      // const { data, error } = await supabase.auth.signUp({
      //   email: userData.email,
      //   password: userData.password,
      //   options: {
      //     data: {
      //       name: userData.name,
      //       role: 'user',
      //       permissions: [],
      //     },
      //   },
      // });
      // if (error) throw error;
      
      // For demo, just pretend it worked
      setIsLoading(false);
      return { success: true };
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.response?.data?.message || err.message || 'Registration failed');
      setIsLoading(false);
      return { success: false, error: err.message };
    }
  };

  // Check if user has a permission
  const hasPermission = (permission) => {
    if (!currentUser || !currentUser.permissions) return false;
    return currentUser.permissions.includes(permission);
  };

  // Check if user has a role
  const hasRole = (role) => {
    if (!currentUser || !currentUser.role) return false;
    return currentUser.role === role;
  };

  // Context value
  const contextValue = {
    currentUser,
    isLoading,
    isInitialized,
    error,
    setError,
    login,
    logout,
    register,
    hasPermission,
    hasRole,
    apiClient,
    supabase,
  };

  // Provide the auth context to children
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;