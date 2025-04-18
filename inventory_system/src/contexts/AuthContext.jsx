import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

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
          // In a real app, this would verify the token with the server
          // const response = await apiClient.get('/auth/me');
          // setCurrentUser(response.data);

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
      // In a real app, this would be an API call
      // const response = await apiClient.post('/auth/login', { username, password });
      // localStorage.setItem('auth_token', response.data.token);
      // setCurrentUser(response.data.user);

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
      // In a real app, this might include an API call to invalidate the token
      // await apiClient.post('/auth/logout');
      
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
      // const response = await apiClient.post('/auth/register', userData);
      // return response.data;
      
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
  };

  // Provide the auth context to children
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;