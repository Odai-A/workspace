import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { FiUser, FiLock, FiLogIn, FiHelpCircle } from 'react-icons/fi';
import { testSupabaseConnection, createTestUser, testLogin } from '../utils/testSupabase';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const { signIn, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Debug auth state
  useEffect(() => {
    console.log('Login page rendered, auth state:', isAuthenticated);
  }, [isAuthenticated]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('Login form submitted for:', email);
    
    // Clear previous error
    setErrorMessage('');
    
    if (!email || !password) {
      const msg = 'Please enter both email and password';
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      console.log('Attempting sign in with:', email);
      const { success, error, data } = await signIn(email, password);
      
      console.log('Sign in result:', { success, error, hasData: !!data });
      
      if (success) {
        console.log('Login successful, redirecting to dashboard');
        toast.success('Logged in successfully');
        navigate('/dashboard');
      } else {
        const errorMsg = error || 'Failed to log in. Please check your credentials.';
        console.error('Login failed:', errorMsg);
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error('Login error:', error);
      const errorMsg = 'An unexpected error occurred. Please try again.';
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // For easy testing - use the test account
  const useTestAccount = () => {
    setEmail('test@example.com');
    setPassword('password123');
  };
  
  // Test Supabase connection
  const runConnectionTest = async () => {
    setIsTesting(true);
    setConnectionStatus(null);
    
    try {
      // Test connection to Supabase
      const connectionResult = await testSupabaseConnection();
      console.log('Connection test result:', connectionResult);
      
      if (connectionResult.success) {
        toast.success('Supabase connection successful!');
        
        // Try to create a test user (this may fail if the user already exists)
        const createUserResult = await createTestUser();
        console.log('Create test user result:', createUserResult);
        
        // Test login with test user
        const loginResult = await testLogin();
        console.log('Login test result:', loginResult);
        
        if (loginResult.success) {
          toast.success('Login test successful!');
          setConnectionStatus({
            success: true,
            message: 'Connection and authentication tests passed successfully.'
          });
          
          // Populate the form with test credentials
          useTestAccount();
        } else {
          toast.error('Login test failed: ' + loginResult.error);
          setConnectionStatus({
            success: false,
            message: 'Connection successful but login test failed: ' + loginResult.error
          });
        }
      } else {
        toast.error('Supabase connection failed: ' + connectionResult.error);
        setConnectionStatus({
          success: false,
          message: 'Connection failed: ' + connectionResult.error
        });
      }
    } catch (error) {
      console.error('Error during connection test:', error);
      toast.error('Test failed: ' + error.message);
      setConnectionStatus({
        success: false,
        message: 'Test failed with exception: ' + error.message
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Or{' '}
            <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500">
              create a new account
            </Link>
          </p>
        </div>
        
        {errorMessage && (
          <div className="rounded-md bg-red-50 p-4 mb-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{errorMessage}</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {connectionStatus && (
          <div className={`rounded-md ${connectionStatus.success ? 'bg-green-50' : 'bg-yellow-50'} p-4 mb-4`}>
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-gray-800">Connection Test</h3>
                <div className="mt-2 text-sm text-gray-700">
                  <p>{connectionStatus.message}</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FiUser className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:placeholder-gray-400 dark:text-white"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FiLock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:placeholder-gray-400 dark:text-white"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-between">
            <button
              type="button"
              onClick={useTestAccount}
              className="group relative px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-600 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Use Test Account
            </button>
            
            <button
              type="button"
              onClick={runConnectionTest}
              disabled={isTesting}
              className="group relative px-4 py-2 border border-transparent text-sm font-medium rounded-md text-green-600 bg-green-100 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              <FiHelpCircle className="h-4 w-4 inline-block mr-1" />
              {isTesting ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                <FiLogIn className="h-5 w-5 text-blue-500 group-hover:text-blue-400" />
              </span>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;