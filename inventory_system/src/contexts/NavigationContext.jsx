import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { supabase } from '../config/supabaseClient';
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
  const { user, isAuthenticated, hasRole } = useAuth();
  
  // Get user role from app_metadata, user_metadata, or users table
  const [userRole, setUserRole] = useState(null);
  
  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) {
        setUserRole(null);
        return;
      }
      
      // Try to get role from session user object first
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.user) {
          const sessionUser = currentSession.user;
          const appMetadata = sessionUser.app_metadata || sessionUser.raw_app_meta_data || {};
          const userMetadata = sessionUser.user_metadata || sessionUser.raw_user_meta_data || {};
          const role = appMetadata.role || userMetadata.role;
          
          if (role) {
            setUserRole(role);
            return;
          }
        }
      } catch (error) {
        console.warn('Error getting role from session:', error);
      }
      
      // Fallback: try user object directly
      try {
        const appMetadata = user.app_metadata || user.raw_app_meta_data || {};
        const userMetadata = user.user_metadata || user.raw_user_meta_data || {};
        const role = appMetadata.role || userMetadata.role;
        
        if (role) {
          setUserRole(role);
          return;
        }
      } catch (error) {
        console.warn('Error getting role from user object:', error);
      }
      
      // Final fallback: check users table
      try {
        const { data: userProfile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        
        if (userProfile?.role) {
          setUserRole(userProfile.role);
          return;
        }
      } catch (error) {
        console.warn('Error getting role from users table:', error);
      }
      
      // If no role found, check if user might be CEO or admin
      // First check users table one more time with a broader query
      try {
        const { data: userProfile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        
        if (userProfile?.role) {
          setUserRole(userProfile.role);
          return;
        }
      } catch (error) {
        console.warn('Error getting role from users table (final check):', error);
      }
      
      // If still no role found, default to 'admin' for backward compatibility
      // This ensures existing admin accounts still see all tabs
      console.warn('No role found for user, defaulting to admin for backward compatibility');
      setUserRole('admin');
    };
    
    fetchUserRole();
  }, [user]);

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
  // CEO has full access to everything (same as admin)
  const baseNavigationItems = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: 'HomeIcon',
      permission: null,
      roles: ['ceo', 'admin', 'manager', 'employee'] // All roles can access
    },
    {
      name: 'Inventory',
      path: '/inventory',
      icon: 'ArchiveBoxIcon',
      permission: 'view_inventory',
      roles: ['ceo', 'admin', 'manager', 'employee'] // All roles can access
    },
    {
      name: 'Scanner',
      path: '/scanner',
      icon: 'QrCodeIcon',
      permission: 'use_scanner',
      roles: ['ceo', 'admin', 'manager', 'employee'] // All roles can scan
    },
    {
      name: 'Product Import',
      path: '/product-import',
      icon: 'ArchiveBoxIcon',
      permission: 'import_products',
      roles: ['ceo', 'admin', 'manager'] // CEO, admin and manager can import
    },
    {
      name: 'Reports',
      path: '/reports',
      icon: 'ChartBarIcon',
      permission: 'view_reports',
      roles: ['ceo', 'admin', 'manager'] // CEO, admin and manager can view reports
    },
    {
      name: 'Users',
      path: '/users',
      icon: 'UsersIcon',
      permission: 'manage_users',
      roles: ['ceo', 'admin'] // CEO and admin can manage users
    },
    {
      name: 'Settings',
      path: '/settings',
      icon: 'Cog6ToothIcon',
      permission: 'manage_settings',
      roles: ['ceo', 'admin', 'manager'] // CEO, admin and manager can access settings
    }
  ];

  // Filter navigation items based on user role
  const filterNavigationByRole = (items) => {
    // If no role detected, show all items (for backward compatibility with existing admin accounts)
    if (!userRole) {
      console.log('No user role detected, showing all navigation items');
      return items;
    }
    
    // CEO and admin have full access to everything
    const hasFullAccess = userRole === 'ceo' || userRole === 'admin';
    
    return items.filter(item => {
      // CEO and admin bypass role checks - they get everything
      if (hasFullAccess) {
        return true;
      }
      
      // If item has roles array, check if user role is included
      if (item.roles && Array.isArray(item.roles)) {
        const hasAccess = item.roles.includes(userRole);
        if (!hasAccess) {
          console.log(`Filtering out ${item.name} - user role ${userRole} not in allowed roles:`, item.roles);
        }
        return hasAccess;
      }
      // If no roles specified, allow access (backward compatibility)
      return true;
    });
  };

  // Conditionally add Pricing tab - only show if user doesn't have active subscription
  // CEO and admins can see pricing (they manage subscriptions)
  const pricingItem = (!hasActiveSubscription && !subscriptionLoading && (userRole === 'ceo' || userRole === 'admin')) ? [{
    name: 'Pricing',
    path: '/pricing',
    icon: 'CurrencyDollarIcon',
    permission: null,
    roles: ['ceo', 'admin']
  }] : [];
  
  // Filter all navigation items by role
  const allNavigationItems = [
    ...baseNavigationItems,
    ...pricingItem
  ];
  
  const navigationItems = filterNavigationByRole(allNavigationItems);

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