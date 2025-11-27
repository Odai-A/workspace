import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FiSave, FiBell, FiSun, FiMoon, FiCreditCard, FiArrowRight, FiUser, FiMail, FiLock, FiRefreshCw } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getSubscriptionStatus } from '../services/subscriptionService';
import { supabase } from '../config/supabaseClient';

// Get API URL from environment
const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      return origin.replace(/:\d+$/, ':5000');
    }
  }
  return 'http://localhost:5000';
};
const API_URL = getApiUrl();

// Toggle switch component
const Toggle = ({ enabled, onChange, label, description }) => {
  return (
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <label className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
          {label}
        </label>
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
        )}
      </div>
      <label className="inline-flex relative items-center cursor-pointer ml-4">
        <input 
          type="checkbox" 
          className="sr-only peer" 
          checked={enabled} 
          onChange={onChange}
        />
        <div 
          className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"
        />
      </label>
    </div>
  );
};

const Settings = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  
  // Subscription state
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);
  
  // User profile state
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState({
    email: '',
    first_name: '',
    last_name: '',
  });
  
  // App preferences - sync with actual DOM state
  const [darkMode, setDarkMode] = useState(() => {
    // Check if dark class is already applied (from main.jsx initialization)
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) return true;
    
    // Fallback to localStorage
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    
    // Check system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [autoScan, setAutoScan] = useState(() => localStorage.getItem('autoScan') === 'true');
  
  // Notification settings
  const [emailNotifications, setEmailNotifications] = useState(() => {
    const saved = localStorage.getItem('emailNotifications');
    return saved ? saved === 'true' : true;
  });
  const [stockAlerts, setStockAlerts] = useState(() => {
    const saved = localStorage.getItem('stockAlerts');
    return saved ? saved === 'true' : true;
  });
  const [activityUpdates, setActivityUpdates] = useState(() => {
    const saved = localStorage.getItem('activityUpdates');
    return saved ? saved === 'true' : false;
  });

  // Load user profile
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('users')
          .select('email, first_name, last_name')
          .eq('id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
          console.error('Error loading profile:', error);
          // Fallback to auth user data
          setProfileData({
            email: user.email || '',
            first_name: '',
            last_name: '',
          });
        } else if (data) {
          setProfileData({
            email: data.email || user.email || '',
            first_name: data.first_name || '',
            last_name: data.last_name || '',
          });
        } else {
          setProfileData({
            email: user.email || '',
            first_name: '',
            last_name: '',
          });
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
        setProfileData({
          email: user.email || '',
          first_name: '',
          last_name: '',
        });
      }
    };

    loadUserProfile();
  }, [user]);

  // Apply dark mode on mount and when it changes
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Fetch subscription status
  useEffect(() => {
    const fetchSubscription = async () => {
      if (!user) {
        setSubscriptionLoading(false);
        return;
      }

      try {
        const { status, subscriptionInfo: info, hasActiveSubscription } = await getSubscriptionStatus();
        setSubscriptionInfo({
          ...info,
          status,
          hasActiveSubscription
        });
      } catch (error) {
        console.error('Error fetching subscription:', error);
      } finally {
        setSubscriptionLoading(false);
      }
    };

    fetchSubscription();
  }, [user]);

  // Handle manage subscription (Stripe Customer Portal)
  const handleManageSubscription = async () => {
    setIsManagingSubscription(true);
    toast.info('Redirecting to customer portal...');
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in again');
        navigate('/login');
        return;
      }

      const response = await fetch(`${API_URL}/api/create-customer-portal-session/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();
      if (response.ok && data.portal_url) {
        window.location.href = data.portal_url;
      } else {
        toast.error(data.error || 'Failed to open customer portal.');
      }
    } catch (error) {
      console.error('Portal error:', error);
      toast.error('An error occurred.');
    } finally {
      setIsManagingSubscription(false);
    }
  };

  // Save user profile
  const handleSaveProfile = async () => {
    if (!user) {
      toast.error('You must be logged in to update your profile');
      return;
    }

    // Validate email is not empty
    if (!profileData.email || !profileData.email.trim()) {
      toast.error('Email is required');
      return;
    }

    setProfileLoading(true);
    try {
      // First, check if profile exists
      const { data: existingProfile, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      let error;
      if (existingProfile) {
        // Profile exists - update it
        const { error: updateError } = await supabase
          .from('users')
          .update({
            email: profileData.email.trim(),
            first_name: profileData.first_name?.trim() || null,
            last_name: profileData.last_name?.trim() || null,
          })
          .eq('id', user.id);

        error = updateError;
      } else {
        // Profile doesn't exist - try to insert (may fail due to RLS, but worth trying)
        // If this fails, the trigger should have created it, so we'll try update again
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: user.id,
            email: profileData.email.trim(),
            first_name: profileData.first_name?.trim() || null,
            last_name: profileData.last_name?.trim() || null,
            role: 'employee' // Default role
          });

        // If insert fails due to RLS, try update (in case trigger created it in the meantime)
        if (insertError && insertError.code === '42501') {
          const { error: updateError } = await supabase
            .from('users')
            .update({
              email: profileData.email.trim(),
              first_name: profileData.first_name?.trim() || null,
              last_name: profileData.last_name?.trim() || null,
            })
            .eq('id', user.id);

          error = updateError;
        } else {
          error = insertError;
        }
      }

      if (error) {
        console.error('Profile save error:', error);
        throw error;
      }

      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      const errorCode = error?.code;
      
      // Provide more specific error messages
      if (errorCode === '42501') {
        toast.error('Permission denied. Please contact an administrator to create your profile.');
      } else if (errorMessage.includes('duplicate') || errorMessage.includes('unique')) {
        toast.error('Email already in use. Please use a different email.');
      } else {
        toast.error(`Failed to update profile: ${errorMessage}`);
      }
    } finally {
      setProfileLoading(false);
    }
  };

  // Toggle dark mode
  const handleDarkModeToggle = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    toast.success(`Theme switched to ${newMode ? 'dark' : 'light'} mode`);
  };

  // Toggle auto scan
  const handleAutoScanToggle = () => {
    const newValue = !autoScan;
    setAutoScan(newValue);
    localStorage.setItem('autoScan', newValue.toString());
    toast.success(`Auto scan ${newValue ? 'enabled' : 'disabled'}`);
  };

  // Save notification settings
  const saveNotificationSettings = () => {
    localStorage.setItem('emailNotifications', emailNotifications.toString());
    localStorage.setItem('stockAlerts', stockAlerts.toString());
    localStorage.setItem('activityUpdates', activityUpdates.toString());
    toast.success('Notification preferences saved');
  };

  // Handle password reset
  const handlePasswordReset = async () => {
    if (!user?.email) {
      toast.error('Email address not found');
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast.success('Password reset email sent! Check your inbox.');
    } catch (error) {
      console.error('Error sending password reset:', error);
      toast.error('Failed to send password reset email. Please try again.');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Settings</h1>
        
        {/* Subscription Management - Only show if user has active subscription */}
        {subscriptionInfo?.hasActiveSubscription && (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden mb-6">
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                <FiCreditCard className="mr-2" /> 
                Subscription Management
              </h2>
              
              {subscriptionLoading ? (
                <p className="text-gray-600 dark:text-gray-300">Loading subscription details...</p>
              ) : (
                <div className="flex flex-col space-y-4">
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Status:</span>
                      <span className={`text-sm font-semibold ${
                        subscriptionInfo.status === 'active' || subscriptionInfo.status === 'trialing'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {subscriptionInfo.status?.charAt(0).toUpperCase() + subscriptionInfo.status?.slice(1) || 'Unknown'}
                      </span>
                    </div>
                    {subscriptionInfo.stripe_subscription_id && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Subscription ID:</span>
                        <span className="text-sm text-gray-900 dark:text-gray-200 font-mono">
                          {subscriptionInfo.stripe_subscription_id.substring(0, 20)}...
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <p className="text-gray-600 dark:text-gray-300">
                    Manage your subscription, view billing history, update payment methods, and cancel if needed.
                  </p>
                  
                  <button
                    onClick={handleManageSubscription}
                    disabled={isManagingSubscription}
                    className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {isManagingSubscription ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Redirecting...
                      </>
                    ) : (
                      <>
                        Manage Subscription
                        <FiArrowRight className="ml-2" />
                      </>
                    )}
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    You will be redirected to Stripe to manage your subscription.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* User Profile */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden mb-6">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <FiUser className="mr-2" /> 
              Profile Information
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <FiMail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={profileData.email}
                    disabled
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Email cannot be changed. Contact support if you need to update it.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={profileData.first_name}
                    onChange={(e) => setProfileData({ ...profileData, first_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="Enter your first name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={profileData.last_name}
                    onChange={(e) => setProfileData({ ...profileData, last_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="Enter your last name"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleSaveProfile}
                  disabled={profileLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {profileLoading ? (
                    <>
                      <FiRefreshCw className="mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <FiSave className="mr-2" />
                      Save Profile
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Account Security */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden mb-6">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <FiLock className="mr-2" /> 
              Account Security
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">Password</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Change your password to keep your account secure
                  </p>
                </div>
                <button
                  onClick={handlePasswordReset}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Reset Password
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* App Preferences */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden mb-6">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              {darkMode ? <FiMoon className="mr-2" /> : <FiSun className="mr-2" />}
              App Preferences
            </h2>
            
            <div className="space-y-4">
              <Toggle
                enabled={darkMode}
                onChange={handleDarkModeToggle}
                label="Dark Mode"
                description="Switch between light and dark theme"
              />
              
              <Toggle
                enabled={autoScan}
                onChange={handleAutoScanToggle}
                label="Auto-process scanned items"
                description="Automatically process items when scanned"
              />
            </div>
          </div>
        </div>
        
        {/* Notification Settings */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden mb-6">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <FiBell className="mr-2" /> 
              Notification Settings
            </h2>
            
            <div className="space-y-4">
              <Toggle
                enabled={emailNotifications}
                onChange={() => setEmailNotifications(!emailNotifications)}
                label="Email Notifications"
                description="Receive email updates about your account activity"
              />
              
              <Toggle
                enabled={stockAlerts}
                onChange={() => setStockAlerts(!stockAlerts)}
                label="Low Stock Alerts"
                description="Get notified when inventory levels are low"
              />
              
              <Toggle
                enabled={activityUpdates}
                onChange={() => setActivityUpdates(!activityUpdates)}
                label="Activity Updates"
                description="Receive notifications about system activity"
              />
              
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={saveNotificationSettings}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center"
                >
                  <FiSave className="mr-2" />
                  Save Notification Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
