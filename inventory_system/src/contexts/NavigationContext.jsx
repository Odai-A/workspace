import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getSubscriptionStatus } from '../services/subscriptionService';

// Create the navigation context
const NavigationContext = createContext();

// Hook for using the navigation context
export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};

// Navigation provider component
export const NavigationProvider = ({ children }) => {
  // State for sidebar and mobile navigation
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState('/dashboard');
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  
  // Get location for active route tracking
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();

  // Fetch subscription status
  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      if (!isAuthenticated || !user) {
        setHasActiveSubscription(false);
        setSubscriptionLoading(false);
        return;
      }

      try {
        const { hasActiveSubscription: hasActive } = await getSubscriptionStatus();
        setHasActiveSubscription(hasActive);
      } catch (error) {
        console.error('Error fetching subscription status:', error);
        setHasActiveSubscription(false);
      } finally {
        setSubscriptionLoading(false);
      }
    };

    fetchSubscriptionStatus();
  }, [user, isAuthenticated]);

  // Base navigation items configuration
  const baseNavigationItems = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: 'HomeIcon',
      permission: null
    },
    {
      name: 'Inventory',
      path: '/inventory',
      icon: 'ArchiveBoxIcon',
      permission: 'view_inventory'
    },
    {
      name: 'Scanner',
      path: '/scanner',
      icon: 'QrCodeIcon',
      permission: 'use_scanner'
    },
    {
      name: 'Product Import',
      path: '/product-import',
      icon: 'ArchiveBoxIcon',
      permission: 'import_products'
    },
    {
      name: 'Reports',
      path: '/reports',
      icon: 'ChartBarIcon',
      permission: 'view_reports'
    },
    {
      name: 'Users',
      path: '/users',
      icon: 'UsersIcon',
      permission: 'manage_users',
      role: 'admin'
    },
    {
      name: 'Settings',
      path: '/settings',
      icon: 'Cog6ToothIcon',
      permission: 'manage_settings'
    }
  ];

  // Conditionally add Pricing tab - only show if user doesn't have active subscription
  const navigationItems = [
    ...baseNavigationItems.slice(0, 5), // Dashboard through Reports
    // Only show Pricing if user doesn't have active subscription (trial/incomplete users)
    ...(!hasActiveSubscription && !subscriptionLoading ? [{
      name: 'Pricing',
      path: '/pricing',
      icon: 'CurrencyDollarIcon',
      permission: null
    }] : []),
    ...baseNavigationItems.slice(5) // Users and Settings
  ];

  // Set current active route
  const setCurrentRoute = (path) => {
    setActiveRoute(path);
  };

  // Update active route when location changes
  useEffect(() => {
    setCurrentRoute(location.pathname);
  }, [location]);

  // Toggle sidebar
  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  // Toggle mobile navigation
  const toggleMobileNav = () => {
    setMobileNavOpen(!mobileNavOpen);
  };

  // Close mobile nav when route changes
  useEffect(() => {
    if (mobileNavOpen) {
      setMobileNavOpen(false);
    }
  }, [location.pathname]);

  // Check for screen size changes to auto-collapse sidebar on small screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarCollapsed(true);
      }
    };

    // Set initial state based on screen size
    handleResize();

    // Add event listener
    window.addEventListener('resize', handleResize);

    // Clean up
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Context value
  const contextValue = {
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
    mobileNavOpen,
    setMobileNavOpen,
    toggleMobileNav,
    navigationItems,
    activeRoute,
    setCurrentRoute,
    hasActiveSubscription,
    subscriptionLoading,
  };

  // Provide the navigation context to children
  return (
    <NavigationContext.Provider value={contextValue}>
      {children}
    </NavigationContext.Provider>
  );
};

export default NavigationContext;