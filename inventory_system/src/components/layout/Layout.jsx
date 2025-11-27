import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';
import { 
  HomeIcon,
  ArchiveBoxIcon,
  TagIcon,
  QrCodeIcon,
  ArrowsRightLeftIcon,
  ChartBarIcon,
  UsersIcon,
  Cog6ToothIcon,
  CurrencyDollarIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { FiUser, FiLogOut } from 'react-icons/fi';

// Map for icon components
const iconMap = {
  HomeIcon,
  ArchiveBoxIcon,
  TagIcon,
  QrCodeIcon,
  ArrowsRightLeftIcon,
  ChartBarIcon,
  UsersIcon,
  Cog6ToothIcon,
  CurrencyDollarIcon,
};

const Layout = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const { navigationItems, activeRoute, sidebarCollapsed, toggleSidebar } = useNavigation();

  // Use a separate state for mobile menu visibility for clarity
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Function to specifically toggle the mobile menu
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  // Handle logout
  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 overflow-hidden">
      {/* Desktop Sidebar */}
      <div className={`bg-white dark:bg-gray-800 hidden md:block shadow-lg transition-all duration-300 fixed left-0 top-0 h-screen z-10 ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className="flex flex-col h-full">
          {/* App name/logo */}
          <div className="h-16 flex items-center justify-center border-b border-gray-200 dark:border-gray-700 px-4">
            <Link to="/dashboard" className={`flex items-center ${sidebarCollapsed ? 'justify-center w-full' : 'space-x-3'}`}>
              <img 
                src="/assets/images/logo.png" 
                alt="Logo" 
                className={`${sidebarCollapsed ? 'h-8 w-8' : 'h-10 w-10'} object-contain`}
              />
            </Link>
          </div>

          {/* Navigation links */}
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            <ul className="space-y-2">
              {navigationItems.map((item) => {
                const Icon = iconMap[item.icon];
                const isActive = location.pathname === item.path;
                
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={`flex items-center p-2 rounded-lg ${
                        isActive
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {Icon && <Icon className={`h-5 w-5 ${sidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />}
                      {!sidebarCollapsed && <span>{item.name}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* User section */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <FiUser className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
              {!sidebarCollapsed && (
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{user?.email}</p>
                  <button
                    onClick={handleLogout}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center"
                  >
                    <FiLogOut className="h-4 w-4 mr-1" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black bg-opacity-25 md:hidden transition-opacity duration-300 ${
          isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={toggleMobileMenu}
      ></div>
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-lg transform md:hidden transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header with close button */}
          <div className="h-16 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4">
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">Menu</h1>
            <button onClick={toggleMobileMenu} className="text-gray-500">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            <ul className="space-y-2">
              {navigationItems.map((item) => {
                const Icon = iconMap[item.icon];
                const isActive = location.pathname === item.path;
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={toggleMobileMenu}
                      className={`flex items-center p-2 rounded-lg ${
                        isActive ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {Icon && <Icon className="h-5 w-5 mr-3" />} 
                      <span>{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {/* User Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center">
              <FiUser className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{user?.email}</p>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center"
                >
                  <FiLogOut className="h-4 w-4 mr-1" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'} ml-0`}>
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 shadow h-16 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center">
            <button
              onClick={toggleMobileMenu}
              className="text-gray-500 dark:text-gray-400 focus:outline-none md:hidden mr-4"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={toggleSidebar}
              className="text-gray-500 dark:text-gray-400 focus:outline-none hidden md:block"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="ml-4 text-lg font-semibold text-gray-800 dark:text-gray-200">
              {navigationItems.find(item => location.pathname === item.path)?.name || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400 mr-2">
              {user?.email || 'Not signed in'}
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 dark:bg-gray-900">
          <div className="container mx-auto px-4 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout; 