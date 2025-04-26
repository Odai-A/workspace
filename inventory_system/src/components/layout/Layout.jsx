import React, { useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FiHome, FiPackage, FiDatabase, FiBarChart2, FiSearch, FiSettings, FiUser, FiLogOut } from 'react-icons/fi';
import { useNavigation } from '../../contexts/NavigationContext';
import { 
  HomeIcon,
  ArchiveBoxIcon,
  TagIcon,
  QrCodeIcon,
  ArrowsRightLeftIcon,
  TruckIcon,
  ChartBarIcon,
  MapPinIcon,
  UsersIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

// Map for icon components
const iconMap = {
  HomeIcon,
  ArchiveBoxIcon,
  TagIcon,
  QrCodeIcon,
  ArrowsRightLeftIcon,
  TruckIcon,
  ChartBarIcon,
  MapPinIcon,
  UsersIcon,
  Cog6ToothIcon,
};

const Layout = () => {
  const { user, signOut, hasPermission, hasRole } = useAuth();
  const location = useLocation();
  const { navigationItems, activeRoute } = useNavigation();

  // Debug output to verify auth context
  useEffect(() => {
    console.log('Layout component rendered with user:', user?.email);
  }, [user]);

  // Filter navigation items based on permissions and roles
  const authorizedItems = navigationItems.filter(item => {
    // If no permission or role required, show the item
    if (!item.permission && !item.role) return true;
    
    // If permission is required, check if user has it
    const hasRequiredPermission = item.permission ? hasPermission(item.permission) : true;
    
    // If role is required, check if user has it
    const hasRequiredRole = item.role ? hasRole(item.role) : true;
    
    return hasRequiredPermission && hasRequiredRole;
  });

  // Handle logout
  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sidebar */}
      <div className="bg-white dark:bg-gray-800 w-64 flex-shrink-0 hidden md:block shadow-lg">
        <div className="flex flex-col h-full">
          {/* App name/logo */}
          <div className="h-16 flex items-center justify-center border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-xl font-bold text-gray-800 dark:text-white">Inventory System</h1>
          </div>

          {/* Navigation links */}
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            <ul className="space-y-2">
              {authorizedItems.map((item) => {
                const Icon = iconMap[item.icon];
                return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center p-2 rounded-lg ${
                      location.pathname === item.path || location.pathname.startsWith(item.path + '/')
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="mr-3">{Icon ? <Icon className="w-5 h-5" /> : null}</span>
                    <span>{item.name}</span>
                  </Link>
                </li>
                );
              })}
            </ul>
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-col">
              <Link
                to="/profile"
                className={`flex items-center p-2 mb-2 rounded-lg ${
                  location.pathname === '/profile'
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <FiUser className="w-5 h-5 mr-3" />
                <span>Profile</span>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <FiLogOut className="w-5 h-5 mr-3" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 shadow h-16 flex items-center justify-between px-6">
          <div className="flex items-center">
            <button className="text-gray-500 dark:text-gray-300 focus:outline-none md:hidden">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="ml-4 text-lg font-semibold text-gray-800 dark:text-white">
              {authorizedItems.find(item => location.pathname === item.path)?.name || 
               (location.pathname === '/profile' ? 'Profile' : 'Dashboard')}
            </h1>
          </div>
          <div className="flex items-center">
            <div className="relative">
              <span className="text-sm text-gray-600 dark:text-gray-400 mr-2">
                {user?.email || 'Not signed in'}
              </span>
              <Link to="/profile" className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-500">
                <FiUser className="h-4 w-4" />
              </Link>
            </div>
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