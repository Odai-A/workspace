import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

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
  
  // Get location for active route tracking
  const location = useLocation();

  // Update active route when location changes
  useEffect(() => {
    setCurrentRoute(location.pathname);
  }, [location]);

  // Navigation items configuration
  const navigationItems = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: 'HomeIcon',
      permission: null,
      role: null,
    },
    {
      name: 'Inventory',
      path: '/inventory',
      icon: 'ArchiveBoxIcon',
      permission: 'view_inventory',
      role: null,
    },
    {
      name: 'Products',
      path: '/products',
      icon: 'TagIcon',
      permission: 'view_products',
      role: null,
    },
    {
      name: 'Scanner',
      path: '/scanner',
      icon: 'QrCodeIcon',
      permission: 'use_scanner',
      role: null,
    },
    {
      name: 'Transactions',
      path: '/transactions',
      icon: 'ArrowsRightLeftIcon',
      permission: 'view_transactions',
      role: null,
    },
    {
      name: 'Shipments',
      path: '/shipments',
      icon: 'TruckIcon',
      permission: 'view_shipments',
      role: null,
    },
    {
      name: 'Reports',
      path: '/reports',
      icon: 'ChartBarIcon',
      permission: 'view_reports',
      role: null,
    },
    {
      name: 'Locations',
      path: '/locations',
      icon: 'MapPinIcon',
      permission: 'view_locations',
      role: null,
    },
    {
      name: 'Users',
      path: '/users',
      icon: 'UsersIcon',
      permission: null,
      role: 'admin',
    },
    {
      name: 'Settings',
      path: '/settings',
      icon: 'Cog6ToothIcon',
      permission: null,
      role: null,
    },
  ];

  // Toggle sidebar collapsed state
  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  // Toggle mobile navigation
  const toggleMobileNav = () => {
    setMobileNavOpen(!mobileNavOpen);
  };

  // Set current active route
  const setCurrentRoute = (path) => {
    setActiveRoute(path);
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
    setActiveRoute: setCurrentRoute,
  };

  // Provide the navigation context to children
  return (
    <NavigationContext.Provider value={contextValue}>
      {children}
    </NavigationContext.Provider>
  );
};

export default NavigationContext;